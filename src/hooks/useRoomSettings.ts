import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ROOMS, RoomName } from '@/types/crm';

export interface RoomSetting {
  room_name: RoomName;
  max_guests: number;
}

export function useRoomSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('room_settings')
      .select('room_name, max_guests')
      .eq('user_id', user.id);
    
    const map: Record<string, number> = {};
    data?.forEach((r: any) => { map[r.room_name] = r.max_guests; });
    setSettings(map);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateMaxGuests = useCallback(async (roomName: string, maxGuests: number) => {
    if (!user) return;
    const { error } = await supabase
      .from('room_settings')
      .upsert(
        { user_id: user.id, room_name: roomName, max_guests: maxGuests },
        { onConflict: 'user_id,room_name' }
      );
    if (!error) {
      setSettings((prev) => ({ ...prev, [roomName]: maxGuests }));
    }
    return error;
  }, [user]);

  const getMaxGuests = useCallback((roomName: string): number | undefined => {
    return settings[roomName];
  }, [settings]);

  return { settings, loading, updateMaxGuests, getMaxGuests };
}
