-- ============================================================
-- マイグレーション v3: 箱下計算オプション追加
-- Supabase SQL Editor で実行してください
-- ============================================================

-- presets: 箱下計算の有無（true=箱下あり, false=箱下なし=0扱い）
ALTER TABLE presets ADD COLUMN IF NOT EXISTS hako_shita_enabled BOOLEAN NOT NULL DEFAULT true;
