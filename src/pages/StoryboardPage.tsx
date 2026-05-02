import { useMemo } from 'react';

import { StoryboardBeatList } from '@/components/storyboard/StoryboardBeatList';
import { StoryboardInputPanel } from '@/components/storyboard/StoryboardInputPanel';
import { StoryboardPreviewPanel } from '@/components/storyboard/StoryboardPreviewPanel';
import { StoryboardSourcePicker } from '@/components/storyboard/StoryboardSourcePicker';
import type { BeatMatchView, SourceVersionView, StoryboardBeatView } from '@/components/storyboard/types';
import type { DatasetItem, SavedStoryboard, StoryboardMatch, StoryboardResult, StoryboardSource } from '@/lib/footage-app';

interface StoryboardPageProps {
  storyboardProductName: string;
  storyboardCategory: string;
  storyboardAudience: string;
  storyboardTone: string;
  storyboardBenefits: string;
  storyboardScript: string;
  storyboardSelectedVersionIds: string[];
  storyboardSources: StoryboardSource[];
  storyboardResult: StoryboardResult | null;
  savedStoryboards: SavedStoryboard[];
  selectedSavedStoryboardId: string | null;
  selectedStoryboardBeatId: string | null;
  storyboardPreviewMatch: StoryboardMatch | null;
  storyboardError: string | null;
  isGeneratingStoryboard: boolean;
  activeDataset: DatasetItem | null;
  activeDatasetUsableForStoryboard: boolean;
  trimmingScene: string | null;
  onStoryboardProductNameChange: (value: string) => void;
  onStoryboardCategoryChange: (value: string) => void;
  onStoryboardAudienceChange: (value: string) => void;
  onStoryboardToneChange: (value: string) => void;
  onStoryboardBenefitsChange: (value: string) => void;
  onStoryboardScriptChange: (value: string) => void;
  onCopyInput: () => void;
  onImportStoryboard: (rawJson: string) => void | Promise<void>;
  onSelectSavedStoryboard: (id: string) => void;
  onDeleteSavedStoryboard: (id: string) => void;
  onToggleSourceVersion: (versionId: string, checked: boolean) => void;
  onGenerateStoryboard: () => void;
  onSelectBeat: (beatId: string) => void;
  onPlayStoryboardMatch: (match: StoryboardMatch) => void;
  onTrimMatch: (match: StoryboardMatch) => void;
  onStoryboardPlayerRef: (node: HTMLVideoElement | null) => void;
  onStoryboardTimeUpdate: () => void;
}

export function StoryboardPage({
  storyboardProductName,
  storyboardCategory,
  storyboardAudience,
  storyboardTone,
  storyboardBenefits,
  storyboardScript,
  storyboardSelectedVersionIds,
  storyboardSources,
  storyboardResult,
  savedStoryboards,
  selectedSavedStoryboardId,
  selectedStoryboardBeatId,
  storyboardPreviewMatch,
  storyboardError,
  isGeneratingStoryboard,
  activeDataset,
  activeDatasetUsableForStoryboard,
  trimmingScene,
  onStoryboardProductNameChange,
  onStoryboardCategoryChange,
  onStoryboardAudienceChange,
  onStoryboardToneChange,
  onStoryboardBenefitsChange,
  onStoryboardScriptChange,
  onCopyInput,
  onImportStoryboard,
  onSelectSavedStoryboard,
  onDeleteSavedStoryboard,
  onToggleSourceVersion,
  onGenerateStoryboard,
  onSelectBeat,
  onPlayStoryboardMatch,
  onTrimMatch,
  onStoryboardPlayerRef,
  onStoryboardTimeUpdate,
}: StoryboardPageProps) {
  const sourceViews = useMemo(() => storyboardSources.map(toSourceView), [storyboardSources]);
  const beatViews = useMemo(() => toBeatViews(storyboardResult), [storyboardResult]);
  const selectedBeatView = beatViews.find((beat) => beat.id === selectedStoryboardBeatId) || null;
  const previewMatchView = storyboardPreviewMatch ? toBeatMatchView(storyboardPreviewMatch) : null;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-[360px] border-r border-border shrink-0 flex flex-col bg-card min-h-0 overflow-hidden">
          <div className="shrink-0">
            <StoryboardInputPanel
              productName={storyboardProductName}
              setProductName={onStoryboardProductNameChange}
              category={storyboardCategory}
              setCategory={onStoryboardCategoryChange}
              audience={storyboardAudience}
              setAudience={onStoryboardAudienceChange}
              tone={storyboardTone}
              setTone={onStoryboardToneChange}
              benefit={storyboardBenefits}
              setBenefit={onStoryboardBenefitsChange}
              script={storyboardScript}
              setScript={onStoryboardScriptChange}
              savedStoryboards={savedStoryboards}
              selectedStoryboardId={selectedSavedStoryboardId}
              onCopyInput={onCopyInput}
              onImportStoryboard={onImportStoryboard}
              onSelectSavedStoryboard={onSelectSavedStoryboard}
              onDeleteSavedStoryboard={onDeleteSavedStoryboard}
              isImportingStoryboard={isGeneratingStoryboard}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {activeDataset && !activeDatasetUsableForStoryboard ? (
              <div className="mx-3 mt-3 rounded-md border border-badge-web/30 bg-badge-web/10 px-3 py-2 text-xs text-badge-web">
                Dataset đang chọn chưa có version usable cho storyboard.
              </div>
            ) : null}
            <StoryboardSourcePicker
              sources={sourceViews}
              selected={new Set(storyboardSelectedVersionIds)}
              onToggle={(id) => onToggleSourceVersion(id, !storyboardSelectedVersionIds.includes(id))}
            />
          </div>
          <div className="shrink-0 border-t border-border bg-card px-3 py-2 sticky bottom-0">
            {storyboardError ? <div className="mb-2 text-xs text-badge-error">{storyboardError}</div> : null}
            <button
              onClick={onGenerateStoryboard}
              disabled={isGeneratingStoryboard || sourceViews.length === 0 || storyboardSelectedVersionIds.length === 0}
              className="w-full py-2 rounded-md text-xs font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isGeneratingStoryboard ? 'Đang tạo storyboard...' : 'Tạo storyboard'}
            </button>
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

        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background overflow-hidden">
          <StoryboardPreviewPanel
            beat={selectedBeatView}
            previewMatch={previewMatchView}
            trimmingSceneId={toTrimMatchId(selectedBeatView, storyboardPreviewMatch?.id || null, trimmingScene)}
            onPreviewMatch={(match) => onPlayStoryboardMatch(match.rawMatch)}
            onTrimMatch={(match) => onTrimMatch(match.rawMatch)}
            onPlayerRef={onStoryboardPlayerRef}
            onTimeUpdate={onStoryboardTimeUpdate}
          />
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
    version: parseVersionNumber(source.versionId),
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

function parseVersionNumber(versionId: string) {
  const match = versionId.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

function toTrimMatchId(beat: StoryboardBeatView | null, previewMatchId: string | null, trimmingScene: string | null) {
  if (!beat || !trimmingScene) return null;
  const match = beat.matches.find((item) => `${item.fileName}-${item.rawMatch.sceneIndex}` === trimmingScene);
  return match?.id || previewMatchId;
}
