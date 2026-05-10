import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, MoreHorizontal, PanelRight, Pencil, Trash2 } from 'lucide-react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { StoryboardTimeline } from '@/lib/footage-app';
import { cn } from '@/lib/utils';

export interface StoryboardTimelinePanelProps {
  canUseTimeline: boolean;
  timelines: StoryboardTimeline[];
  selectedTimelineId: string | null;
  isCollapsed: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isExporting: boolean;
  onToggleCollapsed: () => void;
  onCreateTimeline: (name?: string, quickCreate?: boolean) => void;
  onSelectTimeline: (timelineId: string) => void;
  onRenameTimeline: (timelineId: string, name: string) => void;
  onDeleteTimeline: (timelineId: string) => void;
  onAddStoryboard: () => void;
  onMoveClip: (clipId: string, direction: 'up' | 'down') => void;
  onRemoveClip: (clipId: string) => void;
  onClearClips: () => void;
  onExport: (timelineId: string) => void;
}

const toTimelineSeconds = (seconds: number) => Math.max(0, Math.round(seconds));

const formatDuration = (seconds: number) => {
  const safeSeconds = toTimelineSeconds(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export function StoryboardTimelinePanel({
  canUseTimeline,
  timelines,
  selectedTimelineId,
  isCollapsed,
  isLoading,
  isSaving,
  isExporting,
  onToggleCollapsed,
  onCreateTimeline,
  onSelectTimeline,
  onRenameTimeline,
  onDeleteTimeline,
  onAddStoryboard,
  onMoveClip,
  onRemoveClip,
  onClearClips,
  onExport,
}: StoryboardTimelinePanelProps) {
  const selectedTimeline = timelines.find((timeline) => timeline.id === selectedTimelineId) ?? timelines[0] ?? null;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [quickCreate, setQuickCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<StoryboardTimeline | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StoryboardTimeline | null>(null);
  const [isTimelineListExpanded, setIsTimelineListExpanded] = useState(true);
  const clipCount = selectedTimeline?.clips.length ?? 0;
  const totalDuration = selectedTimeline?.clips.reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0) ?? 0;
  const isBusy = isLoading || isSaving;
  const canExport = Boolean(selectedTimeline && clipCount > 0 && !isBusy && !isExporting);

  const openRenameDialog = (timeline: StoryboardTimeline) => {
    setRenameTarget(timeline);
    setRenameName(timeline.name);
  };

  const submitCreate = () => {
    if (isBusy) return;
    onCreateTimeline(createName.trim() || undefined, quickCreate);
    setCreateName('');
    setQuickCreate(false);
    setIsCreateDialogOpen(false);
  };

  const submitRename = () => {
    if (!renameTarget || isBusy) return;
    onRenameTimeline(renameTarget.id, renameName.trim() || renameTarget.name);
    setRenameTarget(null);
    setRenameName('');
  };

  const confirmDelete = () => {
    if (!deleteTarget || isBusy) return;
    onDeleteTimeline(deleteTarget.id);
    setDeleteTarget(null);
  };

  if (!canUseTimeline) {
    return (
      <section className="rounded-md border border-dashed border-border bg-card/40 p-4 text-center">
        <p className="text-sm font-medium text-foreground">Lưu storyboard để tạo bản dựng</p>
      </section>
    );
  }

  if (isCollapsed) {
    return (
      <section className="flex h-full min-h-0 items-stretch overflow-hidden rounded-md border border-border bg-card/60">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Mở timeline bản dựng"
          className="flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-between gap-3 px-2 py-3 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] [writing-mode:vertical-rl]">
            Timeline
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            {clipCount}
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md bg-card/50">
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-[13px] font-semibold text-white">Timeline bản dựng</h4>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Đang tải bản dựng...' : isSaving ? 'Đang lưu bản dựng...' : selectedTimeline ? `${clipCount} clip · ${formatDuration(totalDuration)}` : 'Chưa có bản dựng'}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCreateDialogOpen(true)}
              disabled={isBusy}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tạo bản dựng
            </button>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Thu gọn timeline bản dựng"
              title="Thu gọn"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-secondary-foreground transition-colors hover:bg-surface-hover"
            >
              <PanelRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-border">
        <div className="overflow-hidden bg-background/20">
          <button
            type="button"
            onClick={() => setIsTimelineListExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-secondary-foreground">
              {isTimelineListExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
              Danh sách bản dựng
            </span>
            <span className="text-[11px] text-muted-foreground">{timelines.length} bản</span>
          </button>
          {isTimelineListExpanded ? (
            <div className="max-h-36 overflow-y-auto custom-scrollbar">
              {timelines.map((timeline) => {
                const isSelected = timeline.id === selectedTimeline?.id;
                const timelineDuration = timeline.clips.reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0);

                return (
                  <div
                    key={timeline.id}
                    data-testid={`timeline-row-${timeline.id}`}
                    className={cn(
                      'flex items-center gap-1 border-b border-l-2 border-border/40 px-2 py-1.5 ring-inset last:border-b-0',
                      isSelected ? 'border-l-primary bg-primary/15 ring-1 ring-primary/20' : 'border-l-transparent hover:bg-surface-hover',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTimeline(timeline.id)}
                      disabled={isBusy}
                      className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className={cn('block truncate text-xs font-semibold', isSelected ? 'text-primary' : 'text-foreground')}>{timeline.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{timeline.clips.length} clip · {formatDuration(timelineDuration)}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={isBusy}
                          aria-label={`Mở menu bản dựng ${timeline.name}`}
                          className="shrink-0 rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border/70 hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[7rem] p-0.5">
                        <DropdownMenuItem onClick={() => openRenameDialog(timeline)} className="gap-1.5 rounded px-2 py-1.5 text-xs">
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Sửa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteTarget(timeline)} className="gap-1.5 rounded px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 focus:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Xóa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button type="button" data-testid={`rename-trigger-${timeline.id}`} onClick={() => openRenameDialog(timeline)} className="hidden" aria-hidden="true" />
                    <button type="button" data-testid={`delete-trigger-${timeline.id}`} onClick={() => setDeleteTarget(timeline)} className="hidden" aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {selectedTimeline ? (
        <div data-testid="selected-timeline-actions-row" className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">Thao tác</span>
          <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onAddStoryboard}
            disabled={!selectedTimeline || isBusy}
            className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tạo nhanh
          </button>
          <button
            type="button"
            onClick={onClearClips}
            disabled={!selectedTimeline || clipCount === 0 || isBusy}
            className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Làm mới
          </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 custom-scrollbar">
        {selectedTimeline && selectedTimeline.clips.length > 0 ? (
          <ol className="space-y-2">
            {selectedTimeline.clips.map((clip, index) => {
              const clipStart = toTimelineSeconds(clip.start);
              const clipEnd = Math.max(clipStart, toTimelineSeconds(clip.end));
              const clipDuration = clipEnd - clipStart;

              return (
                <li key={clip.id} className="rounded-md border border-border/60 bg-background/35 p-2.5 transition-colors hover:bg-background/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">{clip.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{clip.filename}</p>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <span>{formatDuration(clipStart)} - {formatDuration(clipEnd)}</span>
                        <span> · {formatDuration(clipDuration)}</span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onMoveClip(clip.id, 'up')}
                        disabled={isBusy}
                        aria-label={`Đưa ${clip.label} lên`}
                        title="Lên"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveClip(clip.id, 'down')}
                        disabled={isBusy}
                        aria-label={`Đưa ${clip.label} xuống`}
                        title="Xuống"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveClip(clip.id)}
                        disabled={isBusy}
                        aria-label={`Xoá ${clip.label} khỏi timeline`}
                        title="Xoá"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-destructive/15 text-destructive transition-colors hover:bg-destructive/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {selectedTimeline ? 'Timeline này chưa có clip.' : 'Tạo hoặc chọn một bản dựng để bắt đầu.'}
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={() => selectedTimeline && onExport(selectedTimeline.id)}
          disabled={!canExport}
          className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? 'Đang xuất...' : 'Xuất clip rời (.zip)'}
        </button>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="overflow-hidden rounded-md border-border bg-card p-0 sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader data-slot="timeline-dialog-header" className="border-b border-border px-4 py-2">
            <DialogTitle className="text-base font-semibold">Tạo bản dựng</DialogTitle>
          </DialogHeader>
          <div data-slot="timeline-dialog-body" className="space-y-3 px-4 py-2">
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              <span>Tên bản dựng</span>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={quickCreate}
                onChange={(event) => setQuickCreate(event.target.checked)}
                className="h-4 w-4 rounded border border-border bg-background accent-primary"
              />
              Tạo nhanh từ storyboard
            </label>
          </div>
          <DialogFooter data-slot="timeline-dialog-footer" className="px-4 pb-2 pt-1">
            <button type="button" onClick={() => setIsCreateDialogOpen(false)} className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
              Hủy
            </button>
            <button type="button" onClick={submitCreate} disabled={isBusy} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              Tạo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="overflow-hidden rounded-md border-border bg-card p-0 sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader data-slot="timeline-dialog-header" className="border-b border-border px-4 py-2">
            <DialogTitle className="text-base font-semibold">Sửa tên bản dựng</DialogTitle>
          </DialogHeader>
          <div data-slot="timeline-dialog-body" className="px-4 py-2">
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              <span>Tên bản dựng</span>
              <input
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none"
              />
            </label>
          </div>
          <DialogFooter data-slot="timeline-dialog-footer" className="px-4 pb-2 pt-1">
            <button type="button" onClick={() => setRenameTarget(null)} className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
              Hủy
            </button>
            <button type="button" onClick={submitRename} disabled={isBusy} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              Lưu
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="overflow-hidden rounded-md border-border bg-card p-0 sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader data-slot="timeline-dialog-header" className="border-b border-border px-4 py-2">
            <DialogTitle className="text-base font-semibold">Xóa bản dựng</DialogTitle>
          </DialogHeader>
          <div data-slot="timeline-dialog-body" className="space-y-2 px-4 py-2 text-sm">
            <p className="text-foreground">
              Bạn muốn xóa bản dựng <span className="font-semibold">{deleteTarget?.name}</span>?
            </p>
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Tất cả clip trong bản dựng này sẽ bị xóa khỏi timeline.</p>
            </div>
          </div>
          <DialogFooter data-slot="timeline-dialog-footer" className="px-4 pb-2 pt-1">
            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
              Hủy
            </button>
            <button type="button" onClick={confirmDelete} disabled={isBusy} className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50">
              Xóa
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
