import { describe, expect, it, vi } from 'vitest';

import { enforceVideoRangePlayback, playVideoRange } from './video-playback';

interface MockPlayerOptions {
  initialCurrentTime?: number;
  duration?: number;
  readyState?: number;
}

function createMockPlayer({
  initialCurrentTime = 0,
  duration = 60,
  readyState = HTMLMediaElement.HAVE_CURRENT_DATA,
}: MockPlayerOptions = {}) {
  let currentTime = initialCurrentTime;
  let seeking = false;
  const listeners: Record<string, Array<() => void>> = {};

  const player = {
    duration,
    readyState,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((event: string, listener: () => void) => {
      listeners[event] = [...(listeners[event] || []), listener];
    }),
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      if (Math.abs(value - currentTime) > 0.001) {
        seeking = true;
      }
      currentTime = value;
    },
    get seeking() {
      return seeking;
    },
  } as unknown as HTMLVideoElement & { __finishSeek: () => void };

  (player as unknown as { __finishSeek: () => void }).__finishSeek = () => {
    seeking = false;
    (listeners.seeked || []).forEach((listener) => listener());
    listeners.seeked = [];
  };

  return { player, listeners };
}

describe('playVideoRange', () => {
  it('waits for seeked before playing when a seek is required', () => {
    const { player } = createMockPlayer({ initialCurrentTime: 0 });

    const bounds = playVideoRange(player, { start: 15, end: 20 });

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.currentTime).toBe(15);
    expect(bounds).toEqual({ start: 15, end: 20 });
    expect(player.play).not.toHaveBeenCalled();

    (player as unknown as { __finishSeek: () => void }).__finishSeek();

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('does not play before seek completes even when currentTime is already near start', () => {
    // Reproduces the race: a media-fragment `#t=24,30` src caused the browser
    // to auto-seek to ~24, but `player.seeking` was still true. The previous
    // "close enough" shortcut called play() immediately and Chromium played
    // from 0 until the seek actually landed.
    let currentTime = 24;
    let seekingFlag = true;
    const listeners: Record<string, Array<() => void>> = {};
    const player = {
      duration: 60,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners[event] = [...(listeners[event] || []), listener];
      }),
      get currentTime() {
        return currentTime;
      },
      set currentTime(value: number) {
        currentTime = value;
      },
      get seeking() {
        return seekingFlag;
      },
    } as unknown as HTMLVideoElement;

    playVideoRange(player, { start: 24, end: 30 });

    expect(player.play).not.toHaveBeenCalled();
    expect(listeners.seeked).toBeDefined();
    expect(listeners.seeked.length).toBe(1);

    seekingFlag = false;
    listeners.seeked[0]();

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('plays immediately when no seek is needed (already at the target)', () => {
    const { player } = createMockPlayer({ initialCurrentTime: 15 });
    // Setting currentTime to the same value should not flip seeking to true.

    playVideoRange(player, { start: 15, end: 20 });

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('waits for canplay when readyState is below HAVE_CURRENT_DATA after seek', () => {
    const { player, listeners } = createMockPlayer({
      initialCurrentTime: 0,
      readyState: HTMLMediaElement.HAVE_METADATA,
    });

    playVideoRange(player, { start: 24, end: 30 });

    expect(player.play).not.toHaveBeenCalled();

    (player as unknown as { __finishSeek: () => void }).__finishSeek();

    // After seek lands, readyState is still HAVE_METADATA, so we wait for canplay.
    expect(player.play).not.toHaveBeenCalled();
    expect(listeners.canplay).toBeDefined();
    expect(listeners.canplay.length).toBe(1);

    listeners.canplay[0]();

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('clamps end to video duration', () => {
    const { player } = createMockPlayer({ duration: 51 });

    const bounds = playVideoRange(player, { start: 45, end: 52 });

    expect(player.currentTime).toBe(45);
    expect(bounds!.end).toBe(51);
  });

  it('clamps start to end when start exceeds end', () => {
    const { player } = createMockPlayer({ duration: 10 });

    const bounds = playVideoRange(player, { start: 15, end: 10 });

    expect(bounds!.start).toBe(10);
    expect(bounds!.end).toBe(10);
  });

  it('returns null for non-finite scene bounds instead of playing from zero', () => {
    // Defensive: if a saved storyboard somehow contains a match with a missing
    // or NaN start/end, we used to set `currentTime = NaN` which the browser
    // coerced to 0 and the player happily played the whole video from 0. Now
    // we bail and let the caller leave the player paused.
    const { player } = createMockPlayer({ initialCurrentTime: 0 });

    const bounds = playVideoRange(player, { start: NaN, end: 20 });

    expect(bounds).toBeNull();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("does NOT re-seek backwards when the user switches matches mid-seek (stale-listener regression)", () => {
    // The bug: user clicks match A (start=12), playVideoRange initiates a seek
    // and registers a `seeked` listener closed over start=12. Before the seek
    // completes, user clicks match B (start=24); a second playVideoRange runs
    // and registers its own listener closed over start=24. When the seek
    // (which is now to 24) fires `seeked`, BOTH listeners run. The stale one
    // for match A would notice currentTime=24 != 12, decide the seek "failed",
    // and yank currentTime back to 12 - playing the WRONG match's segment.
    //
    // The version sentinel makes the stale listener bail before it can touch
    // currentTime.
    const { player, listeners } = createMockPlayer({ initialCurrentTime: 0 });

    // Match A: seek to 12, registers seekedA listener.
    playVideoRange(player, { start: 12, end: 18 });
    expect(player.currentTime).toBe(12);
    const seekedA = listeners.seeked?.[0];
    expect(seekedA).toBeDefined();

    // Before the seek completes, user clicks match B. Second playVideoRange.
    playVideoRange(player, { start: 24, end: 30 });
    expect(player.currentTime).toBe(24);
    const seekedB = listeners.seeked?.[1];
    expect(seekedB).toBeDefined();

    // Pretend the browser landed at 24 (match B's target) and fired seeked.
    // The mock would now fire BOTH listeners.
    (player as unknown as { __finishSeek: () => void }).__finishSeek();

    // The stale listener for match A must NOT have re-seeked back to 12.
    expect(player.currentTime).toBe(24);
    // Only match B's playback should have started.
    expect(player.play).toHaveBeenCalledTimes(1);
  });
});

describe('enforceVideoRangePlayback', () => {
  it('retries a failed start seek once without replaying on every timeupdate', () => {
    let currentTime = 0;
    let seekAssignments = 0;
    const player = {
      duration: 60,
      paused: false,
      seeking: false,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      get currentTime() {
        return currentTime;
      },
      set currentTime(value: number) {
        seekAssignments += 1;
        currentTime = value;
      },
    } as unknown as HTMLVideoElement;

    const first = enforceVideoRangePlayback(player, { start: 15, end: 20 });
    currentTime = 0;
    const second = enforceVideoRangePlayback(player, first!);

    expect(seekAssignments).toBe(1);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(second).toEqual({ start: 15, end: 20, retriedStartSeek: true });
  });

  it('retries when currentTime is just slightly before the target start (within 1s)', () => {
    // The previous threshold of 1.0s was too lenient: a video that drifted to
    // `start - 0.8s` slipped through without retry.
    let currentTime = 14.4;
    let seekAssignments = 0;
    const player = {
      duration: 60,
      paused: false,
      seeking: false,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      get currentTime() {
        return currentTime;
      },
      set currentTime(value: number) {
        seekAssignments += 1;
        currentTime = value;
      },
    } as unknown as HTMLVideoElement;

    const updated = enforceVideoRangePlayback(player, { start: 15, end: 20 });

    expect(seekAssignments).toBe(1);
    expect(updated).toEqual({ start: 15, end: 20, retriedStartSeek: true });
  });
});
