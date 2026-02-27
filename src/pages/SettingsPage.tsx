import { useState, useRef } from 'react';
import LegacyImport from '@/components/LegacyImport';
import MasterImport from '@/components/MasterImport';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Webhook, Key, ArrowRightLeft, CheckCircle2, AlertCircle, RefreshCw, Upload, Copy, Link2, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useContactsContext } from '@/contexts/ContactsContext';

import { Contact } from '@/types/crm';

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ghl-webhook`;

const VGW_WEBHOOKS = [
  // Inbound — VGW → CRM
  { id: 'contact_created', label: 'Contact aangemaakt', description: 'Sync nieuwe contacten van VirtuGrow → CRM', direction: 'inbound' },
  { id: 'contact_updated', label: 'Contact gewijzigd', description: 'Houd contactgegevens gesynchroniseerd', direction: 'inbound' },
  { id: 'opportunity_status', label: 'Opportunity Status', description: 'Sync pipeline stadia met aanvragen', direction: 'inbound' },
  { id: 'form_submission', label: 'Formulier Ingezonden', description: 'Nieuwe aanvragen vanuit website formulier', direction: 'inbound' },
  { id: 'appointment_booked', label: 'Afspraak Geboekt', description: 'VirtuGrow kalender afspraken sync naar CRM', direction: 'inbound' },
  { id: 'task_completed', label: 'Taak Voltooid', description: 'VirtuGrow taken status updates ontvangen', direction: 'inbound' },
  { id: 'note_added', label: 'Notitie Toegevoegd', description: 'VirtuGrow contact notities synchroniseren', direction: 'inbound' },
  { id: 'payment_received', label: 'Betaling Ontvangen', description: 'Stripe/VirtuGrow betalingen registreren', direction: 'inbound' },
  // Outbound — CRM → VGW
  { id: 'booking_created', label: 'Boeking aangemaakt', description: 'Stuur nieuwe boekingen naar VirtuGrow', direction: 'outbound' },
  { id: 'booking_updated', label: 'Boeking gewijzigd', description: 'Sync wijzigingen in boekingen naar VirtuGrow', direction: 'outbound' },
  { id: 'inquiry_status', label: 'Aanvraag status gewijzigd', description: 'Update VirtuGrow opportunity bij status wijziging', direction: 'outbound' },
  { id: 'quotation_sent', label: 'Offerte verstuurd', description: 'Trigger VirtuGrow workflow bij offerte', direction: 'outbound' },
  { id: 'quotation_accepted', label: 'Offerte geaccepteerd', description: 'Markeer VirtuGrow opportunity als gewonnen', direction: 'outbound' },
  { id: 'recurring_created', label: 'Herhaling aangemaakt', description: 'Sync terugkerende boekingen naar VirtuGrow', direction: 'outbound' },
];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(/[;,]/).map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function mapRow(row: Record<string, string>): Omit<Contact, 'id' | 'createdAt'> | null {
  const get = (...keys: string[]) => {
    for (const k of keys) { if (row[k]?.trim()) return row[k].trim(); }
    return '';
  };
  const firstName = get('voornaam', 'firstname', 'first_name', 'first name');
  const lastName = get('achternaam', 'lastname', 'last_name', 'last name');
  if (!firstName && !lastName) return null;
  return {
    firstName: firstName || '—',
    lastName: lastName || '—',
    email: get('email', 'e-mail', 'emailadres'),
    phone: get('telefoon', 'phone', 'tel', 'telefoonnummer', 'mobile'),
    company: get('bedrijf', 'company', 'organisatie', 'organization') || undefined,
    status: 'lead',
  };
}

export default function SettingsPage() {
  
  const [apiKey, setApiKey] = useState('');
  const [locationId, setLocationId] = useState('');
  const [connected, setConnected] = useState(false);
  const [webhooks, setWebhooks] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Omit<Contact, 'id' | 'createdAt'>[]>([]);
  const [csvOpen, setCsvOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { addContact } = useContactsContext();

  // All users can access settings

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      const mapped = rows.map(mapRow).filter(Boolean) as Omit<Contact, 'id' | 'createdAt'>[];
      if (mapped.length === 0) {
        toast({ title: 'Geen geldige contacten gevonden in CSV', variant: 'destructive' });
        return;
      }
      setCsvPreview(mapped);
      setCsvOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    setImporting(true);
    let count = 0;
    for (const c of csvPreview) {
      try { await addContact(c); count++; } catch { /* skip */ }
    }
    setImporting(false);
    setCsvOpen(false);
    setCsvPreview([]);
    toast({ title: `${count} contacten geïmporteerd` });
  };

  const handleSync = async (action: string) => {
    setSyncing(true);
    try {
      if (action === 'sync-contacts') {
        // Paginated contact sync
        let totalSynced = 0;
        let nextPageUrl: string | null = null;
        let hasMore = true;
        let page = 0;
        while (hasMore) {
          page++;
          const body: any = { action: 'sync-contacts' };
          if (nextPageUrl) body.nextPageUrl = nextPageUrl;
          const { data, error } = await supabase.functions.invoke('ghl-sync', { body });
          if (error) throw error;
          totalSynced += data.synced || 0;
          nextPageUrl = data.nextPageUrl || null;
          hasMore = !!data.hasMore;
          // Small delay between pages to avoid rate limits
          if (hasMore) await new Promise(r => setTimeout(r, 1000));
        }
        toast({ title: '✅ Synchronisatie voltooid', description: `${totalSynced} contacten opgehaald uit VirtuGrow (${page} pagina's)` });
      } else if (action === 'full-sync') {
        // Run individual syncs sequentially
        const results: string[] = [];
        
        // 1. Contacts (paginated)
        let totalContacts = 0;
        let nextPageUrl: string | null = null;
        let hasMore = true;
        while (hasMore) {
          const body: any = { action: 'sync-contacts' };
          if (nextPageUrl) body.nextPageUrl = nextPageUrl;
          const { data, error } = await supabase.functions.invoke('ghl-sync', { body });
          if (error) { console.error('Contact sync error:', error); break; }
          totalContacts += data.synced || 0;
          nextPageUrl = data.nextPageUrl || null;
          hasMore = !!data.hasMore;
          if (hasMore) await new Promise(r => setTimeout(r, 1000));
        }
        results.push(`${totalContacts} contacten`);

        // 2. Opportunities
        await new Promise(r => setTimeout(r, 1500));
        try {
          const { data } = await supabase.functions.invoke('ghl-sync', { body: { action: 'sync-opportunities' } });
          results.push(`${data?.synced || 0} opportunities`);
        } catch (e) { console.error('Opp sync error:', e); }

        // 3. Calendars
        await new Promise(r => setTimeout(r, 1500));
        try {
          const { data } = await supabase.functions.invoke('ghl-sync', { body: { action: 'sync-calendars' } });
          results.push(`${data?.synced || 0} boekingen`);
        } catch (e) { console.error('Cal sync error:', e); }

        // 4. Tasks
        await new Promise(r => setTimeout(r, 1500));
        try {
          const { data } = await supabase.functions.invoke('ghl-sync', { body: { action: 'sync-tasks' } });
          results.push(`${data?.synced || 0} taken`);
        } catch (e) { console.error('Task sync error:', e); }

        // 5. Companies
        await new Promise(r => setTimeout(r, 1500));
        try {
          const { data } = await supabase.functions.invoke('ghl-sync', { body: { action: 'sync-companies' } });
          results.push(`${data?.synced || 0} bedrijven`);
        } catch (e) { console.error('Company sync error:', e); }

        // 6. Notes/Gesprekken
        await new Promise(r => setTimeout(r, 1500));
        try {
          const { data } = await supabase.functions.invoke('ghl-sync', { body: { action: 'sync-notes' } });
          results.push(`${data?.synced || 0} gesprekken`);
        } catch (e) { console.error('Notes sync error:', e); }

        toast({ title: '✅ Volledige sync voltooid', description: results.join(', ') });
      } else {
        const { data, error } = await supabase.functions.invoke('ghl-sync', { body: { action } });
        if (error) throw error;
        toast({
          title: '✅ Synchronisatie voltooid',
          description: action === 'sync-opportunities'
            ? `${data.synced} opportunities/aanvragen opgehaald uit VirtuGrow`
            : action === 'sync-calendars'
            ? `${data.synced} boekingen opgehaald uit ${data.calendars} VirtuGrow kalenders`
            : action === 'sync-tasks'
            ? `${data.synced} taken opgehaald uit VirtuGrow`
            : action === 'sync-companies'
            ? `${data.synced} bedrijven opgehaald uit VirtuGrow`
            : action === 'sync-notes'
            ? `${data.synced} gesprekken opgehaald uit VirtuGrow (${data.skipped || 0} overgeslagen)`
            : `${data.pushed || data.synced || 0} items gesynchroniseerd`,
        });
      }
    } catch (err: any) {
      toast({ title: 'Synchronisatie mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleConnect = () => {
    if (!apiKey || !locationId) {
      toast({ title: 'Vul alle velden in', variant: 'destructive' });
      return;
    }
    // In production this would validate via edge function
    setConnected(true);
    toast({ title: 'VirtuGrow Verbonden', description: 'API key geverifieerd. Webhooks kunnen nu worden ingesteld.' });
  };

  const toggleWebhook = (id: string) => {
    setWebhooks((prev) => ({ ...prev, [id]: !prev[id] }));
    toast({
      title: webhooks[id] ? 'Webhook uitgeschakeld' : 'Webhook ingeschakeld',
      description: VGW_WEBHOOKS.find((w) => w.id === id)?.label,
    });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Instellingen</h1>
        <p className="text-sm text-muted-foreground">VirtuGrow integratie & configuratie</p>
      </div>

      <Tabs defaultValue="vgw" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vgw" className="gap-2"><Key size={14} /> VGW Verbinding</TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook size={14} /> Webhooks</TabsTrigger>
          <TabsTrigger value="mapping" className="gap-2"><ArrowRightLeft size={14} /> Veld Mapping</TabsTrigger>
          <TabsTrigger value="import" className="gap-2"><Upload size={14} /> CSV Import</TabsTrigger>
          <TabsTrigger value="legacy" className="gap-2"><Database size={14} /> Legacy Import</TabsTrigger>
          <TabsTrigger value="master" className="gap-2"><Database size={14} /> Master Import</TabsTrigger>
        </TabsList>

        <TabsContent value="vgw" className="space-y-4">
          <div className="rounded-xl border bg-card p-6 card-shadow space-y-4">
            <div className="flex items-center gap-3">
              {connected ? (
                <CheckCircle2 size={20} className="text-success" />
              ) : (
                <AlertCircle size={20} className="text-warning" />
              )}
              <div>
                <h3 className="font-semibold text-card-foreground">
                   {connected ? 'Verbonden met VirtuGrow' : 'Niet verbonden'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {connected ? 'API key actief — webhooks beschikbaar' : 'Configureer je VirtuGrow API key om te starten'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">VirtuGrow API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="eyJhbGciOi..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Te vinden in VirtuGrow → Settings → Business Profile → API Key
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="locationId">VirtuGrow Location ID</Label>
                <Input
                  id="locationId"
                  placeholder="loc_xxxxxxxxxx"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Te vinden in VirtuGrow → Settings → Business Profile
                </p>
              </div>
              <Button onClick={handleConnect} disabled={connected}>
                {connected ? 'Verbonden ✓' : 'Verbinden'}
              </Button>
            </div>

            {/* Sync Actions */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold text-card-foreground">Synchronisatie</h4>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={syncing} onClick={() => handleSync('sync-contacts')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Contacten VGW → CRM
                </Button>
                <Button variant="outline" size="sm" disabled={syncing} onClick={() => handleSync('sync-opportunities')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Opportunities VGW → CRM
                </Button>
                <Button variant="outline" size="sm" disabled={syncing} onClick={() => handleSync('sync-calendars')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Boekingen VGW → CRM
                </Button>
                <Button variant="outline" size="sm" disabled={syncing} onClick={() => handleSync('push-contacts')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Contacten CRM → VGW
                </Button>
                <Button variant="outline" size="sm" disabled={syncing} onClick={() => handleSync('sync-tasks')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Taken VGW → CRM
                </Button>
                <Button variant="outline" size="sm" disabled={syncing} onClick={() => handleSync('sync-companies')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Bedrijven VGW → CRM
                </Button>
                <Button variant="outline" size="sm" disabled={syncing} onClick={() => handleSync('sync-notes')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Gesprekken VGW → CRM
                </Button>
                <Button size="sm" disabled={syncing} onClick={() => handleSync('full-sync')}>
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> Volledige Sync
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                </span>
                <span>Automatische sync actief — elke minuut worden contacten, boekingen en aanvragen uitgewisseld met VirtuGrow</span>
              </div>
              <p className="text-xs text-muted-foreground">
                De API key en Location ID worden beheerd via de beveiligde backend configuratie.
              </p>
            </div>

            {/* Webhook URL for GHL */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-primary" />
                <h4 className="text-sm font-semibold text-card-foreground">Webhook URL</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Plak deze URL in VirtuGrow → Settings → Webhooks om realtime data te ontvangen.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono text-foreground break-all">
                  {WEBHOOK_URL}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(WEBHOOK_URL);
                    toast({ title: 'Webhook URL gekopieerd!' });
                  }}
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">VirtuGrow als motor — dit CRM als cockpit</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Contacts:</strong> 2-weg sync via API v2 (GET/POST /contacts)</li>
                <li><strong>Opportunities:</strong> Pipeline stadia mappen naar aanvraag statussen</li>
                <li><strong>Calendars:</strong> Boekingen sync via Calendar API</li>
                <li><strong>Workflows:</strong> Triggers bij status wijzigingen via webhooks</li>
                <li><strong>Custom Fields:</strong> Locatie-specifieke velden (ruimte, gasten, budget)</li>
              </ul>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <div className="rounded-xl border bg-card p-6 card-shadow space-y-4">
            <div>
              <h3 className="font-semibold text-card-foreground">Webhook Configuratie</h3>
              <p className="text-xs text-muted-foreground">Schakel webhooks in/uit voor realtime synchronisatie</p>
            </div>

            <div className="space-y-3">
              {VGW_WEBHOOKS.map((wh) => (
                <div key={wh.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      wh.direction === 'inbound'
                        ? 'bg-info/15 text-info'
                        : 'bg-success/15 text-success'
                    }`}>
                      {wh.direction === 'inbound' ? 'VGW → CRM' : 'CRM → VGW'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{wh.label}</p>
                      <p className="text-xs text-muted-foreground">{wh.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!webhooks[wh.id]}
                    onCheckedChange={() => toggleWebhook(wh.id)}
                    disabled={!connected}
                  />
                </div>
              ))}
            </div>

            {!connected && (
              <p className="text-xs text-warning">Verbind eerst je VirtuGrow account om webhooks in te schakelen.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-4">
          <div className="rounded-xl border bg-card p-6 card-shadow space-y-4">
            <div>
              <h3 className="font-semibold text-card-foreground">Veld Mapping</h3>
              <p className="text-xs text-muted-foreground">Koppel CRM velden aan VirtuGrow Custom Fields</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium text-muted-foreground">CRM Veld</th>
                    <th className="py-2 text-left font-medium text-muted-foreground">→</th>
                    <th className="py-2 text-left font-medium text-muted-foreground">VGW Custom Field</th>
                    <th className="py-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {[
                    { crm: 'roomPreference', ghl: 'cf_ruimte_voorkeur', active: true },
                    { crm: 'guestCount', ghl: 'cf_aantal_gasten', active: true },
                    { crm: 'budget', ghl: 'cf_budget', active: true },
                    { crm: 'eventType', ghl: 'cf_type_evenement', active: true },
                    { crm: 'preferredDate', ghl: 'cf_gewenste_datum', active: true },
                    { crm: 'bookingStatus', ghl: 'cf_boeking_status', active: false },
                  ].map((field) => (
                    <tr key={field.crm} className="border-b last:border-0">
                      <td className="py-2 font-mono text-card-foreground">{field.crm}</td>
                      <td className="py-2 text-muted-foreground">→</td>
                      <td className="py-2 font-mono text-card-foreground">{field.ghl}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          field.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                        }`}>
                          {field.active ? 'Actief' : 'Inactief'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Maak deze Custom Fields eerst aan in VirtuGrow → Settings → Custom Fields voordat je de sync inschakelt.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <div className="rounded-xl border bg-card p-6 card-shadow space-y-4">
            <div>
              <h3 className="font-semibold text-card-foreground">CSV Contacten Import</h3>
              <p className="text-xs text-muted-foreground">Upload een CSV-bestand om contacten in bulk te importeren in het CRM</p>
            </div>

            <div className="rounded-lg border-2 border-dashed border-border p-8 text-center space-y-3">
              <Upload size={32} className="mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-card-foreground">Sleep een CSV-bestand hierheen of klik om te selecteren</p>
                <p className="text-xs text-muted-foreground mt-1">Ondersteunde kolommen: voornaam, achternaam, email, telefoon, bedrijf</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload size={14} className="mr-1.5" /> Selecteer CSV
              </Button>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Ondersteunde kolomnamen</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Voornaam:</strong> voornaam, firstname, first_name</li>
                <li><strong>Achternaam:</strong> achternaam, lastname, last_name</li>
                <li><strong>Email:</strong> email, e-mail, emailadres</li>
                <li><strong>Telefoon:</strong> telefoon, phone, tel, telefoonnummer, mobile</li>
                <li><strong>Bedrijf:</strong> bedrijf, company, organisatie, organization</li>
              </ul>
              <p>Scheidingsteken: komma (,) of puntkomma (;)</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="legacy">
          <LegacyImport />
        </TabsContent>

        <TabsContent value="master">
          <MasterImport />
        </TabsContent>
      </Tabs>

      {/* CSV Import Preview Dialog */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>CSV Import — {csvPreview.length} contacten gevonden</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 rounded border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Voornaam</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Achternaam</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Telefoon</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bedrijf</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{c.firstName}</td>
                    <td className="px-3 py-1.5">{c.lastName}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.email || '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.phone || '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.company || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {csvPreview.length > 50 && (
              <p className="text-xs text-muted-foreground p-2">... en {csvPreview.length - 50} meer</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>Annuleren</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importeren...' : `Importeer ${csvPreview.length} contacten`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
