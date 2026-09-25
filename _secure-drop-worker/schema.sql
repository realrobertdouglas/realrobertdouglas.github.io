-- Messages are stored exactly as they arrived: armored OpenPGP ciphertext only Robert's key can open.
-- Nothing is deleted; the inbox archives instead.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  ciphertext TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_created ON messages (created_at DESC);
-- Rate limiting: per-sender counts keyed by a salted hash of the IP (raw IPs are never stored).
CREATE TABLE IF NOT EXISTS hits (k TEXT PRIMARY KEY, d TEXT NOT NULL, n INTEGER NOT NULL);
