import { ArrowDownToLine, Download, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ViewMode } from '@/lib/footage-app';

import type { LibrarySceneItem } from './types';

interface SceneListPanelProps {
  allScenes: LibrarySceneItem[];
  matchedScenes: LibrarySceneItem[];
  viewMode: ViewMode;
  hasSearchResults: boolean;
  activeSceneId: string | null;
  onSelectScene: (scene: LibrarySceneItem) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onTrimScene: (scene: LibrarySceneItem) => void;
  trimmingSceneId: string | null;
  emptyMessage?: string;
}

export function SceneListPanel({
  allScenes,
  matchedScenes,
  viewMode,
  hasSearchResults,
  activeSceneId,
  onSelectScene,
  onSetViewMode,
  onTrimScene,
  trimmingSceneId,
  emptyMessage,
}: SceneListPanelProps) {
  const scenes = viewMode === 'matched' ? matchedScenes : allScenes;
  const DownloadIcon = viewMode === 'full' ? ArrowDownToLine : Download;

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-3 py-2 border-b border-border shrink-0">
        <button
          onClick={() => onSetViewMode('full')}
          className={cn(
            'px-2.5 py-1 rounded text-xs font-medium transition-colors',
            viewMode === 'full'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover',
          )}
        >
          Toàn bộ phân tích
        </button>
        <button
          onClick={() => hasSearchResults && onSetViewMode('matched')}
          disabled={!hasSearchResults}
          className={cn(
            'px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            viewMode === 'matched'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover',
          )}
        >
          Kết quả tìm kiếm
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {scenes.length > 0 ? (
          scenes.map((scene) => {
            const isActive = activeSceneId === scene.id;
            const isTrimming = trimmingSceneId === scene.id;

            return (
              <button
                key={scene.id}
                onClick={() => onSelectScene(scene)}
                className={cn(
                  'w-full text-left border-l-2 border-b border-b-border transition-colors px-3 py-3',
                  isActive ? 'bg-primary/10 border-l-primary' : 'border-l-transparent hover:bg-surface-hover',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-primary/15 text-primary text-[12px] font-bold tracking-[0.01em]">
                    {scene.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/60 px-2 py-1 text-xs font-semibold text-foreground/85">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-primary/15 text-primary">
                        <Play className="h-2.5 w-2.5" />
                      </span>
                      <span>
                        {scene.startTime}s - {scene.endTime}s
                      </span>
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
                      title={isTrimming ? 'Đang cắt' : 'Tải xuống'}
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
          <div className="flex items-center justify-center py-10 px-4">
            <p className="text-xs text-muted-foreground text-center">
              {emptyMessage || (viewMode === 'matched' ? 'Không có cảnh khớp từ khóa' : 'Chưa có cảnh phân tích')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
