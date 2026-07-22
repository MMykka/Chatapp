import functools
import json 


from flask import Blueprint, g, jsonify, abort
from chatapp.auth import login_required
from chatapp.db import get_db



bp = Blueprint('chats', __name__, url_prefix='/api/chats')

@bp.route('/', methods=('GET',))
@login_required
def list_chats():
    db = get_db()
    chats = db.execute(
        'SELECT id, title FROM chats WHERE user_id = ? ORDER BY created DESC',
        (g.user['id'],)
    ).fetchall()
    return jsonify([dict(row) for row in chats])
   
@bp.route('/', methods=('POST',))
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
    db.execute(
        'DELETE FROM chats WHERE id = ?', (id,)
    )
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