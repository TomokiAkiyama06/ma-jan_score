-- ============================================================
-- 麻雀スコア アプリ スキーマ（統合版）
-- ============================================================

-- プリセット
CREATE TABLE presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  rate INTEGER NOT NULL,
  uma_first INTEGER NOT NULL DEFAULT 20,
  uma_second INTEGER NOT NULL DEFAULT 10,
  uma_third INTEGER NOT NULL DEFAULT -10,
  uma_fourth INTEGER NOT NULL DEFAULT -20,
  starting_score INTEGER NOT NULL DEFAULT 25000,
  return_score INTEGER NOT NULL DEFAULT 30000,
  oka_enabled BOOLEAN NOT NULL DEFAULT true,
  chip_rate INTEGER NOT NULL DEFAULT 100,
  seat_change_interval INTEGER,          -- N半荘ごとに場替え。NULL=ルールなし
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- セッション（フリー or セット）
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  preset_id UUID REFERENCES presets(id) NOT NULL,
  mode TEXT NOT NULL DEFAULT 'free' CHECK (mode IN ('free', 'set')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  location_memo TEXT,
  -- セットモード専用
  set_name TEXT,
  participants TEXT[],
  hourly_rate INTEGER,
  reserve_fee INTEGER DEFAULT 1000,
  chip_rate INTEGER,
  total_fee INTEGER,
  participant_chips JSONB,
  split_method TEXT DEFAULT 'per_hanchan_winner'
    CHECK (split_method IN ('per_hanchan_winner', 'equal', 'manual')),
  manual_split JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 半荘記録
CREATE TABLE hanchans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  played_at TIMESTAMPTZ DEFAULT NOW(),
  scores INTEGER[] NOT NULL,
  my_seat_index INTEGER NOT NULL,
  my_rank INTEGER NOT NULL CHECK (my_rank BETWEEN 1 AND 4),
  participants_per_seat TEXT[],          -- セットモード時のみ。scoresと同じ順
  chip_count INTEGER NOT NULL DEFAULT 0,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_hanchans_user_played ON hanchans(user_id, played_at DESC);
CREATE INDEX idx_sessions_user_started ON sessions(user_id, started_at DESC);

-- Row Level Security
ALTER TABLE presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hanchans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_presets" ON presets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_sessions" ON sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_hanchans" ON hanchans FOR ALL USING (auth.uid() = user_id);

-- Storage Bucket: "hanchan-photos" (private)
-- Supabase Dashboard > Storage > New bucket > hanchan-photos > private
-- Storage Policies:
--   INSERT: (auth.uid() = (storage.foldername(name))[1])
--   SELECT: (auth.uid() = (storage.foldername(name))[1])
--   DELETE: (auth.uid() = (storage.foldername(name))[1])
