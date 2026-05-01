import { useEffect, useRef, useState } from 'react';

import { ChevronDown, ChevronRight, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { VideoListItem } from './VideoListItem';
import type { LibraryProduct, LibraryVideoItem } from './types';

interface ProductGroupProps {
  product: LibraryProduct;
  selectedVideoId: string | null;
  onSelectVideo: (video: LibraryVideoItem) => void;
  expanded: boolean;
  onToggle: () => void;
  onRenameFolder?: (product: LibraryProduct) => void;
  onDeleteFolder?: (product: LibraryProduct) => void;
  onEditVideo?: (video: LibraryVideoItem) => void;
}

export function ProductGroup({
  product,
  selectedVideoId,
  onSelectVideo,
  expanded,
  onToggle,
  onRenameFolder,
  onDeleteFolder,
  onEditVideo,
}: ProductGroupProps) {
  const showRenameAction = product.folderId !== null;
  const canRenameFolder = showRenameAction && !product.isSystem && !!onRenameFolder;
  const showDeleteAction = !product.isSystem && product.folderId !== null;
  const canDeleteFolder = showDeleteAction && !!onDeleteFolder;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
  const suppressNextToggleRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        suppressNextToggleRef.current = !!toggleButtonRef.current?.contains(event.target as Node);
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        suppressNextToggleRef.current = false;
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 hover:bg-surface-hover transition-colors">
        <button
          ref={toggleButtonRef}
          onClick={() => {
            if (suppressNextToggleRef.current) {
              suppressNextToggleRef.current = false;
              return;
            }
            if (menuOpen) {
              setMenuOpen(false);
              return;
            }
            onToggle();
          }}
          className="min-w-0 flex flex-1 items-center gap-2 text-sm"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-secondary-foreground font-medium truncate">{product.name}</span>
        </button>

        {showRenameAction ? (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border/70 hover:bg-background hover:text-foreground"
              aria-label={`Mở menu thư mục ${product.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-10 z-20 min-w-[10rem] overflow-hidden rounded-md border border-border bg-card p-1 shadow-sm"
              >
                {product.isSystem ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled
                    className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground disabled:opacity-70"
                  >
                    Thư mục hệ thống
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        if (!canRenameFolder) return;
                        onRenameFolder?.(product);
                      }}
                      disabled={!canRenameFolder}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Sửa tên
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        if (!canDeleteFolder) return;
                        onDeleteFolder?.(product);
                      }}
                      disabled={!canDeleteFolder}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Xóa
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div>
          {product.videos.map((video) => (
            <VideoListItem
              key={video.id}
              video={video}
              isSelected={selectedVideoId === video.id}
              onClick={() => onSelectVideo(video)}
              onEdit={() => onEditVideo?.(video)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
