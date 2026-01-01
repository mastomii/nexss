'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, ArrowRight, ArrowLeft, Shield, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TotpInput } from '@/components/ui/totp-input';
import { toast } from 'sonner';

type LoginStep = 'credentials' | '2fa';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingDb, setCheckingDb] = useState(true);
    const [step, setStep] = useState<LoginStep>('credentials');
    const [userId, setUserId] = useState<string | null>(null);
    const [useBackupCode, setUseBackupCode] = useState(false);
    const [backupCode, setBackupCode] = useState('');
    const [totpError, setTotpError] = useState(false);
    const router = useRouter();

    // Check database health on mount - redirect to setup if there's an issue
    useEffect(() => {
        const checkDbHealth = async () => {
            try {
                const res = await fetch('/api/setup/health?refresh=true');
                const data = await res.json();

                // If database has any issue, redirect to setup
                if (data.status !== 'ok') {
                    router.replace('/setup');
                    return;
                }

                // Database is OK, show login form
                setCheckingDb(false);
            } catch {
                // If health check fails, redirect to setup
                router.replace('/setup');
            }
        };

        checkDbHealth();
    }, [router]);

    const handleCredentialsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (data.requires2FA) {
                // Move to 2FA step
                setUserId(data.userId);
                setStep('2fa');
                setTotpCode('');
            } else if (res.ok) {
                router.push('/dashboard');
            } else {
                toast.error(data.error || 'Invalid credentials');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const handle2FASubmit = async (code?: string) => {
        setLoading(true);
        setTotpError(false);

        const tokenToVerify = code || (useBackupCode ? backupCode : totpCode);

        if (!tokenToVerify || (!useBackupCode && tokenToVerify.length !== 6)) {
            toast.error('Please enter a valid code');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/auth/2fa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    token: tokenToVerify.replace(/-/g, ''),
                    isBackupCode: useBackupCode,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                router.push('/dashboard');
            } else {
                toast.error(data.error || 'Invalid verification code');
                setTotpError(true);
                setTotpCode('');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setLoading(false);
        }
    };



    const handleBackToCredentials = () => {
        setStep('credentials');
        setUserId(null);
        setTotpCode('');
        setBackupCode('');
        setTotpError(false);
        setUseBackupCode(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4 relative overflow-hidden">
            {/* Background Gradients for Premium Feel */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[128px]" />
            <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[128px]" />

            {checkingDb ? (
                <div className="flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-white/50" />
                </div>
            ) : (
                <Card className="w-full max-w-md border border-[#27272a] bg-[#18181c] shadow-2xl relative z-10 rounded-lg overflow-hidden">
                    {/* Brand Header */}
                    <div className="h-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 w-full" />

                    <CardHeader className="text-center pt-8 pb-2 space-y-3">
                        <div>
                            {step === 'credentials' ? (
                                <>
                                    <CardTitle className="text-xl font-bold text-white tracking-tight">Welcome Back</CardTitle>
                                    <CardDescription className="text-muted-foreground text-sm">Sign in to your dashboard</CardDescription>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-center mb-2">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                            <Shield className="w-6 h-6 text-emerald-500" />
                                        </div>
                                    </div>
                                    <CardTitle className="text-xl font-bold text-white tracking-tight">Two-Factor Authentication</CardTitle>
                                    <CardDescription className="text-muted-foreground text-sm">
                                        {useBackupCode
                                            ? 'Enter one of your backup codes'
                                            : 'Enter the 6-digit code from your authenticator app'
                                        }
                                    </CardDescription>
                                </>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="p-6">
                        {step === 'credentials' ? (
                            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Input
                                        type="text"
                                        placeholder="Username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="h-10 bg-[#09090b] border-white/5 text-white focus:border-indigo-500/50 focus:ring-indigo-500/20 rounded px-3 text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-10 bg-[#09090b] border-white/5 text-white focus:border-indigo-500/50 focus:ring-indigo-500/20 rounded px-3 text-sm"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={loading || !username || !password}
                                    className="w-full h-10 bg-white hover:bg-white/90 text-black font-semibold rounded text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            Sign In <ArrowRight className="w-4 h-4 ml-1.5" />
                                        </>
                                    )}
                                </Button>
                            </form>
                        ) : (
                            <div className="space-y-4">
                                {useBackupCode ? (
                                    <div className="space-y-3">
                                        <Input
                                            type="text"
                                            placeholder="XXXX-XXXX"
                                            value={backupCode}
                                            onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                                            className="h-12 bg-[#09090b] border-white/10 text-white text-center text-lg font-mono tracking-widest focus:border-emerald-500/50 rounded"
                                            maxLength={9}
                                        />
                                    </div>
                                ) : (
                                    <TotpInput
                                        value={totpCode}
                                        onChange={setTotpCode}
                                        error={totpError}
                                        disabled={loading}
                                    />
                                )}

                                <Button
                                    type="button"
                                    onClick={() => handle2FASubmit()}
                                    disabled={loading || (useBackupCode ? !backupCode : totpCode.length !== 6)}
                                    className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            Verify <ArrowRight className="w-4 h-4 ml-1.5" />
                                        </>
                                    )}
                                </Button>

                                <div className="flex items-center justify-between pt-2">
                                    <button
                                        type="button"
                                        onClick={handleBackToCredentials}
                                        className="text-sm text-muted-foreground hover:text-white transition-colors flex items-center gap-1"
                                    >
                                        <ArrowLeft className="w-3 h-3" />
                                        Back to login
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUseBackupCode(!useBackupCode);
                                            setTotpError(false);
                                            setTotpCode('');
                                            setBackupCode('');
                                        }}
                                        className="text-sm text-muted-foreground hover:text-white transition-colors flex items-center gap-1"
                                    >
                                        <KeyRound className="w-3 h-3" />
                                        {useBackupCode ? 'Use authenticator' : 'Use backup code'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mt-8 text-center">
                            <p className="text-xs text-muted-foreground/50 uppercase tracking-widest font-medium">
                                Lightweight Blind XSS Listener
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
