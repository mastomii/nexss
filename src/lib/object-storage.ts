import { 
    S3Client, 
    PutObjectCommand, 
    GetObjectCommand, 
    DeleteObjectCommand,
    HeadBucketCommand,
    ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { query } from './db';

export interface ObjectStorageConfig {
    enabled: boolean;
    provider: 's3' | 'minio' | 'r2' | null;
    endpoint: string | null;
    region: string | null;
    bucket: string | null;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    publicUrl: string | null; // For public access URL (optional)
}

interface Setting {
    key: string;
    value: string;
}

// Get object storage configuration from database
export async function getObjectStorageConfig(): Promise<ObjectStorageConfig> {
    const settings = await query<Setting>(
        `SELECT key, value FROM settings WHERE key LIKE 'storage_%'`
    );

    const config: ObjectStorageConfig = {
        enabled: false,
        provider: null,
        endpoint: null,
        region: null,
        bucket: null,
        accessKeyId: null,
        secretAccessKey: null,
        publicUrl: null,
    };

    for (const setting of settings) {
        switch (setting.key) {
            case 'storage_enabled':
                config.enabled = setting.value === 'true';
                break;
            case 'storage_provider':
                config.provider = setting.value as 'minio' | 'r2';
                break;
            case 'storage_endpoint':
                config.endpoint = setting.value;
                break;
            case 'storage_region':
                config.region = setting.value;
                break;
            case 'storage_bucket':
                config.bucket = setting.value;
                break;
            case 'storage_access_key':
                config.accessKeyId = setting.value;
                break;
            case 'storage_secret_key':
                config.secretAccessKey = setting.value;
                break;
            case 'storage_public_url':
                config.publicUrl = setting.value;
                break;
        }
    }

    return config;
}

// Create S3 client from config
export function createS3Client(config: ObjectStorageConfig): S3Client | null {
    if (!config.enabled || !config.accessKeyId || !config.secretAccessKey) {
        return null;
    }

    // For AWS S3, endpoint is optional (uses default AWS endpoints)
    const clientConfig: {
        region: string;
        credentials: { accessKeyId: string; secretAccessKey: string };
        endpoint?: string;
        forcePathStyle?: boolean;
    } = {
        region: config.region || 'us-east-1',
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    };

    // Add endpoint for non-AWS providers
    if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
    }

    // MinIO requires path-style URLs
    if (config.provider === 'minio') {
        clientConfig.forcePathStyle = true;
    }

    return new S3Client(clientConfig);
}

// Test connection to object storage
export async function testConnection(config: ObjectStorageConfig): Promise<{ success: boolean; error?: string }> {
    try {
        const client = createS3Client(config);
        if (!client || !config.bucket) {
            return { success: false, error: 'Invalid configuration: missing bucket or credentials' };
        }

        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
        return { success: true };
    } catch (error) {
        const err = error as Error & { 
            name?: string; 
            Code?: string; 
            $metadata?: { httpStatusCode?: number };
            code?: string;
        };
        
        console.error('[ObjectStorage] Test connection error:', {
            name: err.name,
            message: err.message,
            code: err.Code || err.code,
            httpStatus: err.$metadata?.httpStatusCode,
        });

        // Provide user-friendly error messages
        const httpStatus = err.$metadata?.httpStatusCode;
        const errorCode = err.Code || err.code || err.name;

        if (httpStatus === 403 || errorCode === 'AccessDenied') {
            return { success: false, error: 'Access denied. Check your access key and secret key.' };
        }
        if (httpStatus === 404 || errorCode === 'NotFound' || errorCode === 'NoSuchBucket') {
            return { success: false, error: `Bucket "${config.bucket}" not found.` };
        }
        if (errorCode === 'InvalidAccessKeyId') {
            return { success: false, error: 'Invalid access key ID.' };
        }
        if (errorCode === 'SignatureDoesNotMatch') {
            return { success: false, error: 'Invalid secret access key.' };
        }
        if (errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED') {
            return { success: false, error: `Cannot connect to endpoint: ${config.endpoint || 'AWS S3'}` };
        }
        if (err.message?.includes('getaddrinfo')) {
            return { success: false, error: `Invalid endpoint URL: ${config.endpoint}` };
        }
        if (err.message?.includes('certificate') || err.message?.includes('SSL')) {
            return { success: false, error: 'SSL/Certificate error. Check endpoint URL.' };
        }

        return { success: false, error: err.message || 'Unknown connection error' };
    }
}

// Upload file to object storage
export async function uploadToStorage(
    config: ObjectStorageConfig,
    key: string,
    data: Buffer,
    contentType: string = 'image/png'
): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
        const client = createS3Client(config);
        if (!client || !config.bucket) {
            return { success: false, error: 'Object storage not configured' };
        }

        await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: data,
            ContentType: contentType,
        }));

        // Generate URL
        let url: string;
        if (config.publicUrl) {
            // Use public URL if configured
            url = `${config.publicUrl.replace(/\/$/, '')}/${key}`;
        } else if (config.provider === 's3') {
            // AWS S3 URL format
            url = `https://${config.bucket}.s3.${config.region || 'us-east-1'}.amazonaws.com/${key}`;
        } else if (config.endpoint) {
            // MinIO/R2 URL format
            url = `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`;
        } else {
            return { success: false, error: 'Cannot determine URL' };
        }

        return { success: true, url };
    } catch (error) {
        const err = error as Error;
        console.error('[ObjectStorage] Upload error:', err);
        return { success: false, error: err.message };
    }
}

// Get signed URL for private access
export async function getSignedUrlForObject(
    config: ObjectStorageConfig,
    key: string,
    expiresIn: number = 3600
): Promise<string | null> {
    try {
        const client = createS3Client(config);
        if (!client || !config.bucket) {
            return null;
        }

        const command = new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
        });

        return await getSignedUrl(client, command, { expiresIn });
    } catch (error) {
        console.error('[ObjectStorage] Get signed URL error:', error);
        return null;
    }
}

// Delete file from object storage
export async function deleteFromStorage(
    config: ObjectStorageConfig,
    key: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = createS3Client(config);
        if (!client || !config.bucket) {
            return { success: false, error: 'Object storage not configured' };
        }

        await client.send(new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key,
        }));

        return { success: true };
    } catch (error) {
        const err = error as Error;
        console.error('[ObjectStorage] Delete error:', err);
        return { success: false, error: err.message };
    }
}

// List all objects in bucket (for migration)
export async function listObjects(
    config: ObjectStorageConfig,
    prefix?: string
): Promise<string[]> {
    try {
        const client = createS3Client(config);
        if (!client || !config.bucket) {
            return [];
        }

        const response = await client.send(new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
        }));

        return response.Contents?.map(obj => obj.Key || '').filter(Boolean) || [];
    } catch (error) {
        console.error('[ObjectStorage] List error:', error);
        return [];
    }
}

// Extract key from storage URL
export function extractKeyFromUrl(url: string): string | null {
    // Handle different URL formats
    // Format: https://endpoint/bucket/key or https://publicurl/key
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        
        // If path has bucket/key format, return the key
        if (pathParts.length >= 2) {
            return pathParts.slice(1).join('/');
        } else if (pathParts.length === 1) {
            return pathParts[0];
        }
        return null;
    } catch {
        return null;
    }
}
