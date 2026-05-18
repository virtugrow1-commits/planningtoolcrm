import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const MEMBERS = ['Sjors Jochems', 'Iris Machielse'];

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
  compact?: boolean;
}

export default function TeamMemberMultiSelect({ value, onChange, className, compact }: Props) {
  const toggle = (name: string, checked: boolean) => {
    onChange(checked ? [...value, name] : value.filter((n) => n !== name));
  };
  return (
    <div className={cn('flex flex-col gap-2 rounded-md border bg-background p-2.5', compact && 'p-2 gap-1.5', className)}>
      {MEMBERS.map((name) => (
        <label key={name} className={cn('flex items-center gap-2 cursor-pointer', compact ? 'text-xs' : 'text-sm')}>
          <Checkbox
            checked={value.includes(name)}
            onCheckedChange={(v) => toggle(name, !!v)}
          />
          {name}
        </label>
      ))}
    </div>
  );
}
