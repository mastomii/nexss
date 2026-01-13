'use client';

import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiPut } from '@/lib/api-client';

// Lazy load SyntaxHighlighter - it's a heavy component
const SyntaxHighlighter = lazy(() => 
    import('react-syntax-highlighter').then(mod => ({ default: mod.Prism }))
);
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import {
    ArrowLeft,
    Loader2,
    Globe,
    Clock,
    Monitor,
    MapPin,
    Cookie,
    Database,
    FileCode,
    Image as ImageIcon,
    Copy,
    Check,
    Wifi,
    WifiOff,
    Send,
    Terminal,
    ExternalLink,
    Wand2,
    FileText,
    Shield,
    ShieldOff,
    Radio,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    ChevronsDown,
    ChevronsUp,
    Ban,
    AlertTriangle,
    Network
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/settings-context';
import { Badge } from '@/components/ui/badge';

type TabType = 'storage' | 'dom' | 'persist' | 'traffic' | 'enumeration';

interface ReportData {
    id: string;
    report_id: string;
    dom: string | null;
    screenshot: string | null;
    screenshot_storage: string | null;
    screenshot_error: string | null;
    localstorage: string | null;
    sessionstorage: string | null;
}

interface FullReport {
    id: string;
    uri: string | null;
    origin: string | null;
    referer: string | null;
    user_agent: string | null;
    ip: string | null;
    triggered_at: string;
    cookies: string | null;
    data?: ReportData | null;
}

interface SessionStatus {
    connected: boolean;
    lastSeen?: string;
    diffSeconds?: number;
    lastResponse?: string | null;
    lastResponseAt?: string | null;
    encrypted?: boolean;
    sessionStatus?: string | null;
    terminated?: boolean;
    popupBlocked?: boolean;
}

interface TrafficItem {
    id: string;
    report_id: string;
    traffic_type: string;
    method: string | null;
    url: string | null;
    request_headers: string | null;
    request_body: string | null;
    response_headers: string | null;
    response_body: string | null;
    status_code: number | null;
    captured_at: string;
}

interface EnumerationResult {
    id: string;
    report_id: string;
    path: string;
    description: string | null;
    status_code: number | null;
    response_size: number | null;
    response_body: string | null;
    response_headers: string | null;
    error_message: string | null;
    fetched_at: string;
}

export default function ReportDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { formatDateTime } = useSettings();
    const [report, setReport] = useState<FullReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('storage');

    // Persist state
    const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
    const [command, setCommand] = useState('');
    const [sending, setSending] = useState(false);
    const [cmdResult, setCmdResult] = useState<{ success: boolean; message: string } | null>(null);

    // Traffic state
    const [trafficData, setTrafficData] = useState<TrafficItem[]>([]);
    const [trafficLoading, setTrafficLoading] = useState(false);
    const [expandedTraffic, setExpandedTraffic] = useState<Set<string>>(new Set());
    const [trafficPage, setTrafficPage] = useState(1);
    const trafficPerPage = 20;

    // Enumeration state
    const [enumData, setEnumData] = useState<EnumerationResult[]>([]);
    const [enumLoading, setEnumLoading] = useState(false);
    const [expandedEnum, setExpandedEnum] = useState<Set<string>>(new Set());
    const [enumBeautified, setEnumBeautified] = useState<Set<string>>(new Set());
    const [enumShowFull, setEnumShowFull] = useState<Set<string>>(new Set());
    const ENUM_PREVIEW_SIZE = 50000; // 50KB preview

    // Format seconds as human-readable relative time
    const formatRelativeTime = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            return `${mins}m ago`;
        }
        if (seconds < 86400) {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
        }
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        return hours > 0 ? `${days}d ${hours}h ago` : `${days}d ago`;
    };

    const toggleTrafficExpand = (id: string) => {
        setExpandedTraffic(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const expandAllTraffic = () => {
        const allIds = paginatedTraffic
            .filter(item => item.request_headers || item.request_body || item.response_headers || item.response_body)
            .map(item => item.id);
        setExpandedTraffic(new Set(allIds));
    };

    const collapseAllTraffic = () => {
        setExpandedTraffic(new Set());
    };

    const toggleEnumExpand = (id: string) => {
        setExpandedEnum(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleEnumBeautify = (id: string) => {
        setEnumBeautified(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleEnumShowFull = (id: string) => {
        setEnumShowFull(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Beautify JSON
    const beautifyJson = (str: string): string => {
        try {
            return JSON.stringify(JSON.parse(str), null, 2);
        } catch {
            return str;
        }
    };

    // Detect content type and get syntax language
    const detectLanguage = (content: string): string => {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                JSON.parse(trimmed);
                return 'json';
            } catch {
                // Not valid JSON
            }
        }
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
            return 'html';
        }
        return 'text';
    };

    // Process enum response body with beautify and truncation
    const processEnumBody = (item: EnumerationResult): { content: string; isTruncated: boolean; language: string } => {
        const body = item.response_body || '';
        const isBeautified = enumBeautified.has(item.id);
        const showFull = enumShowFull.has(item.id);
        const language = detectLanguage(body);
        
        let processed = body;
        
        // Apply beautify first
        if (isBeautified) {
            if (language === 'json') {
                processed = beautifyJson(body);
            } else if (language === 'html') {
                processed = beautifyHtml(body);
            }
        }
        
        // Then truncate if needed
        const needsTruncation = processed.length > ENUM_PREVIEW_SIZE && !showFull;
        if (needsTruncation) {
            processed = processed.substring(0, ENUM_PREVIEW_SIZE);
        }
        
        return { content: processed, isTruncated: needsTruncation, language };
    };

    // Format size for display
    const formatSize = (size: number): string => {
        if (size > 1000000) return `${(size / 1000000).toFixed(2)} MB`;
        if (size > 1000) return `${(size / 1000).toFixed(1)} KB`;
        return `${size} B`;
    };

    // Paginated traffic data
    const paginatedTraffic = useMemo(() => {
        const start = (trafficPage - 1) * trafficPerPage;
        const end = start + trafficPerPage;
        return trafficData.slice(start, end);
    }, [trafficData, trafficPage]);

    const totalTrafficPages = Math.ceil(trafficData.length / trafficPerPage);

    const checkSessionStatus = useCallback(async () => {
        if (!params.id) return;
        try {
            const res = await fetch(`/api/persist?report_id=${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setSessionStatus(data);
            }
        } catch (error) {
            console.error('Failed to check session:', error);
        }
    }, [params.id]);

    const fetchTrafficData = useCallback(async () => {
        if (!params.id) return;
        try {
            setTrafficLoading(true);
            const res = await fetch(`/api/traffic?report_id=${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setTrafficData(data.traffic || []);
            }
        } catch (error) {
            console.error('Failed to fetch traffic:', error);
        } finally {
            setTrafficLoading(false);
        }
    }, [params.id]);

    const fetchEnumData = useCallback(async () => {
        if (!params.id) return;
        try {
            setEnumLoading(true);
            const res = await fetch(`/api/reports/${params.id}/enumeration`);
            if (res.ok) {
                const data = await res.json();
                setEnumData(data || []);
            }
        } catch (error) {
            console.error('Failed to fetch enumeration data:', error);
        } finally {
            setEnumLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        const fetchReport = async () => {
            try {
                const res = await fetch(`/api/reports/${params.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setReport(data.report);
                } else if (res.status === 404) {
                    router.push('/reports');
                }
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
        checkSessionStatus();
        fetchTrafficData();
        fetchEnumData();
    }, [params.id, router, checkSessionStatus, fetchTrafficData, fetchEnumData]);

    // Separate effect for polling - properly handles cleanup and termination
    useEffect(() => {
        // Don't start polling if session is already terminated
        if (sessionStatus?.terminated) {
            return;
        }

        const interval = setInterval(() => {
            checkSessionStatus();
            fetchTrafficData();
        }, 5000);

        return () => clearInterval(interval);
    }, [checkSessionStatus, fetchTrafficData, sessionStatus?.terminated]);

    const copyToClipboard = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
        toast.success('Copied to clipboard');
    };

    const formatJson = (str: string | null) => {
        if (!str) return null;
        try {
            return JSON.stringify(JSON.parse(str), null, 2);
        } catch {
            return str;
        }
    };

    // Beautify HTML with proper indentation
    const beautifyHtml = (html: string): string => {
        let formatted = '';
        let indent = 0;
        const tab = '  ';

        // Simple tokenizer
        const tokens = html.replace(/>\s*</g, '>\n<').split('\n');

        tokens.forEach(token => {
            token = token.trim();
            if (!token) return;

            // Check if it's a closing tag
            if (token.match(/^<\/\w/)) {
                indent = Math.max(0, indent - 1);
            }

            formatted += tab.repeat(indent) + token + '\n';

            // Check if it's an opening tag (not self-closing, not closing)
            if (token.match(/^<\w[^>]*[^\/]>$/) && !token.match(/^<(br|hr|img|input|meta|link)/i)) {
                indent++;
            }
        });

        return formatted.trim();
    };

    const [isBeautified, setIsBeautified] = useState(false);
    const [showFullDom, setShowFullDom] = useState(false);
    const DOM_PREVIEW_SIZE = 100000; // 100KB preview

    const processedDom = useMemo(() => {
        if (!report?.data?.dom) return '';
        const dom = report.data.dom;
        const needsTruncation = dom.length > DOM_PREVIEW_SIZE && !showFullDom;
        const displayDom = needsTruncation ? dom.substring(0, DOM_PREVIEW_SIZE) : dom;
        return isBeautified ? beautifyHtml(displayDom) : displayDom;
    }, [report?.data?.dom, isBeautified, showFullDom]);

    const isDomTruncated = useMemo(() => {
        return (report?.data?.dom?.length || 0) > DOM_PREVIEW_SIZE && !showFullDom;
    }, [report?.data?.dom, showFullDom]);

    const domSizeInfo = useMemo(() => {
        const size = report?.data?.dom?.length || 0;
        if (size > 1000000) return `${(size / 1000000).toFixed(2)} MB`;
        if (size > 1000) return `${(size / 1000).toFixed(1)} KB`;
        return `${size} bytes`;
    }, [report?.data?.dom]);

    const sendCommand = async () => {
        if (!command || !params.id) return;

        setSending(true);
        setCmdResult(null);

        try {
            const res = await apiPut('/api/persist', { report_id: params.id, command });

            const data = await res.json();

            if (res.ok) {
                setCmdResult({ success: true, message: 'Command sent! Will execute on next poll.' });
                setCommand('');
            } else {
                setCmdResult({ success: false, message: data.error || 'Failed to send command' });
            }
        } catch {
            setCmdResult({ success: false, message: 'Network error' });
        } finally {
            setSending(false);
        }
    };

    const presetCommands = [
        { name: 'Alert', cmd: 'alert("XSS")' },
        { name: 'Cookies', cmd: 'alert(document.cookie)' },
        { name: 'Grab DOM', cmd: 'document.documentElement.outerHTML' },
        { name: 'Get URL', cmd: 'window.location.href' },
        { name: 'Get Title', cmd: 'document.title' },
        { name: 'Redirect', cmd: 'location.href="https://example.com"' },
    ];

    // Helper to get screenshot URL - all requests go through API for security
    const getScreenshotUrl = (screenshot: string, storage: string | null): string => {
        // If data URL, use directly
        if (screenshot.startsWith('data:')) {
            return screenshot;
        }
        // If stored in object storage (s3), route through API with storage hint
        if (storage === 's3') {
            // Extract filename from URL or path
            const filename = screenshot.includes('/')
                ? screenshot.split('/').pop()
                : screenshot;
            return `/api/screenshots/${filename}?storage=s3`;
        }
        // If local storage path, use API route
        if (screenshot.startsWith('/screenshots/')) {
            const filename = screenshot.replace('/screenshots/', '');
            return `/api/screenshots/${filename}`;
        }
        // Legacy base64
        return `data:image/png;base64,${screenshot}`;
    };

    const openScreenshotFullscreen = () => {
        if (report?.data?.screenshot) {
            const imgSrc = getScreenshotUrl(report.data.screenshot, report.data.screenshot_storage);
            window.open(imgSrc, '_blank');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (!report) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Report not found</p>
            </div>
        );
    }

    const tabs = [
        { id: 'storage' as TabType, label: 'Storage', icon: Database, show: !!(report.cookies || report.data?.localstorage || report.data?.sessionstorage) },
        { id: 'dom' as TabType, label: 'DOM', icon: FileCode, show: !!report.data?.dom },
        { id: 'enumeration' as TabType, label: 'Enumeration', icon: Network, show: true, count: enumData.length },
        { id: 'persist' as TabType, label: 'Persistent Mode', icon: Terminal, show: true },
        { id: 'traffic' as TabType, label: 'Traffic', icon: Radio, show: true, count: trafficData.length },
    ].filter(t => t.show);

    const detailItems = [
        { icon: Globe, label: 'Origin', value: report.origin },
        { icon: Globe, label: 'Full URL', value: report.uri },
        { icon: Globe, label: 'Referer', value: report.referer },
        { icon: Clock, label: 'Triggered', value: formatDateTime(report.triggered_at) },
        { icon: MapPin, label: 'IP Address', value: report.ip },
        { icon: Monitor, label: 'User Agent', value: report.user_agent },
    ];

    return (
        <div className="space-y-4 animate-fade-in max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        href="/reports"
                        className="p-2 rounded hover:bg-[#18181c] text-muted-foreground hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{report.origin || 'Unknown'}</h1>
                        <p className="text-muted-foreground text-sm truncate max-w-lg">
                            {report.uri || 'No URI'}
                        </p>
                    </div>
                </div>

                {/* Connection Status */}
                <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
                    sessionStatus?.terminated
                        ? 'bg-red-500/20 border border-red-500/30'
                        : sessionStatus?.popupBlocked
                            ? 'bg-amber-500/20 border border-amber-500/30'
                            : sessionStatus?.connected
                                ? 'bg-emerald-500/20 border border-emerald-500/30'
                                : 'bg-[#18181c] border border-[#27272a]'
                )}>
                    {sessionStatus?.terminated ? (
                        <>
                            <Ban className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-red-400 font-medium">Terminated</span>
                        </>
                    ) : sessionStatus?.popupBlocked ? (
                        <>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-amber-400 font-medium">Popup Blocked</span>
                        </>
                    ) : sessionStatus?.connected ? (
                        <>
                            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                            <span className="text-emerald-400 font-medium">Connected</span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Disconnected</span>
                        </>
                    )}
                </div>
            </div>

            {/* Top Section: Details + Screenshot */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Details Card */}
                <div className="bg-[#18181c] rounded-lg border border-[#27272a] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#27272a]">
                        <h3 className="text-sm font-medium text-white">Report Details</h3>
                    </div>
                    <div className="divide-y divide-[#27272a]">
                        {detailItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.label} className="px-4 py-2.5 flex items-start gap-3">
                                    <div className="p-1.5 rounded bg-[#27272a]">
                                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground">{item.label}</p>
                                        <p className="text-white text-xs mt-0.5 break-all truncate font-mono">{item.value || 'N/A'}</p>
                                    </div>
                                    {item.value && (
                                        <button
                                            onClick={() => copyToClipboard(item.value!, item.label)}
                                            className="p-1.5 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                        >
                                            {copied === item.label ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Screenshot Card */}
                <div className="bg-[#18181c] rounded-lg border border-[#27272a] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#27272a] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            <h3 className="text-sm font-medium text-white">Screenshot</h3>
                        </div>
                        {report.data?.screenshot && (
                            <button
                                onClick={openScreenshotFullscreen}
                                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-white hover:bg-[#27272a] transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open Full
                            </button>
                        )}
                    </div>
                    <div className="p-4">
                        {report.data?.screenshot ? (
                            <div
                                className="rounded border border-[#27272a] bg-[#09090b] overflow-hidden cursor-pointer hover:border-[#3f3f46] transition-colors"
                                onClick={openScreenshotFullscreen}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={getScreenshotUrl(report.data.screenshot, report.data.screenshot_storage)}
                                    alt="Page screenshot"
                                    className="w-full h-auto max-h-[300px] object-contain"
                                />
                            </div>
                        ) : report.data?.screenshot_error ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <ImageIcon className="w-10 h-10 mb-2 opacity-30 text-red-500" />
                                <p className="text-sm text-red-400">Screenshot capture failed</p>
                                <p className="text-xs mt-1 text-zinc-500">{report.data.screenshot_error}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <ImageIcon className="w-10 h-10 mb-2 opacity-30" />
                                <p className="text-sm">No screenshot available</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs Section */}
            {tabs.length > 0 && (
                <>
                    <div className="flex space-x-0.5 rounded bg-[#18181c] p-0.5 w-fit border border-[#27272a]">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all",
                                        activeTab === tab.id
                                            ? "bg-[#27272a] text-white shadow-sm"
                                            : "text-muted-foreground hover:text-white"
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                    {tab.id === 'persist' && sessionStatus?.connected && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    )}
                                    {tab.id === 'traffic' && 'count' in tab && (
                                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-amber-500/20 text-amber-400 border-none">
                                            {tab.count}
                                        </Badge>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tab Content */}
                    <div className="bg-[#18181c] rounded-lg border border-[#27272a] overflow-hidden">
                        {/* Storage Tab */}
                        {activeTab === 'storage' && (
                            <div className="p-4 space-y-4">
                                {report.cookies && (
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <Cookie className="w-4 h-4 text-orange-400" />
                                            <h3 className="font-medium text-white text-sm">Cookies</h3>
                                        </div>
                                        <pre className="p-3 rounded bg-[#09090b] text-sm text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                                            {report.cookies}
                                        </pre>
                                    </div>
                                )}
                                {report.data?.localstorage && (
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <Database className="w-4 h-4 text-blue-400" />
                                            <h3 className="font-medium text-white text-sm">LocalStorage</h3>
                                        </div>
                                        <pre className="p-3 rounded bg-[#09090b] text-sm text-emerald-400 font-mono overflow-x-auto max-h-40">
                                            {formatJson(report.data.localstorage)}
                                        </pre>
                                    </div>
                                )}
                                {report.data?.sessionstorage && (
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <Database className="w-4 h-4 text-purple-400" />
                                            <h3 className="font-medium text-white text-sm">SessionStorage</h3>
                                        </div>
                                        <pre className="p-3 rounded bg-[#09090b] text-sm text-emerald-400 font-mono overflow-x-auto max-h-40">
                                            {formatJson(report.data.sessionstorage)}
                                        </pre>
                                    </div>
                                )}
                                {!report.cookies && !report.data?.localstorage && !report.data?.sessionstorage && (
                                    <div className="py-8 text-center text-muted-foreground text-sm">
                                        No storage data available
                                    </div>
                                )}
                            </div>
                        )}

                        {/* DOM Tab */}
                        {activeTab === 'dom' && report.data?.dom && (
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <FileCode className="w-4 h-4 text-cyan-400" />
                                        <h3 className="font-medium text-white text-sm">DOM HTML</h3>
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                                            {domSizeInfo}
                                        </span>
                                        {isDomTruncated && (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                                Preview (100 KB)
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {isDomTruncated && (
                                            <button
                                                onClick={() => setShowFullDom(true)}
                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                                            >
                                                <FileCode className="w-3.5 h-3.5" />
                                                Load Full DOM
                                            </button>
                                        )}
                                        {showFullDom && (report.data.dom.length > DOM_PREVIEW_SIZE) && (
                                            <button
                                                onClick={() => setShowFullDom(false)}
                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 transition-colors"
                                            >
                                                Show Preview
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setIsBeautified(!isBeautified)}
                                            className={cn(
                                                "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors",
                                                isBeautified
                                                    ? "bg-cyan-500/20 text-cyan-400"
                                                    : "bg-[#27272a] text-muted-foreground hover:text-white"
                                            )}
                                        >
                                            <Wand2 className="w-3.5 h-3.5" />
                                            Beautify
                                        </button>
                                        <button
                                            onClick={() => copyToClipboard(report.data?.dom || '', 'dom')}
                                            title="Copy full DOM"
                                            className="p-1.5 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                        >
                                            {copied === 'dom' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="rounded overflow-hidden border border-[#27272a]">
                                    <Suspense fallback={
                                        <div className="p-4 bg-[#09090b] text-muted-foreground text-sm flex items-center justify-center">
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Loading syntax highlighter...
                                        </div>
                                    }>
                                        <SyntaxHighlighter
                                            language="html"
                                            style={vscDarkPlus}
                                            showLineNumbers
                                            wrapLongLines
                                            customStyle={{
                                                margin: 0,
                                                padding: '12px',
                                                fontSize: '13px',
                                                maxHeight: '400px',
                                                background: '#09090b',
                                            }}
                                            lineNumberStyle={{
                                                minWidth: '40px',
                                                paddingRight: '16px',
                                                color: '#525252',
                                                borderRight: '1px solid #27272a',
                                                marginRight: '12px',
                                            }}
                                        >
                                            {processedDom}
                                        </SyntaxHighlighter>
                                    </Suspense>
                                    {isDomTruncated && (
                                        <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center">
                                            Showing first 100 KB of {domSizeInfo}. Click &quot;Load Full DOM&quot; to view complete content.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Persist Tab */}
                        {activeTab === 'persist' && (
                            <div className="p-4 space-y-4">
                                {/* Connection Status */}
                                <div className={cn(
                                    "p-3 rounded flex items-center justify-between",
                                    sessionStatus?.connected
                                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                                        : 'bg-[#09090b] border border-[#27272a]'
                                )}>
                                    <div className="flex items-center gap-3">
                                        {sessionStatus?.connected ? (
                                            <>
                                                <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
                                                <div>
                                                    <p className="text-emerald-400 font-medium text-sm">Session Active</p>
                                                    <p className="text-emerald-400/70 text-xs">Last seen {formatRelativeTime(sessionStatus.diffSeconds || 0)}</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <WifiOff className="w-4 h-4 text-muted-foreground" />
                                                <div>
                                                    <p className="text-muted-foreground font-medium text-sm">No Active Session</p>
                                                    <p className="text-muted-foreground text-xs">
                                                        {sessionStatus?.lastSeen
                                                            ? `Last seen ${formatRelativeTime(sessionStatus.diffSeconds || 0)}`
                                                            : 'Victim browser has not connected'}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {/* Encryption Badge */}
                                    <div className={cn(
                                        "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                                        sessionStatus?.encrypted
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-amber-500/10 text-amber-400'
                                    )}>
                                        {sessionStatus?.encrypted ? (
                                            <>
                                                <Shield className="w-3.5 h-3.5" />
                                                <span>AES-256 Encrypted</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldOff className="w-3.5 h-3.5" />
                                                <span>Unencrypted</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Command Input */}
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                        JavaScript Command
                                    </label>
                                    <textarea
                                        value={command}
                                        onChange={(e) => setCommand(e.target.value)}
                                        placeholder={sessionStatus?.connected ? 'alert("XSS")' : 'Session not connected...'}
                                        disabled={!sessionStatus?.connected}
                                        rows={2}
                                        className="w-full px-3 py-2 rounded bg-[#09090b] border border-[#27272a] text-white placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono text-sm resize-none disabled:opacity-50"
                                    />
                                </div>

                                {/* Quick Commands */}
                                <div className="flex flex-wrap gap-1.5">
                                    {presetCommands.map((preset) => (
                                        <button
                                            key={preset.name}
                                            onClick={() => setCommand(preset.cmd)}
                                            disabled={!sessionStatus?.connected}
                                            className="px-2.5 py-1 text-xs rounded bg-[#27272a] text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
                                        >
                                            {preset.name}
                                        </button>
                                    ))}
                                </div>

                                {/* Result */}
                                {cmdResult && (
                                    <div className={cn(
                                        "p-3 rounded text-sm",
                                        cmdResult.success
                                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                            : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                    )}>
                                        {cmdResult.message}
                                    </div>
                                )}

                                {/* Send Button */}
                                <button
                                    onClick={sendCommand}
                                    disabled={sending || !command || !sessionStatus?.connected}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {sending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Send Command
                                        </>
                                    )}
                                </button>

                                {/* Response Output */}
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <FileText className="w-4 h-4 text-cyan-400" />
                                            <h3 className="font-medium text-white text-sm">Command Response</h3>
                                            {sessionStatus?.lastResponse && (
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                                                    {(sessionStatus.lastResponse.length / 1024).toFixed(1)} KB
                                                </span>
                                            )}
                                        </div>
                                        {sessionStatus?.lastResponse && (
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-muted-foreground">
                                                    {sessionStatus.lastResponseAt && formatDateTime(sessionStatus.lastResponseAt)}
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(sessionStatus.lastResponse || '', 'response')}
                                                    className="p-1.5 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                                    title="Copy response"
                                                >
                                                    {copied === 'response' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="rounded border border-[#27272a] bg-[#09090b] overflow-hidden">
                                        {sessionStatus?.lastResponse ? (
                                            <pre className="p-3 text-sm text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
                                                {sessionStatus.lastResponse}
                                            </pre>
                                        ) : (
                                            <div className="p-6 text-center text-muted-foreground text-sm">
                                                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                                <p>No response yet</p>
                                                <p className="text-xs mt-1">Send a command that returns a value to see the response here</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Enumeration Tab */}
                        {activeTab === 'enumeration' && (
                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Network className="w-4 h-4 text-violet-500" />
                                        <h3 className="font-medium text-white text-sm">Path Enumeration Results</h3>
                                        <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-violet-500/10 text-violet-500 border-none">
                                            {enumData.length} paths tested
                                        </Badge>
                                    </div>
                                    {enumLoading && (
                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                    )}
                                </div>

                                {enumData.length === 0 ? (
                                    <div className="py-8 text-center text-muted-foreground text-sm">
                                        <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p>No enumeration results yet</p>
                                        <p className="text-xs mt-1">Configure paths in Payload settings to enumerate endpoints</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {enumData.map((item) => {
                                            const isExpanded = expandedEnum.has(item.id);
                                            const hasContent = item.response_body || item.response_headers || item.error_message;
                                            const isBeautified = enumBeautified.has(item.id);
                                            const { content: processedBody, isTruncated, language } = item.response_body 
                                                ? processEnumBody(item)
                                                : { content: '', isTruncated: false, language: 'text' };
                                            
                                            return (
                                                <div 
                                                    key={item.id}
                                                    className="rounded bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] transition-colors overflow-hidden"
                                                >
                                                    {/* Header */}
                                                    <div 
                                                        className={cn(
                                                            "p-3 flex items-center gap-2 cursor-pointer select-none",
                                                            hasContent && "hover:bg-[#18181c]"
                                                        )}
                                                        onClick={() => hasContent && toggleEnumExpand(item.id)}
                                                    >
                                                        {hasContent ? (
                                                            isExpanded ? (
                                                                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                            )
                                                        ) : (
                                                            <div className="w-4" />
                                                        )}
                                                        
                                                        {item.status_code !== null ? (
                                                            <Badge
                                                                variant="secondary"
                                                                className={cn(
                                                                    "h-5 px-1.5 text-xs border-none flex-shrink-0",
                                                                    item.status_code >= 200 && item.status_code < 300
                                                                        ? 'bg-emerald-500/20 text-emerald-400'
                                                                        : item.status_code >= 400
                                                                            ? 'bg-red-500/20 text-red-400'
                                                                            : 'bg-amber-500/20 text-amber-400'
                                                                )}
                                                            >
                                                                {item.status_code}
                                                            </Badge>
                                                        ) : item.error_message ? (
                                                            <Badge
                                                                variant="secondary"
                                                                className="h-5 px-1.5 text-xs border-none flex-shrink-0 bg-red-500/20 text-red-400"
                                                            >
                                                                Error
                                                            </Badge>
                                                        ) : (
                                                            <div className="w-12" />
                                                        )}
                                                        
                                                        {item.response_size !== null && (
                                                            <span className="text-xs text-muted-foreground flex-shrink-0">
                                                                {formatSize(item.response_size)}
                                                            </span>
                                                        )}
                                                        
                                                        <div className="flex-1 min-w-0">
                                                            <span className="text-sm font-mono text-white truncate block">
                                                                {item.path}
                                                            </span>
                                                            {item.description && (
                                                                <span className="text-xs text-muted-foreground truncate block">
                                                                    {item.description}
                                                                </span>
                                                            )}
                                                        </div>
                                                        
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyToClipboard(item.response_body || item.error_message || '', `enum-${item.id}`);
                                                            }}
                                                            className="p-1.5 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors flex-shrink-0"
                                                        >
                                                            {copied === `enum-${item.id}` ? (
                                                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                            ) : (
                                                                <Copy className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                    
                                                    {/* Expanded Content */}
                                                    {isExpanded && hasContent && (
                                                        <div className="border-t border-[#27272a] p-3 space-y-3 bg-[#0c0c0e]">
                                                            {item.error_message && (
                                                                <div>
                                                                    <span className="text-xs text-red-400 font-medium">Error</span>
                                                                    <pre className="mt-1 text-xs text-red-400 font-mono bg-black/30 p-2 rounded">
                                                                        {item.error_message}
                                                                    </pre>
                                                                </div>
                                                            )}
                                                            
                                                            {item.response_headers && (
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="text-xs text-muted-foreground font-medium">Response Headers</span>
                                                                        <button
                                                                            onClick={() => copyToClipboard(item.response_headers || '', `enum-headers-${item.id}`)}
                                                                            className="p-1 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                                                        >
                                                                            {copied === `enum-headers-${item.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                                        </button>
                                                                    </div>
                                                                    <pre className="text-xs text-cyan-400 font-mono bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                                                                        {item.response_headers}
                                                                    </pre>
                                                                </div>
                                                            )}
                                                            
                                                            {item.response_body && (
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs text-muted-foreground font-medium">Response Body</span>
                                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                                                                                {formatSize(item.response_body.length)}
                                                                            </span>
                                                                            {language !== 'text' && (
                                                                                <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 uppercase">
                                                                                    {language}
                                                                                </span>
                                                                            )}
                                                                            {isTruncated && (
                                                                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                                                                    Preview (50 KB)
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            {isTruncated && (
                                                                                <button
                                                                                    onClick={() => toggleEnumShowFull(item.id)}
                                                                                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                                                                                >
                                                                                    <FileCode className="w-3 h-3" />
                                                                                    Load Full
                                                                                </button>
                                                                            )}
                                                                            {enumShowFull.has(item.id) && item.response_body.length > ENUM_PREVIEW_SIZE && (
                                                                                <button
                                                                                    onClick={() => toggleEnumShowFull(item.id)}
                                                                                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 transition-colors"
                                                                                >
                                                                                    Show Preview
                                                                                </button>
                                                                            )}
                                                                            {(language === 'json' || language === 'html') && (
                                                                                <button
                                                                                    onClick={() => toggleEnumBeautify(item.id)}
                                                                                    className={cn(
                                                                                        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                                                                                        isBeautified
                                                                                            ? "bg-cyan-500/20 text-cyan-400"
                                                                                            : "bg-[#27272a] text-muted-foreground hover:text-white"
                                                                                    )}
                                                                                >
                                                                                    <Wand2 className="w-3 h-3" />
                                                                                    Beautify
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={() => copyToClipboard(item.response_body || '', `enum-body-${item.id}`)}
                                                                                className="p-1 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                                                            >
                                                                                {copied === `enum-body-${item.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded overflow-hidden border border-[#27272a]">
                                                                        <Suspense fallback={
                                                                            <div className="p-4 bg-[#09090b] text-muted-foreground text-sm flex items-center justify-center">
                                                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                                                Loading...
                                                                            </div>
                                                                        }>
                                                                            <SyntaxHighlighter
                                                                                language={language}
                                                                                style={vscDarkPlus}
                                                                                showLineNumbers
                                                                                wrapLongLines
                                                                                customStyle={{
                                                                                    margin: 0,
                                                                                    padding: '12px',
                                                                                    fontSize: '12px',
                                                                                    maxHeight: '400px',
                                                                                    background: '#09090b',
                                                                                }}
                                                                                lineNumberStyle={{
                                                                                    minWidth: '36px',
                                                                                    paddingRight: '12px',
                                                                                    color: '#525252',
                                                                                    borderRight: '1px solid #27272a',
                                                                                    marginRight: '12px',
                                                                                }}
                                                                            >
                                                                                {processedBody}
                                                                            </SyntaxHighlighter>
                                                                        </Suspense>
                                                                        {isTruncated && (
                                                                            <div className="p-2 bg-amber-500/10 border-t border-amber-500/20 text-amber-400 text-xs text-center">
                                                                                Showing first 50 KB of {formatSize(item.response_body.length)}. Click &quot;Load Full&quot; to view complete content.
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Traffic Tab */}
                        {activeTab === 'traffic' && (
                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Radio className="w-4 h-4 text-amber-400" />
                                        <h3 className="font-medium text-white text-sm">Intercepted Traffic</h3>
                                        <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-amber-500/10 text-amber-400 border-none">
                                            {trafficData.length} requests
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {trafficData.length > 0 && (
                                            <>
                                                <button
                                                    onClick={expandAllTraffic}
                                                    className="px-2 py-1 text-xs text-muted-foreground hover:text-white hover:bg-[#27272a] rounded transition-colors"
                                                    title="Expand all"
                                                >
                                                    <ChevronsDown className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={collapseAllTraffic}
                                                    className="px-2 py-1 text-xs text-muted-foreground hover:text-white hover:bg-[#27272a] rounded transition-colors"
                                                    title="Collapse all"
                                                >
                                                    <ChevronsUp className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        {trafficLoading && (
                                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                        )}
                                        {/* Session Status Badge */}
                                        {sessionStatus?.terminated && (
                                            <Badge variant="secondary" className="h-5 px-2 text-xs bg-red-500/10 text-red-400 border-none">
                                                <Ban className="w-3 h-3 mr-1" />
                                                Session Terminated
                                            </Badge>
                                        )}
                                        {sessionStatus?.popupBlocked && !sessionStatus?.terminated && (
                                            <Badge variant="secondary" className="h-5 px-2 text-xs bg-amber-500/10 text-amber-400 border-none">
                                                <AlertTriangle className="w-3 h-3 mr-1" />
                                                Popup Blocked
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {trafficData.length === 0 ? (
                                    <div className="py-8 text-center text-muted-foreground text-sm">
                                        <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p>No traffic captured yet</p>
                                        <p className="text-xs mt-1">Enable Traffic Interception mode to capture network requests</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            {paginatedTraffic.map((item) => {
                                                const isExpanded = expandedTraffic.has(item.id);
                                                const hasDetails = item.request_headers || item.request_body || item.response_headers || item.response_body;
                                                
                                                // Build full raw request
                                                const buildRawRequest = () => {
                                                    let raw = `${item.method || 'GET'} ${item.url || '/'} HTTP/1.1\r\n`;
                                                    if (item.request_headers) raw += item.request_headers;
                                                    if (item.request_body) raw += `\r\n${item.request_body}`;
                                                    return raw;
                                                };
                                                
                                                // Build full raw response
                                                const buildRawResponse = () => {
                                                    let raw = `HTTP/1.1 ${item.status_code || 200} OK\r\n`;
                                                    if (item.response_headers) raw += item.response_headers;
                                                    if (item.response_body) raw += `\r\n${item.response_body}`;
                                                    return raw;
                                                };
                                                
                                                return (
                                                    <div 
                                                        key={item.id} 
                                                        className="rounded bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] transition-colors overflow-hidden"
                                                    >
                                                        {/* Header - Clickable */}
                                                        <div 
                                                            className={cn(
                                                                "p-3 flex items-center gap-2 cursor-pointer select-none",
                                                                hasDetails && "hover:bg-[#18181c]"
                                                            )}
                                                            onClick={() => hasDetails && toggleTrafficExpand(item.id)}
                                                        >
                                                            {hasDetails ? (
                                                                isExpanded ? (
                                                                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                                ) : (
                                                                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                                )
                                                            ) : (
                                                                <div className="w-4" />
                                                            )}
                                                            
                                                            <Badge
                                                                variant="secondary"
                                                                className={cn(
                                                                    "h-5 px-1.5 text-xs border-none font-mono flex-shrink-0",
                                                                    item.method === 'POST' ? 'bg-amber-500/20 text-amber-400' :
                                                                    item.method === 'PUT' ? 'bg-blue-500/20 text-blue-400' :
                                                                    item.method === 'DELETE' ? 'bg-red-500/20 text-red-400' :
                                                                    item.method === 'PATCH' ? 'bg-purple-500/20 text-purple-400' :
                                                                    'bg-emerald-500/20 text-emerald-400'
                                                                )}
                                                            >
                                                                {item.method || 'GET'}
                                                            </Badge>
                                                            
                                                            {item.status_code && (
                                                                <Badge
                                                                    variant="secondary"
                                                                    className={cn(
                                                                        "h-5 px-1.5 text-xs border-none flex-shrink-0",
                                                                        item.status_code >= 200 && item.status_code < 300
                                                                            ? 'bg-emerald-500/20 text-emerald-400'
                                                                            : item.status_code >= 400
                                                                                ? 'bg-red-500/20 text-red-400'
                                                                                : 'bg-amber-500/20 text-amber-400'
                                                                    )}
                                                                >
                                                                    {item.status_code}
                                                                </Badge>
                                                            )}
                                                            
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-sm font-mono text-white truncate block" title={item.url || ''}>
                                                                    {item.url || 'Unknown URL'}
                                                                </span>
                                                            </div>
                                                            
                                                            <span className="text-xs text-muted-foreground flex-shrink-0">
                                                                {formatDateTime(item.captured_at)}
                                                            </span>
                                                        </div>
                                                        
                                                        {/* Expanded Details */}
                                                        {isExpanded && hasDetails && (
                                                            <div className="border-t border-[#27272a] p-3 space-y-3 bg-[#0c0c0e]">
                                                                {/* Full URL */}
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="text-xs text-muted-foreground font-medium">URL</span>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                copyToClipboard(item.url || '', `url-${item.id}`);
                                                                            }}
                                                                            className="p-1 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                                                        >
                                                                            {copied === `url-${item.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                                        </button>
                                                                    </div>
                                                                    <pre className="text-xs text-cyan-400 font-mono bg-black/30 p-2 rounded overflow-x-auto break-all whitespace-pre-wrap">
                                                                        {item.url}
                                                                    </pre>
                                                                </div>
                                                                
                                                                {/* Full Request */}
                                                                {(item.request_headers || item.request_body) && (
                                                                    <div>
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <span className="text-xs text-muted-foreground font-medium">Request</span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    copyToClipboard(buildRawRequest(), `req-${item.id}`);
                                                                                }}
                                                                                className="p-1 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                                                            >
                                                                                {copied === `req-${item.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                                            </button>
                                                                        </div>
                                                                        <pre className="text-xs text-orange-400 font-mono bg-black/30 p-2 rounded overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                                                                            {buildRawRequest()}
                                                                        </pre>
                                                                    </div>
                                                                )}
                                                                
                                                                {/* Full Response */}
                                                                {(item.response_headers || item.response_body) && (
                                                                    <div>
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <span className="text-xs text-muted-foreground font-medium">Response</span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    copyToClipboard(buildRawResponse(), `res-${item.id}`);
                                                                                }}
                                                                                className="p-1 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors"
                                                                            >
                                                                                {copied === `res-${item.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                                            </button>
                                                                        </div>
                                                                        <pre className="text-xs text-emerald-400 font-mono bg-black/30 p-2 rounded overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                                                                            {buildRawResponse()}
                                                                        </pre>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        {/* Pagination */}
                                        {totalTrafficPages > 1 && (
                                            <div className="flex items-center justify-between pt-3 border-t border-[#27272a]">
                                                <span className="text-xs text-muted-foreground">
                                                    Showing {((trafficPage - 1) * trafficPerPage) + 1} - {Math.min(trafficPage * trafficPerPage, trafficData.length)} of {trafficData.length}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setTrafficPage(p => Math.max(1, p - 1))}
                                                        disabled={trafficPage === 1}
                                                        className="p-1.5 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                    >
                                                        <ChevronLeft className="w-4 h-4" />
                                                    </button>
                                                    <span className="px-3 py-1 text-sm text-white">
                                                        {trafficPage} / {totalTrafficPages}
                                                    </span>
                                                    <button
                                                        onClick={() => setTrafficPage(p => Math.min(totalTrafficPages, p + 1))}
                                                        disabled={trafficPage === totalTrafficPages}
                                                        className="p-1.5 rounded hover:bg-[#27272a] text-muted-foreground hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                    >
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
