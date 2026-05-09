# Storyboard "Tạo mới" Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút "Tạo mới" vào footer của màn hình tạo storyboard để giúp người dùng chủ động reset phiên làm việc (kết quả và lựa chọn storyboard cũ) mà vẫn giữ nguyên thông tin form đã nhập.

**Architecture:** Bổ sung prop `onResetStoryboard` vào `StoryboardPage`. Tại `App.tsx`, prop này sẽ gọi trực tiếp đến hàm `resetStoryboardState` đã có sẵn. Thay đổi UI footer của `StoryboardPage` từ 1 nút full width thành grid 2 cột chứa nút Tạo mới và nút Tạo storyboard.

**Tech Stack:** React, Tailwind CSS, TypeScript, Vitest

---

### Task 1: Update StoryboardPage with new prop and UI

**Files:**
- Modify: `src/pages/StoryboardPage.tsx`
- Modify: `src/pages/StoryboardPage.test.tsx`

- [ ] **Step 1: Write the failing test for the new "Tạo mới" button layout**

In `src/pages/StoryboardPage.test.tsx`, add a test to verify the new button is rendered and behaves correctly.

```typescript
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
```

*Note: Update existing tests in `src/pages/StoryboardPage.test.tsx` to include a dummy `onResetStoryboard={vi.fn()}` prop so they don't break TypeScript types.*

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/StoryboardPage.test.tsx`
Expected: FAIL because `onResetStoryboard` is not in props, and "Tạo mới" is not found.

- [ ] **Step 3: Write minimal implementation in `StoryboardPage.tsx`**

1. Update the interface:
```typescript
interface StoryboardPageProps {
  // ... existing props ...
  onResetStoryboard: () => void;
}
```

2. Add prop to the component signature:
```typescript
export function StoryboardPage({
  // ... existing props ...
  onResetStoryboard,
}: StoryboardPageProps) {
```

3. Update the footer UI block:
```tsx
          <div className="shrink-0 border-t border-border bg-card px-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onResetStoryboard}
                className="w-full py-2 rounded-md text-xs font-semibold transition-colors bg-secondary text-secondary-foreground hover:bg-surface-hover"
              >
                Tạo mới
              </button>
              <button
                onClick={onGenerateStoryboard}
                disabled={isGeneratingStoryboard || sourceViews.length === 0 || storyboardSelectedVersionIds.length === 0}
                className="w-full py-2 rounded-md text-xs font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGeneratingStoryboard ? 'Đang tạo storyboard...' : 'Tạo storyboard'}
              </button>
            </div>
          </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/StoryboardPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/StoryboardPage.tsx src/pages/StoryboardPage.test.tsx
git commit -m "feat(storyboard): add 'Tạo mới' button to storyboard page UI"
```

---

### Task 2: Connect `onResetStoryboard` in App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the minimal implementation to connect the prop**

Update the `StoryboardPage` instance in `src/App.tsx` to pass `onResetStoryboard`. We use the existing `resetStoryboardState` callback.

```tsx
              <StoryboardPage
                // ... existing props ...
                onStoryboardPlayerRef={(el) => (storyboardPlaybackRef.current = el)}
                onStoryboardTimeUpdate={handleStoryboardTimeUpdate}
                onResetStoryboard={resetStoryboardState}
              />
```

- [ ] **Step 2: Run verification (Linter & Build)**

Run: `npm.cmd run lint`
Run: `rtk npm run build`
Expected: No type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(storyboard): wire up onResetStoryboard prop to resetStoryboardState in App"
```