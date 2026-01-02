import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ReportService, toResponse, Errors } from '@/services';

// GET - List all reports
export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return toResponse(Errors.unauthorized());
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const archived = searchParams.get('archived') === 'true';
    const search = searchParams.get('search') || undefined;

    const result = await ReportService.getReports({ page, limit, archived, search });
    return toResponse(result);
}
