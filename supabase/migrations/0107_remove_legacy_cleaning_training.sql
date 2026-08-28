-- Growth CRM training cleanup.
--
-- Remove retired industry-specific lessons left behind by the former
-- service model. The current Growth CRM curriculum is generic Winsalot
-- training for lead generation and business financing.

delete from public.crm_training_materials
where title ilike '%cleaning%'
   or content ilike '%cleaning%'
   or coalesce(category, '') ilike '%cleaning%'
   or title ilike '%janitorial%'
   or content ilike '%janitorial%'
   or coalesce(category, '') ilike '%janitorial%';
