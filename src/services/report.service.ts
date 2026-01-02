/**
 * Report Service for NeXSS
 * 
 * Handles all report-related business logic:
 * - CRUD operations on reports
 * - Report data retrieval and processing
 * - Screenshot management
 * - Bulk operations
 */

import { query, queryOne, Report, ReportData } from '@/lib/db';
import { decompressString } from '@/lib/utils';
import { getObjectStorageConfig, deleteFromStorage, extractKeyFromUrl } from '@/lib/object-storage';
import { CacheInvalidation } from '@/lib/cache';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import {
    ServiceResult,
    success,
    Errors,
    createLogger,
    safeExecute,
} from './base.service';

const logger = createLogger('ReportService');

// ============================================
// TYPES
// ============================================

export interface FullReport extends Report {
    data?: ReportData | null;
}

export interface ReportListParams {
    page: number;
    limit: number;
    archived: boolean;
    search?: string;
}

export interface ReportListResult {
    reports: Report[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface BulkActionResult {
    success: boolean;
    count: number;
}

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get paginated list of reports
 */
export async function getReports(
    params: ReportListParams
): Promise<ServiceResult<ReportListResult>> {
    return safeExecute('ReportService', 'getReports', async () => {
        const { page, limit, archived, search } = params;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE archived = $1';
        const queryParams: (boolean | number | string)[] = [archived];
        let paramIndex = 2;

        if (search) {
            whereClause += ` AND (origin ILIKE $${paramIndex} OR uri ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const reports = await query<Report>(
            `SELECT * FROM reports 
             ${whereClause}
             ORDER BY triggered_at DESC 
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...queryParams, limit, offset]
        );

        const countResult = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM reports ${whereClause}`,
            queryParams
        );

        const total = parseInt(countResult[0]?.count || '0', 10);

        return success({
            reports,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    });
}

/**
 * Get single report by ID with full data (Optimized with JOIN)
 */
export async function getReportById(id: string): Promise<ServiceResult<FullReport>> {
    return safeExecute('ReportService', 'getReportById', async () => {
        // Single JOIN query instead of 2 separate queries
        const result = await query<Report & {
            data_id: string | null;
            dom: string | null;
            screenshot: string | null;
            screenshot_storage: string | null;
            screenshot_error: string | null;
            localstorage: string | null;
            sessionstorage: string | null;
            extra: Record<string, unknown> | null;
            compressed: boolean;
            data_created_at: Date | null;
        }>(
            `SELECT 
                r.*,
                rd.id as data_id,
                rd.dom,
                rd.screenshot,
                rd.screenshot_storage,
                rd.screenshot_error,
                rd.localstorage,
                rd.sessionstorage,
                rd.extra,
                rd.compressed,
                rd.created_at as data_created_at
             FROM reports r
             LEFT JOIN reports_data rd ON rd.report_id = r.id
             WHERE r.id = $1`,
            [id]
        );

        if (result.length === 0) {
            return Errors.notFound('Report');
        }

        const row = result[0];

        // Build report object
        const report: Report = {
            id: row.id,
            uri: row.uri,
            origin: row.origin,
            referer: row.referer,
            user_agent: row.user_agent,
            ip: row.ip,
            triggered_at: row.triggered_at,
            archived: row.archived,
            read: row.read,
            cookies: row.cookies,
        };

        // Build report data if exists
        let reportData: ReportData | null = null;
        if (row.data_id) {
            reportData = {
                id: row.data_id,
                report_id: row.id,
                dom: row.dom,
                screenshot: row.screenshot,
                screenshot_storage: row.screenshot_storage,
                screenshot_error: row.screenshot_error,
                localstorage: row.localstorage,
                sessionstorage: row.sessionstorage,
                extra: row.extra,
                compressed: row.compressed,
                created_at: row.data_created_at!,
            };

            // Decompress DOM if needed
            if (reportData.compressed && reportData.dom) {
                try {
                    reportData = {
                        ...reportData,
                        dom: await decompressString(reportData.dom),
                    };
                } catch (err) {
                    logger.warn('Failed to decompress DOM', { reportId: id, error: err });
                }
            }
        }

        // Mark as read if not already (async, don't wait)
        if (!report.read) {
            query('UPDATE reports SET read = TRUE WHERE id = $1', [report.id]).catch(() => {});
        }

        return success({
            ...report,
            data: reportData,
        });
    });
}

/**
 * Get report summary (without heavy data like DOM/screenshot)
 */
export async function getReportSummary(id: string): Promise<ServiceResult<Report>> {
    return safeExecute('ReportService', 'getReportSummary', async () => {
        const report = await queryOne<Report>(
            'SELECT * FROM reports WHERE id = $1',
            [id]
        );

        if (!report) {
            return Errors.notFound('Report');
        }

        return success(report);
    });
}

// ============================================
// MUTATION OPERATIONS
// ============================================

/**
 * Archive or unarchive a report
 */
export async function archiveReport(
    id: string,
    archived: boolean
): Promise<ServiceResult<Report>> {
    return safeExecute('ReportService', 'archiveReport', async () => {
        const result = await query<Report>(
            'UPDATE reports SET archived = $2 WHERE id = $1 RETURNING *',
            [id, archived]
        );

        if (result.length === 0) {
            return Errors.notFound('Report');
        }

        logger.info(`Report ${archived ? 'archived' : 'unarchived'}`, { id });
        return success(result[0]);
    });
}

/**
 * Mark report as read
 */
export async function markAsRead(
    id: string,
    read: boolean = true
): Promise<ServiceResult<Report>> {
    return safeExecute('ReportService', 'markAsRead', async () => {
        const result = await query<Report>(
            'UPDATE reports SET read = $2 WHERE id = $1 RETURNING *',
            [id, read]
        );

        if (result.length === 0) {
            return Errors.notFound('Report');
        }

        return success(result[0]);
    });
}

/**
 * Delete a report with all associated data
 */
export async function deleteReport(id: string): Promise<ServiceResult<{ deleted: boolean }>> {
    return safeExecute('ReportService', 'deleteReport', async () => {
        // Check if report exists
        const report = await queryOne<Report>(
            'SELECT id FROM reports WHERE id = $1',
            [id]
        );

        if (!report) {
            return Errors.notFound('Report');
        }

        // Get report data to check for screenshot file
        const reportData = await queryOne<ReportData>(
            'SELECT screenshot, screenshot_storage FROM reports_data WHERE report_id = $1',
            [id]
        );

        // Delete screenshot file
        if (reportData) {
            await deleteScreenshotFile(reportData.screenshot, reportData.screenshot_storage);
        }

        // Delete report (cascade handles reports_data, persistent_sessions, intercepted_traffic)
        await query('DELETE FROM reports WHERE id = $1', [id]);

        // Invalidate caches
        CacheInvalidation.report(id);

        logger.info('Report deleted', { id });
        return success({ deleted: true });
    });
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Bulk archive/unarchive reports
 */
export async function bulkArchive(
    ids: string[],
    archived: boolean
): Promise<ServiceResult<BulkActionResult>> {
    return safeExecute('ReportService', 'bulkArchive', async () => {
        await query(
            'UPDATE reports SET archived = $1 WHERE id = ANY($2)',
            [archived, ids]
        );

        // Invalidate dashboard cache
        CacheInvalidation.reports();

        logger.info(`Bulk ${archived ? 'archive' : 'unarchive'}`, { count: ids.length });
        return success({ success: true, count: ids.length });
    });
}

/**
 * Bulk delete reports
 */
export async function bulkDelete(ids: string[]): Promise<ServiceResult<BulkActionResult>> {
    return safeExecute('ReportService', 'bulkDelete', async () => {
        // Get screenshot info for all reports
        const reportDataList = await query<ReportData>(
            'SELECT screenshot, screenshot_storage FROM reports_data WHERE report_id = ANY($1)',
            [ids]
        );

        // Delete all screenshot files
        for (const data of reportDataList) {
            await deleteScreenshotFile(data.screenshot, data.screenshot_storage);
        }

        // Delete associated data first
        await query('DELETE FROM intercepted_traffic WHERE report_id = ANY($1)', [ids]);
        await query('DELETE FROM persistent_sessions WHERE report_id = ANY($1)', [ids]);
        await query('DELETE FROM reports_data WHERE report_id = ANY($1)', [ids]);
        await query('DELETE FROM reports WHERE id = ANY($1)', [ids]);

        // Invalidate caches
        CacheInvalidation.reports();

        logger.info('Bulk delete completed', { count: ids.length });
        return success({ success: true, count: ids.length });
    });
}

/**
 * Bulk mark as read/unread
 */
export async function bulkMarkRead(
    ids: string[],
    read: boolean
): Promise<ServiceResult<BulkActionResult>> {
    return safeExecute('ReportService', 'bulkMarkRead', async () => {
        await query(
            'UPDATE reports SET read = $1 WHERE id = ANY($2)',
            [read, ids]
        );

        // Invalidate dashboard cache (unread count changes)
        CacheInvalidation.dashboard();

        return success({ success: true, count: ids.length });
    });
}

// ============================================
// STATISTICS
// ============================================

export interface ReportStats {
    total: number;
    unread: number;
    archived: number;
    today: number;
    thisWeek: number;
}

/**
 * Get report statistics for dashboard
 */
export async function getStats(): Promise<ServiceResult<ReportStats>> {
    return safeExecute('ReportService', 'getStats', async () => {
        const [stats] = await query<{
            total: string;
            unread: string;
            archived: string;
            today: string;
            this_week: string;
        }>(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE read = FALSE AND archived = FALSE) as unread,
                COUNT(*) FILTER (WHERE archived = TRUE) as archived,
                COUNT(*) FILTER (WHERE triggered_at >= CURRENT_DATE) as today,
                COUNT(*) FILTER (WHERE triggered_at >= CURRENT_DATE - INTERVAL '7 days') as this_week
            FROM reports
        `);

        return success({
            total: parseInt(stats?.total || '0', 10),
            unread: parseInt(stats?.unread || '0', 10),
            archived: parseInt(stats?.archived || '0', 10),
            today: parseInt(stats?.today || '0', 10),
            thisWeek: parseInt(stats?.this_week || '0', 10),
        });
    });
}

// ============================================
// HELPERS
// ============================================

/**
 * Delete screenshot file from local or object storage
 */
async function deleteScreenshotFile(
    screenshotPath: string | null,
    storageType: string | null
): Promise<void> {
    if (!screenshotPath || !storageType) return;

    try {
        if (storageType === 'local') {
            const filename = screenshotPath.replace('/screenshots/', '');
            const filePath = join(process.cwd(), 'data', 'screenshots', filename);
            if (existsSync(filePath)) {
                await unlink(filePath);
                logger.debug('Local screenshot deleted', { filePath });
            }
        } else if (storageType === 's3') {
            const config = await getObjectStorageConfig();
            if (config.enabled) {
                const key = extractKeyFromUrl(screenshotPath);
                if (key) {
                    await deleteFromStorage(config, key);
                    logger.debug('S3 screenshot deleted', { key });
                }
            }
        }
    } catch (err) {
        logger.error('Failed to delete screenshot', { screenshotPath, storageType, error: err });
    }
}
