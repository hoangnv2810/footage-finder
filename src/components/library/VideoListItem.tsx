import { AlertCircle, Loader2, Pencil } from 'lucide-react';

import { cn } from '@/lib/utils';

import { SourceBadge } from './SourceBadge';
import type { LibraryVideoItem } from './types';

interface VideoListItemProps {
  video: LibraryVideoItem;
  isSelected: boolean;
  onClick: () => void;
  onEdit?: () => void;
}

export function VideoListItem({ video, isSelected, onClick, onEdit }: VideoListItemProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 px-4 py-2.5 transition-colors group border-l-2',
        'hover:bg-surface-hover',
        isSelected ? 'bg-primary/10 border-l-primary' : 'border-l-transparent',
      )}
    >
      <button onClick={onClick} className="min-w-0 flex-1 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm truncate', isSelected ? 'text-foreground font-medium' : 'text-secondary-foreground')}>
              {video.fileName}
            </span>
            {video.status === 'error' ? <AlertCircle className="h-3.5 w-3.5 text-badge-error shrink-0" /> : null}
            {video.status === 'processing' ? <Loader2 className="h-3.5 w-3.5 text-primary shrink-0 animate-spin" /> : null}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <SourceBadge source={video.source} />
            <span className="text-xs text-muted-foreground">v{video.currentVersion}/{video.versions}</span>
            <span className="text-xs text-muted-foreground">· {video.updatedAt}</span>
          </div>
        </div>
      </button>

      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          aria-label={`Sửa video ${video.fileName}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
