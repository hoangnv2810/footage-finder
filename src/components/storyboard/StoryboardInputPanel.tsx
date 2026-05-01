import { useState } from 'react';

import { FileText, Package, Pencil } from 'lucide-react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

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
}: StoryboardInputPanelProps) {
  const [open, setOpen] = useState(false);

  const filledFields = [productName, category, audience, tone, benefit].filter(Boolean).length;
  const scriptLines = script.trim() ? script.trim().split('\n').length : 0;

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
    </div>
  );
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
