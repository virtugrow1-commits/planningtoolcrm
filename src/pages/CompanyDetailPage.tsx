import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, User, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useBookings } from '@/contexts/BookingsContext';

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
};

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companies, loading: companiesLoading } = useCompaniesContext();
  const { contacts, loading: contactsLoading } = useContactsContext();
  const { bookings, loading: bookingsLoading } = useBookings();

  const company = companies.find((c) => c.id === id);

  if (companiesLoading || contactsLoading || bookingsLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground">Laden...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/companies')}>
          <ArrowLeft size={14} className="mr-1" /> Terug
        </Button>
        <p className="text-muted-foreground">Bedrijf niet gevonden.</p>
      </div>
    );
  }

  // Find contacts whose company field matches this company name (case-insensitive)
  const companyContacts = contacts.filter(
    (c) => c.company && c.company.toLowerCase() === company.name.toLowerCase()
  );

  const contactIds = new Set(companyContacts.map((c) => c.id));

  // Find bookings linked to any of these contacts
  const companyBookings = bookings.filter((b) => b.contactId && contactIds.has(b.contactId));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/companies')}>
        <ArrowLeft size={14} className="mr-1" /> Terug naar Bedrijven
      </Button>

      {/* Company header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{company.name}</h1>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-0.5">
            {company.email && <span>{company.email}</span>}
            {company.phone && <span>• {company.phone}</span>}
            {company.address && <span>• {company.address}</span>}
          </div>
        </div>
      </div>

      {company.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{company.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Contacts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User size={16} /> Contacten ({companyContacts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {companyContacts.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              Geen contacten gevonden met bedrijfsnaam "{company.name}".
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Naam</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Email</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground hidden md:table-cell">Telefoon</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground hidden lg:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {companyContacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/crm/${c.id}`)}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{c.firstName} {c.lastName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.email || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{c.phone || '—'}</td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs">{STATUS_LABELS[c.status] || c.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Bookings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays size={16} /> Reserveringen ({companyBookings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {companyBookings.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              Geen reserveringen gevonden voor contacten van dit bedrijf.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Datum</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Titel</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground hidden md:table-cell">Ruimte</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground hidden md:table-cell">Tijd</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground hidden lg:table-cell">Contact</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {companyBookings
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((b) => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-foreground">{b.date}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{b.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{b.roomName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                        {String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')} – {String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{b.contactName}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={b.status === 'confirmed' ? 'default' : 'outline'} className="text-xs">
                          {b.status === 'confirmed' ? 'Bevestigd' : 'Optie'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
