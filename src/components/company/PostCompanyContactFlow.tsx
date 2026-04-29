import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useContactsContext } from '@/contexts/ContactsContext';
import { useToast } from '@/hooks/use-toast';
import { UserPlus } from 'lucide-react';

interface Props {
  /** When set, the flow is active for this newly created company. Set to null to close. */
  company: { id: string; name: string } | null;
  onClose: () => void;
}

type Step = 'ask' | 'form' | 'another';

const emptyForm = { firstName: '', lastName: '', email: '', phone: '', jobTitle: '' };

/**
 * Three-step flow shown after creating a new company:
 *   1. "Contactpersoon toevoegen?" (yes/no)
 *   2. Inline contact form (linked to the new company)
 *   3. "Nog een contactpersoon toevoegen?" (yes/no)
 */
export default function PostCompanyContactFlow({ company, onClose }: Props) {
  const navigate = useNavigate();
  const { addContact } = useContactsContext();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('ask');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Reset step whenever a new company comes in.
  useEffect(() => {
    if (company) {
      setStep('ask');
      setForm(emptyForm);
    }
  }, [company?.id]);

  if (!company) return null;

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
      company: company.name,
      companyId: company.id,
      status: 'lead',
    });
    setSaving(false);
    toast({ title: `${form.firstName} ${form.lastName} gekoppeld aan ${company.name}` });
    setForm(emptyForm);
    setStep('another');
  };

  const finish = (goToCompany: boolean) => {
    onClose();
    if (goToCompany) navigate(`/companies/${company.id}`);
  };

  return (
    <>
      {/* Step 1: ask if user wants to add a contact */}
      <AlertDialog open={step === 'ask'} onOpenChange={(o) => { if (!o) finish(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contactpersoon toevoegen?</AlertDialogTitle>
            <AlertDialogDescription>
              Bedrijf <strong>{company.name}</strong> is aangemaakt. Wil je nu direct een contactpersoon toevoegen aan dit bedrijf?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>Nee, sluiten</AlertDialogCancel>
            <AlertDialogAction onClick={() => setStep('form')}>
              <UserPlus size={14} className="mr-1" /> Ja, contact toevoegen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: contact form */}
      <Dialog open={step === 'form'} onOpenChange={(o) => { if (!o) finish(false); }}>
        <DialogContent className="max-w-md">
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
            <div className="grid gap-1.5">
              <Label>Functie</Label>
              <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
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
      <AlertDialog open={step === 'another'} onOpenChange={(o) => { if (!o) finish(false); }}>
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
            <AlertDialogAction onClick={() => setStep('form')}>
              <UserPlus size={14} className="mr-1" /> Ja, nog één
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
