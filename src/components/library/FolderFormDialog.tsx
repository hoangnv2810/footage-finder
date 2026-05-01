import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface FolderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  isSubmitting?: boolean;
  onSubmit: (name: string) => Promise<void> | void;
}

export function FolderFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = '',
  isSubmitting = false,
  onSubmit,
}: FolderFormDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    setName(initialName);
  }, [initialName, open]);

  const normalized = name.trim();
  const canSubmit = !!normalized && normalized !== initialName.trim() && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      setError(null);
      await onSubmit(normalized);
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể lưu thư mục.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-md border-border bg-card p-0 sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 px-4 py-3">
          <label htmlFor="folder-name-input" className="block text-sm font-normal text-foreground">
            Tên thư mục
          </label>
          <input
            id="folder-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nhập tên thư mục"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

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
            disabled={!canSubmit}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
