'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
    Database, 
    AlertCircle, 
    CheckCircle2, 
    RefreshCw, 
    Server,
    Table,
    Columns,
    Loader2,
    ExternalLink
} from 'lucide-react';

interface HealthStatus {
    status: 'ok' | 'no_connection' | 'no_database_url' | 'schema_mismatch' | 'empty_database';
    message: string;
    details?: {
        missingTables?: string[];
        missingColumns?: { table: string; columns: string[] }[];
        connectionError?: string;
    };
}

// Status configuration map for cleaner code
const STATUS_CONFIG = {
    ok: {
        icon: <CheckCircle2 className="h-6 w-6 text-green-500" />,
        badge: <Badge className="bg-green-500 text-xs">Connected</Badge>,
    },
    no_database_url: {
        icon: <AlertCircle className="h-6 w-6 text-red-500" />,
        badge: <Badge variant="destructive" className="text-xs">Not Configured</Badge>,
    },
    no_connection: {
        icon: <AlertCircle className="h-6 w-6 text-red-500" />,
        badge: <Badge variant="destructive" className="text-xs">Connection Failed</Badge>,
    },
    schema_mismatch: {
        icon: <AlertCircle className="h-6 w-6 text-yellow-500" />,
        badge: <Badge className="bg-yellow-500 text-black text-xs">Schema Mismatch</Badge>,
    },
    empty_database: {
        icon: <AlertCircle className="h-6 w-6 text-yellow-500" />,
        badge: <Badge className="bg-yellow-500 text-black text-xs">Empty Database</Badge>,
    },
} as const;

export default function SetupPage() {
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

    const checkHealth = async (redirectIfOk = false) => {
        setLoading(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/setup/health');
            const data = await res.json();
            setHealth(data);
            
            if (redirectIfOk && data.status === 'ok') {
                window.location.href = '/login';
                return;
            }
        } catch {
            setHealth({ status: 'no_connection', message: 'Failed to check database health' });
        } finally {
            setLoading(false);
        }
    };

    const syncDatabase = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/setup/sync', { method: 'POST' });
            const data = await res.json();
            setSyncResult({
                success: data.success,
                message: data.message || (data.success ? 'Database synchronized!' : 'Sync failed'),
            });
            if (data.success) {
                toast.success('Database synchronized successfully!');
                await checkHealth();
            } else {
                toast.error(data.message || 'Failed to sync database');
            }
        } catch {
            setSyncResult({ success: false, message: 'Failed to sync database' });
            toast.error('Failed to sync database');
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        checkHealth(true);
    }, []);

    const statusConfig = health?.status ? STATUS_CONFIG[health.status] : null;
    const needsSync = health?.status === 'schema_mismatch' || health?.status === 'empty_database';

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
            <div className="w-full max-w-xl">
                {/* Header */}
                <div className="text-center space-y-3 mb-8">
                    <div className="flex justify-center mb-6">
                        <div className="bg-primary/10 p-4 rounded-full">
                            <Server className="h-10 w-10 text-primary" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold">NeXSS Setup</h1>
                    <p className="text-sm text-muted-foreground">Configure your database to get started</p>
                </div>

                {/* Status Card */}
                <Card>
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {statusConfig?.icon ?? <Database className="h-6 w-6 text-muted-foreground" />}
                                <div>
                                    <CardTitle className="text-base">Database Status</CardTitle>
                                    <CardDescription className="text-xs">PostgreSQL Connection</CardDescription>
                                </div>
                            </div>
                            {statusConfig?.badge}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                <p className="text-sm leading-relaxed">{health?.message}</p>

                                {/* DATABASE_URL not configured */}
                                {health?.status === 'no_database_url' && (
                                    <Alert variant="destructive">
                                        <AlertTitle className="text-sm">Configuration Required</AlertTitle>
                                        <AlertDescription className="space-y-3">
                                            <p className="text-xs text-muted-foreground">
                                                Set <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">DATABASE_URL</code> in your <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">.env</code> file:
                                            </p>
                                            <pre className="bg-muted p-3 rounded text-[11px] overflow-x-auto text-foreground">
                                                DATABASE_URL=postgresql://user:password@localhost:5432/nexss
                                            </pre>
                                            <p className="text-xs text-muted-foreground">Then restart the application.</p>
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* Connection error */}
                                {health?.status === 'no_connection' && health.details?.connectionError && (
                                    <Alert variant="destructive">
                                        <AlertTitle className="text-sm">Connection Error</AlertTitle>
                                        <AlertDescription className="space-y-3">
                                            <pre className="bg-muted p-3 rounded text-[11px] overflow-x-auto whitespace-pre-wrap text-foreground">
                                                {health.details.connectionError}
                                            </pre>
                                            <p className="text-xs text-muted-foreground">
                                                Check your database credentials and ensure PostgreSQL is running.
                                            </p>
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* Missing tables */}
                                {health?.details?.missingTables && health.details.missingTables.length > 0 && (
                                    <Alert variant="warning">
                                        <Table className="h-4 w-4" />
                                        <AlertTitle className="text-sm">Missing Tables ({health.details.missingTables.length})</AlertTitle>
                                        <AlertDescription>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {health.details.missingTables.map((table) => (
                                                    <Badge key={table} variant="outline" className="font-mono text-[11px]">{table}</Badge>
                                                ))}
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* Missing columns */}
                                {health?.details?.missingColumns && health.details.missingColumns.length > 0 && (
                                    <Alert variant="warning">
                                        <Columns className="h-4 w-4" />
                                        <AlertTitle className="text-sm">Missing Columns</AlertTitle>
                                        <AlertDescription className="space-y-2 mt-2">
                                            {health.details.missingColumns.map((item) => (
                                                <div key={item.table} className="space-y-1">
                                                    <p className="text-xs font-mono">{item.table}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.columns.map((col) => (
                                                            <Badge key={col} variant="outline" className="font-mono text-[11px]">{col}</Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* Sync result */}
                                {syncResult && (
                                    <Alert variant={syncResult.success ? 'success' : 'destructive'}>
                                        <AlertDescription className="text-sm font-medium">{syncResult.message}</AlertDescription>
                                    </Alert>
                                )}

                                {/* Action buttons */}
                                <div className="flex gap-3 pt-2">
                                    <Button variant="outline" size="sm" onClick={() => checkHealth(false)} disabled={loading}>
                                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                        Refresh
                                    </Button>

                                    {needsSync && (
                                        <Button size="sm" onClick={syncDatabase} disabled={syncing}>
                                            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
                                            {health?.status === 'empty_database' ? 'Initialize DB' : 'Sync DB'}
                                        </Button>
                                    )}

                                    {health?.status === 'ok' && (
                                        <Button size="sm" onClick={() => window.location.href = '/login'}>
                                            Continue <ExternalLink className="h-4 w-4 ml-2" />
                                        </Button>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <p className="text-center text-xs text-muted-foreground mt-6">
                    NeXSS v{process.env.APP_VERSION} - Lightweight Blind XSS Listener
                </p>
            </div>
        </div>
    );
}
