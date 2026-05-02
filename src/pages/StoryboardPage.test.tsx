import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StoryboardPage } from './StoryboardPage';

describe('StoryboardPage', () => {
  it('does not render storyboard feedback inline above the generate button', () => {
    render(
      <StoryboardPage
        storyboardProductName="Serum Vitamin C"
        storyboardCategory="Skincare"
        storyboardAudience="Nữ 20-35"
        storyboardTone="Tin cậy"
        storyboardBenefits="Sáng da"
        storyboardScript="Hook\nDemo"
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
        onStoryboardProductNameChange={vi.fn()}
        onStoryboardCategoryChange={vi.fn()}
        onStoryboardAudienceChange={vi.fn()}
        onStoryboardToneChange={vi.fn()}
        onStoryboardBenefitsChange={vi.fn()}
        onStoryboardScriptChange={vi.fn()}
        onCopyInput={vi.fn()}
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

    expect(screen.queryByText('Đã copy input vào clipboard.')).not.toBeInTheDocument();
  });
});
