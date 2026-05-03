import { useEffect, useMemo, useState } from 'react';

import type { ProductFolderSummary } from '@/lib/footage-app';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { LibraryVideoItem } from './types';

interface EditVideoDialogProps {
  open: boolean;
  video: LibraryVideoItem | null;
  folders: ProductFolderSummary[];
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { filename?: string; folderId?: number }) => Promise<void> | void;
}

export function EditVideoDialog({
  open,
  video,
  folders,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
}: EditVideoDialogProps) {
  const [nextBaseName, setNextBaseName] = useState('');
  const [nextFolderId, setNextFolderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fileParts = useMemo(() => splitVideoFileName(video?.fileName || ''), [video?.fileName]);

  useEffect(() => {
    if (!open || !video) {
      setError(null);
      return;
    }

    setNextBaseName(fileParts.baseName);
    setNextFolderId(video.folder?.id ? String(video.folder.id) : '');
    setError(null);
  }, [fileParts.baseName, open, video]);

  const currentFolderId = video?.folder?.id ?? null;
  const normalizedBaseName = normalizeBaseNameInput(nextBaseName, fileParts.extension).trim();
  const nextFileName = normalizedBaseName ? `${normalizedBaseName}${fileParts.extension}` : '';
  const filenameChanged = !!video && !!normalizedBaseName && nextFileName !== video.fileName;
  const folderChanged = currentFolderId !== null && nextFolderId !== '' && Number(nextFolderId) !== currentFolderId;
  const canSave = !!video && !isSubmitting && (filenameChanged || folderChanged);

  const folderOptions = useMemo(() => folders.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi')), [folders]);

  const handleSubmit = async () => {
    if (!video || !canSave) return;

    try {
      setError(null);
      await onSubmit({
        filename: filenameChanged ? nextFileName : undefined,
        folderId: folderChanged ? Number(nextFolderId) : undefined,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể cập nhật video.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-md border-border bg-card p-0 sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader className="border-b border-border px-4 py-2">
          <DialogTitle className="text-base font-semibold">Sửa video</DialogTitle>
        </DialogHeader>

        {video ? (
          <div className="space-y-3 px-4 py-2">
            <div className="space-y-1.5">
              <p className="text-sm font-normal text-foreground">Thư mục hiện tại</p>
              <div className="rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground">
                {video.folder?.name || 'Chưa phân loại'}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-video-filename" className="block text-sm font-normal text-foreground">
                Tên video
              </label>
              <div className="flex overflow-hidden rounded-md border border-input bg-background">
                <input
                  id="edit-video-filename"
                  value={nextBaseName}
                  onChange={(event) => setNextBaseName(normalizeBaseNameInput(event.target.value, fileParts.extension))}
                  placeholder="ten-video"
                  className="flex-1 border-0 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <span className="border-l border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {fileParts.extension}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-video-folder" className="block text-sm font-normal text-foreground">
                Thư mục
              </label>
              <Select
                value={nextFolderId}
                onValueChange={setNextFolderId}
              >
                <SelectTrigger id="edit-video-folder" aria-label="Thư mục">
                  <SelectValue placeholder="Chọn thư mục" />
                </SelectTrigger>
                <SelectContent>
                  {folderOptions.map((folder) => (
                    <SelectItem key={folder.id} value={String(folder.id)}>
                      {folder.name}{folder.id === currentFolderId ? ' (hiện tại)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="px-4 pb-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Lưu thay đổi
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function splitVideoFileName(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return {
      baseName: fileName,
      extension: '.mp4',
    };
  }

  return {
    baseName: fileName.slice(0, lastDotIndex),
    extension: fileName.slice(lastDotIndex),
  };
}

function normalizeBaseNameInput(value: string, extension: string) {
  const trimmedValue = value.trimStart();
  if (trimmedValue.toLowerCase().endsWith(extension.toLowerCase())) {
    return trimmedValue.slice(0, -extension.length);
  }
  return trimmedValue;
}
