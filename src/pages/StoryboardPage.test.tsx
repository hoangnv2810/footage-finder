import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StoryboardPage } from './StoryboardPage';

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
            folder: { id: 12, name: 'Loa', isSystem: false },
          },
        ]}
        selectedSavedStoryboardId={null}
        selectedStoryboardBeatId={null}
        storyboardPreviewMatch={null}
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
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Loa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mic 1 video · 4 cảnh · 0 storyboard/ })).toBeInTheDocument();
    expect(screen.getByText('2 video · 12 cảnh · 2 storyboard')).toBeInTheDocument();
    expect(screen.getByText('2 video · 12 cảnh')).toBeInTheDocument();
    expect(screen.getByText(/Tạo tự động/)).toBeInTheDocument();
    expect(screen.getByText(/Import JSON/)).toBeInTheDocument();
    expect(screen.queryByText('Đã copy input vào clipboard.')).not.toBeInTheDocument();
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
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mic 1 video · 4 cảnh · 0 storyboard/ }));

    expect(onSelectStoryboardFolder).toHaveBeenCalledWith(13);
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
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Tạo storyboard' }).closest('.custom-scrollbar')).toBeNull();
    expect(container.querySelector('.custom-scrollbar .custom-scrollbar')).toBeNull();
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
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
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
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Sửa folder' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu thư mục Loa' }));
    expect(screen.getByRole('menu')).toHaveClass('min-w-[7rem]', 'p-0.5');
    expect(screen.getByRole('menuitem', { name: /Sửa/ })).toHaveClass('py-1.5', 'text-xs');
    fireEvent.click(screen.getByRole('menuitem', { name: /Sửa/ }));

    expect(onRenameStoryboardFolder).toHaveBeenCalledWith(folder);
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
        onToggleSourceVersion={vi.fn()}
        onGenerateStoryboard={vi.fn()}
        onSelectBeat={vi.fn()}
        onPlayStoryboardMatch={vi.fn()}
        onTrimMatch={vi.fn()}
        onStoryboardPlayerRef={vi.fn()}
        onStoryboardTimeUpdate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu thư mục Loa' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Xóa/ }));

    expect(onDeleteStoryboardFolder).toHaveBeenCalledWith(folder);
  });
});
