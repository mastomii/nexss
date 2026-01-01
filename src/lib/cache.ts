/**
 * In-Memory LRU Cache for NeXSS
 * 
 * Provides a simple, efficient caching layer for frequently accessed data
 * like dashboard statistics, settings, and computed values.
 * 
 * Features:
 * - LRU (Least Recently Used) eviction
 * - TTL (Time To Live) support
 * - Automatic cleanup of expired entries
 * - Size limits to prevent memory issues
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

interface CacheOptions {
  /** Maximum number of entries in the cache */
  maxSize?: number;
  /** Default TTL in milliseconds */
  defaultTTL?: number;
  /** Cleanup interval in milliseconds (0 to disable) */
  cleanupInterval?: number;
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  maxSize: 1000,
  defaultTTL: 60 * 1000, // 1 minute
  cleanupInterval: 60 * 1000, // 1 minute
};

class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_OPTIONS.maxSize;
    this.defaultTTL = options.defaultTTL ?? DEFAULT_OPTIONS.defaultTTL;

    // Start cleanup timer
    const cleanupInterval = options.cleanupInterval ?? DEFAULT_OPTIONS.cleanupInterval;
    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
    }
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update last accessed time (LRU)
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + (ttl ?? this.defaultTTL),
      lastAccessed: now,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   */
  deletePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let deleted = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): { hits: number; misses: number; evictions: number; size: number; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : '0.0';
    
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Get or set - returns cached value or computes and caches new value
   */
  async getOrSet<V extends T>(
    key: string,
    factory: () => V | Promise<V>,
    ttl?: number
  ): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached as V;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

// ============================================
// SINGLETON INSTANCES
// ============================================

// Dashboard stats cache (short TTL, frequently updated)
export const dashboardCache = new LRUCache({
  maxSize: 50,
  defaultTTL: 30 * 1000, // 30 seconds
  cleanupInterval: 60 * 1000,
});

// Settings cache (longer TTL, rarely changes) - uses unknown type for flexibility
export const settingsCache = new LRUCache({
  maxSize: 100,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000,
});

// Report data cache (medium TTL)
export const reportCache = new LRUCache({
  maxSize: 200,
  defaultTTL: 2 * 60 * 1000, // 2 minutes
  cleanupInterval: 60 * 1000,
});

// General purpose cache
export const generalCache = new LRUCache({
  maxSize: 500,
  defaultTTL: 60 * 1000, // 1 minute
  cleanupInterval: 60 * 1000,
});

// ============================================
// CACHE KEYS
// ============================================

export const CacheKeys = {
  // Dashboard
  DASHBOARD_STATS: 'dashboard:stats',
  DASHBOARD_CHARTS: 'dashboard:charts',
  
  // Settings
  setting: (key: string) => `setting:${key}`,
  allSettings: () => 'settings:all',
  
  // Reports
  reportList: (page: number, archived: boolean) => `reports:list:${page}:${archived}`,
  reportDetail: (id: string) => `report:${id}`,
  reportStats: () => 'reports:stats',
  
  // User
  userProfile: (id: string) => `user:${id}`,
  userSessions: (id: string) => `user:sessions:${id}`,
} as const;

// ============================================
// INVALIDATION HELPERS
// ============================================

export const CacheInvalidation = {
  /**
   * Invalidate all dashboard-related cache
   */
  dashboard(): void {
    dashboardCache.clear();
  },

  /**
   * Invalidate all settings cache
   */
  settings(): void {
    settingsCache.clear();
  },

  /**
   * Invalidate report-related cache
   */
  reports(): void {
    reportCache.clear();
    dashboardCache.delete(CacheKeys.DASHBOARD_STATS);
    dashboardCache.delete(CacheKeys.DASHBOARD_CHARTS);
  },

  /**
   * Invalidate specific report
   */
  report(id: string): void {
    reportCache.delete(CacheKeys.reportDetail(id));
    reportCache.deletePattern(/^reports:list:/);
    dashboardCache.delete(CacheKeys.DASHBOARD_STATS);
  },

  /**
   * Invalidate user cache
   */
  user(id: string): void {
    generalCache.delete(CacheKeys.userProfile(id));
    generalCache.delete(CacheKeys.userSessions(id));
  },

  /**
   * Clear all caches
   */
  all(): void {
    dashboardCache.clear();
    settingsCache.clear();
    reportCache.clear();
    generalCache.clear();
  },
};

// Export the base class for custom instances
export { LRUCache };
export type { CacheOptions, CacheEntry };
