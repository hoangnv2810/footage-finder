import { useState } from 'react';
import type { ReactNode } from 'react';

import { PanelLeft } from 'lucide-react';

import { AppSidebar } from '@/components/AppSidebar';

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full overflow-hidden">
        <AppSidebar collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-10 items-center border-b border-border px-2 shrink-0">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Thu gọn sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </header>
          <main className="flex-1 min-h-0 overflow-hidden">
            <div className="flex h-full w-full flex-col overflow-hidden">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
