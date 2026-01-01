'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, Globe, Check, Cloud, HardDrive, AlertCircle, RefreshCw, Server, Bell, Send, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TimezoneSelect } from '@/components/ui/timezone-select';
import { useSettings } from '@/lib/settings-context';
import { apiPut, apiPost } from '@/lib/api-client';
import { toast } from 'sonner';

interface AppSettings {
    app_name: string;
    timezone: string;
}

interface StorageSettings {
    storage_enabled: string;
    storage_provider: string;
    storage_endpoint: string;
    storage_region: string;
    storage_bucket: string;
    storage_access_key: string;
    storage_secret_key: string;
    storage_public_url: string;
}

interface TelegramSettings {
    telegram_enabled: string;
    telegram_bot_token: string;
    telegram_chat_id: string;
}

interface MigrationStatus {
    counts: {
        local: number;
        s3: number;
        db: number;
        total: number;
    };
    objectStorageEnabled: boolean;
    provider: string | null;
}

export default function SettingsPage() {
    const { refreshSettings } = useSettings();
    const [settings, setSettings] = useState<AppSettings>({
        app_name: 'NeXSS',
        timezone: 'UTC',
    });
    const [storageSettings, setStorageSettings] = useState<StorageSettings>({
        storage_enabled: 'false',
        storage_provider: 'minio',
        storage_endpoint: '',
        storage_region: 'auto',
        storage_bucket: '',
        storage_access_key: '',
        storage_secret_key: '',
        storage_public_url: '',
    });
    const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
        telegram_enabled: 'false',
        telegram_bot_token: '',
        telegram_chat_id: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingStorage, setSavingStorage] = useState(false);
    const [savingTelegram, setSavingTelegram] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savedStorage, setSavedStorage] = useState(false);
    const [savedTelegram, setSavedTelegram] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionResult, setConnectionResult] = useState<{ success: boolean; error?: string } | null>(null);
    const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
    const [migrating, setMigrating] = useState(false);
    const [migrationResult, setMigrationResult] = useState<{ migrated: number; failed: number } | null>(null);
    const [showMigrationModal, setShowMigrationModal] = useState(false);
    
    // Telegram states
    const [testingToken, setTestingToken] = useState(false);
    const [tokenResult, setTokenResult] = useState<{ success: boolean; botName?: string; error?: string } | null>(null);
    const [gettingChatId, setGettingChatId] = useState(false);
    const [chatIdResult, setChatIdResult] = useState<{ success: boolean; chatId?: string; error?: string } | null>(null);
    const [sendingTest, setSendingTest] = useState(false);
    const [testMessageResult, setTestMessageResult] = useState<{ success: boolean; error?: string } | null>(null);

    useEffect(() => {
        fetchSettings();
        fetchMigrationStatus();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    app_name: data.settings.app_name || 'NeXSS',
                    timezone: data.settings.timezone || 'UTC',
                });
                setStorageSettings({
                    storage_enabled: data.settings.storage_enabled || 'false',
                    storage_provider: data.settings.storage_provider || 'minio',
                    storage_endpoint: data.settings.storage_endpoint || '',
                    storage_region: data.settings.storage_region || 'auto',
                    storage_bucket: data.settings.storage_bucket || '',
                    storage_access_key: data.settings.storage_access_key || '',
                    storage_secret_key: data.settings.storage_secret_key || '',
                    storage_public_url: data.settings.storage_public_url || '',
                });
                setTelegramSettings({
                    telegram_enabled: data.settings.telegram_enabled || 'false',
                    telegram_bot_token: data.settings.telegram_bot_token || '',
                    telegram_chat_id: data.settings.telegram_chat_id || '',
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchMigrationStatus = async () => {
        try {
            const res = await fetch('/api/storage/migrate');
            if (res.ok) {
                const data = await res.json();
                setMigrationStatus(data);
            }
        } catch (err) {
            console.error('Failed to fetch migration status:', err);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await apiPut('/api/settings', { 
                settings: {
                    app_name: settings.app_name,
                    timezone: settings.timezone,
                }
            });

            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                toast.success('Application settings saved');
                // Refresh global settings context
                await refreshSettings();
            } else {
                toast.error('Failed to save settings');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveStorage = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingStorage(true);
        try {
            const res = await apiPut('/api/settings', { settings: storageSettings });

            if (res.ok) {
                setSavedStorage(true);
                setTimeout(() => setSavedStorage(false), 2000);
                toast.success('Storage settings saved');
                fetchMigrationStatus();
            } else {
                toast.error('Failed to save storage settings');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setSavingStorage(false);
        }
    };

    const handleTestConnection = async () => {
        setTestingConnection(true);
        setConnectionResult(null);
        try {
            const res = await apiPost('/api/settings', {
                action: 'test_connection',
                config: {
                    provider: storageSettings.storage_provider,
                    endpoint: storageSettings.storage_endpoint,
                    region: storageSettings.storage_region,
                    bucket: storageSettings.storage_bucket,
                    accessKeyId: storageSettings.storage_access_key,
                    secretAccessKey: storageSettings.storage_secret_key,
                    publicUrl: storageSettings.storage_public_url,
                },
            });
            const data = await res.json();
            setConnectionResult(data);
            if (data.success) {
                toast.success('Connection successful');
            } else {
                toast.error(data.error || 'Connection failed');
            }
        } catch {
            setConnectionResult({ success: false, error: 'Failed to test connection' });
            toast.error('Failed to test connection');
        } finally {
            setTestingConnection(false);
        }
    };

    const handleMigrate = async () => {
        setShowMigrationModal(false);
        setMigrating(true);
        setMigrationResult(null);
        try {
            const res = await apiPost('/api/storage/migrate', { 
                action: 'migrate', 
                deleteAfterMigration: true,
                // Send current form config for migration before enabling
                config: {
                    provider: storageSettings.storage_provider,
                    endpoint: storageSettings.storage_endpoint,
                    region: storageSettings.storage_region,
                    bucket: storageSettings.storage_bucket,
                    accessKeyId: storageSettings.storage_access_key,
                    secretAccessKey: storageSettings.storage_secret_key,
                    publicUrl: storageSettings.storage_public_url,
                },
            });
            const data = await res.json();
            if (data.success) {
                setMigrationResult({ migrated: data.migrated, failed: data.failed });
                fetchMigrationStatus();
                toast.success(`Migrated ${data.migrated} screenshots${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
            } else {
                toast.error('Migration failed');
            }
        } catch (err) {
            console.error('Migration failed:', err);
            toast.error('Migration failed');
        } finally {
            setMigrating(false);
        }
    };

    // Telegram handlers
    const handleTestToken = async () => {
        if (!telegramSettings.telegram_bot_token) return;
        setTestingToken(true);
        setTokenResult(null);
        setChatIdResult(null);
        try {
            const res = await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'test_token',
                    botToken: telegramSettings.telegram_bot_token,
                }),
            });
            const data = await res.json();
            setTokenResult(data);
            if (data.success) {
                toast.success(`Bot verified: @${data.botName}`);
            } else {
                toast.error(data.error || 'Invalid bot token');
            }
        } catch {
            setTokenResult({ success: false, error: 'Failed to test token' });
            toast.error('Failed to verify token');
        } finally {
            setTestingToken(false);
        }
    };

    const handleGetChatId = async () => {
        if (!telegramSettings.telegram_bot_token) return;
        setGettingChatId(true);
        setChatIdResult(null);
        try {
            const res = await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'get_chat_id',
                    botToken: telegramSettings.telegram_bot_token,
                }),
            });
            const data = await res.json();
            setChatIdResult(data);
            if (data.success && data.chatId) {
                setTelegramSettings(prev => ({ ...prev, telegram_chat_id: data.chatId }));
                toast.success('Chat ID detected');
            } else {
                toast.warning(data.error || 'Could not detect chat ID');
            }
        } catch {
            setChatIdResult({ success: false, error: 'Failed to get chat ID' });
            toast.error('Failed to get chat ID');
        } finally {
            setGettingChatId(false);
        }
    };

    const handleSendTestMessage = async () => {
        if (!telegramSettings.telegram_bot_token || !telegramSettings.telegram_chat_id) return;
        setSendingTest(true);
        setTestMessageResult(null);
        try {
            const res = await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send_test',
                    botToken: telegramSettings.telegram_bot_token,
                    chatId: telegramSettings.telegram_chat_id,
                }),
            });
            const data = await res.json();
            setTestMessageResult(data);
            if (data.success) {
                toast.success('Test message sent! Check your Telegram.');
            } else {
                toast.error(data.error || 'Failed to send test message');
            }
        } catch {
            setTestMessageResult({ success: false, error: 'Failed to send test message' });
            toast.error('Failed to send test message');
        } finally {
            setSendingTest(false);
        }
    };

    const handleSaveTelegram = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingTelegram(true);
        try {
            const res = await apiPut('/api/settings', { settings: telegramSettings });
            if (res.ok) {
                setSavedTelegram(true);
                setTimeout(() => setSavedTelegram(false), 2000);
                toast.success('Telegram settings saved');
            } else {
                toast.error('Failed to save Telegram settings');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setSavingTelegram(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in max-w-7xl mx-auto pb-10">
            {/* Migration Confirmation Modal */}
            {showMigrationModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-[#18181c] rounded-lg border border-[#27272a] w-full max-w-md mx-4 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <Cloud className="w-4 h-4 text-blue-500" />
                            </div>
                            <h3 className="text-white font-medium">Migrate Screenshots</h3>
                        </div>
                        <p className="text-muted-foreground text-sm mb-2">
                            This will migrate all local screenshots to object storage.
                        </p>
                        <ul className="text-sm text-muted-foreground mb-5 space-y-1">
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span><strong className="text-white">{migrationStatus?.counts.local || 0}</strong> screenshots will be uploaded</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                <span>Local files will be deleted after migration</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Database references will be updated</span>
                            </li>
                        </ul>
                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={() => setShowMigrationModal(false)} 
                                className="px-3 py-1.5 text-sm text-white hover:bg-white/5 rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleMigrate}
                                className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                            >
                                Start Migration
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                    Manage application preferences
                </p>
            </div>

            <div className="grid gap-4">
                {/* Application Settings */}
                <form onSubmit={handleSave}>
                    <Card className="border border-[#27272a] bg-[#18181c] text-white rounded-lg overflow-hidden">
                        <CardHeader className="pb-3 pt-4 px-4">
                            <div className="flex items-center gap-1.5">
                                <Globe className="w-4 h-4 text-emerald-500" />
                                <CardTitle className="text-white text-sm">Application Settings</CardTitle>
                            </div>
                            <CardDescription className="text-muted-foreground text-sm">
                                Global configuration for the Nexss platform
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 px-4 pb-4">
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                    <label htmlFor="app_name" className="text-sm font-medium text-muted-foreground">Application Name</label>
                                    <Input
                                        id="app_name"
                                        value={settings.app_name}
                                        onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
                                        placeholder="Nexss"
                                        className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 h-9 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="timezone" className="text-sm font-medium text-muted-foreground">Timezone</label>
                                    <TimezoneSelect
                                        value={settings.timezone}
                                        onChange={(value) => setSettings({ ...settings, timezone: value })}
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <div className="flex items-center justify-end px-4 py-3 border-t border-white/5 bg-white/[0.02]">
                            <Button type="submit" disabled={saving} className="min-w-[100px] bg-emerald-500 hover:bg-emerald-600 text-white rounded text-sm h-9">
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Saving...
                                    </>
                                ) : saved ? (
                                    <>
                                        <Check className="w-4 h-4 mr-1.5" />
                                        Saved!
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-1.5" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    </Card>
                </form>

                {/* Object Storage Settings */}
                <form onSubmit={handleSaveStorage}>
                    <Card className="border border-[#27272a] bg-[#18181c] text-white rounded-lg overflow-hidden">
                        <CardHeader className="pb-3 pt-4 px-4">
                            <div className="flex items-center gap-1.5">
                                <Cloud className="w-4 h-4 text-blue-500" />
                                <CardTitle className="text-white text-sm">Object Storage</CardTitle>
                            </div>
                            <CardDescription className="text-muted-foreground text-sm">
                                Configure S3-compatible storage for screenshots (AWS S3, MinIO, Cloudflare R2)
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-4 pb-4">
                            {/* Enable toggle */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <h3 className="font-medium text-sm">Enable Object Storage</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Store screenshots in S3-compatible storage instead of local files
                                    </p>
                                </div>
                                <Switch
                                    checked={storageSettings.storage_enabled === 'true'}
                                    onCheckedChange={(checked) => setStorageSettings({
                                        ...storageSettings,
                                        storage_enabled: checked ? 'true' : 'false'
                                    })}
                                />
                            </div>

                            {storageSettings.storage_enabled === 'true' && (
                                <>
                                    {/* Provider */}
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-muted-foreground">Provider</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setStorageSettings({ ...storageSettings, storage_provider: 's3' })}
                                                className={`p-3 rounded border text-sm transition-colors ${
                                                    storageSettings.storage_provider === 's3'
                                                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                                                        : 'border-white/5 bg-[#09090b] text-white hover:border-white/10'
                                                }`}
                                            >
                                                AWS S3
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStorageSettings({ ...storageSettings, storage_provider: 'minio' })}
                                                className={`p-3 rounded border text-sm transition-colors ${
                                                    storageSettings.storage_provider === 'minio'
                                                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                                                        : 'border-white/5 bg-[#09090b] text-white hover:border-white/10'
                                                }`}
                                            >
                                                MinIO
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStorageSettings({ ...storageSettings, storage_provider: 'r2' })}
                                                className={`p-3 rounded border text-sm transition-colors ${
                                                    storageSettings.storage_provider === 'r2'
                                                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                                                        : 'border-white/5 bg-[#09090b] text-white hover:border-white/10'
                                                }`}
                                            >
                                                Cloudflare R2
                                            </button>
                                        </div>
                                    </div>

                                    {/* Connection details */}
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-muted-foreground">Endpoint URL {storageSettings.storage_provider === 's3' && <span className="text-muted-foreground/50">(Optional for AWS)</span>}</label>
                                            <Input
                                                value={storageSettings.storage_endpoint}
                                                onChange={(e) => setStorageSettings({ ...storageSettings, storage_endpoint: e.target.value })}
                                                placeholder={
                                                    storageSettings.storage_provider === 's3' 
                                                        ? 'https://s3.us-east-1.amazonaws.com (or leave empty)' 
                                                        : storageSettings.storage_provider === 'r2' 
                                                            ? 'https://<account>.r2.cloudflarestorage.com' 
                                                            : 'https://minio.example.com:9000'
                                                }
                                                className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-muted-foreground">Region</label>
                                            <Input
                                                value={storageSettings.storage_region}
                                                onChange={(e) => setStorageSettings({ ...storageSettings, storage_region: e.target.value })}
                                                placeholder={storageSettings.storage_provider === 's3' ? 'us-east-1' : 'auto'}
                                                className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-muted-foreground">Bucket Name</label>
                                            <Input
                                                value={storageSettings.storage_bucket}
                                                onChange={(e) => setStorageSettings({ ...storageSettings, storage_bucket: e.target.value })}
                                                placeholder="nexss-screenshots"
                                                className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-muted-foreground">Public URL (Optional)</label>
                                            <Input
                                                value={storageSettings.storage_public_url}
                                                onChange={(e) => setStorageSettings({ ...storageSettings, storage_public_url: e.target.value })}
                                                placeholder="https://cdn.example.com"
                                                className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-muted-foreground">Access Key ID</label>
                                            <Input
                                                value={storageSettings.storage_access_key}
                                                onChange={(e) => setStorageSettings({ ...storageSettings, storage_access_key: e.target.value })}
                                                placeholder="AKIAIOSFODNN7EXAMPLE"
                                                className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 h-9 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-muted-foreground">Secret Access Key</label>
                                            <Input
                                                type="password"
                                                value={storageSettings.storage_secret_key}
                                                onChange={(e) => setStorageSettings({ ...storageSettings, storage_secret_key: e.target.value })}
                                                placeholder="••••••••"
                                                className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 h-9 text-sm"
                                            />
                                        </div>
                                    </div>

                                    {/* Test Connection */}
                                    <div className="flex items-center gap-3">
                                        <Button
                                            type="button"
                                            onClick={handleTestConnection}
                                            disabled={testingConnection}
                                            variant="outline"
                                            className="bg-[#09090b] border-white/5 text-white hover:bg-white/5 h-9 text-sm"
                                        >
                                            {testingConnection ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                                    Testing...
                                                </>
                                            ) : (
                                                'Test Connection'
                                            )}
                                        </Button>
                                        {connectionResult && (
                                            <span className={`text-sm ${connectionResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {connectionResult.success ? '✓ Connection successful' : `✕ ${connectionResult.error}`}
                                            </span>
                                        )}
                                    </div>

                                    {/* Migration Section */}
                                    {migrationStatus && migrationStatus.counts.local > 0 && (
                                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-3">
                                            <div className="flex items-start gap-2">
                                                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-medium text-amber-400">Migration Required</p>
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        You have <span className="text-white font-medium">{migrationStatus.counts.local}</span> screenshots stored locally. 
                                                        After enabling object storage, existing screenshots will continue to work, but you can migrate them 
                                                        to object storage for consistency.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    type="button"
                                                    onClick={() => setShowMigrationModal(true)}
                                                    disabled={migrating || !connectionResult?.success}
                                                    className="bg-amber-500 hover:bg-amber-600 text-white h-9 text-sm">
                                                    {migrating ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                                            Migrating...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RefreshCw className="w-4 h-4 mr-1.5" />
                                                            Migrate to Object Storage
                                                        </>
                                                    )}
                                                </Button>
                                                {!connectionResult?.success && (
                                                    <span className="text-xs text-muted-foreground">
                                                        Test connection first to enable migration
                                                    </span>
                                                )}
                                                {migrationResult && (
                                                    <span className="text-sm text-emerald-400">
                                                        Migrated {migrationResult.migrated} screenshots
                                                        {migrationResult.failed > 0 && `, ${migrationResult.failed} failed`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Storage Stats */}
                                    {migrationStatus && (
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="p-3 bg-[#09090b] rounded border border-white/5 text-center">
                                                <HardDrive className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                                                <p className="text-lg font-semibold text-white">{migrationStatus.counts.local}</p>
                                                <p className="text-xs text-muted-foreground">Local</p>
                                            </div>
                                            <div className="p-3 bg-[#09090b] rounded border border-white/5 text-center">
                                                <Cloud className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                                                <p className="text-lg font-semibold text-white">{migrationStatus.counts.s3}</p>
                                                <p className="text-xs text-muted-foreground">Object Storage</p>
                                            </div>
                                            <div className="p-3 bg-[#09090b] rounded border border-white/5 text-center">
                                                <Server className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                                                <p className="text-lg font-semibold text-white">{migrationStatus.counts.total}</p>
                                                <p className="text-xs text-muted-foreground">Total</p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                        <div className="flex items-center justify-end px-4 py-3 border-t border-white/5 bg-white/[0.02]">
                            <Button type="submit" disabled={savingStorage} className="min-w-[100px] bg-blue-500 hover:bg-blue-600 text-white rounded text-sm h-9">
                                {savingStorage ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Saving...
                                    </>
                                ) : savedStorage ? (
                                    <>
                                        <Check className="w-4 h-4 mr-1.5" />
                                        Saved!
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-1.5" />
                                        Save Storage Settings
                                    </>
                                )}
                            </Button>
                        </div>
                    </Card>
                </form>

                {/* Telegram Notifications */}
                <form onSubmit={handleSaveTelegram}>
                    <Card className="border-white/5 shadow-lg bg-[#18181c]">
                        <CardHeader className="border-b border-white/5 bg-white/[0.02]">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                        <Bell className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Telegram Notifications</CardTitle>
                                        <CardDescription>Get notified when new XSS reports come in</CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">
                                        {telegramSettings.telegram_enabled === 'true' ? 'Enabled' : 'Disabled'}
                                    </span>
                                    <Switch
                                        checked={telegramSettings.telegram_enabled === 'true'}
                                        onCheckedChange={(checked) => 
                                            setTelegramSettings(prev => ({ ...prev, telegram_enabled: checked ? 'true' : 'false' }))
                                        }
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-5">
                            {/* Setup Instructions */}
                            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                <h4 className="text-sm font-medium text-blue-400 mb-2">Setup Instructions</h4>
                                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                                    <li>Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@BotFather</a> on Telegram</li>
                                    <li>Copy the bot token and paste it below</li>
                                    <li>Click &quot;Verify Token&quot; to validate</li>
                                    <li>Send <code className="bg-white/10 px-1 rounded">/start</code> to your bot</li>
                                    <li>Click &quot;Get Chat ID&quot; to auto-detect your chat ID</li>
                                    <li>Send a test message to verify everything works</li>
                                </ol>
                            </div>

                            {/* Bot Token */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Bot Token</label>
                                <div className="flex gap-2">
                                    <Input
                                        type="password"
                                        value={telegramSettings.telegram_bot_token}
                                        onChange={(e) => setTelegramSettings(prev => ({ ...prev, telegram_bot_token: e.target.value }))}
                                        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                                        className="bg-[#09090b] border-white/10 focus:border-blue-500/50 font-mono text-sm flex-1"
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleTestToken}
                                        disabled={testingToken || !telegramSettings.telegram_bot_token}
                                        variant="outline"
                                        className="border-white/10 hover:bg-white/5"
                                    >
                                        {testingToken ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            'Verify Token'
                                        )}
                                    </Button>
                                </div>
                                {tokenResult && (
                                    <p className={`text-sm ${tokenResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {tokenResult.success ? `✓ Valid! Bot: @${tokenResult.botName}` : `✕ ${tokenResult.error}`}
                                    </p>
                                )}
                            </div>

                            {/* Chat ID */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Chat ID</label>
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        value={telegramSettings.telegram_chat_id}
                                        onChange={(e) => setTelegramSettings(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
                                        placeholder="Your chat ID will appear here"
                                        className="bg-[#09090b] border-white/10 focus:border-blue-500/50 font-mono text-sm flex-1"
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleGetChatId}
                                        disabled={gettingChatId || !telegramSettings.telegram_bot_token || !tokenResult?.success}
                                        variant="outline"
                                        className="border-white/10 hover:bg-white/5"
                                    >
                                        {gettingChatId ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <MessageCircle className="w-4 h-4 mr-1.5" />
                                                Get Chat ID
                                            </>
                                        )}
                                    </Button>
                                </div>
                                {chatIdResult && (
                                    <p className={`text-sm ${chatIdResult.success ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {chatIdResult.success ? `✓ Chat ID detected: ${chatIdResult.chatId}` : `⚠ ${chatIdResult.error}`}
                                    </p>
                                )}
                            </div>

                            {/* Test Message */}
                            {telegramSettings.telegram_bot_token && telegramSettings.telegram_chat_id && (
                                <div className="flex items-center gap-3 pt-2">
                                    <Button
                                        type="button"
                                        onClick={handleSendTestMessage}
                                        disabled={sendingTest}
                                        variant="outline"
                                        className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                    >
                                        {sendingTest ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                                Sending...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-4 h-4 mr-1.5" />
                                                Send Test Message
                                            </>
                                        )}
                                    </Button>
                                    {testMessageResult && (
                                        <span className={`text-sm ${testMessageResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {testMessageResult.success ? '✓ Message sent! Check your Telegram.' : `✕ ${testMessageResult.error}`}
                                        </span>
                                    )}
                                </div>
                            )}
                        </CardContent>
                        <div className="flex items-center justify-end px-4 py-3 border-t border-white/5 bg-white/[0.02]">
                            <Button type="submit" disabled={savingTelegram} className="min-w-[100px] bg-blue-500 hover:bg-blue-600 text-white rounded text-sm h-9">
                                {savingTelegram ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Saving...
                                    </>
                                ) : savedTelegram ? (
                                    <>
                                        <Check className="w-4 h-4 mr-1.5" />
                                        Saved!
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-1.5" />
                                        Save Telegram Settings
                                    </>
                                )}
                            </Button>
                        </div>
                    </Card>
                </form>
            </div>
        </div>
    );
}
