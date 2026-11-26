-- ============================================================================
-- Common Intelligence — Migration 0013: Chess Game History (max 10 games)
-- Stores completed or archived chess matches alongside their round-by-round
-- voting snapshots so users and agents can inspect and replay up to 10 games.
-- ============================================================================

CREATE TABLE IF NOT EXISTS chess_game_history (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  result TEXT NOT NULL DEFAULT '*',
  end_reason TEXT NOT NULL DEFAULT 'draw' CHECK (end_reason IN ('checkmate', 'resign', 'draw', 'aborted')),
  final_fen TEXT NOT NULL,
  total_plies INTEGER NOT NULL DEFAULT 0,
  total_rounds INTEGER NOT NULL DEFAULT 0,
  total_votes INTEGER NOT NULL DEFAULT 0,
  unique_voters INTEGER NOT NULL DEFAULT 0,
  opponent_name TEXT NOT NULL DEFAULT 'Stockfish 19',
  opponent_elo INTEGER NOT NULL DEFAULT 3650,
  move_history_json TEXT NOT NULL DEFAULT '[]',
  vote_history_json TEXT NOT NULL DEFAULT '[]',
  finished_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (challenge_id, game_number)
);

CREATE INDEX IF NOT EXISTS idx_chess_game_history_recent
  ON chess_game_history(challenge_id, game_number DESC);
