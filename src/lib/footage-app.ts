export interface Scene {
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

export type ViewMode = 'matched' | 'full';
export type AppMenu = 'library' | 'search' | 'storyboard';
export type DatasetSource = 'extension' | 'web';
export type DatasetSourceFilter = 'all' | DatasetSource;

export const LIBRARY_PLAYER_SLOT = -1;
export const FALLBACK_PRODUCT_NAME = 'Chưa gán sản phẩm';

export interface VideoVersion {
  id: string;
  timestamp: number;
  scenes: Scene[];
  keywords: string;
}

export interface SearchResult {
  id: string;
  versionId: string;
  keywords: string;
  timestamp: number;
  scenes: Scene[];
  error?: string | null;
}

export interface ProductFolderSummary {
  id: number;
  name: string;
  isSystem: boolean;
  videoCount?: number;
}

export interface ProductFolderListResponse {
  folders: ProductFolderSummary[];
}

export interface ProductFolderMutationPayload {
  name: string;
}

export interface UpdateVideoFilePayload {
  filename?: string;
  folder_id?: number;
}

export interface DatasetSelectionPayload {
  dbVideoId: number;
  current_version_index: number;
  current_search_keywords: string;
}

export interface LibraryMutationResult {
  histories: HistoryItem[];
  folders: ProductFolderSummary[];
}

export interface VideoResult {
  dbVideoId?: number;
  videoFileId?: number | null;
  fileName: string;
  source: DatasetSource;
  productNameOverride?: string;
  resolvedProductName?: string;
  folder?: ProductFolderSummary | null;
  primaryFolder?: ProductFolderSummary | null;
  linkedFolders?: ProductFolderSummary[];
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

export interface HistoryItem {
  id: string;
  date: number;
  keywords: string;
  productName?: string;
  videos: VideoResult[];
}

export interface DatasetItem extends VideoResult {
  dbVideoId: number;
  datasetId: `${number}`;
  historyId: string;
  updatedAt: number;
  historyKeywords: string;
  productName: string;
}

export interface StoryboardBeat {
  id: string;
  label: string;
  text: string;
  intent: string;
  desiredVisuals: string;
  durationHint: number | null;
  position: number;
}

export interface StoryboardMatch {
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

export interface StoryboardBeatMatches {
  beatId: string;
  matches: StoryboardMatch[];
}

export interface StoryboardResult {
  beats: StoryboardBeat[];
  beatMatches: StoryboardBeatMatches[];
  models: {
    video_analysis_model: string;
    script_planning_model: string;
    scene_matching_model: string;
  };
}

export interface StoryboardSource {
  datasetId: string;
  fileName: string;
  productName: string;
  versionId: string;
  sceneCount: number;
  timestamp: number;
  source: DatasetSource;
}

const parseDatasetSelectionId = (datasetId: string) => {
  const trimmed = datasetId.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Dataset ID khong hop le cho /api/datasets/selection');
  }

  return Number(trimmed);
};

const readErrorDetail = async (res: Response) => {
  const payload = await res.json().catch(() => null);
  return payload?.detail || `Server lỗi: ${res.status}`;
};

export const api = {
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
      throw new Error(await readErrorDetail(res));
    }
  },

  async updateHistoryProductName(historyId: string, productName: string): Promise<HistoryItem> {
    const res = await fetch(`/api/history/${historyId}/product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_name: productName }),
    });
    if (!res.ok) {
      throw new Error(await readErrorDetail(res));
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
      throw new Error(await readErrorDetail(res));
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
      throw new Error(await readErrorDetail(res));
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
      throw new Error(await readErrorDetail(res));
    }

    return res.json();
  },

  async productFolders(): Promise<ProductFolderSummary[]> {
    const res = await fetch('/api/product-folders');
    if (!res.ok) {
      throw new Error(await readErrorDetail(res));
    }
    const payload: ProductFolderListResponse = await res.json();
    return payload.folders;
  },

  async createProductFolder(payload: ProductFolderMutationPayload): Promise<LibraryMutationResult> {
    const res = await fetch('/api/product-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await readErrorDetail(res));
    }
    return res.json();
  },

  async updateProductFolder(folderId: number, payload: ProductFolderMutationPayload): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/product-folders/${folderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await readErrorDetail(res));
    }
    return res.json();
  },

  async deleteProductFolder(folderId: number): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/product-folders/${folderId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(await readErrorDetail(res));
    }
    return res.json();
  },

  async updateVideoFile(videoFileId: number, payload: UpdateVideoFilePayload): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/video-files/${videoFileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await readErrorDetail(res));
    }
    return res.json();
  },

  async updateVideoSelection(datasetId: string, currentVersionIndex: number, currentSearchKeywords: string): Promise<HistoryItem> {
    const requestPayload: DatasetSelectionPayload = {
      dbVideoId: parseDatasetSelectionId(datasetId),
      current_version_index: currentVersionIndex,
      current_search_keywords: currentSearchKeywords,
    };
    const res = await fetch('/api/datasets/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    if (!res.ok) {
      throw new Error(await readErrorDetail(res));
    }

    const payload = await res.json();
    return payload.history;
  },
};

export const getSourceLabel = (source: DatasetSource) => source === 'extension' ? 'Extension' : 'Web';

export const getSourceBadgeClass = (source: DatasetSource) => source === 'extension'
  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  : 'border-sky-500/20 bg-sky-500/10 text-sky-300';

export const normalizeVideo = (video: VideoResult): VideoResult => {
  const versions = video.versions || [];
  const currentVersionIndex = versions.length > 0
    ? Math.min(Math.max(video.currentVersionIndex ?? versions.length - 1, 0), versions.length - 1)
    : 0;
  const currentVersion = versions[currentVersionIndex];
  const fullScenes = currentVersion?.scenes || video.scenes || [];
  const currentSearchKeywords = video.currentSearchKeywords || '';
  const searchResults = video.searchResults || [];
  const activeSearch = currentVersion && currentSearchKeywords
    ? searchResults.find((result) => result.versionId === currentVersion.id && result.keywords === currentSearchKeywords)
    : undefined;
  const matchedScenes = activeSearch?.scenes || [];
  const searchError = activeSearch?.error || null;
  const defaultViewMode: ViewMode = currentSearchKeywords ? 'matched' : 'full';
  const viewMode = video.viewMode === 'matched' && !currentSearchKeywords
    ? 'full'
    : (video.viewMode || defaultViewMode);
  const resolvedViewMode = viewMode === 'matched' && !activeSearch
    ? 'full'
    : viewMode;

  return {
    ...video,
    source: video.source || 'web',
    videoFileId: video.videoFileId ?? null,
    productNameOverride: video.productNameOverride || '',
    resolvedProductName: video.resolvedProductName || FALLBACK_PRODUCT_NAME,
    folder: video.folder || video.primaryFolder || null,
    scenes: resolvedViewMode === 'matched' ? matchedScenes : fullScenes,
    versions,
    currentVersionIndex,
    searchResults,
    currentSearchKeywords,
    matchedScenes,
    searchError,
    viewMode: resolvedViewMode,
  };
};

export const normalizeHistoryItem = (item: HistoryItem): HistoryItem => ({
  ...item,
  videos: item.videos.map(normalizeVideo),
});

export const normalizeHistory = (items: HistoryItem[]) => items.map(normalizeHistoryItem);

export const buildDatasetItems = (items: HistoryItem[]): DatasetItem[] => items.flatMap((item) =>
  item.videos.flatMap((video) => {
    const normalizedVideo = normalizeVideo(video);
    if (normalizedVideo.dbVideoId == null) {
      return [];
    }

    return {
      ...normalizedVideo,
      dbVideoId: normalizedVideo.dbVideoId,
      datasetId: String(normalizedVideo.dbVideoId) as `${number}`,
      historyId: item.id,
      updatedAt: item.date,
      historyKeywords: item.keywords,
      productName: normalizedVideo.folder?.name
        || item.productName
        || normalizedVideo.resolvedProductName
        || FALLBACK_PRODUCT_NAME,
    } satisfies DatasetItem;
  }),
);

export async function readSSEStream(
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
      } catch {
        // Ignore malformed stream events.
      }
    }

    if (done) break;
  }
}

export const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
