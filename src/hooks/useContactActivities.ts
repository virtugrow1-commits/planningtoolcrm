import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface ContactActivity {
  id: string;
  contactId: string;
  type: 'note' | 'call' | 'email' | 'meeting';
  subject: string | null;
  body: string | null;
  createdAt: string;
}

export function useContactActivities(contactId: string | undefined) {
  const [activities, setActivities] = useState<ContactActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    if (!user || !contactId) return;
    const { data, error } = await supabase
      .from('contact_activities')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Fout bij laden activiteiten', description: error.message, variant: 'destructive' });
    }
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
  }, [user, contactId, toast]);

  useEffect(() => { fetch(); }, [fetch]);

  const addActivity = useCallback(async (activity: { type: string; subject?: string; body?: string }) => {
    if (!user || !contactId) return;
    const { error } = await supabase.from('contact_activities').insert({
      user_id: user.id,
      contact_id: contactId,
      type: activity.type,
      subject: activity.subject || null,
      body: activity.body || null,
    } as any);
    if (error) {
      toast({ title: 'Fout bij toevoegen activiteit', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Activiteit toegevoegd' });
    fetch();
  }, [user, contactId, toast, fetch]);

  const deleteActivity = useCallback(async (id: string) => {
    const { error } = await supabase.from('contact_activities').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen', description: error.message, variant: 'destructive' });
      return;
    }
    fetch();
  }, [toast, fetch]);

  return { activities, loading, addActivity, deleteActivity, refetch: fetch };
}
