import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ReportService, toResponse, Errors } from '@/services';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET - Get single report with full data
export async function GET(request: NextRequest, { params }: RouteParams) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const { id } = await params;
    const result = await ReportService.getReportById(id);
    
    // Wrap in { report: ... } for backwards compatibility
    if (result.success) {
        return toResponse({ success: true, data: { report: result.data } });
    }
    return toResponse(result);
}

// DELETE - Delete report
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const { id } = await params;
    const result = await ReportService.deleteReport(id);
    
    // Return success: true for backwards compatibility
    if (result.success) {
        return toResponse({ success: true, data: { success: true } });
    }
    return toResponse(result);
}

// PATCH - Archive/unarchive report
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const { id } = await params;
    const body = await request.json();
    const { archived } = body;

    if (typeof archived !== 'boolean') {
        return toResponse(Errors.badRequest('Invalid archived value'));
    }

    const result = await ReportService.archiveReport(id, archived);
    
    // Wrap in { report: ... } for backwards compatibility
    if (result.success) {
        return toResponse({ success: true, data: { report: result.data } });
    }
    return toResponse(result);
}
