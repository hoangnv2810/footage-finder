interface VideoPlayerPanelProps {
  fileName: string;
  currentTime?: number;
  videoSrc: string;
  onPlayerRef: (node: HTMLVideoElement | null) => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
}

export function VideoPlayerPanel({
  fileName,
  currentTime,
  videoSrc,
  onPlayerRef,
  onLoadedMetadata,
  onTimeUpdate,
}: VideoPlayerPanelProps) {
  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      <div className="h-full max-h-full aspect-[9/16] bg-black/40 flex items-center justify-center relative overflow-hidden rounded-md">
        <video
          ref={onPlayerRef}
          src={videoSrc}
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          controls
          className="h-full w-full bg-black object-contain"
        />
        {currentTime !== undefined ? (
          <div className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-[11px] text-muted-foreground">
            @ {currentTime}s · {fileName}
          </div>
        ) : null}
      </div>
    </div>
  );
}
