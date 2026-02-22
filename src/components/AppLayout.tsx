import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  InboxIcon,
  MessageSquare,
  CalendarDays,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const navItemDefs = [
  { to: '/', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/crm', icon: Users, key: 'nav.crm' },
  { to: '/companies', icon: Building2, key: 'nav.companies' },
  { to: '/inquiries', icon: InboxIcon, key: 'nav.inquiries' },
  { to: '/conversations', icon: MessageSquare, key: 'nav.conversations' },
  { to: '/calendar', icon: CalendarDays, key: 'nav.calendar' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, user, isAdmin } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top nav */}
      <header className="sidebar-gradient flex h-16 items-center justify-between px-5 shrink-0">
        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1.5">
          {navItemDefs.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-base font-semibold tracking-wide transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-accent'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon size={20} className="shrink-0" />
                <span>{t(item.key)}</span>
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

        {/* Right side: lang toggle + settings + user */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === 'nl' ? 'en' : 'nl')}
            className="text-sidebar-foreground hover:bg-sidebar-accent gap-1.5 px-2.5"
          >
            <Globe size={16} />
            <span className="text-xs font-semibold uppercase">{language === 'nl' ? 'EN' : 'NL'}</span>
          </Button>

          {isAdmin && (
            <NavLink
              to="/settings"
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-base font-semibold text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
                location.pathname === '/settings' && 'bg-sidebar-accent text-accent'
              )}
            >
              <Settings size={20} />
              <span className="hidden md:inline">{t('nav.settings')}</span>
            </NavLink>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-base font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                <span className="hidden md:inline max-w-[160px] truncate">{user?.email}</span>
                <LogOut size={18} className="shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={signOut}>{t('nav.logout')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden sidebar-gradient border-t border-sidebar-border px-2 py-2 space-y-1">
          {navItemDefs.map((item) => {
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
                <span>{t(item.key)}</span>
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
