import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ROOMS, RoomName } from '@/types/crm';

export interface RoomSetting {
  room_name: RoomName;
  max_guests: number;
  display_name?: string;
  ghl_calendar_id?: string;
  enabled?: boolean;
}

interface RoomSettingsState {
  maxGuests: Record<string, number>;
  displayNames: Record<string, string>;
  ghlCalendarIds: Record<string, string>;
  enabledRooms: Record<string, boolean>;
}

export function useRoomSettings() {
  const { user } = useAuth();
  const [state, setState] = useState<RoomSettingsState>({ maxGuests: {}, displayNames: {}, ghlCalendarIds: {}, enabledRooms: {} });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('room_settings')
      .select('room_name, max_guests, display_name, ghl_calendar_id, enabled')
      .eq('user_id', user.id);
    
    const maxGuests: Record<string, number> = {};
    const displayNames: Record<string, string> = {};
    const ghlCalendarIds: Record<string, string> = {};
    const enabledRooms: Record<string, boolean> = {};
    data?.forEach((r: any) => {
      maxGuests[r.room_name] = r.max_guests;
      if (r.display_name) displayNames[r.room_name] = r.display_name;
      if (r.ghl_calendar_id) ghlCalendarIds[r.room_name] = r.ghl_calendar_id;
      enabledRooms[r.room_name] = r.enabled !== false;
    });
    setState({ maxGuests, displayNames, ghlCalendarIds, enabledRooms });
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateRoomSettings = useCallback(async (roomName: string, maxGuests: number, displayName?: string, ghlCalendarId?: string, enabled?: boolean) => {
    if (!user) return;
    const isEnabled = enabled !== undefined ? enabled : true;
    const { error } = await supabase
      .from('room_settings')
      .upsert(
        { user_id: user.id, room_name: roomName, max_guests: maxGuests, display_name: displayName || null, ghl_calendar_id: ghlCalendarId || null, enabled: isEnabled } as any,
        { onConflict: 'user_id,room_name' }
      );
    if (!error) {
      setState((prev) => ({
        maxGuests: { ...prev.maxGuests, [roomName]: maxGuests },
        displayNames: displayName
          ? { ...prev.displayNames, [roomName]: displayName }
          : (() => { const d = { ...prev.displayNames }; delete d[roomName]; return d; })(),
        ghlCalendarIds: ghlCalendarId
          ? { ...prev.ghlCalendarIds, [roomName]: ghlCalendarId }
          : (() => { const g = { ...prev.ghlCalendarIds }; delete g[roomName]; return g; })(),
        enabledRooms: { ...prev.enabledRooms, [roomName]: isEnabled },
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

  const isRoomEnabled = useCallback((roomName: string): boolean => {
    // If no setting exists, room is enabled by default
    return state.enabledRooms[roomName] !== false;
  }, [state.enabledRooms]);

  const enabledRooms = state.enabledRooms;

  // Keep backward compat
  const settings = state.maxGuests;

  return { settings, displayNames: state.displayNames, ghlCalendarIds: state.ghlCalendarIds, enabledRooms, loading, updateRoomSettings, updateMaxGuests: updateRoomSettings, getMaxGuests, getDisplayName, isRoomEnabled };
}
