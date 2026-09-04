-- Track one immediate customer confirmation per successfully-created
-- appointment occurrence. Existing scheduled 24-hour and 1-hour reminders
-- are unchanged; this only expands the allowed reminder_type values.

alter table public.leadgen_appointment_sms_reminders
  drop constraint if exists leadgen_appointment_sms_reminders_reminder_type_check;
alter table public.leadgen_appointment_sms_reminders
  add constraint leadgen_appointment_sms_reminders_reminder_type_check
  check (reminder_type in ('booking_confirmation', '24_hour_reminder', '1_hour_reminder'));

alter table public.winsalot_appointment_sms_reminders
  drop constraint if exists winsalot_appointment_sms_reminders_reminder_type_check;
alter table public.winsalot_appointment_sms_reminders
  add constraint winsalot_appointment_sms_reminders_reminder_type_check
  check (reminder_type in ('booking_confirmation', '24_hour_reminder', '1_hour_reminder'));
