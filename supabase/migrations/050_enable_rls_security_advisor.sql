-- Supabase Security Advisor flagde 9 tabellen zonder RLS. We zetten RLS aan
-- en maken policies passend bij elk schema. Service-role bypasses RLS sowieso,
-- dus alle bestaande server-actions blijven werken (die gebruiken service-role
-- of eigen scoping).

-- 1. ai_tekening_feedback — gebruikers-feedback op AI, cross-administratie
--    leerset (geen administratie_id kolom). Authenticated mag lezen + schrijven.
ALTER TABLE IF EXISTS ai_tekening_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_tekening_feedback_authenticated" ON ai_tekening_feedback;
CREATE POLICY "ai_tekening_feedback_authenticated" ON ai_tekening_feedback
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. ai_tekening_template — gedeelde template-leerset
ALTER TABLE IF EXISTS ai_tekening_template ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_tekening_template_authenticated" ON ai_tekening_template;
CREATE POLICY "ai_tekening_template_authenticated" ON ai_tekening_template
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. audit_log — alleen lezen door eigen administratie
ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_admin_read" ON audit_log;
CREATE POLICY "audit_log_admin_read" ON audit_log
  FOR SELECT TO authenticated
  USING (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
  );

-- 4. bekende_leveranciers — gedeelde leverancier-registry
ALTER TABLE IF EXISTS bekende_leveranciers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bekende_leveranciers_authenticated" ON bekende_leveranciers;
CREATE POLICY "bekende_leveranciers_authenticated" ON bekende_leveranciers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. leverancier_detectie_log — diagnostiek-log, gedeeld
ALTER TABLE IF EXISTS leverancier_detectie_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leverancier_detectie_log_authenticated" ON leverancier_detectie_log;
CREATE POLICY "leverancier_detectie_log_authenticated" ON leverancier_detectie_log
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. leverancier_prijs_correctie — gedeelde prijs-leerset
ALTER TABLE IF EXISTS leverancier_prijs_correctie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leverancier_prijs_correctie_authenticated" ON leverancier_prijs_correctie;
CREATE POLICY "leverancier_prijs_correctie_authenticated" ON leverancier_prijs_correctie
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 7. login_audit — geen user_id of administratie_id, dus deny-all voor
--    authenticated. Service-role schrijft + leest via bypass. Hiermee
--    voorkom je dat anonymous/authenticated users login-pogingen kunnen
--    uitlezen (privacy + brute-force gevoelig).
ALTER TABLE IF EXISTS login_audit ENABLE ROW LEVEL SECURITY;
-- Geen policy = niemand mag iets via PostgREST. Service-role bypasses.

-- 8. offerte_concept_state — wizard-state, gescoped per administratie
ALTER TABLE IF EXISTS offerte_concept_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offerte_concept_state_admin_scope" ON offerte_concept_state;
CREATE POLICY "offerte_concept_state_admin_scope" ON offerte_concept_state
  FOR ALL TO authenticated
  USING (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
  )
  WITH CHECK (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
  );

-- 9. tfa_codes — alleen eigenaar mag lezen/wijzigen
ALTER TABLE IF EXISTS tfa_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tfa_codes_self" ON tfa_codes;
CREATE POLICY "tfa_codes_self" ON tfa_codes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
