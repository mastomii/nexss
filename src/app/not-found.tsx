'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Home, ArrowLeft } from 'lucide-react';

interface Star {
    id: number;
    top: string;
    left: string;
    size: string;
    opacity: number;
    animationDelay: string;
}

// Star Field Component
function StarField() {
    const [stars, setStars] = useState<Star[]>([]);

    useEffect(() => {
        const newStars: Star[] = [];
        const starCount = 100;

        for (let i = 0; i < starCount; i++) {
            newStars.push({
                id: i,
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                size: `${Math.random() * 3 + 1}px`,
                opacity: Math.random(),
                animationDelay: `${Math.random() * 5}s`,
            });
        }
        setStars(newStars);
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {stars.map((star) => (
                <div
                    key={star.id}
                    className="absolute rounded-full bg-white animate-pulse"
                    style={{
                        top: star.top,
                        left: star.left,
                        width: star.size,
                        height: star.size,
                        opacity: star.opacity,
                        animationDelay: star.animationDelay,
                        animationDuration: '3s',
                    }}
                />
            ))}
        </div>
    );
}

// Planet Component
function Planet() {
    return (
        <div className="absolute opacity-80 pointer-events-none z-0" style={{ right: '-5%', bottom: '-15%' }}>
            {/* Atmosphere glow */}
            <div className="w-[300px] h-[300px] md:w-[500px] md:h-[500px] rounded-full bg-gradient-to-br from-fuchsia-600/10 to-purple-600/20 blur-3xl absolute inset-0"></div>

            {/* Planet Body */}
            <svg
                viewBox="0 0 200 200"
                className="w-[200px] h-[200px] md:w-[400px] md:h-[400px] animate-pulse"
                style={{ animationDuration: '10s' }}
            >
                <defs>
                    <radialGradient id="planetGradient" cx="50%" cy="50%" r="50%" fx="20%" fy="20%">
                        <stop offset="0%" stopColor="#c026d3" />
                        <stop offset="50%" stopColor="#9333ea" />
                        <stop offset="100%" stopColor="#18181c" />
                    </radialGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <circle cx="100" cy="100" r="90" fill="url(#planetGradient)" filter="url(#glow)" />
                {/* Craters */}
                <circle cx="60" cy="60" r="10" fill="#581c87" opacity="0.3" />
                <circle cx="140" cy="80" r="15" fill="#581c87" opacity="0.2" />
                <circle cx="100" cy="150" r="20" fill="#581c87" opacity="0.1" />
            </svg>
        </div>
    );
}

export default function NotFound() {
    const handleGoHome = () => {
        window.location.href = '/';
    };

    const handleGoBack = () => {
        window.history.back();
    };

    return (
        <div className="relative w-full min-h-screen bg-[#09090b] flex flex-col items-center justify-center overflow-hidden font-sans text-white">
            {/* Background Elements */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#141417] via-[#09090b] to-[#09090b] z-0"></div>
            <StarField />
            <Planet />

            {/* Astronaut Image - Positioned at bottom right near planet glow */}
            <div className="absolute bottom-16 right-8 md:bottom-24 md:right-24 z-10">
                <div className="w-40 h-40 md:w-56 md:h-56 relative animate-bounce" style={{ animationDuration: '3s' }}>
                    <Image
                        src="/astronaut.png"
                        alt="Lost Astronaut"
                        fill
                        className="object-contain drop-shadow-2xl"
                        priority
                    />
                </div>
            </div>

            {/* Main Content Container */}
            <main className="relative z-10 container mx-auto px-4 flex flex-col items-center justify-center h-full min-h-[60vh]">

                {/* Text Side */}
                <div className="text-center space-y-4 max-w-md">
                    <div className="space-y-1">
                        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 to-purple-600 drop-shadow-lg">
                            404
                        </h1>
                        <h2 className="text-xl md:text-2xl font-semibold text-white">
                            Houston, we have a problem.
                        </h2>
                    </div>

                    <p className="text-[#a1a1aa] text-sm md:text-base leading-relaxed">
                        The page you are looking for seems to have drifted away into the deep unknown of the cosmos.
                    </p>

                    <div className="pt-2 flex flex-row gap-3 justify-center">
                        <button
                            onClick={handleGoHome}
                            className="group relative px-5 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-medium rounded-md overflow-hidden transition-all duration-300 shadow-[0_0_15px_rgba(192,38,211,0.3)] hover:shadow-[0_0_25px_rgba(192,38,211,0.5)] flex items-center gap-2"
                        >
                            <Home className="w-4 h-4" />
                            Return Home
                        </button>

                        <button
                            onClick={handleGoBack}
                            className="px-5 py-2.5 bg-transparent border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a1a1aa] text-sm font-medium rounded-md transition-all duration-300 flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Go Back
                        </button>
                    </div>
                </div>

            </main>

            {/* Footer / Status Bar */}
            <footer className="absolute bottom-4 w-full text-center z-10">
                <p className="text-[#a1a1aa] text-xs font-mono tracking-widest uppercase opacity-60">
                    System Status: Critical // Location: Unknown Sector
                </p>
            </footer>
        </div>
    );
}
