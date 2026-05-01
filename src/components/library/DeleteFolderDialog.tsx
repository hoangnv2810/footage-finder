import { useEffect, useState } from 'react';

import type { ProductFolderSummary } from '@/lib/footage-app';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DeleteFolderDialogProps {
  open: boolean;
  folder: ProductFolderSummary | null;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void> | void;
}

export function DeleteFolderDialog({
  open,
  folder,
  isSubmitting = false,
  onOpenChange,
  onDelete,
}: DeleteFolderDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const canDelete = !!folder && !isSubmitting;

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
  }, [open, folder?.id]);

  const handleSubmit = async () => {
    if (!folder || !canDelete) return;

    try {
      setError(null);
      await onDelete();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể xóa thư mục.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-md border-border bg-card p-0 sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Xóa thư mục</DialogTitle>
        </DialogHeader>

        {folder ? (
          <div className="space-y-3 px-4 py-3 text-sm">
            <p className="text-foreground">
              Bạn muốn xóa thư mục <span className="font-semibold">{folder.name}</span>?
            </p>

            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-foreground">
              Tất cả video trong thư mục này sẽ được chuyển về thư mục hệ thống <span className="font-medium">Chưa phân loại</span>.
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}

        <DialogFooter className="px-4 pb-3 pt-1">
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
            disabled={!canDelete}
            className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Xóa thư mục
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
