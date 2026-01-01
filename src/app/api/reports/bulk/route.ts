import { getSession } from '@/lib/auth';
import { ulidSchema, safeValidate } from '@/lib/validations';
import { ReportService, toResponse, Errors } from '@/services';
import { z } from 'zod';

// Schema for bulk archive
const bulkArchiveSchema = z.object({
    ids: z.array(ulidSchema).min(1).max(100),
    archived: z.boolean(),
});

// Schema for bulk delete
const bulkDeleteSchema = z.object({
    ids: z.array(ulidSchema).min(1).max(100),
});

// PATCH - Bulk archive/unarchive reports
export async function PATCH(request: Request) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const body = await request.json();

    // Validate with Zod
    const validation = safeValidate(bulkArchiveSchema, body);
    if (!validation.success) {
        return toResponse(Errors.badRequest(validation.error));
    }

    const { ids, archived } = validation.data;
    const result = await ReportService.bulkArchive(ids, archived);
    return toResponse(result);
}

// DELETE - Bulk delete reports
export async function DELETE(request: Request) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    let rawIds: string[] = [];

    // Try to get ids from body first, then from URL params
    try {
        const body = await request.json();
        rawIds = body.ids || [];
    } catch {
        // If body parsing fails, try URL search params
        const url = new URL(request.url);
        const idsParam = url.searchParams.get('ids');
        if (idsParam) {
            rawIds = idsParam.split(',');
        }
    }

    // Validate with Zod
    const validation = safeValidate(bulkDeleteSchema, { ids: rawIds });
    if (!validation.success) {
        return toResponse(Errors.badRequest(validation.error));
    }

    const { ids } = validation.data;
    const result = await ReportService.bulkDelete(ids);
    return toResponse(result);
}
