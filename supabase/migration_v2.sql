-- ============================================================
-- マイグレーション v2: セットモード対応
-- 既存DBに対して実行してください（Supabase SQL Editor）
-- ============================================================

-- presets: 場替え間隔
ALTER TABLE presets ADD COLUMN IF NOT EXISTS seat_change_interval INTEGER;

-- sessions: モード・セットモード専用フィールド
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'free';
ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check CHECK (mode IN ('free', 'set'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS set_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participants TEXT[];
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hourly_rate INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reserve_fee INTEGER DEFAULT 1000;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS chip_rate INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS total_fee INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participant_chips JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS split_method TEXT DEFAULT 'per_hanchan_winner';
ALTER TABLE sessions ADD CONSTRAINT sessions_split_method_check
  CHECK (split_method IN ('per_hanchan_winner', 'equal', 'manual'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS manual_split JSONB;

-- hanchans: 席別参加者
ALTER TABLE hanchans ADD COLUMN IF NOT EXISTS participants_per_seat TEXT[];
