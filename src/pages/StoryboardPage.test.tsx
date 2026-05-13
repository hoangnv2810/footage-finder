import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StoryboardMatch, StoryboardResult } from '@/lib/footage-app';

import { StoryboardPage } from './StoryboardPage';

const storyboardTimelineProps = {
  storyboardTimelines: [],
  selectedStoryboardTimelineId: null,
  isLoadingStoryboardTimelines: false,
  isMutatingStoryboardTimeline: false,
  isExportingStoryboardTimeline: false,
  onCreateStoryboardTimeline: vi.fn(),
  onSelectStoryboardTimeline: vi.fn(),
  onRenameStoryboardTimeline: vi.fn(),
  onDeleteStoryboardTimeline: vi.fn(),
  onAddStoryboardToTimeline: vi.fn(),
  onAddMatchToTimeline: vi.fn(),
  onMoveTimelineClip: vi.fn(),
  onRemoveTimelineClip: vi.fn(),
  onClearTimelineClips: vi.fn(),
  onExportStoryboardTimeline: vi.fn(),
};

describe('StoryboardPage', () => {
  it('renders compact folder context, source summary, and storyboard source badges', () => {
    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 2, sceneCount: 12 }, storyboardCount: 2 },
          { folder: { id: 13, name: 'Mic', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 2, sceneCount: 12 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Serum Vitamin C"
        storyboardGender="Skincare"
        storyboardAudience="Nữ 20-35"
        storyboardTone="Tin cậy"
        storyboardRegion="Sáng da"
        storyboardScript="Hook\nDemo"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[
          {
            id: 'storyboard-auto',
            createdAt: Date.UTC(2026, 3, 19, 10, 30),
            updatedAt: Date.UTC(2026, 3, 19, 10, 45),
            productName: 'Loa',
            productDescription: 'Mô tả loa',
            category: 'Audio',
            targetAudience: '',
            tone: 'Tin cậy',
            keyBenefits: '',
            scriptText: 'Hook',
            selectedVersionIds: [],
            candidateSnapshot: [],
            source: 'generated',
            beatCount: 6,
            importedModel: '',
            folder: { id: 12, name: 'Loa', isSystem: false },
          },
          {
            id: 'storyboard-import',
            createdAt: Date.UTC(2026, 3, 19, 11, 30),
            updatedAt: Date.UTC(2026, 3, 19, 11, 45),
            productName: 'Loa',
            productDescription: 'Mô tả loa',
            category: 'Audio',
            targetAudience: '',
            tone: 'Trẻ trung',
            keyBenefits: '',
            scriptText: 'Hook',
            selectedVersionIds: [],
            candidateSnapshot: [],
            source: 'imported',
            beatCount: 5,
            importedModel: 'gpt-4o',
            folder: { id: 12, name: 'Loa', isSystem: false },
          },
        ]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Loa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mic 1 video · 4 cảnh · 0 storyboard/ })).toBeInTheDocument();
    expect(screen.getByText('2 video · 12 cảnh · 2 storyboard')).toBeInTheDocument();
    expect(screen.getByText('2 video · 12 cảnh')).toBeInTheDocument();
    expect(screen.getByText(/Tạo tự động/)).toBeInTheDocument();
    expect(screen.getByText(/Import JSON/)).toBeInTheDocument();
    expect(screen.queryByText('Đã copy input vào clipboard.')).not.toBeInTheDocument();
    expect(screen.getByTestId('storyboard-timeline-slot')).toHaveClass('h-12');
  });

  it('selects another folder from the collapsible folder list', () => {
    const onSelectStoryboardFolder = vi.fn();

    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 2, sceneCount: 12 }, storyboardCount: 2 },
          { folder: { id: 13, name: 'Mic', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 2, sceneCount: 12 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={onSelectStoryboardFolder}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mic 1 video · 4 cảnh · 0 storyboard/ }));

    expect(onSelectStoryboardFolder).toHaveBeenCalledWith({ id: 13, name: 'Mic', isSystem: false });
  });

  it('keeps the generate button outside the scrollable folder accordion', () => {
    const { container } = render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 1, sceneCount: 4 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={['v1']}
        storyboardSources={[
          {
            datasetId: 'video-1',
            folderId: 12,
            fileName: 'loa.mp4',
            productName: 'Loa',
            versionId: 'v1',
            versionNumber: 1,
            sceneCount: 4,
            timestamp: Date.UTC(2026, 3, 19, 10, 30),
            source: 'web',
          },
        ]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Tạo storyboard' }).closest('.custom-scrollbar')).toBeNull();
    expect(container.querySelector('.custom-scrollbar .custom-scrollbar')).toBeNull();
  });

  it('orders expanded folder content as source, info, saved storyboards, then import actions', () => {
    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 1 },
        ]}
        storyboardSourceSummary={{ videoCount: 1, sceneCount: 4 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    const source = screen.getByText('Nguồn dữ liệu');
    const info = screen.getByText('Thông tin & Kịch bản');
    const saved = screen.getByText('Storyboard đã lưu');
    const copy = screen.getByRole('button', { name: 'Copy input' });
    const importButton = screen.getByRole('button', { name: 'Import storyboard' });

    expect(source.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(info.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(saved.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(copy.compareDocumentPosition(importButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lets the source data section shrink to content when source groups collapse', () => {
    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 1, sceneCount: 4 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    const sourceSection = screen.getByText('Nguồn dữ liệu').closest('[data-testid="storyboard-source-section"]');

    expect(sourceSection).toBeInTheDocument();
    expect(sourceSection).not.toHaveClass('min-h-[220px]', 'flex', 'flex-col');
  });

  it('uses the explicit storyboard source version number instead of parsing the random version id', () => {
    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 1, sceneCount: 4 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={['version:abc987654321']}
        storyboardSources={[
          {
            datasetId: 'video-1',
            folderId: 12,
            fileName: 'loa.mp4',
            productName: 'Loa',
            versionId: 'version:abc987654321',
            versionNumber: 2,
            sceneCount: 4,
            timestamp: Date.UTC(2026, 3, 19, 10, 30),
            source: 'web',
          },
        ]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.queryByText('v987654321')).not.toBeInTheDocument();
  });

  it('collapses the active folder when clicking its header again', () => {
    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 2, sceneCount: 12 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 2, sceneCount: 12 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    expect(screen.getByText('Nguồn dữ liệu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Loa 2 video · 12 cảnh · 0 storyboard/ }));

    expect(screen.queryByText('Nguồn dữ liệu')).not.toBeInTheDocument();
  });

  it('opens folder rename from a three-dot menu in the folder header', () => {
    const onRenameStoryboardFolder = vi.fn();
    const folder = { id: 12, name: 'Loa', isSystem: false };

    render(
      <StoryboardPage
        storyboardFolder={folder}
        storyboardFolders={[
          { folder, sourceSummary: { videoCount: 2, sceneCount: 12 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 2, sceneCount: 12 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={onRenameStoryboardFolder}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Sửa folder' })).not.toBeInTheDocument();

    const folderMenuButton = screen.getByRole('button', { name: 'Mở menu thư mục Loa' });
    expect(folderMenuButton).toHaveClass('cursor-pointer');
    expect(folderMenuButton).not.toHaveClass('hover:bg-background', 'hover:border-border/70', 'hover:text-foreground');
    fireEvent.click(folderMenuButton);
    expect(screen.getByRole('menu')).toHaveClass('min-w-[7rem]', 'p-0.5');
    expect(screen.getByRole('menuitem', { name: /Sửa/ })).toHaveClass('py-1.5', 'text-xs');
    fireEvent.click(screen.getByRole('menuitem', { name: /Sửa/ }));

    expect(onRenameStoryboardFolder).toHaveBeenCalledWith(folder);
  });

  it('renders both "Tạo mới" and "Tạo storyboard" buttons in the footer and handles reset action', () => {
    const onResetStoryboard = vi.fn();
    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 1, sceneCount: 4 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={onResetStoryboard}
      />,
    );

    const resetButton = screen.getByRole('button', { name: 'Tạo mới' });
    const generateButton = screen.getByRole('button', { name: 'Tạo storyboard' });

    expect(resetButton).toBeInTheDocument();
    expect(generateButton).toBeInTheDocument();
    
    expect(resetButton).not.toBeDisabled();

    fireEvent.click(resetButton);
    expect(onResetStoryboard).toHaveBeenCalledTimes(1);
  });

  it('keeps the folder expand chevron vertically centered in the header row', () => {
    const folder = { id: 12, name: 'Loa', isSystem: false };

    render(
      <StoryboardPage
        storyboardFolder={folder}
        storyboardFolders={[
          { folder, sourceSummary: { videoCount: 2, sceneCount: 12 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 2, sceneCount: 12 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    const folderButton = screen.getByRole('button', { name: /Loa 2 video · 12 cảnh · 0 storyboard/ });
    expect(folderButton).toHaveClass('items-center');

    const chevron = folderButton.querySelector('svg');
    expect(chevron).toHaveClass('h-4', 'w-4', 'shrink-0', 'text-muted-foreground');
    expect(chevron).not.toHaveClass('mt-0.5');

    const summary = screen.getByText('2 video · 12 cảnh · 0 storyboard');
    expect(summary).toHaveClass('text-xs', 'font-medium');
    expect(summary).not.toHaveClass('text-[11px]');
  });

  it('uses the product folder title typography scale', () => {
    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 2, sceneCount: 12 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 2, sceneCount: 12 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Loa' })).toHaveClass('text-[15px]', 'font-semibold');
    expect(screen.getByText('Nguồn dữ liệu')).toHaveClass('text-[13px]', 'font-semibold');
  });

  it('opens folder delete from the three-dot menu in the folder header', () => {
    const onDeleteStoryboardFolder = vi.fn();
    const folder = { id: 12, name: 'Loa', isSystem: false };

    render(
      <StoryboardPage
        storyboardFolder={folder}
        storyboardFolders={[
          { folder, sourceSummary: { videoCount: 2, sceneCount: 12 }, storyboardCount: 0 },
        ]}
        storyboardSourceSummary={{ videoCount: 2, sceneCount: 12 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={null}
        savedStoryboards={[]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onDeleteStoryboardFolder={onDeleteStoryboardFolder}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu thư mục Loa' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Xóa/ }));

    expect(onDeleteStoryboardFolder).toHaveBeenCalledWith(folder);
  });

  it('forwards the raw storyboard match when adding a preview match to the timeline', () => {
    const onAddMatchToTimeline = vi.fn();
    const match: StoryboardMatch = {
      id: 'match-raw-1',
      beatId: 'beat-1',
      videoVersionId: 'version-1',
      fileName: 'hook-demo.mp4',
      sceneIndex: 3,
      score: 92,
      matchReason: 'Khớp hook mở đầu',
      usageType: 'direct_product',
      scene: {
        keyword: 'hook',
        start: 4,
        end: 8,
        description: 'Cận cảnh sản phẩm trong bối cảnh sáng',
        mood: 'Sáng',
        shot_type: 'Close-up',
      },
    };
    const storyboardResult: StoryboardResult = {
      beats: [
        {
          id: 'beat-1',
          label: 'Hook',
          text: 'Mở đầu bằng sản phẩm',
          intent: 'Thu hút sự chú ý',
          desiredVisuals: 'Cận cảnh sản phẩm',
          durationHint: 4,
          position: 0,
        },
      ],
      beatMatches: [{ beatId: 'beat-1', matches: [match] }],
      models: {
        video_analysis_model: 'qwen3.6-plus',
        script_planning_model: 'qwen3.6-plus',
        scene_matching_model: 'qwen3.6-plus',
      },
    };

    render(
      <StoryboardPage
        storyboardFolder={{ id: 12, name: 'Loa', isSystem: false }}
        storyboardFolders={[
          { folder: { id: 12, name: 'Loa', isSystem: false }, sourceSummary: { videoCount: 1, sceneCount: 4 }, storyboardCount: 1 },
        ]}
        storyboardSourceSummary={{ videoCount: 1, sceneCount: 4 }}
        storyboardProductDescription="Mô tả sản phẩm"
        storyboardProductName="Loa"
        storyboardGender="Audio"
        storyboardAudience=""
        storyboardTone=""
        storyboardRegion=""
        storyboardScript="Hook"
        storyboardSelectedVersionIds={[]}
        storyboardSources={[]}
        storyboardResult={storyboardResult}
        savedStoryboards={[]}
        selectedSavedStoryboardId="storyboard-1"
        selectedStoryboardBeatId="beat-1"
        storyboardPreviewMatch={null}
        {...storyboardTimelineProps}
        isGeneratingStoryboard={false}
        activeDataset={null}
        activeDatasetUsableForStoryboard
        trimmingScene={null}
        onRenameStoryboardFolder={vi.fn()}
        onSelectStoryboardFolder={vi.fn()}
        onStoryboardProductDescriptionChange={vi.fn()}
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardGenderChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardRegionChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        onRenameSavedStoryboard={vi.fn()}
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onAddMatchToTimeline={onAddMatchToTimeline}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
        onResetStoryboard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào timeline' }));

    expect(onAddMatchToTimeline).toHaveBeenCalledTimes(1);
    expect(onAddMatchToTimeline).toHaveBeenCalledWith(match);
  });
});
