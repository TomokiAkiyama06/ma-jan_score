-- ============================================================
-- 実機テスト用シードデータ
-- セット精算（場代100円・送金1000円・ゼロサム）動作確認用
-- ============================================================
--
-- 使い方:
--   1. Supabase Dashboard > SQL Editor を開く
--   2. 下記スクリプト全体を貼り付けて実行
--   3. アプリで対象ユーザーとしてログインし、ホーム画面で進行中セットを確認
--   4. 「終了」ボタンから精算フローへ進む
--
-- 投入内容:
--   - preset: テスト用「テスト_千点100_30000返し_箱下OFF」
--   - session: 7時間前に開始した進行中セット (reserve_fee=0, hourly_rate=1000)
--   - hanchans: 6半荘ぶん（30分間隔で記録）
--
-- 期待結果:
--   - 場代総額 7,000円、1半荘あたり 1,200円
--   - 各人の正味: 自分=+5,400 / A=+9,200 / B=-6,400 / C=-15,400
--   - 送金: C→A 12,000 / B→自分 5,000 / C→自分 2,000
--
-- 再実行する場合は最後のクリーンアップSQLを利用してください。
-- ============================================================

DO $$
DECLARE
  v_user_id UUID;
  v_preset_id UUID;
  v_session_id UUID;
  v_started_at TIMESTAMPTZ := NOW() - INTERVAL '7 hours';
  v_seats TEXT[] := ARRAY['自分', 'A', 'B', 'C'];
BEGIN
  -- 対象ユーザーを取得（必要に応じてメールアドレスを変更）
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'qiushantomoki257@gmail.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ユーザーが見つかりません。email を実在するアカウントに書き換えてください。';
  END IF;

  -- ── プリセット作成 ─────────────────────────────────────
  INSERT INTO presets (
    user_id, name, rate,
    uma_first, uma_second, uma_third, uma_fourth,
    starting_score, return_score, oka_enabled,
    chip_rate, seat_change_interval, hako_shita_enabled, is_default
  ) VALUES (
    v_user_id, 'テスト_千点100_30000返し_箱下OFF', 100,
    20, 10, -10, -20,
    25000, 30000, true,
    100, NULL, false, false
  ) RETURNING id INTO v_preset_id;

  -- ── セッション作成（進行中・7時間前開始） ───────────────
  -- reserve_fee=0 にして 1000円/h × 7h = 7000円 ぴったりにする
  INSERT INTO sessions (
    user_id, preset_id, mode, started_at, ended_at,
    set_name, participants, hourly_rate, reserve_fee, chip_rate
  ) VALUES (
    v_user_id, v_preset_id, 'set', v_started_at, NULL,
    'テストセット（精算動作確認）',
    v_seats, 1000, 0, 100
  ) RETURNING id INTO v_session_id;

  -- ── 6半荘ぶん挿入 ─────────────────────────────────────
  -- 半荘1: A がトップ（28000, 32000, 22000, 18000） / 自分=2位
  INSERT INTO hanchans (user_id, session_id, played_at, scores, my_seat_index, my_rank, participants_per_seat, chip_count)
  VALUES (v_user_id, v_session_id, v_started_at + INTERVAL '30 minutes',
    ARRAY[28000, 32000, 22000, 18000], 0, 2, v_seats, 0);

  -- 半荘2: B がトップ・同点ケース（27500, 27500, 30000, 15000） / 自分=2位
  INSERT INTO hanchans (user_id, session_id, played_at, scores, my_seat_index, my_rank, participants_per_seat, chip_count)
  VALUES (v_user_id, v_session_id, v_started_at + INTERVAL '1 hour 30 minutes',
    ARRAY[27500, 27500, 30000, 15000], 0, 2, v_seats, 0);

  -- 半荘3: 自分がトップ（40000, 25000, 20000, 15000）
  INSERT INTO hanchans (user_id, session_id, played_at, scores, my_seat_index, my_rank, participants_per_seat, chip_count)
  VALUES (v_user_id, v_session_id, v_started_at + INTERVAL '2 hours 30 minutes',
    ARRAY[40000, 25000, 20000, 15000], 0, 1, v_seats, 0);

  -- 半荘4: A がトップ・箱下OFF発動（25000, 60000, 20000, -5000） / 自分=2位
  INSERT INTO hanchans (user_id, session_id, played_at, scores, my_seat_index, my_rank, participants_per_seat, chip_count)
  VALUES (v_user_id, v_session_id, v_started_at + INTERVAL '3 hours 30 minutes',
    ARRAY[25000, 60000, 20000, -5000], 0, 2, v_seats, 0);

  -- 半荘5: C がトップ・自分=4位（15000, 28000, 22000, 35000）
  INSERT INTO hanchans (user_id, session_id, played_at, scores, my_seat_index, my_rank, participants_per_seat, chip_count)
  VALUES (v_user_id, v_session_id, v_started_at + INTERVAL '4 hours 30 minutes',
    ARRAY[15000, 28000, 22000, 35000], 0, 4, v_seats, 0);

  -- 半荘6: 自分がトップ（32000, 28000, 25000, 15000）
  INSERT INTO hanchans (user_id, session_id, played_at, scores, my_seat_index, my_rank, participants_per_seat, chip_count)
  VALUES (v_user_id, v_session_id, v_started_at + INTERVAL '6 hours',
    ARRAY[32000, 28000, 25000, 15000], 0, 1, v_seats, 0);

  RAISE NOTICE 'シード完了: session_id=%, preset_id=%', v_session_id, v_preset_id;
END $$;

-- ============================================================
-- クリーンアップ（テストデータを削除したいとき）
-- ============================================================
-- DELETE FROM hanchans
--   WHERE session_id IN (
--     SELECT id FROM sessions WHERE set_name = 'テストセット（精算動作確認）'
--   );
-- DELETE FROM sessions WHERE set_name = 'テストセット（精算動作確認）';
-- DELETE FROM presets WHERE name = 'テスト_千点100_30000返し_箱下OFF';
