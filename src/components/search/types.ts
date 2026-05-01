import type { Scene } from '@/lib/footage-app';

export type SearchVideoSource = 'Extension' | 'Web';
export type AnalysisStatus = 'pending' | 'analyzing' | 'success' | 'error';

export interface SessionScene {
  id: string;
  label: string;
  keyword?: string;
  description: string;
  startTime: number;
  endTime: number;
  rawScene: Scene;
  sceneIndex: number;
}

export interface SessionVideo {
  id: string;
  fileName: string;
  source: SearchVideoSource;
  status: AnalysisStatus;
  version: number;
  totalVersions: number;
  duration: string;
  scenes: SessionScene[];
  searchResults: SessionScene[];
  currentKeywords: string;
  error?: string;
}
