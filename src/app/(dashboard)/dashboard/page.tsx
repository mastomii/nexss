'use client';

import Link from 'next/link';
import {
    Activity,
    Users,
    Folder,
    ArrowUpRight,
    Shield,
    RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/settings-context';
import useSWR from 'swr';
import { swrConfig } from '@/lib/swr';

// --- Types for Data (Matched to API) ---
interface DashboardData {
    stats: {
        totalReports: number;
        unreadReports: number;
        reportsToday: number;
        reportsThisWeek: number;
    };
    charts: {
        reportsPerDay: Array<{
            date: string;
            count: number;
        }>;
        topOrigins: Array<{
            origin: string;
            count: number;
        }>;
    };
    recentReports: Array<{
        id: string;
        origin: string;
        uri: string | null;
        ip: string | null;
        triggered_at: string;
        read: boolean;
    }>;
}

export default function DashboardPage() {
    const { formatDateTime } = useSettings();
    
    // Use SWR for data fetching with auto-refresh
    const { data, isLoading, isValidating } = useSWR<DashboardData>(
        '/api/dashboard',
        {
            ...swrConfig,
            refreshInterval: 30000, // Auto-refresh every 30 seconds
        }
    );

    const stats = [
        {
            label: "Total Reports",
            value: data?.stats?.totalReports ?? 0,
            change: "All Time",
            icon: Folder,
            iconBoxColor: "bg-[#1c2e26] text-[#34d399]"
        },
        {
            label: "Unread Reports",
            value: data?.stats?.unreadReports ?? 0,
            change: "Action Needed",
            icon: Activity,
            iconBoxColor: "bg-[#2e241d] text-[#fbbf24]"
        },
        {
            label: "Reports Today",
            value: data?.stats?.reportsToday ?? 0,
            change: "Last 24h",
            icon: Activity,
            iconBoxColor: "bg-[#1d283a] text-[#60a5fa]"
        },
        {
            label: "Reports This Week",
            value: data?.stats?.reportsThisWeek ?? 0,
            change: "Last 7 Days",
            icon: Users,
            iconBoxColor: "bg-[#251e36] text-[#a78bfa]"
        }
    ];

    // Get last 7 days of data from API
    const getChartData = () => {
        const reportsPerDay = data?.charts?.reportsPerDay || [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        // Create map of date to count - normalize date strings
        const dataMap = new Map<string, number>();
        reportsPerDay.forEach(item => {
            // Handle various date formats from PostgreSQL
            let dateKey = String(item.date);
            if (dateKey.includes('T')) {
                dateKey = dateKey.split('T')[0];
            }
            dataMap.set(dateKey, item.count);
        });
        
        // Generate last 7 days
        const points = [];
        let maxCount = 0;
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            // Use local date to avoid timezone issues
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            // Try to find matching data
            let count = dataMap.get(dateStr) || 0;
            
            // If no match found, iterate through dataMap to find any matching date
            if (count === 0 && dataMap.size > 0) {
                dataMap.forEach((val, key) => {
                    if (key === dateStr || key.startsWith(dateStr)) {
                        count = val;
                    }
                });
            }
            
            if (count > maxCount) maxCount = count;
            
            points.push({
                day: dayNames[date.getDay()],
                date: dateStr,
                count
            });
        }
        
        // Ensure maxCount is at least 1 for percentage calculation
        if (maxCount === 0) maxCount = 1;
        
        return { points, maxCount };
    };

    const chartData = getChartData();

    return (
        <div className="space-y-5 pb-8">
            {/* Refresh indicator */}
            {isValidating && !isLoading && (
                <div className="fixed top-4 right-4 z-50 bg-[#18181c] border border-[#27272a] rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Refreshing...
                </div>
            )}
            
            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <div key={i} className="bg-[#18181c] p-4 rounded-2xl flex flex-col justify-between h-[110px] relative overflow-hidden group hover:bg-[#1e1e24] transition-colors border border-[#27272a]">
                            {/* Header */}
                            <div className="flex justify-between items-start z-10">
                                <div>
                                    <p className="text-muted-foreground text-xs font-medium mb-1">{stat.label}</p>
                        <h3 className="text-2xl font-bold text-white">{isLoading ? '-' : stat.value}</h3>
                                </div>
                                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", stat.iconBoxColor)}>
                                    <Icon className="h-4 w-4" />
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center gap-1.5 mt-auto z-10">
                                <ArrowUpRight className="h-3 w-3 text-[#34d399]" />
                                <span className="text-[#34d399] text-xs font-medium">{stat.change}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main Chart: Reports Activity - Bar Chart */}
                <div className="lg:col-span-2 bg-[#18181c] p-4 rounded-lg relative border border-[#27272a]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-white">Reports Activity (Last 7 Days)</h3>
                        <div className="flex items-center gap-3 text-xs font-medium">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#34d399]"></div> <span className="text-muted-foreground text-xs">Reports</span></div>
                        </div>
                    </div>

                    {/* Bar Chart */}
                    <div className="h-[160px] w-full flex flex-col">
                        {/* Y-axis labels and chart area */}
                        <div className="flex-1 flex">
                            {/* Y-axis */}
                            <div className="w-8 flex flex-col justify-between text-xs text-muted-foreground/60 font-mono pr-1 py-1">
                                <span>{chartData.maxCount}</span>
                                <span>{Math.round(chartData.maxCount / 2)}</span>
                                <span>0</span>
                            </div>
                            
                            {/* Bars container */}
                            <div className="flex-1 flex items-end justify-around gap-1.5 border-l border-b border-[#3f3f46] pl-1.5 pb-1.5">
                                {chartData.points.map((point, idx) => {
                                    const heightPercent = chartData.maxCount > 0 
                                        ? Math.max((point.count / chartData.maxCount) * 100, point.count > 0 ? 15 : 3) 
                                        : 3;
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                                            {/* Bar with tooltip */}
                                            <div className="relative w-full flex justify-center h-full items-end">
                                                {point.count > 0 && (
                                                    <div className="absolute -top-5 opacity-0 group-hover:opacity-100 transition-opacity bg-[#27272a] text-white text-xs px-2 py-0.5 rounded whitespace-nowrap z-10">
                                                        {point.count}
                                                    </div>
                                                )}
                                                <div 
                                                    style={{ height: `${heightPercent}%`, minHeight: point.count > 0 ? '16px' : '3px' }} 
                                                    className={cn(
                                                        "w-5 sm:w-8 rounded-t transition-all duration-300",
                                                        point.count > 0 
                                                            ? "bg-gradient-to-t from-[#34d399] to-[#6ee7b7] group-hover:from-[#6ee7b7] group-hover:to-[#a7f3d0]" 
                                                            : "bg-[#3f3f46]"
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        
                        {/* X-axis labels */}
                        <div className="flex ml-6 mt-1.5">
                            <div className="flex-1 flex justify-around">
                                {chartData.points.map((point, idx) => (
                                    <span key={idx} className="text-xs text-muted-foreground font-medium">{point.day}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Chart: Top Origins */}
                <div className="bg-[#18181c] p-4 rounded-lg flex flex-col border border-[#27272a]">
                    <h3 className="text-sm font-semibold text-white mb-4">Top Origins</h3>

                    <div className="flex-1 flex items-center justify-center relative my-2">
                        {/* CSS Doughnut Chart - Based on actual data */}
                        <div className="relative w-36 h-36">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="72" cy="72" r="60" stroke="#1f2937" strokeWidth="10" fill="none" />
                                {data?.charts?.topOrigins && data.charts.topOrigins.length > 0 ? (
                                    <>
                                        <circle cx="72" cy="72" r="60" stroke="#3b82f6" strokeWidth="10" fill="none" strokeDasharray="376" strokeDashoffset="75" strokeLinecap="round" />
                                        <circle cx="72" cy="72" r="45" stroke="#f97316" strokeWidth="10" fill="none" strokeDasharray="282" strokeDashoffset="112" strokeLinecap="round" />
                                    </>
                                ) : (
                                    <circle cx="72" cy="72" r="60" stroke="#27272a" strokeWidth="10" fill="none" />
                                )}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-xl font-bold text-white">{data?.stats?.totalReports || 0}</span>
                                <span className="text-xs text-muted-foreground">Total Reports</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 space-y-2">
                        {data?.charts?.topOrigins && data.charts.topOrigins.length > 0 ? (
                            data.charts.topOrigins.slice(0, 3).map((origin, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-blue-500' : idx === 1 ? 'bg-orange-500' : 'bg-emerald-500'}`}></div>
                                        <span className="text-muted-foreground truncate max-w-[120px]">{origin.origin}</span>
                                    </div>
                                    <span className="text-white font-mono">{origin.count}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-muted-foreground text-sm py-4">No data yet</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Table: Recent Reports */}
            <div className="bg-[#18181c] rounded-lg overflow-hidden p-4 border border-[#27272a]">
                {/* Table Header */}
                <div className="grid grid-cols-[60px_1fr_120px_80px_130px] gap-4 mb-4 px-3">
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">ID</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">Origin</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold hidden sm:block">IP Address</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">Status</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">Date</span>
                </div>

                <div className="space-y-1.5">
                    {(data?.recentReports || []).length > 0 ? (
                        data!.recentReports.map((report, idx) => (
                            <Link key={report.id} href={`/reports/${report.id}`} className="grid grid-cols-[60px_1fr_120px_80px_130px] gap-4 py-2.5 px-3 hover:bg-white/5 rounded transition-colors items-center">
                                <span className="text-white/30 text-sm font-mono">#{idx + 1}</span>
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <div className="h-7 w-7 rounded min-w-[28px] bg-[#1c2e26] flex items-center justify-center text-[#34d399]">
                                        <Shield className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="flex flex-col truncate">
                                        <span className="text-white font-medium truncate text-sm">{report.origin || 'Unknown Origin'}</span>
                                        <span className="text-xs text-muted-foreground truncate">{report.uri}</span>
                                    </div>
                                </div>
                                <span className="text-white/70 text-sm hidden sm:block truncate font-mono">{report.ip || '-'}</span>
                                <div>
                                    {!report.read ? (
                                        <span className="px-2 py-0.5 rounded bg-[#1c2e26] text-[#34d399] text-xs font-medium">New</span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded bg-[#141417] border border-white/5 text-muted-foreground text-xs font-medium">Viewed</span>
                                    )}
                                </div>
                                <span className="text-white/50 text-sm font-mono whitespace-nowrap">{formatDateTime(report.triggered_at)}</span>
                            </Link>
                        ))
                    ) : (
                        <div className="py-6 text-center text-muted-foreground/30 text-sm">No recent reports</div>
                    )}
                </div>
            </div>
        </div>
    );
}
