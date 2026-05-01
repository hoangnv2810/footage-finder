import { Hash } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { StoryboardBeatView } from './types';

interface StoryboardBeatListProps {
  beats: StoryboardBeatView[];
  selectedBeatId: string | null;
  onSelectBeat: (beat: StoryboardBeatView) => void;
}

export function StoryboardBeatList({ beats, selectedBeatId, onSelectBeat }: StoryboardBeatListProps) {
  if (beats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <Hash className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Nhập kịch bản và nhấn "Tạo storyboard" để bắt đầu</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-2 space-y-1">
      {beats.map((beat) => (
        <button
          key={beat.id}
          onClick={() => onSelectBeat(beat)}
          className={cn(
            'w-full text-left p-3 rounded-lg transition-colors border',
            selectedBeatId === beat.id ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-surface-hover',
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={cn('w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold', selectedBeatId === beat.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')}>
                {beat.number}
              </span>
              <span className="text-xs font-semibold text-foreground">{beat.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {beat.durationHint ? <span className="text-[11px] text-muted-foreground">{beat.durationHint}</span> : null}
              <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-medium', beat.matches.length > 0 ? 'bg-success/15 text-success' : 'bg-badge-error/15 text-badge-error')}>
                {beat.matches.length} match
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{beat.text}</p>
        </button>
      ))}
    </div>
  );
}
