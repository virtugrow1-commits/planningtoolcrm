import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, ChevronRight, Mail, Phone, Globe, MapPin, Plus, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCompaniesContext, Company } from '@/contexts/CompaniesContext';
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

interface EditableFieldProps {
  label: string;
  value?: string;
  fieldKey: string;
  editing: string | null;
  editValues: Record<string, string>;
  onStartEdit: (key: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (key: string, val: string) => void;
  multiline?: boolean;
}

function EditableField({ label, value, fieldKey, editing, editValues, onStartEdit, onSave, onCancel, onChange, multiline }: EditableFieldProps) {
  const isEditing = editing === fieldKey;
  return (
    <div className="group">
      <p className="text-xs font-semibold text-muted-foreground mb-0.5">{label}</p>
      {isEditing ? (
        <div className="flex items-start gap-1">
          {multiline ? (
            <Textarea
              className="text-sm min-h-[60px]"
              value={editValues[fieldKey] ?? ''}
              onChange={(e) => onChange(fieldKey, e.target.value)}
              autoFocus
            />
          ) : (
            <Input
              className="text-sm h-7"
              value={editValues[fieldKey] ?? ''}
              onChange={(e) => onChange(fieldKey, e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
            />
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onSave}><Check size={14} /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onCancel}><X size={14} /></Button>
        </div>
      ) : (
        <button
          onClick={() => onStartEdit(fieldKey)}
          className="w-full text-left flex items-center gap-1 group/edit hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors"
        >
          <span className="text-sm text-foreground">{value || '—'}</span>
          <Pencil size={12} className="text-muted-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { companies, loading: companiesLoading, updateCompany } = useCompaniesContext();
  const { contacts, loading: contactsLoading } = useContactsContext();
  const { bookings, loading: bookingsLoading } = useBookings();
  const { inquiries } = useInquiriesContext();

  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showAllContacts, setShowAllContacts] = useState(false);

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

  const companyContacts = contacts.filter(
    (c) => c.companyId === company.id || (!c.companyId && c.company && c.company.toLowerCase() === company.name.toLowerCase())
  );
  const contactIds = new Set(companyContacts.map((c) => c.id));
  const companyBookings = bookings.filter((b) => b.contactId && contactIds.has(b.contactId));
  const optionBookings = companyBookings.filter((b) => b.status === 'option');
  const confirmedBookings = companyBookings.filter((b) => b.status === 'confirmed');
  const companyInquiries = inquiries.filter((i) => i.contactId && contactIds.has(i.contactId));

  const startEdit = (key: string) => {
    setEditing(key);
    setEditValues({ [key]: (company as any)[key] || '' });
  };

  const cancelEdit = () => { setEditing(null); setEditValues({}); };

  const saveEdit = async () => {
    if (!editing) return;
    const updated = { ...company, [editing]: editValues[editing]?.trim() || undefined } as Company;
    await updateCompany(updated);
    setEditing(null);
    setEditValues({});
  };

  const changeVal = (key: string, val: string) => setEditValues((prev) => ({ ...prev, [key]: val }));

  const fieldProps = {
    editing, editValues, onStartEdit: startEdit, onSave: saveEdit, onCancel: cancelEdit, onChange: changeVal,
  };

  const visibleContacts = showAllContacts ? companyContacts : companyContacts.slice(0, 4);

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
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 size={24} />
            </div>
            <EditableField label="" value={company.name} fieldKey="name" {...fieldProps} />
          </div>

          <div className="space-y-3">
            <EditableField label="KVK" value={company.kvk} fieldKey="kvk" {...fieldProps} />
            <EditableField label="Adres" value={company.address} fieldKey="address" {...fieldProps} />
            <EditableField label="Plaats" value={company.city} fieldKey="city" {...fieldProps} />
            <EditableField label="Postcode" value={company.postcode} fieldKey="postcode" {...fieldProps} />
            <EditableField label="Land" value={company.country} fieldKey="country" {...fieldProps} />
            <EditableField label="Klantnummer" value={company.customerNumber} fieldKey="customerNumber" {...fieldProps} />
            <EditableField label="E-mail Bedrijf" value={company.email} fieldKey="email" {...fieldProps} />
            <EditableField label="Telefoon" value={company.phone} fieldKey="phone" {...fieldProps} />
            <EditableField label="Website" value={company.website} fieldKey="website" {...fieldProps} />
            <EditableField label="CRM Groep | Doelgroep" value={company.crmGroup} fieldKey="crmGroup" {...fieldProps} />
            <EditableField label="BTW nummer" value={company.btwNumber} fieldKey="btwNumber" {...fieldProps} />
            <EditableField label="Notities" value={company.notes} fieldKey="notes" {...fieldProps} multiline />
          </div>

          <p className="text-xs text-muted-foreground">Aangemaakt: {company.createdAt}</p>
        </div>

        {/* RIGHT CONTENT */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Aanvragen */}
          <SectionCard title="Aanvragen" count={companyInquiries.length} linkLabel="Bekijk alle aanvragen" onLink={() => navigate('/inquiries')} onAdd={() => navigate('/inquiries?new=true')}>
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
                      <span className="text-muted-foreground ml-2">{inq.preferredDate || inq.createdAt}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{INQUIRY_STATUS[inq.status] || inq.status}</Badge>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Reserveringen */}
          <SectionCard title="Reserveringen" count={companyBookings.length} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')} onAdd={() => navigate('/calendar?new=true')}>
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
                        <span className="text-muted-foreground">{b.date} · {String(b.startHour).padStart(2, '0')}:{String(b.startMinute).padStart(2, '0')}–{String(b.endHour).padStart(2, '0')}:{String(b.endMinute).padStart(2, '0')}</span>
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
          <SectionCard title="Opties" count={optionBookings.length} linkLabel="Bekijk agenda" onLink={() => navigate('/calendar')} onAdd={() => navigate('/calendar?new=true')}>
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
                {visibleContacts.map((c) => (
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
                {companyContacts.length > 4 && !showAllContacts && (
                  <button
                    onClick={() => setShowAllContacts(true)}
                    className="w-full text-center py-2 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    {companyContacts.length} contactpersonen (meer)
                  </button>
                )}
                {showAllContacts && companyContacts.length > 4 && (
                  <button
                    onClick={() => setShowAllContacts(false)}
                    className="w-full text-center py-2 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    Minder tonen
                  </button>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, count, children, linkLabel, onLink, onAdd }: {
  title: string;
  count?: number;
  children: React.ReactNode;
  linkLabel?: string;
  onLink?: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="rounded-xl bg-card p-5 card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center justify-center h-5 w-5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title={`Nieuwe ${title.toLowerCase()} toevoegen`}
            >
              <Plus size={12} />
            </button>
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
