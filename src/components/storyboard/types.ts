import type { StoryboardMatch } from '@/lib/footage-app';

export type StoryboardVideoSource = 'Extension' | 'Web';

export interface SourceVersionView {
  id: string;
  videoFileName: string;
  productName: string;
  source: StoryboardVideoSource;
  version: number;
  sceneCount: number;
  usable: boolean;
}

export interface BeatMatchView {
  id: string;
  fileName: string;
  sceneStart: number;
  sceneEnd: number;
  score: number;
  matchReason: string;
  usageType: 'direct_product' | 'illustrative_broll';
  sceneDescription: string;
  mood: string;
  shotType: string;
  rawMatch: StoryboardMatch;
}

export interface StoryboardBeatView {
  id: string;
  number: number;
  label: string;
  text: string;
  durationHint: string;
  matches: BeatMatchView[];
}
