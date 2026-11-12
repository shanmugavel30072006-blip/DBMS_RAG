-- Prevent ambiguous logins differing only in case. Resolve existing duplicates before running.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email)) WHERE email IS NOT NULL;
