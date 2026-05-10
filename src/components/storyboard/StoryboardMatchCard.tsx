import { Download, Eye, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { BeatMatchView } from './types';

interface StoryboardMatchCardProps {
  match: BeatMatchView;
  isActive: boolean;
  onPreview: () => void;
  onTrim: () => void;
  onAddToTimeline: () => void;
  isTrimming?: boolean;
}

export function StoryboardMatchCard({ match, isActive, onPreview, onTrim, onAddToTimeline, isTrimming }: StoryboardMatchCardProps) {
  return (
    <div
      className={cn('rounded-lg border p-3 transition-colors', isActive ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-border/80 hover:bg-surface-hover')}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-lg font-bold leading-none', match.score >= 80 ? 'text-success' : match.score >= 50 ? 'text-badge-web' : 'text-muted-foreground')}>
            {match.score}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-foreground font-medium truncate">{match.fileName}</p>
            <p className="text-[11px] text-muted-foreground">{match.sceneStart}s – {match.sceneEnd}s</p>
          </div>
        </div>
        <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 whitespace-nowrap', match.usageType === 'direct_product' ? 'bg-primary/15 text-primary' : 'bg-badge-web/15 text-badge-web')}>
          {match.usageType === 'direct_product' ? 'Sản phẩm' : 'B-roll'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-1.5 leading-relaxed">{match.matchReason}</p>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2.5 flex-wrap">
        {match.mood ? <span className="px-1.5 py-0.5 rounded bg-muted">{match.mood}</span> : null}
        {match.shotType ? <span className="px-1.5 py-0.5 rounded bg-muted">{match.shotType}</span> : null}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={onPreview}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground hover:bg-surface-hover transition-colors"
        >
          <Eye className="h-3 w-3" /> Xem
        </button>
        <button
          type="button"
          onClick={onTrim}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground hover:bg-surface-hover transition-colors"
        >
          <Download className={`h-3 w-3 ${isTrimming ? 'animate-pulse' : ''}`} /> Cắt & tải
        </button>
        <button
          type="button"
          onClick={onAddToTimeline}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground hover:bg-surface-hover transition-colors"
        >
          <Plus className="h-3 w-3" /> Thêm vào timeline
        </button>
      </div>
    </div>
  );
}
