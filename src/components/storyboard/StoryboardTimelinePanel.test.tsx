import { fireEvent, render, screen, within } from '@testing-library/react';
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
    isCollapsed: false,
    onToggleCollapsed: vi.fn(),
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

    expect(screen.getAllByText('Bản dựng chính').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 clip · 0:03').length).toBeGreaterThan(0);
    expect(screen.getByTestId('timeline-panel-header')).not.toHaveTextContent('1 clip · 0:03');
    expect(screen.getByTestId('timeline-row-timeline-1')).toHaveTextContent('1 clip · 0:03');
    expect(screen.getByText('Hook')).toBeInTheDocument();
    expect(screen.queryByText('hook-demo.mp4')).not.toBeInTheDocument();
    expect(screen.getByText('0:01 - 0:04')).toBeInTheDocument();

    const clipItem = screen.getByTestId('timeline-clip-item-clip-1');
    expect(clipItem).toHaveClass('rounded-md', 'border', 'border-border/60', 'bg-background/25', 'px-2.5', 'py-2');
    expect(clipItem).not.toHaveClass('border-l-primary/60');
    expect(screen.getByTestId('timeline-clip-title-row-clip-1')).toContainElement(screen.getByRole('button', { name: 'Đưa Hook lên' }));
    expect(screen.getByTestId('timeline-clip-index-clip-1')).toHaveClass('rounded', 'border', 'border-primary/30', 'bg-primary/10', 'text-primary');
    expect(screen.getByTestId('timeline-clip-index-clip-1')).not.toHaveClass('rounded-full');
    expect(screen.getByTestId('timeline-clip-time-clip-1')).toHaveClass('rounded', 'bg-secondary/50', 'px-1.5', 'py-0.5');
    expect(screen.getByTestId('timeline-clip-time-clip-1')).not.toHaveClass('rounded-full');
    expect(screen.getByRole('button', { name: 'Đưa Hook lên' })).toHaveClass('h-6', 'w-6');
  });

  it('creates a named timeline from the modal and can request quick creation', () => {
    const onCreateTimeline = vi.fn();
    renderPanel({ onCreateTimeline });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản dựng' }));

    expect(screen.getByRole('dialog')).toHaveClass('rounded-md', 'border-border', 'bg-card', 'p-0');
    expect(screen.getByRole('heading', { name: 'Tạo bản dựng' })).toHaveClass('text-base', 'font-semibold');
    expect(screen.queryByText('Đặt tên bản dựng mới trước khi đưa clip vào timeline.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tên bản dựng'), { target: { value: 'Bản dựng UGC' } });
    const quickCreateCheckbox = screen.getByLabelText('Tạo nhanh từ storyboard');
    expect(quickCreateCheckbox).toHaveClass('accent-primary', 'bg-background');
    fireEvent.click(quickCreateCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    expect(onCreateTimeline).toHaveBeenCalledWith('Bản dựng UGC', true);
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

    expect(screen.getAllByText('1 clip · 0:03').length).toBeGreaterThan(0);
    expect(screen.getByText('Hook')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xuất clip rời (.zip)' }));

    expect(onExport).toHaveBeenCalledWith('timeline-1');
  });

  it('disables export when selected timeline has no clips', () => {
    renderPanel({ timelines: [emptyTimeline], selectedTimelineId: 'timeline-empty' });

    expect(screen.getByRole('button', { name: 'Xuất clip rời (.zip)' })).toBeDisabled();
  });

  it('moves clips from action buttons and confirms before removing', () => {
    const onMoveClip = vi.fn();
    const onRemoveClip = vi.fn();
    renderPanel({ onMoveClip, onRemoveClip });

    fireEvent.click(screen.getByRole('button', { name: 'Đưa Hook xuống' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Hook khỏi timeline' }));

    expect(onMoveClip).toHaveBeenCalledWith('clip-1', 'down');
    expect(onRemoveClip).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Xóa clip khỏi timeline' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Bạn muốn xóa clip Hook khỏi timeline?');
    expect(screen.getByText(/Clip này chỉ bị xóa khỏi bản dựng/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(onRemoveClip).toHaveBeenCalledWith('clip-1');
  });

  it('does not remove a clip when cancelling the remove confirmation', () => {
    const onRemoveClip = vi.fn();
    renderPanel({ onRemoveClip });

    fireEvent.click(screen.getByRole('button', { name: 'Xoá Hook khỏi timeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onRemoveClip).not.toHaveBeenCalled();
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

    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản dựng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo nhanh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đưa Hook xuống' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Hook khỏi timeline' }));

    expect(onCreateTimeline).not.toHaveBeenCalled();
    expect(onAddStoryboard).not.toHaveBeenCalled();
    expect(onMoveClip).not.toHaveBeenCalled();
    expect(onRemoveClip).not.toHaveBeenCalled();
  });

  it('renames bulk actions for the vertical build flow', () => {
    const onAddStoryboard = vi.fn();
    const onClearClips = vi.fn();
    renderPanel({ onAddStoryboard, onClearClips });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo nhanh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));

    expect(screen.queryByRole('button', { name: 'Đưa storyboard vào timeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá hết' })).not.toBeInTheDocument();
    expect(onAddStoryboard).toHaveBeenCalledTimes(1);
    expect(onClearClips).toHaveBeenCalledTimes(1);
  });

  it('shows selected timeline actions as a compact toolbar without duplicating the selected row', () => {
    renderPanel();

    const selectedRow = screen.getByTestId('selected-timeline-actions-row');
    const actionLabel = screen.getByText('Thao tác');

    expect(selectedRow).toHaveTextContent('Thao tác');
    expect(selectedRow).not.toHaveTextContent('Bản dựng chính');
    expect(selectedRow).not.toHaveTextContent('1 clip · 0:03');
    expect(actionLabel).not.toHaveClass('uppercase', 'tracking-[0.16em]');
    expect(selectedRow).toContainElement(screen.getByRole('button', { name: 'Tạo nhanh' }));
    expect(selectedRow).toContainElement(screen.getByRole('button', { name: 'Làm mới' }));
    expect(screen.queryByText('Timeline đang chọn')).not.toBeInTheDocument();
  });

  it('highlights the selected build version row', () => {
    renderPanel();

    const selectedBuild = screen.getByTestId('timeline-row-timeline-1');

    expect(selectedBuild).toHaveClass('bg-primary/15', 'border-l-primary', 'ring-primary/20');
  });

  it('uses right-facing chevron when the build list is collapsed', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Danh sách bản dựng/ }));

    expect(screen.getByTestId('timeline-list-collapsed-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-list-up-icon')).not.toBeInTheDocument();
  });

  it('uses concise edit label in the timeline action menu', () => {
    renderPanel();

    const menuButton = screen.getByRole('button', { name: 'Mở menu bản dựng Bản dựng chính' });
    expect(menuButton).toHaveClass('cursor-pointer');
    expect(menuButton).not.toHaveClass('hover:bg-background', 'hover:border-border/70', 'hover:text-foreground');
    menuButton.focus();
    fireEvent.keyDown(menuButton, { key: 'Enter' });

    const menu = screen.getByRole('menu');
    const editItem = screen.getByRole('menuitem', { name: 'Sửa' });
    const deleteItem = screen.getByRole('menuitem', { name: 'Xóa' });

    expect(menu).toHaveClass('min-w-[7rem]', 'p-0.5');
    expect(editItem).toHaveClass('gap-1.5', 'rounded', 'px-2', 'py-1.5', 'text-xs');
    expect(deleteItem).toHaveClass('gap-1.5', 'rounded', 'px-2', 'py-1.5', 'text-xs', 'hover:bg-destructive/10');
    expect(editItem.querySelector('svg')).toHaveClass('h-3.5', 'w-3.5');
    expect(screen.queryByRole('menuitem', { name: 'Sửa tên' })).not.toBeInTheDocument();
  });

  it('rename dialog matches create dialog format', () => {
    const onRenameTimeline = vi.fn();
    renderPanel({ onRenameTimeline });

    // Open rename dialog via test trigger (Radix DropdownMenu portal doesn't work in jsdom)
    fireEvent.click(screen.getByTestId('rename-trigger-timeline-1'));

    const dialog = screen.getByRole('dialog');

    // Same container classes as create dialog
    expect(dialog).toHaveClass('overflow-hidden', 'rounded-md', 'border-border', 'bg-card', 'p-0');

    // Title matches create dialog style
    expect(screen.getByRole('heading', { name: 'Sửa tên bản dựng' })).toHaveClass('text-base', 'font-semibold');
    expect(dialog.querySelector('[data-slot="timeline-dialog-header"]')).toHaveClass('border-b', 'border-border', 'px-4', 'py-2');
    expect(dialog.querySelector('[data-slot="timeline-dialog-body"]')).toHaveClass('px-4', 'py-2');
    expect(dialog.querySelector('[data-slot="timeline-dialog-footer"]')).toHaveClass('px-4', 'pb-2', 'pt-1');

    // No description text
    expect(screen.queryByText('Đổi tên để phân biệt các version dựng khác nhau.')).not.toBeInTheDocument();

    // Submit rename
    fireEvent.change(screen.getByLabelText('Tên bản dựng'), { target: { value: 'Tên mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onRenameTimeline).toHaveBeenCalledWith('timeline-1', 'Tên mới');
  });

  it('shows a confirmation popup before deleting a timeline', () => {
    const onDeleteTimeline = vi.fn();
    renderPanel({ onDeleteTimeline });

    // Open delete confirmation via test trigger
    fireEvent.click(screen.getByTestId('delete-trigger-timeline-1'));

    // Confirmation dialog should appear
    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveClass('overflow-hidden', 'rounded-md', 'border-border', 'bg-card', 'p-0');
    expect(screen.getByRole('heading', { name: 'Xóa bản dựng' })).toHaveClass('text-base', 'font-semibold');
    expect(dialog.querySelector('[data-slot="timeline-dialog-header"]')).toHaveClass('border-b', 'border-border', 'px-4', 'py-2');
    expect(dialog.querySelector('[data-slot="timeline-dialog-body"]')).toHaveClass('space-y-2', 'px-4', 'py-2', 'text-sm');
    expect(screen.getByText(/Tất cả clip trong bản dựng này/)).toBeInTheDocument();
    const { getByText } = within(dialog);
    expect(getByText(/Bản dựng chính/)).toBeInTheDocument();

    // Not deleted yet
    expect(onDeleteTimeline).not.toHaveBeenCalled();

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(onDeleteTimeline).toHaveBeenCalledWith('timeline-1');
  });

  it('does not delete when cancelling the confirmation popup', () => {
    const onDeleteTimeline = vi.fn();
    renderPanel({ onDeleteTimeline });

    // Open delete confirmation via test trigger
    fireEvent.click(screen.getByTestId('delete-trigger-timeline-1'));

    // Cancel via Hủy button
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onDeleteTimeline).not.toHaveBeenCalled();
  });

  it('renders a compact vertical rail when collapsed', () => {
    const onToggleCollapsed = vi.fn();
    renderPanel({ isCollapsed: true, onToggleCollapsed });

    expect(screen.getByRole('button', { name: 'Mở timeline bản dựng' })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xuất clip rời (.zip)' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở timeline bản dựng' }));

    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
