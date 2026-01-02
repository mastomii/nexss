/**
 * Background Jobs Service for NeXSS
 * 
 * Handles scheduled cleanup and maintenance tasks:
 * - Expired session cleanup
 * - Old report archival
 * - Orphaned screenshot cleanup
 * - Cache maintenance
 */

import { query } from '@/lib/db';
import { CacheInvalidation } from '@/lib/cache';

// ============================================
// TYPES
// ============================================

export interface JobResult {
  job: string;
  success: boolean;
  affected: number;
  duration: number;
  error?: string;
}

export interface CleanupStats {
  sessions: number;
  reports: number;
  screenshots: number;
  traffic: number;
  persist: number;
  cache: boolean;
}

// ============================================
// CLEANUP FUNCTIONS
// ============================================

/**
 * Clean up expired sessions (older than 30 days)
 */
export async function cleanupExpiredSessions(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<JobResult> {
  const start = Date.now();
  
  try {
    const cutoff = new Date(Date.now() - maxAge);
    
    const result = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM sessions 
         WHERE created_at < $1 
         RETURNING id
       )
       SELECT COUNT(*) as count FROM deleted`,
      [cutoff]
    );
    
    const affected = parseInt(result[0]?.count || '0', 10);
    
    return {
      job: 'cleanupExpiredSessions',
      success: true,
      affected,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      job: 'cleanupExpiredSessions',
      success: false,
      affected: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clean up old archived reports (older than specified days)
 */
export async function cleanupOldReports(maxAgeDays: number = 90): Promise<JobResult> {
  const start = Date.now();
  
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    
    // Delete report data first (foreign key constraint)
    await query(
      `DELETE FROM reports_data 
       WHERE report_id IN (
         SELECT id FROM reports 
         WHERE archived = TRUE AND triggered_at < $1
       )`,
      [cutoff]
    );
    
    // Then delete reports
    const result = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM reports 
         WHERE archived = TRUE AND triggered_at < $1 
         RETURNING id
       )
       SELECT COUNT(*) as count FROM deleted`,
      [cutoff]
    );
    
    const affected = parseInt(result[0]?.count || '0', 10);
    
    // Invalidate cache
    if (affected > 0) {
      CacheInvalidation.reports();
    }
    
    return {
      job: 'cleanupOldReports',
      success: true,
      affected,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      job: 'cleanupOldReports',
      success: false,
      affected: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clean up old traffic logs (older than specified days)
 */
export async function cleanupOldTraffic(maxAgeDays: number = 7): Promise<JobResult> {
  const start = Date.now();
  
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    
    const result = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM traffic_logs 
         WHERE captured_at < $1 
         RETURNING id
       )
       SELECT COUNT(*) as count FROM deleted`,
      [cutoff]
    );
    
    const affected = parseInt(result[0]?.count || '0', 10);
    
    return {
      job: 'cleanupOldTraffic',
      success: true,
      affected,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      job: 'cleanupOldTraffic',
      success: false,
      affected: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clean up old persist commands (older than specified days)
 */
export async function cleanupOldPersistCommands(maxAgeDays: number = 7): Promise<JobResult> {
  const start = Date.now();
  
  try {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    
    const result = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM persist_commands 
         WHERE created_at < $1 AND executed = TRUE
         RETURNING id
       )
       SELECT COUNT(*) as count FROM deleted`,
      [cutoff]
    );
    
    const affected = parseInt(result[0]?.count || '0', 10);
    
    return {
      job: 'cleanupOldPersistCommands',
      success: true,
      affected,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      job: 'cleanupOldPersistCommands',
      success: false,
      affected: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Vacuum analyze database tables (PostgreSQL optimization)
 */
export async function vacuumTables(): Promise<JobResult> {
  const start = Date.now();
  
  try {
    // Note: VACUUM cannot run inside a transaction
    // We'll just analyze instead (VACUUM should be run by cron)
    await query('ANALYZE reports');
    await query('ANALYZE reports_data');
    await query('ANALYZE sessions');
    await query('ANALYZE traffic_logs');
    
    return {
      job: 'vacuumTables',
      success: true,
      affected: 4, // Number of tables analyzed
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      job: 'vacuumTables',
      success: false,
      affected: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run all cleanup jobs
 */
export async function runAllCleanupJobs(options?: {
  sessionMaxAge?: number;
  reportMaxAgeDays?: number;
  trafficMaxAgeDays?: number;
  persistMaxAgeDays?: number;
}): Promise<{
  results: JobResult[];
  totalDuration: number;
  stats: CleanupStats;
}> {
  const start = Date.now();
  const results: JobResult[] = [];
  
  // Run jobs sequentially to avoid overwhelming the DB
  const sessionsResult = await cleanupExpiredSessions(options?.sessionMaxAge);
  results.push(sessionsResult);
  
  const reportsResult = await cleanupOldReports(options?.reportMaxAgeDays);
  results.push(reportsResult);
  
  const trafficResult = await cleanupOldTraffic(options?.trafficMaxAgeDays);
  results.push(trafficResult);
  
  const persistResult = await cleanupOldPersistCommands(options?.persistMaxAgeDays);
  results.push(persistResult);
  
  // Clear all caches after cleanup
  CacheInvalidation.all();
  
  // Analyze tables
  const vacuumResult = await vacuumTables();
  results.push(vacuumResult);
  
  return {
    results,
    totalDuration: Date.now() - start,
    stats: {
      sessions: sessionsResult.affected,
      reports: reportsResult.affected,
      screenshots: 0, // Would need file system cleanup
      traffic: trafficResult.affected,
      persist: persistResult.affected,
      cache: true,
    },
  };
}

// ============================================
// SCHEDULED JOB RUNNER
// ============================================

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start scheduled cleanup jobs
 */
export function startScheduledCleanup(intervalHours: number = 24): void {
  if (cleanupInterval) {
    console.log('[Cleanup] Already running');
    return;
  }
  
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  console.log(`[Cleanup] Starting scheduled cleanup every ${intervalHours} hours`);
  
  // Run immediately on start
  runAllCleanupJobs().then(({ stats, totalDuration }) => {
    console.log(`[Cleanup] Initial cleanup complete in ${totalDuration}ms:`, stats);
  }).catch(err => {
    console.error('[Cleanup] Initial cleanup failed:', err);
  });
  
  // Schedule recurring cleanup
  cleanupInterval = setInterval(async () => {
    try {
      const { stats, totalDuration } = await runAllCleanupJobs();
      console.log(`[Cleanup] Scheduled cleanup complete in ${totalDuration}ms:`, stats);
    } catch (err) {
      console.error('[Cleanup] Scheduled cleanup failed:', err);
    }
  }, intervalMs);
}

/**
 * Stop scheduled cleanup jobs
 */
export function stopScheduledCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[Cleanup] Stopped scheduled cleanup');
  }
}
