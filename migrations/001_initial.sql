-- Migration 001: Initial schema
-- Version after apply: 1. Runner updates schema_version.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  source_plugin_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_source_plugin_id ON cards(source_plugin_id);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS folder_snapshots (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folder_snapshots_folder_id ON folder_snapshots(folder_id);

CREATE TABLE IF NOT EXISTS folder_snapshot_cards (
  snapshot_id TEXT NOT NULL REFERENCES folder_snapshots(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  position INTEGER,
  PRIMARY KEY (snapshot_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_folder_snapshot_cards_card_id ON folder_snapshot_cards(card_id);

CREATE TABLE IF NOT EXISTS group_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('user', 'suggested')),
  suggested_plugin_id TEXT,
  suggested_template_id TEXT,
  rules_json TEXT NOT NULL,
  rule_logic TEXT NOT NULL CHECK (rule_logic IN ('and', 'or')),
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  filters_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at);
