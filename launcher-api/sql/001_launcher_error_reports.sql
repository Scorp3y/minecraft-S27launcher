CREATE TABLE IF NOT EXISTS launcher_error_reports (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    user_role TEXT NOT NULL,
    user_status TEXT NOT NULL,
    launcher_version TEXT NOT NULL DEFAULT 'unknown',
    os TEXT NOT NULL DEFAULT 'unknown',
    java_path TEXT,
    ram_min TEXT,
    ram_max TEXT,
    last_error TEXT,
    log_tail TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launcher_error_reports_created_at
    ON launcher_error_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_launcher_error_reports_user_id
    ON launcher_error_reports (user_id);
