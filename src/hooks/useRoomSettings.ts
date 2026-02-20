import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ROOMS, RoomName } from '@/types/crm';

export interface RoomSetting {
  room_name: RoomName;
  max_guests: number;
  display_name?: string;
}

interface RoomSettingsState {
  maxGuests: Record<string, number>;
  displayNames: Record<string, string>;
}

export function useRoomSettings() {
  const { user } = useAuth();
  const [state, setState] = useState<RoomSettingsState>({ maxGuests: {}, displayNames: {} });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('room_settings')
      .select('room_name, max_guests, display_name')
      .eq('user_id', user.id);
    
    const maxGuests: Record<string, number> = {};
    const displayNames: Record<string, string> = {};
    data?.forEach((r: any) => {
      maxGuests[r.room_name] = r.max_guests;
      if (r.display_name) displayNames[r.room_name] = r.display_name;
    });
    setState({ maxGuests, displayNames });
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateRoomSettings = useCallback(async (roomName: string, maxGuests: number, displayName?: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('room_settings')
      .upsert(
        { user_id: user.id, room_name: roomName, max_guests: maxGuests, display_name: displayName || null },
        { onConflict: 'user_id,room_name' }
      );
    if (!error) {
      setState((prev) => ({
        maxGuests: { ...prev.maxGuests, [roomName]: maxGuests },
        displayNames: displayName
          ? { ...prev.displayNames, [roomName]: displayName }
          : (() => { const d = { ...prev.displayNames }; delete d[roomName]; return d; })(),
      }));
    }
    return error;
  }, [user]);

  const getMaxGuests = useCallback((roomName: string): number | undefined => {
    return state.maxGuests[roomName];
  }, [state.maxGuests]);

  const getDisplayName = useCallback((roomName: string): string => {
    return state.displayNames[roomName] || roomName;
  }, [state.displayNames]);

  // Keep backward compat
  const settings = state.maxGuests;

  return { settings, displayNames: state.displayNames, loading, updateRoomSettings, updateMaxGuests: updateRoomSettings, getMaxGuests, getDisplayName };
}
