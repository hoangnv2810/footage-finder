import { Check, PanelLeftClose, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';

interface SettingsPageProps {
  previewMutedDefault: boolean;
  autoHideSourceColumnOnTimelineOpen: boolean;
  onPreviewMutedDefaultChange: (value: boolean) => void;
  onAutoHideSourceColumnOnTimelineOpenChange: (value: boolean) => void;
}

export function SettingsPage({
  previewMutedDefault,
  autoHideSourceColumnOnTimelineOpen,
  onPreviewMutedDefaultChange,
  onAutoHideSourceColumnOnTimelineOpenChange,
}: SettingsPageProps) {
  const StatusIcon = previewMutedDefault ? VolumeX : Volume2;

  return (
    <div className="relative flex-1 overflow-y-auto bg-background p-4 custom-scrollbar sm:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-140px] h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-[-180px] left-[14%] h-72 w-72 rounded-full bg-badge-web/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-4xl flex-col gap-5">
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/80 shadow-2xl shadow-black/25 backdrop-blur">
          <div className="relative p-5 sm:p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Preview behavior
                </div>
                <h1 className="mt-4 text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">Cài đặt</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  Điều chỉnh trải nghiệm duyệt footage để preview nhanh, yên tĩnh và vẫn linh hoạt khi cần nghe audio.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Trạng thái</span>
                <span className="mt-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <StatusIcon className="h-4 w-4 text-primary" />
                  {previewMutedDefault ? 'Đang tắt loa mặc định' : 'Đang bật loa mặc định'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
          <label className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xl shadow-black/15 transition-colors hover:border-primary/40">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-70" />
            <div className="relative flex items-start justify-between gap-5">
              <div className="flex min-w-0 gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <StatusIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-foreground">Tắt loa mặc định khi preview video</span>
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">Mute-first</span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Video preview sẽ bắt đầu ở trạng thái tắt loa. Người dùng vẫn có thể bật loa trực tiếp trên player khi muốn nghe âm thanh.
                  </p>
                </div>
              </div>

              <div className="shrink-0 pt-1">
                <input
                  aria-label="Tắt loa mặc định khi preview video"
                  type="checkbox"
                  checked={previewMutedDefault}
                  onChange={(event) => onPreviewMutedDefaultChange(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="flex h-7 w-12 items-center rounded-full border border-border bg-secondary p-0.5 transition-colors peer-checked:border-primary/50 peer-checked:bg-primary/25">
                  <span
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-background shadow-lg transition-transform ${
                      previewMutedDefault ? 'translate-x-5 bg-primary' : 'translate-x-0 bg-muted-foreground/60'
                    }`}
                  >
                    {previewMutedDefault ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </span>
              </div>
            </div>
          </label>

          <label className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xl shadow-black/15 transition-colors hover:border-primary/40">
            <div className="absolute inset-0 bg-gradient-to-br from-badge-web/10 via-transparent to-transparent opacity-70" />
            <div className="relative flex items-start justify-between gap-5">
              <div className="flex min-w-0 gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-badge-web/25 bg-badge-web/10 text-badge-web">
                  <PanelLeftClose className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-foreground">Tự ẩn cột nguồn khi mở timeline</span>
                    <span className="rounded-full border border-badge-web/25 bg-badge-web/10 px-2 py-0.5 text-[11px] font-bold text-badge-web">Storyboard focus</span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Khi mở timeline bản dựng, cột nguồn dữ liệu bên trái sẽ được ẩn hẳn để nhường không gian dựng clip. Thu gọn timeline sẽ tự mở lại cột này.
                  </p>
                </div>
              </div>

              <div className="shrink-0 pt-1">
                <input
                  aria-label="Tự ẩn cột nguồn khi mở timeline"
                  type="checkbox"
                  checked={autoHideSourceColumnOnTimelineOpen}
                  onChange={(event) => onAutoHideSourceColumnOnTimelineOpenChange(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="flex h-7 w-12 items-center rounded-full border border-border bg-secondary p-0.5 transition-colors peer-checked:border-badge-web/50 peer-checked:bg-badge-web/25">
                  <span
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-background shadow-lg transition-transform ${
                      autoHideSourceColumnOnTimelineOpen ? 'translate-x-5 bg-badge-web' : 'translate-x-0 bg-muted-foreground/60'
                    }`}
                  >
                    {autoHideSourceColumnOnTimelineOpen ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </span>
              </div>
            </div>
          </label>
          </div>

          <aside className="rounded-2xl border border-border/80 bg-card/70 p-4">
            <div className="rounded-xl border border-border/70 bg-black/30 p-3">
              <div className="flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-primary backdrop-blur">
                  <StatusIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Preview player</span>
                <span className="text-muted-foreground">{previewMutedDefault ? 'Muted' : 'Sound on'}</span>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
