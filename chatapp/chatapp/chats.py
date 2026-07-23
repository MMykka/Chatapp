import functools
import json
import sqlite3

from flask import Blueprint, g, jsonify, abort, request, Response, stream_with_context, current_app
from chatapp.auth import login_required
from chatapp.db import get_db
from chatapp.rag import retrieve_with_fallback
from chatapp.ollama_client import chat_completion, chat_completion_stream


bp = Blueprint('chats', __name__, url_prefix='/api/chats')


@bp.route('', methods=('GET',))
@login_required
def list_chats():
    db = get_db()
    chats = db.execute(
        'SELECT id, title FROM chats WHERE user_id = ? ORDER BY created DESC',
        (g.user['id'],)
    ).fetchall()
    return jsonify([dict(row) for row in chats])


@bp.route('', methods=('POST',))
@login_required
def create_chat():
    db = get_db()
    cursor = db.execute(
        'INSERT INTO chats (user_id, title) VALUES (?, ?)',
        (g.user['id'], 'New chat')
    )
    db.commit()
    return jsonify({'id': cursor.lastrowid, 'title': 'New chat'})


def get_chat(id):
    db = get_db()
    chat = db.execute(
        'SELECT * FROM chats WHERE id = ?', (id,)
    ).fetchone()

    if chat is None:
        abort(404, f"Chat id {id} doesn't exist.")

    if chat['user_id'] != g.user['id']:
        abort(403)

    return chat


@bp.route('/<int:id>', methods=('DELETE',))
@login_required
def delete_chat(id):
    get_chat(id)
    db = get_db()
    db.execute('DELETE FROM chats WHERE id = ?', (id,))
    db.commit()
    return jsonify({'success': True})


@bp.route('/<int:id>/messages', methods=('GET',))
@login_required
def list_messages(id):
    get_chat(id)
    db = get_db()
    messages = db.execute(
        'SELECT role, content, sources FROM messages WHERE chat_id = ? ORDER BY created',
        (id,)
    ).fetchall()

    result = []
    for msg in messages:
        row = dict(msg)
        row['sources'] = json.loads(row['sources'])
        result.append(row)

    return jsonify(result)


@bp.route('/<int:id>/messages', methods=('POST',))
@login_required
def send_message(id):
    get_chat(id)
    db = get_db()

    data = request.get_json()
    user_content = data.get('content')

    db.execute(
        'INSERT INTO messages (chat_id, role, content, sources) VALUES (?, ?, ?, ?)',
        (id, 'user', user_content, json.dumps([]))
    )
    db.commit()

    chunks, sources = retrieve_with_fallback(user_content)

    history = db.execute(
        'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created',
        (id,)
    ).fetchall()
    messages = [{'role': m['role'], 'content': m['content']} for m in history]

    reply = chat_completion(messages, context_chunks=chunks)

    db.execute(
        'INSERT INTO messages (chat_id, role, content, sources) VALUES (?, ?, ?, ?)',
        (id, 'assistant', reply, json.dumps(sources))
    )
    db.commit()

    return jsonify({'content': reply, 'sources': sources})


@bp.route('/<int:id>/messages/stream', methods=('POST',))
@login_required
def send_message_stream(id):
    get_chat(id)
    db = get_db()

    data = request.get_json()
    user_content = data.get('content')

    db.execute(
        'INSERT INTO messages (chat_id, role, content, sources) VALUES (?, ?, ?, ?)',
        (id, 'user', user_content, json.dumps([]))
    )
    db.commit()

    chunks, sources = retrieve_with_fallback(user_content)

    history = db.execute(
        'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created',
        (id,)
    ).fetchall()
    messages = [{'role': m['role'], 'content': m['content']} for m in history]

    database_path = current_app.config['DATABASE']

    def generate():
        full_reply = ""
        for piece in chat_completion_stream(messages, context_chunks=chunks):
            full_reply += piece
            yield piece

        conn = sqlite3.connect(database_path)
        conn.execute(
            'INSERT INTO messages (chat_id, role, content, sources) VALUES (?, ?, ?, ?)',
            (id, 'assistant', full_reply, json.dumps(sources))
        )
        conn.commit()
        conn.close()

    return Response(stream_with_context(generate()), mimetype='text/plain')