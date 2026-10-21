# HRC Shelf deployment

Docker Compose stack that runs Shelf with its own self-hosted Supabase behind
the server's nginx. Full guide: [apps/docs/self-hosted-stack.md](../apps/docs/self-hosted-stack.md).

```bash
cd deploy
bash scripts/generate-secrets.sh      # creates .env and fills the secrets
nano .env                             # set the URLs and SMTP settings
sudo cp nginx/hrc-shelf.conf.example /etc/nginx/sites-available/hrc-shelf.conf
docker compose up -d --build
```

To try it on your own machine first (Mailpit catches all email at
<http://localhost:8025>):

```bash
cd deploy
bash scripts/generate-secrets.sh --local
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
# open http://localhost:3000
```

In production, Shelf is served on `127.0.0.1:3000`, the Supabase gateway on `127.0.0.1:8000`
and Studio on `127.0.0.1:54323`. Only the host nginx should expose the first
two; reach Studio through an SSH tunnel.
