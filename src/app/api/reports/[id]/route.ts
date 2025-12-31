import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, Report, ReportData } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { decompressString } from '@/lib/utils';
import { getObjectStorageConfig, deleteFromStorage, extractKeyFromUrl } from '@/lib/object-storage';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

interface FullReport extends Report {
    data?: ReportData | null;
}

// GET - Get single report with full data
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        // Auth check required
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const report = await queryOne<Report>(
            'SELECT * FROM reports WHERE id = $1',
            [id]
        );

        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        // Get report data
        let reportData = await queryOne<ReportData>(
            'SELECT * FROM reports_data WHERE report_id = $1',
            [report.id]
        );

        // Decompress DOM if needed
        if (reportData && reportData.compressed && reportData.dom) {
            try {
                reportData = {
                    ...reportData,
                    dom: await decompressString(reportData.dom),
                };
            } catch {
                // Keep compressed if decompression fails
            }
        }

        // Mark as read if not already
        if (!report.read) {
            await query('UPDATE reports SET read = TRUE WHERE id = $1', [report.id]);
        }

        const fullReport: FullReport = {
            ...report,
            data: reportData,
        };

        return NextResponse.json({ report: fullReport });
    } catch (error) {
        console.error('[Reports] Get error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// DELETE - Delete report
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const report = await queryOne<Report>(
            'SELECT * FROM reports WHERE id = $1',
            [id]
        );

        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        // Get report data to check for screenshot file
        const reportData = await queryOne<ReportData>(
            'SELECT screenshot, screenshot_storage FROM reports_data WHERE report_id = $1',
            [id]
        );

        // Delete screenshot file if stored locally
        if (reportData?.screenshot_storage === 'local' && reportData?.screenshot) {
            try {
                // Screenshot path stored as /screenshots/filename.png, file is in data/screenshots/
                const filename = reportData.screenshot.replace('/screenshots/', '');
                const filePath = join(process.cwd(), 'data', 'screenshots', filename);
                if (existsSync(filePath)) {
                    await unlink(filePath);
                }
            } catch (err) {
                console.error('[NeXSS] Failed to delete local screenshot file:', err);
            }
        }

        // Delete from object storage if stored there
        if (reportData?.screenshot_storage === 's3' && reportData?.screenshot) {
            try {
                const config = await getObjectStorageConfig();
                if (config.enabled) {
                    const key = extractKeyFromUrl(reportData.screenshot);
                    if (key) {
                        await deleteFromStorage(config, key);
                    }
                }
            } catch (err) {
                console.error('[NeXSS] Failed to delete screenshot from object storage:', err);
            }
        }

        // Delete report (cascade will handle reports_data)
        await query('DELETE FROM reports WHERE id = $1', [id]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Reports] Delete error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// PATCH - Archive/unarchive report
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { archived } = body;

        if (typeof archived !== 'boolean') {
            return NextResponse.json(
                { error: 'Invalid archived value' },
                { status: 400 }
            );
        }

        const result = await query<Report>(
            'UPDATE reports SET archived = $2 WHERE id = $1 RETURNING *',
            [id, archived]
        );

        if (result.length === 0) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        return NextResponse.json({ report: result[0] });
    } catch (error) {
        console.error('[Reports] Archive error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
