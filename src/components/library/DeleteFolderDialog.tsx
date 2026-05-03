import { useEffect, useState } from 'react';

import type { ProductFolderSummary } from '@/lib/footage-app';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';

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
        <DialogHeader className="border-b border-border px-4 py-2">
          <DialogTitle className="text-base font-semibold">Xóa thư mục</DialogTitle>
        </DialogHeader>

        {folder ? (
          <div className="space-y-2 px-4 py-2 text-sm">
            <p className="text-foreground">
              Bạn muốn xóa thư mục <span className="font-semibold">{folder.name}</span>?
            </p>

            <div className="flex items-start gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Tất cả video trong thư mục này sẽ được chuyển về thư mục hệ thống <span className="font-medium">Chưa phân loại</span>.
              </p>
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
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
