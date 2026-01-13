import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { validateCSRF } from '@/lib/csrf';
import { pathEnumConfigSchema, safeValidate, ulidSchema } from '@/lib/validations';
import { PathEnumerationService, toResponse, Errors } from '@/services';

// GET - Get all path enumeration configs
export async function GET() {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const result = await PathEnumerationService.getAllConfigs();
    return toResponse(result);
}

// POST - Create new path config
export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    if (session.rank < 3) {
        return toResponse(Errors.forbidden('Admin access required'));
    }

    const body = await request.json();

    // CSRF validation
    const csrfError = validateCSRF(request, body);
    if (csrfError) return csrfError;

    // Validate input
    const validation = safeValidate(pathEnumConfigSchema, body);
    if (!validation.success) {
        return toResponse(Errors.badRequest(validation.error));
    }

    const { path, description } = validation.data;
    const result = await PathEnumerationService.createConfig(path, description);
    return toResponse(result);
}

// PUT - Update path config
export async function PUT(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    if (session.rank < 3) {
        return toResponse(Errors.forbidden('Admin access required'));
    }

    const body = await request.json();

    // CSRF validation
    const csrfError = validateCSRF(request, body);
    if (csrfError) return csrfError;

    const { id, ...updates } = body;

    // Validate ID
    const idValidation = safeValidate(ulidSchema, id);
    if (!idValidation.success) {
        return toResponse(Errors.badRequest('Invalid ID'));
    }

    // Validate updates if path is provided
    if (updates.path !== undefined) {
        const pathValidation = safeValidate(pathEnumConfigSchema, updates);
        if (!pathValidation.success) {
            return toResponse(Errors.badRequest(pathValidation.error));
        }
    }

    const result = await PathEnumerationService.updateConfig(id, updates);
    return toResponse(result);
}

// DELETE - Delete path config
export async function DELETE(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    if (session.rank < 3) {
        return toResponse(Errors.forbidden('Admin access required'));
    }

    const body = await request.json();

    // CSRF validation
    const csrfError = validateCSRF(request, body);
    if (csrfError) return csrfError;

    const { id } = body;

    // Validate ID
    const idValidation = safeValidate(ulidSchema, id);
    if (!idValidation.success) {
        return toResponse(Errors.badRequest('Invalid ID'));
    }

    const result = await PathEnumerationService.deleteConfig(id);
    return toResponse(result);
}

// PATCH - Toggle active status
export async function PATCH(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    if (session.rank < 3) {
        return toResponse(Errors.forbidden('Admin access required'));
    }

    const body = await request.json();

    // CSRF validation
    const csrfError = validateCSRF(request, body);
    if (csrfError) return csrfError;

    const { id } = body;

    // Validate ID
    const idValidation = safeValidate(ulidSchema, id);
    if (!idValidation.success) {
        return toResponse(Errors.badRequest('Invalid ID'));
    }

    const result = await PathEnumerationService.toggleActive(id);
    return toResponse(result);
}
