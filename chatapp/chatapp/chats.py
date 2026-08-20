import functools
import json
import re
import sqlite3
import time
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, abort, request, Response, stream_with_context, current_app
from chatapp.auth import login_required
from chatapp.db import get_db
from chatapp.rag import retrieve_with_fallback
from chatapp.ollama_client import chat_completion, chat_completion_stream, MODEL_NAME
from chatapp.activity_log import log_activity
from chatapp import cache


bp = Blueprint('chats', __name__, url_prefix='/api/chats')


EXPECTED_RESPONSE_TOKENS = 300


def _iso(dt):
    return dt.isoformat() + 'Z' if dt else None


@bp.route('', methods=('GET',))
@login_required
def list_chats():
    db = get_db()

    limit = request.args.get('limit', default=50, type=int) or 50
    offset = request.args.get('offset', default=0, type=int) or 0
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    total = db.execute(
        'SELECT COUNT(*) AS c FROM chats WHERE user_id = ?', (g.user['id'],)
    ).fetchone()['c']

    chats = db.execute(
        'SELECT id, title, folder_id, created, updated FROM chats WHERE user_id = ? ORDER BY updated DESC LIMIT ? OFFSET ?',
        (g.user['id'], limit, offset)
    ).fetchall()

    return jsonify({
        'chats': [
            {
                'id': c['id'],
                'title': c['title'],
                'folder_id': c['folder_id'],
                'created': _iso(c['created']),
                'updated': _iso(c['updated']),
            }
            for c in chats
        ],
        'total': total,
        'limit': limit,
        'offset': offset,
    })


def _snippet(text, query, radius=60):
    if not text:
        return ''

    idx = text.lower().find(query.lower())
    if idx == -1:
        return text[:radius * 2].strip()

    start = max(0, idx - radius)
    end = min(len(text), idx + len(query) + radius)
    snippet = text[start:end].strip()
    if start > 0:
        snippet = '…' + snippet
    if end < len(text):
        snippet = snippet + '…'
    return snippet


@bp.route('/search', methods=('GET',))
@login_required
def search_chats():
    query = (request.args.get('q') or '').strip()
    if not query:
        return jsonify({'results': []})

    db = get_db()
    like = f'%{query}%'
    rows = db.execute(
        '''
        SELECT c.id, c.title, c.updated,
          (SELECT content FROM messages m
           WHERE m.chat_id = c.id AND m.content LIKE ?
           ORDER BY m.created LIMIT 1) AS match
        FROM chats c
        WHERE c.user_id = ?
          AND (c.title LIKE ? OR EXISTS (
            SELECT 1 FROM messages m WHERE m.chat_id = c.id AND m.content LIKE ?
          ))
        ORDER BY c.updated DESC
        LIMIT 50
        ''',
        (like, g.user['id'], like, like)
    ).fetchall()

    return jsonify({
        'results': [
            {
                'id': r['id'],
                'title': r['title'],
                'updated': _iso(r['updated']),
                'snippet': _snippet(r['match'], query),
            }
            for r in rows
        ]
    })


@bp.route('', methods=('POST',))
@login_required
def create_chat():
    db = get_db()
    cursor = db.execute(
        'INSERT INTO chats (user_id, title, updated) VALUES (?, ?, CURRENT_TIMESTAMP)',
        (g.user['id'], 'New chat')
    )
    log_activity(db, 'chat_created', f"Created chat #{cursor.lastrowid}")
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


@bp.route('/<int:id>', methods=('GET',))
@login_required
def get_chat_detail(id):
    chat = get_chat(id)

    # Reopening a chat re-runs the same join/serialize on every click, so a
    # short-lived cache saves the round trip for chats people flip back to.
    cache_key = f'chat_detail:{id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    payload = {
        'id': chat['id'],
        'title': chat['title'],
        'folder_id': chat['folder_id'],
        'created': _iso(chat['created']),
        'updated': _iso(chat['updated']),
        'messages': _serialize_messages(id),
    }
    cache.set(cache_key, payload)
    return jsonify(payload)


@bp.route('/<int:id>', methods=('PUT',))
@login_required
def rename_chat(id):
    chat = get_chat(id)

    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title cannot be empty.'}), 400

    db = get_db()
    db.execute('UPDATE chats SET title = ?, updated = CURRENT_TIMESTAMP WHERE id = ?', (title, id))
    log_activity(db, 'chat_renamed', f"Renamed chat #{id} from '{chat['title']}' to '{title}'")
    db.commit()
    cache.invalidate(f'chat_detail:{id}')
    return jsonify({'id': id, 'title': title})


@bp.route('/<int:id>', methods=('DELETE',))
@login_required
def delete_chat(id):
    chat = get_chat(id)
    db = get_db()
    db.execute('DELETE FROM messages WHERE chat_id = ?', (id,))
    db.execute('DELETE FROM chats WHERE id = ?', (id,))
    log_activity(db, 'chat_deleted', f"Deleted chat #{id} ('{chat['title']}')")
    db.commit()
    cache.invalidate(f'chat_detail:{id}')
    return jsonify({'success': True})


@bp.route('/<int:id>/folder', methods=('PUT',))
@login_required
def move_chat(id):
    chat = get_chat(id)
    data = request.get_json() or {}
    folder_id = data.get('folder_id')

    db = get_db()
    if folder_id is not None:
        folder = db.execute(
            'SELECT id FROM folders WHERE id = ? AND user_id = ?', (folder_id, g.user['id'])
        ).fetchone()
        if folder is None:
            abort(404, f"Folder id {folder_id} doesn't exist.")

    db.execute('UPDATE chats SET folder_id = ? WHERE id = ?', (folder_id, id))
    log_activity(db, 'chat_moved', f"Moved chat #{id} ('{chat['title']}') to folder {folder_id}")
    db.commit()
    cache.invalidate(f'chat_detail:{id}')
    return jsonify({'id': id, 'folder_id': folder_id})


def _serialize_messages(id):
    db = get_db()
    messages = db.execute(
        'SELECT role, content, sources, response_time FROM messages WHERE chat_id = ? ORDER BY created',
        (id,)
    ).fetchall()

    result = []
    for msg in messages:
        row = dict(msg)
        row['sources'] = json.loads(row['sources'])
        result.append(row)

    return result


@bp.route('/<int:id>/messages', methods=('GET',))
@login_required
def list_messages(id):
    get_chat(id)
    return jsonify(_serialize_messages(id))


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
    db.execute('UPDATE chats SET updated = CURRENT_TIMESTAMP WHERE id = ?', (id,))
    log_activity(db, 'message_sent', f"Sent a message in chat #{id}")
    db.commit()
    cache.invalidate(f'chat_detail:{id}')

    chunks, sources = retrieve_with_fallback(user_content)

    history = db.execute(
        'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created',
        (id,)
    ).fetchall()
    messages = [{'role': m['role'], 'content': m['content']} for m in history]

    start = time.monotonic()
    reply = chat_completion(messages, context_chunks=chunks)
    response_time = round(time.monotonic() - start, 2)

    db.execute(
        'INSERT INTO messages (chat_id, role, content, sources, model, tokens_used, response_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (id, 'assistant', reply['content'], json.dumps(sources), reply['model'], reply['tokens_used'], response_time)
    )
    db.commit()
    cache.invalidate(f'chat_detail:{id}')

    return jsonify({'content': reply['content'], 'sources': sources, 'response_time': response_time})


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
    db.execute('UPDATE chats SET updated = CURRENT_TIMESTAMP WHERE id = ?', (id,))
    log_activity(db, 'message_sent', f"Sent a message in chat #{id}")
    db.commit()
    cache.invalidate(f'chat_detail:{id}')

    chunks, sources = retrieve_with_fallback(user_content)

    history = db.execute(
        'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created',
        (id,)
    ).fetchall()
    messages = [{'role': m['role'], 'content': m['content']} for m in history]

    database_path = current_app.config['DATABASE']

    def sse_event(payload):
        return f"data: {json.dumps(payload)}\n\n"

    def generate():
        full_reply = ""
        token_count = 0
        usage = {}
        start = time.monotonic()

        for piece in chat_completion_stream(messages, context_chunks=chunks, usage=usage):
            full_reply += piece
            token_count += 1
            # Ollama doesn't report an expected total up front, so completion
            # percentage is approximated against a typical reply length and
            # is forced to 100 on the final "done" event regardless.
            percentage = min(99, round(token_count / EXPECTED_RESPONSE_TOKENS * 100))
            yield sse_event({
                'content': piece,
                'cumulative_text': full_reply,
                'tokens_so_far': token_count,
                'completion_percentage': percentage,
                'done': False,
            })

        response_time = round(time.monotonic() - start, 2)

        conn = sqlite3.connect(database_path)
        conn.execute('PRAGMA foreign_keys = ON')
        conn.execute(
            'INSERT INTO messages (chat_id, role, content, sources, model, tokens_used, response_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (id, 'assistant', full_reply, json.dumps(sources), usage.get('model'), usage.get('tokens_used'), response_time)
        )
        conn.commit()
        conn.close()
        cache.invalidate(f'chat_detail:{id}')

        yield sse_event({
            'content': '',
            'cumulative_text': full_reply,
            'tokens_so_far': token_count,
            'completion_percentage': 100,
            'done': True,
            'model': usage.get('model'),
            'tokens_used': usage.get('tokens_used'),
            'response_time': response_time,
            'sources': sources,
        })

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )


def _slug(title):
    slug = re.sub(r'[^a-z0-9]+', '-', (title or 'chat').lower()).strip('-')
    return slug or 'chat'


@bp.route('/<int:id>/export', methods=('GET',))
@login_required
def export_chat(id):
    chat = get_chat(id)
    fmt = request.args.get('format', 'markdown')

    db = get_db()
    messages = db.execute(
        'SELECT role, content, model, tokens_used, response_time, created FROM messages WHERE chat_id = ? ORDER BY created',
        (id,)
    ).fetchall()

    title = chat['title'] or 'Untitled chat'
    slug = _slug(title)

    if fmt == 'json':
        total_tokens = sum(m['tokens_used'] for m in messages if m['tokens_used'] is not None)
        payload = {
            'title': title,
            'exported_at': datetime.now(timezone.utc).isoformat(),
            'model': MODEL_NAME,
            'total_tokens_used': total_tokens,
            'messages': [
                {
                    'role': m['role'],
                    'content': m['content'],
                    'timestamp': _iso(m['created']),
                    'model': m['model'],
                    'tokens_used': m['tokens_used'],
                    'response_time': m['response_time'],
                }
                for m in messages
            ],
        }
        body = json.dumps(payload, indent=2)
        return Response(body, mimetype='application/json', headers={
            'Content-Disposition': f'attachment; filename="{slug}.json"'
        })

    lines = [f"# {title}", '']
    for m in messages:
        speaker = 'User' if m['role'] == 'user' else 'Assistant'
        lines.append(f"**{speaker}:**")
        lines.append('')
        lines.append(m['content'])
        lines.append('')
    body = '\n'.join(lines)

    return Response(body, mimetype='text/markdown', headers={
        'Content-Disposition': f'attachment; filename="{slug}.md"'
    })