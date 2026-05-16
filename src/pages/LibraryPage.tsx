import { Film } from 'lucide-react';

import type { ProductFolderSummary } from '@/lib/footage-app';
import { EditVideoDialog } from '@/components/library/EditVideoDialog';
import { ProductVideoList } from '@/components/library/ProductVideoList';
import { VideoDetailPanel } from '@/components/library/VideoDetailPanel';
import type { LibraryProduct, LibrarySceneItem, LibraryVideoItem, LibraryVideoSource, LibraryVideoStatus } from '@/components/library/types';
import type { DatasetItem, DatasetSourceFilter, Scene, VideoResult, VideoVersion, ViewMode } from '@/lib/footage-app';

interface LibraryPageProps {
  groupedDatasets: Array<{ groupKey: string; productName: string; folderId: number | null; isSystem: boolean; datasets: DatasetItem[] }>;
  activeDataset: DatasetItem | null;
  activeDatasetVersion: VideoVersion | null;
  expandedProductGroups: string[];
  librarySourceFilter: DatasetSourceFilter;
  libraryViewMode: ViewMode;
  trimmingScene: string | null;
  previewMutedDefault?: boolean;
  onSelectSourceFilter: (filter: DatasetSourceFilter) => void;
  onToggleProductGroup: (groupKey: string) => void;
  onSelectDataset: (datasetId: string) => void;
  onOpenDatasetInSearch: (dataset: DatasetItem) => void;
  onOpenDatasetInStoryboard: (dataset: DatasetItem) => void;
  onRemoveDataset: (dataset: DatasetItem) => void;
  onSwitchLibraryVersion: (dataset: DatasetItem, versionIndex: number) => void;
  onSetLibraryViewMode: (mode: ViewMode) => void;
  onExportSRT: (video: VideoResult) => void;
  onPlayScene: (scene: Scene) => void;
  onTrimScene: (scene: Scene, sceneIndex: number) => void;
  onLibraryPlayerRef: (node: HTMLVideoElement | null) => void;
  onPlayerLoadedMetadata: () => void;
  onPlayerTimeUpdate: () => void;
  folders?: ProductFolderSummary[];
  assetMutating?: boolean;
  editVideoTarget?: DatasetItem | null;
  onOpenEditVideo?: (dataset: DatasetItem) => void;
  onCloseEditVideo?: () => void;
  onSubmitEditVideo?: (payload: { filename?: string; folderId?: number }) => Promise<void> | void;
  onCreateFolder?: () => void;
  onRenameFolder?: (folder: ProductFolderSummary) => void;
  onDeleteFolder?: (folder: ProductFolderSummary) => void;
}

export function LibraryPage({
  groupedDatasets,
  activeDataset,
  activeDatasetVersion,
  expandedProductGroups,
  librarySourceFilter,
  libraryViewMode,
  trimmingScene,
  previewMutedDefault = false,
  onSelectSourceFilter,
  onToggleProductGroup,
  onSelectDataset,
  onOpenDatasetInSearch,
  onOpenDatasetInStoryboard,
  onRemoveDataset,
  onSwitchLibraryVersion,
  onSetLibraryViewMode,
  onExportSRT,
  onPlayScene,
  onTrimScene,
  onLibraryPlayerRef,
  onPlayerLoadedMetadata,
  onPlayerTimeUpdate,
  folders = [],
  assetMutating = false,
  editVideoTarget = null,
  onOpenEditVideo,
  onCloseEditVideo,
  onSubmitEditVideo,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: LibraryPageProps) {
  const products = groupedDatasets.map((group) => ({
    id: group.groupKey,
    folderId: group.folderId,
    name: group.productName,
    isSystem: group.isSystem,
    videos: group.datasets.map((dataset) => toLibraryVideoItem(dataset, group.groupKey)),
  })) satisfies LibraryProduct[];

  const activeDatasetGroupKey = activeDataset ? getDatasetGroupKey(activeDataset) : null;
  const selectedVideo = activeDataset ? toLibraryVideoItem(activeDataset, activeDatasetGroupKey || activeDataset.productName) : null;
  const editVideo = editVideoTarget ? toLibraryVideoItem(editVideoTarget, getDatasetGroupKey(editVideoTarget)) : null;
  const selectedProduct = activeDatasetGroupKey
    ? products.find((product) => product.id === activeDatasetGroupKey) || null
    : null;
  const handleRenameFolderFromProduct = (product: LibraryProduct) => {
    const folder = toFolderSummary(product);
    if (!folder || !onRenameFolder) return;
    onRenameFolder(folder);
  };
  const handleDeleteFolderFromProduct = (product: LibraryProduct) => {
    const folder = toFolderSummary(product);
    if (!folder || !onDeleteFolder) return;
    onDeleteFolder(folder);
  };

  return (
    <div className="flex-1 flex min-h-0">
        <div className="w-[380px] border-r border-border shrink-0 flex flex-col bg-card">
          <ProductVideoList
            products={products}
            selectedVideoId={selectedVideo?.id ?? null}
            filter={librarySourceFilter}
            onFilterChange={onSelectSourceFilter}
            onSelectVideo={(video) => onSelectDataset(video.datasetId)}
            onEditVideo={(video) => {
              const dataset = groupedDatasets
                .flatMap((group) => group.datasets)
                .find((item) => item.datasetId === video.datasetId);
              if (!dataset || !onOpenEditVideo) return;
              onOpenEditVideo(dataset);
            }}
            expandedProductGroups={expandedProductGroups}
            onToggleProductGroup={onToggleProductGroup}
            onCreateFolder={onCreateFolder}
            onRenameFolder={onRenameFolder ? handleRenameFolderFromProduct : undefined}
            onDeleteFolder={onDeleteFolder ? handleDeleteFolderFromProduct : undefined}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {selectedVideo && selectedProduct && activeDataset ? (
            <VideoDetailPanel
              video={selectedVideo}
              product={selectedProduct}
              canUseInStoryboard={!!activeDatasetVersion && activeDatasetVersion.scenes.length > 0}
              viewMode={libraryViewMode}
              onSetViewMode={onSetLibraryViewMode}
              onSwitchVersion={(versionIndex) => onSwitchLibraryVersion(activeDataset, versionIndex)}
              onExportSRT={() => onExportSRT({ ...activeDataset, scenes: libraryViewMode === 'matched' ? activeDataset.matchedScenes || [] : activeDatasetVersion?.scenes || [] })}
              onOpenInSearch={() => onOpenDatasetInSearch(activeDataset)}
              onOpenInStoryboard={() => onOpenDatasetInStoryboard(activeDataset)}
              onRemoveDataset={() => onRemoveDataset(activeDataset)}
              onPlayScene={(scene) => onPlayScene(scene.rawScene)}
              onTrimScene={(scene) => onTrimScene(scene.rawScene, scene.sceneIndex)}
              trimmingSceneId={toTrimSceneId(activeDataset.fileName, trimmingScene, selectedVideo, libraryViewMode)}
              videoSrc={`/api/videos/${encodeURIComponent(activeDataset.fileName)}/stream`}
              previewMutedDefault={previewMutedDefault}
              onPlayerRef={onLibraryPlayerRef}
              onPlayerLoadedMetadata={onPlayerLoadedMetadata}
              onPlayerTimeUpdate={onPlayerTimeUpdate}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Film className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Chọn một video để xem chi tiết</p>
              </div>
            </div>
          )}
      </div>

      <EditVideoDialog
        open={!!editVideoTarget}
        video={editVideo}
        folders={folders}
        isSubmitting={assetMutating}
        onOpenChange={(open) => {
          if (!open) onCloseEditVideo?.();
        }}
        onSubmit={async (payload) => {
          if (!onSubmitEditVideo) return;
          await onSubmitEditVideo(payload);
        }}
      />
    </div>
  );
}

function toFolderSummary(product: LibraryProduct): ProductFolderSummary | null {
  if (product.folderId === null) return null;
  return {
    id: product.folderId,
    name: product.name,
    isSystem: product.isSystem,
  };
}

function toLibraryVideoItem(dataset: DatasetItem, productId: string): LibraryVideoItem {
  const currentVersion = dataset.versions?.[dataset.currentVersionIndex || 0];

  return {
    id: dataset.datasetId,
    datasetId: dataset.datasetId,
    videoFileId: dataset.videoFileId ?? null,
    fileName: dataset.fileName,
    source: dataset.source === 'extension' ? 'Extension' : 'Web',
    versions: dataset.versions?.length || 1,
    currentVersion: (dataset.currentVersionIndex || 0) + 1,
    updatedAt: new Date(dataset.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }),
    status: toLibraryStatus(dataset.status),
    productId,
    folder: dataset.folder || null,
    duration: toDuration(currentVersion?.scenes || dataset.scenes || []),
    scenes: toSceneItems(currentVersion?.scenes || dataset.scenes || []),
    matchedScenes: toSceneItems(dataset.matchedScenes || []),
    hasSearchResults: !!dataset.currentSearchKeywords || !!dataset.searchResults?.length,
  };
}

function getDatasetGroupKey(dataset: DatasetItem) {
  if (dataset.folder) {
    return `folder:${dataset.folder.id}`;
  }

  return `dataset:${dataset.datasetId}`;
}

function toLibraryStatus(status: DatasetItem['status']): LibraryVideoStatus {
  if (status === 'error') return 'error';
  if (status === 'pending' || status === 'analyzing') return 'processing';
  return 'success';
}

function toSceneItems(scenes: Scene[]): LibrarySceneItem[] {
  return scenes.map((scene, index) => ({
    id: `${index}-${scene.keyword || 'scene'}`,
    label: scene.keyword || `Phân cảnh ${index + 1}`,
    startTime: scene.start,
    endTime: scene.end,
    description: scene.description,
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

function toTrimSceneId(fileName: string, trimmingScene: string | null, video: LibraryVideoItem, viewMode: ViewMode) {
  if (!trimmingScene) return null;
  const visibleScenes = viewMode === 'matched' ? video.matchedScenes : video.scenes;
  const match = visibleScenes.find((scene) => `${fileName}-${scene.sceneIndex}` === trimmingScene);
  return match?.id || null;
}
