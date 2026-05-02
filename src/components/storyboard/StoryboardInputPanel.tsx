import { useState } from 'react';

import { FileText, Package, Pencil, Trash2 } from 'lucide-react';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { SavedStoryboard } from '@/lib/footage-app';

interface StoryboardInputPanelProps {
  productName: string;
  setProductName: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  audience: string;
  setAudience: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  benefit: string;
  setBenefit: (v: string) => void;
  script: string;
  setScript: (v: string) => void;
  savedStoryboards: SavedStoryboard[];
  selectedStoryboardId: string | null;
  onCopyInput: () => void;
  onImportStoryboard: (rawJson: string) => void | Promise<void>;
  onSelectSavedStoryboard: (id: string) => void;
  onDeleteSavedStoryboard: (id: string) => void;
  isImportingStoryboard?: boolean;
}

export function StoryboardInputPanel({
  productName,
  setProductName,
  category,
  setCategory,
  audience,
  setAudience,
  tone,
  setTone,
  benefit,
  setBenefit,
  script,
  setScript,
  savedStoryboards,
  selectedStoryboardId,
  onCopyInput,
  onImportStoryboard,
  onSelectSavedStoryboard,
  onDeleteSavedStoryboard,
  isImportingStoryboard = false,
}: StoryboardInputPanelProps) {
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SavedStoryboard | null>(null);

  const filledFields = [productName, category, audience, tone, benefit].filter(Boolean).length;
  const scriptLines = script.trim() ? script.trim().split('\n').length : 0;

  const submitImport = async () => {
    try {
      await onImportStoryboard(rawJson);
      setRawJson('');
      setImportOpen(false);
    } catch {
      // Keep the dialog open so the pasted JSON can be corrected.
    }
  };

  return (
    <div>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white">Thông tin & Kịch bản</h4>
          <p className="text-xs text-foreground truncate mt-0.5">
            {productName || 'Chưa nhập sản phẩm'}
            <span className="text-muted-foreground"> · {filledFields}/5 trường · {scriptLines} dòng kịch bản</span>
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-surface-hover text-xs font-medium transition-colors shrink-0">
              <Pencil className="h-3 w-3" />
              Sửa
            </button>
          </DialogTrigger>
          <DialogContent className="overflow-hidden rounded-md border-border bg-card p-0 !w-[86vw] !max-w-[58rem] max-h-[calc(100dvh-1rem)] overflow-y-auto overflow-x-hidden custom-scrollbar">
            <DialogHeader className="border-b border-border px-4 py-3">
              <DialogTitle className="text-sm font-medium">Thông tin sản phẩm & Kịch bản</DialogTitle>
              <DialogDescription>Chỉnh thông tin sản phẩm và nội dung kịch bản dùng để tạo storyboard.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-4 py-3">
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium text-foreground">Thông tin sản phẩm</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tên sản phẩm" value={productName} onChange={setProductName} placeholder="VD: Serum Vitamin C" />
                  <Field label="Ngành hàng" value={category} onChange={setCategory} placeholder="VD: Skincare" />
                  <Field label="Đối tượng" value={audience} onChange={setAudience} placeholder="VD: Nữ 20-35 tuổi" />
                  <Field label="Tone" value={tone} onChange={setTone} placeholder="VD: Trẻ trung, đáng tin" />
                  <div className="col-span-2">
                    <Field label="Lợi ích chính" value={benefit} onChange={setBenefit} placeholder="VD: Sáng da sau 7 ngày" />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium text-foreground">Kịch bản</h4>
                </div>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Dán kịch bản video vào đây..."
                  className="w-full h-[min(220px,34dvh)] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none custom-scrollbar"
                />
              </section>
            </div>

            <DialogFooter className="px-4 pb-3 pt-1">
              <button onClick={() => setOpen(false)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                Xong
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-3 px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCopyInput} className="rounded-md bg-secondary px-2 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
            Copy input
          </button>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <button className="rounded-md bg-secondary px-2 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
                Import storyboard JSON
              </button>
            </DialogTrigger>
            <DialogContent className="rounded-md border-border bg-card p-0 sm:max-w-2xl">
              <DialogHeader className="border-b border-border px-4 py-3">
                <DialogTitle className="text-sm font-medium">Import storyboard JSON</DialogTitle>
                <DialogDescription>Dán JSON storyboard đã tạo từ GPT hoặc Claude để lưu và hiển thị trong phần mềm.</DialogDescription>
              </DialogHeader>
              <div className="px-4 py-3">
                <label className="mb-1 block text-sm font-normal text-foreground" htmlFor="storyboard-import-json">JSON storyboard</label>
                <textarea
                  id="storyboard-import-json"
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  className="h-56 w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none custom-scrollbar"
                  placeholder='{"beats":[],"beatMatches":[]}'
                />
              </div>
              <DialogFooter className="px-4 pb-3 pt-1">
                <button onClick={() => setImportOpen(false)} className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
                  Hủy
                </button>
                <button onClick={submitImport} disabled={isImportingStoryboard || !rawJson.trim()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
                  {isImportingStoryboard ? 'Đang nhập...' : 'Nhập JSON'}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-secondary-foreground">Storyboard đã lưu</h4>
          {savedStoryboards.length === 0 ? (
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">Chưa có storyboard đã lưu.</p>
          ) : (
            <div className="space-y-2">
              {savedStoryboards.map((item) => {
                const name = item.productName || 'Chưa nhập sản phẩm';
                return (
                  <div key={item.id} className={`flex items-center gap-2 rounded-md border px-2 py-2 ${selectedStoryboardId === item.id ? 'border-primary/60 bg-primary/10' : 'border-border bg-background'}`}>
                    <button onClick={() => onSelectSavedStoryboard(item.id)} className="min-w-0 flex-1 text-left" title={name}>
                      <span className="block truncate text-xs font-medium text-foreground">{name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {item.beatCount} beat · {formatSavedSource(item.source)} · {formatSavedTime(item.updatedAt)}
                      </span>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      aria-label={`Xóa storyboard ${name}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-badge-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}>
        <DialogContent className="rounded-md border-border bg-card p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-sm font-medium">Xóa storyboard đã lưu?</DialogTitle>
            <DialogDescription>
              Storyboard "{deleteTarget?.productName || 'Chưa nhập sản phẩm'}" sẽ bị xóa khỏi danh sách đã lưu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-4 pb-3 pt-1">
            <DialogClose asChild>
              <button className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
                Hủy
              </button>
            </DialogClose>
            <button
              onClick={() => {
                if (!deleteTarget) return;
                onDeleteSavedStoryboard(deleteTarget.id);
                setDeleteTarget(null);
              }}
              className="rounded-md bg-badge-error px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-badge-error/90"
            >
              Xóa
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatSavedTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function formatSavedSource(source: SavedStoryboard['source']) {
  return source === 'generated' ? 'Tạo tự động' : 'Import JSON';
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-normal text-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
