#!/bin/sh
set -eu
umask 077
mkdir -p /certs
# Named volumes can inherit the official Nginx image's stdout/stderr symlinks.
# Create real files so the file collector can read access and error logs.
mkdir -p /logs
for logfile in /logs/access.log /logs/error.log; do
  if [ -L "$logfile" ]; then rm "$logfile"; fi
  touch "$logfile"
  chmod 644 "$logfile"
done
if [ -s /certs/server.crt ] && [ -s /certs/server.key ]; then
  openssl x509 -in /certs/server.crt -checkend 86400 -noout && exit 0
fi
openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 365 \
  -keyout /certs/server.key -out /certs/server.crt \
  -subj '/C=VN/O=Blog CMS Lab/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
  -addext 'extendedKeyUsage=serverAuth'
chmod 600 /certs/server.key
chmod 644 /certs/server.crt
