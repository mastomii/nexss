import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, timezone?: string): string {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone || 'UTC',
    });
}

export function formatDateWithTimezone(date: Date | string, timezone: string): string {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: timezone,
        timeZoneName: 'short',
    });
}

export function timeAgo(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(date);
}

export function truncate(str: string, length: number): string {
    if (str.length <= length) return str;
    return str.slice(0, length) + '...';
}

export function getClientIP(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const cfIP = request.headers.get('cf-connecting-ip');

    if (cfIP) return cfIP;
    if (forwarded) return forwarded.split(',')[0].trim();
    if (realIP) return realIP;
    return 'unknown';
}

// Parse domain from URL
export function getDomainFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        return url;
    }
}

// Check if origin matches pattern (supports wildcards)
export function matchesDomain(origin: string, pattern: string): boolean {
    if (!pattern || !origin) return false;

    if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(origin);
    }

    return origin === pattern;
}

// Compression types
export type CompressionType = 'brotli' | 'gzip' | 'deflate';

/**
 * Compress string using Brotli (Node.js native, best compression)
 * Falls back to deflate if Brotli unavailable
 */
export async function compressString(str: string, type: CompressionType = 'brotli'): Promise<string> {
    if (typeof window === 'undefined') {
        const zlib = await import('zlib');
        const { promisify } = await import('util');
        
        let compressed: Buffer;
        
        if (type === 'brotli') {
            // Brotli - best compression ratio
            const brotliCompress = promisify(zlib.brotliCompress);
            compressed = await brotliCompress(Buffer.from(str), {
                params: {
                    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 6, // Balance speed/ratio (0-11)
                }
            });
        } else if (type === 'gzip') {
            const gzip = promisify(zlib.gzip);
            compressed = await gzip(Buffer.from(str));
        } else {
            // Fallback to pako deflate for backwards compatibility
            const pako = await import('pako');
            const deflated = pako.deflate(str);
            return Buffer.from(deflated).toString('base64');
        }
        
        return compressed.toString('base64');
    }
    return str;
}

/**
 * Decompress string - auto-detects compression type
 */
export async function decompressString(compressed: string): Promise<string> {
    if (typeof window === 'undefined') {
        const buffer = Buffer.from(compressed, 'base64');
        
        // Try to detect compression type from magic bytes
        const magic = buffer.slice(0, 2);
        
        // Brotli doesn't have standard magic bytes, so we try methods
        const zlib = await import('zlib');
        const { promisify } = await import('util');
        
        // Try Brotli first (most common for new data)
        try {
            const brotliDecompress = promisify(zlib.brotliDecompress);
            const decompressed = await brotliDecompress(buffer);
            return decompressed.toString('utf-8');
        } catch {
            // Not Brotli, try gzip/deflate
        }
        
        // Check for gzip magic bytes (1f 8b)
        if (magic[0] === 0x1f && magic[1] === 0x8b) {
            try {
                const gunzip = promisify(zlib.gunzip);
                const decompressed = await gunzip(buffer);
                return decompressed.toString('utf-8');
            } catch {
                // Fall through
            }
        }
        
        // Try pako deflate (legacy format)
        try {
            const pako = await import('pako');
            const decompressed = pako.inflate(buffer);
            return new TextDecoder().decode(decompressed);
        } catch {
            // If all else fails, return as-is (might be uncompressed)
            return compressed;
        }
    }
    return compressed;
}

/**
 * Calculate compression stats
 */
export function getCompressionStats(original: string, compressed: string): {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    savings: string;
} {
    const originalSize = Buffer.from(original).length;
    const compressedSize = Buffer.from(compressed, 'base64').length;
    const ratio = originalSize / compressedSize;
    const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    
    return {
        originalSize,
        compressedSize,
        ratio,
        savings: `${savings}%`,
    };
}
