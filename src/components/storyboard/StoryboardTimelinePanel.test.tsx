import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StoryboardTimeline } from '@/lib/footage-app';

import { StoryboardTimelinePanel } from './StoryboardTimelinePanel';

const timelineWithClip: StoryboardTimeline = {
  id: 'timeline-1',
  storyboardId: 'storyboard-1',
  name: 'Bản dựng chính',
  position: 0,
  createdAt: Date.UTC(2026, 4, 9, 8, 0),
  updatedAt: Date.UTC(2026, 4, 9, 8, 5),
  clips: [
    {
      id: 'clip-1',
      timelineId: 'timeline-1',
      beatId: 'beat-1',
      label: 'Hook',
      filename: 'hook-demo.mp4',
      start: 1,
      end: 4,
      sceneIndex: 2,
      position: 0,
      createdAt: Date.UTC(2026, 4, 9, 8, 1),
      updatedAt: Date.UTC(2026, 4, 9, 8, 1),
    },
  ],
};

const emptyTimeline: StoryboardTimeline = {
  ...timelineWithClip,
  id: 'timeline-empty',
  name: 'Bản dựng trống',
  clips: [],
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof StoryboardTimelinePanel>> = {}) => {
  const props: React.ComponentProps<typeof StoryboardTimelinePanel> = {
    canUseTimeline: true,
    timelines: [timelineWithClip],
    selectedTimelineId: 'timeline-1',
    isLoading: false,
    isSaving: false,
    isExporting: false,
    onCreateTimeline: vi.fn(),
    onSelectTimeline: vi.fn(),
    onRenameTimeline: vi.fn(),
    onDeleteTimeline: vi.fn(),
    onAddStoryboard: vi.fn(),
    onMoveClip: vi.fn(),
    onRemoveClip: vi.fn(),
    onClearClips: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };

  render(<StoryboardTimelinePanel {...props} />);

  return props;
};

describe('StoryboardTimelinePanel', () => {
  it('shows a save prompt when storyboard cannot use timeline', () => {
    renderPanel({ canUseTimeline: false, timelines: [], selectedTimelineId: null });

    expect(screen.getByText('Lưu storyboard để tạo bản dựng')).toBeInTheDocument();
  });

  it('renders selected timeline clips and total duration', () => {
    renderPanel();

    expect(screen.getByText('Bản dựng chính')).toBeInTheDocument();
    expect(screen.getByText('1 clip · 0:03')).toBeInTheDocument();
    expect(screen.getByText('Hook')).toBeInTheDocument();
    expect(screen.getByText('hook-demo.mp4')).toBeInTheDocument();
    expect(screen.getByText('0:01 - 0:04')).toBeInTheDocument();
  });

  it("calls export with the selected non-empty timeline", () => {
    const onExport = vi.fn();
    renderPanel({ onExport });

    fireEvent.click(screen.getByRole('button', { name: 'Xuất clip rời (.zip)' }));

    expect(onExport).toHaveBeenCalledWith('timeline-1');
  });

  it('falls back to the first timeline when selected timeline id is missing', () => {
    const onExport = vi.fn();
    renderPanel({ selectedTimelineId: null, onExport });

    expect(screen.getByText('1 clip · 0:03')).toBeInTheDocument();
    expect(screen.getByText('Hook')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xuất clip rời (.zip)' }));

    expect(onExport).toHaveBeenCalledWith('timeline-1');
  });

  it('disables export when selected timeline has no clips', () => {
    renderPanel({ timelines: [emptyTimeline], selectedTimelineId: 'timeline-empty' });

    expect(screen.getByRole('button', { name: 'Xuất clip rời (.zip)' })).toBeDisabled();
  });

  it('moves and removes clips from action buttons', () => {
    const onMoveClip = vi.fn();
    const onRemoveClip = vi.fn();
    renderPanel({ onMoveClip, onRemoveClip });

    fireEvent.click(screen.getByRole('button', { name: 'Đưa Hook xuống' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Hook khỏi timeline' }));

    expect(onMoveClip).toHaveBeenCalledWith('clip-1', 'down');
    expect(onRemoveClip).toHaveBeenCalledWith('clip-1');
  });

  it('disables timeline mutations while saving', () => {
    const onCreateTimeline = vi.fn();
    const onAddStoryboard = vi.fn();
    const onMoveClip = vi.fn();
    const onRemoveClip = vi.fn();

    renderPanel({
      isSaving: true,
      onCreateTimeline,
      onAddStoryboard,
      onMoveClip,
      onRemoveClip,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản dựng mới' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đưa storyboard vào timeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đưa Hook xuống' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Hook khỏi timeline' }));

    expect(onCreateTimeline).not.toHaveBeenCalled();
    expect(onAddStoryboard).not.toHaveBeenCalled();
    expect(onMoveClip).not.toHaveBeenCalled();
    expect(onRemoveClip).not.toHaveBeenCalled();
  });
});
