'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, User, Mail, Lock, Eye, EyeOff, Check, Shield, ShieldCheck, ShieldOff, KeyRound, Copy, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { TotpInput } from '@/components/ui/totp-input';
import { apiPut, apiPost } from '@/lib/api-client';
import { toast } from 'sonner';

interface UserProfile {
    id: string;
    username: string;
    email: string;
    rank: number;
    totp_enabled: boolean;
    created_at: string;
}

type TwoFAStep = 'idle' | 'setup' | 'verify' | 'backup' | 'disable' | 'regenerate';

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // User settings state
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // 2FA state
    const [twoFAStep, setTwoFAStep] = useState<TwoFAStep>('idle');
    const [twoFASecret, setTwoFASecret] = useState('');
    const [twoFAQRCode, setTwoFAQRCode] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [twoFALoading, setTwoFALoading] = useState(false);
    const [twoFAError, setTwoFAError] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const [remainingBackupCodes, setRemainingBackupCodes] = useState(0);
    const [regeneratePassword, setRegeneratePassword] = useState('');
    const [regenerateCode, setRegenerateCode] = useState('');
    const [copiedSecret, setCopiedSecret] = useState(false);

    useEffect(() => {
        fetchProfile();
    }, []);

    useEffect(() => {
        if (profile?.totp_enabled) {
            fetchBackupCodeCount();
        }
    }, [profile?.totp_enabled]);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/user');
            if (res.ok) {
                const data = await res.json();
                setProfile(data.user);
                setEmail(data.user.email || '');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchBackupCodeCount = async () => {
        try {
            const res = await fetch('/api/auth/2fa/backup');
            if (res.ok) {
                const data = await res.json();
                setRemainingBackupCodes(data.remainingCodes);
            }
        } catch (err) {
            console.error('Failed to fetch backup code count:', err);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate password confirmation
        if (newPassword && newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        // Validate password requirements
        if (newPassword && newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }

        setSaving(true);
        try {
            const payload: { email?: string; currentPassword?: string; newPassword?: string } = {};
            
            // Only send email if changed
            if (email !== profile?.email) {
                payload.email = email;
            }

            // Only send password if provided
            if (newPassword) {
                payload.currentPassword = currentPassword;
                payload.newPassword = newPassword;
            }

            // Skip if nothing to update
            if (Object.keys(payload).length === 0) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                toast.success('Profile saved');
                return;
            }

            const res = await apiPut('/api/user', payload);

            const data = await res.json();

            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                toast.success('Profile updated successfully');
                // Clear password fields
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                // Refresh profile
                fetchProfile();
            } else {
                toast.error(data.error || 'Failed to update profile');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    // 2FA Functions
    const initiate2FASetup = async () => {
        setTwoFALoading(true);
        setTwoFAError('');
        try {
            const res = await fetch('/api/auth/2fa/setup');
            if (res.ok) {
                const data = await res.json();
                setTwoFASecret(data.secret);
                setTwoFAQRCode(data.qrCode);
                setTwoFAStep('setup');
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to initiate 2FA setup');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setTwoFALoading(false);
        }
    };

    const verify2FA = async (code?: string) => {
        const codeToVerify = code || totpCode;
        if (codeToVerify.length !== 6) return;

        setTwoFALoading(true);
        setTwoFAError('');
        try {
            const res = await apiPost('/api/auth/2fa/setup', { token: codeToVerify });

            const data = await res.json();
            if (res.ok) {
                setBackupCodes(data.backupCodes);
                setTwoFAStep('backup');
                fetchProfile();
                toast.success('2FA enabled successfully!');
            } else {
                setTwoFAError(data.error || 'Invalid verification code');
                toast.error(data.error || 'Invalid verification code');
                setTotpCode('');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setTwoFALoading(false);
        }
    };

    const disable2FA = async () => {
        if (!disablePassword) {
            toast.error('Password is required');
            return;
        }

        setTwoFALoading(true);
        setTwoFAError('');
        try {
            const res = await apiPost('/api/auth/2fa/disable', { password: disablePassword });

            const data = await res.json();
            if (res.ok) {
                setTwoFAStep('idle');
                setDisablePassword('');
                fetchProfile();
                toast.success('2FA disabled successfully');
            } else {
                toast.error(data.error || 'Failed to disable 2FA');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setTwoFALoading(false);
        }
    };

    const regenerateBackupCodes = async () => {
        if (!regeneratePassword || regenerateCode.length !== 6) {
            toast.error('Password and 2FA code are required');
            return;
        }

        setTwoFALoading(true);
        setTwoFAError('');
        try {
            const res = await apiPost('/api/auth/2fa/backup', { password: regeneratePassword, token: regenerateCode });

            const data = await res.json();
            if (res.ok) {
                setBackupCodes(data.backupCodes);
                setTwoFAStep('backup');
                setRegeneratePassword('');
                setRegenerateCode('');
                fetchBackupCodeCount();
                toast.success('Backup codes regenerated');
            } else {
                setTwoFAError(data.error || 'Failed to regenerate backup codes');
                toast.error(data.error || 'Failed to regenerate backup codes');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setTwoFALoading(false);
        }
    };

    const copySecret = () => {
        navigator.clipboard.writeText(twoFASecret);
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
        toast.success('Secret copied to clipboard');
    };

    const downloadBackupCodes = () => {
        const content = `NeXSS Backup Codes\n==================\nGenerated: ${new Date().toISOString()}\n\nThese codes can be used to access your account if you lose access to your authenticator app.\nEach code can only be used once.\n\n${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\nStore these codes in a safe place!`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nexss-backup-codes.txt';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Backup codes downloaded');
    };

    const copyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
        toast.success('Backup codes copied to clipboard');
    };

    const reset2FAState = () => {
        setTwoFAStep('idle');
        setTwoFASecret('');
        setTwoFAQRCode('');
        setTotpCode('');
        setBackupCodes([]);
        setTwoFAError('');
        setDisablePassword('');
        setRegeneratePassword('');
        setRegenerateCode('');
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
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Profile</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                    Manage your account settings
                </p>
            </div>

            <form onSubmit={handleSave}>
                <Card className="border border-[#27272a] bg-[#18181c] text-white rounded-lg overflow-hidden">
                    <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex items-center gap-1.5">
                            <User className="w-4 h-4 text-emerald-500" />
                            <CardTitle className="text-white text-sm">User Profile</CardTitle>
                        </div>
                        <CardDescription className="text-muted-foreground text-sm">
                            Update your email and password
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 px-4 pb-4">
                        {/* Profile Header */}
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded bg-gradient-to-r from-purple-500 to-pink-500 p-[2px]">
                                <div className="w-full h-full rounded bg-[#18181c] flex items-center justify-center text-lg font-bold text-white">
                                    {profile?.username?.charAt(0).toUpperCase() || 'U'}
                                </div>
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="text-base font-medium text-white">{profile?.username || 'User'}</h3>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs font-normal border-white/10 text-muted-foreground px-1.5 py-0">
                                        {profile?.rank === 3 ? 'Administrator' : 'User'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <Separator className="bg-white/5" />

                        {/* Email Update */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5" />
                                Email Address
                            </label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 h-9 text-sm"
                            />
                        </div>

                        <Separator className="bg-white/5" />

                        {/* Password Update */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm font-medium text-muted-foreground">Change Password</span>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Current Password</label>
                                    <div className="relative">
                                        <Input
                                            type={showCurrentPassword ? 'text' : 'password'}
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 h-9 text-sm pr-9"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                                        >
                                            {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">New Password</label>
                                    <div className="relative">
                                        <Input
                                            type={showNewPassword ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 h-9 text-sm pr-9"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                                        >
                                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Confirm New Password</label>
                                    <Input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-[#09090b] border-white/5 text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 h-9 text-sm"
                                    />
                                </div>
                            </div>

                            {newPassword && confirmPassword && newPassword !== confirmPassword && (
                                <p className="text-xs text-red-400">Passwords do not match</p>
                            )}
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

            {/* Two-Factor Authentication Card */}
            <Card className="border border-[#27272a] bg-[#18181c] text-white rounded-lg overflow-hidden">
                <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-emerald-500" />
                            <CardTitle className="text-white text-sm">Two-Factor Authentication</CardTitle>
                        </div>
                        {profile?.totp_enabled && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Enabled
                            </Badge>
                        )}
                    </div>
                    <CardDescription className="text-muted-foreground text-sm">
                        Add an extra layer of security to your account
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                    {twoFAStep === 'idle' && (
                        <>
                            {profile?.totp_enabled ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium text-emerald-400">2FA is enabled</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Your account is protected with two-factor authentication.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-[#09090b] rounded-lg border border-white/5">
                                        <div className="flex items-center gap-2">
                                            <KeyRound className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm">Backup Codes</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm ${remainingBackupCodes <= 3 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                                                {remainingBackupCodes} remaining
                                            </span>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setTwoFAStep('regenerate')}
                                                className="h-7 text-xs border-white/10 hover:bg-white/5"
                                            >
                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                Regenerate
                                            </Button>
                                        </div>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setTwoFAStep('disable')}
                                        className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                                    >
                                        <ShieldOff className="w-4 h-4 mr-2" />
                                        Disable Two-Factor Authentication
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium text-amber-400">2FA is not enabled</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Enable two-factor authentication to add an extra layer of security to your account.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        type="button"
                                        onClick={initiate2FASetup}
                                        disabled={twoFALoading}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                                    >
                                        {twoFALoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <Shield className="w-4 h-4 mr-2" />
                                                Enable Two-Factor Authentication
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    {twoFAStep === 'setup' && (
                        <div className="space-y-4">
                            <div className="text-center space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                                </p>
                                
                                {/* QR Code */}
                                <div className="flex justify-center">
                                    <div className="p-4 bg-white rounded-lg">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={twoFAQRCode} alt="2FA QR Code" className="w-48 h-48" />
                                    </div>
                                </div>

                                {/* Manual Entry */}
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">Or enter this code manually:</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <code className="px-3 py-2 bg-[#09090b] border border-white/10 rounded text-sm font-mono text-emerald-400">
                                            {twoFASecret}
                                        </code>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={copySecret}
                                            className="h-9 border-white/10 hover:bg-white/5"
                                        >
                                            {copiedSecret ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <Separator className="bg-white/5" />

                            {/* Verification */}
                            <div className="space-y-3">
                                <p className="text-sm text-center text-muted-foreground">
                                    Enter the 6-digit code from your authenticator app
                                </p>
                                
                                <TotpInput
                                    value={totpCode}
                                    onChange={setTotpCode}
                                    onComplete={verify2FA}
                                    error={!!twoFAError}
                                    disabled={twoFALoading}
                                />

                                {twoFAError && (
                                    <p className="text-sm text-red-400 text-center sr-only">{twoFAError}</p>
                                )}

                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={reset2FAState}
                                        className="flex-1 border-white/10 hover:bg-white/5"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => verify2FA()}
                                        disabled={twoFALoading || totpCode.length !== 6}
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                                    >
                                        {twoFALoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            'Verify & Enable'
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {twoFAStep === 'backup' && (
                        <div className="space-y-4">
                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                                    <ShieldCheck className="w-6 h-6 text-emerald-500" />
                                </div>
                                <h3 className="text-lg font-medium text-white">2FA Enabled Successfully!</h3>
                                <p className="text-sm text-muted-foreground">
                                    Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator.
                                </p>
                            </div>

                            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                                    <p className="text-xs text-amber-400">
                                        Each code can only be used once. These codes will not be shown again.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-4 bg-[#09090b] border border-white/10 rounded-lg">
                                {backupCodes.map((code, i) => (
                                    <div key={i} className="font-mono text-sm text-center py-1.5 px-2 bg-white/5 rounded">
                                        {code}
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={copyBackupCodes}
                                    className="flex-1 border-white/10 hover:bg-white/5"
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={downloadBackupCodes}
                                    className="flex-1 border-white/10 hover:bg-white/5"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                </Button>
                            </div>

                            <Button
                                type="button"
                                onClick={reset2FAState}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                            >
                                Done
                            </Button>
                        </div>
                    )}

                    {twoFAStep === 'disable' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <ShieldOff className="w-5 h-5 text-red-500 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-red-400">Disable 2FA</p>
                                        <p className="text-xs text-muted-foreground">
                                            This will remove the extra security from your account. Enter your password to confirm.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm text-muted-foreground">Confirm Password</label>
                                <Input
                                    type="password"
                                    value={disablePassword}
                                    onChange={(e) => setDisablePassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="bg-[#09090b] border-white/10 text-white focus:border-red-500/50 h-9"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={reset2FAState}
                                    className="flex-1 border-white/10 hover:bg-white/5"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={disable2FA}
                                    disabled={twoFALoading || !disablePassword}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                                >
                                    {twoFALoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        'Disable 2FA'
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    {twoFAStep === 'regenerate' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <RefreshCw className="w-5 h-5 text-amber-500 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-amber-400">Regenerate Backup Codes</p>
                                        <p className="text-xs text-muted-foreground">
                                            This will invalidate all existing backup codes and generate new ones.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <label className="text-sm text-muted-foreground">Password</label>
                                    <Input
                                        type="password"
                                        value={regeneratePassword}
                                        onChange={(e) => setRegeneratePassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-[#09090b] border-white/10 text-white focus:border-amber-500/50 h-9"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm text-muted-foreground">2FA Code</label>
                                    <TotpInput
                                        value={regenerateCode}
                                        onChange={setRegenerateCode}
                                        error={!!twoFAError}
                                        disabled={twoFALoading}
                                        autoFocus={false}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={reset2FAState}
                                    className="flex-1 border-white/10 hover:bg-white/5"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={regenerateBackupCodes}
                                    disabled={twoFALoading || !regeneratePassword || regenerateCode.length !== 6}
                                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                                >
                                    {twoFALoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        'Regenerate Codes'
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
