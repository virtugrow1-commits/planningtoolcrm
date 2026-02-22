import { User, Mail, Phone, Building2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  contactId: string;
  contactName: string;
  phone?: string;
  email?: string;
}

interface ContactDetails {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
}

export default function ContactDetailsPanel({ contactId, contactName, phone, email }: Props) {
  const navigate = useNavigate();
  const [contact, setContact] = useState<ContactDetails | null>(null);

  useEffect(() => {
    const fetchContact = async () => {
      if (!contactId) return;
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, company, status')
        .eq('ghl_contact_id', contactId)
        .maybeSingle();
      if (data) setContact(data);
    };
    fetchContact();
  }, [contactId]);

  const displayEmail = contact?.email || email;
  const displayPhone = contact?.phone || phone;

  return (
    <div className="w-64 border-l bg-card hidden lg:flex flex-col shrink-0">
      <div className="p-4 border-b">
        <h3 className="text-sm font-semibold text-foreground">Contactgegevens</h3>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-muted p-3 mb-2">
            <User size={24} className="text-muted-foreground" />
          </div>
          <p className="font-medium text-sm text-foreground">{contact ? `${contact.first_name} ${contact.last_name}` : contactName}</p>
          {contact?.status && (
            <span className="text-[10px] text-muted-foreground mt-0.5">{contact.status}</span>
          )}
        </div>

        <div className="space-y-3">
          {displayEmail && (
            <div className="flex items-center gap-2 text-xs">
              <Mail size={13} className="text-muted-foreground shrink-0" />
              <span className="text-foreground truncate">{displayEmail}</span>
            </div>
          )}
          {displayPhone && (
            <div className="flex items-center gap-2 text-xs">
              <Phone size={13} className="text-muted-foreground shrink-0" />
              <span className="text-foreground">{displayPhone}</span>
            </div>
          )}
          {contact?.company && (
            <div className="flex items-center gap-2 text-xs">
              <Building2 size={13} className="text-muted-foreground shrink-0" />
              <span className="text-foreground truncate">{contact.company}</span>
            </div>
          )}
        </div>

        {contact && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => navigate(`/crm/contact/${contact.id}`)}
          >
            <ExternalLink size={12} className="mr-1" />
            Open in CRM
          </Button>
        )}
      </div>
    </div>
  );
}
