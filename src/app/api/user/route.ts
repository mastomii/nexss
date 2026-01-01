import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { validateCSRF } from '@/lib/csrf';
import { UserService, toResponse, Errors } from '@/services';

// GET - Get current user profile
export async function GET() {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const result = await UserService.getUserById(session.userId);
    
    // Wrap in { user: ... } for backwards compatibility
    if (result.success) {
        return toResponse({ success: true, data: { user: result.data } });
    }
    return toResponse(result);
}

// PUT - Update user profile (email/password)
export async function PUT(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const body = await request.json();

    // CSRF validation for sensitive profile changes
    const csrfError = validateCSRF(request, body);
    if (csrfError) return csrfError;

    const { email, currentPassword, newPassword } = body;

    const result = await UserService.updateProfile(session.userId, {
        email,
        currentPassword,
        newPassword,
    });

    // Return success: true for backwards compatibility
    if (result.success) {
        return toResponse({ success: true, data: { success: true } });
    }
    return toResponse(result);
}
