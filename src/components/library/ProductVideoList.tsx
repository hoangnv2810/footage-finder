import { Plus } from 'lucide-react';

import type { DatasetSourceFilter } from '@/lib/footage-app';

import { ProductGroup } from './ProductGroup';
import type { LibraryProduct, LibraryVideoItem } from './types';

interface ProductVideoListProps {
  products: LibraryProduct[];
  selectedVideoId: string | null;
  filter: DatasetSourceFilter;
  onFilterChange: (filter: DatasetSourceFilter) => void;
  onSelectVideo: (video: LibraryVideoItem) => void;
  onEditVideo?: (video: LibraryVideoItem) => void;
  expandedProductGroups: string[];
  onToggleProductGroup: (groupKey: string) => void;
  onCreateFolder?: () => void;
  onRenameFolder?: (product: LibraryProduct) => void;
  onDeleteFolder?: (product: LibraryProduct) => void;
}

const filters: { label: string; value: DatasetSourceFilter }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Extension', value: 'extension' },
  { label: 'Web', value: 'web' },
];

export function ProductVideoList({
  products,
  selectedVideoId,
  filter,
  onFilterChange,
  onSelectVideo,
  onEditVideo,
  expandedProductGroups,
  onToggleProductGroup,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: ProductVideoListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {filters.map((item) => (
              <button
                key={item.value}
                onClick={() => onFilterChange(item.value)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === item.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onCreateFolder?.()}
            disabled={!onCreateFolder}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Tạo thư mục
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {products.map((product) => (
          <ProductGroup
            key={product.id}
            product={product}
            selectedVideoId={selectedVideoId}
            onSelectVideo={onSelectVideo}
            expanded={expandedProductGroups.includes(product.id)}
            onToggle={() => onToggleProductGroup(product.id)}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            onEditVideo={onEditVideo}
          />
        ))}

        {products.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            Không có dữ liệu
          </div>
        ) : null}
      </div>
    </div>
  );
}
