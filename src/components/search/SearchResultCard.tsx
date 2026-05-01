import { useState } from 'react';

import { ArrowDownToLine, ChevronDown, Download, FileText, Loader2, Play, RefreshCw } from 'lucide-react';

import { SourceBadge } from '@/components/library/SourceBadge';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/lib/footage-app';

import type { SessionScene, SessionVideo } from './types';

interface SearchResultCardProps {
  video: SessionVideo;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onSwitchVersion: (versionIndex: number) => void;
  onRetry: () => void;
  onExportSRT: () => void;
  onPlayScene: (scene: SessionScene) => void;
  onTrimScene: (scene: SessionScene) => void;
  trimmingSceneId: string | null;
  videoSrc: string;
  onPlayerRef: (node: HTMLVideoElement | null) => void;
  onPlayerLoadedMetadata: () => void;
  onPlayerTimeUpdate: () => void;
}

export function SearchResultCard({
  video,
  viewMode,
  onSetViewMode,
  onSwitchVersion,
  onRetry,
  onExportSRT,
  onPlayScene,
  onTrimScene,
  trimmingSceneId,
  videoSrc,
  onPlayerRef,
  onPlayerLoadedMetadata,
  onPlayerTimeUpdate,
}: SearchResultCardProps) {
  const [activeScene, setActiveScene] = useState<SessionScene | null>(null);
  const scenes = viewMode === 'matched' ? video.searchResults : video.scenes;
  const DownloadIcon = viewMode === 'full' ? ArrowDownToLine : Download;

  if (video.status === 'analyzing') {
    return (
      <div className="border border-border overflow-hidden bg-background">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{video.fileName}</span>
            <SourceBadge source={video.source} />
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">Đang phân tích video...</p>
            <p className="text-[11px] text-muted-foreground mt-1">Quá trình này có thể mất vài phút</p>
          </div>
        </div>
      </div>
    );
  }

  if (video.status === 'error') {
    return (
      <div className="border border-badge-error/30 overflow-hidden bg-background">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{video.fileName}</span>
            <SourceBadge source={video.source} />
          </div>
          <button onClick={onRetry} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-secondary text-secondary-foreground hover:bg-surface-hover">
            <RefreshCw className="h-3 w-3" /> Thử lại
          </button>
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-xs text-badge-error">{video.error || 'Phân tích thất bại. Vui lòng thử lại.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border overflow-hidden bg-background">
      <div className="px-4 py-2.5 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{video.fileName}</span>
            <SourceBadge source={video.source} />
            <span className="text-[11px] text-muted-foreground">{video.duration}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs text-secondary-foreground hover:bg-surface-hover">
                v{video.version} <ChevronDown className="h-3 w-3" />
              </button>
              <select value={video.version - 1} onChange={(e) => onSwitchVersion(parseInt(e.target.value, 10))} className="absolute inset-0 opacity-0 cursor-pointer">
                {Array.from({ length: video.totalVersions }).map((_, index) => (
                  <option key={index} value={index}>v{index + 1}</option>
                ))}
              </select>
            </div>
            <button onClick={onRetry} className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs text-secondary-foreground hover:bg-surface-hover">
              <RefreshCw className="h-3 w-3" /> Phân tích lại
            </button>
            <button onClick={onExportSRT} className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs text-secondary-foreground hover:bg-surface-hover">
              <FileText className="h-3 w-3" /> Xuất SRT
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1">
            <button
              onClick={() => onSetViewMode('matched')}
              disabled={!video.currentKeywords}
              className={cn(
                'px-2.5 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                viewMode === 'matched' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Kết quả tìm kiếm ({video.searchResults.length})
            </button>
            <button
              onClick={() => onSetViewMode('full')}
              className={cn(
                'px-2.5 py-1.5 text-[13px] font-semibold transition-colors',
                viewMode === 'full' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Toàn bộ phân tích ({video.scenes.length})
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-[500px]">
        <div className="flex-1 min-w-0 bg-black/20">
          <div className="flex h-full items-center justify-center p-4">
            <div className="w-full max-w-[360px] rounded-md bg-black/40 overflow-hidden">
              <video
                ref={onPlayerRef}
                src={videoSrc}
                preload="metadata"
                onLoadedMetadata={onPlayerLoadedMetadata}
                onTimeUpdate={onPlayerTimeUpdate}
                controls
                className="aspect-[9/16] w-full bg-black object-contain"
              />
              {activeScene ? (
                <div className="px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">@ {activeScene.startTime}s</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="w-[420px] border-l border-border shrink-0">
          {video.searchResults.length === 0 && video.scenes.length === 0 ? (
            <div className="px-4 py-3 border-b border-border bg-badge-web/10 text-xs text-badge-web">
              Chưa có dữ liệu scene từ backend cho video này.
            </div>
          ) : null}
          <div className="h-full overflow-y-auto custom-scrollbar">
            {scenes.length > 0 ? (
              scenes.map((scene) => {
                const isActive = activeScene?.id === scene.id;
                const isTrimming = trimmingSceneId === scene.id;
                return (
                  <button
                    key={scene.id}
                    onClick={() => {
                      setActiveScene(scene);
                      onPlayScene(scene);
                    }}
                    className={cn(
                      'w-full text-left border-l-2 border-b border-b-border transition-colors px-3 py-3',
                      isActive ? 'bg-primary/10 border-l-primary' : 'border-l-transparent hover:bg-surface-hover',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-primary/15 text-primary text-[12px] font-bold tracking-[0.01em]">
                        {scene.keyword || scene.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/60 px-2 py-1 text-xs font-semibold text-foreground/85">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-primary/15 text-primary">
                            <Play className="h-2.5 w-2.5" />
                          </span>
                          <span>{scene.startTime}s - {scene.endTime}s</span>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onTrimScene(scene);
                          }}
                          className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-secondary/60 text-muted-foreground transition-colors',
                            'hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
                          )}
                          title="Tải xuống"
                        >
                          <DownloadIcon className={cn('h-3.5 w-3.5', isTrimming && 'animate-pulse')} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-relaxed text-foreground/85">
                      {scene.description}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="flex items-center justify-center py-10">
                <p className="text-xs text-muted-foreground text-center px-4">
                  {viewMode === 'matched' ? 'Không có cảnh khớp từ khóa' : 'Chưa có cảnh phân tích'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
