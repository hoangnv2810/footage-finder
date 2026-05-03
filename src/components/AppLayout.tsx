import { useState } from 'react';
import type { ReactNode } from 'react';

import { PanelLeft, Plus } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { AppSidebar } from '@/components/AppSidebar';

interface AppLayoutProps {
  children: ReactNode;
  onCreateStoryboardFolder?: () => void;
}

export function AppLayout({ children, onCreateStoryboardFolder }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const showStoryboardFolderAction = location.pathname.startsWith('/storyboard') && !!onCreateStoryboardFolder;

  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full overflow-hidden">
        <AppSidebar collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-10 items-center justify-between border-b border-border px-2 shrink-0">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Thu gọn sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            {showStoryboardFolderAction ? (
              <button
                type="button"
                onClick={onCreateStoryboardFolder}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-secondary px-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-surface-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                Tạo folder sản phẩm
              </button>
            ) : null}
          </header>
          <main className="flex-1 min-h-0 overflow-hidden">
            <div className="flex h-full w-full flex-col overflow-hidden">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
