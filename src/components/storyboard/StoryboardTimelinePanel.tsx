import { useEffect, useState } from 'react';

import type { StoryboardTimeline } from '@/lib/footage-app';

export interface StoryboardTimelinePanelProps {
  canUseTimeline: boolean;
  timelines: StoryboardTimeline[];
  selectedTimelineId: string | null;
  isCollapsed: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isExporting: boolean;
  onToggleCollapsed: () => void;
  onCreateTimeline: () => void;
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
  const [draftName, setDraftName] = useState(selectedTimeline?.name ?? '');
  const clipCount = selectedTimeline?.clips.length ?? 0;
  const totalDuration = selectedTimeline?.clips.reduce((sum, clip) => sum + Math.max(0, clip.end - clip.start), 0) ?? 0;
  const isBusy = isLoading || isSaving;
  const canExport = Boolean(selectedTimeline && clipCount > 0 && !isBusy && !isExporting);

  useEffect(() => {
    setDraftName(selectedTimeline?.name ?? '');
  }, [selectedTimeline?.id, selectedTimeline?.name]);

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
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-[13px] font-semibold text-white">Timeline bản dựng</h4>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Đang tải bản dựng...' : isSaving ? 'Đang lưu bản dựng...' : selectedTimeline ? `${clipCount} clip · ${formatDuration(totalDuration)}` : 'Chưa có bản dựng'}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleCollapsed}
            className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover"
          >
            Thu gọn
          </button>
          <button
            type="button"
            onClick={onCreateTimeline}
            disabled={isBusy}
            className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tạo bản dựng mới
          </button>
        </div>

        {timelines.length > 0 ? (
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <label className="sr-only" htmlFor="storyboard-timeline-select">Chọn bản dựng</label>
            <select
              id="storyboard-timeline-select"
              value={selectedTimeline?.id ?? ''}
              onChange={(event) => onSelectTimeline(event.target.value)}
              disabled={isBusy}
              className="min-w-0 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none"
            >
              {timelines.map((timeline) => (
                <option key={timeline.id} value={timeline.id}>{timeline.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => selectedTimeline && onRenameTimeline(selectedTimeline.id, draftName.trim() || selectedTimeline.name)}
              disabled={!selectedTimeline || isBusy}
              className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Đổi tên
            </button>
            <button
              type="button"
              onClick={() => selectedTimeline && onDeleteTimeline(selectedTimeline.id)}
              disabled={!selectedTimeline || isBusy}
              className="rounded-md bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Xoá
            </button>
          </div>
        ) : null}

        {selectedTimeline ? (
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            disabled={isBusy}
            aria-label="Tên bản dựng"
            className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onAddStoryboard}
          disabled={!selectedTimeline || isBusy}
          className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Đưa storyboard vào timeline
        </button>
        <button
          type="button"
          onClick={onClearClips}
          disabled={!selectedTimeline || clipCount === 0 || isBusy}
          className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Xoá hết
        </button>
        <button
          type="button"
          onClick={() => selectedTimeline && onExport(selectedTimeline.id)}
          disabled={!canExport}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? 'Đang xuất...' : 'Xuất clip rời (.zip)'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar">
        {selectedTimeline && selectedTimeline.clips.length > 0 ? (
          <ol className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
            {selectedTimeline.clips.map((clip, index) => {
              const clipStart = toTimelineSeconds(clip.start);
              const clipEnd = Math.max(clipStart, toTimelineSeconds(clip.end));
              const clipDuration = clipEnd - clipStart;

              return (
                <li key={clip.id} className="bg-background/35 p-3 transition-colors hover:bg-background/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{clip.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{clip.filename}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span>{formatDuration(clipStart)} - {formatDuration(clipEnd)}</span>
                        <span> · {formatDuration(clipDuration)}</span>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onMoveClip(clip.id, 'up')}
                        disabled={isBusy}
                        aria-label={`Đưa ${clip.label} lên`}
                        className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Lên
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveClip(clip.id, 'down')}
                        disabled={isBusy}
                        aria-label={`Đưa ${clip.label} xuống`}
                        className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Xuống
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveClip(clip.id)}
                        disabled={isBusy}
                        aria-label={`Xoá ${clip.label} khỏi timeline`}
                        className="rounded-md bg-destructive/15 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Xoá
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
    </section>
  );
}
