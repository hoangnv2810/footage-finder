import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';

import { SourceBadge } from '@/components/library/SourceBadge';
import { cn } from '@/lib/utils';

import type { AnalysisStatus, SessionVideo } from './types';

const statusConfig: Record<AnalysisStatus, { icon: React.ElementType; className: string }> = {
  pending: { icon: Clock, className: 'text-muted-foreground' },
  analyzing: { icon: Loader2, className: 'text-primary animate-spin' },
  success: { icon: CheckCircle2, className: 'text-success' },
  error: { icon: AlertCircle, className: 'text-badge-error' },
};

export function SessionVideoItem({ video, isSelected, onClick }: { video: SessionVideo; isSelected: boolean; onClick: () => void }) {
  const status = statusConfig[video.status];
  const StatusIcon = status.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2.5 py-2.5 transition-colors border-l-2 border-b border-b-border',
        isSelected ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-surface-hover',
      )}
    >
      <div className="flex items-center gap-2">
        <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', status.className)} />
        <span className={cn('text-xs truncate flex-1', isSelected ? 'text-foreground font-medium' : 'text-secondary-foreground')}>
          {video.fileName}
        </span>
      </div>
        <div className="flex items-center gap-1.5 mt-1 ml-[22px]">
        <SourceBadge source={video.source} />
        <span className="text-[11px] text-muted-foreground font-medium">{video.duration}</span>
      </div>
    </button>
  );
}
