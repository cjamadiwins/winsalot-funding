-- Supply client-specific language to the existing Client Call Script fields.
-- Fill blanks only; do not replace any wording Admin has already approved.
-- Client, campaign, appointment and historical records retain their IDs/status.
update public.leadgen_clients
set call_script_services = coalesce(nullif(trim(call_script_services), ''), 'website creation, redesign, maintenance, hosting, and e-commerce'),
    call_script_value_proposition = coalesce(nullif(trim(call_script_value_proposition), ''), 'Hidebrandt Web Services helps businesses create or redesign websites and can provide maintenance, hosting, and e-commerce support.'),
    call_script_notes = coalesce(nullif(trim(call_script_notes), ''), 'Canada-wide. Confirm the business name and website need. Qualify an appropriate contact and book an appointment; do not promise sales or conversions.')
where name = 'Hidebrandt Web Services' and active = true;

update public.leadgen_clients
set call_script_services = coalesce(nullif(trim(call_script_services), ''), 'website design and development, website redesign, and SEO or online visibility'),
    call_script_value_proposition = coalesce(nullif(trim(call_script_value_proposition), ''), 'Teknokraft Canada Inc. helps businesses create or improve their websites and strengthen online visibility through SEO where appropriate.'),
    call_script_notes = coalesce(nullif(trim(call_script_notes), ''), 'Follow the approved campaign territory and service details. Qualify an appropriate contact and book an appointment; do not promise sales or conversions.')
where name = 'Teknokraft Canada Inc.' and active = true;

update public.leadgen_clients
set call_script_services = coalesce(nullif(trim(call_script_services), ''), 'website design and development, website redesign, and relevant digital services'),
    call_script_value_proposition = coalesce(nullif(trim(call_script_value_proposition), ''), 'Web6 Solutions helps businesses create or improve their websites and discuss digital services that match their needs.'),
    call_script_notes = coalesce(nullif(trim(call_script_notes), ''), 'Follow the approved campaign territory and offered services. Mention SEO only if approved in the client record. Qualify an appropriate contact and book an appointment; do not promise sales or conversions.')
where name = 'Web6 Solutions' and active = true;
