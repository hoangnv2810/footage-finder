import { Database, Film, Search } from 'lucide-react';

import { NavLink } from '@/components/NavLink';

const items = [
  { title: 'Thư viện dữ liệu', url: '/', icon: Database, end: true },
  { title: 'Tìm phân cảnh', url: '/search', icon: Search },
  { title: 'Storyboard', url: '/storyboard', icon: Film },
];

export function AppSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={`hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-linear lg:flex lg:flex-col ${collapsed ? 'w-[64px]' : 'w-[240px]'}`}
    >
      <nav className="space-y-1 px-2 pt-4">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.end}
            className={`group flex h-10 w-full items-center rounded-md text-sidebar-foreground transition-[padding,background-color,color] duration-200 ease-linear hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${collapsed ? 'justify-center px-0' : 'justify-start px-3'}`}
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
            title={item.title}
          >
            <item.icon className="h-5 w-5" />
            <span
              aria-hidden={collapsed}
              className={`overflow-hidden whitespace-nowrap text-sm transition-[max-width,opacity,margin] duration-200 ease-linear ${collapsed ? 'ml-0 max-w-0 opacity-0' : 'ml-3 max-w-[160px] opacity-100'}`}
            >
              {item.title}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
