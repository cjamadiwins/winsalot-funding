-- Hand-written fake records for the tables that matter most to the business, so
-- the rehearsal proves leads, appointments, call logs, agent assignments, client
-- campaigns, payroll and lending records survive backup + restore. All values are
-- obviously synthetic (example.invalid addresses, "Synthetic ..." names).
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) select gen_random_uuid(), 'core-' || g || '@example.invalid' from generate_series(1, 4) g;
create temp table u as select id, row_number() over (order by email) n from auth.users where email like 'core-%@example.invalid';

insert into crm_users(id, full_name, email, role, active) select id, 'Synthetic Growth ' || n, 'core-' || n || '@example.invalid', case when n = 1 then 'admin' else 'agent' end, true from u where n <= 3;
insert into leadgen_users(id, full_name, email, role, active) select id, 'Synthetic Leadgen ' || n, 'core-' || n || '@example.invalid', case when n = 1 then 'admin' else 'agent' end, true from u where n <= 3;

insert into crm_agent_service_assignments(agent_id, service) select id, 'both' from u where n = 2;
insert into crm_lending_partners(company_name, contact_type) values ('Synthetic Lender A', 'lender_contact'), ('Synthetic Broker B', 'broker');

insert into crm_opportunities(opportunity_type, business_name, phone) select t, 'Synthetic Business ' || g, '555-01' || lpad(g::text, 2, '0') from generate_series(1, 5) g, (values ('business_financing')) v(t);

insert into call_list_segments(crm, name, created_by, growth_opportunity_type) select 'growth', 'Synthetic Growth List ' || g, (select id from u where n = 1), 'business_financing' from generate_series(1, 2) g;
insert into call_list_segments(crm, name, created_by, leadgen_campaign_id) select 'lead_generation', 'Synthetic Leadgen List', (select id from u where n = 1), (select id from leadgen_campaigns limit 1);
insert into call_list_leads(segment_id, business_name) select s.id, 'Synthetic Lead ' || g from call_list_segments s, generate_series(1, 25) g where s.name like 'Synthetic Growth List%';
insert into call_list_segment_agents(segment_id, agent_id) select s.id, (select id from u where n = 2) from call_list_segments s where s.name like 'Synthetic%';

insert into winsalot_appointments(contact_name, business_name, email, phone, service_type, appointment_start_at, appointment_end_at, booked_by)
 select 'Synthetic Contact ' || g, 'Synthetic Business ' || g, 'appt-' || g || '@example.invalid', '555-02' || lpad(g::text, 2, '0'), 'business_financing', now() + (g || ' days')::interval, now() + (g || ' days')::interval + interval '30 minutes', 'self' from generate_series(1, 4) g;

insert into crm_call_logs(agent_id, business_name, phone, outcome, notes) select (select id from u where n = 2), 'Synthetic Business ' || g, '555-03' || lpad(g::text, 2, '0'), 'No Answer', 'Synthetic note ' || g from generate_series(1, 40) g;

insert into leadgen_call_logs(agent_id, client_id, business_name, phone, outcome, notes) select (select id from u where n = 2), (select id from leadgen_clients limit 1), 'Synthetic Business ' || g, '555-04' || lpad(g::text, 2, '0'), 'No Answer', 'Synthetic note ' || g from generate_series(1, 40) g;

insert into crm_payroll(agent_id, pay_period_start, pay_period_end, payday, status) select (select id from u where n = 2), date '2026-09-05', date '2026-09-18', date '2026-09-18', 'draft';
insert into leadgen_payroll(agent_id, pay_period_start, pay_period_end, payday, status) select (select id from u where n = 2), date '2026-09-19', date '2026-10-02', date '2026-10-02', 'draft';
commit;
