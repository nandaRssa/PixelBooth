-- ========================================================
-- PIXELBOOTH — SUPABASE POSTGRESQL DATABASE SCHEMA
-- Jalankan skrip ini di SQL Editor Supabase untuk membuat
-- seluruh tabel database PixelBooth secara instan.
-- ========================================================

-- 1. Tabel users
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified_at TIMESTAMP NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    remember_token VARCHAR(100) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    email VARCHAR(255) PRIMARY KEY,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel sessions
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id BIGINT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    payload TEXT NOT NULL,
    last_activity INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_index ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_last_activity_index ON sessions (last_activity);

-- 4. Tabel cache & cache_locks
CREATE TABLE IF NOT EXISTS cache (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    expiration INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cache_expiration_index ON cache (expiration);

CREATE TABLE IF NOT EXISTS cache_locks (
    key VARCHAR(255) PRIMARY KEY,
    owner VARCHAR(255) NOT NULL,
    expiration INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cache_locks_expiration_index ON cache_locks (expiration);

-- 5. Tabel templates
CREATE TABLE IF NOT EXISTS templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    template_file VARCHAR(255) NOT NULL,
    preview_file VARCHAR(255) NULL,
    canvas_width INTEGER DEFAULT 1080,
    canvas_height INTEGER DEFAULT 1920,
    frame_count INTEGER DEFAULT 1,
    frame_configuration JSONB NULL,
    detection_method VARCHAR(50) DEFAULT 'transparent',
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS templates_status_index ON templates (status);

-- 6. Tabel folders
CREATE TABLE IF NOT EXISTS folders (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_folder_id BIGINT NULL REFERENCES folders(id) ON DELETE SET NULL,
    unique_token UUID UNIQUE NOT NULL,
    qr_path VARCHAR(255) NULL,
    google_drive_id VARCHAR(255) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabel photo_sessions
CREATE TABLE IF NOT EXISTS photo_sessions (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    folder_id BIGINT NULL REFERENCES folders(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active',
    current_frame INTEGER DEFAULT 1,
    total_frames INTEGER DEFAULT 1,
    session_token UUID UNIQUE NOT NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS photo_sessions_status_index ON photo_sessions (status);

-- 8. Tabel session_captures
CREATE TABLE IF NOT EXISTS session_captures (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES photo_sessions(id) ON DELETE CASCADE,
    frame_number INTEGER NOT NULL,
    photo_path VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'captured',
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS session_captures_session_id_frame_number_index ON session_captures (session_id, frame_number);

-- 9. Tabel photos
CREATE TABLE IF NOT EXISTS photos (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NULL REFERENCES photo_sessions(id) ON DELETE SET NULL,
    folder_id BIGINT NULL REFERENCES folders(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(255) NOT NULL,
    thumbnail_path VARCHAR(255) NULL,
    unique_token UUID UNIQUE NOT NULL,
    qr_path VARCHAR(255) NULL,
    is_final BOOLEAN DEFAULT FALSE,
    is_temporary BOOLEAN DEFAULT TRUE,
    google_drive_id VARCHAR(255) NULL,
    google_drive_synced_at TIMESTAMP NULL,
    file_size BIGINT DEFAULT 0,
    mime_type VARCHAR(100) DEFAULT 'image/jpeg',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS photos_is_final_index ON photos (is_final);
CREATE INDEX IF NOT EXISTS photos_is_temporary_index ON photos (is_temporary);

-- 10. Tabel migrations (agar Laravel sync)
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    migration VARCHAR(255) NOT NULL,
    batch INTEGER NOT NULL
);

INSERT INTO migrations (migration, batch) VALUES
('0001_01_01_000000_create_users_table', 1),
('0001_01_01_000001_create_cache_table', 1),
('0001_01_01_000002_create_jobs_table', 1),
('2026_08_20_130002_create_permission_tables', 1),
('2026_08_20_130003_create_personal_access_tokens_table', 1),
('2026_08_20_130013_create_templates_table', 1),
('2026_08_20_130014_create_folders_table', 1),
('2026_08_20_130014_create_photo_sessions_table', 1),
('2026_08_20_130015_add_role_to_users_table', 1),
('2026_08_20_130015_create_photos_table', 1),
('2026_08_20_130015_create_session_captures_table', 1),
('2026_08_21_090000_add_draft_status_to_templates_table', 1)
ON CONFLICT DO NOTHING;
