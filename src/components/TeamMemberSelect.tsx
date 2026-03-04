import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const RESPONSIBLE_MEMBERS = [
  { value: 'Sjors Jochems', label: 'Sjors Jochems' },
  { value: 'Iris Machielse', label: 'Iris Machielse' },
];

interface Props {
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
}

export default function TeamMemberSelect({ value, onValueChange, placeholder = 'Selecteer...', className }: Props) {
  return (
    <Select
      value={value || '__none__'}
      onValueChange={(v) => onValueChange(v === '__none__' ? undefined : v)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Geen</SelectItem>
        {RESPONSIBLE_MEMBERS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
