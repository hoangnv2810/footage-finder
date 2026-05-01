import type { ProductFolderSummary, Scene } from '@/lib/footage-app';

export type LibraryVideoSource = 'Extension' | 'Web';
export type LibraryVideoStatus = 'success' | 'error' | 'processing';

export interface LibrarySceneItem {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  description: string;
  rawScene: Scene;
  sceneIndex: number;
}

export interface LibraryVideoItem {
  id: string;
  datasetId: string;
  videoFileId: number | null;
  fileName: string;
  source: LibraryVideoSource;
  versions: number;
  currentVersion: number;
  updatedAt: string;
  status: LibraryVideoStatus;
  productId: string;
  folder: ProductFolderSummary | null;
  duration: string;
  scenes: LibrarySceneItem[];
  matchedScenes: LibrarySceneItem[];
  hasSearchResults: boolean;
}

export interface LibraryProduct {
  id: string;
  folderId: number | null;
  name: string;
  isSystem: boolean;
  videos: LibraryVideoItem[];
}
