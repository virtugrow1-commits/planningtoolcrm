import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { capitalizeWords } from '@/lib/utils';

export interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  ghlCompanyId?: string;
  createdAt: string;
}

interface CompaniesContextType {
  companies: Company[];
  loading: boolean;
  addCompany: (company: Omit<Company, 'id' | 'createdAt'>) => Promise<void>;
  updateCompany: (company: Company) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const CompaniesContext = createContext<CompaniesContextType | null>(null);

export function CompaniesProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchCompanies = useCallback(async () => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from('companies')
      .select('*')
      .order('name');

    if (error) {
      toast({ title: 'Fout bij laden bedrijven', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    if (data) {
      setCompanies(data.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email || undefined,
        phone: c.phone || undefined,
        website: c.website || undefined,
        address: c.address || undefined,
        notes: c.notes || undefined,
        ghlCompanyId: c.ghl_company_id || undefined,
        createdAt: c.created_at?.split('T')[0] || '',
      })));
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('companies-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        fetchCompanies();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchCompanies]);

  const addCompany = useCallback(async (company: Omit<Company, 'id' | 'createdAt'>) => {
    if (!user) return;
    const { error } = await (supabase as any).from('companies').insert({
      user_id: user.id,
      name: capitalizeWords(company.name),
      email: company.email || null,
      phone: company.phone || null,
      website: company.website || null,
      address: company.address || null,
      notes: company.notes || null,
      ghl_company_id: company.ghlCompanyId || null,
    });
    if (error) {
      toast({ title: 'Fout bij aanmaken bedrijf', description: error.message, variant: 'destructive' });
    }
  }, [user, toast]);

  const updateCompany = useCallback(async (company: Company) => {
    const { error } = await (supabase as any).from('companies').update({
      name: capitalizeWords(company.name),
      email: company.email || null,
      phone: company.phone || null,
      website: company.website || null,
      address: company.address || null,
      notes: company.notes || null,
      ghl_company_id: company.ghlCompanyId || null,
    }).eq('id', company.id);
    if (error) {
      toast({ title: 'Fout bij bijwerken bedrijf', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  const deleteCompany = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from('companies').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen bedrijf', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  return (
    <CompaniesContext.Provider value={{ companies, loading, addCompany, updateCompany, deleteCompany, refetch: fetchCompanies }}>
      {children}
    </CompaniesContext.Provider>
  );
}

export function useCompaniesContext() {
  const ctx = useContext(CompaniesContext);
  if (!ctx) throw new Error('useCompaniesContext must be used within CompaniesProvider');
  return ctx;
}
