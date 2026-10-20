-- Fills every table in `public` with a few clearly fake rows so a backup/restore
-- rehearsal has something to compare. No real data. Rows that a table's own
-- constraints reject are skipped; several passes resolve foreign-key ordering.
insert into auth.users(id, email) select gen_random_uuid(), 'synthetic-' || g || '@example.invalid' from generate_series(1, 6) g on conflict do nothing;

create or replace function pg_temp.synthetic_value(typ regtype, typname text, typtype "char", typcategory "char") returns text language plpgsql as $f$
declare lbl text;
begin
  if typtype = 'e' then
    select quote_literal(enumlabel) into lbl from pg_enum where enumtypid = typ order by enumsortorder limit 1;
    return lbl;
  end if;
  return case
    when typname = 'uuid' then 'gen_random_uuid()'
    when typname in ('text','varchar','bpchar','citext','name') then quote_literal('synthetic-') || ' || md5(random()::text)'
    when typname in ('int2','int4','int8','oid') then '1'
    when typname in ('numeric','float4','float8') then '1'
    when typname = 'bool' then 'false'
    when typname in ('timestamptz','timestamp') then 'now()'
    when typname = 'date' then 'current_date'
    when typname = 'time' then quote_literal('09:00')
    when typname in ('jsonb','json') then quote_literal('{}')
    when typcategory = 'A' then quote_literal('{}')
    when typname = 'interval' then quote_literal('1 hour')
    else null end;
end $f$;

do $$
declare
  pass int; tb record; col record; cols text; vals text; ok boolean; sql text; fk record; v text; n int; made int := 0;
begin
  for pass in 1..6 loop
    for tb in select pc.oid, pc.relname from pg_class pc join pg_namespace pn on pn.oid = pc.relnamespace
             where pn.nspname = 'public' and pc.relkind = 'r' order by pc.relname loop
      execute format('select count(*) from public.%I', tb.relname) into n;
      continue when n >= 3;
      cols := ''; vals := ''; ok := true;
      for col in select a.attname, a.atttypid::regtype typ, ty.typname, ty.typtype, ty.typcategory, a.attnum,
                      (a.attnotnull and not a.atthasdef and a.attidentity = '' and a.attgenerated = '') as needed
               from pg_attribute a join pg_type ty on ty.oid = a.atttypid
               where a.attrelid = tb.oid and a.attnum > 0 and not a.attisdropped loop
        continue when not col.needed;
        -- single-column foreign key: borrow an existing parent key
        select into fk (select r.relname from pg_class r where r.oid = k.confrelid) as parent, (select attname from pg_attribute where attrelid = k.confrelid and attnum = k.confkey[1]) as pcol, (select nspname from pg_namespace where oid = (select relnamespace from pg_class where oid = k.confrelid)) as pschema
          from pg_constraint k where k.conrelid = tb.oid and k.contype = 'f' and array_length(k.conkey, 1) = 1 and k.conkey[1] = col.attnum limit 1;
        if fk.parent is not null then
          execute format('select %I::text from %I.%I limit 1', fk.pcol, fk.pschema, fk.parent) into v;
          if v is null then ok := false; exit; end if;
          vals := vals || quote_literal(v) || '::' || col.typ::text || ',';
        else
          v := pg_temp.synthetic_value(col.typ, col.typname, col.typtype, col.typcategory);
          if v is null then ok := false; exit; end if;
          vals := vals || v || ',';
        end if;
        cols := cols || quote_ident(col.attname) || ',';
      end loop;
      continue when not ok;
      if cols = '' then sql := format('insert into public.%I default values', tb.relname);
      else sql := format('insert into public.%I (%s) values (%s)', tb.relname, rtrim(cols, ','), rtrim(vals, ',')); end if;
      for i in 1..3 loop
        begin execute sql; made := made + 1; exception when others then exit; end;
      end loop;
    end loop;
  end loop;
  raise notice 'synthetic rows inserted: %', made;
end $$;
