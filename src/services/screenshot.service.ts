/**
 * Screenshot Service for NeXSS
 * 
 * Handles screenshot processing:
 * - Thumbnail generation
 * - Image compression
 * - Storage optimization
 */

import sharp from 'sharp';
import { createLogger } from '@/services/base.service';

const logger = createLogger('ScreenshotService');

// ============================================
// CONFIGURATION
// ============================================

export interface ThumbnailConfig {
    width: number;
    height: number;
    quality: number;
    format: 'webp' | 'jpeg' | 'png';
}

export const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = {
    width: 400,
    height: 300,
    quality: 80,
    format: 'webp',
};

export const PREVIEW_CONFIG: ThumbnailConfig = {
    width: 800,
    height: 600,
    quality: 85,
    format: 'webp',
};

// ============================================
// THUMBNAIL GENERATION
// ============================================

/**
 * Generate thumbnail from image buffer
 */
export async function generateThumbnail(
    imageBuffer: Buffer,
    config: Partial<ThumbnailConfig> = {}
): Promise<Buffer> {
    const { width, height, quality, format } = { ...DEFAULT_THUMBNAIL_CONFIG, ...config };

    try {
        let processor = sharp(imageBuffer)
            .resize(width, height, {
                fit: 'inside',
                withoutEnlargement: true,
            });

        // Apply format-specific optimizations
        switch (format) {
            case 'webp':
                processor = processor.webp({ quality });
                break;
            case 'jpeg':
                processor = processor.jpeg({ quality, mozjpeg: true });
                break;
            case 'png':
                processor = processor.png({ quality, compressionLevel: 9 });
                break;
        }

        const result = await processor.toBuffer();
        
        logger.debug('Thumbnail generated', {
            originalSize: imageBuffer.length,
            thumbnailSize: result.length,
            reduction: `${Math.round((1 - result.length / imageBuffer.length) * 100)}%`,
        });

        return result;
    } catch (err) {
        logger.error('Failed to generate thumbnail', err);
        throw err;
    }
}

/**
 * Generate preview (medium-sized) from image buffer
 */
export async function generatePreview(
    imageBuffer: Buffer,
    config: Partial<ThumbnailConfig> = {}
): Promise<Buffer> {
    return generateThumbnail(imageBuffer, { ...PREVIEW_CONFIG, ...config });
}

// ============================================
// OPTIMIZATION
// ============================================

/**
 * Optimize screenshot for storage (reduce file size while maintaining quality)
 */
export async function optimizeScreenshot(
    imageBuffer: Buffer,
    maxWidth: number = 1920,
    quality: number = 90
): Promise<Buffer> {
    try {
        const metadata = await sharp(imageBuffer).metadata();
        
        let processor = sharp(imageBuffer);

        // Only resize if larger than maxWidth
        if (metadata.width && metadata.width > maxWidth) {
            processor = processor.resize(maxWidth, null, {
                fit: 'inside',
                withoutEnlargement: true,
            });
        }

        // Convert to WebP for better compression
        const result = await processor
            .webp({ quality })
            .toBuffer();

        logger.debug('Screenshot optimized', {
            originalSize: imageBuffer.length,
            optimizedSize: result.length,
            reduction: `${Math.round((1 - result.length / imageBuffer.length) * 100)}%`,
            originalWidth: metadata.width,
            maxWidth,
        });

        return result;
    } catch (err) {
        logger.error('Failed to optimize screenshot', err);
        throw err;
    }
}

// ============================================
// CONVERSION
// ============================================

/**
 * Convert base64 screenshot to buffer
 */
export function base64ToBuffer(base64: string): Buffer {
    // Remove data URL prefix if present
    const data = base64.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(data, 'base64');
}

/**
 * Convert buffer to base64 data URL
 */
export function bufferToBase64(buffer: Buffer, format: string = 'webp'): string {
    return `data:image/${format};base64,${buffer.toString('base64')}`;
}

// ============================================
// BATCH PROCESSING
// ============================================

export interface ProcessedScreenshot {
    original: Buffer;
    optimized: Buffer;
    thumbnail: Buffer;
    preview?: Buffer;
    metadata: {
        originalSize: number;
        optimizedSize: number;
        thumbnailSize: number;
        previewSize?: number;
        format: string;
        width?: number;
        height?: number;
    };
}

/**
 * Process screenshot with all variants
 */
export async function processScreenshot(
    imageBuffer: Buffer,
    options: {
        generatePreview?: boolean;
        maxWidth?: number;
        quality?: number;
        thumbnailConfig?: Partial<ThumbnailConfig>;
    } = {}
): Promise<ProcessedScreenshot> {
    const {
        generatePreview: shouldGeneratePreview = false,
        maxWidth = 1920,
        quality = 90,
        thumbnailConfig,
    } = options;

    try {
        // Get original metadata
        const metadata = await sharp(imageBuffer).metadata();

        // Generate all variants in parallel
        const [optimized, thumbnail, preview] = await Promise.all([
            optimizeScreenshot(imageBuffer, maxWidth, quality),
            generateThumbnail(imageBuffer, thumbnailConfig),
            shouldGeneratePreview ? generatePreview(imageBuffer) : Promise.resolve(undefined),
        ]);

        const result: ProcessedScreenshot = {
            original: imageBuffer,
            optimized,
            thumbnail,
            preview,
            metadata: {
                originalSize: imageBuffer.length,
                optimizedSize: optimized.length,
                thumbnailSize: thumbnail.length,
                previewSize: preview?.length,
                format: 'webp',
                width: metadata.width,
                height: metadata.height,
            },
        };

        logger.info('Screenshot processed', {
            originalSize: `${Math.round(imageBuffer.length / 1024)}KB`,
            optimizedSize: `${Math.round(optimized.length / 1024)}KB`,
            thumbnailSize: `${Math.round(thumbnail.length / 1024)}KB`,
            totalReduction: `${Math.round((1 - (optimized.length + thumbnail.length) / (imageBuffer.length * 2)) * 100)}%`,
        });

        return result;
    } catch (err) {
        logger.error('Failed to process screenshot', err);
        throw err;
    }
}

// ============================================
// UTILITY
// ============================================

/**
 * Get image dimensions from buffer
 */
export async function getImageDimensions(
    imageBuffer: Buffer
): Promise<{ width: number; height: number } | null> {
    try {
        const metadata = await sharp(imageBuffer).metadata();
        if (metadata.width && metadata.height) {
            return { width: metadata.width, height: metadata.height };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Check if buffer is a valid image
 */
export async function isValidImage(imageBuffer: Buffer): Promise<boolean> {
    try {
        await sharp(imageBuffer).metadata();
        return true;
    } catch {
        return false;
    }
}

/**
 * Get content type for format
 */
export function getContentType(format: string): string {
    const types: Record<string, string> = {
        webp: 'image/webp',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
    };
    return types[format.toLowerCase()] || 'application/octet-stream';
}
