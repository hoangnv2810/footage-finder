import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createStoryboardTimeline, fetchStoryboardTimelines, replaceStoryboardTimelineClips } from './lib/footage-app';

const mockSavedStoryboard = vi.hoisted(() => ({
  id: 'storyboard-1',
  createdAt: 1,
  updatedAt: 2,
  productName: 'Loa',
  productDescription: 'Mo ta loa',
  category: 'Audio',
  targetAudience: '',
  tone: '',
  keyBenefits: '',
  scriptText: 'Hook',
  selectedVersionIds: [],
  candidateSnapshot: [],
  source: 'generated' as const,
  beatCount: 0,
  folder: null,
  result: {
      beats: [
        {
          id: 'beat-1',
          label: 'Hook',
          text: 'Hook text',
          intent: 'Hook intent',
          desiredVisuals: 'Demo',
          durationHint: 3,
          position: 0,
        },
      ],
      beatMatches: [
        {
          beatId: 'beat-1',
          matches: [
            {
              id: 'match-1',
              beatId: 'beat-1',
              videoVersionId: 'version-1',
              fileName: 'hook.mp4',
              sceneIndex: 0,
              score: 95,
              matchReason: 'Best match',
              usageType: 'direct_product' as const,
              scene: { keyword: 'hook', start: 1, end: 4, description: 'Hook scene' },
            },
          ],
        },
      ],
    models: {
      video_analysis_model: 'test',
      script_planning_model: 'test',
      scene_matching_model: 'test',
    },
  },
}));

const mockSavedStoryboard2 = vi.hoisted(() => ({
  ...mockSavedStoryboard,
  id: 'storyboard-2',
  productName: 'Mic',
}));

let storyboardPageProps: Record<string, any> | null = null;

vi.mock('@/pages/StoryboardPage', () => ({
  StoryboardPage: (props: Record<string, any>) => {
    storyboardPageProps = props;
    return (
      <div>
        <button type="button" onClick={() => props.onSelectSavedStoryboard('storyboard-1')}>Open saved storyboard</button>
        <button type="button" onClick={() => props.onSelectSavedStoryboard('storyboard-2')}>Open second storyboard</button>
        <button type="button" onClick={() => props.onCreateStoryboardTimeline()}>Create timeline</button>
        <button type="button" onClick={() => props.onCreateStoryboardTimeline('Bản dựng UGC', true)}>Quick create named timeline</button>
        <button
          type="button"
          onClick={() => props.onAddMatchToTimeline({
            id: 'match-storyboard-2',
            beatId: 'beat-2',
            videoVersionId: 'version-2',
            fileName: 'mic.mp4',
            sceneIndex: 0,
            score: 90,
            matchReason: 'Match storyboard 2',
            usageType: 'direct_product',
            scene: { keyword: 'mic', start: 1, end: 3, description: 'Mic demo' },
          })}
        >
          Add match from outside panel
        </button>
        <div data-testid="timeline-count">{props.storyboardTimelines?.length ?? 'missing'}</div>
        <div data-testid="selected-timeline">{props.selectedStoryboardTimelineId ?? 'none'}</div>
      </div>
    );
  },
}));

vi.mock('@/lib/footage-app', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/footage-app')>();
  return {
    ...actual,
    fetchStoryboardTimelines: vi.fn(),
    createStoryboardTimeline: vi.fn(),
    replaceStoryboardTimelineClips: vi.fn(),
    api: {
      ...actual.api,
      history: vi.fn().mockResolvedValue([]),
      productFolders: vi.fn().mockResolvedValue([]),
      listStoryboards: vi.fn().mockResolvedValue([]),
      getStoryboard: vi.fn((id: string) => Promise.resolve(id === 'storyboard-2' ? mockSavedStoryboard2 : mockSavedStoryboard)),
    },
  };
});

describe('App storyboard timelines', () => {
  beforeEach(() => {
    storyboardPageProps = null;
    vi.mocked(fetchStoryboardTimelines).mockReset();
    vi.mocked(createStoryboardTimeline).mockReset();
    vi.mocked(replaceStoryboardTimelineClips).mockReset();
    vi.mocked(fetchStoryboardTimelines).mockResolvedValue([
      {
        id: 'timeline-1',
        storyboardId: 'storyboard-1',
        name: 'Bản dựng 1',
        position: 0,
        createdAt: 1,
        updatedAt: 2,
        clips: [],
      },
    ]);
    vi.mocked(createStoryboardTimeline).mockResolvedValue({
      id: 'timeline-created',
      storyboardId: 'storyboard-1',
      name: 'Bản dựng mới',
      position: 1,
      createdAt: 3,
      updatedAt: 3,
      clips: [],
    });
    vi.mocked(replaceStoryboardTimelineClips).mockResolvedValue({
      id: 'timeline-1',
      storyboardId: 'storyboard-1',
      name: 'Bản dựng 1',
      position: 0,
      createdAt: 1,
      updatedAt: 3,
      clips: [],
    });
    window.history.pushState({}, '', '/storyboard');
  });

  it('loads timelines for the selected saved storyboard and passes the selected timeline to StoryboardPage', async () => {
    render(<App />);

    await screen.findByRole('button', { name: 'Open saved storyboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Open saved storyboard' }));

    await waitFor(() => expect(fetchStoryboardTimelines).toHaveBeenCalledWith('storyboard-1'));
    await waitFor(() => expect(screen.getByTestId('timeline-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('selected-timeline')).toHaveTextContent('timeline-1');
    expect(storyboardPageProps?.isLoadingStoryboardTimelines).toBe(false);
  });

  it('does not create timelines while timeline load is in-flight', async () => {
    let resolveFetch: (value: Awaited<ReturnType<typeof fetchStoryboardTimelines>>) => void = () => {};
    vi.mocked(fetchStoryboardTimelines).mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    render(<App />);

    await screen.findByRole('button', { name: 'Open saved storyboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Open saved storyboard' }));
    await waitFor(() => expect(fetchStoryboardTimelines).toHaveBeenCalledWith('storyboard-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Create timeline' }));
    expect(createStoryboardTimeline).not.toHaveBeenCalled();

    resolveFetch([
      {
        id: 'timeline-1',
        storyboardId: 'storyboard-1',
        name: 'Bản dựng 1',
        position: 0,
        createdAt: 1,
        updatedAt: 2,
        clips: [],
      },
    ]);

    await waitFor(() => expect(storyboardPageProps?.isLoadingStoryboardTimelines).toBe(false));
    expect(screen.getByTestId('selected-timeline')).toHaveTextContent('timeline-1');
  });

  it('creates a named timeline and quick-populates it from storyboard matches', async () => {
    vi.mocked(replaceStoryboardTimelineClips).mockResolvedValue({
      id: 'timeline-created',
      storyboardId: 'storyboard-1',
      name: 'Bản dựng UGC',
      position: 1,
      createdAt: 3,
      updatedAt: 4,
      clips: [
        {
          id: 'clip-created',
          timelineId: 'timeline-created',
          beatId: 'beat-1',
          label: 'Hook',
          filename: 'hook.mp4',
          start: 1,
          end: 4,
          sceneIndex: 0,
          position: 0,
          createdAt: 4,
          updatedAt: 4,
        },
      ],
    });

    render(<App />);

    await screen.findByRole('button', { name: 'Open saved storyboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Open saved storyboard' }));
    await waitFor(() => expect(screen.getByTestId('selected-timeline')).toHaveTextContent('timeline-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Quick create named timeline' }));

    await waitFor(() => expect(createStoryboardTimeline).toHaveBeenCalledWith('storyboard-1', 'Bản dựng UGC'));
    await waitFor(() => expect(replaceStoryboardTimelineClips).toHaveBeenCalledWith('timeline-created', [
      {
        beatId: 'beat-1',
        label: 'Hook',
        filename: 'hook.mp4',
        start: 1,
        end: 4,
        sceneIndex: 0,
      },
    ]));
    await waitFor(() => expect(screen.getByTestId('selected-timeline')).toHaveTextContent('timeline-created'));
  });

  it('ignores add-match calls while timelines for a newly selected storyboard are loading', async () => {
    let resolveSecondFetch: (value: Awaited<ReturnType<typeof fetchStoryboardTimelines>>) => void = () => {};
    vi.mocked(fetchStoryboardTimelines).mockReset();
    vi.mocked(fetchStoryboardTimelines)
      .mockResolvedValueOnce([
        {
          id: 'timeline-1',
          storyboardId: 'storyboard-1',
          name: 'Bản dựng 1',
          position: 0,
          createdAt: 1,
          updatedAt: 2,
          clips: [],
        },
      ])
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecondFetch = resolve;
      }));

    render(<App />);

    await screen.findByRole('button', { name: 'Open saved storyboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Open saved storyboard' }));
    await waitFor(() => expect(screen.getByTestId('selected-timeline')).toHaveTextContent('timeline-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Open second storyboard' }));
    await waitFor(() => expect(fetchStoryboardTimelines).toHaveBeenCalledWith('storyboard-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Add match from outside panel' }));

    expect(replaceStoryboardTimelineClips).not.toHaveBeenCalled();

    resolveSecondFetch([]);
    await waitFor(() => expect(storyboardPageProps?.isLoadingStoryboardTimelines).toBe(false));
  });
});
