update public.crm_clients
set status = 'Archived',
    pre_archive_status = status,
    archived_at = now(),
    updated_at = now()
where (company_name = 'Brent''s Essentials' and status = 'Active')
   or (company_name = 'Mantra Collab' and status = 'Pilot');
