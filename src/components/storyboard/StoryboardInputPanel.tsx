import { useEffect, useRef, useState } from 'react';

import { ChevronDown, Copy, FileText, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SavedStoryboard } from '@/lib/footage-app';

function getModelBadgeStyle(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('claude')) return 'border-orange-400/60 bg-orange-400/10 text-orange-300';
  if (lower.includes('gemini')) return 'border-blue-400/60 bg-blue-400/10 text-blue-300';
  if (lower.includes('gpt') || lower.includes('openai')) return 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300';
  if (lower.includes('qwen')) return 'border-purple-400/60 bg-purple-400/10 text-purple-300';
  if (lower.includes('deepseek')) return 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300';
  return 'border-muted-foreground/40 bg-secondary text-secondary-foreground';
}

function getModelBadgeColor(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('claude')) return 'text-orange-300';
  if (lower.includes('gemini')) return 'text-blue-300';
  if (lower.includes('gpt') || lower.includes('openai')) return 'text-emerald-300';
  if (lower.includes('qwen')) return 'text-purple-300';
  if (lower.includes('deepseek')) return 'text-cyan-300';
  return 'text-muted-foreground';
}

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
  "Cả hai"
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
  productDescription: string;
  setProductDescription: (v: string) => void;
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
  onCopyScriptPrompt: () => void;
  onImportStoryboard: (rawJson: string) => void | Promise<void>;
  onSelectSavedStoryboard: (id: string) => void;
  onDeleteSavedStoryboard: (id: string) => void;
  onRenameSavedStoryboard: (id: string, name: string) => void;
  isImportingStoryboard?: boolean;
}

export function StoryboardInputPanel({
  productName,
  setProductName,
  productDescription,
  setProductDescription,
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
  onCopyScriptPrompt,
  onImportStoryboard,
  onSelectSavedStoryboard,
  onDeleteSavedStoryboard,
  onRenameSavedStoryboard,
  isImportingStoryboard = false,
}: StoryboardInputPanelProps) {
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SavedStoryboard | null>(null);
  const [renameTarget, setRenameTarget] = useState<SavedStoryboard | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [scriptViewTarget, setScriptViewTarget] = useState<SavedStoryboard | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

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
          <h4 className="text-[13px] font-semibold text-white">Thông tin & Kịch bản</h4>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-sm font-normal text-foreground">Tên sản phẩm</label>
                    <input
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="VD: Serum Vitamin C"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-sm font-normal text-foreground">Mô tả sản phẩm</label>
                    <textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="VD: Serum vitamin C giúp da sáng đều màu, mờ thâm, phù hợp dùng buổi sáng..."
                      className="h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none custom-scrollbar"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-normal text-foreground">Độ tuổi</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex w-full h-[38px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none hover:bg-accent hover:text-accent-foreground">
                          <span className="truncate">
                            {audience ? audience.split(', ').map((a) => a.replace(/ tuổi$/, '')).join(', ') : "Chọn độ tuổi..."}
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
                          const isSelected = gender === opt;
                          return (
                            <DropdownMenuCheckboxItem
                              key={opt}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setGender(checked ? opt : '');
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
                  <div>
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-medium text-foreground">Kịch bản</h4>
                  </div>
                  <button
                    type="button"
                    onClick={onCopyScriptPrompt}
                    className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy prompt tạo kịch bản
                  </button>
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
        <section className="space-y-2">
          <h4 className="text-[13px] font-semibold text-white">Storyboard đã lưu</h4>
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
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
                        <span>{item.beatCount} beat · {formatSavedTime(item.updatedAt)}{item.importedModel ? <span className={` ${getModelBadgeColor(item.importedModel)}`}> · {item.importedModel}</span> : null}</span>
                      </span>
                    </button>
                    <div ref={openMenuId === item.id ? menuRef : undefined} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                        className="cursor-pointer rounded-lg border border-transparent p-1.5 text-muted-foreground"
                        aria-label={`Mở menu storyboard ${name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === item.id}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>

                      {openMenuId === item.id ? (
                        <div
                          role="menu"
                          className="absolute right-0 top-8 z-20 min-w-[7rem] overflow-hidden rounded border border-border bg-card p-1 shadow-sm"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              setRenameTarget(item);
                              setRenameValue(item.productName);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-hover"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Sửa tên
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              setScriptViewTarget(item);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-hover"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Chi tiết
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              setDeleteTarget(item);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCopyInput} className="rounded-md bg-secondary px-2 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
            Copy input
          </button>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <button className="rounded-md bg-secondary px-2 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
                Import storyboard
              </button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className="rounded-md border-border bg-card p-0 sm:max-w-2xl">
              <DialogHeader className="border-b border-border px-4 py-2">
                <DialogTitle className="text-base font-semibold">Import storyboard</DialogTitle>
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

      <Dialog open={!!renameTarget} onOpenChange={(nextOpen) => { if (!nextOpen) setRenameTarget(null); }}>
        <DialogContent className="rounded-md border-border bg-card p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-4 py-2">
            <DialogTitle className="text-base font-semibold">Sửa tên storyboard</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-3">
            <label className="mb-1 block text-sm font-normal text-foreground" htmlFor="rename-storyboard-input">Tên mới</label>
            <input
              id="rename-storyboard-input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder="Nhập tên storyboard"
            />
          </div>
          <DialogFooter className="px-4 pb-2 pt-1">
            <DialogClose asChild>
              <button className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
                Hủy
              </button>
            </DialogClose>
            <button
              onClick={() => {
                if (!renameTarget || !renameValue.trim()) return;
                onRenameSavedStoryboard(renameTarget.id, renameValue.trim());
                setRenameTarget(null);
              }}
              disabled={!renameValue.trim()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Lưu
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scriptViewTarget} onOpenChange={(nextOpen) => { if (!nextOpen) setScriptViewTarget(null); }}>
        <DialogContent aria-describedby={undefined} className="rounded-md border-border bg-card p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-4 py-2">
            <DialogTitle className="text-base font-semibold">Thông tin — {scriptViewTarget?.productName || 'Chưa nhập sản phẩm'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Giới tính:</span>{' '}
                <span className="text-foreground">{scriptViewTarget?.category || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Độ tuổi:</span>{' '}
                <span className="text-foreground">{scriptViewTarget?.targetAudience || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Vùng miền:</span>{' '}
                <span className="text-foreground">{scriptViewTarget?.keyBenefits || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tone giọng:</span>{' '}
                <span className="text-foreground">{(scriptViewTarget?.tone && TONE_OPTIONS.find((t) => t.value === scriptViewTarget.tone)?.label) || scriptViewTarget?.tone || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Nguồn:</span>{' '}
                <span className="text-foreground">{scriptViewTarget ? formatSavedSource(scriptViewTarget.source) : '—'}</span>
              </div>
              {scriptViewTarget?.importedModel ? (
                <div>
                  <span className="text-muted-foreground">Model:</span>{' '}
                  <span className="text-foreground">{scriptViewTarget.importedModel}</span>
                </div>
              ) : null}
            </div>
            <div>
              <span className="block text-sm font-medium text-muted-foreground mb-1">Kịch bản</span>
              <pre className="whitespace-pre-wrap text-sm text-foreground rounded-md border border-border bg-background p-3">{scriptViewTarget?.scriptText || 'Không có kịch bản.'}</pre>
            </div>
          </div>
          <DialogFooter className="px-4 pb-2 pt-1">
            <DialogClose asChild>
              <button className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-surface-hover">
                Đóng
              </button>
            </DialogClose>
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

