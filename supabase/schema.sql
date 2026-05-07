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
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- セッション
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  preset_id UUID REFERENCES presets(id) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  location_memo TEXT,
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
-- Supabase Dashboardで以下を設定:
-- 1. Storage > New bucket > "hanchan-photos" > private
-- 2. Storage Policies:
--    INSERT: (auth.uid() = (storage.foldername(name))[1])
--    SELECT: (auth.uid() = (storage.foldername(name))[1])
--    DELETE: (auth.uid() = (storage.foldername(name))[1])
