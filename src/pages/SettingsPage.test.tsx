import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('lets users choose whether preview videos start muted', () => {
    const onPreviewMutedChange = vi.fn();

    render(
      <SettingsPage
        previewMutedDefault={true}
        autoHideSourceColumnOnTimelineOpen={true}
        onPreviewMutedDefaultChange={onPreviewMutedChange}
        onAutoHideSourceColumnOnTimelineOpenChange={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Tắt loa mặc định khi preview video' });

    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(onPreviewMutedChange).toHaveBeenCalledWith(false);
  });

  it('shows the current preview audio status in a dashboard card', () => {
    render(
      <SettingsPage
        previewMutedDefault={true}
        autoHideSourceColumnOnTimelineOpen={true}
        onPreviewMutedDefaultChange={vi.fn()}
        onAutoHideSourceColumnOnTimelineOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Preview behavior')).toBeInTheDocument();
    expect(screen.getByText('Đang tắt loa mặc định')).toBeInTheDocument();
    expect(screen.getByText('Mute-first')).toBeInTheDocument();
  });

  it('lets users choose whether opening the timeline hides the source column', () => {
    const onAutoHideChange = vi.fn();

    render(
      <SettingsPage
        previewMutedDefault={true}
        autoHideSourceColumnOnTimelineOpen={true}
        onPreviewMutedDefaultChange={vi.fn()}
        onAutoHideSourceColumnOnTimelineOpenChange={onAutoHideChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Tự ẩn cột nguồn khi mở timeline' });

    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(onAutoHideChange).toHaveBeenCalledWith(false);
  });
});
