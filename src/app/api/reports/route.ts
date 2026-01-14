import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ReportService, toResponse, Errors } from '@/services';

// GET - List all reports (or grouped view)
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
    const grouped = searchParams.get('grouped') === 'true';
    const origin = searchParams.get('origin') || undefined;

    // If origin is specified, get reports for that origin
    if (origin) {
        const originLimit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const result = await ReportService.getReportsByOrigin(origin, archived, originLimit);
        return toResponse(result);
    }

    // If grouped mode, return grouped by origin
    if (grouped) {
        const result = await ReportService.getGroupedReports({ page, limit, archived });
        return toResponse(result);
    }

    const result = await ReportService.getReports({ page, limit, archived, search });
    return toResponse(result);
}
