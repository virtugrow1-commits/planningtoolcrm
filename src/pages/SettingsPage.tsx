import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Webhook, Key, ArrowRightLeft, CheckCircle2, AlertCircle } from 'lucide-react';

const GHL_WEBHOOKS = [
  { id: 'contact_created', label: 'Contact aangemaakt', description: 'Sync nieuwe contacten van GHL → CRM', direction: 'inbound' },
  { id: 'contact_updated', label: 'Contact gewijzigd', description: 'Houd contactgegevens gesynchroniseerd', direction: 'inbound' },
  { id: 'opportunity_status', label: 'Opportunity Status', description: 'Sync pipeline stadia met aanvragen', direction: 'inbound' },
  { id: 'booking_created', label: 'Boeking aangemaakt', description: 'Stuur nieuwe boekingen naar GHL', direction: 'outbound' },
  { id: 'inquiry_status', label: 'Aanvraag status gewijzigd', description: 'Update GHL opportunity bij status wijziging', direction: 'outbound' },
  { id: 'quotation_sent', label: 'Offerte verstuurd', description: 'Trigger GHL workflow bij offerte', direction: 'outbound' },
];

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [locationId, setLocationId] = useState('');
  const [connected, setConnected] = useState(false);
  const [webhooks, setWebhooks] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const handleConnect = () => {
    if (!apiKey || !locationId) {
      toast({ title: 'Vul alle velden in', variant: 'destructive' });
      return;
    }
    // In production this would validate via edge function
    setConnected(true);
    toast({ title: 'GHL Verbonden', description: 'API key geverifieerd. Webhooks kunnen nu worden ingesteld.' });
  };

  const toggleWebhook = (id: string) => {
    setWebhooks((prev) => ({ ...prev, [id]: !prev[id] }));
    toast({
      title: webhooks[id] ? 'Webhook uitgeschakeld' : 'Webhook ingeschakeld',
      description: GHL_WEBHOOKS.find((w) => w.id === id)?.label,
    });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Instellingen</h1>
        <p className="text-sm text-muted-foreground">GoHighLevel integratie & configuratie</p>
      </div>

      <Tabs defaultValue="ghl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ghl" className="gap-2"><Key size={14} /> GHL Verbinding</TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook size={14} /> Webhooks</TabsTrigger>
          <TabsTrigger value="mapping" className="gap-2"><ArrowRightLeft size={14} /> Veld Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="ghl" className="space-y-4">
          <div className="rounded-xl border bg-card p-6 card-shadow space-y-4">
            <div className="flex items-center gap-3">
              {connected ? (
                <CheckCircle2 size={20} className="text-success" />
              ) : (
                <AlertCircle size={20} className="text-warning" />
              )}
              <div>
                <h3 className="font-semibold text-card-foreground">
                  {connected ? 'Verbonden met GoHighLevel' : 'Niet verbonden'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {connected ? 'API key actief — webhooks beschikbaar' : 'Configureer je GHL API key om te starten'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">GHL API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="eyJhbGciOi..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Te vinden in GHL → Settings → Business Profile → API Key
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="locationId">GHL Location ID</Label>
                <Input
                  id="locationId"
                  placeholder="loc_xxxxxxxxxx"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Te vinden in GHL → Settings → Business Profile
                </p>
              </div>
              <Button onClick={handleConnect} disabled={connected}>
                {connected ? 'Verbonden ✓' : 'Verbinden'}
              </Button>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">GHL als motor — dit CRM als cockpit</p>
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
              {GHL_WEBHOOKS.map((wh) => (
                <div key={wh.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      wh.direction === 'inbound'
                        ? 'bg-info/15 text-info'
                        : 'bg-success/15 text-success'
                    }`}>
                      {wh.direction === 'inbound' ? 'GHL → CRM' : 'CRM → GHL'}
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
              <p className="text-xs text-warning">Verbind eerst je GHL account om webhooks in te schakelen.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-4">
          <div className="rounded-xl border bg-card p-6 card-shadow space-y-4">
            <div>
              <h3 className="font-semibold text-card-foreground">Veld Mapping</h3>
              <p className="text-xs text-muted-foreground">Koppel CRM velden aan GHL Custom Fields</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium text-muted-foreground">CRM Veld</th>
                    <th className="py-2 text-left font-medium text-muted-foreground">→</th>
                    <th className="py-2 text-left font-medium text-muted-foreground">GHL Custom Field</th>
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
              Maak deze Custom Fields eerst aan in GHL → Settings → Custom Fields voordat je de sync inschakelt.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
