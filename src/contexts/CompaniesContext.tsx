import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { pushToGHL } from '@/lib/ghlSync';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { capitalizeWords } from '@/lib/utils';
import { parseCrmGroup } from '@/lib/formatters';

export interface Company {
  id: string;
  displayNumber?: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  ghlCompanyId?: string;
  kvk?: string;
  city?: string;
  postcode?: string;
  country?: string;
  customerNumber?: string;
  crmGroup?: string;
  btwNumber?: string;
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
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await (supabase as any)
        .from('companies')
        .select('*')
        .order('name')
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        toast({ title: 'Fout bij laden bedrijven', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      if (data) {
        allRows.push(...data);
        hasMore = data.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    setCompanies(allRows.map((c: any) => ({
        id: c.id,
        displayNumber: c.display_number ? c.display_number.replace(/^BED-/, '#') : undefined,
        name: c.name,
        email: c.email || undefined,
        phone: c.phone || undefined,
        website: c.website || undefined,
        address: c.address || undefined,
        notes: c.notes || undefined,
        ghlCompanyId: c.ghl_company_id || undefined,
        kvk: c.kvk || undefined,
        city: c.city || undefined,
        postcode: c.postcode || undefined,
        country: c.country || undefined,
        customerNumber: c.customer_number || undefined,
        crmGroup: parseCrmGroup(c.crm_group) || undefined,
        btwNumber: c.btw_number || undefined,
        createdAt: c.created_at?.split('T')[0] || '',
      })));
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
    const { data, error } = await (supabase as any).from('companies').upsert({
      user_id: user.id,
      name: capitalizeWords(company.name),
      email: company.email || null,
      phone: company.phone || null,
      website: company.website || null,
      address: company.address || null,
      notes: company.notes || null,
      ghl_company_id: company.ghlCompanyId || null,
      kvk: company.kvk || null,
      city: company.city || null,
      postcode: company.postcode || null,
      country: company.country || null,
      customer_number: company.customerNumber || null,
      crm_group: company.crmGroup || null,
      btw_number: company.btwNumber || null,
    }, { ignoreDuplicates: true }).select().single();
    if (error) {
      toast({ title: 'Fout bij aanmaken bedrijf', description: error.message, variant: 'destructive' });
    }
    if (data) {
      await pushToGHL('push-company', { company: data }, {
        entityType: 'company', entityId: data.id, actionType: 'create',
      });
    }
  }, [user, toast]);

  const updateCompany = useCallback(async (company: Company) => {
    // GHL first: push to GHL before updating local DB
    await pushToGHL('push-company', { company: {
      id: company.id,
      name: capitalizeWords(company.name),
      email: company.email || null,
      phone: company.phone || null,
      website: company.website || null,
      address: company.address || null,
      city: company.city || null,
      postcode: company.postcode || null,
      country: company.country || null,
      ghl_company_id: company.ghlCompanyId || null,
    }}, {
      entityType: 'company', entityId: company.id, actionType: 'update',
    });
    // Then update local DB
    const { error } = await (supabase as any).from('companies').update({
      name: capitalizeWords(company.name),
      email: company.email || null,
      phone: company.phone || null,
      website: company.website || null,
      address: company.address || null,
      notes: company.notes || null,
      ghl_company_id: company.ghlCompanyId || null,
      kvk: company.kvk || null,
      city: company.city || null,
      postcode: company.postcode || null,
      country: company.country || null,
      customer_number: company.customerNumber || null,
      crm_group: company.crmGroup || null,
      btw_number: company.btwNumber || null,
    }).eq('id', company.id);
    if (error) {
      toast({ title: 'Fout bij bijwerken bedrijf', description: error.message, variant: 'destructive' });
    }
  }, [toast]);

  const deleteCompany = useCallback(async (id: string) => {
    // GHL first: delete from GHL before local DB
    const { data: existing } = await (supabase as any).from('companies').select('ghl_company_id').eq('id', id).single();
    if (existing?.ghl_company_id) {
      await pushToGHL('delete-company', { ghl_company_id: existing.ghl_company_id }, {
        entityType: 'company', entityId: id, actionType: 'delete',
      });
    }
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
