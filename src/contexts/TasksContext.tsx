import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';
import { Task } from '@/types/task';
import { useToast } from '@/hooks/use-toast';

interface TasksContextType {
  tasks: Task[];
  loading: boolean;
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

const TasksContext = createContext<TasksContextType | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await (supabase as any)
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        toast({ title: 'Fout bij laden taken', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      if (data) {
        allRows.push(...data);
        hasMore = data.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    setTasks(allRows.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description || undefined,
        status: t.status as Task['status'],
        priority: t.priority as Task['priority'],
        dueDate: t.due_date || undefined,
        assignedTo: t.assigned_to || undefined,
        companyId: t.company_id || undefined,
        contactId: t.contact_id || undefined,
        inquiryId: t.inquiry_id || undefined,
        bookingId: t.booking_id || undefined,
        ghlTaskId: t.ghl_task_id || undefined,
        completedAt: t.completed_at || undefined,
        createdAt: t.created_at?.split('T')[0],
      })));
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchTasks]);

  const addTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt'>) => {
    if (!user) return;
    const { data, error } = await (supabase as any).from('tasks').insert({
      user_id: user.id,
      title: task.title,
      description: task.description || null,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate || null,
      assigned_to: task.assignedTo || null,
      company_id: task.companyId || null,
      contact_id: task.contactId || null,
      inquiry_id: task.inquiryId || null,
      booking_id: task.bookingId || null,
      ghl_task_id: task.ghlTaskId || null,
      completed_at: task.status === 'completed' ? new Date().toISOString() : null,
    }).select().single();
    if (error) {
      toast({ title: 'Fout bij aanmaken taak', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) {
      await pushToGHL('push-task', { task: data });
    }
  }, [user, toast]);

  const updateTask = useCallback(async (task: Task) => {
    // GHL first: push to GHL before updating local DB
    if (task.ghlTaskId) {
      await pushToGHL('push-task', { task: {
        id: task.id,
        ghl_task_id: task.ghlTaskId,
        title: task.title,
        description: task.description || null,
        status: task.status,
        due_date: task.dueDate || null,
        completed_at: task.status === 'completed' ? new Date().toISOString() : null,
        contact_id: task.contactId || null,
      }});
    }
    // Then update local DB
    const completedAt = task.status === 'completed'
      ? (task.completedAt || new Date().toISOString())
      : null;
    const { data, error } = await (supabase as any).from('tasks').update({
      title: task.title,
      description: task.description || null,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate || null,
      assigned_to: task.assignedTo || null,
      company_id: task.companyId || null,
      contact_id: task.contactId || null,
      inquiry_id: task.inquiryId || null,
      booking_id: task.bookingId || null,
      ghl_task_id: task.ghlTaskId || null,
      completed_at: completedAt,
    }).eq('id', task.id).select().single();
    if (error) {
      toast({ title: 'Fout bij bijwerken taak', description: error.message, variant: 'destructive' });
      return;
    }
    // If no GHL task yet, push the saved data to create one
    if (data && !task.ghlTaskId) {
      await pushToGHL('push-task', { task: data });
    }
  }, [toast]);

  const deleteTask = useCallback(async (id: string) => {
    const { data: existing } = await (supabase as any).from('tasks').select('ghl_task_id').eq('id', id).single();
    // GHL first: delete from GHL before local DB
    if (existing?.ghl_task_id) {
      await pushToGHL('delete-task', { ghl_task_id: existing.ghl_task_id });
    }
    const { error } = await (supabase as any).from('tasks').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen taak', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  const deleteTasks = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      await deleteTask(id);
    }
  }, [deleteTask]);

  return (
    <TasksContext.Provider value={{ tasks, loading, addTask, updateTask, deleteTask, deleteTasks, refetch: fetchTasks }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasksContext() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasksContext must be used within TasksProvider');
  return ctx;
}
