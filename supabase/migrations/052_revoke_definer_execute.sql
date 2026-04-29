-- Security Advisor flagde SECURITY DEFINER functies callable door public/authenticated.
-- handle_new_user() is een trigger op auth.users — hoeft niet door users zelf
-- aangeroepen te worden, dus EXECUTE volledig intrekken voor public+authenticated.
-- get_my_administratie_id() wordt vanuit RLS-policies aangeroepen — moet voor
-- authenticated callable blijven, maar voor anonymous (public) niet nodig.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_my_administratie_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_administratie_id() FROM anon;
-- authenticated EXECUTE blijft staan: RLS policies hebben deze nodig.
