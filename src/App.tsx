import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Film, Play, AlertCircle, Loader2, X, CheckCircle2, FileText, History, Plus, Scissors, Trash2, RefreshCw, Upload } from 'lucide-react';

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
type AppMode = 'search' | 'storyboard';

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
  fileName: string;
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
  videos: VideoResult[];
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

  async updateVideoSelection(historyId: string, filename: string, currentVersionIndex: number, currentSearchKeywords: string): Promise<void> {
    await fetch('/api/history/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history_id: historyId,
        filename,
        current_version_index: currentVersionIndex,
        current_search_keywords: currentSearchKeywords,
      }),
    });
  },
};

const getSidebarKeywordsLabel = (keywords: string) => keywords.trim() || 'Phân tích toàn bộ';

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
  const [appMode, setAppMode] = useState<AppMode>('search');
  const [keywords, setKeywords] = useState('');
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [trimmingScene, setTrimmingScene] = useState<string | null>(null);
  const [trimStatus, setTrimStatus] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
  }, []);

  const getServerVideo = useCallback((savedHistory: HistoryItem | null, filename: string): VideoResult | null => {
    const serverVideo = savedHistory?.videos?.find(v => v.fileName === filename);
    return serverVideo ? normalizeVideo({ ...serverVideo, status: 'success' }) : null;
  }, []);

  const updateVideoSelection = useCallback((filename: string, currentVersionIndex: number, currentSearchKeywords: string) => {
    if (!currentSearchId) return;
    api.updateVideoSelection(currentSearchId, filename, currentVersionIndex, currentSearchKeywords)
      .then(refreshHistory)
      .catch(() => {});
  }, [currentSearchId, refreshHistory]);

  const resetStoryboardState = useCallback(() => {
    setStoryboardResult(null);
    setSelectedStoryboardBeatId(null);
    setStoryboardError(null);
    setStoryboardPreviewMatch(null);
    storyboardPlaybackRef.current = null;
    storyboardPendingMatchRef.current = null;
  }, []);

  const storyboardSources = videos.flatMap(video => {
    const version = video.versions?.[video.currentVersionIndex || 0];
    if (!version) return [];
    return [{
      fileName: video.fileName,
      versionId: version.id,
      sceneCount: version.scenes.length,
      timestamp: version.timestamp,
    }];
  });

  const selectedStoryboardBeat = storyboardResult?.beats.find(beat => beat.id === selectedStoryboardBeatId) || null;
  const selectedStoryboardBeatMatches = storyboardResult?.beatMatches.find(match => match.beatId === selectedStoryboardBeatId)?.matches || [];

  useEffect(() => {
    setStoryboardSelectedVersionIds(prev => {
      const availableIds = storyboardSources.map(source => source.versionId);
      if (availableIds.length === 0) return [];
      const filtered = prev.filter(id => availableIds.includes(id));
      return filtered.length > 0 ? filtered : availableIds;
    });
  }, [videos]);

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
      body: JSON.stringify({ filename, keywords: searchKeywords, history_id: historyId }),
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
    updateVideoSelection(video.fileName, nextVideo.currentVersionIndex || 0, '');
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
          const serverVideo = getServerVideo(savedHistory, filename);
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
          const serverVideo = getServerVideo(savedHistory, filename);
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
    refreshHistory();
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

      setVideos(prev => {
        const next = [...prev];
        if (savedHistory) {
          const serverVideo = getServerVideo(savedHistory, video.fileName);
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
      refreshHistory();
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
        updateVideoSelection(video.fileName, versionIndex, nextVideo.currentSearchKeywords || '');
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

  // --- History ---

  const startNewSearch = () => {
    setKeywords('');
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

  const loadHistoryItem = (item: HistoryItem) => {
    setKeywords(item.keywords);
    setVideos(item.videos.map(v => normalizeVideo({ ...v })));
    setCurrentSearchId(item.id);
    setGlobalError(null);
    resetStoryboardState();
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    api.deleteHistory(id);
    if (currentSearchId === id) startNewSearch();
  };

  // --- Helpers ---

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30 flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">

      {/* Sidebar History */}
      <motion.div
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="h-full bg-zinc-900/50 border-r border-zinc-800 flex-shrink-0 overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-zinc-100">
            <History className="w-5 h-5" />
            <span className="font-medium">Lịch sử</span>
          </div>
          <button
            onClick={startNewSearch}
            className="p-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-md transition-colors"
            title="Tìm kiếm mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center mt-10">Chưa có lịch sử</p>
          ) : (
            history.map(item => (
              <div
                key={item.id}
                className={`w-full text-left p-3 rounded-xl border transition-all relative group ${
                  currentSearchId === item.id
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                    : 'bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-400'
                }`}
              >
                <button onClick={() => loadHistoryItem(item)} className="w-full text-left pr-6">
                  <p className="font-medium truncate mb-1 text-sm">{getSidebarKeywordsLabel(item.keywords)}</p>
                  <div className="flex items-center justify-between text-xs opacity-70">
                    <span>{item.videos.length} video</span>
                    <span>{new Date(item.date).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </button>
                <button
                  onClick={(e) => deleteHistoryItem(e, item.id)}
                  className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Xóa lịch sử"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-[1600px] w-full mx-auto px-4 py-8">

          {/* Header */}
          <header className="mb-10 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <History className="w-5 h-5 text-zinc-400" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-100 flex items-center">
                  <Film className="w-8 h-8 text-indigo-400 mr-3" />
                  Footage Finder
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  Tìm kiếm phân cảnh bằng AI & Xuất sang CapCut
                </p>
              </div>
            </div>
            {(currentSearchId || videos.length > 0) && (
              <button
                onClick={startNewSearch}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Phân tích mới</span>
              </button>
            )}
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left Column: Controls */}
            <div className="lg:col-span-1 space-y-6">

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-2 backdrop-blur-sm flex gap-2">
                <button
                  onClick={() => setAppMode('search')}
                  className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${appMode === 'search' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                >
                  Theo từ khóa
                </button>
                <button
                  onClick={() => setAppMode('storyboard')}
                  className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${appMode === 'storyboard' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                >
                  Theo kịch bản sản phẩm
                </button>
              </div>

              {appMode === 'search' ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Từ khóa tìm kiếm
                  </label>
                  <textarea
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="VD: 海滩, hoàng hôn, phong cảnh..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-32"
                    disabled={isAnalyzing}
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    Có thể để trống để chỉ phân tích toàn bộ video. Nếu nhập từ khóa, hệ thống sẽ phân tích toàn bộ trước rồi tìm trong kết quả đó.
                  </p>
                </div>
              ) : (
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
              )}

              {/* Video Upload */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-zinc-300">
                    Video ({videos.length})
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

                {/* Video list */}
                {videos.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    <AnimatePresence>
                      {videos.map((video, idx) => (
                        <motion.div
                          key={`${video.fileName}-${idx}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg group"
                        >
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="flex-shrink-0">
                              {video.status === 'pending' ? <Film className="w-4 h-4 text-zinc-500" /> :
                               video.status === 'analyzing' ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /> :
                               video.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                               <AlertCircle className="w-4 h-4 text-rose-400" />}
                            </div>
                            <span className="text-sm text-zinc-300 truncate">{video.fileName}</span>
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

              {appMode === 'storyboard' && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300">Nguồn footage đã phân tích</label>
                      <p className="text-xs text-zinc-500 mt-1">Chỉ dùng version hiện tại của mỗi video. Có thể đổi version ở tab kết quả rồi quay lại đây.</p>
                    </div>
                    <button
                      onClick={() => setStoryboardSelectedVersionIds(storyboardSources.map(source => source.versionId))}
                      disabled={storyboardSources.length === 0 || isGeneratingStoryboard}
                      className="text-xs px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:border-zinc-700 disabled:opacity-50"
                    >
                      Chọn tất cả
                    </button>
                  </div>

                  {storyboardSources.length === 0 ? (
                    <p className="text-sm text-zinc-500">Chưa có video nào đã phân tích. Hãy phân tích video trước rồi mới tạo storyboard.</p>
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
                            <p className="text-sm text-zinc-200 truncate">{source.fileName}</p>
                            <p className="text-xs text-zinc-500 mt-1">{source.sceneCount} scene • {new Date(source.timestamp).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {globalError && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3"
                >
                  <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-300">{globalError}</p>
                </motion.div>
              )}

              {appMode === 'storyboard' && storyboardError && (
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
                onClick={appMode === 'search' ? analyzeVideos : generateStoryboard}
                disabled={appMode === 'search' ? (isAnalyzing || videos.length === 0) : (isGeneratingStoryboard || storyboardSources.length === 0 || storyboardSelectedVersionIds.length === 0)}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
              >
                {appMode === 'search' ? (isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang phân tích Video...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Phân tích / Tìm kiếm</span>
                  </>
                )) : (isGeneratingStoryboard ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang tạo storyboard...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-5 h-5" />
                    <span>Tạo storyboard</span>
                  </>
                ))}
              </button>
            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-2 space-y-6">
              {appMode === 'search' ? (
                videos.length === 0 ? (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500">
                    <Film className="w-12 h-12 mb-4 opacity-20" />
                    <p>Tải video lên để bắt đầu. Từ khóa là tùy chọn.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {videos.map((video, idx) => (
                      <motion.div
                        key={`result-${video.fileName}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden"
                      >
                        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                          <h3 className="font-medium text-zinc-200 truncate pr-4 flex items-center">
                            {video.fileName}
                          </h3>
                          <div className="flex-shrink-0 flex items-center space-x-2">
                            {video.versions && video.versions.length > 1 && (
                              <select
                                value={video.currentVersionIndex || 0}
                                onChange={(e) => switchVersion(idx, parseInt(e.target.value))}
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
                )
              ) : storyboardResult ? (
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
                  <p className="max-w-xl">Dán kịch bản sản phẩm, chọn các video đã phân tích và bấm <span className="text-zinc-300">Tạo storyboard</span> để nhận các beat cùng footage minh họa phù hợp.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      </div>
    </div>
  );
}
