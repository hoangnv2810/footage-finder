import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Film, Play, AlertCircle, Loader2, X, CheckCircle2, FileText, Plus, Scissors, RefreshCw, Upload } from 'lucide-react';

// --- Types ---

interface Scene {
  keyword: string;
  start: number;
  end: number;
  description: string;
  context?: string;
  subjects?: string[];
  actions?: string[];
  mood?: string;
  shot_type?: string;
  marketing_uses?: string[];
  relevance_notes?: string;
}

type ViewMode = 'matched' | 'full';
type AppMenu = 'library' | 'search' | 'storyboard';
type DatasetSource = 'extension' | 'web';
type DatasetSourceFilter = 'all' | DatasetSource;
const LIBRARY_PLAYER_SLOT = -1;

interface VideoVersion {
  id: string;
  timestamp: number;
  scenes: Scene[];
  keywords: string;
}

interface SearchResult {
  id: string;
  versionId: string;
  keywords: string;
  timestamp: number;
  scenes: Scene[];
  error?: string | null;
}

interface VideoResult {
  dbVideoId?: number;
  fileName: string;
  source: DatasetSource;
  productNameOverride?: string;
  resolvedProductName?: string;
  scenes: Scene[];
  status: 'pending' | 'analyzing' | 'success' | 'error';
  error?: string;
  versions?: VideoVersion[];
  currentVersionIndex?: number;
  searchResults?: SearchResult[];
  currentSearchKeywords?: string;
  matchedScenes?: Scene[];
  searchError?: string | null;
  viewMode?: ViewMode;
}

interface HistoryItem {
  id: string;
  date: number;
  keywords: string;
  productName?: string;
  videos: VideoResult[];
}

interface DatasetItem extends VideoResult {
  datasetId: string;
  historyId: string;
  updatedAt: number;
  historyKeywords: string;
  productName: string;
}

interface StoryboardBeat {
  id: string;
  label: string;
  text: string;
  intent: string;
  desiredVisuals: string;
  durationHint: number | null;
  position: number;
}

interface StoryboardMatch {
  id: string;
  beatId: string;
  videoVersionId: string;
  fileName: string;
  sceneIndex: number;
  score: number;
  matchReason: string;
  usageType: 'direct_product' | 'illustrative_broll';
  scene: Scene;
}

interface StoryboardBeatMatches {
  beatId: string;
  matches: StoryboardMatch[];
}

interface StoryboardResult {
  beats: StoryboardBeat[];
  beatMatches: StoryboardBeatMatches[];
  models: {
    video_analysis_model: string;
    script_planning_model: string;
    scene_matching_model: string;
  };
}

// --- API helpers ---

const api = {
  async history(): Promise<HistoryItem[]> {
    const res = await fetch('/api/history');
    if (!res.ok) return [];
    return res.json();
  },

  async deleteHistory(id: string): Promise<void> {
    await fetch(`/api/history/${id}`, { method: 'DELETE' });
  },

  async deleteDataset(datasetId: string): Promise<void> {
    const res = await fetch(`/api/datasets/${datasetId}`, { method: 'DELETE' });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail || `Server lỗi: ${res.status}`);
    }
  },

  async updateHistoryProductName(historyId: string, productName: string): Promise<HistoryItem> {
    const res = await fetch(`/api/history/${historyId}/product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_name: productName }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail || `Server lỗi: ${res.status}`);
    }
    const payload = await res.json();
    return payload.history;
  },

  async updateDatasetProductName(datasetId: string, productNameOverride: string): Promise<HistoryItem> {
    const res = await fetch(`/api/datasets/${datasetId}/product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_name_override: productNameOverride }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail || `Server lỗi: ${res.status}`);
    }
    const payload = await res.json();
    return payload.history;
  },

  async search(versionId: string, keywords: string): Promise<any> {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: versionId, keywords }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail || `Server lỗi: ${res.status}`);
    }

    return res.json();
  },

  async generateStoryboard(payload: {
    product_name: string;
    category: string;
    target_audience: string;
    tone: string;
    key_benefits: string;
    script_text: string;
    selected_version_ids: string[];
  }): Promise<StoryboardResult> {
    const res = await fetch('/api/storyboard/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail || `Server lỗi: ${res.status}`);
    }

    return res.json();
  },

  async updateVideoSelection(historyId: string, filename: string, currentVersionIndex: number, currentSearchKeywords: string): Promise<HistoryItem> {
    const res = await fetch('/api/history/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history_id: historyId,
        filename,
        current_version_index: currentVersionIndex,
        current_search_keywords: currentSearchKeywords,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.detail || `Server lỗi: ${res.status}`);
    }

    const payload = await res.json();
    return payload.history;
  },
};

const getSourceLabel = (source: DatasetSource) => source === 'extension' ? 'Extension' : 'Web';

const getSourceBadgeClass = (source: DatasetSource) => source === 'extension'
  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
  : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';

const FALLBACK_PRODUCT_NAME = 'Chưa gán sản phẩm';

const normalizeVideo = (video: VideoResult): VideoResult => {
  const versions = video.versions || [];
  const currentVersionIndex = versions.length > 0
    ? Math.min(Math.max(video.currentVersionIndex ?? versions.length - 1, 0), versions.length - 1)
    : 0;
  const currentVersion = versions[currentVersionIndex];
  const fullScenes = currentVersion?.scenes || video.scenes || [];
  const currentSearchKeywords = video.currentSearchKeywords || '';
  const searchResults = video.searchResults || [];
  const activeSearch = currentVersion && currentSearchKeywords
    ? searchResults.find(result => result.versionId === currentVersion.id && result.keywords === currentSearchKeywords)
    : undefined;
  const matchedScenes = activeSearch?.scenes || [];
  const searchError = activeSearch?.error || null;
  const defaultViewMode: ViewMode = currentSearchKeywords ? 'matched' : 'full';
  const viewMode = video.viewMode === 'matched' && !currentSearchKeywords
    ? 'full'
    : (video.viewMode || defaultViewMode);

  return {
    ...video,
    source: video.source || 'web',
    productNameOverride: video.productNameOverride || '',
    resolvedProductName: video.resolvedProductName || FALLBACK_PRODUCT_NAME,
    scenes: viewMode === 'matched' ? matchedScenes : fullScenes,
    versions,
    currentVersionIndex,
    searchResults,
    currentSearchKeywords,
    matchedScenes,
    searchError,
    viewMode,
  };
};

const normalizeHistoryItem = (item: HistoryItem): HistoryItem => ({
  ...item,
  videos: item.videos.map(normalizeVideo),
});

const normalizeHistory = (items: HistoryItem[]) => items.map(normalizeHistoryItem);

const buildDatasetItems = (items: HistoryItem[]): DatasetItem[] => items.flatMap(item =>
  item.videos.map(video => ({
    ...normalizeVideo(video),
    datasetId: String(video.dbVideoId ?? `${item.id}:${video.fileName}`),
    historyId: item.id,
    updatedAt: item.date,
    historyKeywords: item.keywords,
    productName: video.resolvedProductName || item.productName || FALLBACK_PRODUCT_NAME,
  })),
);

// --- SSE stream reader ---

async function readSSEStream(
  response: Response,
  handlers: {
    onLog?: (msg: string) => void;
    onChunk?: (content: string) => void;
    onResult?: (data: any) => void;
    onSaved?: (data: any) => void;
    onError?: (msg: string) => void;
    onDone?: () => void;
  },
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.trim().split('\n');
      let event = '';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (!event || !data) continue;

      try {
        const parsed = JSON.parse(data);
        switch (event) {
          case 'log': handlers.onLog?.(parsed.message); break;
          case 'chunk': handlers.onChunk?.(parsed.content); break;
          case 'full_result': handlers.onResult?.(parsed); break;
          case 'result': handlers.onResult?.(parsed); break;
          case 'search_result': handlers.onResult?.(parsed); break;
          case 'saved': handlers.onSaved?.(parsed); break;
          case 'error': handlers.onError?.(parsed.message); break;
          case 'search_error': handlers.onError?.(parsed.message); break;
          case 'done': handlers.onDone?.(); break;
        }
      } catch { /* ignore malformed events */ }
    }

    if (done) break;
  }
}

// --- App ---

export default function App() {
  const [activeMenu, setActiveMenu] = useState<AppMenu>('library');
  const [keywords, setKeywords] = useState('');
  const [searchProductName, setSearchProductName] = useState('');
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [expandedProductGroups, setExpandedProductGroups] = useState<string[]>([]);
  const [librarySourceFilter, setLibrarySourceFilter] = useState<DatasetSourceFilter>('all');
  const [trimmingScene, setTrimmingScene] = useState<string | null>(null);
  const [trimStatus, setTrimStatus] = useState<string>('');
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
  const [libraryBatchProductName, setLibraryBatchProductName] = useState('');
  const [libraryVideoProductName, setLibraryVideoProductName] = useState('');
  const [libraryViewMode, setLibraryViewMode] = useState<ViewMode>('full');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    setGlobalError(null);
    try {
      const formData = new FormData();
      const fileList = e.target.files;
      for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]);
      }
      const res = await fetch('/api/videos/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload thất bại');
      const result = await res.json();
      // Add uploaded files as pending video results
      const newVideos: VideoResult[] = (result.uploaded || []).map((u: any) => ({
        fileName: u.filename,
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
      setVideos(prev => [...prev, ...newVideos]);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Upload thất bại');
    } finally {
      setIsUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const removeVideo = (index: number) => {
    setVideos(prev => prev.filter((_, i) => i !== index));
  };

  const refreshHistory = useCallback(() => {
    api.history().then(items => setHistory(normalizeHistory(items))).catch(() => {});
  }, [searchProductName]);

  const upsertHistoryItem = useCallback((item: HistoryItem) => {
    const normalizedItem = normalizeHistoryItem(item);
    setHistory(prev => [
      normalizedItem,
      ...prev.filter(existing => existing.id !== normalizedItem.id),
    ].sort((a, b) => b.date - a.date));
  }, []);

  const getServerVideo = useCallback((savedHistory: HistoryItem | null, filename: string): VideoResult | null => {
    const serverVideo = savedHistory?.videos?.find(v => v.fileName === filename);
    return serverVideo ? normalizeVideo({ ...serverVideo, status: 'success' }) : null;
  }, []);

  const focusSavedVideo = useCallback((savedHistory: HistoryItem | null, filename: string): VideoResult | null => {
    const serverVideo = getServerVideo(savedHistory, filename);
    if (serverVideo?.dbVideoId !== undefined) {
      setActiveDatasetId(String(serverVideo.dbVideoId));
    }
    return serverVideo;
  }, [getServerVideo]);

  const applyUpdatedHistory = useCallback((updatedHistory: HistoryItem, preferredDatasetId?: string) => {
    upsertHistoryItem(updatedHistory);
    if (preferredDatasetId) {
      setActiveDatasetId(preferredDatasetId);
      return;
    }

    const normalizedItem = normalizeHistoryItem(updatedHistory);
    const firstVideoId = normalizedItem.videos[0]?.dbVideoId;
    if (firstVideoId !== undefined) {
      setActiveDatasetId(String(firstVideoId));
    }
  }, [upsertHistoryItem]);

  const persistVideoSelection = useCallback(async (historyId: string, filename: string, currentVersionIndex: number, currentSearchKeywords: string) => {
    const updatedHistory = await api.updateVideoSelection(historyId, filename, currentVersionIndex, currentSearchKeywords);
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

  const datasetItems = useMemo(() => buildDatasetItems(history), [history]);

  const filteredDatasets = useMemo(
    () => datasetItems.filter(dataset => librarySourceFilter === 'all' || dataset.source === librarySourceFilter),
    [datasetItems, librarySourceFilter],
  );

  const groupedDatasets = useMemo(() => {
    const groups = new Map<string, DatasetItem[]>();
    filteredDatasets.forEach((dataset) => {
      const key = dataset.productName || FALLBACK_PRODUCT_NAME;
      const existing = groups.get(key) || [];
      existing.push(dataset);
      groups.set(key, existing);
    });

    return Array.from(groups.entries())
      .map(([productName, datasets]) => ({
        productName,
        datasets: [...datasets].sort((a, b) => b.updatedAt - a.updatedAt),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, 'vi'));
  }, [filteredDatasets]);

  const activeDataset = useMemo(
    () => filteredDatasets.find(dataset => dataset.datasetId === activeDatasetId) || filteredDatasets[0] || null,
    [filteredDatasets, activeDatasetId],
  );

  const storyboardSources = useMemo(() => datasetItems.flatMap(dataset => {
    const version = dataset.versions?.[dataset.currentVersionIndex || 0];
    if (!version || version.scenes.length === 0) return [];
    return [{
      datasetId: dataset.datasetId,
      fileName: dataset.fileName,
      versionId: version.id,
      sceneCount: version.scenes.length,
      timestamp: version.timestamp,
      source: dataset.source,
    }];
  }), [datasetItems]);

  const selectedStoryboardBeat = storyboardResult?.beats.find(beat => beat.id === selectedStoryboardBeatId) || null;
  const selectedStoryboardBeatMatches = storyboardResult?.beatMatches.find(match => match.beatId === selectedStoryboardBeatId)?.matches || [];
  const activeDatasetStoryboardVersionId = activeDataset?.versions?.[activeDataset.currentVersionIndex || 0]?.id || null;
  const activeDatasetUsableForStoryboard = !!activeDatasetStoryboardVersionId && storyboardSources.some(source => source.versionId === activeDatasetStoryboardVersionId);

  useEffect(() => {
    const availableIds = filteredDatasets.map(dataset => dataset.datasetId);
    if (availableIds.length === 0) {
      setActiveDatasetId(null);
      return;
    }

    setActiveDatasetId(prev => (prev && availableIds.includes(prev) ? prev : availableIds[0]));
  }, [filteredDatasets]);

  useEffect(() => {
    const productNames = groupedDatasets.map(group => group.productName);
    setExpandedProductGroups(prev => {
      const kept = prev.filter(name => productNames.includes(name));
      if (kept.length > 0) return kept;
      return productNames.length > 0 ? [productNames[0]] : [];
    });
  }, [groupedDatasets]);

  useEffect(() => {
    if (!activeDataset?.productName) return;
    setExpandedProductGroups(prev => prev.includes(activeDataset.productName)
      ? prev
      : [...prev, activeDataset.productName]);
  }, [activeDataset?.productName]);

  useEffect(() => {
    if (!activeDataset) {
      setLibraryBatchProductName('');
      setLibraryVideoProductName('');
      setLibraryViewMode('full');
      return;
    }

    const sourceHistory = history.find(item => item.id === activeDataset.historyId);
    setLibraryBatchProductName(sourceHistory?.productName || '');
    setLibraryVideoProductName(activeDataset.productNameOverride || '');
    setLibraryViewMode(activeDataset.currentSearchKeywords ? 'matched' : 'full');
  }, [activeDataset, history]);

  useEffect(() => {
    const preferredVersionId = activeDatasetStoryboardVersionId;
    setStoryboardSelectedVersionIds(prev => {
      const availableIds = storyboardSources.map(source => source.versionId);
      if (availableIds.length === 0) return [];
      const filtered = prev.filter(id => availableIds.includes(id));
      if (filtered.length > 0) return filtered;
      if (preferredVersionId && availableIds.includes(preferredVersionId)) {
        return [preferredVersionId];
      }
      if (activeDataset) return [];
      return availableIds;
    });
  }, [activeDataset, activeDatasetStoryboardVersionId, storyboardSources]);

  useEffect(() => {
    if (!storyboardResult || !selectedStoryboardBeatId) return;
    const firstMatch = storyboardResult.beatMatches.find(group => group.beatId === selectedStoryboardBeatId)?.matches[0] || null;
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

  // Load history on mount
  useEffect(() => {
    api.history().then(items => setHistory(normalizeHistory(items))).catch(() => setGlobalError('Không kết nối được server. Hãy chạy Python server trước.'));
  }, []);

  // --- Analysis ---

  const analyzeOnServer = async (filename: string, historyId: string, searchKeywords: string) => {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, keywords: searchKeywords, history_id: historyId, product_name: searchProductName.trim() }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Server lỗi: ${response.status}`);
    }

    let savedHistory: HistoryItem | null = null;
    let errorMsg: string | null = null;

    await readSSEStream(response, {
      onSaved: (data) => { savedHistory = normalizeHistoryItem(data.history); },
      onError: (msg) => { errorMsg = msg; },
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
    if (currentSearchId) {
      void persistVideoSelection(currentSearchId, video.fileName, nextVideo.currentVersionIndex || 0, '').catch(() => {});
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
        ? result.beatMatches.find(group => group.beatId === firstBeatId)?.matches[0] || null
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

    const updatedVideos = videos.map(v => ({ ...v }));
    setVideos(updatedVideos);

    for (let i = 0; i < updatedVideos.length; i++) {
      const video = updatedVideos[i];
      const filename = video.fileName;

      if (video.versions && video.versions.length > 0) {
        if (!searchKeywords) {
          updatedVideos[i] = clearSearchSelection(video);
          setVideos([...updatedVideos]);
          continue;
        }

        const versionId = video.versions[video.currentVersionIndex || 0]?.id;
        if (!versionId) {
          continue;
        }

        updatedVideos[i] = { ...video, status: 'analyzing', error: undefined };
        setVideos([...updatedVideos]);

        try {
          const { savedHistory } = await searchOnServer(versionId, searchKeywords);
          if (savedHistory) upsertHistoryItem(savedHistory);
          const serverVideo = focusSavedVideo(savedHistory, filename);
          updatedVideos[i] = serverVideo || normalizeVideo({ ...video, status: 'success', currentSearchKeywords: searchKeywords, viewMode: 'matched' });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Lỗi không xác định';
          updatedVideos[i] = {
            ...video,
            status: 'success',
            currentSearchKeywords: searchKeywords,
            viewMode: 'matched',
            matchedScenes: [],
            scenes: [],
            searchError: msg,
          };
        }

        setVideos([...updatedVideos]);
        continue;
      }

      updatedVideos[i] = { ...video, status: 'analyzing', error: undefined };
      setVideos([...updatedVideos]);

      try {
        const { savedHistory, errorMsg } = await analyzeOnServer(filename, historyId, searchKeywords);
        if (savedHistory) {
          upsertHistoryItem(savedHistory);
          const serverVideo = focusSavedVideo(savedHistory, filename);
          updatedVideos[i] = serverVideo || normalizeVideo({ ...updatedVideos[i], status: 'success' });
        } else if (errorMsg) {
          updatedVideos[i] = { ...updatedVideos[i], status: 'error', error: errorMsg };
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Lỗi không xác định';
        updatedVideos[i] = { ...updatedVideos[i], status: 'error', error: msg };
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
    setVideos(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'analyzing', error: undefined };
      return next;
    });

    try {
      const { savedHistory, errorMsg } = await analyzeOnServer(video.fileName, historyId, searchKeywords);

      if (savedHistory) {
        upsertHistoryItem(savedHistory);
      }

      setVideos(prev => {
        const next = [...prev];
        if (savedHistory) {
          const serverVideo = focusSavedVideo(savedHistory, video.fileName);
          if (serverVideo) {
            next[index] = serverVideo;
          } else {
            next[index] = normalizeVideo({ ...next[index], status: 'success' });
          }
        } else if (errorMsg) {
          next[index] = { ...next[index], status: 'error', error: errorMsg };
        }
        return next;
      });

      if (!currentSearchId) setCurrentSearchId(historyId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Lỗi không xác định';
      setVideos(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'error', error: msg };
        return next;
      });
    }
  };

  // --- Version switching ---

  const switchVersion = (videoIndex: number, versionIndex: number) => {
    setVideos(prev => {
      const next = [...prev];
      const video = next[videoIndex];
      if (video.versions && video.versions[versionIndex]) {
        const nextVideo = normalizeVideo({
          ...video,
          currentVersionIndex: versionIndex,
        });
        next[videoIndex] = nextVideo;
        if (currentSearchId) {
          void persistVideoSelection(currentSearchId, video.fileName, versionIndex, nextVideo.currentSearchKeywords || '').catch(() => {});
        }
      }
      return next;
    });
  };

  const setVideoViewMode = (videoIndex: number, viewMode: ViewMode) => {
    setVideos(prev => {
      const next = [...prev];
      next[videoIndex] = normalizeVideo({
        ...next[videoIndex],
        viewMode,
      });
      return next;
    });
  };

  // --- Export SRT ---

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
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.fileName.split('.')[0]}_scenes.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Trim ---

  const trimAndDownload = async (video: { fileName: string }, scene: Scene, sceneIndex: number) => {
    const sceneId = `${video.fileName}-${sceneIndex}`;
    setTrimmingScene(sceneId);
    setTrimStatus('Đang cắt video...');

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
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Lỗi không xác định';
      alert(`Lỗi khi cắt video: ${msg}`);
    } finally {
      setTrimmingScene(null);
      setTrimStatus('');
    }
  };

  // --- Workspace & library ---

  const startNewSearch = () => {
    setKeywords('');
    setSearchProductName('');
    setVideos([]);
    setCurrentSearchId(null);
    setGlobalError(null);
    setStoryboardProductName('');
    setStoryboardCategory('');
    setStoryboardAudience('');
    setStoryboardTone('');
    setStoryboardBenefits('');
    setStoryboardScript('');
    setStoryboardSelectedVersionIds([]);
    resetStoryboardState();
  };

  const openDatasetInSearch = (dataset: DatasetItem) => {
    setKeywords(dataset.currentSearchKeywords || dataset.historyKeywords || '');
    setSearchProductName(dataset.productName === FALLBACK_PRODUCT_NAME ? '' : dataset.productName);
    setVideos([normalizeVideo({ ...dataset })]);
    setCurrentSearchId(dataset.historyId);
    setActiveDatasetId(dataset.datasetId);
    setActiveMenu('search');
    setGlobalError(null);
    resetStoryboardState();
  };

  const openDatasetInStoryboard = (dataset: DatasetItem) => {
    const currentVersion = dataset.versions?.[dataset.currentVersionIndex || 0];
    setActiveDatasetId(dataset.datasetId);
    setActiveMenu('storyboard');
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
      await persistVideoSelection(dataset.historyId, dataset.fileName, versionIndex, dataset.currentSearchKeywords || '');
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Không thể cập nhật version đang chọn.');
    }
  };

  const saveHistoryProductName = async () => {
    if (!activeDataset) return;
    try {
      const updatedHistory = await api.updateHistoryProductName(activeDataset.historyId, libraryBatchProductName);
      applyUpdatedHistory(updatedHistory, activeDataset.datasetId);
      setGlobalError(null);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Không thể cập nhật tên sản phẩm mặc định.');
    }
  };

  const saveDatasetProductName = async () => {
    if (!activeDataset) return;
    try {
      const updatedHistory = await api.updateDatasetProductName(activeDataset.datasetId, libraryVideoProductName);
      applyUpdatedHistory(updatedHistory, activeDataset.datasetId);
      setGlobalError(null);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Không thể cập nhật tên sản phẩm cho video này.');
    }
  };

  const toggleProductGroup = (productName: string) => {
    setExpandedProductGroups(prev => prev.includes(productName)
      ? prev.filter(name => name !== productName)
      : [...prev, productName]);
  };

  const applyLibrarySearchSelection = async (dataset: DatasetItem, searchKeywords: string) => {
    try {
      await persistVideoSelection(dataset.historyId, dataset.fileName, dataset.currentVersionIndex || 0, searchKeywords);
      setGlobalError(null);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Không thể chuyển kết quả tìm kiếm đang xem.');
    }
  };

  const removeDataset = async (dataset: DatasetItem) => {
    const confirmed = window.confirm(`Xóa dataset đã lưu cho video "${dataset.fileName}"?`);
    if (!confirmed) return;

    try {
      const removedVersionIds = new Set((dataset.versions || []).map(version => version.id));
      const remainingSearchVideos = videos.filter(video => String(video.dbVideoId) !== dataset.datasetId);

      await api.deleteDataset(dataset.datasetId);
      setHistory(prev => prev
        .map(item => item.id === dataset.historyId
          ? { ...item, videos: item.videos.filter(video => String(video.dbVideoId) !== dataset.datasetId) }
          : item)
        .filter(item => item.videos.length > 0));

      setVideos(remainingSearchVideos);
      if (currentSearchId === dataset.historyId && remainingSearchVideos.length === 0) {
        setCurrentSearchId(null);
        setKeywords('');
      }
      if (activeDatasetId === dataset.datasetId) {
        setActiveDatasetId(null);
      }
      setStoryboardSelectedVersionIds(prev => prev.filter(id => !removedVersionIds.has(id)));
      if (storyboardResult?.beatMatches.some(group => group.matches.some(match => removedVersionIds.has(match.videoVersionId)))) {
        resetStoryboardState();
      }
      setGlobalError(null);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Không thể xóa dataset đã lưu.');
    }
  };

  // --- Helpers ---

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activeDatasetVersion = activeDataset?.versions?.[activeDataset.currentVersionIndex || 0] || null;
  const activeLibraryScenes = libraryViewMode === 'matched'
    ? (activeDataset?.matchedScenes || [])
    : (activeDatasetVersion?.scenes || []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30">
      <div className="flex min-h-screen">
        <aside className="w-72 border-r border-zinc-800 bg-zinc-900/50 flex-shrink-0">
          <div className="p-6 border-b border-zinc-800">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center">
              <Film className="w-7 h-7 text-indigo-400 mr-3" />
              Footage Finder
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              Quản lý dữ liệu phân cảnh, tìm footage và dựng storyboard từ dữ liệu đã lưu.
            </p>
          </div>

          <nav className="p-4 space-y-2">
            {[
              { key: 'library' as const, label: 'Thư viện dữ liệu', icon: Film },
              { key: 'search' as const, label: 'Tìm phân cảnh', icon: Search },
              { key: 'storyboard' as const, label: 'Storyboard', icon: FileText },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveMenu(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-colors ${isActive ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200' : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-[1600px] w-full mx-auto px-4 py-8">
            <header className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 mb-2">
                  {activeMenu === 'library' ? 'Library' : activeMenu === 'search' ? 'Search' : 'Storyboard'}
                </p>
                <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
                  {activeMenu === 'library' ? 'Thư viện dữ liệu' : activeMenu === 'search' ? 'Tìm phân cảnh' : 'Storyboard'}
                </h2>
                <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
                  {activeMenu === 'library'
                    ? 'Xem dữ liệu đã lưu từ Extension và Web, chọn version phù hợp rồi chuyển sang các chức năng khác.'
                    : activeMenu === 'search'
                      ? 'Tải video lên hoặc mở dataset đã có để phân tích toàn bộ và tìm phân cảnh theo từ khóa.'
                      : 'Ghép kịch bản với các version đã lưu trong thư viện dữ liệu để tìm footage phù hợp cho từng beat.'}
                </p>
              </div>

              {activeMenu === 'search' && (currentSearchId || videos.length > 0) && (
                <button
                  onClick={startNewSearch}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Bắt đầu phiên mới</span>
                </button>
              )}
            </header>

            {globalError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3"
              >
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-300">{globalError}</p>
              </motion.div>
            )}

            {activeMenu === 'library' ? (
              <div className="grid grid-cols-[380px_1fr] gap-6 items-start min-h-[calc(100vh-230px)]">
                <section className="space-y-4 sticky top-8">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-zinc-200">Nguồn dữ liệu</p>
                      <span className="text-xs text-zinc-500">{filteredDatasets.length} dataset · {groupedDatasets.length} nhóm</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: 'all', label: 'Tất cả' },
                        { key: 'extension', label: 'Extension' },
                        { key: 'web', label: 'Web' },
                      ] as const).map((filter) => (
                        <button
                          key={filter.key}
                          onClick={() => setLibrarySourceFilter(filter.key)}
                          className={`rounded-xl border px-3 py-2 text-xs transition-colors ${librarySourceFilter === filter.key ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'}`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">

                      {filteredDatasets.length === 0 ? (
                        <div className="min-h-[220px] flex items-center justify-center rounded-xl border border-dashed border-zinc-800 px-4 text-center text-sm text-zinc-500">
                          {librarySourceFilter === 'all'
                            ? 'Chưa có dữ liệu nào trong thư viện.'
                            : `Chưa có dữ liệu nguồn ${librarySourceFilter === 'extension' ? 'Extension' : 'Web'}.`}
                        </div>
                      ) : (
                        <div className="max-h-[72vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                          {groupedDatasets.map((group) => {
                            const isExpanded = expandedProductGroups.includes(group.productName);
                            return (
                              <div key={group.productName} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
                                <button
                                  onClick={() => toggleProductGroup(group.productName)}
                                  className="w-full border-b border-zinc-800/80 p-4 text-left transition-colors hover:bg-zinc-900/60"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-zinc-100">{group.productName}</p>
                                      <p className="mt-1 text-xs text-zinc-500">{group.datasets.length} video</p>
                                    </div>
                                    <span className="text-xs text-zinc-500">{isExpanded ? 'Thu gọn' : 'Mở'}</span>
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="space-y-2 p-2">
                                    {group.datasets.map((dataset) => {
                                      const isActive = activeDataset?.datasetId === dataset.datasetId;
                                      return (
                                        <button
                                          key={dataset.datasetId}
                                          onClick={() => setActiveDatasetId(dataset.datasetId)}
                                          className={`w-full rounded-xl border p-4 text-left transition-colors ${isActive ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
                                        >
                                          <div className="mb-3 flex items-start justify-between gap-3">
                                            <p className="truncate text-sm font-medium text-zinc-100">{dataset.fileName}</p>
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getSourceBadgeClass(dataset.source)}`}>
                                              {getSourceLabel(dataset.source)}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between text-xs text-zinc-500">
                                            <span>{dataset.versions?.length || 0} version</span>
                                            <span>{new Date(dataset.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                          </div>
                                          {dataset.status === 'error' && dataset.error && (
                                            <p className="mt-3 line-clamp-2 text-xs text-rose-300">{dataset.error}</p>
                                          )}
                                          {dataset.currentSearchKeywords && (
                                            <p className="mt-3 truncate text-xs text-zinc-400">
                                              Từ khóa hiện tại: <span className="text-zinc-200">{dataset.currentSearchKeywords}</span>
                                            </p>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                </section>

                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                      {activeDataset ? (
                        <div className="space-y-5">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getSourceBadgeClass(activeDataset.source)}`}>
                                  {getSourceLabel(activeDataset.source)}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400">
                                  {activeDataset.status}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400">
                                  {activeDataset.productName}
                                </span>
                              </div>
                              <h4 className="break-all text-2xl font-semibold text-zinc-100">{activeDataset.fileName}</h4>
                              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                                <span>{activeDataset.versions?.length || 0} version</span>
                                <span>Cập nhật {new Date(activeDataset.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => openDatasetInSearch(activeDataset)}
                                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-zinc-200 transition-colors hover:border-zinc-700"
                              >
                                Mở trong Tìm phân cảnh
                              </button>
                              <button
                                onClick={() => openDatasetInStoryboard(activeDataset)}
                                disabled={!activeDatasetVersion || activeDatasetVersion.scenes.length === 0}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Dùng cho Storyboard
                              </button>
                              <button
                                onClick={() => removeDataset(activeDataset)}
                                className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-rose-300 transition-colors hover:bg-rose-500/20"
                              >
                                Xóa dataset
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                              <div>
                                <label className="mb-2 block text-sm font-medium text-zinc-300">Tên sản phẩm mặc định của nhóm</label>
                                <input
                                  value={libraryBatchProductName}
                                  onChange={(e) => setLibraryBatchProductName(e.target.value)}
                                  placeholder="VD: Serum trị mụn"
                                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                              <button
                                onClick={saveHistoryProductName}
                                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-200 transition-colors hover:border-zinc-700"
                              >
                                Lưu tên mặc định cho nhóm
                              </button>
                            </div>

                            <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                              <div>
                                <label className="mb-2 block text-sm font-medium text-zinc-300">Tên sản phẩm riêng cho video đang chọn</label>
                                <input
                                  value={libraryVideoProductName}
                                  onChange={(e) => setLibraryVideoProductName(e.target.value)}
                                  placeholder="Để trống để dùng tên mặc định của nhóm"
                                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={saveDatasetProductName}
                                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-200 transition-colors hover:border-zinc-700"
                                >
                                  Lưu cho video này
                                </button>
                                <button
                                  onClick={() => setLibraryVideoProductName('')}
                                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                                >
                                  Bỏ override
                                </button>
                              </div>
                            </div>
                          </div>

                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30"
                          >
                            <div className="flex flex-col gap-4 border-b border-zinc-800 bg-zinc-900/50 p-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0">
                                <h3 className="truncate pr-4 font-medium text-zinc-200">
                                  {activeDataset.fileName}
                                </h3>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getSourceBadgeClass(activeDataset.source)}`}>
                                    {getSourceLabel(activeDataset.source)}
                                  </span>
                                  <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400">
                                    {activeDataset.productName}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {activeDataset.versions && activeDataset.versions.length > 1 && (
                                  <select
                                    value={activeDataset.currentVersionIndex || 0}
                                    onChange={(e) => switchLibraryVersion(activeDataset, parseInt(e.target.value, 10))}
                                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none"
                                  >
                                    {activeDataset.versions.map((version, versionIndex) => (
                                      <option key={version.id} value={versionIndex}>
                                        Lần {versionIndex + 1} {version.keywords ? `- "${version.keywords.length > 20 ? `${version.keywords.slice(0, 20)}...` : version.keywords}"` : ''} ({new Date(version.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {activeDataset.currentSearchKeywords && (
                                  <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 p-0.5">
                                    <button
                                      onClick={() => setLibraryViewMode('matched')}
                                      disabled={!activeDataset.currentSearchKeywords}
                                      className={`rounded-full px-2.5 py-1 text-xs transition-colors ${libraryViewMode === 'matched' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'} disabled:opacity-40`}
                                    >
                                      Kết quả tìm kiếm
                                    </button>
                                    <button
                                      onClick={() => setLibraryViewMode('full')}
                                      className={`rounded-full px-2.5 py-1 text-xs transition-colors ${libraryViewMode === 'full' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                                    >
                                      Toàn bộ phân tích
                                    </button>
                                  </div>
                                )}

                                {activeLibraryScenes.length > 0 && (
                                  <button
                                    onClick={() => exportSRT({ ...activeDataset, scenes: activeLibraryScenes })}
                                    className="inline-flex items-center rounded-full bg-indigo-400/10 px-3 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-400/20"
                                    title="Xuất SRT cho CapCut"
                                  >
                                    <FileText className="mr-1.5 h-3 w-3" />
                                    Xuất SRT
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 divide-y divide-zinc-800 md:grid-cols-2 md:divide-x md:divide-y-0">
                              <div className="flex flex-col justify-center bg-black/20 p-4">
                                <video
                                  id="video-player-library"
                                  ref={(node) => {
                                    playerRefs.current[LIBRARY_PLAYER_SLOT] = node;
                                  }}
                                  src={`/api/videos/${encodeURIComponent(activeDataset.fileName)}/stream`}
                                  preload="metadata"
                                  onLoadedMetadata={() => handlePlayerLoadedMetadata(LIBRARY_PLAYER_SLOT)}
                                  onTimeUpdate={() => handlePlayerTimeUpdate(LIBRARY_PLAYER_SLOT)}
                                  controls
                                  className="max-h-[60vh] w-full rounded-lg bg-black object-contain"
                                />
                              </div>

                              <div className="h-full max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
                                {activeDataset.currentSearchKeywords && (
                                  <div className="mb-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300">
                                    Từ khóa hiện tại: <span className="font-medium">{activeDataset.currentSearchKeywords}</span>
                                  </div>
                                )}

                                {activeDataset.status === 'error' && (
                                  <div className="flex h-full flex-col items-center justify-center p-4 text-center text-sm text-rose-400/80">
                                    <AlertCircle className="mb-2 h-6 w-6 opacity-50" />
                                    <p>{activeDataset.error || 'Dataset đang ở trạng thái lỗi.'}</p>
                                  </div>
                                )}

                                {activeDataset.status !== 'error' && activeDataset.searchError && libraryViewMode === 'matched' && (
                                  <div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                                    {activeDataset.searchError}
                                  </div>
                                )}

                                {activeDataset.status !== 'error' && activeLibraryScenes.length === 0 ? (
                                  <div className="flex min-h-[120px] items-center justify-center text-center text-sm text-zinc-500">
                                    {libraryViewMode === 'matched'
                                      ? (activeDataset.searchError
                                        ? 'Không thể tìm theo từ khóa hiện tại. Bạn vẫn có thể chuyển sang toàn bộ phân tích.'
                                        : 'Không có phân cảnh nào khớp với từ khóa hiện tại.')
                                      : 'Dataset này chưa có scene hợp lệ để hiển thị.'}
                                  </div>
                                ) : activeDataset.status !== 'error' && (
                                  <div className="space-y-3">
                                    {activeLibraryScenes.map((scene, sceneIndex) => {
                                      const isTrimming = trimmingScene === `${activeDataset.fileName}-${sceneIndex}`;
                                      return (
                                        <div
                                          key={`${activeDataset.datasetId}-${libraryViewMode}-${sceneIndex}`}
                                          onClick={() => playScene(LIBRARY_PLAYER_SLOT, scene)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              playScene(LIBRARY_PLAYER_SLOT, scene);
                                            }
                                          }}
                                          role="button"
                                          tabIndex={0}
                                          className="group cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition-colors hover:border-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                                        >
                                          <div className="mb-2 flex items-start justify-between">
                                            <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${libraryViewMode === 'matched' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'}`}>
                                              {scene.keyword}
                                            </span>
                                            <button
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                playScene(LIBRARY_PLAYER_SLOT, scene);
                                              }}
                                              className="flex items-center text-xs text-zinc-400 transition-colors hover:text-indigo-400"
                                              title="Phát từ đây"
                                            >
                                              <Play className="mr-1 h-3 w-3" />
                                              {formatTime(scene.start)} - {formatTime(scene.end)}
                                            </button>
                                          </div>
                                          <p className="mb-3 text-sm leading-relaxed text-zinc-300">{scene.description}</p>
                                          <div className="flex items-center justify-end border-t border-zinc-800/50 pt-2">
                                            <button
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                trimAndDownload(activeDataset, scene, sceneIndex);
                                              }}
                                              disabled={isTrimming}
                                              className="flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              {isTrimming ? (
                                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                              ) : (
                                                <Scissors className="mr-1.5 h-3 w-3" />
                                              )}
                                              {isTrimming ? (trimStatus || 'Đang cắt...') : 'Cắt & Tải xuống'}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>

                          {activeDataset.currentSearchKeywords && (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-zinc-200">Kết quả tìm kiếm đang lưu</h4>
                                <span className="text-xs text-zinc-500">{activeDataset.matchedScenes?.length || 0} scene</span>
                              </div>

                              {activeDataset.searchError ? null : (activeDataset.matchedScenes && activeDataset.matchedScenes.length > 0 ? (
                                <div className="space-y-3">
                                  {activeDataset.matchedScenes.map((scene, sceneIndex) => (
                                    <div key={`${activeDataset.datasetId}-matched-${sceneIndex}`} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                                          {scene.keyword}
                                        </span>
                                        <span className="text-xs text-zinc-500">{formatTime(scene.start)} - {formatTime(scene.end)}</span>
                                      </div>
                                      <p className="text-sm leading-relaxed text-zinc-200">{scene.description}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-zinc-800 px-4 text-center text-sm text-zinc-500">
                                  Không có scene nào khớp với từ khóa đang lưu.
                                </div>
                              ))}
                            </div>
                          )}

                          {activeDataset.searchResults && activeDataset.searchResults.length > 0 && (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-zinc-200">Các lượt tìm kiếm đã lưu</h4>
                                <button
                                  onClick={() => applyLibrarySearchSelection(activeDataset, '')}
                                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-700"
                                >
                                  Xem toàn bộ phân tích
                                </button>
                              </div>

                              <div className="space-y-3">
                                {[...activeDataset.searchResults].sort((a, b) => b.timestamp - a.timestamp).map((result) => {
                                  const isActiveResult = activeDataset.currentSearchKeywords === result.keywords;
                                  return (
                                    <div key={result.id} className={`rounded-xl border p-4 ${isActiveResult ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950'}`}>
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0">
                                          <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
                                              {result.keywords || 'Phân tích toàn bộ'}
                                            </span>
                                            <span className="text-xs text-zinc-500">
                                              {result.scenes.length} scene • {new Date(result.timestamp).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                                            </span>
                                          </div>
                                          {result.error ? (
                                            <p className="text-sm text-rose-300">{result.error}</p>
                                          ) : (
                                            <p className="text-sm text-zinc-400">
                                              {result.scenes.length > 0
                                                ? result.scenes[0]?.description || 'Đã lưu kết quả tìm kiếm.'
                                                : 'Không có scene nào khớp trong lượt tìm kiếm này.'}
                                            </p>
                                          )}
                                        </div>

                                        <button
                                          onClick={() => applyLibrarySearchSelection(activeDataset, result.keywords)}
                                          className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-200 transition-colors hover:border-zinc-700"
                                        >
                                          {isActiveResult ? 'Đang áp dụng' : 'Áp dụng'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 px-6 text-center">
                          <Film className="mb-4 h-10 w-10 text-zinc-700" />
                          <p className="text-sm font-medium text-zinc-400">Hiển thị chi tiết video, phân cảnh</p>
                          <p className="mt-2 max-w-xs text-xs text-zinc-600">Chọn một dataset ở cột bên trái để xem version và dữ liệu phân cảnh đã lưu.</p>
                        </div>
                      )}
                    </section>
              </div>
            ) : activeMenu === 'search' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Tên sản phẩm cho phiên này
                    </label>
                    <input
                      value={searchProductName}
                      onChange={(e) => setSearchProductName(e.target.value)}
                      placeholder="VD: Serum trị mụn, Khóa học tiếng Anh..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                      disabled={isAnalyzing}
                    />
                    <p className="text-xs text-zinc-500 mt-2">
                      Dùng làm tên sản phẩm mặc định cho batch analyze này. Sau đó mày vẫn có thể override từng video trong thư viện.
                    </p>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Từ khóa tìm kiếm
                    </label>
                    <textarea
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="VD: biển, hoàng hôn, lifestyle, sản phẩm trên tay..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-32"
                      disabled={isAnalyzing}
                    />
                    <p className="text-xs text-zinc-500 mt-2">
                      Có thể để trống để chỉ phân tích toàn bộ video. Nếu nhập từ khóa, hệ thống sẽ phân tích toàn bộ trước rồi tìm trong kết quả đó.
                    </p>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-medium text-zinc-300">
                        Video trong phiên ({videos.length})
                      </label>
                    </div>

                    <input
                      type="file"
                      ref={uploadInputRef}
                      onChange={handleUpload}
                      accept="video/*"
                      multiple
                      className="hidden"
                    />

                    <button
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={isUploading || isAnalyzing}
                      className="w-full flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed border-zinc-800 rounded-xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      {isUploading ? (
                        <><Loader2 className="w-6 h-6 text-zinc-500 mb-2 animate-spin" /><span className="text-sm text-zinc-400">Đang tải lên...</span></>
                      ) : (
                        <><Upload className="w-6 h-6 text-zinc-500 group-hover:text-indigo-400 mb-2 transition-colors" /><span className="text-sm text-zinc-400 group-hover:text-zinc-300">Nhấn để tải video lên</span></>
                      )}
                    </button>

                    {videos.length > 0 && (
                      <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        <AnimatePresence>
                          {videos.map((video, idx) => (
                            <motion.div
                              key={`${video.dbVideoId ?? video.fileName}-${idx}`}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg group"
                            >
                              <div className="flex items-center space-x-3 overflow-hidden min-w-0">
                                <div className="flex-shrink-0">
                                  {video.status === 'pending' ? <Film className="w-4 h-4 text-zinc-500" /> :
                                   video.status === 'analyzing' ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /> :
                                   video.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                                   <AlertCircle className="w-4 h-4 text-rose-400" />}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-sm text-zinc-300 truncate block">{video.fileName}</span>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getSourceBadgeClass(video.source)}`}>
                                      {getSourceLabel(video.source)}
                                    </span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-zinc-900 border-zinc-800 text-zinc-400">
                                      {video.resolvedProductName || searchProductName || FALLBACK_PRODUCT_NAME}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => removeVideo(idx)}
                                disabled={isAnalyzing}
                                className="p-1 text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={analyzeVideos}
                    disabled={isAnalyzing || videos.length === 0}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Đang phân tích video...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        <span>Phân tích / Tìm kiếm</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  {videos.length === 0 ? (
                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500 text-center px-6">
                      <Film className="w-12 h-12 mb-4 opacity-20" />
                      <p>Tải video lên hoặc mở một dataset từ thư viện để bắt đầu tìm phân cảnh.</p>
                      {activeDataset && (
                        <button
                          onClick={() => openDatasetInSearch(activeDataset)}
                          className="mt-4 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 transition-colors"
                        >
                          Dùng dataset đang chọn: {activeDataset.fileName}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {videos.map((video, idx) => (
                        <motion.div
                          key={`result-${video.dbVideoId ?? video.fileName}-${idx}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden"
                        >
                          <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="font-medium text-zinc-200 truncate pr-4 flex items-center">
                                {video.fileName}
                              </h3>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getSourceBadgeClass(video.source)}`}>
                                  {getSourceLabel(video.source)}
                                </span>
                              </div>
                            </div>

                            <div className="flex-shrink-0 flex items-center space-x-2 flex-wrap justify-end">
                              {video.versions && video.versions.length > 1 && (
                                <select
                                  value={video.currentVersionIndex || 0}
                                  onChange={(e) => switchVersion(idx, parseInt(e.target.value, 10))}
                                  className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
                                >
                                  {video.versions.map((v, vIdx) => (
                                    <option key={v.id} value={vIdx}>
                                      Lần {vIdx + 1} - {v.keywords ? `"${v.keywords.length > 15 ? v.keywords.slice(0, 15) + '...' : v.keywords}"` : ''} ({new Date(v.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
                                    </option>
                                  ))}
                                </select>
                              )}

                              <button
                                onClick={() => analyzeSingleVideo(idx)}
                                disabled={video.status === 'analyzing'}
                                className="inline-flex items-center text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                                title="Phân tích lại video này"
                              >
                                <RefreshCw className="w-3 h-3 mr-1.5" />
                                Phân tích lại
                              </button>

                              {video.status === 'success' && (video.currentSearchKeywords || (video.searchResults && video.searchResults.length > 0)) && (
                                <div className="inline-flex items-center bg-zinc-950 border border-zinc-800 rounded-full p-0.5">
                                  <button
                                    onClick={() => setVideoViewMode(idx, 'matched')}
                                    disabled={!video.currentSearchKeywords}
                                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${video.viewMode === 'matched' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'} disabled:opacity-40`}
                                  >
                                    Kết quả tìm kiếm
                                  </button>
                                  <button
                                    onClick={() => setVideoViewMode(idx, 'full')}
                                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${video.viewMode === 'full' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                                  >
                                    Toàn bộ phân tích
                                  </button>
                                </div>
                              )}

                              {video.status === 'success' && video.scenes.length > 0 && (
                                <button
                                  onClick={() => exportSRT(video)}
                                  className="inline-flex items-center text-xs text-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/20 px-3 py-1.5 rounded-full transition-colors"
                                  title="Xuất SRT cho CapCut"
                                >
                                  <FileText className="w-3 h-3 mr-1.5" />
                                  Xuất SRT
                                </button>
                              )}
                              {video.status === 'analyzing' && (
                                <span className="inline-flex items-center text-xs text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded-full">
                                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                                  Đang phân tích
                                </span>
                              )}
                              {video.status === 'success' && (
                                <span className="inline-flex items-center text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                                  {video.scenes.length} {video.viewMode === 'matched' ? 'kết quả' : 'phân cảnh'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
                            <div className="p-4 bg-black/20 flex flex-col justify-center">
                              <video
                                id={`video-player-${idx}`}
                                ref={(node) => {
                                  playerRefs.current[idx] = node;
                                }}
                                src={`/api/videos/${encodeURIComponent(video.fileName)}/stream`}
                                preload="metadata"
                                onLoadedMetadata={() => handlePlayerLoadedMetadata(idx)}
                                onTimeUpdate={() => handlePlayerTimeUpdate(idx)}
                                controls
                                className="w-full max-h-[60vh] rounded-lg bg-black object-contain"
                              />
                            </div>

                            <div className="p-4 h-full max-h-[60vh] overflow-y-auto custom-scrollbar">
                              {video.status === 'pending' && (
                                <div className="h-full flex items-center justify-center text-sm text-zinc-500">
                                  Đang chờ phân tích...
                                </div>
                              )}

                              {video.status === 'analyzing' && (
                                <div className="h-full flex flex-col items-center justify-center text-sm text-zinc-500 space-y-3">
                                  <Loader2 className="w-6 h-6 text-indigo-500/50 animate-spin" />
                                  <p>Đang quét video...</p>
                                </div>
                              )}

                              {video.status === 'error' && (
                                <div className="h-full flex flex-col items-center justify-center text-sm text-rose-400/80 text-center p-4">
                                  <AlertCircle className="w-6 h-6 mb-2 opacity-50" />
                                  <p>{video.error}</p>
                                </div>
                              )}

                              {video.status === 'success' && (
                                <div className="space-y-3">
                                  {video.viewMode === 'matched' && video.currentSearchKeywords && (
                                    <div className="px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                                      Từ khóa hiện tại: <span className="font-medium">{video.currentSearchKeywords}</span>
                                    </div>
                                  )}

                                  {video.viewMode === 'matched' && video.searchError && (
                                    <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
                                      {video.searchError}
                                    </div>
                                  )}

                                  {video.scenes.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-sm text-zinc-500 min-h-[120px] text-center">
                                      {video.viewMode === 'matched'
                                        ? (video.searchError
                                          ? 'Không thể tìm theo từ khóa hiện tại. Bạn vẫn có thể xem toàn bộ phân tích.'
                                          : 'Không tìm thấy phân cảnh nào khớp với từ khóa hiện tại.')
                                        : 'Chưa có phân cảnh nào trong kết quả phân tích.'}
                                    </div>
                                  ) : (
                                    video.scenes.map((scene, sIdx) => {
                                      const isTrimming = trimmingScene === `${video.fileName}-${sIdx}`;
                                      return (
                                        <div
                                          key={sIdx}
                                          onClick={() => playScene(idx, scene)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              playScene(idx, scene);
                                            }
                                          }}
                                          role="button"
                                          tabIndex={0}
                                          className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-indigo-500/30 transition-colors group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                                        >
                                          <div className="flex items-start justify-between mb-2">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                              {scene.keyword}
                                            </span>
                                            <div className="flex items-center space-x-2">
                                              <button
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  playScene(idx, scene);
                                                }}
                                                className="flex items-center text-xs text-zinc-400 hover:text-indigo-400 transition-colors"
                                                title="Phát từ đây"
                                              >
                                                <Play className="w-3 h-3 mr-1" />
                                                {formatTime(scene.start)} - {formatTime(scene.end)}
                                              </button>
                                            </div>
                                          </div>
                                          <p className="text-sm text-zinc-300 leading-relaxed mb-3">
                                            {scene.description}
                                          </p>

                                          <div className="flex items-center justify-end pt-2 border-t border-zinc-800/50">
                                            <button
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                trimAndDownload(video, scene, sIdx);
                                              }}
                                              disabled={isTrimming}
                                              className="flex items-center text-xs px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {isTrimming ? (
                                                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                              ) : (
                                                <Scissors className="w-3 h-3 mr-1.5" />
                                              )}
                                              {isTrimming ? (trimStatus || 'Đang cắt...') : 'Cắt & Tải xuống'}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Tên sản phẩm</label>
                      <input
                        value={storyboardProductName}
                        onChange={(e) => setStoryboardProductName(e.target.value)}
                        placeholder="VD: Serum trị mụn, App tài chính..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                        disabled={isGeneratingStoryboard}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Ngành hàng</label>
                        <input
                          value={storyboardCategory}
                          onChange={(e) => setStoryboardCategory(e.target.value)}
                          placeholder="VD: Mỹ phẩm, SaaS, giáo dục"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                          disabled={isGeneratingStoryboard}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Tone</label>
                        <input
                          value={storyboardTone}
                          onChange={(e) => setStoryboardTone(e.target.value)}
                          placeholder="VD: Chuyên nghiệp, đáng tin, gấp gáp"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                          disabled={isGeneratingStoryboard}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Đối tượng khách hàng</label>
                      <input
                        value={storyboardAudience}
                        onChange={(e) => setStoryboardAudience(e.target.value)}
                        placeholder="VD: Người mới đi làm, mẹ bỉm, chủ shop online"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                        disabled={isGeneratingStoryboard}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Lợi ích chính</label>
                      <textarea
                        value={storyboardBenefits}
                        onChange={(e) => setStoryboardBenefits(e.target.value)}
                        placeholder="VD: Giảm mụn nhanh, tiết kiệm thời gian, tăng chuyển đổi..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-24"
                        disabled={isGeneratingStoryboard}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Kịch bản</label>
                      <textarea
                        value={storyboardScript}
                        onChange={(e) => setStoryboardScript(e.target.value)}
                        placeholder="Dán toàn bộ script cần dựng video cho sản phẩm này..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-40"
                        disabled={isGeneratingStoryboard}
                      />
                      <p className="text-xs text-zinc-500 mt-2">
                        Hệ thống sẽ tách script thành từng beat rồi gợi ý footage sản phẩm hoặc footage minh họa phù hợp cho từng đoạn.
                      </p>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300">Nguồn footage đã phân tích</label>
                        <p className="text-xs text-zinc-500 mt-1">Dùng version đang chọn của từng dataset trong thư viện dữ liệu hoặc phiên tìm phân cảnh.</p>
                      </div>
                      <button
                        onClick={() => setStoryboardSelectedVersionIds(storyboardSources.map(source => source.versionId))}
                        disabled={storyboardSources.length === 0 || isGeneratingStoryboard}
                        className="text-xs px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:border-zinc-700 disabled:opacity-50"
                      >
                        Chọn tất cả
                      </button>
                    </div>

                    {activeDataset && !activeDatasetUsableForStoryboard && (
                      <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200">
                        Dataset đang chọn chưa có version usable cho storyboard. Mày vẫn có thể chọn dataset khác bên dưới.
                      </div>
                    )}

                    {storyboardSources.length === 0 ? (
                      <p className="text-sm text-zinc-500">Chưa có dataset nào có scene hợp lệ để tạo storyboard.</p>
                    ) : (
                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2 custom-scrollbar">
                        {storyboardSources.map(source => (
                          <label key={source.versionId} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-indigo-500/30 transition-colors">
                            <input
                              type="checkbox"
                              checked={storyboardSelectedVersionIds.includes(source.versionId)}
                              onChange={(e) => {
                                setStoryboardSelectedVersionIds(prev => e.target.checked
                                  ? [...prev, source.versionId]
                                  : prev.filter(id => id !== source.versionId));
                              }}
                              className="mt-1 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500"
                              disabled={isGeneratingStoryboard}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <p className="text-sm text-zinc-200 truncate">{source.fileName}</p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getSourceBadgeClass(source.source)}`}>
                                  {getSourceLabel(source.source)}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500">{source.sceneCount} scene • {new Date(source.timestamp).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {storyboardError && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3"
                    >
                      <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-rose-300">{storyboardError}</p>
                    </motion.div>
                  )}

                  <button
                    onClick={generateStoryboard}
                    disabled={isGeneratingStoryboard || storyboardSources.length === 0 || storyboardSelectedVersionIds.length === 0}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                  >
                    {isGeneratingStoryboard ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Đang tạo storyboard...</span>
                      </>
                    ) : (
                      <>
                        <Film className="w-5 h-5" />
                        <span>Tạo storyboard</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  {storyboardResult ? (
                    <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-6">
                      <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 space-y-3 h-fit">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-zinc-200">Storyboard</h3>
                          <span className="text-xs text-zinc-500">{storyboardResult.beats.length} beat</span>
                        </div>
                        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                          {storyboardResult.beats.map((beat, index) => {
                            const matchCount = storyboardResult.beatMatches.find(group => group.beatId === beat.id)?.matches.length || 0;
                            const isActive = selectedStoryboardBeatId === beat.id;
                            return (
                              <button
                                key={beat.id}
                                onClick={() => setSelectedStoryboardBeatId(beat.id)}
                                className={`w-full text-left p-4 rounded-xl border transition-colors ${isActive ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
                              >
                                <div className="flex items-center justify-between mb-2 gap-3">
                                  <span className="text-xs font-medium uppercase tracking-wide text-indigo-300">Beat {index + 1}</span>
                                  <span className="text-xs text-zinc-500">{matchCount} scene</span>
                                </div>
                                <p className="text-sm font-medium text-zinc-100 line-clamp-2">{beat.label}</p>
                                <p className="text-sm text-zinc-400 mt-2 line-clamp-3">{beat.text}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-6">
                        {selectedStoryboardBeat ? (
                          <>
                            <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
                              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{selectedStoryboardBeat.label}</span>
                                  {selectedStoryboardBeat.durationHint && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">~{selectedStoryboardBeat.durationHint}s</span>
                                  )}
                                </div>
                                <p className="text-zinc-100 leading-relaxed">{selectedStoryboardBeat.text}</p>
                                {(selectedStoryboardBeat.intent || selectedStoryboardBeat.desiredVisuals) && (
                                  <div className="mt-3 space-y-2 text-sm text-zinc-400">
                                    {selectedStoryboardBeat.intent && <p><span className="text-zinc-500">Ý đồ:</span> {selectedStoryboardBeat.intent}</p>}
                                    {selectedStoryboardBeat.desiredVisuals && <p><span className="text-zinc-500">Visual mong muốn:</span> {selectedStoryboardBeat.desiredVisuals}</p>}
                                  </div>
                                )}
                              </div>

                              <div className="p-4 bg-black/20">
                                {storyboardPreviewMatch ? (
                                  <div className="space-y-3">
                                    <video
                                      ref={storyboardPlayerRef}
                                      src={`/api/videos/${encodeURIComponent(storyboardPreviewMatch.fileName)}/stream`}
                                      preload="metadata"
                                      onLoadedMetadata={handleStoryboardLoadedMetadata}
                                      onTimeUpdate={handleStoryboardTimeUpdate}
                                      controls
                                      className="w-full max-h-[50vh] rounded-xl bg-black object-contain"
                                    />
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                                      <span className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">{storyboardPreviewMatch.fileName}</span>
                                      <span className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">{formatTime(storyboardPreviewMatch.scene.start)} - {formatTime(storyboardPreviewMatch.scene.end)}</span>
                                      <span className={`px-2.5 py-1 rounded-full border ${storyboardPreviewMatch.usageType === 'direct_product' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'}`}>{storyboardPreviewMatch.usageType === 'direct_product' ? 'Footage sản phẩm' : 'Footage minh họa'}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-[240px] flex items-center justify-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                                    Chọn một footage bên dưới để xem trước.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-sm font-medium text-zinc-200">Footage đề xuất</h3>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                  <span>Script model: {storyboardResult.models.script_planning_model}</span>
                                  <span>Match model: {storyboardResult.models.scene_matching_model}</span>
                                </div>
                              </div>

                              {selectedStoryboardBeatMatches.length === 0 ? (
                                <div className="min-h-[160px] flex items-center justify-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                                  Chưa tìm thấy footage phù hợp cho beat này.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {selectedStoryboardBeatMatches.map((match, index) => {
                                    const isPreviewing = storyboardPreviewMatch?.id === match.id;
                                    const trimKey = `${match.fileName}-${match.sceneIndex}`;
                                    const isTrimming = trimmingScene === trimKey;
                                    return (
                                      <div
                                        key={match.id}
                                        onClick={() => playStoryboardMatch(match)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            playStoryboardMatch(match);
                                          }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        className={`p-4 rounded-xl border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${isPreviewing ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                          <div className="space-y-2 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300">#{index + 1}</span>
                                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300">{match.fileName}</span>
                                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${match.usageType === 'direct_product' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'}`}>{match.usageType === 'direct_product' ? 'Footage sản phẩm' : 'Footage minh họa'}</span>
                                            </div>
                                            <p className="text-sm text-zinc-100 leading-relaxed">{match.scene.description}</p>
                                          </div>
                                          <div className="text-right text-sm text-zinc-400 flex-shrink-0">
                                            <p className="text-emerald-300 font-medium">{Math.round(match.score * 100)}%</p>
                                            <p>{formatTime(match.scene.start)} - {formatTime(match.scene.end)}</p>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-zinc-400 mb-3">
                                          <p><span className="text-zinc-500">Lý do:</span> {match.matchReason}</p>
                                          {match.scene.relevance_notes && <p><span className="text-zinc-500">Ghi chú:</span> {match.scene.relevance_notes}</p>}
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/60">
                                          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                            {match.scene.context && <span className="px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800">{match.scene.context}</span>}
                                            {match.scene.mood && <span className="px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800">{match.scene.mood}</span>}
                                            {match.scene.shot_type && <span className="px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800">{match.scene.shot_type}</span>}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                playStoryboardMatch(match);
                                              }}
                                              className="flex items-center text-xs px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors"
                                            >
                                              <Play className="w-3 h-3 mr-1.5" />
                                              Xem đoạn này
                                            </button>
                                            <button
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                trimAndDownload({ fileName: match.fileName }, match.scene, match.sceneIndex);
                                              }}
                                              disabled={isTrimming}
                                              className="flex items-center text-xs px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {isTrimming ? (
                                                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                              ) : (
                                                <Scissors className="w-3 h-3 mr-1.5" />
                                              )}
                                              {isTrimming ? (trimStatus || 'Đang cắt...') : 'Cắt & Tải xuống'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500">
                            <Film className="w-12 h-12 mb-4 opacity-20" />
                            <p>Storyboard đã tạo xong nhưng chưa có beat nào để hiển thị.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500 text-center px-6">
                      <Film className="w-12 h-12 mb-4 opacity-20" />
                      <p className="max-w-xl">Chọn dataset phù hợp, nhập kịch bản sản phẩm và bấm <span className="text-zinc-300">Tạo storyboard</span> để nhận các beat cùng footage minh họa phù hợp.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
