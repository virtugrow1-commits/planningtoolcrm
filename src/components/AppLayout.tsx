import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  InboxIcon,
  FileText,
  CalendarDays,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/crm', icon: Users, label: 'CRM' },
  { to: '/inquiries', icon: InboxIcon, label: 'Aanvragen' },
  { to: '/quotations', icon: FileText, label: 'Offertes' },
  { to: '/calendar', icon: CalendarDays, label: 'Kalender' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top nav */}
      <header className="sidebar-gradient flex h-14 items-center justify-between px-4 shrink-0">
        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-accent'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon size={16} className="shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Right side: settings + user */}
        <div className="flex items-center gap-1">
          <NavLink
            to="/settings"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
              location.pathname === '/settings' && 'bg-sidebar-accent text-accent'
            )}
          >
            <Settings size={16} />
            <span className="hidden md:inline">Instellingen</span>
          </NavLink>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                <span className="hidden md:inline max-w-[140px] truncate">{user?.email}</span>
                <LogOut size={16} className="shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={signOut}>Uitloggen</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden sidebar-gradient border-t border-sidebar-border px-2 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-accent'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon size={18} className="shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
