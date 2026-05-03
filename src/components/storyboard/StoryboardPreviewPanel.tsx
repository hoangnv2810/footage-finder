import { Film } from 'lucide-react';

import { StoryboardMatchCard } from './StoryboardMatchCard';
import type { BeatMatchView, StoryboardBeatView } from './types';

interface StoryboardPreviewPanelProps {
  beat: StoryboardBeatView | null;
  previewMatch: BeatMatchView | null;
  trimmingSceneId: string | null;
  onPreviewMatch: (match: BeatMatchView) => void;
  onTrimMatch: (match: BeatMatchView) => void;
  onPlayerRef: (node: HTMLVideoElement | null) => void;
  onTimeUpdate: () => void;
}

export function StoryboardPreviewPanel({ beat, previewMatch, trimmingSceneId, onPreviewMatch, onTrimMatch, onPlayerRef, onTimeUpdate }: StoryboardPreviewPanelProps) {
  if (!beat) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <Film className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Chọn một beat để xem footage match</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            {beat.number}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{beat.label}</h3>
            <p className="text-xs text-muted-foreground">{beat.text}</p>
          </div>
        </div>
      </div>

      {beat.matches.length === 0 ? (
        <div className="px-4 py-2 border-b border-border bg-badge-web/10 text-xs text-badge-web shrink-0">
          Beat này chưa có match từ backend. Đang hiển thị trạng thái chờ dữ liệu.
        </div>
      ) : null}

      <div className="flex-1 flex min-h-0 flex-col overflow-hidden">
        <div className="grid h-full min-h-0 grid-cols-[minmax(360px,44%)_minmax(340px,56%)] overflow-hidden">
          <div className="min-h-0 border-r border-border bg-card/30">
            <div className="flex h-full min-h-0 items-center justify-center p-4 overflow-hidden">
              {previewMatch ? (
                <div className="rounded-lg bg-black/40 overflow-hidden w-full max-w-[360px]">
                  <video
                    key={previewMatch.fileName}
                    ref={onPlayerRef}
                    src={`/api/videos/${encodeURIComponent(previewMatch.fileName)}/stream`}
                    preload="auto"
                    onTimeUpdate={onTimeUpdate}
                    controls
                    className="aspect-[9/16] w-full bg-black object-contain"
                  />
                </div>
              ) : (
                <div className="text-center px-4">
                  <Film className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Chọn một match để xem preview video</p>
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 overflow-hidden">
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 space-y-2 custom-scrollbar">
              {beat.matches.length > 0 ? (
                beat.matches.map((match) => (
                  <StoryboardMatchCard
                    key={match.id}
                    match={match}
                    isActive={previewMatch?.id === match.id}
                    onPreview={() => onPreviewMatch(match)}
                    onTrim={() => onTrimMatch(match)}
                    isTrimming={trimmingSceneId === match.id}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs text-muted-foreground">Không tìm thấy footage phù hợp cho beat này</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
