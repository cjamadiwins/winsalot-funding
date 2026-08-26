-- 0088 created btree_gist with `create extension if not exists btree_gist;`,
-- which installs it into the `public` schema by default - flagged by
-- Supabase's security advisor (extension_in_public WARN), since extensions
-- in `public` are writable by any role with CREATE on that schema. Every
-- other extension in this project already lives in `extensions` (see
-- `list_extensions`); btree_gist was the only exception. Moving it doesn't
-- touch the exclusion constraint on winsalot_appointments (0088) - Postgres
-- resolves its `gist_int8_ops`-style operator classes through the schema
-- search_path, not a hardcoded schema reference.
alter extension btree_gist set schema extensions;
