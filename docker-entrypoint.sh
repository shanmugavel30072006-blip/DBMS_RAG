#!/bin/sh
set -e

# Check database availability if connection details are provided
if [ -n "$DATABASE_URL" ] || [ -n "$PGHOST" ]; then
  echo "=> Checking database availability..."
  node scripts/wait-for-db.mjs || {
    echo "=> WARNING: Database check encountered an issue; proceeding with startup."
  }
fi

# Run seed & migrations if AUTO_SEED is enabled (default: true)
if [ "${AUTO_SEED:-true}" = "true" ] && [ "${SKIP_DB_SEED:-false}" != "true" ]; then
  echo "=> Executing database initialization/migrations (npm run db:seed)..."
  npm run db:seed || {
    echo "=> WARNING: npm run db:seed returned non-zero. Check database logs if this is first run."
  }
fi

echo "=> Launching AstroRAG application ($*)..."
exec "$@"

