import { NextResponse } from 'next/server';
import { query, ReportData } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { 
    getObjectStorageConfig, 
    uploadToStorage
} from '@/lib/object-storage';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// GET - Get migration status
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.rank < 3) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Count screenshots by storage type
        const stats = await query<{ screenshot_storage: string; count: string }>(
            `SELECT screenshot_storage, COUNT(*) as count 
             FROM reports_data 
             WHERE screenshot IS NOT NULL 
             GROUP BY screenshot_storage`
        );

        const counts: Record<string, number> = {
            local: 0,
            s3: 0,
            db: 0,
            total: 0,
        };

        for (const stat of stats) {
            const storage = stat.screenshot_storage || 'db';
            counts[storage] = parseInt(stat.count, 10);
            counts.total += parseInt(stat.count, 10);
        }

        // Check object storage config
        const config = await getObjectStorageConfig();

        return NextResponse.json({
            counts,
            objectStorageEnabled: config.enabled,
            provider: config.provider,
        });
    } catch (error) {
        console.error('[Migration] Status error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Start migration
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.rank < 3) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const { action, deleteAfterMigration = false, config: requestConfig } = body;

        if (action !== 'migrate') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Use config from request body if provided, otherwise get from database
        let config;
        if (requestConfig && requestConfig.provider && requestConfig.bucket && requestConfig.accessKeyId && requestConfig.secretAccessKey) {
            // Use config from request (for migration before enabling)
            config = {
                enabled: true, // Treat as enabled for migration
                provider: requestConfig.provider as 's3' | 'minio' | 'r2',
                endpoint: requestConfig.endpoint || null,
                region: requestConfig.region || null,
                bucket: requestConfig.bucket,
                accessKeyId: requestConfig.accessKeyId,
                secretAccessKey: requestConfig.secretAccessKey,
                publicUrl: requestConfig.publicUrl || null,
            };
        } else {
            // Get from database
            config = await getObjectStorageConfig();
            if (!config.enabled) {
                return NextResponse.json({ 
                    error: 'Object storage is not enabled. Please provide config or enable storage first.' 
                }, { status: 400 });
            }
        }

        // Get all local screenshots
        const localScreenshots = await query<ReportData>(
            `SELECT id, report_id, screenshot 
             FROM reports_data 
             WHERE screenshot_storage = 'local' AND screenshot IS NOT NULL`
        );

        if (localScreenshots.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No local screenshots to migrate',
                migrated: 0,
                failed: 0,
            });
        }

        let migrated = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const record of localScreenshots) {
            try {
                // Get filename from path (/screenshots/filename.png)
                const filename = record.screenshot?.replace('/screenshots/', '');
                if (!filename) {
                    failed++;
                    continue;
                }

                const localPath = join(process.cwd(), 'data', 'screenshots', filename);
                
                if (!existsSync(localPath)) {
                    failed++;
                    errors.push(`File not found: ${filename}`);
                    continue;
                }

                // Read file
                const fileBuffer = await readFile(localPath);

                // Upload to object storage
                const key = `screenshots/${filename}`;
                const result = await uploadToStorage(config, key, fileBuffer, 'image/png');

                if (!result.success) {
                    failed++;
                    errors.push(`Upload failed for ${filename}: ${result.error}`);
                    continue;
                }

                // Update database
                await query(
                    `UPDATE reports_data 
                     SET screenshot = $1, screenshot_storage = 's3' 
                     WHERE id = $2`,
                    [result.url, record.id]
                );

                // Delete local file if requested
                if (deleteAfterMigration) {
                    try {
                        await unlink(localPath);
                    } catch (err) {
                        console.error(`[Migration] Failed to delete local file: ${localPath}`, err);
                    }
                }

                migrated++;
            } catch (err) {
                failed++;
                const error = err as Error;
                errors.push(`Error processing ${record.id}: ${error.message}`);
                console.error(`[Migration] Error:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            migrated,
            failed,
            errors: errors.slice(0, 10), // Limit errors in response
        });
    } catch (error) {
        console.error('[Migration] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
