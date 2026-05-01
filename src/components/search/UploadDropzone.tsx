import { Upload } from 'lucide-react';

interface UploadDropzoneProps {
  onUpload: () => void;
  disabled?: boolean;
}

export function UploadDropzone({ onUpload, disabled }: UploadDropzoneProps) {
  return (
    <button
      onClick={onUpload}
      disabled={disabled}
      className="w-full border-2 border-dashed border-border rounded-lg p-5 flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer group disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="text-center">
        <p className="text-xs font-medium text-secondary-foreground">Kéo thả hoặc click để upload</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Hỗ trợ nhiều video cùng lúc</p>
      </div>
    </button>
  );
}
