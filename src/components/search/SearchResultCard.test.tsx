import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchResultCard } from './SearchResultCard';
import type { SessionVideo } from './types';

const video: SessionVideo = {
  id: 'video-1',
  fileName: 'demo.mp4',
  source: 'Web',
  status: 'success',
  version: 1,
  totalVersions: 1,
  duration: '0:10',
  scenes: [],
  searchResults: [],
  currentKeywords: '',
};

describe('SearchResultCard', () => {
  it('starts the preview video muted when the default preview audio setting is off', () => {
    render(
      <SearchResultCard
        video={video}
        viewMode="full"
        onSetViewMode={vi.fn()}
        onSwitchVersion={vi.fn()}
        onRetry={vi.fn()}
        onExportSRT={vi.fn()}
        onPlayScene={vi.fn()}
        onTrimScene={vi.fn()}
        trimmingSceneId={null}
        videoSrc="/api/videos/demo.mp4/stream"
        previewMutedDefault={true}
        onPlayerRef={vi.fn()}
        onPlayerLoadedMetadata={vi.fn()}
        onPlayerTimeUpdate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('search-preview-video')).toHaveProperty('muted', true);
  });
});
