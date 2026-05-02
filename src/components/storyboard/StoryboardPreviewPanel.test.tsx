import { act, fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { playVideoRange } from '@/lib/video-playback';

import { StoryboardPreviewPanel } from './StoryboardPreviewPanel';
import type { BeatMatchView, StoryboardBeatView } from './types';

const match: BeatMatchView = {
  id: 'match-1',
  fileName: 'demo.mp4',
  sceneStart: 12,
  sceneEnd: 18,
  score: 88,
  matchReason: 'Khớp với cảnh quay sản phẩm',
  usageType: 'direct_product',
  sceneDescription: 'Cận cảnh sản phẩm',
  mood: 'Sáng',
  shotType: 'Close-up',
  rawMatch: {
    id: 'match-1',
    beatId: 'beat-1',
    videoVersionId: 'version-1',
    fileName: 'demo.mp4',
    sceneIndex: 0,
    score: 88,
    matchReason: 'Khớp với cảnh quay sản phẩm',
    usageType: 'direct_product',
    scene: {
      keyword: 'demo',
      start: 12,
      end: 18,
      description: 'Cận cảnh sản phẩm',
    },
  },
};

const laterMatch: BeatMatchView = {
  ...match,
  id: 'match-2',
  sceneStart: 24,
  sceneEnd: 30,
  rawMatch: {
    ...match.rawMatch,
    id: 'match-2',
    sceneIndex: 1,
    scene: {
      ...match.rawMatch.scene,
      start: 24,
      end: 30,
    },
  },
};

const beat: StoryboardBeatView = {
  id: 'beat-1',
  number: 1,
  label: 'Hook',
  text: 'Mở đầu bằng sản phẩm',
  durationHint: '6s',
  matches: [match],
};

describe('StoryboardPreviewPanel', () => {
  it('loads the preview video without a media-fragment seek so JS owns positioning', () => {
    // The browser auto-seek triggered by a `#t=start,end` fragment used to race
    // our explicit JS seek and let the player play from second 0 on Chromium.
    render(
      <StoryboardPreviewPanel
        beat={beat}
        previewMatch={match}
        trimmingSceneId={null}
        onPreviewMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onPlayerRef={vi.fn()}
        onTimeUpdate={vi.fn()}
      />,
    );

    expect(document.querySelector('video')?.getAttribute('src')).toBe('/api/videos/demo.mp4/stream');
  });

  it('reuses the same video element when selecting another range in the same file', () => {
    // Keying the <video> on fileName (not on start/end) means same-file match
    // switches reuse the already-loaded element. The old behavior remounted
    // for every range change, which both wasted bandwidth AND opened the
    // window for the play-from-zero race because the freshly-mounted player
    // started from currentTime=0 with no metadata loaded yet.
    const { rerender } = render(
      <StoryboardPreviewPanel
        beat={beat}
        previewMatch={match}
        trimmingSceneId={null}
        onPreviewMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onPlayerRef={vi.fn()}
        onTimeUpdate={vi.fn()}
      />,
    );
    const firstVideo = document.querySelector('video');

    rerender(
      <StoryboardPreviewPanel
        beat={beat}
        previewMatch={laterMatch}
        trimmingSceneId={null}
        onPreviewMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onPlayerRef={vi.fn()}
        onTimeUpdate={vi.fn()}
      />,
    );

    const nextVideo = document.querySelector('video');
    expect(nextVideo).toBe(firstVideo);
    expect(nextVideo?.getAttribute('src')).toBe('/api/videos/demo.mp4/stream');
  });

  it('remounts the video element when switching to a different file', () => {
    const otherFileMatch: BeatMatchView = {
      ...laterMatch,
      id: 'match-3',
      fileName: 'other.mp4',
      rawMatch: { ...laterMatch.rawMatch, id: 'match-3', fileName: 'other.mp4' },
    };

    const { rerender } = render(
      <StoryboardPreviewPanel
        beat={beat}
        previewMatch={match}
        trimmingSceneId={null}
        onPreviewMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onPlayerRef={vi.fn()}
        onTimeUpdate={vi.fn()}
      />,
    );
    const firstVideo = document.querySelector('video');

    rerender(
      <StoryboardPreviewPanel
        beat={beat}
        previewMatch={otherFileMatch}
        trimmingSceneId={null}
        onPreviewMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onPlayerRef={vi.fn()}
        onTimeUpdate={vi.fn()}
      />,
    );

    const nextVideo = document.querySelector('video');
    expect(nextVideo).not.toBe(firstVideo);
    expect(nextVideo?.getAttribute('src')).toBe('/api/videos/other.mp4/stream');
  });

  it('seeks each newly-mounted video to the match start before calling play (regression for the play-from-zero bug)', () => {
    // This is the real end-to-end regression. We mimic App.tsx's playback
    // effect, then simulate clicking match1 -> match2 -> match3 (all the same
    // file, different ranges) and verify that for each <video> remount the
    // explicit seek lands BEFORE play(), so the player never starts at 0.
    const playCalls: Array<{ at: number; src: string | null }> = [];

    function PlaybackHarness({ initialMatch }: { initialMatch: BeatMatchView }) {
      const [previewMatch, setPreviewMatch] = useState<BeatMatchView | null>(initialMatch);
      const [playToken, setPlayToken] = useState(0);
      const playerRef = useRef<HTMLVideoElement | null>(null);
      const setPlayer = useCallback((node: HTMLVideoElement | null) => {
        playerRef.current = node;
      }, []);

      useEffect(() => {
        const player = playerRef.current;
        if (!player || !previewMatch) return;

        // Patch the video element so we can drive duration / readyState /
        // seeking / play() deterministically inside jsdom.
        const target = player as unknown as {
          __duration: number;
          __readyState: number;
          __seeking: boolean;
          __currentTime: number;
        };
        target.__duration ??= 60;
        target.__readyState ??= HTMLMediaElement.HAVE_NOTHING;
        target.__seeking ??= false;
        target.__currentTime ??= 0;
        Object.defineProperty(player, 'duration', { configurable: true, get: () => target.__duration });
        Object.defineProperty(player, 'readyState', { configurable: true, get: () => target.__readyState });
        Object.defineProperty(player, 'seeking', { configurable: true, get: () => target.__seeking });
        Object.defineProperty(player, 'currentTime', {
          configurable: true,
          get: () => target.__currentTime,
          set: (v: number) => {
            if (Math.abs(v - target.__currentTime) > 0.001) {
              target.__seeking = true;
            }
            target.__currentTime = v;
          },
        });
        player.play = vi.fn(() => {
          playCalls.push({ at: target.__currentTime, src: player.getAttribute('src') });
          return Promise.resolve();
        }) as HTMLVideoElement['play'];
        player.pause = vi.fn() as HTMLVideoElement['pause'];

        const match = previewMatch;
        let cancelled = false;

        const seekAndPlay = () => {
          if (cancelled) return;
          playVideoRange(player, { start: match.sceneStart, end: match.sceneEnd });
        };

        if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
          seekAndPlay();
        } else {
          player.addEventListener('loadedmetadata', seekAndPlay, { once: true });
        }

        return () => {
          cancelled = true;
          player.removeEventListener('loadedmetadata', seekAndPlay);
        };
      }, [previewMatch?.id, playToken]);

      return (
        <>
          <button
            type="button"
            data-testid="play-match-1"
            onClick={() => {
              setPreviewMatch(match);
              setPlayToken((t) => t + 1);
            }}
          >
            match 1
          </button>
          <button
            type="button"
            data-testid="play-match-2"
            onClick={() => {
              setPreviewMatch(laterMatch);
              setPlayToken((t) => t + 1);
            }}
          >
            match 2
          </button>
          <StoryboardPreviewPanel
            beat={beat}
            previewMatch={previewMatch}
            trimmingSceneId={null}
            onPreviewMatch={vi.fn()}
            onTrimMatch={vi.fn()}
            onPlayerRef={setPlayer}
            onTimeUpdate={vi.fn()}
          />
        </>
      );
    }

    const fireMetadataAndSeek = () => {
      const video = document.querySelector('video') as HTMLVideoElement;
      const target = video as unknown as { __readyState: number; __seeking: boolean };
      target.__readyState = HTMLMediaElement.HAVE_METADATA;
      act(() => {
        fireEvent(video, new Event('loadedmetadata'));
      });
      // playVideoRange asked to seek; complete the seek now.
      target.__seeking = false;
      act(() => {
        fireEvent(video, new Event('seeked'));
      });
      // After seek, the player still needs canplay before it actually starts.
      target.__readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
      act(() => {
        fireEvent(video, new Event('canplay'));
      });
    };

    render(<PlaybackHarness initialMatch={match} />);

    // First match: video mounts, metadata loads, seek lands, play from start=12.
    fireMetadataAndSeek();
    expect(playCalls.at(-1)).toEqual({ at: 12, src: '/api/videos/demo.mp4/stream' });

    // Switch to match 2 (different range, same file). The <video> remounts; the
    // browser would normally start with currentTime=0 again. Verify that we
    // ALWAYS seek to 24 before play, regardless of how the freshly-mounted
    // element initialises.
    act(() => {
      fireEvent.click(screen.getByTestId('play-match-2'));
    });
    fireMetadataAndSeek();
    expect(playCalls.at(-1)).toEqual({ at: 24, src: '/api/videos/demo.mp4/stream' });

    // Re-clicking match 1 (same id as previewMatch=match2 -> different id) must
    // also seek to 12 before play().
    act(() => {
      fireEvent.click(screen.getByTestId('play-match-1'));
    });
    fireMetadataAndSeek();
    expect(playCalls.at(-1)).toEqual({ at: 12, src: '/api/videos/demo.mp4/stream' });

    // Re-clicking match 1 AGAIN (same identity) should still re-seek+play via
    // the play-token bump - this is the path that the previous implementation
    // skipped silently, leaving the user staring at a paused player.
    act(() => {
      fireEvent.click(screen.getByTestId('play-match-1'));
    });
    // No remount this time - the existing element already has metadata, so the
    // effect runs the seek immediately. Complete the seek and verify play().
    const liveVideo = document.querySelector('video') as HTMLVideoElement;
    (liveVideo as unknown as { __seeking: boolean }).__seeking = false;
    act(() => {
      fireEvent(liveVideo, new Event('seeked'));
    });
    expect(playCalls.at(-1)).toEqual({ at: 12, src: '/api/videos/demo.mp4/stream' });

    // Sanity: play() was never called from currentTime 0 / from before the seek.
    for (const call of playCalls) {
      expect(call.at).not.toBe(0);
    }
  });

  it('plays the matching scene when clicking anywhere on a footage match item', () => {
    const onPreviewMatch = vi.fn();

    render(
      <StoryboardPreviewPanel
        beat={beat}
        previewMatch={null}
        trimmingSceneId={null}
        onPreviewMatch={onPreviewMatch}
        onTrimMatch={vi.fn()}
        onPlayerRef={vi.fn()}
        onTimeUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Khớp với cảnh quay sản phẩm'));

    expect(onPreviewMatch).toHaveBeenCalledTimes(1);
    expect(onPreviewMatch).toHaveBeenCalledWith(match);
  });
});
