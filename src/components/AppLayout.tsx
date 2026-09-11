import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  InboxIcon,
  CalendarDays,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  ChevronDown,
  RefreshCw,
  CheckSquare,
} from 'lucide-react';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const navItemDefs = [
  { to: '/', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/tasks', icon: CheckSquare, key: 'nav.tasks' },
  { to: '/crm', icon: Users, key: 'nav.crm' },
  { to: '/inquiries', icon: InboxIcon, key: 'nav.inquiries' },
  { to: '/calendar', icon: CalendarDays, key: 'nav.calendar' },
];


export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, user, isAdmin } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const { unreadCount } = useInquiriesContext();
  

  const handleFullSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-auto-sync', {
        body: { scope: 'full', source: 'manual' },
      });
      if (error) throw error;
      if (data?.skipped) {
        toast({ title: 'Synchronisatie al actief', description: 'Er draait al een sync op de achtergrond.' });
      } else {
        toast({ title: 'Synchronisatie gestart', description: 'Volledige sync is gestart op de achtergrond.' });
      }
    } catch (err: any) {
      toast({ title: 'Sync mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top nav */}
      <header className="sidebar-gradient grid h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-4 shadow-lg relative z-20">
        {/* Brand */}
        <NavLink to="/" className="flex items-center gap-2 pr-2 text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 text-[13px] font-bold tracking-tight">C</span>
          <span className="hidden sm:inline text-[15px] font-semibold tracking-tight">CliqCRM</span>
        </NavLink>

        {/* Desktop nav — centered */}
        <nav className="hidden md:flex items-center justify-center gap-1">
          {navItemDefs.map((item) => {
            const isActive = location.pathname === item.to;
            const showBadge = item.to === '/inquiries' && unreadCount > 0;
            const badgeCount = item.to === '/inquiries' ? unreadCount : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'relative flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium tracking-wide transition-all duration-200 ease-spring',
                  isActive
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <item.icon size={16} className="shrink-0" />
                <span>{t(item.key)}</span>
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center px-1">
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="md:hidden" />

        {/* Right side */}
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLanguage(language === 'nl' ? 'en' : 'nl')}
            className="hidden sm:flex text-white/70 hover:text-white hover:bg-white/10 h-9 w-9 transition-all duration-200"
            title={language === 'nl' ? 'Switch to English' : 'Schakel naar Nederlands'}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider">{language === 'nl' ? 'EN' : 'NL'}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleFullSync}
            disabled={syncing}
            className="text-white/70 hover:text-white hover:bg-white/10 h-9 w-9 transition-all duration-200"
            title="Volledige synchronisatie"
          >
            <RefreshCw size={17} className={cn(syncing && 'animate-spin')} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-[13px] font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200">
                <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <ChevronDown size={14} className="opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px] animate-scale-in">
              {user && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings size={14} className="mr-2" />
                {t('nav.settings')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage(language === 'nl' ? 'en' : 'nl')} className="sm:hidden">
                <Globe size={14} className="mr-2" />
                {language === 'nl' ? 'English' : 'Nederlands'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut size={14} className="mr-2" />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden rounded-lg p-2 text-white/90 hover:bg-white/10 transition-all duration-200"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>


      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden sidebar-gradient border-t border-white/10 px-2 py-2 space-y-0.5 animate-slide-down shadow-lg">
          {navItemDefs.map((item) => {
            const isActive = location.pathname === item.to;
            const showBadge = item.to === '/inquiries' && unreadCount > 0;
            const badgeCount = item.to === '/inquiries' ? unreadCount : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <item.icon size={18} className="shrink-0" />
                <span>{t(item.key)}</span>
                {showBadge && (
                  <span className="ml-auto h-5 min-w-5 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center px-1">
                    {badgeCount}
                  </span>
                )}
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
