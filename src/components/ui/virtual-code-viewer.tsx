/**
 * Virtual Code Viewer Component
 * 
 * Efficiently renders large code blocks using virtualization.
 * Only renders visible lines, making it performant for DOMs > 1MB.
 * 
 * Uses native browser virtualization with custom ResizeObserver.
 */

'use client';

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';

interface VirtualCodeViewerProps {
  code: string;
  language?: string;
  lineHeight?: number;
  showLineNumbers?: boolean;
  className?: string;
  maxHeight?: number;
  overscan?: number;
}

// Custom hook for resize observer
function useResizeObserver<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

// Simple syntax highlighting for HTML (lightweight, no external deps)
function highlightLine(line: string, language: string): React.ReactNode {
  if (language !== 'html') {
    return line || ' ';
  }

  // Basic HTML syntax highlighting
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  
  // Match patterns: tags, attributes, strings, comments
  const patterns = [
    { regex: /(&lt;!--[\s\S]*?--&gt;|<!--[\s\S]*?-->)/g, className: 'text-zinc-500' },
    { regex: /(&lt;\/?[\w-]+|<\/?[\w-]+)/g, className: 'text-cyan-400' },
    { regex: /([\w-]+)=/g, className: 'text-violet-400' },
    { regex: /(".*?"|'.*?')/g, className: 'text-emerald-400' },
    { regex: /(&gt;|>)/g, className: 'text-cyan-400' },
  ];

  // Simple tokenization (order matters)
  const tokens: { start: number; end: number; className: string; text: string }[] = [];
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        className: pattern.className,
        text: match[0],
      });
    }
  }

  // Sort by position and remove overlaps
  tokens.sort((a, b) => a.start - b.start);
  const filtered: typeof tokens = [];
  for (const token of tokens) {
    if (filtered.length === 0 || token.start >= filtered[filtered.length - 1].end) {
      filtered.push(token);
    }
  }

  // Build highlighted line
  for (const token of filtered) {
    if (token.start > lastIndex) {
      parts.push(<span key={`plain-${lastIndex}`}>{line.substring(lastIndex, token.start)}</span>);
    }
    parts.push(
      <span key={`token-${token.start}`} className={token.className}>
        {token.text}
      </span>
    );
    lastIndex = token.end;
  }

  if (lastIndex < line.length) {
    parts.push(<span key={`end-${lastIndex}`}>{line.substring(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : (line || ' ');
}

export function VirtualCodeViewer({
  code,
  language = 'html',
  lineHeight = 20,
  showLineNumbers = true,
  className = '',
  maxHeight = 500,
  overscan = 10,
}: VirtualCodeViewerProps) {
  const [containerRef, containerSize] = useResizeObserver<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Split code into lines
  const lines = useMemo(() => code.split('\n'), [code]);

  // Calculate line number width based on total lines
  const lineNumberWidth = useMemo(() => {
    const digits = String(lines.length).length;
    return Math.max(digits * 10 + 20, 40);
  }, [lines.length]);

  // Delay rendering for smooth initial load
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate visible range
  const { visibleStart, visibleEnd, totalHeight, paddingTop } = useMemo(() => {
    const viewportHeight = containerSize.height || maxHeight;
    const totalHeight = lines.length * lineHeight;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - overscan);
    const endIndex = Math.min(
      lines.length,
      Math.ceil((scrollTop + viewportHeight) / lineHeight) + overscan
    );
    
    return {
      visibleStart: startIndex,
      visibleEnd: endIndex,
      totalHeight,
      paddingTop: startIndex * lineHeight,
    };
  }, [scrollTop, containerSize.height, lines.length, lineHeight, overscan, maxHeight]);

  // Memoized visible lines
  const visibleLines = useMemo(() => {
    return lines.slice(visibleStart, visibleEnd).map((line, idx) => {
      const lineNumber = visibleStart + idx + 1;
      return (
        <div
          key={visibleStart + idx}
          className="flex hover:bg-white/5 transition-colors"
          style={{ height: lineHeight }}
        >
          {showLineNumbers && (
            <div
              style={{ width: lineNumberWidth }}
              className="flex-shrink-0 px-2 text-right text-zinc-600 select-none border-r border-zinc-800 bg-zinc-950 leading-5"
            >
              {lineNumber}
            </div>
          )}
          <pre className="flex-1 px-3 overflow-hidden text-ellipsis whitespace-pre text-zinc-300 font-mono text-[13px] leading-5">
            {highlightLine(line, language)}
          </pre>
        </div>
      );
    });
  }, [lines, visibleStart, visibleEnd, lineHeight, showLineNumbers, lineNumberWidth, language]);

  // Computed height
  const computedHeight = Math.min(maxHeight, lines.length * lineHeight);

  // Loading state
  if (!isReady) {
    return (
      <div
        className={`bg-zinc-950 rounded border border-zinc-800 flex items-center justify-center ${className}`}
        style={{ height: computedHeight }}
      >
        <div className="text-zinc-500 text-sm">Loading {lines.length.toLocaleString()} lines...</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`bg-zinc-950 rounded border border-zinc-800 overflow-hidden ${className}`}
      style={{ height: computedHeight }}
    >
      <div
        ref={scrollRef}
        className="h-full overflow-auto"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: paddingTop, left: 0, right: 0 }}>
            {visibleLines}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stats component for showing code metrics
export function CodeStats({ code, label = 'Content' }: { code: string; label?: string }) {
  const stats = useMemo(() => {
    const lineCount = code.split('\n').length;
    const chars = code.length;
    const kb = (chars / 1024).toFixed(1);
    const mb = chars > 1024 * 1024 ? (chars / (1024 * 1024)).toFixed(2) : null;
    
    return {
      lines: lineCount.toLocaleString(),
      chars: chars.toLocaleString(),
      size: mb ? `${mb} MB` : `${kb} KB`,
    };
  }, [code]);

  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <span>{label}</span>
      <span className="text-zinc-600">|</span>
      <span>{stats.lines} lines</span>
      <span className="text-zinc-600">|</span>
      <span>{stats.size}</span>
    </div>
  );
}

export default VirtualCodeViewer;
