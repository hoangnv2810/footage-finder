import { useMemo, useState } from 'react';

import { AlertCircle, Check, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';

import { SourceBadge } from '@/components/library/SourceBadge';
import { cn } from '@/lib/utils';

import type { SourceVersionView } from './types';

interface StoryboardSourcePickerProps {
  sources: SourceVersionView[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  hideHeader?: boolean;
  disableInternalScroll?: boolean;
}

export function StoryboardSourcePicker({ sources, selected, onToggle, hideHeader = false, disableInternalScroll = false }: StoryboardSourcePickerProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, SourceVersionView[]>();
    sources.forEach((source) => {
      const list = map.get(source.productName) || [];
      list.push(source);
      map.set(source.productName, list);
    });
    return map;
  }, [sources]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className={cn('flex flex-col min-h-0', disableInternalScroll ? '' : 'h-full overflow-hidden')}>
      {!hideHeader ? (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-sm font-bold text-white">Nguồn dữ liệu</span>
          <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', selected.size > 0 ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground')}>
            {selected.size} đã chọn
          </span>
        </div>
      ) : null}

      <div className={cn(disableInternalScroll ? '' : 'custom-scrollbar flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain')}>
        {Array.from(grouped.entries()).map(([productName, versions]) => {
          const isCollapsed = collapsed.has(productName);
          const selectedInGroup = versions.filter((version) => selected.has(version.id)).length;
          return (
            <div key={productName}>
              <button
                onClick={() => toggleGroup(productName)}
                className="w-full min-h-11 flex items-center gap-1 px-3 py-2 border-b border-border/50 text-sm hover:bg-surface-hover transition-colors"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium text-secondary-foreground">{productName}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {selectedInGroup > 0 ? <span className="text-primary font-semibold">{selectedInGroup}/</span> : null}
                  {versions.length}
                </span>
              </button>
              {!isCollapsed
                ? versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => version.usable && onToggle(version.id)}
                      disabled={!version.usable}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-3 text-left transition-colors border-b border-border last:border-b-0',
                        version.usable ? 'hover:bg-surface-hover cursor-pointer' : 'opacity-40 cursor-not-allowed',
                        selected.has(version.id) && 'bg-primary/5',
                      )}
                    >
                      <div className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors', selected.has(version.id) ? 'bg-primary border-primary' : 'border-border')}>
                        {selected.has(version.id) ? <Check className="h-3 w-3 text-primary-foreground" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-foreground truncate">{version.videoFileName}</span>
                          <span className="text-[11px] text-muted-foreground">v{version.version}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <SourceBadge source={version.source} />
                          <span className="text-[11px] text-muted-foreground">{version.sceneCount} cảnh</span>
                          {!version.usable ? (
                            <span className="flex items-center gap-0.5 text-[11px] text-badge-error">
                              <AlertCircle className="h-3 w-3" /> Không khả dụng
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
