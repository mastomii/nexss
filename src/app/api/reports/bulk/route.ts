import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// PATCH - Bulk archive/unarchive reports
export async function PATCH(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { ids, archived } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'No report IDs provided' }, { status: 400 });
        }

        if (typeof archived !== 'boolean') {
            return NextResponse.json({ error: 'Invalid archived value' }, { status: 400 });
        }

        // Limit to 100 reports at a time
        const limitedIds = ids.slice(0, 100);
        
        // Use parameterized query with ANY for array
        await query(
            'UPDATE reports SET archived = $1 WHERE id = ANY($2)',
            [archived, limitedIds]
        );

        return NextResponse.json({ 
            success: true, 
            count: limitedIds.length 
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

        let ids: string[] = [];
        
        // Try to get ids from body first, then from URL params
        try {
            const body = await request.json();
            ids = body.ids || [];
        } catch {
            // If body parsing fails, try URL search params
            const url = new URL(request.url);
            const idsParam = url.searchParams.get('ids');
            if (idsParam) {
                ids = idsParam.split(',');
            }
        }

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'No report IDs provided' }, { status: 400 });
        }

        // Limit to 100 reports at a time
        const limitedIds = ids.slice(0, 100);
        
        // Delete associated data first (cascade should handle this but being explicit)
        await query('DELETE FROM reports_data WHERE report_id = ANY($1)', [limitedIds]);
        await query('DELETE FROM persistent_sessions WHERE report_id = ANY($1)', [limitedIds]);
        await query('DELETE FROM intercepted_traffic WHERE report_id = ANY($1)', [limitedIds]);
        
        // Delete reports
        await query(
            'DELETE FROM reports WHERE id = ANY($1)',
            [limitedIds]
        );

        return NextResponse.json({ 
            success: true, 
            count: limitedIds.length 
        });
    } catch (error) {
        console.error('[Reports] Bulk delete error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
