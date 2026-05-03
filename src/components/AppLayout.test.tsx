import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('collapses the left navigation sidebar by default without hiding page content', () => {
    render(
      <MemoryRouter initialEntries={['/storyboard']}>
        <AppLayout>
          <div>Storyboard content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    const sidebar = screen.getByRole('navigation').closest('aside');

    expect(sidebar).toHaveClass('w-[64px]');
    expect(screen.getByText('Storyboard content')).toBeInTheDocument();
  });

  it('shows create product folder action in the top header on storyboard page', () => {
    const onCreateStoryboardFolder = vi.fn();

    render(
      <MemoryRouter initialEntries={['/storyboard']}>
        <AppLayout onCreateStoryboardFolder={onCreateStoryboardFolder}>
          <div>Storyboard</div>
        </AppLayout>
      </MemoryRouter>,
    );

    const header = screen.getByRole('banner');
    const createButton = screen.getByRole('button', { name: 'Tạo folder sản phẩm' });

    expect(header).toContainElement(screen.getByRole('button', { name: 'Thu gọn sidebar' }));
    expect(header).toContainElement(createButton);

    fireEvent.click(createButton);
    expect(onCreateStoryboardFolder).toHaveBeenCalledTimes(1);
  });
});
