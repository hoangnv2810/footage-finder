import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VideoPlayerPanel } from './VideoPlayerPanel';

describe('VideoPlayerPanel', () => {
  it('starts muted when the default preview audio setting is off', () => {
    render(
      <VideoPlayerPanel
        fileName="demo.mp4"
        videoSrc="/api/videos/demo.mp4/stream"
        previewMutedDefault={true}
        onPlayerRef={vi.fn()}
        onLoadedMetadata={vi.fn()}
        onTimeUpdate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('library-preview-video')).toHaveProperty('muted', true);
  });
});
