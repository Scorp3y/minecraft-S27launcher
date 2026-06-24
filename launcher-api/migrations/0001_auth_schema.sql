
CREATE EXTENSION IF NOT EXISTS pgcrypto;


DO $$

BEGIN

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN

        CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');

    END IF;


    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN

        CREATE TYPE user_status AS ENUM (

            'pending_email_verification',

            'active',

            'banned',

            'disabled'

        );

    END IF;

END $$;


CREATE TABLE IF NOT EXISTS users (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),


    email_encrypted TEXT NOT NULL,

    email_hash CHAR(64) NOT NULL UNIQUE,


    nickname VARCHAR(32) NOT NULL,

    nickname_normalized VARCHAR(32) NOT NULL UNIQUE,


    password_hash TEXT NOT NULL,


    role user_role NOT NULL DEFAULT 'user',

    status user_status NOT NULL DEFAULT 'pending_email_verification',


    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    email_verified_at TIMESTAMPTZ NULL,


    last_login_at TIMESTAMPTZ NULL,


    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_registered_at ON users(registered_at);


CREATE TABLE IF NOT EXISTS refresh_tokens (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),


    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,


    token_hash CHAR(64) NOT NULL UNIQUE,


    user_agent TEXT NULL,

    ip_address INET NULL,


    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ NULL,


    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);


CREATE TABLE IF NOT EXISTS email_verification_tokens (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),


    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,


    code_hash CHAR(64) NOT NULL,


    attempts INT NOT NULL DEFAULT 0,

    max_attempts INT NOT NULL DEFAULT 5,


    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ NULL,


    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);


CREATE TABLE IF NOT EXISTS password_reset_tokens (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),


    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,


    token_hash CHAR(64) NOT NULL UNIQUE,


    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ NULL,


    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);


CREATE OR REPLACE FUNCTION set_updated_at()

RETURNS TRIGGER AS $$

BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;

$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;


CREATE TRIGGER trg_users_set_updated_at

BEFORE UPDATE ON users

FOR EACH ROW

EXECUTE FUNCTION set_updated_at();



