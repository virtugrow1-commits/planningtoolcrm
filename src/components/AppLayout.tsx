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
  ChevronDown,
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
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top nav */}
      <header className="sidebar-gradient flex h-14 items-center justify-between px-4 shrink-0 shadow-lg relative z-20">
        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navItemDefs.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium tracking-wide transition-all duration-200 ease-spring',
                  isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                )}
              >
                <item.icon size={17} className="shrink-0" />
                <span>{t(item.key)}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-sidebar-primary" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden rounded-lg p-2 text-white/90 hover:bg-white/10 transition-all duration-200"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Right side */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === 'nl' ? 'en' : 'nl')}
            className="text-white/75 hover:text-white hover:bg-white/10 gap-1.5 px-2.5 h-9 transition-all duration-200"
          >
            <Globe size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider">{language === 'nl' ? 'EN' : 'NL'}</span>
          </Button>

          {isAdmin && (
            <NavLink
              to="/settings"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-white/75 hover:text-white hover:bg-white/10 transition-all duration-200',
                location.pathname === '/settings' && 'bg-white/15 text-white'
              )}
            >
              <Settings size={17} />
              <span className="hidden md:inline">{t('nav.settings')}</span>
            </NavLink>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-white/75 hover:text-white hover:bg-white/10 transition-all duration-200">
                <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="hidden lg:inline max-w-[140px] truncate">{user?.email}</span>
                <ChevronDown size={14} className="hidden lg:block opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px] animate-scale-in">
              {user && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut size={14} className="mr-2" />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden sidebar-gradient border-t border-white/10 px-2 py-2 space-y-0.5 animate-slide-down shadow-lg">
          {navItemDefs.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
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
