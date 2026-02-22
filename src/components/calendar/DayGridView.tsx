import { useState, useCallback, useRef, useMemo, DragEvent, MouseEvent } from 'react';
import { Booking, ROOMS, RoomName } from '@/types/crm';
import { cn } from '@/lib/utils';
import { GripVertical, Plus } from 'lucide-react';

const HOUR_HEIGHT = 64; // px per hour
const QUARTER_HEIGHT = HOUR_HEIGHT / 4; // 16px per 15min
const HOURS = [...Array.from({ length: 17 }, (_, i) => i + 7), 0, 1]; // 07:00–01:00
const TOTAL_SLOTS = HOURS.length * 4; // 15-min slots

function hourToIndex(h: number): number {
  if (h >= 7) return h - 7;
  return h + 17; // 0→17, 1→18
}

function timeToY(hour: number, minute: number): number {
  return (hourToIndex(hour) * 4 + Math.floor(minute / 15)) * QUARTER_HEIGHT;
}

function yToTime(y: number): { hour: number; minute: number } {
  const slot = Math.round(y / QUARTER_HEIGHT);
  const clamped = Math.max(0, Math.min(slot, TOTAL_SLOTS - 1));
  const hourIdx = Math.floor(clamped / 4);
  const minute = (clamped % 4) * 15;
  const hour = hourIdx < 17 ? hourIdx + 7 : hourIdx - 17;
  return { hour, minute };
}

function durationInSlots(b: Booking): number {
  const startY = timeToY(b.startHour, b.startMinute || 0);
  const endY = timeToY(b.endHour, b.endMinute || 0);
  return Math.round((endY - startY) / QUARTER_HEIGHT);
}

function formatTime(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface DayGridViewProps {
  dateStr: string;
  bookings: Booking[];
  onBookingClick: (booking: Booking) => void;
  onCellClick: (room: RoomName, hour: number) => void;
  onBookingMove: (booking: Booking, targetRoom: RoomName, startHour: number, startMinute: number, endHour: number, endMinute: number) => void;
  getDisplayName: (room: RoomName) => string;
  getMaxGuests: (room: string) => number | undefined;
}

export default function DayGridView({
  dateStr,
  bookings,
  onBookingClick,
  onCellClick,
  onBookingMove,
  getDisplayName,
  getMaxGuests,
}: DayGridViewProps) {
  const todayBookings = useMemo(() => bookings.filter((b) => b.date === dateStr), [bookings, dateStr]);

  const [dragging, setDragging] = useState<{ bookingId: string; offsetSlots: number } | null>(null);
  const [ghostPos, setGhostPos] = useState<{ room: RoomName; slot: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const totalHeight = HOURS.length * HOUR_HEIGHT;

  // Get bookings per room
  const bookingsByRoom = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    ROOMS.forEach((r) => { map[r] = []; });
    todayBookings.forEach((b) => {
      if (map[b.roomName]) map[b.roomName].push(b);
    });
    return map;
  }, [todayBookings]);

  const handleMouseDown = useCallback((e: MouseEvent, booking: Booking) => {
    e.preventDefault();
    e.stopPropagation();
    const col = columnRefs.current.get(booking.roomName);
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const yInCol = e.clientY - rect.top + col.scrollTop;
    const bookingTopY = timeToY(booking.startHour, booking.startMinute || 0);
    const offsetSlots = Math.round((yInCol - bookingTopY) / QUARTER_HEIGHT);

    setDragging({ bookingId: booking.id, offsetSlots });
    setGhostPos(null);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    // Find which room column we're over
    let foundRoom: RoomName | null = null;
    let yInCol = 0;
    for (const room of ROOMS) {
      const col = columnRefs.current.get(room);
      if (!col) continue;
      const rect = col.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        foundRoom = room;
        yInCol = e.clientY - rect.top + col.scrollTop;
        break;
      }
    }
    if (!foundRoom) return;

    const slot = Math.round((yInCol / QUARTER_HEIGHT) - dragging.offsetSlots);
    const clamped = Math.max(0, Math.min(slot, TOTAL_SLOTS - 1));
    setGhostPos((prev) => {
      if (prev?.room === foundRoom && prev?.slot === clamped) return prev;
      return { room: foundRoom!, slot: clamped };
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    if (!dragging || !ghostPos) {
      setDragging(null);
      setGhostPos(null);
      return;
    }
    const booking = todayBookings.find((b) => b.id === dragging.bookingId);
    if (!booking) { setDragging(null); setGhostPos(null); return; }

    const slots = durationInSlots(booking);
    const { hour: newStartH, minute: newStartM } = yToTime(ghostPos.slot * QUARTER_HEIGHT);
    const endSlot = ghostPos.slot + slots;
    const { hour: newEndH, minute: newEndM } = yToTime(endSlot * QUARTER_HEIGHT);

    if (newStartH !== booking.startHour || newStartM !== (booking.startMinute || 0) || ghostPos.room !== booking.roomName) {
      onBookingMove(booking, ghostPos.room, newStartH, newStartM, newEndH, newEndM);
    }

    setDragging(null);
    setGhostPos(null);
  }, [dragging, ghostPos, todayBookings, onBookingMove]);

  const draggedBooking = dragging ? todayBookings.find((b) => b.id === dragging.bookingId) : null;
  const draggedSlots = draggedBooking ? durationInSlots(draggedBooking) : 0;

  return (
    <div
      className="overflow-x-auto rounded-xl border bg-card card-shadow select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="flex min-w-[900px]">
        {/* Time column */}
        <div className="sticky left-0 z-10 w-16 shrink-0 bg-card border-r">
          <div className="h-11 border-b bg-muted" />
          <div className="relative" style={{ height: totalHeight }}>
            {HOURS.map((hour, i) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-b px-2 text-[11px] font-medium text-muted-foreground"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="relative -top-2">{String(hour).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>
        </div>

        {/* Room columns */}
        {ROOMS.map((room) => {
          const max = getMaxGuests(room);
          const roomBookings = bookingsByRoom[room] || [];

          return (
            <div
              key={room}
              className="flex-1 min-w-[100px] border-r last:border-r-0"
              ref={(el) => { if (el) columnRefs.current.set(room, el); }}
            >
              {/* Header */}
              <div className="h-11 border-b bg-muted px-1 flex flex-col items-center justify-center">
                <div className="text-[10px] font-semibold text-muted-foreground truncate max-w-full">{getDisplayName(room)}</div>
                {max !== undefined && max > 0 && (
                  <div className="text-[8px] text-muted-foreground/60">max {max}</div>
                )}
              </div>
              {/* Grid body */}
              <div
                className="relative"
                style={{ height: totalHeight }}
                onClick={(e) => {
                  if (dragging) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const { hour } = yToTime(y);
                  onCellClick(room, hour);
                }}
              >
                {/* Hour lines */}
                {HOURS.map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-b border-border/50"
                    style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  >
                    {/* 15-min sub-lines */}
                    <div className="absolute left-0 right-0 border-b border-dashed border-border/20" style={{ top: QUARTER_HEIGHT }} />
                    <div className="absolute left-0 right-0 border-b border-border/30" style={{ top: QUARTER_HEIGHT * 2 }} />
                    <div className="absolute left-0 right-0 border-b border-dashed border-border/20" style={{ top: QUARTER_HEIGHT * 3 }} />
                  </div>
                ))}

                {/* "+" icons for empty hour areas */}
                {HOURS.map((hour, i) => {
                  const hasBooking = roomBookings.some((b) => {
                    const bStart = timeToY(b.startHour, b.startMinute || 0);
                    const bEnd = timeToY(b.endHour, b.endMinute || 0);
                    const cellTop = i * HOUR_HEIGHT;
                    return bStart < cellTop + HOUR_HEIGHT && bEnd > cellTop;
                  });
                  if (hasBooking) return null;
                  return (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 flex items-center justify-center pointer-events-none"
                      style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    >
                      <Plus size={11} className="text-muted-foreground/20" />
                    </div>
                  );
                })}

                {/* Bookings */}
                {roomBookings.map((b) => {
                  const top = timeToY(b.startHour, b.startMinute || 0);
                  const bottom = timeToY(b.endHour, b.endMinute || 0);
                  const height = Math.max(bottom - top, QUARTER_HEIGHT);
                  const isDragged = dragging?.bookingId === b.id;

                  return (
                    <div
                      key={b.id}
                      className={cn(
                        'absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 cursor-grab active:cursor-grabbing transition-opacity overflow-hidden z-10',
                        b.status === 'confirmed'
                          ? 'bg-success/15 border-l-[3px] border-success text-success-foreground'
                          : 'bg-warning/15 border-l-[3px] border-warning text-warning-foreground',
                        isDragged && 'opacity-25'
                      )}
                      style={{ top, height }}
                      onMouseDown={(e) => handleMouseDown(e, b)}
                      onClick={(e) => {
                        if (!dragging) {
                          e.stopPropagation();
                          onBookingClick(b);
                        }
                      }}
                    >
                      <div className="flex items-start gap-1 h-full">
                        <GripVertical size={10} className="mt-0.5 shrink-0 opacity-40" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="text-[11px] font-semibold leading-tight truncate">{b.title}</div>
                          {height >= 32 && <div className="text-[9px] opacity-70 truncate">{b.contactName}</div>}
                          {height >= 44 && (
                            <div className="text-[9px] opacity-60">
                              {formatTime(b.startHour, b.startMinute || 0)}–{formatTime(b.endHour, b.endMinute || 0)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Ghost preview while dragging */}
                {dragging && ghostPos && ghostPos.room === room && draggedBooking && (
                  <div
                    className="absolute left-0.5 right-0.5 rounded-md border-2 border-dashed border-primary/50 bg-primary/10 z-20 pointer-events-none transition-all duration-75"
                    style={{
                      top: ghostPos.slot * QUARTER_HEIGHT,
                      height: draggedSlots * QUARTER_HEIGHT,
                    }}
                  >
                    <div className="px-1.5 py-1 text-[10px] font-medium text-primary truncate">
                      {draggedBooking.title} — {formatTime(yToTime(ghostPos.slot * QUARTER_HEIGHT).hour, yToTime(ghostPos.slot * QUARTER_HEIGHT).minute)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
