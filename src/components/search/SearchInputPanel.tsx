import { SessionVideoItem } from './SessionVideoItem';
import type { SessionVideo } from './types';
import { UploadDropzone } from './UploadDropzone';

interface SearchInputPanelProps {
  productName: string;
  setProductName: (v: string) => void;
  keyword: string;
  setKeyword: (v: string) => void;
  sessionVideos: SessionVideo[];
  selectedVideoId: string | null;
  onSelectVideo: (v: SessionVideo) => void;
  onUpload: () => void;
  onAnalyze: () => void;
  canAnalyze: boolean;
  isBusy?: boolean;
}

export function SearchInputPanel({
  productName,
  setProductName,
  keyword,
  setKeyword,
  sessionVideos,
  selectedVideoId,
  onSelectVideo,
  onUpload,
  onAnalyze,
  canAnalyze,
  isBusy,
}: SearchInputPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
        <div className="space-y-2 pb-3 border-b border-border/70">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tên sản phẩm</label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="VD: Serum Vitamin C"
            className="w-full bg-muted/30 border border-border px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isBusy}
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">Gán metadata sản phẩm cho batch phân tích</p>
        </div>

        <div className="space-y-2 pb-3 border-b border-border/70">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Từ khóa tìm kiếm</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="VD: serum, before after, demo"
            className="w-full bg-muted/30 border border-border px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isBusy}
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">Để trống nếu chỉ muốn phân tích toàn bộ video</p>
        </div>

        <div className="pb-3 border-b border-border/70">
          <UploadDropzone onUpload={onUpload} disabled={isBusy} />
        </div>

        {sessionVideos.length > 0 ? (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Video trong phiên ({sessionVideos.length})
            </span>
            <div className="space-y-0.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {sessionVideos.map((video) => (
                <SessionVideoItem
                  key={video.id}
                  video={video}
                  isSelected={selectedVideoId === video.id}
                  onClick={() => onSelectVideo(video)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-3 border-t border-border shrink-0">
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze || isBusy}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {keyword.trim() ? 'Phân tích & Tìm kiếm' : 'Phân tích video'}
        </button>
      </div>
    </div>
  );
}
