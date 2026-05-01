import { cn } from '@/lib/utils';

import type { LibraryVideoSource } from './types';

export function SourceBadge({ source }: { source: LibraryVideoSource }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded px-2 text-xs font-semibold leading-none tracking-[0.005em]',
        source === 'Extension'
          ? 'bg-badge-extension/15 text-badge-extension'
          : 'bg-badge-web/15 text-badge-web',
      )}
    >
      {source}
    </span>
  );
}
