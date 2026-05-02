interface VideoRange {
  start: number;
  end: number;
  retriedStartSeek?: boolean;
}

const SEEK_RETRY_LIMIT = 5;
const POSITION_TOLERANCE = 0.5;

// Each `playVideoRange` call stamps the player with a monotonically increasing
// version. Listeners closed over an older version short-circuit, so a rapid
// switch to a new match cannot have its older `seeked` callback re-seek the
// player back to the previous match's start.
let nextPlaybackVersion = 0;
const playbackVersionByPlayer = new WeakMap<HTMLVideoElement, number>();

/**
 * Seek a video player to `range.start` and play once the seek is complete.
 *
 * Robust against four real-world failure modes that previously left the user
 * staring at the video playing from second 0 (or from the previous match's
 * start position):
 *
 * 1. The "close enough" shortcut used to call `play()` while the browser was
 *    still mid-auto-seek. We always issue an explicit seek and gate the play
 *    on `player.seeking`.
 * 2. `fastSeek` can silently no-op on some browsers when the requested
 *    position is "approximately" the current one, leaving `seeking=false`
 *    AND `currentTime !== start`. We back it up with a direct `currentTime`
 *    assignment whenever the position drifted.
 * 3. After `seeked` the actual position can land outside the target window
 *    (low-bitrate / keyframe-sparse files). We re-seek up to
 *    `SEEK_RETRY_LIMIT` times before giving up so playback never starts at 0.
 * 4. When the user rapidly switches matches in the same file, the previous
 *    call's pending `seeked` listener used to fire AFTER the new seek landed
 *    and re-seek the player back to the old match's start. The version
 *    sentinel above makes those stale callbacks bail before they can touch
 *    `currentTime`.
 *
 * Returns `null` for invalid input (caller should not track bounds), or the
 * resolved `{ start, end }` window for use with `enforceVideoRangePlayback`.
 */
export function playVideoRange(player: HTMLVideoElement, range: VideoRange) {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return null;
  }

  const safeStart = Math.max(0, range.start);
  const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : null;
  const end = duration == null ? range.end : Math.min(range.end, duration);
  const start = Math.min(safeStart, end);

  player.pause();

  // Claim ownership of this player for stale-listener cancellation.
  nextPlaybackVersion += 1;
  const myVersion = nextPlaybackVersion;
  playbackVersionByPlayer.set(player, myVersion);
  const isCurrent = () => playbackVersionByPlayer.get(player) === myVersion;

  if (typeof player.addEventListener !== 'function') {
    player.currentTime = start;
    player.play().catch(() => {});
    return { start, end };
  }

  const playIfCurrent = () => {
    if (!isCurrent()) return;
    player.play().catch(() => {});
  };

  const startPlayWhenReady = () => {
    if (!isCurrent()) return;
    if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playIfCurrent();
      return;
    }
    player.addEventListener('canplay', playIfCurrent, { once: true });
  };

  let retries = 0;

  const ensureReadyAndPlay = () => {
    if (!isCurrent()) return;

    if (player.seeking) {
      player.addEventListener('seeked', ensureReadyAndPlay, { once: true });
      return;
    }

    if (Math.abs(player.currentTime - start) > POSITION_TOLERANCE) {
      if (retries >= SEEK_RETRY_LIMIT) {
        // Give up gracefully; enforceVideoRangePlayback can still police bounds.
        startPlayWhenReady();
        return;
      }
      retries += 1;
      player.currentTime = start;
      ensureReadyAndPlay();
      return;
    }

    startPlayWhenReady();
  };

  // Initial seek attempt. fastSeek is preferred for low latency; we always
  // back it up with a currentTime assignment so the position lands somewhere.
  if (typeof player.fastSeek === 'function') {
    try {
      player.fastSeek(start);
    } catch {
      // Fall through to the currentTime assignment below.
    }
  }

  if (Math.abs(player.currentTime - start) > 0.05) {
    player.currentTime = start;
  }

  ensureReadyAndPlay();

  return { start, end };
}

export function enforceVideoRangePlayback(player: HTMLVideoElement, range: VideoRange) {
  const effectiveEnd = Number.isFinite(player.duration) && player.duration > 0
    ? Math.min(range.end, player.duration)
    : range.end;

  if (player.currentTime >= effectiveEnd) {
    player.pause();
    return null;
  }

  if (
    !range.retriedStartSeek &&
    !player.paused &&
    !player.seeking &&
    player.currentTime < range.start - POSITION_TOLERANCE
  ) {
    player.currentTime = range.start;
    return { ...range, retriedStartSeek: true };
  }

  return range;
}
