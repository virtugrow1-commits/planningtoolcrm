import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Cell,
} from 'recharts';
import {
  Activity,
  Radar as RadarIcon,
  Users,
  Inbox,
  CalendarCheck,
  Euro,
  CheckSquare,
  Send,
  Cpu,
  Signal,
} from 'lucide-react';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useTasksContext } from '@/contexts/TasksContext';
import type { Inquiry } from '@/types/crm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const OPEN_STAGES: Inquiry['status'][] = [
  'new',
  'contacted',
  'option',
  'quoted',
  'quote_revised',
  'reserved',
];

const STAGE_LABELS: Partial<Record<Inquiry['status'], string>> = {
  new: 'Nieuw',
  contacted: 'Contact',
  option: 'Optie',
  quoted: 'Offerte',
  quote_revised: 'Herzien',
  reserved: 'Gereserveerd',
  confirmed: 'Bevestigd',
  converted: 'Gewonnen',
  lost: 'Verloren',
};

function isThisWeek(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return false;
  return Date.now() - d <= 7 * 24 * 60 * 60 * 1000;
}

function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function euro(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Msg {
  from: 'you' | 'jarvis';
  text: string;
}

export default function JarvisPage() {
  const { bookings } = useBookings();
  const { inquiries } = useInquiriesContext();
  const { contacts } = useContactsContext();
  const { tasks } = useTasksContext();

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* -------- Live cijfers uit je CRM (= GHL-synced data) -------- */
  const stats = useMemo(() => {
    const openInquiries = inquiries.filter((i) => OPEN_STAGES.includes(i.status));
    const newThisWeek = inquiries.filter((i) => isThisWeek(i.createdAt));
    const pipelineValue = openInquiries.reduce((sum, i) => sum + (i.budget ?? 0), 0);
    const bookingsToday = bookings.filter((b) => isToday(b.date));
    const activeBookings = bookings.filter((b) => b.status === 'confirmed' || b.status === 'option');
    const openTasks = tasks.filter((t: { status?: string }) => t.status !== 'done' && t.status !== 'completed');

    // Pipeline-verdeling voor de funnel
    const funnel = OPEN_STAGES.map((s) => ({
      stage: STAGE_LABELS[s] ?? s,
      count: inquiries.filter((i) => i.status === s).length,
    }));

    const won = inquiries.filter((i) => i.status === 'converted' || i.status === 'confirmed').length;
    const total = inquiries.length || 1;
    const conversion = Math.round((won / total) * 100);

    return {
      openInquiries,
      newThisWeek,
      pipelineValue,
      bookingsToday,
      activeBookings,
      openTasks,
      funnel,
      conversion,
      contactCount: contacts.length,
    };
  }, [inquiries, bookings, contacts, tasks]);

  /* -------- Lokale "assistent" (nog zonder API-key) -------- */
  const [messages, setMessages] = useState<Msg[]>([
    {
      from: 'jarvis',
      text: 'Systemen online. Ik heb toegang tot je CRM. Stel me een vraag — bijvoorbeeld "hoeveel leads deze week?" of "wat staat er vandaag gepland?"',
    },
  ]);
  const [input, setInput] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function answerLocally(q: string): string {
    const t = q.toLowerCase();
    if (/(lead|aanvra|inquir).*(week)|week.*(lead|aanvra)/.test(t) || /nieuwe? lead/.test(t))
      return `Er kwamen deze week ${stats.newThisWeek.length} nieuwe aanvragen binnen. In totaal staan er ${stats.openInquiries.length} open in je pipeline.`;
    if (/(vandaag|today).*(plan|afspra|boeking|reserver)|wat staat/.test(t))
      return stats.bookingsToday.length
        ? `Vandaag staan er ${stats.bookingsToday.length} reserveringen gepland: ${stats.bookingsToday
            .map((b) => `${b.title} (${b.roomName})`)
            .slice(0, 5)
            .join(', ')}.`
        : 'Er staan vandaag geen reserveringen gepland.';
    if (/(omzet|waarde|pipeline|value|euro|geld)/.test(t))
      return `De totale waarde van je open pipeline is ${euro(stats.pipelineValue)} verdeeld over ${stats.openInquiries.length} aanvragen.`;
    if (/(taak|task|todo|to-do)/.test(t))
      return `Je hebt ${stats.openTasks.length} openstaande taken.`;
    if (/(contact|klant|relatie)/.test(t))
      return `Er staan ${stats.contactCount} contacten in je CRM.`;
    if (/(conversie|conversion|scoor|win)/.test(t))
      return `Je conversieratio is momenteel ${stats.conversion}%.`;
    if (/(hallo|hi|hey|goedemorgen|hoi|jarvis)/.test(t))
      return 'Ik ben er. Waarmee kan ik je helpen?';
    return `Ik heb dat nog niet gekoppeld aan een echte AI. Ik kan nu al vragen beantwoorden over: leads deze week, planning vandaag, pipeline-waarde, taken, contacten en conversie. (Koppel een LLM in de sectie "wireBrain" om vrije vragen te beantwoorden.)`;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { from: 'you', text: q }]);
    setInput('');
    // NB: hier komt straks de echte "brein"-aanroep (Claude via een Supabase
    // edge function). Zie README bij Fase 2 — de token mag NOOIT in de frontend.
    // wireBrain: vervang answerLocally(q) door de LLM-respons.
    const reply = answerLocally(q);
    setTimeout(() => setMessages((m) => [...m, { from: 'jarvis', text: reply }]), 350);
  }

  const timeStr = clock.toLocaleTimeString('nl-NL', { hour12: false });
  const dateStr = clock.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  /* ---------------------------------------------------------------- */

  return (
    <div className="relative min-h-full overflow-hidden bg-[#04070d] text-cyan-100">
      {/* achtergrond: grid + scanline */}
      <div className="pointer-events-none absolute inset-0 jarvis-grid opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cyan-500/10 to-transparent" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-cyan-400/10 to-transparent blur-xl animate-jarvis-scan" />
      </div>

      <div className="relative z-10 space-y-6 p-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Cpu className="h-7 w-7 text-cyan-400 animate-jarvis-flicker" />
              <h1 className="text-3xl font-bold tracking-[0.3em] text-cyan-300 jarvis-glow-text">
                J.A.R.V.I.S.
              </h1>
            </div>
            <p className="mt-1 text-xs uppercase tracking-widest text-cyan-500/70">
              Command Center · verbonden met CRM
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl text-cyan-200 jarvis-glow-text">{timeStr}</div>
            <div className="text-xs uppercase tracking-widest text-cyan-500/60">{dateStr}</div>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-widest text-emerald-400">
              <Signal className="h-3 w-3" /> Systemen online
            </div>
          </div>
        </header>

        {/* KPI-rij */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat icon={<Inbox className="h-5 w-5" />} label="Leads / week" value={String(stats.newThisWeek.length)} />
          <Stat icon={<Activity className="h-5 w-5" />} label="Open pipeline" value={String(stats.openInquiries.length)} />
          <Stat icon={<Euro className="h-5 w-5" />} label="Pipeline-waarde" value={euro(stats.pipelineValue)} />
          <Stat icon={<CalendarCheck className="h-5 w-5" />} label="Vandaag gepland" value={String(stats.bookingsToday.length)} />
          <Stat icon={<Users className="h-5 w-5" />} label="Contacten" value={String(stats.contactCount)} />
          <Stat icon={<CheckSquare className="h-5 w-5" />} label="Open taken" value={String(stats.openTasks.length)} />
        </div>

        {/* Midden: radar + pipeline */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Radar */}
          <div className="jarvis-panel relative flex flex-col items-center justify-center rounded-2xl p-6 transition-all">
            <div className="mb-3 flex w-full items-center justify-between text-xs uppercase tracking-widest text-cyan-500/70">
              <span className="flex items-center gap-1.5">
                <RadarIcon className="h-3.5 w-3.5" /> Live scan
              </span>
              <span className="text-emerald-400">{stats.conversion}% conversie</span>
            </div>
            <Radar activeBookings={stats.activeBookings.length} openInquiries={stats.openInquiries.length} />
          </div>

          {/* Pipeline funnel */}
          <div className="jarvis-panel rounded-2xl p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-widest text-cyan-500/70">
              <span>Pipeline-verdeling</span>
              <span>{stats.openInquiries.length} open aanvragen</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.funnel} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <XAxis dataKey="stage" stroke="#3b6b7a" tick={{ fill: '#7dd3e0', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#155e6b' }} />
                <YAxis stroke="#3b6b7a" tick={{ fill: '#5aa9b8', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <RTooltip
                  cursor={{ fill: 'rgba(34,211,238,0.06)' }}
                  contentStyle={{ background: '#04141c', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 8, color: '#a5f3fc' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.funnel.map((_, i) => (
                    <Cell key={i} fill={`rgba(34, 211, 238, ${0.4 + (i / stats.funnel.length) * 0.55})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Command console */}
        <div className="jarvis-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-500/70">
            <Activity className="h-3.5 w-3.5" /> Command console
          </div>
          <div ref={feedRef} className="mb-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div key={i} className={m.from === 'you' ? 'text-right' : 'text-left'}>
                <span
                  className={
                    'inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ' +
                    (m.from === 'you'
                      ? 'bg-cyan-500/15 text-cyan-100'
                      : 'bg-cyan-950/60 text-cyan-200 ring-1 ring-cyan-500/25')
                  }
                >
                  {m.from === 'jarvis' && <span className="mr-1.5 font-mono text-cyan-500">JARVIS›</span>}
                  {m.text}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Vraag Jarvis iets… bijv. "hoeveel leads deze week?"'
              className="flex-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-4 py-2.5 text-sm text-cyan-100 placeholder:text-cyan-600/60 outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500/20 px-4 py-2.5 text-sm font-medium text-cyan-200 ring-1 ring-cyan-400/40 transition hover:bg-cyan-500/30"
            >
              <Send className="h-4 w-4" /> Stuur
            </button>
          </form>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-cyan-600/50">
            Tip: koppel een LLM (Fase 2) voor vrije vragen · data komt live uit je CRM
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponenten                                                    */
/* ------------------------------------------------------------------ */

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="jarvis-panel rounded-xl p-4 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-cyan-400/80">{icon}</span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      </div>
      <div className="mt-3 text-2xl font-bold text-cyan-200 jarvis-glow-text">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-cyan-500/60">{label}</div>
    </div>
  );
}

function Radar({ activeBookings, openInquiries }: { activeBookings: number; openInquiries: number }) {
  // Genereer wat "blips" op basis van echte aantallen (deterministisch)
  const blips = useMemo(() => {
    const n = Math.min(12, Math.max(3, activeBookings + openInquiries));
    return Array.from({ length: n }, (_, i) => {
      const angle = (i * 137.5 * Math.PI) / 180; // golden angle
      const radius = 20 + ((i * 53) % 70);
      return {
        x: 50 + Math.cos(angle) * radius * 0.5,
        y: 50 + Math.sin(angle) * radius * 0.5,
        big: i % 4 === 0,
      };
    });
  }, [activeBookings, openInquiries]);

  return (
    <div className="relative aspect-square w-full max-w-[260px]">
      {/* ringen */}
      {[100, 72, 44].map((s) => (
        <div
          key={s}
          className="absolute left-1/2 top-1/2 rounded-full border border-cyan-500/25"
          style={{ width: `${s}%`, height: `${s}%`, transform: 'translate(-50%, -50%)' }}
        />
      ))}
      {/* kruis */}
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-500/20" />
      <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-cyan-500/20" />
      {/* sweep */}
      <div className="absolute inset-0 animate-jarvis-radar">
        <div
          className="absolute left-1/2 top-1/2 h-1/2 w-1/2 origin-top-left"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(34,211,238,0.35), rgba(34,211,238,0) 60deg)',
            borderRadius: '0 0 100% 0',
          }}
        />
      </div>
      {/* pulserende kern */}
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/40 animate-jarvis-pulse-ring" />
      <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
      {/* blips */}
      {blips.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.big ? 7 : 4,
            height: b.big ? 7 : 4,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}
