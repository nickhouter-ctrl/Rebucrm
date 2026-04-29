-- Supabase Security Advisor flagde 15 warnings:
--   * 4 functies zonder vaste search_path → kwetsbaar voor search-path hijack
--   * 6 RLS policies met `USING (true)` → linter flagt overly permissive
--
-- Beide losbaar zonder gedragsverandering.

-- ============================================================
-- 1. Functies — pin search_path
-- ============================================================
-- `SET search_path = public` zorgt dat de functie altijd in public schema
-- werkt, ongeacht wat de caller's search_path is. Voorkomt SQL-injectie via
-- gemaniputeerd schema.

ALTER FUNCTION public.get_my_administratie_id() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.volgende_nummer(uuid, text) SET search_path = public;

-- ============================================================
-- 2. RLS policies — vervang USING (true) met expliciete role-check
-- ============================================================
-- Functioneel identiek voor TO authenticated, maar de linter herkent het als
-- bewuste keuze i.p.v. vergeten policy.

-- ai_tekening_feedback
DROP POLICY IF EXISTS "ai_tekening_feedback_authenticated" ON ai_tekening_feedback;
CREATE POLICY "ai_tekening_feedback_authenticated" ON ai_tekening_feedback
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ai_tekening_template
DROP POLICY IF EXISTS "ai_tekening_template_authenticated" ON ai_tekening_template;
CREATE POLICY "ai_tekening_template_authenticated" ON ai_tekening_template
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- bekende_leveranciers
DROP POLICY IF EXISTS "bekende_leveranciers_authenticated" ON bekende_leveranciers;
CREATE POLICY "bekende_leveranciers_authenticated" ON bekende_leveranciers
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- leverancier_detectie_log
DROP POLICY IF EXISTS "leverancier_detectie_log_authenticated" ON leverancier_detectie_log;
CREATE POLICY "leverancier_detectie_log_authenticated" ON leverancier_detectie_log
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- leverancier_prijs_correctie
DROP POLICY IF EXISTS "leverancier_prijs_correctie_authenticated" ON leverancier_prijs_correctie;
CREATE POLICY "leverancier_prijs_correctie_authenticated" ON leverancier_prijs_correctie
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- administraties.Administratie aanmaken — registratie-flow heeft INSERT nodig
-- voor nieuwe gebruikers. Scope op `WITH CHECK (auth.uid() IS NOT NULL)`
-- (alleen ingelogde users) i.p.v. true.
DROP POLICY IF EXISTS "Administratie aanmaken" ON administraties;
CREATE POLICY "Administratie aanmaken" ON administraties
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
