/**
 * Path Enumeration Service for NeXSS
 * 
 * Handles path enumeration configuration and results:
 * - CRUD for path configurations
 * - Store and retrieve enumeration results per report
 */

import { query, queryOne, generateId, PathEnumerationConfig, PathEnumerationResult } from '@/lib/db';
import {
    ServiceResult,
    success,
    Errors,
    createLogger,
    safeExecute,
} from './base.service';

const logger = createLogger('PathEnumerationService');

// ============================================
// CONFIG OPERATIONS
// ============================================

/**
 * Get all path enumeration configs
 */
export async function getAllConfigs(): Promise<ServiceResult<PathEnumerationConfig[]>> {
    return safeExecute('PathEnumerationService', 'getAllConfigs', async () => {
        const configs = await query<PathEnumerationConfig>(
            'SELECT * FROM path_enumeration_config ORDER BY created_at ASC'
        );
        return success(configs);
    });
}

/**
 * Get active path configs only (for payload generation)
 */
export async function getActiveConfigs(): Promise<ServiceResult<PathEnumerationConfig[]>> {
    return safeExecute('PathEnumerationService', 'getActiveConfigs', async () => {
        const configs = await query<PathEnumerationConfig>(
            'SELECT * FROM path_enumeration_config WHERE active = true ORDER BY created_at ASC'
        );
        return success(configs);
    });
}

/**
 * Get active paths count
 */
export async function getActiveCount(): Promise<ServiceResult<number>> {
    return safeExecute('PathEnumerationService', 'getActiveCount', async () => {
        const result = await queryOne<{ count: string }>(
            'SELECT COUNT(*) as count FROM path_enumeration_config WHERE active = true'
        );
        return success(parseInt(result?.count || '0', 10));
    });
}

/**
 * Create a new path config
 */
export async function createConfig(
    path: string,
    description?: string | null
): Promise<ServiceResult<PathEnumerationConfig>> {
    return safeExecute('PathEnumerationService', 'createConfig', async () => {
        const id = generateId();
        
        await query(
            `INSERT INTO path_enumeration_config (id, path, description, active)
             VALUES ($1, $2, $3, true)`,
            [id, path, description || null]
        );

        const config = await queryOne<PathEnumerationConfig>(
            'SELECT * FROM path_enumeration_config WHERE id = $1',
            [id]
        );

        if (!config) {
            return Errors.internal('Failed to create config');
        }

        logger.info('Path config created', { id, path });
        return success(config);
    });
}

/**
 * Update a path config
 */
export async function updateConfig(
    id: string,
    updates: { path?: string; description?: string | null; active?: boolean }
): Promise<ServiceResult<PathEnumerationConfig>> {
    return safeExecute('PathEnumerationService', 'updateConfig', async () => {
        const existing = await queryOne<PathEnumerationConfig>(
            'SELECT * FROM path_enumeration_config WHERE id = $1',
            [id]
        );

        if (!existing) {
            return Errors.notFound('Path config');
        }

        const newPath = updates.path ?? existing.path;
        const newDescription = updates.description !== undefined ? updates.description : existing.description;
        const newActive = updates.active !== undefined ? updates.active : existing.active;

        await query(
            `UPDATE path_enumeration_config 
             SET path = $1, description = $2, active = $3, updated_at = NOW()
             WHERE id = $4`,
            [newPath, newDescription, newActive, id]
        );

        const updated = await queryOne<PathEnumerationConfig>(
            'SELECT * FROM path_enumeration_config WHERE id = $1',
            [id]
        );

        logger.info('Path config updated', { id });
        return success(updated!);
    });
}

/**
 * Toggle active status
 */
export async function toggleActive(id: string): Promise<ServiceResult<PathEnumerationConfig>> {
    return safeExecute('PathEnumerationService', 'toggleActive', async () => {
        const existing = await queryOne<PathEnumerationConfig>(
            'SELECT * FROM path_enumeration_config WHERE id = $1',
            [id]
        );

        if (!existing) {
            return Errors.notFound('Path config');
        }

        await query(
            `UPDATE path_enumeration_config SET active = NOT active, updated_at = NOW() WHERE id = $1`,
            [id]
        );

        const updated = await queryOne<PathEnumerationConfig>(
            'SELECT * FROM path_enumeration_config WHERE id = $1',
            [id]
        );

        logger.info('Path config toggled', { id, active: updated?.active });
        return success(updated!);
    });
}

/**
 * Delete a path config
 */
export async function deleteConfig(id: string): Promise<ServiceResult<{ deleted: boolean }>> {
    return safeExecute('PathEnumerationService', 'deleteConfig', async () => {
        const existing = await queryOne<PathEnumerationConfig>(
            'SELECT id FROM path_enumeration_config WHERE id = $1',
            [id]
        );

        if (!existing) {
            return Errors.notFound('Path config');
        }

        await query('DELETE FROM path_enumeration_config WHERE id = $1', [id]);

        logger.info('Path config deleted', { id });
        return success({ deleted: true });
    });
}

// ============================================
// RESULTS OPERATIONS
// ============================================

/**
 * Get enumeration results for a report
 */
export async function getResultsByReportId(
    reportId: string
): Promise<ServiceResult<PathEnumerationResult[]>> {
    return safeExecute('PathEnumerationService', 'getResultsByReportId', async () => {
        const results = await query<PathEnumerationResult>(
            'SELECT * FROM path_enumeration_results WHERE report_id = $1 ORDER BY fetched_at ASC',
            [reportId]
        );
        return success(results);
    });
}

/**
 * Save enumeration result
 */
export async function saveResult(
    reportId: string,
    result: {
        path: string;
        description?: string | null;
        status_code?: number | null;
        response_size?: number | null;
        response_body?: string | null;
        response_headers?: string | null;
        error_message?: string | null;
    }
): Promise<ServiceResult<PathEnumerationResult>> {
    return safeExecute('PathEnumerationService', 'saveResult', async () => {
        const id = generateId();
        
        await query(
            `INSERT INTO path_enumeration_results 
             (id, report_id, path, description, status_code, response_size, response_body, response_headers, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                id,
                reportId,
                result.path,
                result.description || null,
                result.status_code ?? null,
                result.response_size ?? null,
                result.response_body || null,
                result.response_headers || null,
                result.error_message || null,
            ]
        );

        const saved = await queryOne<PathEnumerationResult>(
            'SELECT * FROM path_enumeration_results WHERE id = $1',
            [id]
        );

        return success(saved!);
    });
}

/**
 * Bulk save enumeration results
 */
export async function saveResults(
    reportId: string,
    results: Array<{
        path: string;
        description?: string | null;
        status_code?: number | null;
        response_size?: number | null;
        response_body?: string | null;
        response_headers?: string | null;
        error_message?: string | null;
    }>
): Promise<ServiceResult<{ saved: number }>> {
    return safeExecute('PathEnumerationService', 'saveResults', async () => {
        let saved = 0;

        for (const result of results) {
            const id = generateId();
            await query(
                `INSERT INTO path_enumeration_results 
                 (id, report_id, path, description, status_code, response_size, response_body, response_headers, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    id,
                    reportId,
                    result.path,
                    result.description || null,
                    result.status_code ?? null,
                    result.response_size ?? null,
                    result.response_body || null,
                    result.response_headers || null,
                    result.error_message || null,
                ]
            );
            saved++;
        }

        logger.info('Path enumeration results saved', { reportId, count: saved });
        return success({ saved });
    });
}

/**
 * Get results count for a report
 */
export async function getResultsCount(reportId: string): Promise<ServiceResult<number>> {
    return safeExecute('PathEnumerationService', 'getResultsCount', async () => {
        const result = await queryOne<{ count: string }>(
            'SELECT COUNT(*) as count FROM path_enumeration_results WHERE report_id = $1',
            [reportId]
        );
        return success(parseInt(result?.count || '0', 10));
    });
}
