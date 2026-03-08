import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Mapping of room_name → list of rooms it conflicts with (beyond itself) */
type ConflictMap = Record<string, string[]>;

export function useRoomConflicts() {
  const [conflictMap, setConflictMap] = useState<ConflictMap>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('room_conflict_rules')
        .select('room_name, conflicts_with');
      const map: ConflictMap = {};
      for (const row of data || []) {
        if (!map[row.room_name]) map[row.room_name] = [];
        map[row.room_name].push(row.conflicts_with);
      }
      setConflictMap(map);
    })();
  }, []);

  /** Get all room names that must be checked for conflicts when booking `roomName` */
  const getConflictRooms = useCallback(
    (roomName: string): string[] => {
      return [roomName, ...(conflictMap[roomName] || [])];
    },
    [conflictMap]
  );

  return { conflictMap, getConflictRooms };
}
