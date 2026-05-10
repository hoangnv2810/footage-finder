import { useEffect, useMemo, useRef, useState } from 'react';

import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { StoryboardBeatList } from '@/components/storyboard/StoryboardBeatList';
import { StoryboardInputPanel } from '@/components/storyboard/StoryboardInputPanel';
import { StoryboardPreviewPanel } from '@/components/storyboard/StoryboardPreviewPanel';
import { StoryboardSourcePicker } from '@/components/storyboard/StoryboardSourcePicker';
import { StoryboardTimelinePanel } from '@/components/storyboard/StoryboardTimelinePanel';
import type { BeatMatchView, SourceVersionView, StoryboardBeatView } from '@/components/storyboard/types';
import type { DatasetItem, ProductFolderSummary, SavedStoryboard, StoryboardMatch, StoryboardResult, StoryboardSource, StoryboardTimeline } from '@/lib/footage-app';

interface StoryboardPageProps {
  storyboardFolder: ProductFolderSummary | null;
  storyboardFolders: { folder: ProductFolderSummary; sourceSummary: { videoCount: number; sceneCount: number }; storyboardCount: number }[];
  storyboardSourceSummary: { videoCount: number; sceneCount: number };
  storyboardProductName: string;
  storyboardProductDescription: string;
  storyboardGender: string;
  storyboardAudience: string;
  storyboardTone: string;
  storyboardRegion: string;
  storyboardScript: string;
  storyboardSelectedVersionIds: string[];
  storyboardSources: StoryboardSource[];
  storyboardResult: StoryboardResult | null;
  savedStoryboards: SavedStoryboard[];
  selectedSavedStoryboardId: string | null;
  selectedStoryboardBeatId: string | null;
  storyboardPreviewMatch: StoryboardMatch | null;
  storyboardTimelines: StoryboardTimeline[];
  selectedStoryboardTimelineId: string | null;
  isLoadingStoryboardTimelines: boolean;
  isMutatingStoryboardTimeline: boolean;
  isExportingStoryboardTimeline: boolean;
  isGeneratingStoryboard: boolean;
  activeDataset: DatasetItem | null;
  activeDatasetUsableForStoryboard: boolean;
  trimmingScene: string | null;
  onRenameStoryboardFolder: (folder: ProductFolderSummary) => void;
  onSelectStoryboardFolder: (folder: ProductFolderSummary) => void;
  onDeleteStoryboardFolder?: (folder: ProductFolderSummary) => void;
  onStoryboardProductNameChange: (v: string) => void;
  onStoryboardProductDescriptionChange: (v: string) => void;
  onStoryboardGenderChange: (v: string) => void;
  onStoryboardAudienceChange: (v: string) => void;
  onStoryboardToneChange: (v: string) => void;
  onStoryboardRegionChange: (v: string) => void;
  onStoryboardScriptChange: (v: string) => void;
  onCopyInput: () => void;
  onCopyScriptPrompt: () => void;
  onImportStoryboard: (rawJson: string) => void | Promise<void>;
  onSelectSavedStoryboard: (id: string) => void;
  onDeleteSavedStoryboard: (id: string) => void;
  onToggleSourceVersion: (versionId: string, checked: boolean) => void;
  onGenerateStoryboard: () => void;
  onSelectBeat: (beatId: string) => void;
  onPlayStoryboardMatch: (match: StoryboardMatch) => void;
  onTrimMatch: (match: StoryboardMatch) => void;
  onCreateStoryboardTimeline: () => void;
  onSelectStoryboardTimeline: (timelineId: string) => void;
  onRenameStoryboardTimeline: (timelineId: string, name: string) => void;
  onDeleteStoryboardTimeline: (timelineId: string) => void;
  onAddStoryboardToTimeline: () => void;
  onAddMatchToTimeline: (match: StoryboardMatch) => void;
  onMoveTimelineClip: (clipId: string, direction: 'up' | 'down') => void;
  onRemoveTimelineClip: (clipId: string) => void;
  onClearTimelineClips: () => void;
  onExportStoryboardTimeline: (timelineId: string) => void;
  onStoryboardPlayerRef: (el: HTMLVideoElement | null) => void;
  onStoryboardTimeUpdate: () => void;
  onResetStoryboard: () => void;
}

export function StoryboardPage({
  storyboardFolder,
  storyboardFolders,
  storyboardSourceSummary,
  storyboardProductName,
  storyboardProductDescription,
  storyboardGender,
  storyboardAudience,
  storyboardTone,
  storyboardRegion,
  storyboardScript,
  storyboardSelectedVersionIds,
  storyboardSources,
  storyboardResult,
  savedStoryboards,
  selectedSavedStoryboardId,
  selectedStoryboardBeatId,
  storyboardPreviewMatch,
  storyboardTimelines,
  selectedStoryboardTimelineId,
  isLoadingStoryboardTimelines,
  isMutatingStoryboardTimeline,
  isExportingStoryboardTimeline,
  isGeneratingStoryboard,
  activeDataset,
  activeDatasetUsableForStoryboard,
  trimmingScene,
  onRenameStoryboardFolder,
  onSelectStoryboardFolder,
  onDeleteStoryboardFolder,
  onStoryboardProductNameChange,
  onStoryboardProductDescriptionChange,
  onStoryboardGenderChange,
  onStoryboardAudienceChange,
  onStoryboardToneChange,
  onStoryboardRegionChange,
  onStoryboardScriptChange,
  onCopyInput,
  onCopyScriptPrompt,
  onImportStoryboard,
  onSelectSavedStoryboard,
  onDeleteSavedStoryboard,
  onToggleSourceVersion,
  onGenerateStoryboard,
  onSelectBeat,
  onPlayStoryboardMatch,
  onTrimMatch,
  onCreateStoryboardTimeline,
  onSelectStoryboardTimeline,
  onRenameStoryboardTimeline,
  onDeleteStoryboardTimeline,
  onAddStoryboardToTimeline,
  onAddMatchToTimeline,
  onMoveTimelineClip,
  onRemoveTimelineClip,
  onClearTimelineClips,
  onExportStoryboardTimeline,
  onStoryboardPlayerRef,
  onStoryboardTimeUpdate,
  onResetStoryboard,
}: StoryboardPageProps) {
  const sourceViews = useMemo(() => storyboardSources.map(toSourceView), [storyboardSources]);
  const beatViews = useMemo(() => toBeatViews(storyboardResult), [storyboardResult]);
  const selectedBeatView = beatViews.find((beat) => beat.id === selectedStoryboardBeatId) || null;
  const previewMatchView = storyboardPreviewMatch ? toBeatMatchView(storyboardPreviewMatch) : null;
  const folderName = storyboardFolder?.name || 'Chưa phân loại';
  const activeFolderId = storyboardFolder?.id || null;
  const [expandedFolderId, setExpandedFolderId] = useState<number | null>(activeFolderId);
  const [folderMenuOpenId, setFolderMenuOpenId] = useState<number | null>(null);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const folderRows = storyboardFolders.length > 0
    ? storyboardFolders
    : [{ folder: storyboardFolder, sourceSummary: storyboardSourceSummary, storyboardCount: savedStoryboards.length }].filter((row): row is { folder: ProductFolderSummary; sourceSummary: { videoCount: number; sceneCount: number }; storyboardCount: number } => !!row.folder);

  useEffect(() => {
    setExpandedFolderId(activeFolderId);
  }, [activeFolderId]);

  useEffect(() => {
    if (folderMenuOpenId === null) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!folderMenuRef.current?.contains(event.target as Node)) {
        setFolderMenuOpenId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFolderMenuOpenId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [folderMenuOpenId]);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-[360px] border-r border-border shrink-0 flex flex-col bg-card min-h-0 overflow-hidden">
          <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
            {folderRows.map((row) => {
              const isActive = row.folder.id === activeFolderId;
              const isExpanded = isActive && expandedFolderId === row.folder.id;
              const summary = `${row.sourceSummary.videoCount} video · ${row.sourceSummary.sceneCount} cảnh · ${row.storyboardCount} storyboard`;
              return (
                <div key={row.folder.id} className="border-b border-border/60 last:border-b-0">
                  <div className={`flex items-center gap-1 px-3 py-2.5 transition-colors ${isActive ? 'bg-primary/5' : 'hover:bg-surface-hover'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setFolderMenuOpenId(null);
                        if (isExpanded) {
                          setExpandedFolderId(null);
                          return;
                        }
                        setExpandedFolderId(row.folder.id);
                        if (!isActive) onSelectStoryboardFolder(row.folder);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <h2 className="block truncate text-[15px] font-semibold text-white">{row.folder.name}</h2>
                        <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{summary}</span>
                      </span>
                    </button>
                    {!row.folder.isSystem ? (
                      <div ref={folderMenuOpenId === row.folder.id ? folderMenuRef : undefined} className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setFolderMenuOpenId((prev) => (prev === row.folder.id ? null : row.folder.id))}
                          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border/70 hover:bg-background hover:text-foreground"
                          aria-label={`Mở menu thư mục ${row.folder.name}`}
                          aria-haspopup="menu"
                          aria-expanded={folderMenuOpenId === row.folder.id}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {folderMenuOpenId === row.folder.id ? (
                          <div
                            role="menu"
                            className="absolute right-0 top-8 z-20 min-w-[7rem] overflow-hidden rounded-md border border-border bg-card p-0.5 shadow-sm"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setFolderMenuOpenId(null);
                                onRenameStoryboardFolder(row.folder);
                              }}
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-hover"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Sửa
                            </button>
                            {onDeleteStoryboardFolder ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setFolderMenuOpenId(null);
                                  onDeleteStoryboardFolder(row.folder);
                                }}
                                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Xóa
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {isExpanded ? (
                    <div className="border-t border-border/50">
                      <div data-testid="storyboard-source-section" className="overflow-hidden">
                        {activeDataset && !activeDatasetUsableForStoryboard ? (
                          <div className="mx-3 mt-3 rounded-md border border-badge-web/30 bg-badge-web/10 px-3 py-2 text-xs text-badge-web">
                            Dataset đang chọn chưa có version usable cho storyboard.
                          </div>
                        ) : null}
                        <div className="border-b border-border px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-white">Nguồn dữ liệu</span>
                            <span className="text-[11px] text-muted-foreground">{storyboardSourceSummary.videoCount} video · {storyboardSourceSummary.sceneCount} cảnh</span>
                          </div>
                        </div>
                        <StoryboardSourcePicker
                          sources={sourceViews}
                          selected={new Set(storyboardSelectedVersionIds)}
                          onToggle={(id) => onToggleSourceVersion(id, !storyboardSelectedVersionIds.includes(id))}
                          hideHeader
                          disableInternalScroll
                        />
                      </div>
                      <StoryboardInputPanel
                        productName={storyboardProductName}
                        setProductName={onStoryboardProductNameChange}
                        productDescription={storyboardProductDescription}
                        setProductDescription={onStoryboardProductDescriptionChange}
                        gender={storyboardGender}
                        setGender={onStoryboardGenderChange}
                        audience={storyboardAudience}
                        setAudience={onStoryboardAudienceChange}
                        tone={storyboardTone}
                        setTone={onStoryboardToneChange}
                        region={storyboardRegion}
                        setRegion={onStoryboardRegionChange}
                        script={storyboardScript}
                        setScript={onStoryboardScriptChange}
                        savedStoryboards={savedStoryboards}
                        selectedStoryboardId={selectedSavedStoryboardId}
                        folderName={folderName}
                        onCopyInput={onCopyInput}
                        onCopyScriptPrompt={onCopyScriptPrompt}
                        onImportStoryboard={onImportStoryboard}
                        onSelectSavedStoryboard={onSelectSavedStoryboard}
                        onDeleteSavedStoryboard={onDeleteSavedStoryboard}
                        isImportingStoryboard={isGeneratingStoryboard}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-border bg-card px-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onResetStoryboard}
                disabled={isGeneratingStoryboard}
                className="w-full py-2 rounded-md text-xs font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Tạo mới
              </button>
              <button
                type="button"
                onClick={onGenerateStoryboard}
                disabled={isGeneratingStoryboard || sourceViews.length === 0 || storyboardSelectedVersionIds.length === 0}
                className="w-full py-2 rounded-md text-xs font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGeneratingStoryboard ? 'Đang tạo storyboard...' : 'Tạo storyboard'}
              </button>
            </div>
          </div>
        </div>

        <div className="w-[340px] border-r border-border shrink-0 flex flex-col bg-card min-h-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border shrink-0">
            <h3 className="text-xs font-semibold text-secondary-foreground">Danh sách beat</h3>
          </div>
          <StoryboardBeatList
            beats={beatViews}
            selectedBeatId={selectedStoryboardBeatId}
            onSelectBeat={(beat) => onSelectBeat(beat.id)}
          />
        </div>

        <div className="flex-1 flex flex-col xl:flex-row min-w-0 min-h-0 bg-background overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
            <StoryboardPreviewPanel
              beat={selectedBeatView}
              previewMatch={previewMatchView}
              trimmingSceneId={toTrimMatchId(selectedBeatView, storyboardPreviewMatch?.id || null, trimmingScene)}
              onPreviewMatch={(match) => onPlayStoryboardMatch(match.rawMatch)}
              onTrimMatch={(match) => onTrimMatch(match.rawMatch)}
              onAddMatchToTimeline={(match) => onAddMatchToTimeline(match.rawMatch)}
              onPlayerRef={onStoryboardPlayerRef}
              onTimeUpdate={onStoryboardTimeUpdate}
            />
          </div>

          <div className="h-[280px] w-full shrink-0 border-t border-border bg-card p-2 min-h-0 overflow-hidden xl:h-auto xl:w-[300px] xl:border-l xl:border-t-0 xl:p-3 2xl:w-[340px]">
            <StoryboardTimelinePanel
              canUseTimeline={!!selectedSavedStoryboardId}
              timelines={storyboardTimelines}
              selectedTimelineId={selectedStoryboardTimelineId}
              isLoading={isLoadingStoryboardTimelines}
              isSaving={isMutatingStoryboardTimeline}
              isExporting={isExportingStoryboardTimeline}
              onCreateTimeline={onCreateStoryboardTimeline}
              onSelectTimeline={onSelectStoryboardTimeline}
              onRenameTimeline={onRenameStoryboardTimeline}
              onDeleteTimeline={onDeleteStoryboardTimeline}
              onAddStoryboard={onAddStoryboardToTimeline}
              onMoveClip={onMoveTimelineClip}
              onRemoveClip={onRemoveTimelineClip}
              onClearClips={onClearTimelineClips}
              onExport={onExportStoryboardTimeline}
            />
          </div>
        </div>
      </div>
  );
}

function toSourceView(source: StoryboardSource): SourceVersionView {
  return {
    id: source.versionId,
    videoFileName: source.fileName,
    productName: source.productName,
    source: source.source === 'extension' ? 'Extension' : 'Web',
    version: source.versionNumber,
    sceneCount: source.sceneCount,
    usable: source.sceneCount > 0,
  };
}

function toBeatViews(result: StoryboardResult | null): StoryboardBeatView[] {
  if (!result) return [];
  return result.beats.map((beat, index) => ({
    id: beat.id,
    number: index + 1,
    label: beat.label,
    text: beat.text,
    durationHint: beat.durationHint ? `${beat.durationHint}s` : '',
    matches: result.beatMatches.find((group) => group.beatId === beat.id)?.matches.map(toBeatMatchView) || [],
  }));
}

function toBeatMatchView(match: StoryboardMatch): BeatMatchView {
  return {
    id: match.id,
    fileName: match.fileName,
    sceneStart: match.scene.start,
    sceneEnd: match.scene.end,
    score: match.score,
    matchReason: match.matchReason,
    usageType: match.usageType,
    sceneDescription: match.scene.description,
    mood: match.scene.mood || '',
    shotType: match.scene.shot_type || '',
    rawMatch: match,
  };
}

function toTrimMatchId(beat: StoryboardBeatView | null, previewMatchId: string | null, trimmingScene: string | null) {
  if (!beat || !trimmingScene) return null;
  const match = beat.matches.find((item) => `${item.fileName}-${item.rawMatch.sceneIndex}` === trimmingScene);
  return match?.id || previewMatchId;
}
