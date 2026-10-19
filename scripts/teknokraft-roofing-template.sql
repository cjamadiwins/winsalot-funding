-- REVIEW ONLY. Run manually AFTER explicit approval; never an automatic migration.
-- One transaction, insert-only. No changes to payroll, primary client, or history.
begin;
-- Serializes concurrent executions of this import and roster setup.
select pg_advisory_xact_lock(125683, 929990);
create temporary table roofing_source on commit drop as
select * from jsonb_to_recordset(/*SOURCE_JSON*/::jsonb) as s(
 n integer, business_name text, contact_name text, phone text, phone_key text, email text,
 website text, website_key text, name_key text, street_address text, city text, province text,
 postal_code text, country text, industry text, opportunity text, review text, source jsonb);
create temporary table roofing_import_result (source_row integer, result text, matched_id uuid) on commit drop;
do $roofing$
declare
 v_client uuid; v_agent uuid; v_admin uuid; v_campaign uuid; v_segment uuid; v_match uuid;
 v_segment_name text; v_review boolean; r record;
begin
 select id into strict v_client from public.leadgen_clients where name = 'Teknokraft Canada Inc.' and active and not is_internal_test;
 select id into strict v_agent from public.leadgen_users where lower(email) = 'ogbonnagoodness44@gmail.com' and role = 'agent' and active;
 select id into strict v_admin from public.leadgen_users where lower(email) = 'cjamadiwins@gmail.com' and role = 'admin' and active;
 -- An existing assignment is required. Never guess or replace the other campaign.
 if not exists(select 1 from public.leadgen_campaign_agents a join public.leadgen_campaigns c on c.id=a.campaign_id where a.agent_id=v_agent and c.client_id<>v_client) then
   raise exception 'Expected Goodness existing other-client assignment; review roster before import';
 end if;
 if (select count(*) from public.leadgen_campaigns where client_id=v_client and name='Teknokraft — Toronto / GTA Roofing') > 1 then raise exception 'Ambiguous roofing campaign'; end if;
 select id into v_campaign from public.leadgen_campaigns where client_id=v_client and name='Teknokraft — Toronto / GTA Roofing';
 if v_campaign is null then
   insert into public.leadgen_campaigns(client_id,name,status,target_industry,territory,service_type,description,created_by)
   values(v_client,'Teknokraft — Toronto / GTA Roofing','active','Roofing Contractors','Toronto and Greater Toronto Area, Ontario, Canada','Website redesign, rebranding, SEO and new website development','Roofing prospecting. Missing websites require verification.',v_admin) returning id into v_campaign;
 elsif not exists(select 1 from public.leadgen_campaigns where id=v_campaign and status='active') then raise exception 'Existing roofing campaign is inactive; review before import';
 end if;
 insert into public.leadgen_campaign_agents(campaign_id,agent_id,assigned_by) values(v_campaign,v_agent,v_admin) on conflict(campaign_id,agent_id) do nothing;
 for r in select * from roofing_source order by (review<>''), n loop
   v_match := null;
   -- Dedup across all Teknokraft lists and pipeline records, including removed
   -- records: do not recreate previously removed contacts or touch their history.
   select l.id into v_match from public.call_list_leads l join public.call_list_segments s on s.id=l.segment_id
   join public.leadgen_campaigns c on c.id=s.leadgen_campaign_id
   where c.client_id=v_client and (
     (s.source_file_name=/*SOURCE_FILENAME*/ and l.source_row_number=r.n) or
     (r.phone_key<>'' and right(regexp_replace(coalesce(l.phone,''),'[^0-9]','','g'),10)=r.phone_key) or
     (r.email is not null and lower(trim(l.email))=lower(r.email)) or
     (r.website_key<>'' and lower(regexp_replace(split_part(regexp_replace(coalesce(l.website,''),'^https?://','','i'),'/',1),'^www\.','','i'))=r.website_key) or
     (r.name_key<>'' and regexp_replace(lower(l.business_name),'[^a-z0-9]','','g')=r.name_key and
       ((r.city is not null and lower(trim(l.city))=lower(r.city)) or (r.street_address is not null and lower(trim(l.street_address))=lower(r.street_address))))
   ) order by l.id limit 1;
   if v_match is null then
     select l.id into v_match from public.leadgen_leads l where l.client_id=v_client and (
       (r.phone_key<>'' and right(regexp_replace(coalesce(l.phone,''),'[^0-9]','','g'),10)=r.phone_key) or
       (r.email is not null and lower(trim(l.email))=lower(r.email)) or
       (r.website_key<>'' and lower(regexp_replace(split_part(regexp_replace(coalesce(l.website,''),'^https?://','','i'),'/',1),'^www\.','','i'))=r.website_key) or
       (r.name_key<>'' and regexp_replace(lower(l.business_name),'[^a-z0-9]','','g')=r.name_key and r.city is not null and lower(trim(l.city))=lower(r.city))
     ) order by l.id limit 1;
   end if;
   if v_match is not null then
     insert into roofing_import_result values(r.n,'duplicate_skipped',v_match); continue;
   end if;
   v_review := r.review<>'';
   v_segment_name := 'Teknokraft Roofing — ' || case when v_review then 'Admin Review' when r.opportunity='rebranding' then 'Website Rebranding' when r.opportunity='new_website' then 'New Website' else 'Website Verification Needed' end;
   select id into v_segment from public.call_list_segments where crm='lead_generation' and name=v_segment_name;
   if v_segment is null then
     insert into public.call_list_segments(crm,name,campaign_name,industry,territory,source_file_name,source_file_type,total_uploaded_rows,leadgen_campaign_id,status,deployed_at,deployed_by,created_by)
     values('lead_generation',v_segment_name,'Teknokraft — Toronto / GTA Roofing','Roofing Contractors','Toronto / GTA',/*SOURCE_FILENAME*/,'csv',(select count(*) from roofing_source),v_campaign,case when v_review then 'draft' else 'active' end,case when not v_review then now() end,case when not v_review then v_admin end,v_admin) returning id into v_segment;
   elsif not exists(select 1 from public.call_list_segments where id=v_segment and leadgen_campaign_id=v_campaign and source_file_name=/*SOURCE_FILENAME*/ and status=case when v_review then 'draft' else 'active' end) then
     raise exception 'Existing roofing list conflicts with expected campaign/source/status';
   end if;
   if not v_review then
     if exists(select 1 from public.call_list_segment_agents where segment_id=v_segment and agent_id<>v_agent) then raise exception 'Roofing segment has unexpected agent assignment'; end if;
     insert into public.call_list_segment_agents(segment_id,agent_id) values(v_segment,v_agent) on conflict(segment_id,agent_id) do nothing;
   elsif exists(select 1 from public.call_list_segment_agents where segment_id=v_segment) then raise exception 'Admin review list must have no agent roster';
   end if;
   insert into public.call_list_leads(segment_id,source_row_number,business_name,contact_name,phone,email,website,street_address,city,province,postal_code,country,industry,notes,extra_fields,dnc_flag,assigned_agent_id,created_by)
   values(v_segment,r.n,coalesce(nullif(r.business_name,''),'Business name verification needed'),r.contact_name,r.phone,r.email,r.website,r.street_address,r.city,r.province,r.postal_code,r.country,r.industry,
     case when v_review then r.review else 'LeadSwift roofing prospect. Website redesign / mobile optimization / SEO / rebranding / conversion improvements; new website / SEO setup / online lead generation / Google Business Profile services after website verification.' end,
     r.source || jsonb_build_object('website_opportunity',r.opportunity,'website_verification','unverified','review_reason',r.review),
     exists(select 1 from public.crm_dnc_suppressions d where d.status='active' and d.removed_at is null and ((d.block_phone and r.phone_key<>'' and right(d.normalized_phone,10)=r.phone_key) or (d.block_email and r.email is not null and lower(d.normalized_email)=lower(r.email)))),
     case when not v_review then v_agent end,v_admin);
   insert into roofing_import_result values(r.n,case when v_review then 'admin_review' else r.opportunity end,null);
 end loop;
end;
$roofing$;
select result, count(*) as rows from roofing_import_result group by result order by result;
-- Full row-level audit includes database matches; capture this output at execution.
select * from roofing_import_result order by source_row;
commit;
