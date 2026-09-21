CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER, max_devices INTEGER NOT NULL DEFAULT 3,
  can_post INTEGER NOT NULL DEFAULT 0, note TEXT, scope TEXT NOT NULL DEFAULT 'all'
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, invite_id TEXT NOT NULL, device_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL, ua TEXT
);
CREATE INDEX IF NOT EXISTS sessions_invite ON sessions(invite_id);
CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY, title TEXT, text TEXT NOT NULL, params TEXT, note TEXT, collection_id TEXT,
  show_p INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, author_invite TEXT
);
CREATE TABLE IF NOT EXISTS prompt_p (prompt_id TEXT NOT NULL, p_name TEXT NOT NULL, p_code TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS prompt_p_prompt ON prompt_p(prompt_id);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY, prompt_id TEXT, r2_key TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
  size INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS images_prompt ON images(prompt_id);
CREATE TABLE IF NOT EXISTS tags (prompt_id TEXT NOT NULL, tag TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tags_prompt ON tags(prompt_id);
CREATE INDEX IF NOT EXISTS tags_tag ON tags(tag);
CREATE TABLE IF NOT EXISTS access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, invite_id TEXT, at INTEGER NOT NULL, action TEXT NOT NULL, ua TEXT);
CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, n INTEGER NOT NULL, minute INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invite_collections (invite_id TEXT NOT NULL, collection_id TEXT NOT NULL, PRIMARY KEY (invite_id, collection_id));
-- invites.scope: 'all' | 'some' (allowed collections in invite_collections; unfiled prompts only visible to 'all')
-- every migration ends by recording its own number
INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, strftime('%s','now') * 1000);
