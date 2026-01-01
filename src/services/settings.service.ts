/**
 * Settings Service for NeXSS
 * 
 * Handles application settings management:
 * - XSS payload settings
 * - Object storage configuration
 * - Telegram notifications
 * - General app settings
 */

import { query, queryOne, Setting } from '@/lib/db';
import { testConnection, ObjectStorageConfig } from '@/lib/object-storage';
import {
    ServiceResult,
    success,
    createLogger,
    safeExecute,
} from './base.service';

const logger = createLogger('SettingsService');

// ============================================
// TYPES
// ============================================

export interface AppSettings {
    // General
    app_name: string;
    app_tagline: string;
    timezone: string;
    
    // XSS Payload
    screenshot_enabled: string;
    persistent_enabled: string;
    persistent_key: string;
    advanced_persistent_enabled: string;
    
    // Telegram
    telegram_enabled: string;
    telegram_bot_token: string;
    telegram_chat_id: string;
    
    // Storage
    storage_type: string;
    s3_endpoint: string;
    s3_bucket: string;
    s3_region: string;
    s3_access_key: string;
    s3_secret_key: string;
    s3_public_url: string;
}

// Keys that should be masked in responses
const MASKED_KEYS = ['storage_secret_key', 'telegram_bot_token', 's3_secret_key'];
const MASK_VALUE = '••••••••';

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get all settings (with secrets masked)
 */
export async function getAllSettings(): Promise<ServiceResult<Record<string, string>>> {
    return safeExecute('SettingsService', 'getAllSettings', async () => {
        const settings = await query<Setting>('SELECT key, value FROM settings');

        const settingsObj: Record<string, string> = {};
        for (const s of settings) {
            // Mask secret keys
            if (MASKED_KEYS.includes(s.key) && s.value) {
                settingsObj[s.key] = MASK_VALUE;
            } else {
                settingsObj[s.key] = s.value;
            }
        }

        return success(settingsObj);
    });
}

/**
 * Get a single setting value
 */
export async function getSetting(key: string): Promise<ServiceResult<string | null>> {
    return safeExecute('SettingsService', 'getSetting', async () => {
        const setting = await queryOne<Setting>(
            'SELECT value FROM settings WHERE key = $1',
            [key]
        );

        return success(setting?.value || null);
    });
}

/**
 * Get multiple settings at once
 */
export async function getSettings(keys: string[]): Promise<ServiceResult<Record<string, string>>> {
    return safeExecute('SettingsService', 'getSettings', async () => {
        const settings = await query<Setting>(
            'SELECT key, value FROM settings WHERE key = ANY($1)',
            [keys]
        );

        const result: Record<string, string> = {};
        for (const s of settings) {
            result[s.key] = s.value;
        }

        return success(result);
    });
}

// ============================================
// MUTATION OPERATIONS
// ============================================

/**
 * Update a single setting
 */
export async function updateSetting(
    key: string,
    value: string
): Promise<ServiceResult<{ updated: boolean }>> {
    return safeExecute('SettingsService', 'updateSetting', async () => {
        await query(
            `INSERT INTO settings (key, value, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, value]
        );

        logger.info('Setting updated', { key });
        return success({ updated: true });
    });
}

/**
 * Update multiple settings at once
 */
export async function updateSettings(
    settings: Record<string, string>
): Promise<ServiceResult<{ updated: boolean }>> {
    return safeExecute('SettingsService', 'updateSettings', async () => {
        for (const [key, value] of Object.entries(settings)) {
            // Skip masked secrets (they haven't been changed)
            if (MASKED_KEYS.includes(key) && value === MASK_VALUE) {
                continue;
            }

            await query(
                `INSERT INTO settings (key, value, updated_at) 
                 VALUES ($1, $2, NOW()) 
                 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                [key, String(value)]
            );
        }

        logger.info('Settings bulk updated', { count: Object.keys(settings).length });
        return success({ updated: true });
    });
}

// ============================================
// OBJECT STORAGE OPERATIONS
// ============================================

export interface StorageTestResult {
    success: boolean;
    message?: string;
    error?: string;
}

/**
 * Test object storage connection
 */
export async function testStorageConnection(
    config: {
        provider: 's3' | 'minio' | 'r2';
        endpoint: string;
        region?: string;
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        publicUrl?: string;
    }
): Promise<ServiceResult<StorageTestResult>> {
    return safeExecute('SettingsService', 'testStorageConnection', async () => {
        const testConfig: ObjectStorageConfig = {
            enabled: true,
            provider: config.provider,
            endpoint: config.endpoint,
            region: config.region || 'auto',
            bucket: config.bucket,
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            publicUrl: config.publicUrl || null,
        };

        const result = await testConnection(testConfig);
        
        logger.info('Storage connection test', { success: result.success });
        return success<StorageTestResult>({
            success: result.success,
            message: result.success ? 'Connection successful' : undefined,
            error: result.error,
        });
    });
}

// ============================================
// PAYLOAD SETTINGS
// ============================================

export interface PayloadSettings {
    screenshotEnabled: boolean;
    persistentEnabled: boolean;
    persistentKey: string | null;
    advancedPersistentEnabled: boolean;
}

/**
 * Get XSS payload settings
 */
export async function getPayloadSettings(): Promise<ServiceResult<PayloadSettings>> {
    return safeExecute('SettingsService', 'getPayloadSettings', async () => {
        const keys = [
            'screenshot_enabled',
            'persistent_enabled',
            'persistent_key',
            'advanced_persistent_enabled',
        ];

        const settings = await query<Setting>(
            'SELECT key, value FROM settings WHERE key = ANY($1)',
            [keys]
        );

        const map: Record<string, string> = {};
        for (const s of settings) {
            map[s.key] = s.value;
        }

        return success({
            screenshotEnabled: map.screenshot_enabled === 'true',
            persistentEnabled: map.persistent_enabled === 'true',
            persistentKey: map.persistent_key || null,
            advancedPersistentEnabled: map.advanced_persistent_enabled === 'true',
        });
    });
}

// ============================================
// TELEGRAM SETTINGS
// ============================================

export interface TelegramSettings {
    enabled: boolean;
    botToken: string | null;
    chatId: string | null;
}

/**
 * Get Telegram notification settings
 */
export async function getTelegramSettings(): Promise<ServiceResult<TelegramSettings>> {
    return safeExecute('SettingsService', 'getTelegramSettings', async () => {
        const keys = ['telegram_enabled', 'telegram_bot_token', 'telegram_chat_id'];

        const settings = await query<Setting>(
            'SELECT key, value FROM settings WHERE key = ANY($1)',
            [keys]
        );

        const map: Record<string, string> = {};
        for (const s of settings) {
            map[s.key] = s.value;
        }

        return success({
            enabled: map.telegram_enabled === 'true',
            botToken: map.telegram_bot_token || null,
            chatId: map.telegram_chat_id || null,
        });
    });
}
