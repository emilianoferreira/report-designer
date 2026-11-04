-- Explicit, additive migration. Apply once as schema owner; never at API startup.
BEGIN;
CREATE TABLE auth_users (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email varchar(254) NOT NULL UNIQUE CHECK (email = lower(trim(email))),
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true
);
CREATE TABLE auth_memberships (
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id),
    role text NOT NULL CHECK (role IN ('editor', 'viewer')),
    PRIMARY KEY (user_id, company_id)
);
CREATE TABLE auth_sessions (
    token_hash char(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id),
    csrf_token char(64) NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours')
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_login_limits (
    key_hash char(64) PRIMARY KEY,
    attempts integer NOT NULL,
    window_start timestamptz NOT NULL
);
COMMIT;
