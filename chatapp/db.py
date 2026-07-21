import sqlite3
from datetime import datetime

import click
from flask import current_app, g


def get_db():
    """Return a database connection for THIS request.

    `g` is the per-request scratchpad (you met this in Flaskr). The first
    time get_db() is called during a request, there's no 'db' on g yet,
    so we open a fresh connection and stash it there. If get_db() is called
    AGAIN later in the same request (e.g. one view calls two helper
    functions that both need the db), we just hand back the same
    connection instead of opening a second one.
    """
    if 'db' not in g:
        g.db = sqlite3.connect(
            current_app.config['DATABASE'],
            # PARSE_DECLTYPES: tells sqlite3 to look at each column's
            # declared type (from schema.sql, e.g. "created TIMESTAMP")
            # and convert the raw text it stores into a real Python type
            # when you read it back. Without this, `created` would come
            # back as a plain string, not a datetime object.
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        # row_factory = sqlite3.Row lets you access columns by NAME
        # (row['email']) instead of only by position (row[1]) — same
        # thing Flaskr used.
        g.db.row_factory = sqlite3.Row

    return g.db


def close_db(e=None):
    """Close the connection at the end of the request, if one was opened.

    g.pop('db', None) means: "remove 'db' from g and give it to me — or
    give me None if it was never there." That None-safety matters because
    close_db runs after EVERY request, even ones that never touched the
    database at all (like a simple /ping route) — in that case there's
    nothing to close, and this just quietly does nothing instead of
    crashing.
    """
    db = g.pop('db', None)

    if db is not None:
        db.close()


def init_db():
    """Wipe and rebuild the database from schema.sql.

    open_resource() opens a file that lives INSIDE the chatapp package
    (not relative to wherever the terminal happens to be standing) — this
    is what makes `flask --app chatapp init-db` work no matter what folder
    you run it from. We read the whole schema.sql as one big string and
    hand it to executescript(), which runs every statement in it in order
    (all three DROP TABLEs, then all three CREATE TABLEs).
    """
    db = get_db()

    with current_app.open_resource('schema.sql') as f:
        db.executescript(f.read().decode('utf8'))


@click.command('init-db')
def init_db_command():
    """Register a new `flask` subcommand called `init-db`.

    @click.command turns this plain function into something runnable from
    the terminal as `flask --app chatapp init-db`. It just calls init_db()
    and prints a confirmation so you know it actually ran.
    """
    init_db()
    click.echo('Initialized the database.')


# This line teaches Python's sqlite3 library HOW to turn the raw text
# stored in a "timestamp" column back into a real Python datetime object.
# It's the other half of PARSE_DECLTYPES above: PARSE_DECLTYPES says
# "look at the declared column type and convert it"; this line says
# "and here's HOW to convert a timestamp, specifically."
# v.decode() turns the raw bytes sqlite gives us into a string;
# datetime.fromisoformat() parses that string into a real datetime.
# Without this line, `row['created']` would just be a plain string like
# "2026-07-21 10:30:00" instead of an actual datetime object you could,
# say, format or compare.
sqlite3.register_converter(
    "timestamp", lambda v: datetime.fromisoformat(v.decode())
)


def init_app(app):
    """The handshake — same shape as Flaskr's db.py.

    teardown_appcontext(close_db): "after every request, no matter what,
    call close_db." This is what guarantees connections don't pile up.

    cli.add_command(init_db_command): adds the init-db subcommand to the
    `flask` tool itself — this is what makes `flask --app chatapp init-db`
    exist as a command in the first place.
    """
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)