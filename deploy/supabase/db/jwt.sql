-- Stores the JWT expiry as a database setting read by Supabase services.
-- Runs once, when the database volume is first initialised.
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
