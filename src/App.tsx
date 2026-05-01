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
  buildDatasetItems,
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
  type StoryboardMatch,
  type StoryboardResult,
  type ViewMode,
  type VideoResult,
} from '@/lib/footage-app';

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
  const [selectedStoryboardBeatId, setSelectedStoryboardBeatId] = useState<string | null>(null);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [storyboardPreviewMatch, setStoryboardPreviewMatch] = useState<StoryboardMatch | null>(null);
  const storyboardPlayerRef = useRef<HTMLVideoElement | null>(null);
  const storyboardPlaybackRef = useRef<{ end: number } | null>(null);
  const storyboardPendingMatchRef = useRef<StoryboardMatch | null>(null);
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
    setSelectedStoryboardBeatId(null);
    setStoryboardError(null);
    setStoryboardPreviewMatch(null);
    storyboardPlaybackRef.current = null;
    storyboardPendingMatchRef.current = null;
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
    setStoryboardPreviewMatch(firstMatch);
    storyboardPendingMatchRef.current = firstMatch;
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

  const seekStoryboardPreview = useCallback((match: StoryboardMatch) => {
    const player = storyboardPlayerRef.current;
    if (!player) return;

    storyboardPlaybackRef.current = { end: match.scene.end };
    player.pause();

    const startPlayback = () => {
      storyboardPendingMatchRef.current = null;
      player.play().catch(() => {});
    };

    const performSeek = () => {
      if (Math.abs(player.currentTime - match.scene.start) < 0.05) {
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
          player.fastSeek(match.scene.start);
          return;
        } catch {
          // Fall back to currentTime assignment below.
        }
      }

      player.currentTime = match.scene.start;
    };

    if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
      performSeek();
      return;
    }

    storyboardPendingMatchRef.current = match;
    if (player.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      player.load();
    }
  }, []);

  const playStoryboardMatch = useCallback((match: StoryboardMatch) => {
    const sameFile = storyboardPreviewMatch?.fileName === match.fileName;
    setStoryboardPreviewMatch(match);

    if (sameFile && storyboardPlayerRef.current) {
      seekStoryboardPreview(match);
      return;
    }

    storyboardPendingMatchRef.current = match;
  }, [seekStoryboardPreview, storyboardPreviewMatch?.fileName]);

  const handleStoryboardLoadedMetadata = useCallback(() => {
    if (storyboardPendingMatchRef.current) {
      seekStoryboardPreview(storyboardPendingMatchRef.current);
    }
  }, [seekStoryboardPreview]);

  const handleStoryboardTimeUpdate = useCallback(() => {
    const player = storyboardPlayerRef.current;
    const bounds = storyboardPlaybackRef.current;
    if (!player || !bounds) return;

    if (player.currentTime >= bounds.end) {
      player.pause();
      player.currentTime = bounds.end;
      storyboardPlaybackRef.current = null;
    }
  }, []);

  useEffect(() => {
    Promise.all([api.history(), api.productFolders()])
      .then(([items, folderItems]) => {
        setHistory(normalizeHistory(items));
        setFolders(folderItems);
      })
      .catch(() => setGlobalError('Không kết nối được server. Hãy chạy Python server trước.'));
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
      const result = await api.generateStoryboard({
        product_name: storyboardProductName.trim(),
        category: storyboardCategory.trim(),
        target_audience: storyboardAudience.trim(),
        tone: storyboardTone.trim(),
        key_benefits: storyboardBenefits.trim(),
        script_text: scriptText,
        selected_version_ids: storyboardSelectedVersionIds,
      });

      setStoryboardResult(result);

      const firstBeatId = result.beats[0]?.id || null;
      setSelectedStoryboardBeatId(firstBeatId);
      const firstMatch = firstBeatId
        ? result.beatMatches.find((group) => group.beatId === firstBeatId)?.matches[0] || null
        : null;
      setStoryboardPreviewMatch(firstMatch);
      storyboardPendingMatchRef.current = firstMatch;
    } catch (error) {
      setStoryboardError(error instanceof Error ? error.message : 'Không thể tạo storyboard.');
    } finally {
      setIsGeneratingStoryboard(false);
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
              onStoryboardPlayerRef={(node) => {
                storyboardPlayerRef.current = node;
              }}
              onStoryboardLoadedMetadata={handleStoryboardLoadedMetadata}
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
