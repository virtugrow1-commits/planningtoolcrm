import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ContactSelector from './ContactSelector';

interface ClientInfo {
  contactId: string;
  contactName: string;
  companyId: string;
  companyName: string;
  clientEmail: string;
  clientAddress: string;
}

interface ClientInfoCardProps {
  data: ClientInfo;
  onChange?: (data: Partial<ClientInfo>) => void;
  readOnly?: boolean;
}

export default function ClientInfoCard({ data, onChange, readOnly }: ClientInfoCardProps) {
  if (readOnly) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Klantgegevens</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">Contactpersoon</p>
              <p className="text-foreground">{data.contactName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">E-mail</p>
              <p className="text-foreground">{data.clientEmail || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">Bedrijf</p>
              <p className="text-foreground">{data.companyName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">Adres</p>
              <p className="text-foreground">{data.clientAddress || '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Klantgegevens</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Contactpersoon</Label>
            <ContactSelector
              value={data.contactId}
              onChange={(cId, cName, coId, coName, email) => {
                onChange?.({
                  contactId: cId,
                  contactName: cName,
                  companyId: coId || '',
                  companyName: coName || '',
                  clientEmail: email || data.clientEmail,
                });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input value={data.clientEmail} onChange={(e) => onChange?.({ clientEmail: e.target.value })} placeholder="email@voorbeeld.nl" />
          </div>
          <div className="space-y-1.5">
            <Label>Bedrijf</Label>
            <Input value={data.companyName} onChange={(e) => onChange?.({ companyName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Adres</Label>
            <Input value={data.clientAddress} onChange={(e) => onChange?.({ clientAddress: e.target.value })} placeholder="Straat, Postcode, Plaats" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
