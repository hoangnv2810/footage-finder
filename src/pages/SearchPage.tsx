import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';

import { Database } from 'lucide-react';

import { SearchInputPanel } from '@/components/search/SearchInputPanel';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import type { SessionScene, SessionVideo } from '@/components/search/types';
import type { DatasetItem, Scene, VideoResult, ViewMode } from '@/lib/footage-app';

interface SearchPageProps {
  keywords: string;
  searchProductName: string;
  videos: VideoResult[];
  isAnalyzing: boolean;
  isUploading: boolean;
  trimmingScene: string | null;
  previewMutedDefault?: boolean;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  onKeywordsChange: (value: string) => void;
  onSearchProductNameChange: (value: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyzeVideos: () => void;
  onAnalyzeSingleVideo: (index: number) => void;
  onSwitchVersion: (index: number, versionIndex: number) => void;
  onSetVideoViewMode: (index: number, mode: ViewMode) => void;
  onExportSRT: (video: VideoResult) => void;
  onPlayScene: (index: number, scene: Scene) => void;
  onTrimScene: (video: VideoResult, scene: Scene, sceneIndex: number) => void;
  onSearchPlayerRef: (index: number, node: HTMLVideoElement | null) => void;
  onPlayerLoadedMetadata: (index: number) => void;
  onPlayerTimeUpdate: (index: number) => void;
}

export function SearchPage({
  keywords,
  searchProductName,
  videos,
  isAnalyzing,
  isUploading,
  trimmingScene,
  previewMutedDefault = false,
  uploadInputRef,
  onKeywordsChange,
  onSearchProductNameChange,
  onUpload,
  onAnalyzeVideos,
  onAnalyzeSingleVideo,
  onSwitchVersion,
  onSetVideoViewMode,
  onExportSRT,
  onPlayScene,
  onTrimScene,
  onSearchPlayerRef,
  onPlayerLoadedMetadata,
  onPlayerTimeUpdate,
}: SearchPageProps) {
  const sessionVideos = useMemo(() => videos.map((video, index) => toSessionVideo(video, index)), [videos]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(sessionVideos[0]?.id ?? null);

  useEffect(() => {
    if (sessionVideos.length === 0) {
      setSelectedVideoId(null);
      return;
    }
    setSelectedVideoId((prev) => (prev && sessionVideos.some((video) => video.id === prev) ? prev : sessionVideos[0].id));
  }, [sessionVideos]);

  const resultVideos = sessionVideos.filter((video) => video.status === 'success' || video.status === 'analyzing' || video.status === 'error');

  return (
    <div className="flex-1 flex min-h-0">
        <div className="w-[320px] border-r border-border shrink-0 bg-card">
          <input
            type="file"
            ref={uploadInputRef}
            onChange={onUpload}
            accept="video/*"
            multiple
            className="hidden"
          />
          <SearchInputPanel
            productName={searchProductName}
            setProductName={onSearchProductNameChange}
            keyword={keywords}
            setKeyword={onKeywordsChange}
            sessionVideos={sessionVideos}
            selectedVideoId={selectedVideoId}
            onSelectVideo={(video) => setSelectedVideoId(video.id)}
            onUpload={() => uploadInputRef.current?.click()}
            onAnalyze={onAnalyzeVideos}
            canAnalyze={sessionVideos.length > 0}
            isBusy={isUploading || isAnalyzing}
          />
        </div>

        <div className="flex-1 overflow-y-auto min-w-0 bg-background custom-scrollbar">
          {resultVideos.length > 0 ? (
            <div className="p-4 space-y-4">
              {resultVideos.map((video) => {
                const originalIndex = sessionVideos.findIndex((item) => item.id === video.id);
                const originalVideo = videos[originalIndex];
                const trimSceneId = toVisibleTrimId(video, originalVideo?.fileName || '', trimmingScene, originalVideo?.viewMode || 'full');

                return (
                  <SearchResultCard
                    key={video.id}
                    video={video}
                    viewMode={originalVideo?.viewMode || 'full'}
                    onSetViewMode={(mode) => onSetVideoViewMode(originalIndex, mode)}
                    onSwitchVersion={(versionIndex) => onSwitchVersion(originalIndex, versionIndex)}
                    onRetry={() => onAnalyzeSingleVideo(originalIndex)}
                    onExportSRT={() => originalVideo && onExportSRT(originalVideo)}
                    onPlayScene={(scene) => onPlayScene(originalIndex, scene.rawScene)}
                    onTrimScene={(scene) => originalVideo && onTrimScene(originalVideo, scene.rawScene, scene.sceneIndex)}
                    trimmingSceneId={trimSceneId}
                    videoSrc={`/api/videos/${encodeURIComponent(video.fileName)}/stream`}
                    previewMutedDefault={previewMutedDefault}
                    onPlayerRef={(node) => onSearchPlayerRef(originalIndex, node)}
                    onPlayerLoadedMetadata={() => onPlayerLoadedMetadata(originalIndex)}
                    onPlayerTimeUpdate={() => onPlayerTimeUpdate(originalIndex)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center">
                <Database className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-1">Chưa có video nào</p>
                <p className="text-xs text-muted-foreground">Upload video ở bên trái hoặc mở dataset từ Thư viện dữ liệu</p>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function toSessionVideo(video: VideoResult, index: number): SessionVideo {
  const scenes = toSessionScenes(video.scenes || []);
  const searchResults = toSessionScenes(video.matchedScenes || []);

  return {
    id: `${video.dbVideoId ?? video.fileName}-${index}`,
    fileName: video.fileName,
    source: video.source === 'extension' ? 'Extension' : 'Web',
    status: video.status,
    version: (video.currentVersionIndex || 0) + 1,
    totalVersions: video.versions?.length || 1,
    duration: toDuration(video.versions?.[video.currentVersionIndex || 0]?.scenes || video.scenes || []),
    scenes,
    searchResults,
    currentKeywords: video.currentSearchKeywords || '',
    error: video.error || video.searchError || undefined,
  };
}

function toSessionScenes(scenes: Scene[]): SessionScene[] {
  return scenes.map((scene, index) => ({
    id: `${index}-${scene.keyword || 'scene'}`,
    label: scene.keyword || `Cảnh ${index + 1}`,
    keyword: scene.keyword || undefined,
    description: scene.description,
    startTime: scene.start,
    endTime: scene.end,
    rawScene: scene,
    sceneIndex: index,
  }));
}

function toDuration(scenes: Scene[]): string {
  const seconds = scenes[scenes.length - 1]?.end || 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function toVisibleTrimId(video: SessionVideo, fileName: string, trimmingScene: string | null, viewMode: ViewMode) {
  if (!trimmingScene) return null;
  const visibleScenes = viewMode === 'matched' ? video.searchResults : video.scenes;
  const match = visibleScenes.find((scene) => `${fileName}-${scene.sceneIndex}` === trimmingScene);
  return match?.id || null;
}
