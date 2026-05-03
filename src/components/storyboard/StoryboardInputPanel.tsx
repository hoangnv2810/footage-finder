import { useState } from 'react';

import { ChevronDown, FileText, Package, Pencil, Trash2 } from 'lucide-react';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SavedStoryboard } from '@/lib/footage-app';

const TONE_OPTIONS = [
  {
    label: "Chị bạn thân tám chuyện (Story-driven)",
    value: `Giọng nữ trẻ 22-30, nhiệt tình như đang ngồi tám với hội chị em — không phải quảng cáo, là đang kể chuyện thật.
Cấu trúc cảm xúc theo 3 nhịp bắt buộc:
- Mở (pain point): chậm lại, giọng nhẹ xót — tạo đồng cảm trước khi bán.
- Giữa (demo/lợi ích): tăng tốc, hào hứng, có khoảnh khắc 'sốc ngang' để tạo điểm nhớ.
- Cuối (CTA): nhanh, mạnh, hối thúc — như đang giục bạn thân mua kẻo hết.
Từ đặc trưng: 'mấy bà ơi', 'sốc ngang luôn á', 'chân ái', 'mê luôn', 'link góc trái nè'.
Tránh: một màu cảm xúc xuyên suốt, giọng MC, ngọt quá, hoặc máy móc.`
  },
  {
    label: "Gần gũi như bạn thân (TikTok/Reels)",
    value: `Viết như đang nhắn tin hoặc kể chuyện trực tiếp cho bạn thân nghe. 
Câu ngắn, nhịp nhanh, tự nhiên, không trau chuốt. 
Dùng từ lóng mạng phù hợp gen Z Việt: 'mấy bà', 'thật ra', 'nhưng mà', 'sốc ngang', 'xài thử coi', 'không phải dạng vừa đâu'. 
Tạo FOMO nhẹ: gợi ý số lượng có hạn, deal sắp hết, nhiều người đang mua. 
Tránh: văn viết, từ hoa mỹ, câu dài, giọng quảng cáo cứng.`
  },
  {
    label: "Năng động, bắt trend",
    value: `Giọng trẻ, bùng nổ năng lượng, nhịp điệu nhanh như video TikTok cắt cảnh liên tục. 
Hook cực mạnh ngay câu đầu tiên (gây shock, đặt câu hỏi, hoặc claim táo bạo). 
Câu ngắn. Nhiều dấu chấm than. Dùng các cụm đang viral hoặc format quen thuộc của nền tảng. 
Luôn có call-to-action rõ ràng ở cuối. 
Tránh: mở đầu chậm, giải thích dài dòng, giọng kể lể.`
  },
  {
    label: "Cá tính mạnh, cực cháy",
    value: `Giọng tự tin tuyệt đối, không xin lỗi, không do dự — như người biết mình muốn gì và không cần ai approve. 
Phù hợp cho fashion, beauty, lifestyle cao cấp hoặc cá tính. 
Dùng câu khẳng định mạnh: 'Đây là thứ duy nhất tao cần', 'Không thử thì tiếc đấy'. 
Có thể hơi khiêu khích hoặc ngông nhưng không thô. 
Tránh: do dự, từ ngữ mềm mỏng, giải thích quá nhiều, giọng năn nỉ.`
  },
  {
    label: "Chill, chữa lành (Aesthetic)",
    value: `Nhẹ nhàng, chậm rãi, tập trung vào cảm xúc và khoảnh khắc cá nhân. 
Câu văn mượt, có hình ảnh, gợi cảm giác hơn là liệt kê tính năng. 
Phù hợp skincare, đồ nhà, nến thơm, lifestyle. 
Dùng ngôn ngữ cảm xúc: 'cảm giác như được ôm', 'buổi tối bình yên hơn', 'nhỏ thôi nhưng khác hẳn'. 
Tránh: FOMO, áp lực, từ ngữ gấp gáp, giọng bán hàng lộ liễu.`
  },
  {
    label: "Chị lớn biết tuốt",
    value: `Giọng của người chị có kinh nghiệm, đã thử nhiều thứ và đang chia sẻ thật lòng — không phải quảng cáo, là chỉ em. 
Có authority nhưng vẫn gần gũi, dùng 'chị', 'em', 'mình'. 
Đưa ra lý do cụ thể, so sánh được, có quan điểm rõ ràng. 
Dùng cụm: 'Chị xài rồi mới nói', 'Thật ra thì...', 'Em cứ tin chị đi'. 
Tránh: giọng giáo điều, từ kỹ thuật khô khan, quá formal.`
  },
  {
    label: "Hài hước, self-aware",
    value: `Giọng tự giễu nhẹ, biết mình đang 'bán hàng' nhưng vẫn làm — và điều đó tạo ra sự duyên dáng. 
Dùng humor để phá vỡ rào cản mua hàng: thừa nhận sự hoài nghi của người xem trước rồi lật ngược. 
Cấu trúc hay dùng: 'Tao cũng không tin... cho đến khi...', 'Đừng mua nếu bạn không muốn bị nghiện'. 
Vui nhưng vẫn có thông tin thật, không chỉ là joke. 
Tránh: quá lố, mất trust, hài nhạt, hoặc mất đi thông điệp chính.`
  }
];

const AUDIENCE_OPTIONS = [
  "Dưới 18 tuổi",
  "18-24 tuổi",
  "25-34 tuổi",
  "35-44 tuổi",
  "45-54 tuổi",
  "Trên 55 tuổi"
];

const GENDER_OPTIONS = [
  "Nam",
  "Nữ",
  "Cả nam và nữ"
];

const REGION_OPTIONS = [
  "Miền Bắc",
  "Miền Trung",
  "Miền Nam",
  "Toàn quốc"
];

interface StoryboardInputPanelProps {
  productName: string;
  setProductName: (v: string) => void;
  gender: string;
  setGender: (v: string) => void;
  audience: string;
  setAudience: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  script: string;
  setScript: (v: string) => void;
  savedStoryboards: SavedStoryboard[];
  selectedStoryboardId: string | null;
  folderName: string;
  onCopyInput: () => void;
  onImportStoryboard: (rawJson: string) => void | Promise<void>;
  onSelectSavedStoryboard: (id: string) => void;
  onDeleteSavedStoryboard: (id: string) => void;
  isImportingStoryboard?: boolean;
}

export function StoryboardInputPanel({
  productName,
  setProductName,
  gender,
  setGender,
  audience,
  setAudience,
  tone,
  setTone,
  region,
  setRegion,
  script,
  setScript,
  savedStoryboards,
  selectedStoryboardId,
  folderName,
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

  const filledFields = [productName, gender, audience, tone, region].filter(Boolean).length;
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
            <DialogHeader className="border-b border-border px-4 py-2">
              <DialogTitle className="text-base font-semibold">Thông tin sản phẩm & Kịch bản</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 px-4 py-2">
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium text-foreground">Thông tin sản phẩm</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tên sản phẩm" value={productName} onChange={setProductName} placeholder="VD: Serum Vitamin C" />
                  <div>
                    <label className="mb-1 block text-sm font-normal text-foreground">Độ tuổi</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex w-full h-[38px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none hover:bg-accent hover:text-accent-foreground">
                          <span className="truncate">
                            {audience ? audience : "Chọn độ tuổi..."}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[200px]">
                        {AUDIENCE_OPTIONS.map((opt) => {
                          const isSelected = audience.split(', ').includes(opt);
                          return (
                            <DropdownMenuCheckboxItem
                              key={opt}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const current = audience ? audience.split(', ').filter(Boolean) : [];
                                if (checked) {
                                  setAudience([...current, opt].join(', '));
                                } else {
                                  setAudience(current.filter((v) => v !== opt).join(', '));
                                }
                              }}
                            >
                              {opt}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-normal text-foreground">Giới tính</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex w-full h-[38px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none hover:bg-accent hover:text-accent-foreground">
                          <span className="truncate">
                            {gender ? gender : "Chọn giới tính..."}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[200px]">
                        {GENDER_OPTIONS.map((opt) => {
                          const isSelected = gender.split(', ').includes(opt);
                          return (
                            <DropdownMenuCheckboxItem
                              key={opt}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const current = gender ? gender.split(', ').filter(Boolean) : [];
                                if (checked) {
                                  setGender([...current, opt].join(', '));
                                } else {
                                  setGender(current.filter((v) => v !== opt).join(', '));
                                }
                              }}
                            >
                              {opt}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-normal text-foreground">Vùng miền</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex w-full h-[38px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none hover:bg-accent hover:text-accent-foreground">
                          <span className="truncate">
                            {region ? region : "Chọn vùng miền..."}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[200px]">
                        {REGION_OPTIONS.map((opt) => {
                          const isSelected = region.split(', ').includes(opt);
                          return (
                            <DropdownMenuCheckboxItem
                              key={opt}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const current = region ? region.split(', ').filter(Boolean) : [];
                                if (checked) {
                                  setRegion([...current, opt].join(', '));
                                } else {
                                  setRegion(current.filter((v) => v !== opt).join(', '));
                                }
                              }}
                            >
                              {opt}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-sm font-normal text-foreground">Tone giọng</label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger className="w-full h-[38px] text-sm">
                        <SelectValue placeholder="Chọn tone giọng" />
                      </SelectTrigger>
                      <SelectContent>
                        {tone && !TONE_OPTIONS.find((o) => o.value === tone) && (
                          <SelectItem value={tone}>Tùy chỉnh (Đã nhập trước đó)</SelectItem>
                        )}
                        {TONE_OPTIONS.map((opt, i) => (
                          <SelectItem key={i} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

            <DialogFooter className="px-4 pb-2 pt-1">
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
              <DialogHeader className="border-b border-border px-4 py-2">
                <DialogTitle className="text-base font-semibold">Import storyboard JSON</DialogTitle>
                <DialogDescription>Dán JSON storyboard đã tạo từ GPT hoặc Claude để lưu và hiển thị trong phần mềm.</DialogDescription>
              </DialogHeader>
              <div className="px-4 py-2">
                <label className="mb-1 block text-sm font-normal text-foreground" htmlFor="storyboard-import-json">JSON storyboard</label>
                <textarea
                  id="storyboard-import-json"
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  className="h-56 w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none custom-scrollbar"
                  placeholder='{"beats":[],"beatMatches":[]}'
                />
              </div>
              <DialogFooter className="px-4 pb-2 pt-1">
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
          <DialogHeader className="border-b border-border px-4 py-2">
            <DialogTitle className="text-base font-semibold">Xóa storyboard đã lưu?</DialogTitle>
            <DialogDescription>
              Storyboard "{deleteTarget?.productName || 'Chưa nhập sản phẩm'}" sẽ bị xóa khỏi danh sách đã lưu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-4 pb-2 pt-1">
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
