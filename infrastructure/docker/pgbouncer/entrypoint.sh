#!/bin/sh
# Builds the auth file from environment variables so no passwords live in the repo.
set -eu
umask 077
{
  printf '"qf_app" "%s"\n' "$QF_APP_PASSWORD"
  printf '"qf_worker" "%s"\n' "$QF_WORKER_PASSWORD"
} > /tmp/userlist.txt
exec pgbouncer /etc/pgbouncer/pgbouncer.ini
