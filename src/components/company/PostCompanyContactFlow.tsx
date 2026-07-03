import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarIcon, UserPlus, Link2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { DMU_OPTIONS, FUNCTION_GROUP_OPTIONS } from '@/lib/contactOptions';
import CrmCombobox from '@/components/CrmCombobox';

interface Props {
  /** When set, the flow is active for this newly created company. Set to null to close. */
  company: { id: string; name: string } | null;
  onClose: () => void;
}

type Step = 'ask' | 'form' | 'link' | 'another';


const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  department: '',
  dmu: '',
  functionGroup: '',
  birthDate: undefined as Date | undefined,
};

/**
 * Three-step flow shown after creating a new company:
 *   1. "Contactpersoon toevoegen?" (yes/no)
 *   2. Inline contact form (linked to the new company)
 *   3. "Nog een contactpersoon toevoegen?" (yes/no)
 */
export default function PostCompanyContactFlow({ company, onClose }: Props) {
  const navigate = useNavigate();
  const { contacts, addContact, updateContact } = useContactsContext();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('ask');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  // Guard against Radix firing onOpenChange(false) when we navigate between steps
  const transitioningRef = useRef(false);

  // Reset step whenever a new company comes in.
  useEffect(() => {
    if (company) {
      setStep('ask');
      setForm(emptyForm);
      transitioningRef.current = false;
    }
  }, [company?.id]);

  if (!company) return null;

  const goToStep = (next: Step) => {
    transitioningRef.current = true;
    setStep(next);
    // Release the guard after Radix has processed the close event
    setTimeout(() => { transitioningRef.current = false; }, 50);
  };

  const handleClose = (open: boolean) => {
    if (open) return;
    if (transitioningRef.current) return; // ignore close during step transitions
    finish(false);
  };

  const handleSaveContact = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ title: 'Vul minimaal voor- en achternaam in', variant: 'destructive' });
      return;
    }
    setSaving(true);
    await addContact({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      jobTitle: form.jobTitle || undefined,
      department: form.department || undefined,
      dmu: form.dmu || undefined,
      functionGroup: form.functionGroup || undefined,
      birthDate: form.birthDate ? format(form.birthDate, 'yyyy-MM-dd') : undefined,
      company: company.name,
      companyId: company.id,
      status: 'lead',
    });
    setSaving(false);
    toast({ title: `${form.firstName} ${form.lastName} gekoppeld aan ${company.name}` });
    setForm(emptyForm);
    goToStep('another');
  };

  const finish = (goToCompany: boolean) => {
    onClose();
    if (goToCompany) navigate(`/companies/${company.id}`);
  };

  return (
    <>
      {/* Step 1: ask if user wants to add a contact */}
      <AlertDialog open={step === 'ask'} onOpenChange={handleClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contactpersoon toevoegen?</AlertDialogTitle>
            <AlertDialogDescription>
              Bedrijf <strong>{company.name}</strong> is aangemaakt. Wil je nu direct een contactpersoon toevoegen aan dit bedrijf?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>Nee, sluiten</AlertDialogCancel>
            <AlertDialogAction onClick={() => goToStep('form')}>
              <UserPlus size={14} className="mr-1" /> Ja, contact toevoegen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: contact form */}
      <Dialog open={step === 'form'} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contactpersoon toevoegen</DialogTitle>
            <DialogDescription>Aan bedrijf <strong>{company.name}</strong></DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Voornaam *</Label>
                <Input autoFocus value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Achternaam *</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Functie</Label>
                <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Afdeling</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>DMU</Label>
                <Select value={form.dmu} onValueChange={(v) => setForm({ ...form, dmu: v })}>
                  <SelectTrigger><SelectValue placeholder="Kies DMU..." /></SelectTrigger>
                  <SelectContent>
                    {DMU_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Functiegroep</Label>
                <Select value={form.functionGroup} onValueChange={(v) => setForm({ ...form, functionGroup: v })}>
                  <SelectTrigger><SelectValue placeholder="Kies functiegroep..." /></SelectTrigger>
                  <SelectContent>
                    {FUNCTION_GROUP_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Telefoon</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Geboortedatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className={cn('w-full justify-start text-left font-normal', !form.birthDate && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.birthDate ? format(form.birthDate, 'dd-MM-yyyy') : <span>Kies geboortedatum</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.birthDate}
                    onSelect={(d) => setForm({ ...form, birthDate: d })}
                    captionLayout="dropdown-buttons"
                    fromYear={1930}
                    toYear={new Date().getFullYear()}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => finish(false)} disabled={saving}>Annuleren</Button>
            <Button onClick={handleSaveContact} disabled={saving}>
              {saving ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 3: ask for another */}
      <AlertDialog open={step === 'another'} onOpenChange={handleClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nog een contactpersoon toevoegen?</AlertDialogTitle>
            <AlertDialogDescription>
              De contactpersoon is gekoppeld aan <strong>{company.name}</strong>. Wil je er nog één toevoegen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => finish(true)}>Naar bedrijfspagina</Button>
            <AlertDialogCancel onClick={() => finish(false)}>Nee, klaar</AlertDialogCancel>
            <AlertDialogAction onClick={() => goToStep('form')}>
              <UserPlus size={14} className="mr-1" /> Ja, nog één
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
