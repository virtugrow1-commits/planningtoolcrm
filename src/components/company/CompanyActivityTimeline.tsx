import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Phone, Mail, Users, StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const typeConfig: Record<string, { label: string; icon: typeof Phone; color: string }> = {
  call: { label: 'Telefoongesprek', icon: Phone, color: 'text-blue-500' },
  email: { label: 'E-mail', icon: Mail, color: 'text-amber-500' },
  meeting: { label: 'Vergadering', icon: Users, color: 'text-green-500' },
  note: { label: 'Notitie', icon: StickyNote, color: 'text-muted-foreground' },
};

interface Props {
  contactIds: string[];
  contactNames: Record<string, string>;
}

interface Activity {
  id: string;
  contactId: string;
  type: string;
  subject: string | null;
  body: string | null;
  createdAt: string;
}

export default function CompanyActivityTimeline({ contactIds, contactNames }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchAll = useCallback(async () => {
    if (!user || contactIds.length === 0) {
      setActivities([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('contact_activities')
      .select('*')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setActivities(data.map((a: any) => ({
        id: a.id,
        contactId: a.contact_id,
        type: a.type,
        subject: a.subject,
        body: a.body,
        createdAt: a.created_at,
      })));
    }
    setLoading(false);
  }, [user, contactIds]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <p className="text-xs text-muted-foreground">Laden...</p>;
  if (activities.length === 0) return <p className="text-xs text-muted-foreground">Geen gesprekken van contactpersonen</p>;

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
      {activities.map((a) => {
        const cfg = typeConfig[a.type] || typeConfig.note;
        const Icon = cfg.icon;
        const name = contactNames[a.contactId] || 'Onbekend';
        return (
          <div key={a.id} className="flex gap-3 text-sm">
            <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-foreground">{a.subject || cfg.label}</span>
                  <span className="text-[10px] text-primary ml-2">{name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {format(new Date(a.createdAt), 'd MMM yyyy HH:mm', { locale: nl })}
                  </span>
                </div>
              </div>
              {a.body && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.body}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
