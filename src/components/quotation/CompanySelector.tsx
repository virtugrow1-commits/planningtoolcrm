import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCompaniesContext } from '@/contexts/CompaniesContext';

interface CompanySelectorProps {
  value?: string;
  onChange: (companyId: string | undefined, companyName: string | undefined, company?: any) => void;
}

export default function CompanySelector({ value, onChange }: CompanySelectorProps) {
  const [open, setOpen] = useState(false);
  const { companies } = useCompaniesContext();

  const selected = useMemo(
    () => companies.find((c) => c.id === value),
    [companies, value]
  );

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between h-10 font-normal">
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                <Building2 size={14} className="text-muted-foreground shrink-0" />
                <span className="truncate">{selected.name}</span>
                {selected.city && <span className="text-xs text-muted-foreground">({selected.city})</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">Selecteer bedrijf (optioneel)...</span>
            )}
            <ChevronsUpDown size={14} className="text-muted-foreground shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Zoek bedrijf..." />
            <CommandList>
              <CommandEmpty>Geen resultaten.</CommandEmpty>
              <CommandGroup>
                {companies.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.email || ''} ${c.city || ''}`}
                    onSelect={async () => {
                      const { data: full } = await supabase
                        .from('companies')
                        .select('id, name, email, phone, address, postcode, city, country, kvk, btw_number, website')
                        .eq('id', c.id)
                        .maybeSingle();
                      onChange(c.id, c.name, full);
                      setOpen(false);
                    }}
                  >
                    <Check size={14} className={cn('mr-2', value === c.id ? 'opacity-100' : 'opacity-0')} />
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.city && <p className="text-xs text-muted-foreground">{c.city}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(undefined, undefined)}
          title="Bedrijfsselectie wissen"
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
