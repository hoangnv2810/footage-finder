import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProductFolderSummary } from '@/lib/footage-app';

import { EditVideoDialog } from './EditVideoDialog';
import type { LibraryVideoItem } from './types';

const folders: ProductFolderSummary[] = [
  { id: 1, name: 'Chưa phân loại', isSystem: true },
  { id: 2, name: 'BST mùa hè', isSystem: false },
  { id: 3, name: 'Bán chạy', isSystem: false },
];

const video: LibraryVideoItem = {
  id: 'video-1',
  datasetId: '1',
  videoFileId: 101,
  fileName: 'demo.mp4',
  source: 'Web',
  versions: 2,
  currentVersion: 1,
  updatedAt: '10:30 19/04/2026',
  status: 'success',
  productId: 'folder:2',
  folder: { id: 2, name: 'BST mùa hè', isSystem: false },
  duration: '0:30',
  scenes: [],
  matchedScenes: [],
  hasSearchResults: false,
};

describe('EditVideoDialog', () => {
  it('disables save when there is no real change and submits combined changes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <EditVideoDialog
        open
        video={video}
        folders={folders}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('.mp4')).toBeInTheDocument();
    expect(screen.queryByText('File hiện tại')).not.toBeInTheDocument();
    expect(screen.getByText('Thư mục hiện tại')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tên video'), { target: { value: 'demo-moi' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Thư mục' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bán chạy' }));
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ filename: 'demo-moi.mp4', folderId: 3 }));
  });

  it('submits only the field that changed and strips pasted extension', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <EditVideoDialog
        open
        video={video}
        folders={folders}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Tên video'), { target: { value: 'demo-flat.mp4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ filename: 'demo-flat.mp4', folderId: undefined }));
  });
});
