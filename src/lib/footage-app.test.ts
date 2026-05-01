import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, buildDatasetItems, FALLBACK_PRODUCT_NAME, normalizeVideo, type HistoryItem } from './footage-app';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildDatasetItems', () => {
  it('maps videoFileId and single folder metadata onto dataset items', () => {
    const history: HistoryItem[] = [
      {
        id: 'history-1',
        date: 1710000000000,
        keywords: 'duong am',
        productName: 'Ten cu',
        videos: [
          {
            dbVideoId: 42,
            videoFileId: 7,
            fileName: 'demo.mp4',
            source: 'web',
            resolvedProductName: 'Ten cu',
            folder: {
              id: 2,
              name: 'BST mua he',
              isSystem: false,
            },
            scenes: [],
            status: 'success',
          },
        ],
      },
    ];

    const [dataset] = buildDatasetItems(history);

    expect(dataset.datasetId).toBe('42');
    expect(dataset.videoFileId).toBe(7);
    expect(dataset.folder).toEqual({
      id: 2,
      name: 'BST mua he',
      isSystem: false,
    });
    expect(dataset.productName).toBe('BST mua he');
  });

  it('falls back to primaryFolder while old payloads are still being migrated', () => {
    const history: HistoryItem[] = [
      {
        id: 'history-migrate',
        date: 1710000000500,
        keywords: '',
        videos: [
          {
            dbVideoId: 77,
            fileName: 'legacy-folder.mp4',
            source: 'web',
            primaryFolder: {
              id: 3,
              name: 'Legacy Folder',
              isSystem: false,
            },
            scenes: [],
            status: 'success',
          },
        ],
      },
    ];

    const [dataset] = buildDatasetItems(history);

    expect(dataset.folder).toEqual({
      id: 3,
      name: 'Legacy Folder',
      isSystem: false,
    });
    expect(dataset.productName).toBe('Legacy Folder');
  });

  it('keeps old payloads safe when folder metadata is missing', () => {
    const history: HistoryItem[] = [
      {
        id: 'history-legacy',
        date: 1710000001000,
        keywords: '',
        videos: [
          {
            fileName: 'legacy.mp4',
            source: 'web',
            scenes: [],
            status: 'success',
          },
        ],
      },
    ];

    const datasets = buildDatasetItems(history);

    expect(datasets).toEqual([]);
    expect(history[0].videos[0].fileName).toBe('legacy.mp4');
    expect(FALLBACK_PRODUCT_NAME).toBe('Chưa gán sản phẩm');
  });

  it('uses history productName before the final fallback when folder metadata is missing', () => {
    const history: HistoryItem[] = [
      {
        id: 'history-2',
        date: 1710000002000,
        keywords: 'kem',
        productName: 'Kem chong nang',
        videos: [
          {
            dbVideoId: 88,
            fileName: 'older.mp4',
            source: 'web',
            scenes: [],
            status: 'success',
          },
        ],
      },
    ];

    const [dataset] = buildDatasetItems(history);

    expect(dataset.datasetId).toBe('88');
    expect(dataset.productName).toBe('Kem chong nang');
  });
});

describe('normalizeVideo', () => {
  it('falls back to full scenes when current search keywords have no cached match', () => {
    const normalized = normalizeVideo({
      dbVideoId: 42,
      fileName: 'demo.mp4',
      source: 'web',
      scenes: [{ keyword: 'full', start: 0, end: 1, description: 'full scene' }],
      status: 'success',
      versions: [
        {
          id: 'version-1',
          timestamp: 1,
          keywords: 'all',
          scenes: [{ keyword: 'version', start: 2, end: 3, description: 'version scene' }],
        },
      ],
      currentVersionIndex: 0,
      currentSearchKeywords: 'duong am',
      searchResults: [
        {
          id: 'search-1',
          versionId: 'version-1',
          keywords: 'khac',
          timestamp: 2,
          scenes: [{ keyword: 'match', start: 4, end: 5, description: 'matched scene' }],
        },
      ],
    });

    expect(normalized.viewMode).toBe('full');
    expect(normalized.matchedScenes).toEqual([]);
    expect(normalized.scenes).toEqual([
      { keyword: 'version', start: 2, end: 3, description: 'version scene' },
    ]);
  });
});

describe('api.updateVideoSelection', () => {
  it('posts dataset selection with numeric dbVideoId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        history: {
          id: 'history-1',
          date: 1710000000000,
          keywords: 'duong am',
          videos: [],
        },
      }),
    } as Response);

    await api.updateVideoSelection('42', 1, 'duong am');

    expect(fetchMock).toHaveBeenCalledWith('/api/datasets/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dbVideoId: 42,
        current_version_index: 1,
        current_search_keywords: 'duong am',
      }),
    });
  });

  it('fails explicitly for non-numeric dataset ids', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(api.updateVideoSelection('history-1:demo.mp4', 0, '')).rejects.toThrow(
      'Dataset ID khong hop le cho /api/datasets/selection',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('api.updateVideoFile', () => {
  it('patches filename and folder in one request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ histories: [], folders: [] }),
    } as Response);

    await api.updateVideoFile(7, { filename: 'demo-moi.mp4', folder_id: 3 });

    expect(fetchMock).toHaveBeenCalledWith('/api/video-files/7', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'demo-moi.mp4', folder_id: 3 }),
    });
  });
});
