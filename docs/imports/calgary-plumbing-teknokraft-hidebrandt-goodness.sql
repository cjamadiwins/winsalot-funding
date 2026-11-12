-- STATUS: PREPARED (dry run by default: v_commit=false rolls everything back and reports the result in the error message).
-- Lead Generation CRM data-only import. Calgary plumbing (LeadSwift) -> two separate client call lists, both assigned to Goodness Ugbana:
--   Teknokraft Canada Inc. – Calgary Plumbers – Goodness
--   Hidebrandt Web Services – Calgary Plumbers – Goodness
-- Source CSV (unchanged, repo root, commit aab75d4): campaign-126099-search-936476-plumber_calgary-ab-canada_f22477f777549da932842739c405d692.csv (1,262 data rows).
-- Loading: the database fetches the CSV from the repo at the pinned commit with pg_net (net.http_get), so the file is never retyped.
--   select net.http_get('https://raw.githubusercontent.com/cjamadiwins/winsalot-funding/aab75d46473744603e6992971c450f085edfdb4f/<csv>');  -- then set v_req below
--   The script aborts unless the downloaded bytes match the repo file md5 (bf3057e32153dcbdefbbb9ee7eeed359).
-- CSV row 39 (Milani Plumbing) has a broken quote in its category field; it is repaired in memory (category 'Plumbers & Plumbing Contractors,Boiler Service & Repair')
--   and its original raw text is kept in extra_fields.source_row.raw with malformed=true.
-- Every CSV row is kept in call_list_leads (nothing skipped): eligible rows in the client's active list, everything else in that client's draft Admin Review list
--   (Admin-only, unassigned, not visible to agents). Duplicates are flagged is_possible_duplicate and never become active leads.
-- Categories (extra_fields.website_category): no_website | website_rebrand | website_review | admin_review.
--   no_website      website blank, or only a social/directory profile.
--   website_rebrand own website with objective crawler signals (served over plain http with no SSL, free site-builder domain, or neither title tag nor meta description).
--                   Crawler signals only, no manual site audit; agents qualify on the call.
--   website_review  own website, no strong signal; agent qualification required. Missing title or description alone is noted as an SEO signal.
--   admin_review    no valid phone, outside the Calgary area / location unconfirmed, plumbing fit unconfirmed (supplier, HVAC or general only), shared phone/website/address
--                   between different businesses, duplicate inside the file, already in the CRM (same business) or phone belonging to another CRM business, active DNC.
-- Allocation: each business (normalized name) belongs to exactly one client. Eligible businesses are ordered no_website, website_rebrand, website_review
--   (then most Google-visibility/SEO signals first, then CSV order) and dealt alternately Teknokraft, Hidebrandt. Lead order in each list follows that priority.
-- Insert-only: asserts that no pre-existing row in 16 tables changed. Nothing is attached to Winsalot Corp. Test. Re-running aborts on the existing source file.
do $imp$
declare
 v_commit boolean := false;
 v_req bigint := 22172;
 v_file text := 'campaign-126099-search-936476-plumber_calgary-ab-canada_f22477f777549da932842739c405d692.csv';
 v_md5 text := 'bf3057e32153dcbdefbbb9ee7eeed359';
 v_rows int := 1262;
 v_content text; v_old text; v_new text;
 tok text; cur text := ''; flds text[] := '{}'; rawl text := ''; rown int := 0; hdr text[];
 v_admin uuid; v_goodness uuid; v_tk uuid; v_hb uuid; v_test uuid;
 v_camp_tk uuid; v_camp_hb uuid; v_seg_tk uuid; v_seg_hb uuid; v_rev_tk uuid; v_rev_hb uuid;
 t text; changed boolean; v_report jsonb;
 v_tables text[] := array['call_list_leads','call_list_segments','call_list_segment_agents','leadgen_campaigns','leadgen_campaign_agents','leadgen_clients','leadgen_leads','leadgen_call_logs','leadgen_followups','leadgen_appointments','leadgen_emails','leadgen_conversions','leadgen_users','leadgen_payroll','crm_payroll','crm_dnc_suppressions'];
 v_camp_name text := 'Lead Generation for Website & SEO — Calgary Plumbing Contractors';
begin
 perform pg_advisory_xact_lock(hashtextextended('leadgen-plumbing-calgary-126099',0));
 if exists(select 1 from public.call_list_segments where source_file_name=v_file) then raise exception 'Source already imported; inspect existing segments instead of restarting'; end if;
 select content into strict v_content from net._http_response where id=v_req and status_code=200;
 if md5(convert_to(v_content,'UTF8'))<>v_md5 then raise exception 'Downloaded CSV does not match the repo file'; end if;

 create temporary table calg_baseline(table_name text,digest text) on commit drop;
 foreach t in array v_tables loop
  execute format('insert into calg_baseline select %L,md5(to_jsonb(r)::text) from public.%I r',t,t);
 end loop;

 -- Parse CSV (RFC 4180 tokenizer; repair the single broken row first)
 v_content:=replace(v_content,chr(65279),'');
 v_old:=E',Plumbers & Plumbing Contractors","Boiler Service & Repair""",';
 v_new:=E',"Plumbers & Plumbing Contractors,Boiler Service & Repair",';
 if (length(v_content)-length(replace(v_content,v_old,'')))/length(v_old)<>1 then raise exception 'Expected exactly one malformed row'; end if;
 v_content:=replace(v_content,v_old,v_new);
 create temporary table calg_raw(n int primary key, raw text, f text[], malformed boolean) on commit drop;
 for tok in select m[1] from regexp_matches(v_content,'("(?:[^"]|"")*"|[^,"\r\n]+|,|\r?\n)','g') with ordinality as t(m,o) order by o loop
  if tok=',' then flds:=flds||cur; cur:=''; rawl:=rawl||tok;
  elsif tok ~ '^\r?\n$' then
   if rawl<>'' or cardinality(flds)>0 or cur<>'' then
    flds:=flds||cur;
    if rown=0 then hdr:=flds; else insert into calg_raw values(rown,rawl,flds,false); end if;
    rown:=rown+1;
   end if;
   cur:=''; flds:='{}'; rawl:='';
  elsif left(tok,1)='"' then cur:=replace(substr(tok,2,length(tok)-2),'""','"'); rawl:=rawl||tok;
  else cur:=tok; rawl:=rawl||tok; end if;
 end loop;
 if rawl<>'' or cardinality(flds)>0 or cur<>'' then flds:=flds||cur; insert into calg_raw values(rown,rawl,flds,false); end if;
 if (select count(*) from calg_raw)<>v_rows then raise exception 'CSV row count % <> %',(select count(*) from calg_raw),v_rows; end if;
 if exists(select 1 from calg_raw where cardinality(f)<>35) or cardinality(hdr)<>35 then raise exception 'Unexpected column count after parsing'; end if;
 -- the repaired row keeps its original text and is flagged
 update calg_raw set malformed=true, raw=replace(raw,v_new,v_old) where raw like '%'||replace(v_new,'\','\\')||'%';
 if (select count(*) from calg_raw where malformed)<>1 then raise exception 'Malformed-row flag failed'; end if;

 -- Normalised source rows
 create temporary table calg_a on commit drop as
 select n, raw, f, malformed,
  btrim(f[2]) as name, nullif(btrim(f[3]),'') as addr, nullif(btrim(f[4]),'') as web, nullif(btrim(f[6]),'') as email,
  case when length(d)=10 then d when length(d)=11 and left(d,1)='1' then substr(d,2) end as phone10,
  regexp_replace(regexp_replace(regexp_replace(lower(replace(btrim(f[2]),'&',' and ')),'\m(ltd|inc|incorporated|corp|corporation|limited|co|company|llc|the)\M','','g'),'[^a-z0-9]','','g'),'^$','row'||n) as name_key,
  coalesce(regexp_replace(regexp_replace(lower(coalesce(btrim(f[4]),'')),'^https?://(www\.)?','','g'),'[/?#].*$',''),'') as website_key,
  nullif(btrim(f[31]),'') as category, nullif(f[7],'')::numeric as g_rating, nullif(f[8],'')::int as g_reviews
 from (select r.*, regexp_replace(coalesce(r.f[5],''),'\D','','g') as d from calg_raw r) r;

 create temporary table calg_b on commit drop as
 select a.*,
  case when web is null then 'none'
   when website_key ~ '(wixsite\.com|business\.site|godaddysites\.com|weebly\.com|square\.site|webs\.com|sites\.google\.com|wordpress\.com|blogspot\.com|myshopify\.com|netlify\.app)$' then 'free'
   when website_key ~ '(^|\.)(facebook|instagram|yelp|linkedin|homestars|yellowpages|yp|canpages|twitter|youtube|tiktok|google|bbb|kijiji|houzz|thumbtack|trustedpros|nextdoor|pinterest|cylex|opendi)\.(com|ca|ee|org|net)$'
     or website_key in ('x.com','g.page','goo.gl','fb.com','fb.me','linktr.ee','411.ca') then 'social'
   else 'own' end as site_kind,
  (select c from unnest(array['Calgary','Airdrie','Cochrane','Chestermere','Okotoks','Rocky View','Balzac','Bragg Creek','Springbank','Langdon','Priddis','Bearspaw','De Winton','Redwood Meadows']) c where addr ilike '%'||c||'%' limit 1) as metro_city,
  coalesce(addr ~* '\m(edmonton|red deer|lethbridge|canmore|high river|strathmore|carstairs|medicine hat|banff|brooks|olds|innisfail|didsbury|claresholm|stettler|nanton|vulcan|lacombe|sherwood park|st\. albert|fort mcmurray|grande prairie|leduc|spruce grove|camrose|turner valley|black diamond|brant)\M',false) as other_city,
  coalesce(substring(upper(addr) from '[A-Z][0-9][A-Z]') ~ '^(T2[A-Z]|T1Y|T1X|T1S|T3[ABCEGHJKLMNPRZ]|T4[ABC])$',false) as fsa_metro,
  nullif(upper(substring(upper(addr) from '[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]')),'') as postal_raw,
  regexp_replace(regexp_replace(lower(addr),'[, ]*canada$',''),'[^a-z0-9]','','g') as addr_key,
  left(phone10,3) in ('403','587','825','368') as area_ab,
  (f[24]='0' and coalesce(web,'') !~* '^https://') as sig_nossl, f[16]='0' as sig_notitle, f[17]='0' as sig_nodesc,
  (coalesce(g_reviews,0)<10) as sig_g_reviews, (g_rating is null or g_rating<4.0) as sig_g_rating
 from calg_a a;

 create temporary table calg_ex on commit drop as
 select regexp_replace(regexp_replace(lower(replace(coalesce(business_name,''),'&',' and ')),'\m(ltd|inc|incorporated|corp|corporation|limited|co|company|llc|the)\M','','g'),'[^a-z0-9]','','g') as name_key,
  right(regexp_replace(coalesce(phone,''),'\D','','g'),10) as phone10,
  split_part(regexp_replace(regexp_replace(lower(coalesce(website,'')),'^https?://(www\.)?','','g'),'[/?#].*$',''),'/',1) as website_key
 from (select business_name,phone,website from public.call_list_leads union all select business_name,phone,website from public.leadgen_leads) x;

 create temporary table calg_c on commit drop as
 select b.*,
  (phone10 is null) as r_phone,
  (addr is null and not area_ab) or (addr is not null and not (metro_city is not null or (fsa_metro and not other_city))) as r_loc,
  (coalesce(category,'') ~* '(supply|store|wholesale|distribut)' or lower(name) ~ '\m(wolseley|ferguson|home depot|rona|lowes?|costco|canadian tire)\M')
   or not (lower(coalesce(category,'')||' '||name) ~ '(plumb|drain|sewer|rooter|pipe|water heater|boiler|hydronic|gas ?fit|leak)') as r_fit,
  exists(select 1 from calg_b p where p.n<>b.n and p.name_key=b.name_key
   and ((p.phone10 is not null and p.phone10=b.phone10) or (p.website_key<>'' and p.website_key=b.website_key))
   and ((p.phone10 is not null),(p.web is not null),(p.addr is not null),-p.n) > ((b.phone10 is not null),(b.web is not null),(b.addr is not null),-b.n)) as dup_in_file,
  (phone10 is not null and exists(select 1 from calg_b p where p.n<>b.n and p.phone10=b.phone10 and p.name_key<>b.name_key)) as shared_phone,
  (website_key<>'' and exists(select 1 from calg_b p where p.n<>b.n and p.website_key=b.website_key and p.name_key<>b.name_key)) as shared_web,
  (addr ~ '^[0-9]' and exists(select 1 from calg_b p where p.n<>b.n and p.name_key<>b.name_key and p.addr_key=b.addr_key)) as shared_addr,
  exists(select 1 from calg_ex e where e.name_key=b.name_key and ((b.phone10 is not null and e.phone10=b.phone10) or (b.phone10 is null and b.website_key<>'' and e.website_key=b.website_key))) as ex_match,
  (phone10 is not null and exists(select 1 from calg_ex e where e.phone10=b.phone10 and e.name_key<>b.name_key)) as ex_phone_conflict,
  exists(select 1 from public.crm_dnc_suppressions d where d.status='active' and d.removed_at is null and d.block_phone and b.phone10 is not null and right(d.normalized_phone,10)=b.phone10) as dnc
 from calg_b b;

 -- Classification
 create temporary table calg_d on commit drop as
 select c.*,
  case when dup_in_file then 'duplicate' when ex_match then 'existing'
   when r_phone or r_loc or r_fit or shared_phone or shared_web or shared_addr or ex_phone_conflict or dnc then 'admin_review'
   when site_kind in ('none','social') then 'no_website'
   when site_kind='free' or sig_nossl or (sig_notitle and sig_nodesc) then 'website_rebrand'
   else 'website_review' end as bucket,
  concat_ws('; ',
   case when dup_in_file then 'Duplicate of another row in this CSV (same business name and phone/website)' end,
   case when ex_match then 'Business already exists in the CRM (same name and phone/website)' end,
   case when r_phone then 'No valid phone number' end,
   case when r_loc then case when addr is null then 'No address and phone area code outside Alberta; location unconfirmed' else 'Address outside Calgary service area or location not identifiable' end end,
   case when r_fit then 'Plumbing contractor fit unconfirmed (supplier, store, HVAC or general category)' end,
   case when shared_phone then 'Shared phone between different source business names' end,
   case when shared_web then 'Shared website domain between different source businesses; verify ownership/location' end,
   case when shared_addr then 'Shared street address between source businesses; verify identity' end,
   case when ex_phone_conflict then 'Phone already belongs to another CRM business; Admin review' end,
   case when dnc then 'Active DNC suppression' end) as reason,
  case when dup_in_file then 'duplicate_in_file' when ex_match then 'existing_crm' when dnc then 'dnc'
   when shared_phone or shared_web or shared_addr or ex_phone_conflict then 'shared_identifier'
   when r_phone or r_loc then 'incomplete_or_outside_area' when r_fit then 'fit_unconfirmed' end as review_kind,
  (case when site_kind in ('none','social') then 0 else sig_nossl::int+sig_notitle::int+sig_nodesc::int+(site_kind='free')::int end + sig_g_reviews::int + sig_g_rating::int) as sig
 from calg_c c;
 alter table calg_d add column bucket_rank int, add column client text, add column prio int;
 update calg_d set bucket_rank=case bucket when 'no_website' then 1 when 'website_rebrand' then 2 when 'website_review' then 3 end;

 -- Allocation: one client per business (normalized name); eligible groups dealt alternately in priority order
 create temporary table calg_g on commit drop as
 select name_key, case when row_number() over (order by bucket_rank, sig desc, n)%2=1 then 'tk' else 'hb' end as client
 from (select distinct on (name_key) name_key, bucket_rank, sig, n from calg_d where bucket_rank is not null order by name_key, bucket_rank, sig desc, n) x;
 create temporary table calg_rg on commit drop as
 select name_key, case when row_number() over (order by mn)%2=1 then 'tk' else 'hb' end as client
 from (select name_key, min(n) mn from calg_d where name_key not in (select name_key from calg_g) group by name_key) x;
 update calg_d d set client=coalesce((select client from calg_g g where g.name_key=d.name_key),(select client from calg_rg r where r.name_key=d.name_key));
 update calg_d d set prio=x.p from (select n, row_number() over (partition by client, bucket_rank is not null order by coalesce(bucket_rank,0), sig desc, n) p from calg_d) x where x.n=d.n;
 if exists(select 1 from calg_d where client is null or prio is null) then raise exception 'Allocation incomplete'; end if;

 -- Campaigns, call lists and Goodness access
 select id into strict v_admin from public.leadgen_users where role='admin' and active and full_name='Winsalot Corp.';
 select id into strict v_goodness from public.leadgen_users where full_name='Goodness Ugbana' and role='agent' and active;
 select id into strict v_tk from public.leadgen_clients where name='Teknokraft Canada Inc.' and active and not coalesce(is_internal_test,false);
 select id into strict v_hb from public.leadgen_clients where name='Hidebrandt Web Services' and active and not coalesce(is_internal_test,false);
 select id into strict v_test from public.leadgen_clients where name='Winsalot Corp. Test' and is_internal_test;
 if exists(select 1 from public.leadgen_campaigns where client_id in (v_tk,v_hb) and name=v_camp_name) then raise exception 'Calgary plumbing campaign already exists; inspect before import'; end if;
 insert into public.leadgen_campaigns(client_id,name,description,status,territory,target_industry,assigned_team,start_date,created_by,qualification_criteria)
 values(v_tk,v_camp_name,'Calgary plumbing contractor website design, rebrand and SEO prospecting for Goodness Ugbana. Website Review / Rebrand means agent qualification is required; no website defect is presumed.',
  'active','Calgary, Alberta','Plumbing Contractors','Goodness Ugbana',current_date,v_admin,
  array['Confirm Calgary-area service and plumbing business fit','Speak with decision maker','Qualify interest in website design, rebrand, SEO or Google visibility without presuming a website defect']) returning id into v_camp_tk;
 insert into public.leadgen_campaigns(client_id,name,description,status,territory,target_industry,assigned_team,start_date,created_by,qualification_criteria)
 select v_hb,name,description,status,territory,target_industry,assigned_team,start_date,created_by,qualification_criteria from public.leadgen_campaigns where id=v_camp_tk returning id into v_camp_hb;
 insert into public.leadgen_campaign_agents(campaign_id,agent_id,assigned_by) values(v_camp_tk,v_goodness,v_admin),(v_camp_hb,v_goodness,v_admin);
 insert into public.call_list_segments(crm,name,leadgen_campaign_id,status,created_by,campaign_name,industry,territory,source_file_name,source_file_type,total_uploaded_rows,deployed_at,deployed_by)
 values('lead_generation',E'Teknokraft Canada Inc. – Calgary Plumbers – Goodness',v_camp_tk,'active',v_admin,v_camp_name,'Plumbing Contractors','Calgary, Alberta',v_file,'csv',0,now(),v_admin) returning id into v_seg_tk;
 insert into public.call_list_segments(crm,name,leadgen_campaign_id,status,created_by,campaign_name,industry,territory,source_file_name,source_file_type,total_uploaded_rows,deployed_at,deployed_by)
 values('lead_generation',E'Hidebrandt Web Services – Calgary Plumbers – Goodness',v_camp_hb,'active',v_admin,v_camp_name,'Plumbing Contractors','Calgary, Alberta',v_file,'csv',0,now(),v_admin) returning id into v_seg_hb;
 insert into public.call_list_segments(crm,name,leadgen_campaign_id,status,created_by,campaign_name,industry,territory,source_file_name,source_file_type,total_uploaded_rows)
 values('lead_generation',E'Teknokraft Canada Inc. – Calgary Plumbers – Admin Review (Admin Only)',v_camp_tk,'draft',v_admin,v_camp_name,'Plumbing Contractors','Calgary, Alberta',v_file,'csv',0) returning id into v_rev_tk;
 insert into public.call_list_segments(crm,name,leadgen_campaign_id,status,created_by,campaign_name,industry,territory,source_file_name,source_file_type,total_uploaded_rows)
 values('lead_generation',E'Hidebrandt Web Services – Calgary Plumbers – Admin Review (Admin Only)',v_camp_hb,'draft',v_admin,v_camp_name,'Plumbing Contractors','Calgary, Alberta',v_file,'csv',0) returning id into v_rev_hb;
 insert into public.call_list_segment_agents(segment_id,agent_id) values(v_seg_tk,v_goodness),(v_seg_hb,v_goodness);

 insert into public.call_list_leads(segment_id,source_row_number,business_name,phone,email,website,street_address,city,province,postal_code,country,industry,notes,extra_fields,is_possible_duplicate,duplicate_reason,dnc_flag,assigned_agent_id,created_by,created_at)
 select case when bucket_rank is not null then (case client when 'tk' then v_seg_tk else v_seg_hb end) else (case client when 'tk' then v_rev_tk else v_rev_hb end) end,
  n,name,case when phone10 is not null then '+1'||phone10 end,email,web,addr,metro_city,'AB',
  case when postal_raw is not null then left(replace(postal_raw,' ',''),3)||' '||right(replace(postal_raw,' ',''),3) end,'Canada','Plumbing Contractors',
  case bucket
   when 'no_website' then 'No identifiable business website in source; confirm website status during the call. A social/directory profile is not a standalone business website.'
   when 'website_rebrand' then 'Website present. Crawler signals (unverified, no manual site audit): '||concat_ws(', ',case when sig_nossl then 'served over plain http with no SSL' end,case when site_kind='free' then 'free site-builder domain' end,case when sig_notitle then 'no page title tag' end,case when sig_nodesc then 'no meta description')||'. Qualify website redesign/rebrand, SEO and Google visibility without presuming a defect.'
   when 'website_review' then 'Website present; qualify website design, redesign, SEO, mobile experience or lead-generation needs without presuming a defect.'||case when sig_notitle or sig_nodesc then ' SEO signal (unverified): '||concat_ws(', ',case when sig_notitle then 'no page title tag' end,case when sig_nodesc then 'no meta description' end)||'.' else '' end
   else reason end
   ||case when bucket_rank is not null and addr is null then ' No street address in source (Alberta area code); confirm Calgary-area service on the call.' else '' end
   ||case when bucket_rank is not null and (sig_g_reviews or sig_g_rating) then ' Google visibility gap: '||coalesce(g_rating::text||' rating','no Google rating')||', '||coalesce(g_reviews,0)||' reviews.' else '' end,
  jsonb_build_object('source_file',v_file,'import_batch','calgary-plumbing-2026-11-12',
   'leadswift',jsonb_build_object('campaign_id',126099,'search_id',936476,'search_type',f[32],'crawler_status',f[33],'status',f[1]),
   'source_row',jsonb_build_object('n',n,'raw',raw,'malformed',malformed)||jsonb_object(hdr,f),
   'website_category',case when bucket_rank is not null then bucket else 'admin_review' end,
   'review_reason',case when bucket_rank is null then reason else '' end,'review_kind',review_kind,
   'allocated_client',case client when 'tk' then 'Teknokraft Canada Inc.' else 'Hidebrandt Web Services' end,'priority_rank',prio,'signal_count',sig),
  (dup_in_file or ex_match or shared_phone or shared_web or shared_addr or ex_phone_conflict),
  case when dup_in_file or ex_match or shared_phone or shared_web or shared_addr or ex_phone_conflict then reason end,
  dnc, case when bucket_rank is not null then v_goodness end, v_admin,
  now()+(prio*interval '1 millisecond')
 from calg_d;
 update public.call_list_segments s set total_uploaded_rows=(select count(*) from public.call_list_leads l where l.segment_id=s.id) where s.id in(v_seg_tk,v_seg_hb,v_rev_tk,v_rev_hb);

 -- Verification (aborts and rolls back on any failure)
 foreach t in array v_tables loop
  execute format('select exists(select 1 from calg_baseline b where b.table_name=%2$L and b.digest not in (select md5(to_jsonb(r)::text) from public.%1$I r))',t,t) into changed;
  if changed then raise exception 'Pre-existing rows changed in %; rollback',t; end if;
 end loop;
 if (select count(*) from public.call_list_leads where segment_id in(v_seg_tk,v_seg_hb,v_rev_tk,v_rev_hb))<>v_rows
  or (select count(distinct source_row_number) from public.call_list_leads where segment_id in(v_seg_tk,v_seg_hb,v_rev_tk,v_rev_hb))<>v_rows then raise exception 'Row reconciliation failed'; end if;
 if exists(select 1 from public.call_list_leads where segment_id in(v_seg_tk,v_seg_hb) and (assigned_agent_id is distinct from v_goodness or dnc_flag or is_possible_duplicate or phone is null)) then raise exception 'Active list contains an ineligible lead'; end if;
 if exists(select 1 from public.call_list_leads where segment_id in(v_rev_tk,v_rev_hb) and assigned_agent_id is not null) then raise exception 'Review leads must be unassigned'; end if;
 if exists(select 1 from public.call_list_leads a join public.call_list_leads b on b.phone=a.phone and a.segment_id=v_seg_tk and b.segment_id=v_seg_hb) then raise exception 'Same business phone in both active campaigns'; end if;
 if (select count(*) from public.call_list_leads where segment_id in(v_seg_tk,v_seg_hb))<>(select count(distinct phone) from public.call_list_leads where segment_id in(v_seg_tk,v_seg_hb)) then raise exception 'Duplicate phone inside active lists'; end if;
 if exists(select 1 from calg_d group by name_key having count(distinct client)>1) then raise exception 'A business was split across both clients'; end if;
 if exists(select 1 from public.call_list_segment_agents where segment_id in(v_seg_tk,v_seg_hb) and agent_id<>v_goodness) or exists(select 1 from public.call_list_segment_agents where segment_id in(v_rev_tk,v_rev_hb)) then raise exception 'Wrong segment agents'; end if;
 if (select count(*) from public.leadgen_campaign_agents where campaign_id in(v_camp_tk,v_camp_hb))<>2 then raise exception 'Unexpected campaign agents'; end if;
 if exists(select 1 from public.leadgen_campaigns where client_id=v_test and created_at>now()-interval '1 minute') then raise exception 'Test client touched'; end if;

 select jsonb_build_object('csv_rows',(select count(*) from calg_raw),
  'checksum_md5',(select md5(string_agg(n||'|'||name||'|'||coalesce(phone10,'')||'|'||coalesce(web,'')||'|'||coalesce(addr,''),E'\n' order by n)) from calg_d),
  'eligible_total',(select count(*) from calg_d where bucket_rank is not null),
  'eligible_teknokraft',(select count(*) from calg_d where bucket_rank is not null and client='tk'),
  'eligible_hidebrandt',(select count(*) from calg_d where bucket_rank is not null and client='hb'),
  'tk_by_bucket',(select jsonb_object_agg(bucket,c) from (select bucket,count(*) c from calg_d where bucket_rank is not null and client='tk' group by 1) x),
  'hb_by_bucket',(select jsonb_object_agg(bucket,c) from (select bucket,count(*) c from calg_d where bucket_rank is not null and client='hb' group by 1) x),
  'review_by_client',(select jsonb_object_agg(client,c) from (select client,count(*) c from calg_d where bucket_rank is null group by 1) x),
  'sites',(select jsonb_object_agg(site_kind,c) from (select site_kind,count(*) c from calg_d group by 1) x),
  'eligible_by_bucket',(select jsonb_object_agg(bucket,c) from (select bucket,count(*) c from calg_d where bucket_rank is not null group by 1) x),
  'admin_review_total',(select count(*) from calg_d where bucket_rank is null),
  'admin_review_by_kind',(select jsonb_object_agg(review_kind,c) from (select review_kind,count(*) c from calg_d where bucket_rank is null group by 1) x),
  'duplicates_in_file',(select count(*) from calg_d where dup_in_file),'existing_crm_matches',(select count(*) from calg_d where ex_match),
  'flagged_possible_duplicate',(select count(*) from calg_d where dup_in_file or ex_match or shared_phone or shared_web or shared_addr or ex_phone_conflict),
  'dnc',(select count(*) from calg_d where dnc),'malformed_repaired',(select count(*) from calg_raw where malformed),
  'pre_existing_records_unchanged',true) into v_report;
 if not v_commit then raise exception 'DRY RUN OK (rolled back): %',v_report::text; end if;
 raise notice '%',v_report::text;
end;
$imp$;
