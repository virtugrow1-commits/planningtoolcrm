import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamMember {
  id: string;
  displayName: string;
}

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name')
        .order('display_name');
      if (data) {
        setMembers(data.map(p => ({
          id: p.id,
          displayName: p.display_name || 'Onbekend',
        })));
      }
      setLoading(false);
    })();
  }, [user]);

  return { members, loading };
}
