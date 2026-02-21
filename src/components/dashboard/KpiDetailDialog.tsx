import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Pencil, Clock, AlertTriangle, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Task, TASK_STATUSES, TASK_PRIORITIES } from '@/types/task';
import { useTasksContext } from '@/contexts/TasksContext';
import { useToast } from '@/hooks/use-toast';

interface KpiDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'tasks' | 'inquiries' | 'bookings';
  title: string;
  tasks?: Task[];
  inquiries?: any[];
  bookings?: any[];
  onEditTask?: (task: Task) => void;
}

export default function KpiDetailDialog({
  open, onOpenChange, type, title,
  tasks = [], inquiries = [], bookings = [],
  onEditTask,
}: KpiDetailDialogProps) {
  const navigate = useNavigate();
  const { updateTask, deleteTask } = useTasksContext();
  const { toast } = useToast();

  const priorityIcon = (p: Task['priority']) => {
    const cls = TASK_PRIORITIES.find((x) => x.value === p)?.color || '';
    if (p === 'urgent') return <AlertTriangle size={14} className={cls} />;
    if (p === 'high') return <Flag size={14} className={cls} />;
    return null;
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {type === 'tasks' && (
            <div className="divide-y">
              {tasks.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Geen taken gevonden</p>
              )}
              {tasks.map((task) => {
                const statusInfo = TASK_STATUSES.find((s) => s.value === task.status);
                return (
                  <div key={task.id} className="flex items-center gap-3 py-3 group">
                    {priorityIcon(task.priority)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {task.description && <span className="truncate max-w-[200px]">{task.description}</span>}
                        {task.dueDate && (
                          <span className={task.dueDate < today ? 'text-destructive font-medium' : ''}>
                            📅 {task.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo?.color || ''}`}>
                      {statusInfo?.label}
                    </span>
                    <Select
                      value={task.status}
                      onValueChange={(v) => updateTask({ ...task, status: v as Task['status'] })}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onEditTask?.(task)}>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={async () => { await deleteTask(task.id); toast({ title: 'Taak verwijderd' }); }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {type === 'inquiries' && (
            <div className="divide-y">
              {inquiries.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Geen aanvragen gevonden</p>
              )}
              {inquiries.map((inq) => (
                <div
                  key={inq.id}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/20 rounded-lg px-2 transition-colors"
                  onClick={() => { onOpenChange(false); navigate('/inquiries'); }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-card-foreground">{inq.contactName}</p>
                    <p className="text-xs text-muted-foreground">{inq.eventType} · {inq.guestCount} gasten</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {inq.status === 'new' ? 'Nieuw' : 'Gecontacteerd'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {type === 'bookings' && (
            <div className="divide-y">
              {bookings.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Geen boekingen vandaag</p>
              )}
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/20 rounded-lg px-2 transition-colors"
                  onClick={() => { onOpenChange(false); navigate('/calendar'); }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-card-foreground">{booking.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock size={12} />
                      <span>{booking.startHour}:00 – {booking.endHour}:00</span>
                      <span>·</span>
                      <span>{booking.contactName}</span>
                      <span>·</span>
                      <span>{booking.roomName}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${booking.status === 'confirmed' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                    {booking.status === 'confirmed' ? 'Bevestigd' : 'In optie'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}