export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string;
  dueTime?: string;
  assignedTo?: string;
  companyId?: string;
  contactId?: string;
  inquiryId?: string;
  bookingId?: string;
  ghlTaskId?: string;
  completedAt?: string;
  createdAt: string;
}

export const TASK_STATUSES = [
  { value: 'open', label: 'Open', color: 'bg-info/15 text-info' },
  { value: 'completed', label: 'Afgerond', color: 'bg-success/15 text-success' },
] as const;

export const TASK_PRIORITIES = [
  { value: 'low', label: 'Laag', color: 'text-muted-foreground' },
  { value: 'normal', label: 'Normaal', color: 'text-foreground' },
  { value: 'high', label: 'Hoog', color: 'text-warning' },
  { value: 'urgent', label: 'Urgent', color: 'text-destructive' },
] as const;
