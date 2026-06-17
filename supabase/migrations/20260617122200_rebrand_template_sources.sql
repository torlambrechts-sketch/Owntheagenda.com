-- =====================================================================
-- OwnTheAgenda · 0022 · Drop placeholder brand name from template sources
-- ---------------------------------------------------------------------
-- 0019 attributed two reworked templates as "Conscia original …" (a name
-- carried in from the research docs). This product is OwnTheAgenda — fix
-- the live attribution strings.
-- =====================================================================

update public.template
set source = replace(source, 'Conscia original', 'OwnTheAgenda original')
where workspace_id is null and source like 'Conscia original%';
