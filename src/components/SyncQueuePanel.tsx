import { useSyncQueue } from '@/hooks/useSyncQueue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, RotateCcw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const statusConfig: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  pending: { label: 'Wachtend', variant: 'secondary' },
  retrying: { label: 'Herpoging', variant: 'outline' },
  failed: { label: 'Mislukt', variant: 'destructive' },
  completed: { label: 'Voltooid', variant: 'default' },
};

export default function SyncQueuePanel() {
  const { queue, logs, loading, retryItem, dismissItem, retryAll, refetch } = useSyncQueue();

  const failedCount = queue.filter(q => q.status === 'failed').length;
  const pendingCount = queue.filter(q => q.status === 'pending' || q.status === 'retrying').length;

  return (
    <div className="space-y-6">
      {/* Queue overview */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Sync Wachtrij</h3>
          {pendingCount > 0 && <Badge variant="secondary"><Clock size={12} className="mr-1" />{pendingCount} wachtend</Badge>}
          {failedCount > 0 && <Badge variant="destructive"><AlertCircle size={12} className="mr-1" />{failedCount} mislukt</Badge>}
          {queue.length === 0 && <Badge variant="default"><CheckCircle2 size={12} className="mr-1" />Alles gesynchroniseerd</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw size={14} className="mr-1" />Vernieuwen</Button>
          {failedCount > 0 && <Button variant="default" size="sm" onClick={retryAll}><RotateCcw size={14} className="mr-1" />Alles opnieuw</Button>}
        </div>
      </div>

      {/* Queue items */}
      {queue.length > 0 && (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Actie</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Pogingen</th>
              <th className="px-3 py-2 text-left font-medium">Fout</th>
              <th className="px-3 py-2 text-left font-medium">Datum</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {queue.map(item => {
                const cfg = statusConfig[item.status] || statusConfig.pending;
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2 capitalize">{item.entity_type}</td>
                    <td className="px-3 py-2 capitalize">{item.action_type}</td>
                    <td className="px-3 py-2"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                    <td className="px-3 py-2">{item.retry_count}/{item.max_retries}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground" title={item.last_error || ''}>
                      {item.last_error || '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {format(new Date(item.created_at), 'dd MMM HH:mm', { locale: nl })}
                    </td>
                    <td className="px-3 py-2 flex gap-1">
                      {item.status === 'failed' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => retryItem(item.id)} title="Opnieuw proberen">
                          <RotateCcw size={14} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => dismissItem(item.id)} title="Verwijderen">
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent sync logs */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Recente Sync Log</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen sync activiteit.</p>
        ) : (
          <div className="rounded-lg border max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background"><tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Datum</th>
                <th className="px-3 py-2 text-left font-medium">Actie</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Details</th>
              </tr></thead>
              <tbody>
                {logs.slice(0, 50).map(log => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd MMM HH:mm:ss', { locale: nl })}
                    </td>
                    <td className="px-3 py-1.5">{log.action.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={log.status === 'success' ? 'default' : log.status === 'conflict' ? 'secondary' : 'destructive'}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 max-w-[300px] truncate text-muted-foreground">
                      {log.details?.room || log.details?.error || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
