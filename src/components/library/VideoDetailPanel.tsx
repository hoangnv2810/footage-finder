import { useEffect, useMemo, useState } from 'react';

import { ChevronDown, FileText, Film, Search, Trash2 } from 'lucide-react';

import type { ViewMode } from '@/lib/footage-app';

import { SceneListPanel } from './SceneListPanel';
import { SourceBadge } from './SourceBadge';
import type { LibrarySceneItem, LibraryVideoItem, LibraryProduct } from './types';
import { VideoPlayerPanel } from './VideoPlayerPanel';

interface VideoDetailPanelProps {
  video: LibraryVideoItem;
  product: LibraryProduct;
  canUseInStoryboard: boolean;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onSwitchVersion: (versionIndex: number) => void;
  onExportSRT: () => void;
  onOpenInSearch: () => void;
  onOpenInStoryboard: () => void;
  onRemoveDataset: () => void;
  onPlayScene: (scene: LibrarySceneItem) => void;
  onTrimScene: (scene: LibrarySceneItem) => void;
  trimmingSceneId: string | null;
  videoSrc: string;
  previewMutedDefault?: boolean;
  onPlayerRef: (node: HTMLVideoElement | null) => void;
  onPlayerLoadedMetadata: () => void;
  onPlayerTimeUpdate: () => void;
}

export function VideoDetailPanel({
  video,
  product,
  canUseInStoryboard,
  viewMode,
  onSetViewMode,
  onSwitchVersion,
  onExportSRT,
  onOpenInSearch,
  onOpenInStoryboard,
  onRemoveDataset,
  onPlayScene,
  onTrimScene,
  trimmingSceneId,
  videoSrc,
  previewMutedDefault = false,
  onPlayerRef,
  onPlayerLoadedMetadata,
  onPlayerTimeUpdate,
}: VideoDetailPanelProps) {
  const [activeScene, setActiveScene] = useState<LibrarySceneItem | null>(null);

  const scenes = viewMode === 'matched' ? video.matchedScenes : video.scenes;
  const sceneEmptyMessage = useMemo(() => {
    if (viewMode === 'matched') {
      return video.hasSearchResults ? 'Không có cảnh khớp từ khóa' : 'Chưa có kết quả tìm kiếm';
    }
    return 'Chưa có cảnh phân tích';
  }, [video.hasSearchResults, viewMode]);

  const handleSelectScene = (scene: LibrarySceneItem) => {
    setActiveScene(scene);
    onPlayScene(scene);
  };

  useEffect(() => {
    setActiveScene(null);
  }, [video.id, video.currentVersion, viewMode]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground truncate">{video.fileName}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <SourceBadge source={video.source} />
              <span className="text-xs text-muted-foreground">{product.name}</span>
              <span className="text-xs text-muted-foreground">· {video.folder?.name || 'Chưa phân loại'}</span>
              <span className="text-xs text-muted-foreground">· {video.duration}</span>
            </div>
          </div>

          <div className="relative shrink-0">
            <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs text-secondary-foreground hover:bg-surface-hover transition-colors shrink-0">
              v{video.currentVersion}
              <ChevronDown className="h-3 w-3" />
            </button>
            <select
              value={video.currentVersion - 1}
              onChange={(event) => onSwitchVersion(parseInt(event.target.value, 10))}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {Array.from({ length: video.versions }).map((_, index) => (
                <option key={index} value={index}>
                  v{index + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <ActionButton icon={FileText} label="Export SRT" onClick={onExportSRT} disabled={video.scenes.length === 0 && video.matchedScenes.length === 0} />
          <ActionButton icon={Search} label="Tìm phân cảnh" onClick={onOpenInSearch} />
          <ActionButton icon={Film} label="Storyboard" onClick={onOpenInStoryboard} disabled={!canUseInStoryboard} />
          <ActionButton icon={Trash2} label="Xóa" variant="danger" onClick={onRemoveDataset} />
        </div>

      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 bg-black/20">
          {video.scenes.length === 0 && video.matchedScenes.length === 0 ? (
            <div className="px-4 py-3 border-b border-border bg-badge-web/10 text-xs text-badge-web">
              Chưa có dữ liệu phân cảnh từ backend cho video này.
            </div>
          ) : null}
          <VideoPlayerPanel
            fileName={video.fileName}
            currentTime={activeScene?.startTime}
            videoSrc={videoSrc}
            previewMutedDefault={previewMutedDefault}
            onPlayerRef={onPlayerRef}
            onLoadedMetadata={onPlayerLoadedMetadata}
            onTimeUpdate={onPlayerTimeUpdate}
          />
        </div>
        <div className="w-[420px] border-l border-border shrink-0">
          <SceneListPanel
            allScenes={video.scenes}
            matchedScenes={video.matchedScenes}
            viewMode={viewMode}
            hasSearchResults={video.hasSearchResults}
            activeSceneId={activeScene?.id ?? null}
            onSelectScene={handleSelectScene}
            onSetViewMode={onSetViewMode}
            onTrimScene={onTrimScene}
            trimmingSceneId={trimmingSceneId}
            emptyMessage={sceneEmptyMessage}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  variant,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant?: 'danger';
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === 'danger'
          ? 'text-badge-error hover:bg-badge-error/10'
          : 'text-secondary-foreground bg-secondary hover:bg-surface-hover'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
