import { NextRequest, NextResponse } from 'next/server';
import { query, Setting } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getObjectStorageConfig, testConnection, ObjectStorageConfig } from '@/lib/object-storage';
import { settingsUpdateSchema, safeValidate } from '@/lib/validations';
import { validateCSRF } from '@/lib/csrf';

// GET - Get all settings
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const settings = await query<Setting>('SELECT key, value FROM settings');

        // Convert array to object for easier frontend use
        const settingsObj: Record<string, string> = {};
        for (const s of settings) {
            // Mask secret keys
            if (s.key === 'storage_secret_key' && s.value) {
                settingsObj[s.key] = '••••••••';
            } else if (s.key === 'telegram_bot_token' && s.value) {
                settingsObj[s.key] = '••••••••';
            } else {
                settingsObj[s.key] = s.value;
            }
        }

        return NextResponse.json({ settings: settingsObj });
    } catch (error) {
        console.error('[Settings] Get error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT - Update settings (upsert)
export async function PUT(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only admins can change settings
        if (session.rank < 3) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        
        // CSRF validation for state-changing request
        const csrfError = validateCSRF(request, body);
        if (csrfError) return csrfError;
        
        const { settings } = body;

        if (!settings || typeof settings !== 'object') {
            return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
        }

        // Validate settings with Zod
        const validation = safeValidate(settingsUpdateSchema, settings);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid settings', details: validation.error },
                { status: 400 }
            );
        }

        // Upsert each setting using ON CONFLICT
        for (const [key, value] of Object.entries(settings)) {
            // Skip masked secrets
            if ((key === 'storage_secret_key' || key === 'telegram_bot_token') && value === '••••••••') {
                continue;
            }
            
            await query(
                `INSERT INTO settings (key, value, updated_at) 
                 VALUES ($1, $2, NOW()) 
                 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                [key, String(value)]
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Settings] Update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
// POST - Test object storage connection
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
        const { action, config } = body;

        if (action === 'test_connection') {
            // Test with provided config (for testing before save)
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
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('[Settings] POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}