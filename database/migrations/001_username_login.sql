-- Adds username-based sign-in to an existing database (safe to re-run).

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(60);

UPDATE users
   SET username = split_part(email, '@', 1)
 WHERE username IS NULL;

-- Make duplicated derived usernames unique by appending the user id.
UPDATE users u
   SET username = u.username || '_' || u.user_id
 WHERE EXISTS (
   SELECT 1 FROM users v
    WHERE v.username = u.username AND v.user_id < u.user_id
 );

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username);
