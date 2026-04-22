import { useSyncQueue } from '@/hooks/useSyncQueue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, RotateCcw, CheckCircle2, AlertCircle, Clock, Loader2, CalendarCheck2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  pending: { label: 'Wachtend', variant: 'secondary' },
  retrying: { label: 'Herpoging', variant: 'outline' },
  failed: { label: 'Mislukt', variant: 'destructive' },
  completed: { label: 'Voltooid', variant: 'default' },
};

export default function SyncQueuePanel() {
  const { queue, logs, loading, retryItem, dismissItem, retryAll, refetch } = useSyncQueue();
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const failedCount = queue.filter(q => q.status === 'failed').length;
  const pendingCount = queue.filter(q => q.status === 'pending' || q.status === 'retrying').length;

  // Find the most recent completed sync run with events_per_calendar info
  const lastPullStats = useMemo(() => {
    for (const log of logs) {
      const epc = (log.details as any)?.results?.events_per_calendar || (log.details as any)?.events_per_calendar;
      if (epc && typeof epc === 'object') {
        return { when: log.created_at, perCalendar: epc as Record<string, number> };
      }
    }
    return null;
  }, [logs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
      toast.success('Sync status vernieuwd');
    } catch {
      toast.error('Kon status niet vernieuwen');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRetryAll = async () => {
    setRetrying(true);
    try {
      await retryAll();
      toast.success('Alle mislukte items worden opnieuw geprobeerd');
      await refetch();
    } catch {
      toast.error('Kon items niet opnieuw proberen');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Queue overview */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Sync Wachtrij</h3>
          {pendingCount > 0 && <Badge variant="secondary"><Clock size={12} className="mr-1" />{pendingCount} wachtend</Badge>}
          {failedCount > 0 && <Badge variant="destructive"><AlertCircle size={12} className="mr-1" />{failedCount} mislukt</Badge>}
          {queue.length === 0 && !loading && <Badge variant="default"><CheckCircle2 size={12} className="mr-1" />Alles gesynchroniseerd</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
            Vernieuwen
          </Button>
          {failedCount > 0 && (
            <Button variant="default" size="sm" onClick={handleRetryAll} disabled={retrying}>
              {retrying ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RotateCcw size={14} className="mr-1" />}
              Alles opnieuw
            </Button>
          )}
        </div>
      </div>

      {/* Queue items */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 size={16} className="animate-spin" />
          Laden...
        </div>
      ) : queue.length > 0 ? (
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
      ) : null}

      {/* Recent sync logs */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Recente Sync Log</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 size={16} className="animate-spin" />
            Laden...
          </div>
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
