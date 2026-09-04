-- Seed data for migration 0136: version 1.0 of the Independent Contractor
-- Agreement template (exact text supplied for Winsalot Corp., split into
-- its 24 numbered sections; the Parties/signature blocks are rendered
-- directly from each subcontractor's own snapshot fields by the
-- application, not stored as template sections here - see
-- src/lib/crm-subcontractor-agreement.ts), and the 10 required
-- subcontractor training modules (brief section G).

insert into public.crm_subcontractor_agreement_templates (version, is_current, content)
values (
  1.0,
  true,
  $json$[
    {"key": "s1_services", "title": "1. Services", "body": "The Contractor agrees to provide the services described in the Contractor's assignment with Winsalot Corp.\n\nServices may include, depending on the assignment:\n\n- B2B prospecting\n- Lead generation\n- Appointment setting\n- Telephone outreach\n- Email outreach\n- CRM data entry\n- Call logging\n- Lead qualification\n- Administrative or virtual assistant services\n- Client-specific projects\n- Other services agreed to in writing by Winsalot Corp. and the Contractor\n\nThe specific services, assigned client, compensation arrangement, and performance expectations will be recorded in the Winsalot Corp. subcontractor onboarding system or otherwise confirmed in writing."},
    {"key": "s2_relationship", "title": "2. Independent Contractor Relationship", "body": "The parties intend for the Contractor to provide services as an independent contractor and not as an employee, partner, representative, or joint venturer of Winsalot Corp.\n\nSubject to client requirements, confidentiality requirements, applicable law, agreed deliverables, and service standards, the Contractor is responsible for determining the manner in which the contracted services are performed.\n\nNothing in this Agreement guarantees any minimum amount of work, assignments, hours, leads, appointments, or compensation unless separately agreed in writing.\n\nThe Contractor may provide services to other businesses, provided doing so does not violate the confidentiality, data protection, conflict-of-interest, or client-protection obligations contained in this Agreement."},
    {"key": "s3_no_benefits", "title": "3. No Employee Benefits", "body": "Unless required by applicable law, the Contractor is not entitled to employee benefits from Winsalot Corp., including:\n\n- Vacation pay\n- Holiday pay\n- Paid sick leave\n- Employment insurance benefits\n- Pension contributions\n- Health benefits\n- Overtime\n- Employee bonuses\n- Severance or termination pay\n\nThe Contractor is responsible for their own taxes, insurance, registrations, permits, and government remittances arising from payments received under this Agreement."},
    {"key": "s4_compensation", "title": "4. Compensation", "body": "The Contractor will be paid according to the compensation arrangement recorded in their Winsalot Corp. subcontractor profile.\n\nCompensation may be structured as:\n\n- Fixed amount\n- Hourly\n- Daily\n- Weekly\n- Biweekly\n- Monthly\n- Per qualified lead\n- Per appointment\n- Per project\n- Another mutually agreed arrangement\n\nCurrency: {{currency}}\nRate or Amount: {{rate_amount}}\n\nWinsalot Corp. will only be responsible for amounts that have been approved in accordance with the applicable assignment.\n\nFor hourly or daily assignments, the Contractor may be required to submit records of approved time or completed work.\n\nFor lead- or appointment-based compensation, only leads or appointments meeting the applicable client or campaign qualification criteria will count toward payment."},
    {"key": "s5_expenses", "title": "5. Expenses and Equipment", "body": "Unless Winsalot Corp. agrees otherwise in writing, the Contractor is responsible for their own workspace, internet access, computer equipment, mobile devices, utilities, and other ordinary business expenses.\n\nAny expense that the Contractor expects Winsalot Corp. to reimburse must be approved in advance."},
    {"key": "s6_client_assignments", "title": "6. Client Assignments", "body": "Winsalot Corp. may assign the Contractor to one or more Company clients or internal projects.\n\nThe Contractor may only access information relating to clients or projects they have been authorized to work on.\n\nClient information may not be used for any purpose outside the assigned Winsalot Corp. work."},
    {"key": "s7_crm_access", "title": "7. CRM and Technology Access", "body": "The Contractor may receive access to Winsalot Corp. systems, including its CRM, communications tools, training systems, lead databases, or other technology.\n\nSystem access remains the property of Winsalot Corp. and may be modified, suspended, or revoked at any time.\n\nThe Contractor must:\n\n- Keep usernames and passwords confidential.\n- Not share login credentials.\n- Not access unauthorized client information.\n- Not export or copy Company data without authorization.\n- Follow Company security procedures.\n- Immediately report suspected unauthorized access or data loss."},
    {"key": "s8_confidentiality", "title": "8. Confidentiality", "body": "The Contractor must keep confidential all non-public information obtained through their work with Winsalot Corp.\n\nConfidential information includes, but is not limited to:\n\n- Client information\n- Prospect and lead lists\n- Phone numbers\n- Email addresses\n- Scripts\n- Pricing\n- Business processes\n- CRM information\n- Sales strategies\n- Financial information\n- Client agreements\n- Training materials\n- Internal reports\n- Login credentials\n- Software and system information\n\nThe Contractor may only use confidential information for the purpose of completing authorized work for Winsalot Corp.\n\nThese confidentiality obligations continue after this Agreement ends."},
    {"key": "s9_data_protection", "title": "9. Protection of Personal and Business Data", "body": "The Contractor agrees to handle personal information, client information, and prospect information carefully and only for authorized business purposes.\n\nThe Contractor will follow all applicable privacy requirements and Winsalot Corp. data-handling procedures.\n\nThe Contractor must promptly report any accidental disclosure, lost device, compromised account, or suspected data breach."},
    {"key": "s10_non_solicitation", "title": "10. Client Non-Solicitation", "body": "During the Contractor's engagement and for a reasonable period after it ends, subject to applicable law, the Contractor will not knowingly use confidential information obtained through Winsalot Corp. to bypass Winsalot Corp. and directly solicit an assigned Winsalot Corp. client for substantially similar services.\n\nNothing in this section prevents the Contractor from conducting their independent business activities with parties they developed independently of Winsalot Corp."},
    {"key": "s11_ownership", "title": "11. Prospect and Lead Ownership", "body": "Prospect lists, client lists, leads, call records, call notes, appointment records, reports, and other business records created or obtained through work performed for Winsalot Corp. remain the property of Winsalot Corp. or the applicable client.\n\nThe Contractor may not retain or reuse these records after authorization to access them ends."},
    {"key": "s12_work_product", "title": "12. Work Product", "body": "Unless otherwise agreed in writing, work specifically created by the Contractor for Winsalot Corp. or an assigned client as part of a paid assignment will belong to Winsalot Corp. upon payment for that work, subject to applicable law.\n\nPre-existing tools, general skills, templates, know-how, and materials belonging to the Contractor before the assignment remain the Contractor's property."},
    {"key": "s13_conduct", "title": "13. Standards of Conduct", "body": "When representing Winsalot Corp. or one of its clients, the Contractor agrees to:\n\n- Communicate professionally.\n- Accurately identify the applicable business or client.\n- Follow approved scripts and client messaging where required.\n- Maintain accurate CRM records.\n- Protect confidential information.\n- Not make unauthorized promises or representations.\n- Follow applicable calling, email, privacy, and communications requirements.\n- Treat prospects, clients, and Winsalot Corp. personnel professionally."},
    {"key": "s14_training", "title": "14. Training", "body": "The Contractor may be required to complete training relating to:\n\n- CRM usage\n- Client assignments\n- Call logging\n- Lead qualification\n- Appointment booking\n- Privacy\n- Confidentiality\n- Cybersecurity\n- Applicable scripts\n- Communication standards\n\nCompletion of required training may be required before access to a client assignment is activated."},
    {"key": "s15_performance", "title": "15. Performance and Deliverables", "body": "Specific targets may be established for individual assignments.\n\nTargets are intended to define expected deliverables and service standards for the assignment and do not create a guarantee of continued work.\n\nWinsalot Corp. may review completed work for accuracy, compliance, quality, and client requirements."},
    {"key": "s16_invoicing", "title": "16. Invoicing and Payment Records", "body": "Where required, the Contractor will provide an invoice or other appropriate payment record.\n\nWinsalot Corp. may maintain electronic records showing:\n\n- Pay period\n- Approved quantity or hours\n- Gross amount\n- Adjustments\n- Deductions or offsets where legally permitted and agreed\n- Currency\n- Payment status\n- Payment date\n- Payment reference"},
    {"key": "s17_taxes", "title": "17. Taxes", "body": "The Contractor is responsible for determining and paying any taxes, duties, insurance contributions, registration fees, or other obligations applicable to their independent business activities.\n\nWinsalot Corp. may make any reporting, deduction, withholding, or remittance required by applicable law."},
    {"key": "s18_no_authority", "title": "18. No Authority to Bind Winsalot Corp.", "body": "The Contractor does not have authority to enter into contracts, incur liabilities, make financial commitments, or otherwise bind Winsalot Corp. unless specifically authorized in writing."},
    {"key": "s19_term", "title": "19. Term", "body": "This Agreement begins on:\nStart Date: {{start_date}}\n\nand continues until terminated in accordance with this Agreement."},
    {"key": "s20_termination", "title": "20. Termination", "body": "Either party may end the Contractor relationship by providing written notice, subject to any specific project commitment separately agreed between the parties and applicable law.\n\nWinsalot Corp. may immediately suspend access to Company or client systems when necessary to protect Company data, client information, security, or business operations.\n\nUpon termination, the Contractor must return or permanently delete confidential Company and client information in their possession, except where retention is required by law."},
    {"key": "s21_return_property", "title": "21. Return of Company Property", "body": "When the engagement ends, the Contractor must return any Company property and stop using all Company accounts, software access, files, client records, and confidential information."},
    {"key": "s22_governing_law", "title": "22. Governing Law", "body": "Unless otherwise required by applicable law or agreed in writing, this Agreement will be governed by the laws applicable in the Province of Ontario and the federal laws of Canada applicable therein."},
    {"key": "s23_entire_agreement", "title": "23. Entire Agreement", "body": "This Agreement, together with any written assignment, compensation schedule, confidentiality requirements, or client-specific terms accepted by the parties, represents the agreement between the parties concerning the Contractor's services.\n\nChanges should be made in writing and accepted by both parties."},
    {"key": "s24_electronic_acceptance", "title": "24. Electronic Acceptance", "body": "The parties agree that this Agreement may be accepted electronically.\n\nElectronic acceptance, including acknowledgement through the Winsalot Corp. onboarding system, may be maintained as part of the Contractor's onboarding record."}
  ]$json$::jsonb
)
on conflict (version) do nothing;

insert into public.crm_subcontractor_training_modules (slug, title, sort_order, is_required, is_active, content)
values
(
  'welcome-to-winsalot',
  'Welcome to Winsalot Corp.',
  1,
  true,
  true,
  $md$Welcome to Winsalot Corp. This short module introduces how subcontractors fit into our team.

Winsalot Corp. works with independent contractors to support B2B prospecting, lead generation, appointment setting, CRM data entry, and related client work. As a subcontractor, you are not an employee - you control how you complete your work, but you're expected to follow the same professionalism, confidentiality, and quality standards described in your Independent Contractor Agreement.

Before you can be assigned to client work, you'll need to:
- Complete your personal information
- Read and accept the Independent Contractor Agreement
- Confirm your payment setup (currency, pay type, rate)
- Be assigned to a Business/Client
- Complete the required training modules below
- Have CRM access granted by an admin

You can track your progress at any time from your onboarding checklist.$md$
),
(
  'client-confidentiality',
  'Client Confidentiality',
  2,
  true,
  true,
  $md$Everything you see about Winsalot Corp. and its clients while doing this work is confidential - client information, prospect and lead lists, phone numbers, email addresses, scripts, pricing, business processes, CRM information, sales strategies, and internal reports.

- Only use confidential information to complete your authorized Winsalot Corp. work - never for any other purpose.
- Never share client or prospect information with anyone outside Winsalot Corp., including other clients.
- Your confidentiality obligations continue even after your engagement with Winsalot Corp. ends.
- If you are ever unsure whether something is confidential, treat it as confidential.$md$
),
(
  'crm-security',
  'CRM Security',
  3,
  true,
  true,
  $md$Your CRM access is Winsalot Corp. property and can be modified, suspended, or revoked at any time.

- Keep your username and password confidential - never share your login with anyone, including other subcontractors or agents.
- Only access information relating to clients or projects you have been authorized to work on.
- Never export or copy Company data outside authorized systems.
- Follow Company security procedures at all times.
- Immediately report any suspected unauthorized access, lost device, compromised account, or data loss to your Winsalot Corp. admin.$md$
),
(
  'client-business-selection',
  'Client/Business Selection',
  4,
  true,
  true,
  $md$You will be assigned to one Business/Client at a time in your subcontractor profile. This assignment tells you which client's work you're currently doing and is used for payroll and reporting.

- Always confirm your current assignment before starting work for the day.
- Only work on the client or project you have been authorized for - do not use information from a different client's work.
- If your assignment changes, your admin will update it in your profile and you'll see the new assignment on your dashboard.$md$
),
(
  'call-logging',
  'Call Logging',
  5,
  true,
  true,
  $md$If your assignment includes outbound calling, every call must be logged correctly.

- Identify the correct Business/Client before logging work. For Growth CRM subcontractors, calls are made on behalf of Winsalot Corp. itself - the same as our calling agents - so "Winsalot Corp." is the Business/Client on every Growth CRM call log.
- Call logs must be attached to the correct Business/Client - the Call Log page fills this in for you automatically so it can never be entered incorrectly.
- Record the appropriate outcome for every call:
  - No Answer
  - Voicemail
  - Gatekeeper
  - Not Interested
  - Callback
- Interested prospects/leads should follow the existing lead workflow - do not just leave them in a Call Log outcome.
- Non-lead calls (no answer, voicemail, not interested, etc.) should still be logged using Call Log so we have a complete record of outreach.
- Never copy client or prospect information outside authorized systems, and never share your CRM credentials with anyone.$md$
),
(
  'lead-qualification',
  'Lead Qualification',
  6,
  true,
  true,
  $md$A "qualified" lead or appointment is one that meets the applicable client or campaign's specific criteria - only qualified leads/appointments count toward per-lead or per-appointment compensation.

- Follow the qualification criteria given for your specific assignment - these can vary by client.
- Record accurate, complete information in the CRM for every lead so it can be properly reviewed.
- If you're unsure whether a prospect qualifies, log the call/lead with full notes and flag it for admin review rather than guessing.$md$
),
(
  'appointment-booking',
  'Appointment Booking',
  7,
  false,
  true,
  $md$Some assignments include booking appointments for a client or for Winsalot Corp. itself.

- Only book appointments within the times and formats approved for your assignment.
- Confirm the prospect's timezone and contact details are recorded accurately.
- Follow up professionally to confirm appointments where required by your assignment.$md$
),
(
  'professional-communication',
  'Professional Communication',
  8,
  true,
  true,
  $md$When representing Winsalot Corp. or one of its clients, you agree to:

- Communicate professionally at all times.
- Accurately identify the applicable business or client you're calling/emailing on behalf of.
- Follow approved scripts and client messaging where required.
- Maintain accurate CRM records for everything you do.
- Never make unauthorized promises or representations to a prospect or client.
- Follow applicable calling, email, privacy, and communications requirements.
- Treat prospects, clients, and Winsalot Corp. personnel professionally at all times.$md$
),
(
  'data-handling-and-privacy',
  'Data Handling and Privacy',
  9,
  true,
  true,
  $md$Handle personal information, client information, and prospect information carefully, and only for authorized business purposes.

- Follow all applicable privacy requirements and Winsalot Corp. data-handling procedures.
- Never store client or prospect data outside authorized Winsalot Corp. systems (no personal spreadsheets, personal email, personal notes apps, etc.).
- Promptly report any accidental disclosure, lost device, compromised account, or suspected data breach to your admin.$md$
),
(
  'assignment-specific-training',
  'Assignment-Specific Training',
  10,
  false,
  true,
  $md$Depending on your specific assignment, your admin may require additional training beyond the modules above - for example, a specific client's scripts, qualification criteria, or reporting requirements.

Your admin can mark this module (or any module) required or not required for your specific assignment. Check with your admin if you're unsure what additional training applies to your work.$md$
)
on conflict (slug) do nothing;
