import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { safeValidate, ulidSchema } from '@/lib/validations';
import { PathEnumerationService, toResponse, Errors } from '@/services';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET - Get enumeration results for a report
export async function GET(
    request: NextRequest,
    { params }: RouteParams
) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const { id } = await params;

    // Validate ID
    const idValidation = safeValidate(ulidSchema, id);
    if (!idValidation.success) {
        return toResponse(Errors.badRequest('Invalid report ID'));
    }

    const result = await PathEnumerationService.getResultsByReportId(id);
    return toResponse(result);
}
