import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { AlertCircle } from 'lucide-react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';

import { AppLayout } from '@/components/AppLayout';
import { DeleteFolderDialog } from '@/components/library/DeleteFolderDialog';
import { FolderFormDialog } from '@/components/library/FolderFormDialog';
import { LibraryPage } from '@/pages/LibraryPage';
import { NotFound } from '@/pages/NotFound';
import { SearchPage } from '@/pages/SearchPage';
import { StoryboardPage } from '@/pages/StoryboardPage';
import {
  FALLBACK_PRODUCT_NAME,
  LIBRARY_PLAYER_SLOT,
  api,
  assertCanImportStoryboard,
  buildDatasetItems,
  buildStoryboardCopyPrompt,
  normalizeHistory,
  normalizeHistoryItem,
  normalizeVideo,
  readSSEStream,
  type DatasetItem,
  type DatasetSourceFilter,
  type HistoryItem,
  type LibraryMutationResult,
  type ProductFolderSummary,
  type Scene,
  type SavedStoryboard,
  type StoryboardCandidateScene,
  type StoryboardMatch,
  type StoryboardProductInput,
  type StoryboardResult,
  type ViewMode,
  type VideoResult,
} from '@/lib/footage-app';
import { enforceVideoRangePlayback, playVideoRange } from '@/lib/video-playback';

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceApp />
    </BrowserRouter>
  );
}

function WorkspaceApp() {
  const navigate = useNavigate();
  const [keywords, setKeywords] = useState('');
  const [searchProductName, setSearchProductName] = useState('');
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [folders, setFolders] = useState<ProductFolderSummary[]>([]);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [expandedProductGroups, setExpandedProductGroups] = useState<string[]>([]);
  const [librarySourceFilter, setLibrarySourceFilter] = useState<DatasetSourceFilter>('all');
  const [trimmingScene, setTrimmingScene] = useState<string | null>(null);
  const [assetMutating, setAssetMutating] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [folderFormMode, setFolderFormMode] = useState<'create' | 'rename'>('create');
  const [folderTarget, setFolderTarget] = useState<ProductFolderSummary | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ProductFolderSummary | null>(null);
  const [editVideoTarget, setEditVideoTarget] = useState<DatasetItem | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const playerRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const playbackBoundsRef = useRef<Record<number, { end: number }>>({});
  const pendingSceneRef = useRef<Record<number, Scene | undefined>>({});

  const [storyboardProductName, setStoryboardProductName] = useState('');
  const [storyboardCategory, setStoryboardCategory] = useState('');
  const [storyboardAudience, setStoryboardAudience] = useState('');
  const [storyboardTone, setStoryboardTone] = useState('');
  const [storyboardBenefits, setStoryboardBenefits] = useState('');
  const [storyboardScript, setStoryboardScript] = useState('');
  const [storyboardSelectedVersionIds, setStoryboardSelectedVersionIds] = useState<string[]>([]);
  const [storyboardResult, setStoryboardResult] = useState<StoryboardResult | null>(null);
  const [savedStoryboards, setSavedStoryboards] = useState<SavedStoryboard[]>([]);
  const [selectedSavedStoryboardId, setSelectedSavedStoryboardId] = useState<string | null>(null);
  const [selectedStoryboardBeatId, setSelectedStoryboardBeatId] = useState<string | null>(null);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [storyboardPreviewMatch, setStoryboardPreviewMatch] = useState<StoryboardMatch | null>(null);
  // A counter that bumps every time the user explicitly asks to (re)play a match.
  // Same-match clicks change this counter (not the previewMatch identity), which
  // re-runs the playback effect without remounting the <video> element.
  const [storyboardPlayToken, setStoryboardPlayToken] = useState(0);
  const storyboardPlayerRef = useRef<HTMLVideoElement | null>(null);
  const storyboardPlaybackRef = useRef<{ start: number; end: number; retriedStartSeek?: boolean } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [libraryViewMode, setLibraryViewMode] = useState<ViewMode>('full');

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    setIsUploading(true);
    setGlobalError(null);

    try {
      const formData = new FormData();
      const fileList = event.target.files;

      for (let i = 0; i < fileList.length; i += 1) {
        formData.append('files', fileList[i]);
      }

      const response = await fetch('/api/videos/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload thất bại');

      const result = await response.json();
      const newVideos: VideoResult[] = (result.uploaded || []).map((uploaded: any) => ({
        fileName: uploaded.filename,
        source: 'web' as const,
        productNameOverride: '',
        resolvedProductName: searchProductName.trim() || FALLBACK_PRODUCT_NAME,
        scenes: [],
        status: 'pending' as const,
        searchResults: [],
        currentSearchKeywords: '',
        matchedScenes: [],
        searchError: null,
        viewMode: 'full' as const,
      }));

      setVideos((prev) => [...prev, ...newVideos]);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Upload thất bại');
    } finally {
      setIsUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const upsertHistoryItem = useCallback((item: HistoryItem) => {
    const normalizedItem = normalizeHistoryItem(item);
    setHistory((prev) => [
      normalizedItem,
      ...prev.filter((existing) => existing.id !== normalizedItem.id),
    ].sort((a, b) => b.date - a.date));
  }, []);

  const getServerVideo = useCallback((savedHistory: HistoryItem | null, filename: string): VideoResult | null => {
    const serverVideo = savedHistory?.videos?.find((video) => video.fileName === filename);
    return serverVideo ? normalizeVideo({ ...serverVideo, status: 'success' }) : null;
  }, []);

  const focusSavedVideo = useCallback((savedHistory: HistoryItem | null, filename: string): VideoResult | null => {
    const serverVideo = getServerVideo(savedHistory, filename);
    if (serverVideo?.dbVideoId !== undefined) {
      setActiveDatasetId(String(serverVideo.dbVideoId));
    }
    return serverVideo;
  }, [getServerVideo]);

  const persistVideoSelection = useCallback(async (datasetId: string, currentVersionIndex: number, currentSearchKeywords: string) => {
    const updatedHistory = await api.updateVideoSelection(datasetId, currentVersionIndex, currentSearchKeywords);
    upsertHistoryItem(updatedHistory);
    return normalizeHistoryItem(updatedHistory);
  }, [upsertHistoryItem]);

  const resetStoryboardState = useCallback(() => {
    setStoryboardResult(null);
    setSelectedSavedStoryboardId(null);
    setSelectedStoryboardBeatId(null);
    setStoryboardError(null);
    setStoryboardPreviewMatch(null);
    storyboardPlaybackRef.current = null;
  }, []);

  const restoreSavedStoryboard = useCallback((saved: SavedStoryboard) => {
    setStoryboardProductName(saved.productName || '');
    setStoryboardCategory(saved.category || '');
    setStoryboardAudience(saved.targetAudience || '');
    setStoryboardTone(saved.tone || '');
    setStoryboardBenefits(saved.keyBenefits || '');
    setStoryboardScript(saved.scriptText || '');
    setStoryboardSelectedVersionIds(saved.selectedVersionIds || []);
    setStoryboardResult(saved.result || null);
    setSelectedSavedStoryboardId(saved.id);
    setStoryboardError(null);

    const firstBeatId = saved.result?.beats[0]?.id || null;
    setSelectedStoryboardBeatId(firstBeatId);
    // The useEffect on [selectedStoryboardBeatId, storyboardResult] handles
    // auto-selecting the first match and seeking. We only pre-set the preview
    // so the UI shows the correct match immediately before the effect runs.
    const firstMatch = firstBeatId
      ? saved.result?.beatMatches.find((group) => group.beatId === firstBeatId)?.matches[0] || null
      : null;
    setStoryboardPreviewMatch(firstMatch);
    storyboardPlaybackRef.current = null;
  }, []);

  const upsertSavedStoryboard = useCallback((saved: SavedStoryboard) => {
    setSavedStoryboards((prev) => [
      saved,
      ...prev.filter((item) => item.id !== saved.id),
    ].sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  const syncSearchVideosFromHistory = useCallback((nextHistory: HistoryItem[]) => {
    setVideos((prev) => {
      if (!currentSearchId || prev.length === 0) return prev;
      const activeHistory = nextHistory.find((item) => item.id === currentSearchId);
      if (!activeHistory) return prev;

      return prev.map((video) => {
        const serverVideo = activeHistory.videos.find((item) => (
          (video.dbVideoId != null && item.dbVideoId === video.dbVideoId) || item.fileName === video.fileName
        ));
        if (!serverVideo) return video;
        return normalizeVideo({
          ...serverVideo,
          status: video.status === 'analyzing' ? 'analyzing' : 'success',
        });
      });
    });
  }, [currentSearchId]);

  const applyLibraryMutationResult = useCallback((result: LibraryMutationResult) => {
    const normalizedHistories = normalizeHistory(result.histories || []);
    setHistory((prev) => {
      if (normalizedHistories.length === 0) {
        return prev;
      }

      const byId = new Map(prev.map((item) => [item.id, item]));
      normalizedHistories.forEach((item) => {
        if (item.videos.length === 0) {
          byId.delete(item.id);
          return;
        }
        byId.set(item.id, item);
      });

      return Array.from(byId.values()).sort((a, b) => b.date - a.date);
    });
    if (Array.isArray(result.folders)) {
      setFolders(result.folders);
    }
    syncSearchVideosFromHistory(normalizedHistories);
  }, [syncSearchVideosFromHistory]);

  const runLibraryMutation = useCallback(async (mutation: () => Promise<LibraryMutationResult>) => {
    setAssetMutating(true);
    try {
      const result = await mutation();
      applyLibraryMutationResult(result);
      setGlobalError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể cập nhật thư viện.';
      setGlobalError(message);
      throw error;
    } finally {
      setAssetMutating(false);
    }
  }, [applyLibraryMutationResult]);

  const datasetItems = useMemo(() => buildDatasetItems(history), [history]);

  const filteredDatasets = useMemo(
    () => datasetItems.filter((dataset) => librarySourceFilter === 'all' || dataset.source === librarySourceFilter),
    [datasetItems, librarySourceFilter],
  );

  const groupedDatasets = useMemo(() => {
    const datasetsByFolderId = new Map<number, DatasetItem[]>();
    const fallbackGroups = new Map<string, { groupKey: string; productName: string; datasets: DatasetItem[] }>();
    const knownFolderIds = new Set(folders.map((folder) => folder.id));

    filteredDatasets.forEach((dataset) => {
      const folderId = dataset.folder?.id;
      if (typeof folderId === 'number' && folderId > 0) {
        const current = datasetsByFolderId.get(folderId) || [];
        current.push(dataset);
        datasetsByFolderId.set(folderId, current);
        return;
      }

      const groupKey = getDatasetGroupKey(dataset);
      const displayName = dataset.folder?.name || dataset.productName || FALLBACK_PRODUCT_NAME;
      const existingFallback = fallbackGroups.get(groupKey);
      if (existingFallback) {
        existingFallback.datasets.push(dataset);
        return;
      }

      fallbackGroups.set(groupKey, {
        groupKey,
        productName: displayName,
        datasets: [dataset],
      });
    });

    const groupedFromFolders = folders.map((folder) => ({
      groupKey: `folder:${folder.id}`,
      productName: folder.name,
      folderId: folder.id,
      isSystem: folder.isSystem,
      datasets: [...(datasetsByFolderId.get(folder.id) || [])].sort((a, b) => b.updatedAt - a.updatedAt),
    }));

    const groupsFromUnknownFolders = Array.from(datasetsByFolderId.entries())
      .filter(([folderId]) => !knownFolderIds.has(folderId))
      .map(([folderId, datasets]) => ({
        groupKey: `folder:${folderId}`,
        productName: datasets[0]?.folder?.name || FALLBACK_PRODUCT_NAME,
        folderId,
        isSystem: datasets[0]?.folder?.isSystem ?? false,
        datasets: [...datasets].sort((a, b) => b.updatedAt - a.updatedAt),
      }));

    const groupedFallbacks = Array.from(fallbackGroups.values())
      .map((group) => ({
        groupKey: group.groupKey,
        productName: group.productName,
        folderId: null,
        isSystem: false,
        datasets: [...group.datasets].sort((a, b) => b.updatedAt - a.updatedAt),
      }));

    return [...groupedFromFolders, ...groupsFromUnknownFolders, ...groupedFallbacks]
      .sort((a, b) => a.productName.localeCompare(b.productName, 'vi'));
  }, [filteredDatasets, folders]);

  const activeDataset = useMemo(
    () => filteredDatasets.find((dataset) => dataset.datasetId === activeDatasetId) || filteredDatasets[0] || null,
    [filteredDatasets, activeDatasetId],
  );

  const storyboardSources = useMemo(() => datasetItems.flatMap((dataset) => {
    const version = dataset.versions?.[dataset.currentVersionIndex || 0];
    if (!version || version.scenes.length === 0) return [];

    return [{
      datasetId: dataset.datasetId,
      fileName: dataset.fileName,
      productName: dataset.productName,
      versionId: version.id,
      sceneCount: version.scenes.length,
      timestamp: version.timestamp,
      source: dataset.source,
    }];
  }), [datasetItems]);

  const selectedStoryboardBeatMatches = storyboardResult?.beatMatches.find((group) => group.beatId === selectedStoryboardBeatId)?.matches || [];
  const resolvedStoryboardPreviewMatch = (storyboardPreviewMatch && selectedStoryboardBeatMatches.some((match) => match.id === storyboardPreviewMatch.id))
    ? storyboardPreviewMatch
    : null;
  const activeDatasetStoryboardVersionId = activeDataset?.versions?.[activeDataset.currentVersionIndex || 0]?.id || null;
  const activeDatasetUsableForStoryboard = !!activeDatasetStoryboardVersionId && storyboardSources.some((source) => source.versionId === activeDatasetStoryboardVersionId);

  useEffect(() => {
    const availableIds = filteredDatasets.map((dataset) => dataset.datasetId as string);

    if (availableIds.length === 0) {
      setActiveDatasetId(null);
      return;
    }

    setActiveDatasetId((prev) => (prev && availableIds.includes(prev) ? prev : availableIds[0]));
  }, [filteredDatasets]);

  useEffect(() => {
    const groupKeys = groupedDatasets.map((group) => group.groupKey);
    setExpandedProductGroups((prev) => {
      const kept = prev.filter((groupKey) => groupKeys.includes(groupKey));
      if (kept.length > 0) return kept;
      return groupKeys.length > 0 ? [groupKeys[0]] : [];
    });
  }, [groupedDatasets]);

  useEffect(() => {
    if (!activeDataset) return;
    const activeGroupKey = getDatasetGroupKey(activeDataset);
    setExpandedProductGroups((prev) => (prev.includes(activeGroupKey) ? prev : [...prev, activeGroupKey]));
  }, [activeDataset]);

  useEffect(() => {
    if (!activeDataset) {
      setLibraryViewMode('full');
      return;
    }
    setLibraryViewMode(activeDataset.currentSearchKeywords ? 'matched' : 'full');
  }, [activeDataset]);

  useEffect(() => {
    const preferredVersionId = activeDatasetStoryboardVersionId;
    setStoryboardSelectedVersionIds((prev) => {
      const availableIds = storyboardSources.map((source) => source.versionId);
      if (availableIds.length === 0) return [];

      const filtered = prev.filter((id) => availableIds.includes(id));
      if (filtered.length > 0) return filtered;

      if (preferredVersionId && availableIds.includes(preferredVersionId)) {
        return [preferredVersionId];
      }

      if (activeDataset) return [];
      return [];
    });
  }, [activeDataset, activeDatasetStoryboardVersionId, storyboardSources]);

  useEffect(() => {
    if (!storyboardResult || storyboardResult.beats.length === 0) {
      if (selectedStoryboardBeatId) {
        setSelectedStoryboardBeatId(null);
      }
      return;
    }

    const beatStillExists = storyboardResult.beats.some((beat) => beat.id === selectedStoryboardBeatId);
    if (!beatStillExists) {
      setSelectedStoryboardBeatId(storyboardResult.beats[0].id);
    }
  }, [storyboardResult, selectedStoryboardBeatId]);

  useEffect(() => {
    if (!storyboardResult || !selectedStoryboardBeatId) return;
    const firstMatch = storyboardResult.beatMatches.find((group) => group.beatId === selectedStoryboardBeatId)?.matches[0] || null;
    // Just publish the first match; the playback effect below handles seek+play
    // once the (possibly remounted) <video> element is ready.
    setStoryboardPreviewMatch(firstMatch);
    storyboardPlaybackRef.current = null;
  }, [selectedStoryboardBeatId, storyboardResult]);

  const playScene = useCallback((videoIndex: number, scene: Scene) => {
    const player = playerRefs.current[videoIndex];
    if (!player) return;

    pendingSceneRef.current[videoIndex] = scene;

    const seekAndPlay = (targetScene: Scene) => {
      playbackBoundsRef.current[videoIndex] = { end: targetScene.end };
      player.pause();

      const startPlayback = () => {
        pendingSceneRef.current[videoIndex] = undefined;
        player.play().catch(() => {});
      };

      const performSeek = () => {
        if (Math.abs(player.currentTime - targetScene.start) < 0.05) {
          startPlayback();
          return;
        }

        player.addEventListener('seeked', () => {
          if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            startPlayback();
          } else {
            player.addEventListener('canplay', startPlayback, { once: true });
          }
        }, { once: true });

        if ('fastSeek' in player) {
          try {
            player.fastSeek(targetScene.start);
            return;
          } catch {
            // Fall back to currentTime assignment below.
          }
        }

        player.currentTime = targetScene.start;
      };

      if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
        performSeek();
        return;
      }

      player.addEventListener('loadedmetadata', performSeek, { once: true });
      if (player.networkState === HTMLMediaElement.NETWORK_EMPTY) {
        player.load();
      }
    };

    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekAndPlay(scene);
      return;
    }

    if (player.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      player.load();
    }
  }, []);

  const handlePlayerTimeUpdate = useCallback((videoIndex: number) => {
    const player = playerRefs.current[videoIndex];
    const bounds = playbackBoundsRef.current[videoIndex];
    if (!player || !bounds) return;

    if (player.currentTime >= bounds.end) {
      player.pause();
      player.currentTime = bounds.end;
      delete playbackBoundsRef.current[videoIndex];
    }
  }, []);

  const handlePlayerLoadedMetadata = useCallback((videoIndex: number) => {
    const pendingScene = pendingSceneRef.current[videoIndex];
    if (pendingScene) {
      playScene(videoIndex, pendingScene);
    }
  }, [playScene]);

  // Orchestrates seek+play whenever the previewed match changes, or the user
  // re-clicks the same match (storyboardPlayToken bumps).
  //
  // The previous implementation juggled `storyboardPendingMatchRef` and
  // `storyboardRequestIdRef` across React's `onLoadedMetadata` prop, plus a
  // beat-change effect that called `playVideoRange` on the OLD <video> right
  // before React unmounted it. That second invocation cleared `pending`, so
  // when the NEW <video> finally fired `loadedmetadata`, the handler bailed
  // and the user saw the new clip play from second 0.
  //
  // This effect runs AFTER React commits the new DOM and AFTER refs are
  // assigned, so `storyboardPlayerRef.current` already points at the freshly
  // mounted element. We attach the metadata listener directly via
  // `addEventListener` so React's synthetic event system can never miss the
  // event for a quickly-cached video, and the cleanup cancels in-flight seeks
  // when the user moves on to another match before the previous load resolved.
  useEffect(() => {
    const player = storyboardPlayerRef.current;
    if (!player || !storyboardPreviewMatch) return;

    const match = storyboardPreviewMatch;
    let cancelled = false;

    const seekAndPlay = () => {
      if (cancelled) return;
      storyboardPlaybackRef.current = playVideoRange(player, {
        start: match.scene.start,
        end: match.scene.end,
      });
    };

    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekAndPlay();
    } else {
      player.addEventListener('loadedmetadata', seekAndPlay, { once: true });
      if (player.networkState === HTMLMediaElement.NETWORK_EMPTY) {
        player.load();
      }
    }

    return () => {
      cancelled = true;
      player.removeEventListener('loadedmetadata', seekAndPlay);
    };
    // We intentionally key on the match identity (id) and the explicit
    // play-token so same-match clicks also re-trigger this effect.
  }, [storyboardPreviewMatch?.id, storyboardPlayToken]);

  const playStoryboardMatch = useCallback((match: StoryboardMatch) => {
    setStoryboardPreviewMatch(match);
    setStoryboardPlayToken((token) => token + 1);
    storyboardPlaybackRef.current = null;
  }, []);

  const handleStoryboardTimeUpdate = useCallback(() => {
    const player = storyboardPlayerRef.current;
    const bounds = storyboardPlaybackRef.current;
    if (!player || !bounds) return;

    storyboardPlaybackRef.current = enforceVideoRangePlayback(player, bounds);
  }, []);

  // Stable ref callback so React only invokes it on actual mount/unmount of
  // the <video> element (not on every parent render).
  const setStoryboardPlayer = useCallback((node: HTMLVideoElement | null) => {
    storyboardPlayerRef.current = node;
  }, []);

  useEffect(() => {
    Promise.all([api.history(), api.productFolders()])
      .then(([items, folderItems]) => {
        setHistory(normalizeHistory(items));
        setFolders(folderItems);
      })
      .catch(() => setGlobalError('Không kết nối được server. Hãy chạy Python server trước.'));
  }, []);

  useEffect(() => {
    api.listStoryboards()
      .then((items) => setSavedStoryboards([...items].sort((a, b) => b.updatedAt - a.updatedAt)))
      .catch(() => setStoryboardError('Không tải được danh sách storyboard đã lưu.'));
  }, []);

  const analyzeOnServer = async (filename: string, historyId: string, searchKeywords: string) => {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        keywords: searchKeywords,
        history_id: historyId,
        product_name: searchProductName.trim(),
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Server lỗi: ${response.status}`);
    }

    let savedHistory: HistoryItem | null = null;
    let errorMsg: string | null = null;

    await readSSEStream(response, {
      onSaved: (data) => {
        savedHistory = normalizeHistoryItem(data.history);
      },
      onError: (message) => {
        errorMsg = message;
      },
    });

    return { savedHistory, errorMsg };
  };

  const searchOnServer = async (versionId: string, searchKeywords: string) => {
    const result = await api.search(versionId, searchKeywords);
    const savedHistory = result.history ? normalizeHistoryItem(result.history) : null;
    return { savedHistory, searchError: result.searchError || null };
  };

  const clearSearchSelection = (video: VideoResult) => {
    const nextVideo = normalizeVideo({
      ...video,
      currentSearchKeywords: '',
      viewMode: 'full',
    });

    if (video.dbVideoId != null) {
      void persistVideoSelection(String(video.dbVideoId), nextVideo.currentVersionIndex || 0, '').catch(() => {});
    }

    return nextVideo;
  };

  const generateStoryboard = async () => {
    const scriptText = storyboardScript.trim();
    if (!scriptText) {
      setStoryboardError('Vui lòng nhập kịch bản để tạo storyboard.');
      return;
    }

    if (storyboardSources.length === 0) {
      setStoryboardError('Cần có ít nhất một video đã phân tích để tạo storyboard.');
      return;
    }

    setStoryboardError(null);
    setGlobalError(null);
    setIsGeneratingStoryboard(true);
    resetStoryboardState();

    try {
      const saved = await api.generateSavedStoryboard({
        product_name: storyboardProductName.trim(),
        category: storyboardCategory.trim(),
        target_audience: storyboardAudience.trim(),
        tone: storyboardTone.trim(),
        key_benefits: storyboardBenefits.trim(),
        script_text: scriptText,
        selected_version_ids: storyboardSelectedVersionIds,
      });

      upsertSavedStoryboard(saved);
      restoreSavedStoryboard(saved);
    } catch (error) {
      setStoryboardError(error instanceof Error ? error.message : 'Không thể tạo storyboard.');
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  const getStoryboardProductInput = (): StoryboardProductInput => ({
    product_name: storyboardProductName.trim(),
    category: storyboardCategory.trim(),
    target_audience: storyboardAudience.trim(),
    tone: storyboardTone.trim(),
    key_benefits: storyboardBenefits.trim(),
  });

  const buildSelectedStoryboardCandidates = (): StoryboardCandidateScene[] => {
    const selectedIds = new Set(storyboardSelectedVersionIds);
    return datasetItems.flatMap((dataset) => (dataset.versions || []).flatMap((version) => {
      if (!selectedIds.has(version.id)) return [];
      return version.scenes.map((scene, sceneIndex) => ({
        candidate_id: `${version.id}:${sceneIndex}`,
        file_name: dataset.fileName,
        video_version_id: version.id,
        scene_index: sceneIndex,
        keyword: scene.keyword,
        description: scene.description,
        context: scene.context,
        subjects: scene.subjects,
        actions: scene.actions,
        mood: scene.mood,
        shot_type: scene.shot_type,
        marketing_uses: scene.marketing_uses,
        relevance_notes: scene.relevance_notes,
        start: scene.start,
        end: scene.end,
      }));
    }));
  };

  const copyStoryboardInput = async () => {
    const scriptText = storyboardScript.trim();
    if (!scriptText) {
      setStoryboardError('Vui lòng nhập kịch bản trước khi copy input.');
      return;
    }

    if (storyboardSelectedVersionIds.length === 0) {
      setStoryboardError('Vui lòng chọn ít nhất một version video để copy input.');
      return;
    }

    const candidateScenes = buildSelectedStoryboardCandidates();
    if (candidateScenes.length === 0) {
      setStoryboardError('Không có scene phù hợp trong các version đã chọn.');
      return;
    }

    try {
      const prompt = buildStoryboardCopyPrompt({
        product: getStoryboardProductInput(),
        script_text: scriptText,
        candidate_scenes: candidateScenes,
      });
      await navigator.clipboard.writeText(prompt);
      setStoryboardError(null);
    } catch {
      setStoryboardError('Không thể copy input vào clipboard.');
    }
  };

  const importStoryboard = async (rawJson: string) => {
    const scriptText = storyboardScript.trim();
    if (!scriptText) {
      setStoryboardError('Vui lòng nhập kịch bản trước khi import storyboard.');
      throw new Error('Vui lòng nhập kịch bản trước khi import storyboard.');
    }
    try {
      assertCanImportStoryboard(storyboardSelectedVersionIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vui lòng chọn ít nhất một video để import storyboard.';
      setStoryboardError(message);
      throw new Error(message);
    }

    let resultJson: unknown;
    try {
      resultJson = JSON.parse(rawJson);
    } catch {
      setStoryboardError('JSON storyboard không hợp lệ.');
      throw new Error('JSON storyboard không hợp lệ.');
    }

    setStoryboardError(null);
    setIsGeneratingStoryboard(true);
    try {
      const saved = await api.importStoryboard({
        ...getStoryboardProductInput(),
        script_text: scriptText,
        selected_version_ids: storyboardSelectedVersionIds,
        result_json: resultJson,
      });
      upsertSavedStoryboard(saved);
      restoreSavedStoryboard(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể import storyboard.';
      setStoryboardError(message);
      throw new Error(message);
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  const selectSavedStoryboard = async (id: string) => {
    setStoryboardError(null);
    try {
      const saved = await api.getStoryboard(id);
      upsertSavedStoryboard(saved);
      restoreSavedStoryboard(saved);
    } catch (error) {
      setStoryboardError(error instanceof Error ? error.message : 'Không thể mở storyboard đã lưu.');
    }
  };

  const deleteSavedStoryboard = async (id: string) => {
    setStoryboardError(null);
    try {
      await api.deleteStoryboard(id);
      setSavedStoryboards((prev) => prev.filter((item) => item.id !== id));
      if (selectedSavedStoryboardId === id) {
        setSelectedSavedStoryboardId(null);
        setStoryboardResult(null);
        setSelectedStoryboardBeatId(null);
        setStoryboardPreviewMatch(null);
      }
    } catch (error) {
      setStoryboardError(error instanceof Error ? error.message : 'Không thể xóa storyboard đã lưu.');
    }
  };

  const analyzeVideos = async () => {
    if (videos.length === 0) {
      setGlobalError('Vui lòng tải lên ít nhất một video.');
      return;
    }

    setIsAnalyzing(true);
    setGlobalError(null);
    resetStoryboardState();

    const historyId = currentSearchId || Date.now().toString();
    const searchKeywords = keywords.trim();
    const updatedVideos = videos.map((video) => ({ ...video }));
    setVideos(updatedVideos);

    for (let index = 0; index < updatedVideos.length; index += 1) {
      const video = updatedVideos[index];
      const filename = video.fileName;

      if (video.versions && video.versions.length > 0) {
        if (!searchKeywords) {
          updatedVideos[index] = clearSearchSelection(video);
          setVideos([...updatedVideos]);
          continue;
        }

        const versionId = video.versions[video.currentVersionIndex || 0]?.id;
        if (!versionId) continue;

        updatedVideos[index] = { ...video, status: 'analyzing', error: undefined };
        setVideos([...updatedVideos]);

        try {
          const { savedHistory } = await searchOnServer(versionId, searchKeywords);
          if (savedHistory) upsertHistoryItem(savedHistory);
          const serverVideo = focusSavedVideo(savedHistory, filename);
          updatedVideos[index] = serverVideo || normalizeVideo({ ...video, status: 'success', currentSearchKeywords: searchKeywords, viewMode: 'matched' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Lỗi không xác định';
          updatedVideos[index] = {
            ...video,
            status: 'success',
            currentSearchKeywords: searchKeywords,
            viewMode: 'matched',
            matchedScenes: [],
            scenes: [],
            searchError: message,
          };
        }

        setVideos([...updatedVideos]);
        continue;
      }

      updatedVideos[index] = { ...video, status: 'analyzing', error: undefined };
      setVideos([...updatedVideos]);

      try {
        const { savedHistory, errorMsg } = await analyzeOnServer(filename, historyId, searchKeywords);
        if (savedHistory) {
          upsertHistoryItem(savedHistory);
          const serverVideo = focusSavedVideo(savedHistory, filename);
          updatedVideos[index] = serverVideo || normalizeVideo({ ...updatedVideos[index], status: 'success' });
        } else if (errorMsg) {
          updatedVideos[index] = { ...updatedVideos[index], status: 'error', error: errorMsg };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Lỗi không xác định';
        updatedVideos[index] = { ...updatedVideos[index], status: 'error', error: message };
      }

      setVideos([...updatedVideos]);
    }

    setCurrentSearchId(historyId);
    setIsAnalyzing(false);
  };

  const analyzeSingleVideo = async (index: number) => {
    const video = videos[index];
    const historyId = currentSearchId || Date.now().toString();
    const searchKeywords = keywords.trim();

    setGlobalError(null);
    resetStoryboardState();
    setVideos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'analyzing', error: undefined };
      return next;
    });

    try {
      const { savedHistory, errorMsg } = await analyzeOnServer(video.fileName, historyId, searchKeywords);
      if (savedHistory) {
        upsertHistoryItem(savedHistory);
      }

      setVideos((prev) => {
        const next = [...prev];
        if (savedHistory) {
          const serverVideo = focusSavedVideo(savedHistory, video.fileName);
          next[index] = serverVideo || normalizeVideo({ ...next[index], status: 'success' });
        } else if (errorMsg) {
          next[index] = { ...next[index], status: 'error', error: errorMsg };
        }
        return next;
      });

      if (!currentSearchId) setCurrentSearchId(historyId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định';
      setVideos((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'error', error: message };
        return next;
      });
    }
  };

  const switchVersion = (videoIndex: number, versionIndex: number) => {
    setVideos((prev) => {
      const next = [...prev];
      const video = next[videoIndex];
      if (video.versions && video.versions[versionIndex]) {
        const nextVideo = normalizeVideo({
          ...video,
          currentVersionIndex: versionIndex,
        });
        next[videoIndex] = nextVideo;

        if (video.dbVideoId != null) {
          void persistVideoSelection(String(video.dbVideoId), versionIndex, nextVideo.currentSearchKeywords || '').catch(() => {});
        }
      }
      return next;
    });
  };

  const setVideoViewMode = (videoIndex: number, viewMode: ViewMode) => {
    setVideos((prev) => {
      const next = [...prev];
      next[videoIndex] = normalizeVideo({
        ...next[videoIndex],
        viewMode,
      });
      return next;
    });
  };

  const exportSRT = (video: VideoResult) => {
    if (video.scenes.length === 0) return;

    let srt = '';
    video.scenes.forEach((scene, index) => {
      const formatSRTTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss},${ms}`;
      };

      srt += `${index + 1}\n`;
      srt += `${formatSRTTime(scene.start)} --> ${formatSRTTime(scene.end)}\n`;
      srt += `[${scene.keyword}] ${scene.description}\n\n`;
    });

    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${video.fileName.split('.')[0]}_scenes.srt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const trimAndDownload = async (video: { fileName: string }, scene: Scene, sceneIndex: number) => {
    const sceneId = `${video.fileName}-${sceneIndex}`;
    setTrimmingScene(sceneId);
    try {
      const response = await fetch('/api/trim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: video.fileName, start: scene.start, end: scene.end }),
      });

      if (!response.ok) throw new Error(`Trim failed: ${response.status}`);

      const blob = await response.blob();
      const safeKeyword = scene.keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fff\u00C0-\u024F]/g, '_');
      const downloadName = `${video.fileName.split('.')[0]}_${safeKeyword}_${Math.floor(scene.start)}s.mp4`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định';
      alert(`Lỗi khi cắt video: ${message}`);
    } finally {
      setTrimmingScene(null);
    }
  };

  const openDatasetInSearch = (dataset: DatasetItem) => {
    setKeywords(dataset.currentSearchKeywords || dataset.historyKeywords || '');
    setSearchProductName(dataset.productName === FALLBACK_PRODUCT_NAME ? '' : dataset.productName);
    setVideos([normalizeVideo({ ...dataset })]);
    setCurrentSearchId(dataset.historyId);
    setActiveDatasetId(dataset.datasetId);
    navigate('/search');
    setGlobalError(null);
    resetStoryboardState();
  };

  const openDatasetInStoryboard = (dataset: DatasetItem) => {
    const currentVersion = dataset.versions?.[dataset.currentVersionIndex || 0];
    setActiveDatasetId(dataset.datasetId);
    navigate('/storyboard');
    setGlobalError(null);
    resetStoryboardState();

    if (currentVersion) {
      setStoryboardSelectedVersionIds([currentVersion.id]);
    } else {
      setStoryboardSelectedVersionIds([]);
    }
  };

  const switchLibraryVersion = async (dataset: DatasetItem, versionIndex: number) => {
    try {
      await persistVideoSelection(dataset.datasetId, versionIndex, dataset.currentSearchKeywords || '');
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Không thể cập nhật version đang chọn.');
    }
  };

  const openCreateFolderDialog = () => {
    setFolderFormMode('create');
    setFolderTarget(null);
    setFolderFormOpen(true);
  };

  const openRenameFolderDialog = (folder: ProductFolderSummary) => {
    setFolderFormMode('rename');
    setFolderTarget(folder);
    setFolderFormOpen(true);
  };

  const openDeleteFolderDialog = (folder: ProductFolderSummary) => {
    setDeleteFolderTarget(folder);
  };

  const submitFolderForm = async (name: string) => {
    if (folderFormMode === 'create') {
      await runLibraryMutation(() => api.createProductFolder({ name }));
      return;
    }
    if (!folderTarget) {
      throw new Error('Không tìm thấy thư mục để đổi tên.');
    }
    await runLibraryMutation(() => api.updateProductFolder(folderTarget.id, { name }));
  };

  const submitDeleteFolder = async () => {
    if (!deleteFolderTarget) {
      throw new Error('Không tìm thấy thư mục để xóa.');
    }
    await runLibraryMutation(() => api.deleteProductFolder(deleteFolderTarget.id));
  };

  const openEditVideoDialog = (dataset: DatasetItem) => {
    setEditVideoTarget(dataset);
  };

  const submitEditVideo = async (payload: { filename?: string; folderId?: number }) => {
    if (!editVideoTarget?.videoFileId) {
      throw new Error('Video này chưa có ID file để cập nhật.');
    }
    await runLibraryMutation(() => api.updateVideoFile(editVideoTarget.videoFileId!, {
      filename: payload.filename,
      folder_id: payload.folderId,
    }));
  };

  const toggleProductGroup = (groupKey: string) => {
    setExpandedProductGroups((prev) => (
      prev.includes(groupKey)
        ? prev.filter((key) => key !== groupKey)
        : [...prev, groupKey]
    ));
  };

  const removeDataset = async (dataset: DatasetItem) => {
    const confirmed = window.confirm(`Xóa dataset đã lưu cho video "${dataset.fileName}"?`);
    if (!confirmed) return;

    try {
      const removedVersionIds = new Set((dataset.versions || []).map((version) => version.id));
      const remainingSearchVideos = videos.filter((video) => String(video.dbVideoId) !== dataset.datasetId);

      await api.deleteDataset(dataset.datasetId);

      setHistory((prev) => prev
        .map((item) => (item.id === dataset.historyId
          ? { ...item, videos: item.videos.filter((video) => String(video.dbVideoId) !== dataset.datasetId) }
          : item))
        .filter((item) => item.videos.length > 0));

      setVideos(remainingSearchVideos);
      if (currentSearchId === dataset.historyId && remainingSearchVideos.length === 0) {
        setCurrentSearchId(null);
        setKeywords('');
      }
      if (activeDatasetId === dataset.datasetId) {
        setActiveDatasetId(null);
      }

      setStoryboardSelectedVersionIds((prev) => prev.filter((id) => !removedVersionIds.has(id)));
      if (storyboardResult?.beatMatches.some((group) => group.matches.some((match) => removedVersionIds.has(match.videoVersionId)))) {
        resetStoryboardState();
      }
      setGlobalError(null);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Không thể xóa dataset đã lưu.');
    }
  };

  const activeDatasetVersion = activeDataset?.versions?.[activeDataset.currentVersionIndex || 0] || null;

  const renderPage = (page: ReactNode) => (
    <>
      {globalError ? (
        <div className="m-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive-foreground">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="leading-6">{globalError}</p>
        </div>
      ) : null}
      {page}
    </>
  );

  return (
    <AppLayout>
      <Routes>
        <Route
          path="/"
          element={renderPage(
            <LibraryPage
              groupedDatasets={groupedDatasets}
              activeDataset={activeDataset}
              activeDatasetVersion={activeDatasetVersion}
              expandedProductGroups={expandedProductGroups}
              librarySourceFilter={librarySourceFilter}
              libraryViewMode={libraryViewMode}
              trimmingScene={trimmingScene}
              onSelectSourceFilter={setLibrarySourceFilter}
              onToggleProductGroup={toggleProductGroup}
              onSelectDataset={setActiveDatasetId}
              onOpenDatasetInSearch={openDatasetInSearch}
              onOpenDatasetInStoryboard={openDatasetInStoryboard}
              onRemoveDataset={removeDataset}
              onSwitchLibraryVersion={switchLibraryVersion}
              onSetLibraryViewMode={setLibraryViewMode}
              onExportSRT={exportSRT}
              onPlayScene={(scene) => playScene(LIBRARY_PLAYER_SLOT, scene)}
              onTrimScene={(scene, sceneIndex) => {
                if (activeDataset) {
                  void trimAndDownload(activeDataset, scene, sceneIndex);
                }
              }}
              onLibraryPlayerRef={(node) => {
                playerRefs.current[LIBRARY_PLAYER_SLOT] = node;
              }}
              onPlayerLoadedMetadata={() => handlePlayerLoadedMetadata(LIBRARY_PLAYER_SLOT)}
              onPlayerTimeUpdate={() => handlePlayerTimeUpdate(LIBRARY_PLAYER_SLOT)}
              folders={folders}
              assetMutating={assetMutating}
              editVideoTarget={editVideoTarget}
              onOpenEditVideo={openEditVideoDialog}
              onCloseEditVideo={() => setEditVideoTarget(null)}
              onSubmitEditVideo={submitEditVideo}
              onCreateFolder={openCreateFolderDialog}
              onRenameFolder={openRenameFolderDialog}
              onDeleteFolder={openDeleteFolderDialog}
            />,
          )}
        />
        <Route
          path="/search"
          element={renderPage(
            <SearchPage
              keywords={keywords}
              searchProductName={searchProductName}
              videos={videos}
              isAnalyzing={isAnalyzing}
              isUploading={isUploading}
              trimmingScene={trimmingScene}
              uploadInputRef={uploadInputRef}
              onKeywordsChange={setKeywords}
              onSearchProductNameChange={setSearchProductName}
              onUpload={handleUpload}
              onAnalyzeVideos={analyzeVideos}
              onAnalyzeSingleVideo={analyzeSingleVideo}
              onSwitchVersion={switchVersion}
              onSetVideoViewMode={setVideoViewMode}
              onExportSRT={exportSRT}
              onPlayScene={playScene}
              onTrimScene={(video, scene, sceneIndex) => {
                void trimAndDownload(video, scene, sceneIndex);
              }}
              onSearchPlayerRef={(index, node) => {
                playerRefs.current[index] = node;
              }}
              onPlayerLoadedMetadata={handlePlayerLoadedMetadata}
              onPlayerTimeUpdate={handlePlayerTimeUpdate}
            />,
          )}
        />
        <Route
          path="/storyboard"
          element={renderPage(
            <StoryboardPage
              storyboardProductName={storyboardProductName}
              storyboardCategory={storyboardCategory}
              storyboardAudience={storyboardAudience}
              storyboardTone={storyboardTone}
              storyboardBenefits={storyboardBenefits}
              storyboardScript={storyboardScript}
              storyboardSelectedVersionIds={storyboardSelectedVersionIds}
              storyboardSources={storyboardSources}
              storyboardResult={storyboardResult}
              savedStoryboards={savedStoryboards}
              selectedSavedStoryboardId={selectedSavedStoryboardId}
              selectedStoryboardBeatId={selectedStoryboardBeatId}
              storyboardPreviewMatch={resolvedStoryboardPreviewMatch}
              storyboardError={storyboardError}
              isGeneratingStoryboard={isGeneratingStoryboard}
              activeDataset={activeDataset}
              activeDatasetUsableForStoryboard={activeDatasetUsableForStoryboard}
              trimmingScene={trimmingScene}
              onStoryboardProductNameChange={setStoryboardProductName}
              onStoryboardCategoryChange={setStoryboardCategory}
              onStoryboardAudienceChange={setStoryboardAudience}
              onStoryboardToneChange={setStoryboardTone}
              onStoryboardBenefitsChange={setStoryboardBenefits}
              onStoryboardScriptChange={setStoryboardScript}
              onCopyInput={() => {
                void copyStoryboardInput();
              }}
              onImportStoryboard={importStoryboard}
              onSelectSavedStoryboard={(id) => {
                void selectSavedStoryboard(id);
              }}
              onDeleteSavedStoryboard={(id) => {
                void deleteSavedStoryboard(id);
              }}
              onToggleSourceVersion={(versionId, checked) => {
                setStoryboardSelectedVersionIds((prev) => (
                  checked ? [...prev, versionId] : prev.filter((id) => id !== versionId)
                ));
              }}
              onGenerateStoryboard={generateStoryboard}
              onSelectBeat={setSelectedStoryboardBeatId}
              onPlayStoryboardMatch={playStoryboardMatch}
              onTrimMatch={(match) => {
                void trimAndDownload({ fileName: match.fileName }, match.scene, match.sceneIndex);
              }}
              onStoryboardPlayerRef={setStoryboardPlayer}
              onStoryboardTimeUpdate={handleStoryboardTimeUpdate}
            />,
          )}
        />
        <Route path="*" element={renderPage(<NotFound />)} />
      </Routes>

      <FolderFormDialog
        open={folderFormOpen}
        onOpenChange={(open) => {
          setFolderFormOpen(open);
          if (!open) {
            setFolderTarget(null);
          }
        }}
        title={folderFormMode === 'create' ? 'Tạo thư mục mới' : 'Đổi tên thư mục'}
        submitLabel={folderFormMode === 'create' ? 'Tạo thư mục' : 'Lưu thay đổi'}
        initialName={folderFormMode === 'rename' ? folderTarget?.name || '' : ''}
        isSubmitting={assetMutating}
        onSubmit={submitFolderForm}
      />

      <DeleteFolderDialog
        open={!!deleteFolderTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteFolderTarget(null);
        }}
        folder={deleteFolderTarget}
        isSubmitting={assetMutating}
        onDelete={submitDeleteFolder}
      />
    </AppLayout>
  );
}

function getDatasetGroupKey(dataset: DatasetItem) {
  if (dataset.folder) {
    return `folder:${dataset.folder.id}`;
  }

  return `dataset:${dataset.datasetId}`;
}
