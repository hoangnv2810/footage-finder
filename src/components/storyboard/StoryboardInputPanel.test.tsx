import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SavedStoryboard } from '@/lib/footage-app';

import { StoryboardInputPanel } from './StoryboardInputPanel';

const savedStoryboard: SavedStoryboard = {
  id: 'storyboard-1',
  createdAt: Date.UTC(2026, 3, 19, 10, 30),
  updatedAt: Date.UTC(2026, 3, 19, 10, 45),
  productName: 'Serum Vitamin C',
  productDescription: 'Serum sáng da mờ thâm',
  category: 'Skincare',
  targetAudience: 'Nữ 20-35',
  tone: 'Tin cậy',
  keyBenefits: 'Sáng da',
  scriptText: 'Hook\nDemo',
  selectedVersionIds: ['version-1'],
  candidateSnapshot: [],
  source: 'imported',
  beatCount: 3,
};

describe('StoryboardInputPanel', () => {
  it('renders saved controls and submits imported storyboard JSON', async () => {
    const onCopyInput = vi.fn();
    const onImportStoryboard = vi.fn().mockResolvedValue(undefined);
    const onSelectSavedStoryboard = vi.fn();
    const onDeleteSavedStoryboard = vi.fn();

    render(
      <StoryboardInputPanel
        productName="Serum Vitamin C"
        setProductName={vi.fn()}
        productDescription="Serum sáng da mờ thâm"
        setProductDescription={vi.fn()}
        gender="Skincare"
        setGender={vi.fn()}
        audience="Nữ 20-35"
        setAudience={vi.fn()}
        tone="Tin cậy"
        setTone={vi.fn()}
        region="Sáng da"
        setRegion={vi.fn()}
        script="Hook\nDemo"
        setScript={vi.fn()}
        savedStoryboards={[savedStoryboard]}
        selectedStoryboardId="storyboard-1"
        folderName="Loa"
        onCopyInput={onCopyInput}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={onImportStoryboard}
        onSelectSavedStoryboard={onSelectSavedStoryboard}
        onDeleteSavedStoryboard={onDeleteSavedStoryboard}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import storyboard JSON' })).toBeInTheDocument();
    expect(screen.getByText('Storyboard đã lưu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Serum Vitamin C 3 beat/ })).toBeInTheDocument();
    expect(screen.getByText(/3 beat/)).toBeInTheDocument();
    expect(screen.getByText(/Import JSON/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy input' }));
    expect(onCopyInput).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Serum Vitamin C 3 beat/ }));
    expect(onSelectSavedStoryboard).toHaveBeenCalledWith('storyboard-1');

    fireEvent.click(screen.getByRole('button', { name: 'Import storyboard JSON' }));
    fireEvent.change(screen.getByLabelText('JSON storyboard'), { target: { value: '{"beats":[]}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nhập JSON' }));

    await waitFor(() => expect(onImportStoryboard).toHaveBeenCalledWith('{"beats":[]}'));

    fireEvent.click(screen.getByRole('button', { name: 'Xóa storyboard Serum Vitamin C' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Xóa storyboard đã lưu?')).toBeInTheDocument();
    expect(onDeleteSavedStoryboard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(onDeleteSavedStoryboard).toHaveBeenCalledWith('storyboard-1');
  });

  it('does not delete a saved storyboard when confirmation is cancelled', () => {
    const onDeleteSavedStoryboard = vi.fn();

    render(
      <StoryboardInputPanel
        productName="Serum Vitamin C"
        setProductName={vi.fn()}
        productDescription="Serum sáng da mờ thâm"
        setProductDescription={vi.fn()}
        gender="Skincare"
        setGender={vi.fn()}
        audience="Nữ 20-35"
        setAudience={vi.fn()}
        tone="Tin cậy"
        setTone={vi.fn()}
        region="Sáng da"
        setRegion={vi.fn()}
        script="Hook\nDemo"
        setScript={vi.fn()}
        savedStoryboards={[savedStoryboard]}
        selectedStoryboardId="storyboard-1"
        folderName="Loa"
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={onDeleteSavedStoryboard}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xóa storyboard Serum Vitamin C' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onDeleteSavedStoryboard).not.toHaveBeenCalled();
  });

  it('keeps import dialog and pasted JSON open when import fails', async () => {
    const onImportStoryboard = vi.fn().mockRejectedValue(new Error('JSON lỗi'));

    render(
      <StoryboardInputPanel
        productName="Serum Vitamin C"
        setProductName={vi.fn()}
        productDescription="Serum sáng da mờ thâm"
        setProductDescription={vi.fn()}
        gender="Skincare"
        setGender={vi.fn()}
        audience="Nữ 20-35"
        setAudience={vi.fn()}
        tone="Tin cậy"
        setTone={vi.fn()}
        region="Sáng da"
        setRegion={vi.fn()}
        script="Hook\nDemo"
        setScript={vi.fn()}
        savedStoryboards={[]}
        selectedStoryboardId={null}
        folderName="Loa"
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={onImportStoryboard}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import storyboard JSON' }));
    fireEvent.change(screen.getByLabelText('JSON storyboard'), { target: { value: '{"bad":true}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nhập JSON' }));

    await waitFor(() => expect(onImportStoryboard).toHaveBeenCalledWith('{"bad":true}'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('JSON storyboard')).toHaveValue('{"bad":true}');
  });

  it('shows import loading state while submitting', () => {
    render(
      <StoryboardInputPanel
        productName="Serum Vitamin C"
        setProductName={vi.fn()}
        productDescription="Serum sáng da mờ thâm"
        setProductDescription={vi.fn()}
        gender="Skincare"
        setGender={vi.fn()}
        audience="Nữ 20-35"
        setAudience={vi.fn()}
        tone="Tin cậy"
        setTone={vi.fn()}
        region="Sáng da"
        setRegion={vi.fn()}
        script="Hook\nDemo"
        setScript={vi.fn()}
        savedStoryboards={[]}
        selectedStoryboardId={null}
        folderName="Loa"
        onCopyInput={vi.fn()}
        onCopyScriptPrompt={vi.fn()}
        onImportStoryboard={vi.fn()}
        onSelectSavedStoryboard={vi.fn()}
        onDeleteSavedStoryboard={vi.fn()}
        isImportingStoryboard
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import storyboard JSON' }));
    fireEvent.change(screen.getByLabelText('JSON storyboard'), { target: { value: '{"beats":[]}' } });
    expect(screen.getByRole('button', { name: 'Đang nhập...' })).toBeDisabled();
  });
});
