-- Fix the Holiday Pay currency to always be NGN - Winsalot Corp pays every
-- agent in both CRMs in Nigerian Naira (see src/lib/payroll.ts's shared,
-- unconditional NGN formatting), regardless of which jurisdiction's
-- calendar a holiday follows. The Labour Day seed row (migration 0106)
-- incorrectly set currency = 'CAD' by conflating the Canada/Ontario
-- jurisdiction with a Canadian currency - jurisdiction and payroll
-- currency are independent. The application layer (createHolidayAction/
-- updateHolidayAction) now always writes 'NGN' regardless of form input;
-- this migration corrects every existing row (Labour Day included) the
-- same way, a pure data fix with no schema change.

update public.holidays
set currency = 'NGN', updated_at = now()
where currency <> 'NGN';
