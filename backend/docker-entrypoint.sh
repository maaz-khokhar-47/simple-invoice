#!/bin/sh
set -e

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

# The seed skips rows that already exist, so running it on every start is safe
if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding database..."
  node dist/database/seed/seed.js
fi

exec node dist/main.js
