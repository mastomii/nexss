'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('[NeXSS Error]', error);
    }, [error]);

    const handleGoBack = () => {
        window.history.back();
    };

    const handleGoHome = () => {
        window.location.href = '/dashboard';
    };

    return (
        <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Error Card */}
                <div className="bg-[#18181c] rounded-lg border border-[#27272a] overflow-hidden">
                    {/* Header */}
                    <div className="p-6 border-b border-[#27272a]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-red-500/10">
                                <AlertTriangle className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
                                <p className="text-sm text-muted-foreground">An unexpected error occurred</p>
                            </div>
                        </div>
                    </div>

                    {/* Error Details */}
                    <div className="p-6 space-y-4">
                        {/* Error message */}
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-sm text-red-400 font-mono break-all">
                                {error.message || 'An unknown error occurred'}
                            </p>
                        </div>

                        {/* Error digest (if available) */}
                        {error.digest && (
                            <div className="text-xs text-muted-foreground">
                                <span className="text-muted-foreground/60">Error ID: </span>
                                <code className="bg-[#27272a] px-1.5 py-0.5 rounded">{error.digest}</code>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-2">
                            <button
                                onClick={() => reset()}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-medium transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                            <button
                                onClick={handleGoBack}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-transparent border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] text-sm font-medium transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Go Back
                            </button>
                        </div>

                        {/* Home link */}
                        <div className="text-center pt-2">
                            <button
                                onClick={handleGoHome}
                                className="text-sm text-muted-foreground hover:text-fuchsia-400 transition-colors"
                            >
                                Return to Dashboard
                            </button>
                        </div>
                    </div>
                </div>

                {/* Help text */}
                <p className="text-center text-xs text-muted-foreground/60 mt-4">
                    If this problem persists, please check the server logs or contact support.
                </p>
            </div>
        </div>
    );
}
