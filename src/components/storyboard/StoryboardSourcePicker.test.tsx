import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StoryboardSourcePicker } from './StoryboardSourcePicker';

const sources = [
  {
    id: 'v1',
    videoFileName: 'loa.mp4',
    productName: 'Loa',
    source: 'Web' as const,
    version: 1,
    sceneCount: 4,
    usable: true,
  },
];

describe('StoryboardSourcePicker', () => {
  it('collapses source folders by default and expands them on click', () => {
    render(<StoryboardSourcePicker sources={sources} selected={new Set()} onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Loa 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /loa\.mp4/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Loa 1/ }));

    expect(screen.getByRole('button', { name: /loa\.mp4/ })).toBeInTheDocument();
  });

  it('uses content-sized block layout when internal scrolling is disabled', () => {
    const { container } = render(
      <StoryboardSourcePicker
        sources={sources}
        selected={new Set()}
        onToggle={vi.fn()}
        hideHeader
        disableInternalScroll
      />,
    );

    const root = container.firstElementChild;

    expect(screen.getByRole('button', { name: /Loa 1/ })).toBeInTheDocument();
    expect(root).not.toHaveClass('flex', 'flex-col', 'min-h-0');
    expect(root).not.toHaveClass('h-full', 'overflow-hidden');
  });
});
