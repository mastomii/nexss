import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { ulidSchema, safeValidate } from '@/lib/validations';

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
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        
        // Validate with Zod
        const validation = safeValidate(bulkArchiveSchema, body);
        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error },
                { status: 400 }
            );
        }
        
        const { ids, archived } = validation.data;
        
        // Use parameterized query with ANY for array
        await query(
            'UPDATE reports SET archived = $1 WHERE id = ANY($2)',
            [archived, ids]
        );

        return NextResponse.json({ 
            success: true, 
            count: ids.length 
        });
    } catch (error) {
        console.error('[Reports] Bulk archive error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// DELETE - Bulk delete reports
export async function DELETE(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
            return NextResponse.json(
                { error: validation.error },
                { status: 400 }
            );
        }
        
        const { ids } = validation.data;
        
        // Delete associated data first (cascade should handle this but being explicit)
        await query('DELETE FROM reports_data WHERE report_id = ANY($1)', [ids]);
        await query('DELETE FROM persistent_sessions WHERE report_id = ANY($1)', [ids]);
        await query('DELETE FROM intercepted_traffic WHERE report_id = ANY($1)', [ids]);
        
        // Delete reports
        await query(
            'DELETE FROM reports WHERE id = ANY($1)',
            [ids]
        );

        return NextResponse.json({ 
            success: true, 
            count: ids.length 
        });
    } catch (error) {
        console.error('[Reports] Bulk delete error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
