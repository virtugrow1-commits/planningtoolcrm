import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Booking, RoomName } from '@/types/crm';
import { mockBookings } from '@/data/mockData';

interface BookingsContextType {
  bookings: Booking[];
  addBooking: (booking: Booking) => void;
  addBookings: (bookings: Booking[]) => void;
  updateBooking: (booking: Booking) => void;
  deleteBooking: (id: string) => void;
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
}

const BookingsContext = createContext<BookingsContextType | null>(null);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);

  const addBooking = useCallback((booking: Booking) => {
    setBookings((prev) => [...prev, booking]);
  }, []);

  const addBookings = useCallback((newBookings: Booking[]) => {
    setBookings((prev) => [...prev, ...newBookings]);
  }, []);

  const updateBooking = useCallback((updated: Booking) => {
    setBookings((prev) => prev.map((b) => b.id === updated.id ? updated : b));
  }, []);

  const deleteBooking = useCallback((id: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return (
    <BookingsContext.Provider value={{ bookings, addBooking, addBookings, updateBooking, deleteBooking, setBookings }}>
      {children}
    </BookingsContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used within BookingsProvider');
  return ctx;
}
