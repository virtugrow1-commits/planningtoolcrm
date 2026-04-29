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
  relatedTaskId?: string | null;
}

export interface AddActivityInput {
  type: string;
  subject?: string;
  body?: string;
  relatedTaskId?: string | null;
  createdAt?: string; // ISO; if omitted, server uses now()
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
        relatedTaskId: a.related_task_id ?? null,
      })));
    }
    setLoading(false);
  }, [user, contactId, toast]);

  useEffect(() => { fetch(); }, [fetch]);

  const addActivity = useCallback(async (activity: AddActivityInput) => {
    if (!user || !contactId) return;
    const payload: any = {
      user_id: user.id,
      contact_id: contactId,
      type: activity.type,
      subject: activity.subject || null,
      body: activity.body || null,
      related_task_id: activity.relatedTaskId || null,
    };
    if (activity.createdAt) payload.created_at = activity.createdAt;
    const { error } = await supabase.from('contact_activities').insert(payload);
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

/**
 * Hook to fetch only the gespreksverslagen (call logs) related to a specific task.
 * Used on TaskDetailPage to show the conversation log entries linked to that task.
 */
export function useTaskCallLogs(taskId: string | undefined) {
  const [logs, setLogs] = useState<ContactActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    if (!user || !taskId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('contact_activities')
      .select('*')
      .eq('related_task_id' as any, taskId)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Fout bij laden gespreksverslagen', description: error.message, variant: 'destructive' });
    }
    if (data) {
      setLogs(data.map((a: any) => ({
        id: a.id,
        contactId: a.contact_id,
        type: a.type,
        subject: a.subject,
        body: a.body,
        createdAt: a.created_at,
        relatedTaskId: a.related_task_id ?? null,
      })));
    }
    setLoading(false);
  }, [user, taskId, toast]);

  useEffect(() => { fetch(); }, [fetch]);

  return { logs, loading, refetch: fetch };
}
