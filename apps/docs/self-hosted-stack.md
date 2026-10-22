# Self-Hosted Stack (Shelf + Supabase)

This guide runs Shelf together with its own self-hosted Supabase on one server,
using Docker Compose, a single shared environment file, and the server's
existing nginx for HTTPS. Everything lives in the `deploy/` directory at the
repository root.

It replaces the Supabase Cloud steps of the [Supabase Setup Guide](./supabase-setup.md):
storage buckets, the 6-digit OTP length and the OTP email templates are all
configured automatically.

## Architecture

```
                 Internet (HTTPS)
                        |
              host nginx (TLS, certificates)
           /                              \
 assets.example.org              supabase.assets.example.org
 127.0.0.1:3000                  127.0.0.1:8000
        |                                 |
+-------|---------- Docker network: hrc-shelf -------|----------------+
|    shelf  -----------------------------------> gateway (nginx)      |
|      |                                        /auth/v1  /storage/v1 |
|      |                                           |          |       |
|      |                                         auth      storage    |
|      |                                           |          |  rest |
|      +-------------------> db (Postgres) <-------+----------+       |
|                              |                                       |
|                       meta <-+-> studio (127.0.0.1:54323, SSH only)  |
+---------------------------------------------------------------------+
```

| Service          | Image                  | Role                                                                     |
| ---------------- | ---------------------- | ------------------------------------------------------------------------ |
| `shelf`          | built from this repo   | The webapp. Applies Prisma migrations on start.                          |
| `gateway`        | `nginx`                | Public Supabase entry point. Routes `/auth/v1` and `/storage/v1` only.   |
| `db`             | `supabase/postgres`    | Postgres with the Supabase roles and extensions.                         |
| `auth`           | `supabase/gotrue`      | Login, OTP emails, password reset.                                       |
| `storage`        | `supabase/storage-api` | Asset, kit, profile and file images (stored on a Docker volume).         |
| `rest`           | `postgrest/postgrest`  | Internal dependency of storage. Not routed publicly.                     |
| `storage-init`   | `curlimages/curl`      | One-shot job that creates the four storage buckets, then exits.          |
| `meta`, `studio` | `supabase/*`           | Database admin dashboard, bound to the server's loopback interface only. |

Realtime, Edge Functions, Analytics, the connection pooler and imgproxy are left
out: Shelf does not use them.

### Why two public hostnames

Shelf sends `SUPABASE_URL` to the browser, and image links (public and signed
storage URLs) point at it. The Supabase gateway therefore has to be reachable
over HTTPS on its own hostname, next to the Shelf hostname.

## Try it on localhost

To test the stack on one machine (Docker Desktop is enough), with no DNS,
certificates or mail server:

```bash
cd deploy
bash scripts/generate-secrets.sh --local
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

| URL                              | What                                                  |
| -------------------------------- | ----------------------------------------------------- |
| <http://localhost:3000>          | Shelf. Sign up here.                                  |
| <http://localhost:8025>          | Mailpit: every email the stack sends, login codes too |
| <http://localhost:54323>         | Supabase Studio                                       |
| `http://supabase.localhost:8000` | Supabase gateway (used by Shelf and the browser)      |

`--local` writes a new `.env` whose URLs point at localhost and whose SMTP
settings point at the Mailpit container. `docker-compose.local.yml` adds Mailpit
and gives the gateway the network alias `supabase.localhost`, so the same
`SUPABASE_PUBLIC_URL` works from the browser (which resolves `*.localhost` to
your machine) and from inside the Shelf container. Use a Chromium-based browser
or Firefox; both resolve `*.localhost` on their own.

To start over: `docker compose -f docker-compose.yml -f docker-compose.local.yml down -v`
and delete `deploy/.env`.

## Prerequisites

- A Linux server with Docker Engine and the Compose plugin (`docker compose version` 2.20 or newer)
- nginx installed on the host, with certificates for both hostnames (certbot or any ACME client)
- Two DNS records pointing at the server, e.g. `assets.example.org` and `supabase.assets.example.org`
- An SMTP account. Login codes are sent by email, so nobody can sign in without it.
- `bash` and `openssl` on the server, to generate secrets
- About 4 GB of RAM for the first image build (the running stack needs less)

## Setup

### 1. Get the code onto the server

```bash
git clone <your HRC fork> hrc-shelf
cd hrc-shelf/deploy
```

### 2. Create the environment file

```bash
bash scripts/generate-secrets.sh
```

This copies `env.example` to `deploy/.env` (mode `600`) and fills every empty
secret: the database password, the Supabase JWT secret and the `ANON_KEY` /
`SERVICE_ROLE_KEY` signed with it, Shelf's session and invite secrets, and
Studio's encryption key. Re-running it never overwrites a value that is set.

Then edit `deploy/.env` and set at least:

| Variable                       | Example                               |
| ------------------------------ | ------------------------------------- |
| `SERVER_URL`                   | `https://assets.example.org`          |
| `SUPABASE_PUBLIC_URL`          | `https://supabase.assets.example.org` |
| `SUPABASE_HOST`                | `supabase.assets.example.org`         |
| `SMTP_*`                       | Your mail server and sender address   |
| `ADMIN_EMAIL`, `SUPPORT_EMAIL` | Your IT inbox                         |

`deploy/.env` is the only configuration file for the whole stack. Compose uses
it for the Supabase services and passes all of it to the Shelf container, so
any optional Shelf variable from the repository's root `.env.example` can be
added there. The values both sides must agree on (database URL, Supabase
URL and keys, SMTP sender) are derived in `docker-compose.yml` from one source,
so they cannot drift apart.

To show your organization's name, accent color, icon and login background
instead of Shelf's, see [Instance Branding](./instance-branding.md). Images go
in `deploy/branding/`, which is mounted into the Shelf container.

### 3. Configure the host nginx

```bash
sudo cp nginx/hrc-shelf.conf.example /etc/nginx/sites-available/hrc-shelf.conf
sudo ln -s /etc/nginx/sites-available/hrc-shelf.conf /etc/nginx/sites-enabled/
# edit the hostnames and certificate paths, then:
sudo nginx -t && sudo systemctl reload nginx
```

The example proxies each hostname to its loopback port and sets the forwarded
headers Shelf relies on:

- `X-Forwarded-Proto` tells Shelf the request was HTTPS (secure cookies, HSTS).
- `X-Forwarded-For` is **overwritten** with the client address, not appended.
  Shelf's rate limiter trusts the leftmost entry, so a client-supplied value
  must not survive the proxy.
- `client_max_body_size 50m` matches the storage upload limit.

If you change `APP_PORT` or `GATEWAY_PORT` in `.env`, change them in the nginx
file too.

### 4. Build and start

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f shelf
```

The first build takes several minutes. Startup order is enforced by health
checks: `db` -> `auth`, `rest`, `storage` -> `storage-init` (creates the buckets)
-> `shelf` (applies migrations, then serves). `storage-init` showing
`Exited (0)` is expected.

### 5. Create the first administrator

1. Open `SERVER_URL` and sign up. The 6-digit code arrives by email.
2. Once your account and workspace exist, set `DISABLE_SIGNUP=true` in `.env`
   and run `docker compose up -d shelf`. From then on people join by invitation.

## Operations

### Updating Shelf

```bash
git pull
cd deploy
docker compose up -d --build shelf
```

New migrations are applied automatically when the container starts. If one
fails, the container exits instead of serving an out-of-date schema; check
`docker compose logs shelf`.

To update Supabase, change the image tags in `docker-compose.yml` (compare with
the [upstream compose file](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml))
and run `docker compose up -d`. Back up first.

### Rate limits

Shelf caps how many requests a user or IP address may send per minute, and
Supabase Auth caps login-code checks and session refreshes. This stack raises
both, because volunteers often share one public IP (a station's Wi-Fi, a mobile
carrier) and Shelf calls Supabase Auth from its own server for everyone.

| Variable                        | Default here | Controls                                                         |
| ------------------------------- | ------------ | ---------------------------------------------------------------- |
| `RATE_LIMIT_MULTIPLIER`         | `10`         | Every Shelf limiter (page data, Companion app, self-service)     |
| `AUTH_RATE_LIMIT_VERIFY`        | `600`        | Login-code checks per 5 minutes, instance-wide                   |
| `AUTH_RATE_LIMIT_TOKEN_REFRESH` | `3000`       | Session refreshes per 5 minutes, instance-wide                   |
| `AUTH_RATE_LIMIT_EMAIL_SENT`    | `100`        | Login emails per hour; keep within what your mail server accepts |
| `DB_CONNECTION_LIMIT`           | `25`         | Shelf's database connection pool                                 |

Set any of them in `.env` and run `docker compose up -d`. The wrong-PIN lockout
on the self-service pages is a separate counter and is never relaxed. A blocked
request answers `429 Too many requests`; `docker compose logs shelf | grep "Rate limit"`
shows which limiter fired.

### Admin dashboard (Studio)

Studio has no login of its own, so it is published on the server's loopback
interface only. From your workstation:

```bash
ssh -L 54323:127.0.0.1:54323 user@your-server
```

Then open <http://localhost:54323>. Never proxy Studio through nginx.

### Backups

All state lives in two named volumes: `hrc-shelf_db-data` (the database) and
`hrc-shelf_storage-data` (uploaded files). Keep `deploy/.env` with them: the
JWT secret and database password are needed to restore.

```bash
# Database (compressed dump)
docker compose exec -T db pg_dump -U postgres -Fc postgres > shelf-$(date +%F).dump

# Uploaded files
docker run --rm -v hrc-shelf_storage-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/storage-$(date +%F).tar.gz -C /data .
```

Restore the database into a fresh stack with `pg_restore -U postgres -d postgres --clean --if-exists`
run inside the `db` container.

### Rotating the database password

`POSTGRES_PASSWORD` is applied to the internal Supabase roles only when the
database volume is first created. To change it later, update every role inside
the database first, then `.env`:

```bash
docker compose exec db psql -U supabase_admin -d postgres -c "
  ALTER USER postgres WITH PASSWORD 'NEW';
  ALTER USER supabase_admin WITH PASSWORD 'NEW';
  ALTER USER authenticator WITH PASSWORD 'NEW';
  ALTER USER supabase_auth_admin WITH PASSWORD 'NEW';
  ALTER USER supabase_storage_admin WITH PASSWORD 'NEW';
  ALTER USER pgbouncer WITH PASSWORD 'NEW';"
# set POSTGRES_PASSWORD=NEW in .env, then
docker compose up -d
```

### Rotating the JWT secret

Clear `JWT_SECRET`, `ANON_KEY` and `SERVICE_ROLE_KEY` together, run
`bash scripts/generate-secrets.sh`, then `docker compose up -d`. Everyone is
signed out.

## Troubleshooting

| Symptom                                                    | Check                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shelf` keeps restarting                                   | `docker compose logs shelf`. A missing required variable prints `<NAME> is not set`; a failed migration stops before the server starts.                                        |
| No login code arrives                                      | `docker compose logs auth` shows SMTP errors. Check `SMTP_PORT` (465 implicit TLS, 587 STARTTLS) and that the sender address is allowed by your mail server.                   |
| Login works but images are broken                          | The browser cannot reach `SUPABASE_PUBLIC_URL`. Check DNS, the certificate, and `curl https://supabase.assets.example.org/storage/v1/status`.                                  |
| Errors that mention `fetch failed` or timeouts to Supabase | The `shelf` container cannot reach the Supabase hostname. Set `SUPABASE_HOST`, and allow traffic from the Docker bridge to port 443 if a host firewall (e.g. `ufw`) blocks it. |
| Uploads fail with `413`                                    | Raise `client_max_body_size` in the host nginx, `gateway/nginx.conf` and `FILE_SIZE_LIMIT` together.                                                                           |
| Users are logged out on every request                      | `SERVER_URL` must be `https://...` and nginx must send `X-Forwarded-Proto`.                                                                                                    |

## Files

| Path                                     | Purpose                                             |
| ---------------------------------------- | --------------------------------------------------- |
| `deploy/docker-compose.yml`              | All services, health checks and derived variables   |
| `deploy/env.example`                     | Template for `deploy/.env`                          |
| `deploy/scripts/generate-secrets.sh`     | Creates `.env` and fills secrets                    |
| `deploy/gateway/nginx.conf`              | Internal Supabase gateway and email template server |
| `deploy/supabase/templates/`             | OTP email bodies (edit to translate)                |
| `deploy/supabase/init/create-buckets.sh` | Storage bucket bootstrap                            |
| `deploy/supabase/db/`                    | First-boot database scripts                         |
| `deploy/nginx/hrc-shelf.conf.example`    | Host nginx site                                     |
