-- Drop existing tables first so this file can be re-run safely
-- (this is why `flask --app chatapp init-db` can be run again without errors)
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS chats;
DROP TABLE IF EXISTS messages;

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
  chat_id INTEGER NOT NULL,                        -- which chat this message belongs to
  role TEXT NOT NULL,                              -- 'user' or 'assistant'
  content TEXT NOT NULL,                           -- the actual message text
  sources TEXT NOT NULL,                           -- JSON-encoded list of filenames, e.g. '["policy.pdf"]'
                                                    -- store with json.dumps(list) -> string
                                                    -- read back with json.loads(string) -> list
  FOREIGN KEY (chat_id) REFERENCES chats (id)      -- chat_id must match a real chats.id
);