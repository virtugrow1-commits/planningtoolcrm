import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, User, CalendarDays, ChevronRight, Mail, Phone, Globe, MapPin, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompaniesContext } from '@/contexts/CompaniesContext';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useInquiriesContext } from '@/contexts/InquiriesContext';

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Klant',
  inactive: 'Inactief',
};

const BOOKING_STATUS: Record<string, string> = {
  confirmed: 'Bevestigd',
  option: 'Optie',
};

const INQUIRY_STATUS: Record<string, string> = {
  new: 'Nieuw',
  contacted: 'Contactgelegd',
  option: 'Optie',
  quoted: 'Offerte',
  quote_revised: 'Offerte herzien',
  reserved: 'Gereserveerd',
  confirmed: 'Bevestigd',
  invoiced: 'Gefactureerd',
  converted: 'Definitief',
  lost: 'Verloren',
  after_sales: 'Aftersales',
};

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companies, loading: companiesLoading } = useCompaniesContext();
  const { contacts, loading: contactsLoading } = useContactsContext();
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries } = useInquiriesContext();

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

  // Find contacts linked via company_id FK, fallback to name match
  const companyContacts = contacts.filter(
    (c) => c.companyId === company.id || (!c.companyId && c.company && c.company.toLowerCase() === company.name.toLowerCase())
  );

  const contactIds = new Set(companyContacts.map((c) => c.id));

  // Find bookings linked to any of these contacts
  const companyBookings = bookings.filter((b) => b.contactId && contactIds.has(b.contactId));
  const optionBookings = companyBookings.filter((b) => b.status === 'option');
  const confirmedBookings = companyBookings.filter((b) => b.status === 'confirmed');

  // Find inquiries linked to contacts
  const companyInquiries = inquiries.filter((i) => i.contactId && contactIds.has(i.contactId));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/companies')} className="hover:text-foreground transition-colors">Bedrijven</button>
        <ChevronRight size={14} />
        <span className="text-foreground font-medium">{company.name}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDEBAR — Company Info */}
        <div className="w-full lg:w-80 shrink-0 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 size={24} />
            </div>
            <h1 className="text-xl font-bold text-foreground">{company.name}</h1>
          </div>

          <div className="space-y-3 text-sm">
            {company.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail size={14} className="shrink-0" />
                <span>{company.email}</span>
              </div>
            )}
            {company.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone size={14} className="shrink-0" />
                <span>{company.phone}</span>
              </div>
            )}
            {company.website && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe size={14} className="shrink-0" />
                <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a>
              </div>
            )}
            {company.address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin size={14} className="shrink-0" />
                <span>{company.address}</span>
              </div>
            )}
          </div>

          {company.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Notities</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{company.notes}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">Aangemaakt: {company.createdAt}</p>
        </div>

        {/* RIGHT CONTENT — Sections */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Aanvragen */}
          <SectionCard title="Aanvragen" count={companyInquiries.length} linkLabel="Bekijk alle aanvragen" onLink={() => navigate('/inquiries')}>
            {companyInquiries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen aanvragen</p>
            ) : (
              <div className="space-y-1">
                {companyInquiries.slice(0, 8).map((inq) => (
                  <button
                    key={inq.id}
                    onClick={() => navigate('/inquiries')}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">{inq.eventType}</span>
                      <span className="text-muted-foreground ml-2">{inq.createdAt}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{INQUIRY_STATUS[inq.status] || inq.status}</Badge>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Reserveringen */}
          <SectionCard title="Reserveringen" count={companyBookings.length} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')}>
            {companyBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen reserveringen</p>
            ) : (
              <div className="space-y-1">
                {companyBookings
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 8)
                  .map((b) => (
                    <button
                      key={b.id}
                      onClick={() => navigate(`/calendar?date=${b.date}`)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{b.title}</span>
                        <span className="text-muted-foreground ml-2">{b.roomName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{b.date}</span>
                        <Badge variant={b.status === 'confirmed' ? 'default' : 'outline'} className="text-[10px]">
                          {BOOKING_STATUS[b.status] || b.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </SectionCard>

          {/* Opties */}
          <SectionCard title="Opties" count={optionBookings.length} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')}>
            {optionBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen opties</p>
            ) : (
              <div className="space-y-1">
                {optionBookings
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 8)
                  .map((b) => (
                    <button
                      key={b.id}
                      onClick={() => navigate(`/calendar?date=${b.date}`)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{b.title}</span>
                        <span className="text-muted-foreground ml-2">{b.roomName}</span>
                      </div>
                      <span className="text-muted-foreground shrink-0">{b.date} · {String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')} – {String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}</span>
                    </button>
                  ))}
              </div>
            )}
          </SectionCard>

          {/* Contactpersonen */}
          <SectionCard title="Contactpersonen" count={companyContacts.length}>
            {companyContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen contactpersonen gevonden.</p>
            ) : (
              <div className="space-y-1">
                {companyContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/crm/${c.id}`)}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">{c.firstName} {c.lastName}</span>
                      {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[c.status] || c.status}</Badge>
                      <ChevronRight size={12} className="text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, count, children, linkLabel, onLink }: {
  title: string;
  count?: number;
  children: React.ReactNode;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
        </div>
        {linkLabel && onLink && (
          <button onClick={onLink} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
            {linkLabel} <ChevronRight size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
