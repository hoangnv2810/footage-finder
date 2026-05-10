import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductVideoList } from './ProductVideoList';
import type { LibraryProduct } from './types';

const products: LibraryProduct[] = [
  {
    id: 'folder-1',
    folderId: 1,
    name: 'Folder A',
    isSystem: false,
    videos: [
      {
        id: 'video-1',
        datasetId: '1',
        videoFileId: 101,
        fileName: 'demo.mp4',
        source: 'Web',
        versions: 2,
        currentVersion: 1,
        updatedAt: '10:30 19/04/2026',
        status: 'success',
        productId: 'Folder A',
        folder: { id: 1, name: 'Folder A', isSystem: false },
        duration: '0:30',
        scenes: [],
        matchedScenes: [],
        hasSearchResults: false,
      },
    ],
  },
  {
    id: 'folder-2',
    folderId: 2,
    name: 'Chưa phân loại',
    isSystem: true,
    videos: [
      {
        id: 'video-2',
        datasetId: '2',
        videoFileId: 102,
        fileName: 'system.mp4',
        source: 'Web',
        versions: 1,
        currentVersion: 1,
        updatedAt: '10:35 19/04/2026',
        status: 'success',
        productId: 'Chưa phân loại',
        folder: { id: 2, name: 'Chưa phân loại', isSystem: true },
        duration: '0:10',
        scenes: [],
        matchedScenes: [],
        hasSearchResults: false,
      },
    ],
  },
];

describe('ProductVideoList', () => {
  it('renders filter row with create-folder action, keeps folder expanded when closing menu, and exposes video edit action', () => {
    const onCreateFolder = vi.fn();
    const onRenameFolder = vi.fn();
    const onDeleteFolder = vi.fn();
    const onEditVideo = vi.fn();
    const onToggleProductGroup = vi.fn();

    render(
      <ProductVideoList
        products={products}
        selectedVideoId={null}
        filter="all"
        onFilterChange={vi.fn()}
        onSelectVideo={vi.fn()}
        onEditVideo={onEditVideo}
        expandedProductGroups={['folder-1', 'folder-2']}
        onToggleProductGroup={onToggleProductGroup}
        onCreateFolder={onCreateFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tạo thư mục' }));
    expect(onCreateFolder).toHaveBeenCalledTimes(1);

    const headerBar = screen.getByRole('button', { name: 'Tất cả' }).closest('div')?.parentElement;
    expect(headerBar).toBeTruthy();
    if (headerBar) {
      expect(headerBar).toContainElement(screen.getByRole('button', { name: 'Tất cả' }));
      expect(headerBar).toContainElement(screen.getByRole('button', { name: 'Extension' }));
      expect(headerBar).toContainElement(screen.getByRole('button', { name: 'Web' }));
      expect(headerBar).toContainElement(screen.getByRole('button', { name: 'Tạo thư mục' }));
    }

    const folderMenuButton = screen.getByRole('button', { name: 'Mở menu thư mục Folder A' });
    expect(folderMenuButton).toHaveClass('cursor-pointer');
    expect(folderMenuButton).not.toHaveClass('hover:bg-background', 'hover:border-border/70', 'hover:text-foreground');
    fireEvent.click(folderMenuButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sửa tên' }));
    expect(onRenameFolder).toHaveBeenCalledWith(products[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu thư mục Folder A' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Xóa' }));
    expect(onDeleteFolder).toHaveBeenCalledWith(products[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu thư mục Folder A' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Folder A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Folder A' }));
    expect(onToggleProductGroup).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'Sửa tên' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu thư mục Chưa phân loại' }));
    expect(screen.getByRole('menuitem', { name: 'Thư mục hệ thống' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu thư mục Folder A' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menuitem', { name: 'Sửa tên' })).not.toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    fireEvent.click(screen.getByRole('button', { name: 'Sửa video demo.mp4' }));
    expect(onEditVideo).toHaveBeenCalledWith(products[0].videos[0]);

    expect(screen.queryByText('+1 thư mục')).not.toBeInTheDocument();
  });
});
