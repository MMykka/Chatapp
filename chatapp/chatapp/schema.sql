-- Drop existing tables first so this file can be re-run safely
-- (this is why `flask --app chatapp init-db` can be run again without errors)
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS chats;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS documents;

-- One row per account.
-- is_admin: 0 = regular user, 1 = admin (can upload/manage documents)
CREATE TABLE user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,      -- UNIQUE: no two accounts can share an email
  password TEXT NOT NULL,          -- stores a HASH, never the real password
  is_admin INTEGER                 -- 0/1 flag; check with `if user['is_admin']:`
);

-- One row per conversation. Belongs to exactly one user.
CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,                       -- which user owns this chat
  title TEXT,                                     -- e.g. "Ollama setup help"
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id)       -- user_id must match a real user.id
);

-- One row per message inside a chat. Belongs to exactly one chat.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT NOT NULL,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats (id)
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES user (id)
);

