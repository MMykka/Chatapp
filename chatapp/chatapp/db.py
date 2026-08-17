import sqlite3
from datetime import datetime

import click
from flask import current_app, g


def get_db():

    if 'db' not in g:
        g.db = sqlite3.connect(
            current_app.config['DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
        _ensure_schema(g.db)

    return g.db


def _table_exists(db, name):
    return db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def _ensure_schema(db):
    if _table_exists(db, 'messages'):
        columns = {row['name'] for row in db.execute('PRAGMA table_info(messages)').fetchall()}
        if 'model' not in columns:
            db.execute('ALTER TABLE messages ADD COLUMN model TEXT')
        if 'tokens_used' not in columns:
            db.execute('ALTER TABLE messages ADD COLUMN tokens_used INTEGER')
        if 'response_time' not in columns:
            db.execute('ALTER TABLE messages ADD COLUMN response_time REAL')

    if _table_exists(db, 'user'):
        columns = {row['name'] for row in db.execute('PRAGMA table_info(user)').fetchall()}
        if 'created' not in columns:
            db.execute('ALTER TABLE user ADD COLUMN created TIMESTAMP')
            db.execute("UPDATE user SET created = CURRENT_TIMESTAMP WHERE created IS NULL")

    if _table_exists(db, 'chats'):
        columns = {row['name'] for row in db.execute('PRAGMA table_info(chats)').fetchall()}
        if 'updated' not in columns:
            db.execute('ALTER TABLE chats ADD COLUMN updated TIMESTAMP')
            db.execute("UPDATE chats SET updated = created WHERE updated IS NULL")

    if _table_exists(db, 'chats'):
        db.execute('CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats (user_id)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_chats_created ON chats (created)')
    if _table_exists(db, 'messages'):
        db.execute('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created)')

    db.execute('''
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_email TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT,
          created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    db.execute('CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log (created)')

    db.commit()


def close_db(e=None):

    db = g.pop('db', None)

    if db is not None:
        db.close()


def init_db():

    db = get_db()

    with current_app.open_resource('schema.sql') as f:
        db.executescript(f.read().decode('utf8'))


@click.command('init-db')
def init_db_command():

    init_db()
    click.echo('Initialized the database.')

sqlite3.register_converter(
    "timestamp", lambda v: datetime.fromisoformat(v.decode())
)


def init_app(app):
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)