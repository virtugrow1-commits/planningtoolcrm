ALTER TABLE public.bookings ADD COLUMN inquiry_id uuid NULL REFERENCES public.inquiries(id) ON DELETE SET NULL;
CREATE INDEX idx_bookings_inquiry_id ON public.bookings(inquiry_id);