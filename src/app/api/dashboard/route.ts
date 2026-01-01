import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

interface StatsResult {
    total_reports: string;
    unread_reports: string;
    reports_today: string;
    reports_this_week: string;
}

interface TimeSeriesRow {
    date: string;
    count: string;
}

interface TopOriginRow {
    origin: string;
    count: string;
}

interface RecentReport {
    id: string;
    origin: string;
    uri: string | null;
    ip: string | null;
    triggered_at: string;
    read: boolean;
}

// GET - Dashboard statistics (Optimized: 4 queries instead of 7)
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Combined stats query - single query for all counts
        const [stats] = await query<StatsResult>(`
            SELECT 
                COUNT(*) as total_reports,
                COUNT(*) FILTER (WHERE read = FALSE) as unread_reports,
                COUNT(*) FILTER (WHERE triggered_at >= CURRENT_DATE) as reports_today,
                COUNT(*) FILTER (WHERE triggered_at >= CURRENT_DATE - INTERVAL '7 days') as reports_this_week
            FROM reports
        `);

        // Run remaining queries in parallel
        const [reportsPerDay, topOrigins, recentReports] = await Promise.all([
            // Reports per day (last 14 days)
            query<TimeSeriesRow>(`
                SELECT TO_CHAR(DATE(triggered_at), 'YYYY-MM-DD') as date, COUNT(*) as count 
                FROM reports 
                WHERE triggered_at >= CURRENT_DATE - INTERVAL '14 days'
                GROUP BY DATE(triggered_at) 
                ORDER BY DATE(triggered_at) ASC
            `),
            
            // Top 5 origins
            query<TopOriginRow>(`
                SELECT origin, COUNT(*) as count 
                FROM reports 
                WHERE origin IS NOT NULL AND origin != ''
                GROUP BY origin 
                ORDER BY count DESC 
                LIMIT 5
            `),
            
            // Recent reports (last 5)
            query<RecentReport>(`
                SELECT id, origin, uri, ip, triggered_at, read
                FROM reports 
                ORDER BY triggered_at DESC 
                LIMIT 5
            `),
        ]);

        return NextResponse.json({
            stats: {
                totalReports: parseInt(stats?.total_reports || '0', 10),
                unreadReports: parseInt(stats?.unread_reports || '0', 10),
                reportsToday: parseInt(stats?.reports_today || '0', 10),
                reportsThisWeek: parseInt(stats?.reports_this_week || '0', 10),
            },
            charts: {
                reportsPerDay: reportsPerDay.map(row => ({
                    date: row.date,
                    count: parseInt(row.count, 10),
                })),
                topOrigins: topOrigins.map(row => ({
                    origin: row.origin,
                    count: parseInt(row.count, 10),
                })),
            },
            recentReports,
        });
    } catch (error) {
        console.error('[Dashboard] Stats error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
