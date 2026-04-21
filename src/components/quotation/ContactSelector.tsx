import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useContactsContext } from '@/contexts/ContactsContext';

interface ContactSelectorProps {
  value?: string;
  onChange: (contactId: string, contactName: string, companyId?: string, companyName?: string, email?: string) => void;
  /** When set, only contacts linked to this company are shown. */
  filterCompanyId?: string;
}

export default function ContactSelector({ value, onChange, filterCompanyId }: ContactSelectorProps) {
  const [open, setOpen] = useState(false);
  const { contacts } = useContactsContext();

  const filteredContacts = useMemo(() => {
    if (!filterCompanyId) return contacts;
    return contacts.filter((c) => c.companyId === filterCompanyId);
  }, [contacts, filterCompanyId]);

  const selected = useMemo(
    () => contacts.find((c) => c.id === value),
    [contacts, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal">
          {selected ? (
            <span className="flex items-center gap-2">
              <User size={14} className="text-muted-foreground" />
              {selected.firstName} {selected.lastName}
              {selected.company && <span className="text-xs text-muted-foreground">({selected.company})</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {filterCompanyId ? 'Selecteer contactpersoon van dit bedrijf...' : 'Selecteer contactpersoon...'}
            </span>
          )}
          <ChevronsUpDown size={14} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek contactpersoon..." />
          <CommandList>
            <CommandEmpty>
              {filterCompanyId ? 'Geen contactpersonen voor dit bedrijf.' : 'Geen resultaten.'}
            </CommandEmpty>
            <CommandGroup>
              {contacts.slice(0, 50).map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.firstName} ${c.lastName} ${c.company || ''} ${c.email}`}
                  onSelect={() => {
                    // Pass the company id so the parent can fetch full company details (incl. address)
                    onChange(c.id, `${c.firstName} ${c.lastName}`, c.companyId, c.company, c.email);
                    setOpen(false);
                  }}
                >
                  <Check size={14} className={cn('mr-2', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  <div>
                    <p className="text-sm font-medium">{c.firstName} {c.lastName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.company && `${c.company} · `}{c.email}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
