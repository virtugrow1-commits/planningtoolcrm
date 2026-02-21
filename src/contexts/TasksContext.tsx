import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { pushToGHL } from '@/lib/ghlSync';
import { Task } from '@/types/task';

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

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTasks(data.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description || undefined,
        status: t.status as Task['status'],
        priority: t.priority as Task['priority'],
        dueDate: t.due_date || undefined,
        assignedTo: t.assigned_to || undefined,
        contactId: t.contact_id || undefined,
        inquiryId: t.inquiry_id || undefined,
        bookingId: t.booking_id || undefined,
        ghlTaskId: t.ghl_task_id || undefined,
        completedAt: t.completed_at || undefined,
        createdAt: t.created_at?.split('T')[0],
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Realtime subscription
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
    const { data } = await (supabase as any).from('tasks').insert({
      user_id: user.id,
      title: task.title,
      description: task.description || null,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate || null,
      assigned_to: task.assignedTo || null,
      contact_id: task.contactId || null,
      inquiry_id: task.inquiryId || null,
      booking_id: task.bookingId || null,
      ghl_task_id: task.ghlTaskId || null,
      completed_at: task.status === 'completed' ? new Date().toISOString() : null,
    }).select().single();
    if (data) {
      pushToGHL('push-task', { task: data });
    }
  }, [user]);

  const updateTask = useCallback(async (task: Task) => {
    const { data } = await (supabase as any).from('tasks').update({
      title: task.title,
      description: task.description || null,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate || null,
      assigned_to: task.assignedTo || null,
      contact_id: task.contactId || null,
      inquiry_id: task.inquiryId || null,
      booking_id: task.bookingId || null,
      ghl_task_id: task.ghlTaskId || null,
      completed_at: task.status === 'completed' ? new Date().toISOString() : null,
    }).eq('id', task.id).select().single();
    if (data) {
      pushToGHL('push-task', { task: data });
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    const { data: existing } = await (supabase as any).from('tasks').select('ghl_task_id').eq('id', id).single();
    await (supabase as any).from('tasks').delete().eq('id', id);
    if (existing?.ghl_task_id) {
      pushToGHL('delete-task', { ghl_task_id: existing.ghl_task_id });
    }
  }, []);

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
