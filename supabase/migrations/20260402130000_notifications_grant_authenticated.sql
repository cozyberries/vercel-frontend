-- Table privileges were only postgres + service_role; RLS alone is not enough.
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
