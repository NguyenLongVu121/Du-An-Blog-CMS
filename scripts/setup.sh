#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -e .env ]; then echo '.env already exists; refusing to overwrite secrets.' >&2; exit 1; fi
umask 077
command -v openssl >/dev/null
cp .env.example .env
for key in MYSQL_PASSWORD MYSQL_ROOT_PASSWORD MYSQL_EXPORTER_PASSWORD; do
  value=$(openssl rand -hex 24)
  sed "s/^${key}=.*/${key}=${value}/" .env > .env.tmp
  mv .env.tmp .env
done
value=$(openssl rand -hex 32)
sed "s/^SESSION_SECRET=.*/SESSION_SECRET=${value}/" .env > .env.tmp
mv .env.tmp .env
chmod 600 .env
echo 'Created .env with random passwords. Never commit it.'
