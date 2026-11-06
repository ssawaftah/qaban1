CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  client_hash TEXT PRIMARY KEY,
  first_attempt_at INTEGER NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS auth_login_attempts_lock_idx ON auth_login_attempts(locked_until);
--> statement-breakpoint
