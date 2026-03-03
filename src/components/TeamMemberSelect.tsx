import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
}

export default function TeamMemberSelect({ value, onValueChange, placeholder = 'Selecteer...', className }: Props) {
  const { members, loading } = useTeamMembers();

  return (
    <Select
      value={value || '__none__'}
      onValueChange={(v) => onValueChange(v === '__none__' ? undefined : v)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={loading ? 'Laden...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Geen</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.displayName}>
            {m.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
