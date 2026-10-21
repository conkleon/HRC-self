#!/bin/sh
# Creates the Supabase Storage buckets Shelf expects (see
# apps/docs/supabase-setup.md, "Create Storage Buckets").
#
# Idempotent: an existing bucket has its public flag brought in line with the
# list below, so the job is safe to run on every `docker compose up`.
#
# No storage policies are needed. RLS is enabled on storage.objects and no
# policy grants anon or authenticated users anything, so browsers can only read
# public buckets and signed URLs. Shelf writes with the service role key.
set -eu

API="http://storage:5000"
AUTH="Authorization: Bearer ${SERVICE_ROLE_KEY}"

# ensure_bucket <id> <public: true|false>
ensure_bucket() {
  id="$1"
  public="$2"
  body="{\"id\":\"${id}\",\"name\":\"${id}\",\"public\":${public}}"

  status=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" "${API}/bucket/${id}")

  if [ "$status" = "200" ]; then
    curl -sf -X PUT -H "$AUTH" -H "Content-Type: application/json" \
      -d "$body" "${API}/bucket/${id}" >/dev/null
    echo "bucket ${id}: exists (public=${public})"
  else
    curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" \
      -d "$body" "${API}/bucket" >/dev/null
    echo "bucket ${id}: created (public=${public})"
  fi
}

ensure_bucket profile-pictures true
ensure_bucket files true
ensure_bucket assets false
ensure_bucket kits false

echo "storage buckets ready"
