-- Sets the passwords of the internal Supabase roles to POSTGRES_PASSWORD.
-- Lists only roles that exist in the supabase/postgres image itself; roles
-- created by services this stack leaves out (Edge Functions) must not appear,
-- because the first error aborts the script.
-- Runs once, when the database volume is first initialised. Changing
-- POSTGRES_PASSWORD afterwards does NOT update these roles; see the
-- "Rotating the database password" section of apps/docs/self-hosted-stack.md.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
