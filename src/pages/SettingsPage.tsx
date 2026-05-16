import { Check, Volume2, VolumeX } from 'lucide-react';

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
    <div className="flex-1 min-h-0 overflow-y-auto bg-background p-4 custom-scrollbar sm:p-6">
      <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2.5">
          <h1 className="text-xs font-semibold text-secondary-foreground">Cài đặt</h1>
          <p className="mt-1 text-xs text-muted-foreground">Điều chỉnh trải nghiệm preview và storyboard.</p>
        </div>

        <div className="border-b border-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-white">Preview behavior</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <StatusIcon className="h-3.5 w-3.5 text-primary" />
              {previewMutedDefault ? 'Đang tắt loa mặc định' : 'Đang bật loa mặc định'}
            </span>
          </div>
        </div>

        <section>
          <SettingToggle
            title="Tắt loa mặc định khi preview video"
            description="Video preview sẽ bắt đầu ở trạng thái tắt loa. Người dùng vẫn có thể bật loa trực tiếp trên player khi muốn nghe âm thanh."
            checked={previewMutedDefault}
            onCheckedChange={onPreviewMutedDefaultChange}
          />
          <div className="h-px bg-border/80" />
          <SettingToggle
            title="Tự ẩn cột nguồn khi mở timeline"
            description="Khi mở timeline bản dựng, cột nguồn dữ liệu bên trái sẽ được ẩn hẳn để nhường không gian dựng clip. Thu gọn timeline sẽ tự mở lại cột này."
            checked={autoHideSourceColumnOnTimelineOpen}
            onCheckedChange={onAutoHideSourceColumnOnTimelineOpenChange}
          />
        </section>
      </div>
    </div>
  );
}

interface SettingToggleProps {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}

function SettingToggle({ title, description, checked, onCheckedChange }: SettingToggleProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 px-3 py-3 transition-colors hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{title}</span>
        <span className="mt-1 block max-w-xl text-xs leading-5 text-muted-foreground">{description}</span>
      </span>

      <span className="shrink-0 pt-0.5">
        <input
          aria-label={title}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="flex h-6 w-10 items-center rounded-md border border-border bg-secondary p-0.5 transition-colors peer-checked:border-primary/50 peer-checked:bg-primary/20">
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded text-background transition-transform ${
              checked ? 'translate-x-4 bg-primary' : 'translate-x-0 bg-muted-foreground/60'
            }`}
          >
            {checked ? <Check className="h-3 w-3" /> : null}
          </span>
        </span>
      </span>
    </label>
  );
}
