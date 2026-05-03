import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
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
