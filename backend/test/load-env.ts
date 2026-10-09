// e2e tests talk to a real database, so pick up DATABASE_URL etc. from .env
try {
  process.loadEnvFile();
} catch {
  // CI passes env vars directly
}
