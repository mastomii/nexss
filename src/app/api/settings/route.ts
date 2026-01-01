import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { settingsUpdateSchema, safeValidate } from '@/lib/validations';
import { validateCSRF } from '@/lib/csrf';
import { SettingsService, toResponse, Errors } from '@/services';

// GET - Get all settings
export async function GET() {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const result = await SettingsService.getAllSettings();
    
    // Wrap in { settings: ... } for backwards compatibility
    if (result.success) {
        return toResponse({ success: true, data: { settings: result.data } });
    }
    return toResponse(result);
}

// PUT - Update settings (upsert)
export async function PUT(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    // Only admins can change settings
    if (session.rank < 3) {
        return toResponse(Errors.forbidden('Admin access required'));
    }

    const body = await request.json();

    // CSRF validation for state-changing request
    const csrfError = validateCSRF(request, body);
    if (csrfError) return csrfError;

    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
        return toResponse(Errors.badRequest('Invalid settings'));
    }

    // Validate settings with Zod
    const validation = safeValidate(settingsUpdateSchema, settings);
    if (!validation.success) {
        return toResponse(Errors.badRequest(validation.error));
    }

    const result = await SettingsService.updateSettings(settings);
    
    // Return success: true for backwards compatibility
    if (result.success) {
        return toResponse({ success: true, data: { success: true } });
    }
    return toResponse(result);
}

// POST - Test object storage connection
export async function POST(request: Request) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    if (session.rank < 3) {
        return toResponse(Errors.forbidden('Admin access required'));
    }

    const body = await request.json();
    const { action, config } = body;

    if (action === 'test_connection') {
        const result = await SettingsService.testStorageConnection({
            provider: config.provider,
            endpoint: config.endpoint,
            region: config.region || 'auto',
            bucket: config.bucket,
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            publicUrl: config.publicUrl || undefined,
        });
        return toResponse(result);
    }

    return toResponse(Errors.badRequest('Invalid action'));
}