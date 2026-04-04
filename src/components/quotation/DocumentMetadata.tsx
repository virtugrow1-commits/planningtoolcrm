import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface MetadataItem {
  label: string;
  value?: string | null;
}

export default function DocumentMetadata({ items }: { items: MetadataItem[] }) {
  const visible = items.filter((i) => i.value);
  if (visible.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-muted-foreground">
          {visible.map((item) => (
            <div key={item.label}>
              <p className="font-semibold mb-0.5">{item.label}</p>
              <p>{item.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function formatDate(date: string, withTime = true) {
  return format(new Date(date), withTime ? 'dd MMM yyyy HH:mm' : 'dd MMM yyyy', { locale: nl });
}
