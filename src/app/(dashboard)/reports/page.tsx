'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Eye,
    Archive,
    Trash2,
    AlertTriangle,
    Shield,
    Search,
    CheckSquare,
    Square,
    MinusSquare,
    ChevronDown,
    ListChecks,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/settings-context';
import { apiPatch, apiDelete } from '@/lib/api-client';
import { toast } from 'sonner';

// Reuse the visual logic from Dashboard but applied to Reports
interface Report {
    id: string;
    uri: string | null;
    origin: string | null;
    user_agent: string | null;
    ip: string | null;
    triggered_at: string;
    read: boolean;
    archived: boolean;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export default function ReportsPage() {
    const { formatDateTime } = useSettings();
    const [reports, setReports] = useState<Report[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; report: Report | null; bulk?: boolean }>({ open: false, report: null });
    const [deleting, setDeleting] = useState(false);
    const [perPage, setPerPage] = useState(10);
    const [showPerPageDropdown, setShowPerPageDropdown] = useState(false);
    
    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkActioning, setBulkActioning] = useState(false);
    const [bulkMode, setBulkMode] = useState(false);

    const fetchReports = async (page = 1, limit = perPage) => {
        try {
            setLoading(true);
            const res = await fetch(`/api/reports?page=${page}&limit=${limit}&archived=${showArchived}`);
            if (res.ok) {
                const data = await res.json();
                setReports(data.reports);
                setPagination(data.pagination);
                // Clear selection when data changes
                setSelectedIds(new Set());
                setBulkMode(false);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports(1, perPage);
    }, [showArchived, perPage]);

    const handleArchive = async (id: string, archived: boolean) => {
        const res = await apiPatch(`/api/reports/${id}`, { archived });
        if (res.ok) {
            fetchReports(pagination.page, perPage);
            toast.success(archived ? 'Report archived' : 'Report unarchived');
        } else {
            toast.error('Failed to update report');
        }
    };

    const handleBulkArchive = async (archive: boolean) => {
        if (selectedIds.size === 0) return;
        setBulkActioning(true);
        try {
            const res = await apiPatch('/api/reports/bulk', { ids: Array.from(selectedIds), archived: archive });
            if (res.ok) {
                fetchReports(pagination.page, perPage);
                toast.success(`${selectedIds.size} reports ${archive ? 'archived' : 'unarchived'}`);
                setSelectedIds(new Set());
            } else {
                toast.error('Failed to update reports');
            }
        } finally {
            setBulkActioning(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        setBulkActioning(true);
        try {
            const idsArray = Array.from(selectedIds);
            const res = await apiDelete('/api/reports/bulk', { ids: idsArray });
            if (res.ok) {
                setDeleteModal({ open: false, report: null });
                setSelectedIds(new Set());
                fetchReports(pagination.page, perPage);
                toast.success(`${idsArray.length} reports deleted`);
            } else {
                toast.error('Failed to delete reports');
            }
        } catch {
            toast.error('Something went wrong');
        } finally {
            setBulkActioning(false);
        }
    };

    const handleDelete = async () => {
        if (deleteModal.bulk) {
            await handleBulkDelete();
            return;
        }
        if (!deleteModal.report) return;
        setDeleting(true);
        const res = await apiDelete(`/api/reports/${deleteModal.report.id}`);
        if (res.ok) {
            setDeleteModal({ open: false, report: null });
            fetchReports(pagination.page, perPage);
            toast.success('Report deleted');
        } else {
            toast.error('Failed to delete report');
        }
        setDeleting(false);
    };

    const openDeleteModal = (report: Report) => {
        setDeleteModal({ open: true, report });
    };

    const openBulkDeleteModal = () => {
        setDeleteModal({ open: true, report: null, bulk: true });
    };

    // Selection handlers
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredReports.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredReports.map(r => r.id)));
        }
    };

    const filteredReports = reports.filter((report) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            report.origin?.toLowerCase().includes(term) ||
            report.uri?.toLowerCase().includes(term) ||
            report.ip?.toLowerCase().includes(term)
        );
    });

    const allSelected = filteredReports.length > 0 && selectedIds.size === filteredReports.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < filteredReports.length;

    return (
        <div className="space-y-6 pb-10">
            {/* Delete Modal */}
            {deleteModal.open && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-[#18181c] rounded-lg border border-[#27272a] w-full max-w-sm mx-4 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-red-500/10">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                            </div>
                            <h3 className="text-white font-medium">
                                {deleteModal.bulk ? `Delete ${selectedIds.size} Reports` : 'Delete Report'}
                            </h3>
                        </div>
                        <p className="text-muted-foreground text-sm mb-5">
                            {deleteModal.bulk 
                                ? `Are you sure you want to delete ${selectedIds.size} selected reports? This action cannot be undone.`
                                : 'Are you sure you want to delete this report? This action cannot be undone.'
                            }
                        </p>
                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={() => setDeleteModal({ open: false, report: null })} 
                                className="px-3 py-1.5 text-sm text-white hover:bg-white/5 rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleDelete} 
                                disabled={deleting || bulkActioning}
                                className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
                            >
                                {(deleting || bulkActioning) ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header + Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Reports</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">{pagination.total} items</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative w-full sm:w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#18181c] text-sm text-white placeholder-muted-foreground/70 rounded py-1.5 pl-9 pr-3 border border-[#27272a] focus:ring-1 focus:ring-[#3f3f46] focus:outline-none"
                        />
                    </div>
                    <Button
                        variant={bulkMode ? "secondary" : "outline"}
                        onClick={() => { setBulkMode(!bulkMode); if (bulkMode) setSelectedIds(new Set()); }}
                        className={cn("rounded text-xs px-3 py-1 h-8", bulkMode ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-[#18181c] text-muted-foreground border border-[#27272a] hover:text-white")}
                    >
                        {bulkMode ? <X className="w-4 h-4 mr-1.5" /> : <ListChecks className="w-4 h-4 mr-1.5" />}
                        {bulkMode ? 'Cancel' : 'Bulk'}
                    </Button>
                    <Button
                        variant={showArchived ? "secondary" : "outline"}
                        onClick={() => setShowArchived(!showArchived)}
                        className={cn("rounded text-xs px-3 py-1 h-8", showArchived ? "bg-orange-500/10 text-orange-500 border-orange-500/20" : "bg-[#18181c] text-muted-foreground border border-[#27272a] hover:text-white")}
                    >
                        <Archive className="w-4 h-4 mr-1.5" />
                        {showArchived ? 'Archived' : 'Archive'}
                    </Button>
                </div>
            </div>

            {/* Bulk Actions Bar - Show when bulk mode is active */}
            {bulkMode && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-4 py-2.5 flex items-center justify-between animate-in slide-in-from-top-2">
                    <span className="text-indigo-400 text-sm font-medium">
                        {selectedIds.size === 0 
                            ? 'Select reports to perform bulk actions' 
                            : `${selectedIds.size} ${selectedIds.size === 1 ? 'report' : 'reports'} selected`
                        }
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleBulkArchive(!showArchived)}
                            disabled={bulkActioning || selectedIds.size === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-500/10 text-orange-400 text-xs font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                        >
                            <Archive className="w-3.5 h-3.5" />
                            {showArchived ? 'Unarchive' : 'Archive'}
                        </button>
                        <button
                            onClick={openBulkDeleteModal}
                            disabled={bulkActioning || selectedIds.size === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </button>
                        {selectedIds.size > 0 && (
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="px-3 py-1.5 rounded text-muted-foreground text-xs hover:text-white transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Custom Table Implementation to Match Reference Image */}
            <div className="bg-[#18181c] rounded-lg overflow-hidden p-4 border border-[#27272a]">
                {/* Table Header */}
                <div className={cn(
                    "grid gap-4 mb-4 px-3",
                    bulkMode 
                        ? "grid-cols-[32px_35px_minmax(80px,1fr)_130px_60px_185px_70px]"
                        : "grid-cols-[35px_minmax(80px,1fr)_130px_60px_185px_70px]"
                )}>
                    {bulkMode && (
                        <button 
                            onClick={toggleSelectAll}
                            className="flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
                        >
                            {allSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-400" />
                            ) : someSelected ? (
                                <MinusSquare className="w-4 h-4 text-indigo-400" />
                            ) : (
                                <Square className="w-4 h-4" />
                            )}
                        </button>
                    )}
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">ID</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">Origin</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold hidden sm:block">IP</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">Status</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold">Triggered</span>
                    <span className="text-muted-foreground/50 text-xs uppercase tracking-wider font-semibold text-right">Action</span>
                </div>

                <div className="space-y-1">
                    {loading ? (
                        <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
                    ) : filteredReports.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-sm">No reports found</div>
                    ) : (
                        filteredReports.map((report, idx) => (
                            <div 
                                key={report.id} 
                                className={cn(
                                    "grid gap-2 py-2.5 px-3 rounded transition-colors items-center",
                                    bulkMode 
                                        ? "grid-cols-[32px_35px_minmax(80px,1fr)_130px_60px_185px_70px]"
                                        : "grid-cols-[35px_minmax(80px,1fr)_130px_60px_185px_70px]",
                                    selectedIds.has(report.id) ? "bg-indigo-500/10" : "hover:bg-white/5"
                                )}
                            >
                                {bulkMode && (
                                    <button 
                                        onClick={() => toggleSelect(report.id)}
                                        className="flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
                                    >
                                        {selectedIds.has(report.id) ? (
                                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                    </button>
                                )}

                                <span className="text-white/30 text-sm font-mono">#{(pagination.page - 1) * pagination.limit + idx + 1}</span>

                                <Link href={`/reports/${report.id}`} className="flex items-center gap-2 overflow-hidden group cursor-pointer">
                                    <div className="h-7 w-7 rounded min-w-[28px] bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                        <Shield className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="flex flex-col truncate">
                                        <span className="text-white font-medium truncate text-sm group-hover:text-indigo-400 transition-colors">{report.origin || 'Unknown'}</span>
                                        <span className="text-xs text-muted-foreground font-mono truncate">{report.uri}</span>
                                    </div>
                                </Link>

                                <span className="text-white/70 text-sm font-mono hidden sm:block truncate">{report.ip || '::1'}</span>

                                <div>
                                    {report.archived ? (
                                        <span className="px-2 py-0.5 rounded bg-[#2e241d] text-[#fbbf24] text-xs font-medium">Archived</span>
                                    ) : !report.read ? (
                                        <span className="px-2 py-0.5 rounded bg-[#1c2e26] text-[#34d399] text-xs font-medium">New</span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded bg-[#251e36] text-[#a78bfa] text-xs font-medium">Viewed</span>
                                    )}
                                </div>

                                <span className="text-white/50 text-sm font-mono whitespace-nowrap">
                                    {formatDateTime(report.triggered_at)}
                                </span>

                                <div className="flex justify-end gap-1">
                                    <Link href={`/reports/${report.id}`} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-white hover:bg-white/10 transition-colors" title="View">
                                        <Eye className="h-4 w-4" />
                                    </Link>
                                    <button
                                        onClick={() => handleArchive(report.id, !report.archived)}
                                        className={cn(
                                            "h-7 w-7 flex items-center justify-center rounded transition-colors",
                                            report.archived 
                                                ? "text-orange-400 hover:text-orange-300 hover:bg-orange-400/10" 
                                                : "text-muted-foreground hover:text-orange-400 hover:bg-orange-400/10"
                                        )}
                                        title={report.archived ? "Unarchive" : "Archive"}
                                    >
                                        <Archive className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => openDeleteModal(report)}
                                        className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination + Per Page */}
                <div className="mt-6 flex items-center justify-between">
                    {/* Per Page Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowPerPageDropdown(!showPerPageDropdown)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#27272a] text-white text-sm hover:bg-[#3f3f46] transition-colors"
                        >
                            <span>{perPage} per page</span>
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        {showPerPageDropdown && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowPerPageDropdown(false)} />
                                <div className="absolute left-0 bottom-full mb-1 bg-[#27272a] border border-[#3f3f46] rounded-lg py-1 min-w-[100px] z-20 shadow-xl">
                                    {[10, 20, 50, 100].map((n) => (
                                        <button
                                            key={n}
                                            onClick={() => { setPerPage(n); setShowPerPageDropdown(false); }}
                                            className={cn(
                                                "w-full px-3 py-1.5 text-left text-sm hover:bg-white/10 transition-colors",
                                                perPage === n ? "text-indigo-400" : "text-white"
                                            )}
                                        >
                                            {n} per page
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => fetchReports(pagination.page - 1, perPage)} disabled={pagination.page === 1} className="rounded border-[#27272a] bg-transparent text-white text-sm h-8 px-3">Previous</Button>
                            <span className="flex items-center text-sm text-muted-foreground px-2">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => fetchReports(pagination.page + 1, perPage)} disabled={pagination.page === pagination.totalPages} className="rounded border-[#27272a] bg-transparent text-white text-sm h-8 px-3">Next</Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
