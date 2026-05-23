#!/bin/sh
set -e

mkdir -p /data
chown -R nextjs:nodejs /data

gosu nextjs npx prisma migrate deploy

exec gosu nextjs "$@"
