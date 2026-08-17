import sqlite3

from flask import Blueprint, g, request, jsonify
from werkzeug.security import generate_password_hash

from chatapp.db import get_db
from chatapp.auth import admin_required, login_required
from chatapp.activity_log import log_activity

bp = Blueprint('users', __name__, url_prefix='/api/users')


@bp.route('', methods=('GET',))
@admin_required
def list_users():
    db = get_db()
    users = db.execute(
        'SELECT id, email, is_admin FROM user ORDER BY email'
    ).fetchall()
    return jsonify([
        {'id': u['id'], 'email': u['email'], 'is_admin': bool(u['is_admin'])}
        for u in users
    ])


@bp.route('', methods=('POST',))
@admin_required
def create_user():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    is_admin = bool(data.get('is_admin'))

    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    db = get_db()
    try:
        cursor = db.execute(
            'INSERT INTO user (email, password, is_admin, created) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            (email, generate_password_hash(password), int(is_admin))
        )
        log_activity(db, 'user_created', f"Created user {email}" + (' (admin)' if is_admin else ''))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': f"A user with email '{email}' already exists."}), 400

    return jsonify({'id': cursor.lastrowid, 'email': email, 'is_admin': is_admin})


@bp.route('/<int:id>', methods=('PUT',))
@admin_required
def update_user(id):
    db = get_db()
    user = db.execute('SELECT * FROM user WHERE id = ?', (id,)).fetchone()
    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    data = request.get_json() or {}

    email = user['email']
    if 'email' in data:
        email = (data.get('email') or '').strip()
        if not email:
            return jsonify({'error': 'Email cannot be empty.'}), 400

    is_admin = bool(user['is_admin'])
    if 'is_admin' in data:
        if id == g.user['id'] and not data.get('is_admin'):
            return jsonify({'error': 'You cannot remove your own admin access.'}), 400
        is_admin = bool(data.get('is_admin'))

    changes = []
    if email != user['email']:
        changes.append(f"email changed from '{user['email']}' to '{email}'")
    if is_admin != bool(user['is_admin']):
        changes.append('granted admin access' if is_admin else 'revoked admin access')
    if data.get('password'):
        changes.append('password reset')
    change_summary = f"Updated user {user['email']}: " + '; '.join(changes) if changes else None

    if data.get('password'):
        password_hash = generate_password_hash(data['password'])
        try:
            db.execute(
                'UPDATE user SET email = ?, password = ?, is_admin = ? WHERE id = ?',
                (email, password_hash, int(is_admin), id)
            )
            if change_summary:
                log_activity(db, 'user_updated', change_summary)
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({'error': f"A user with email '{email}' already exists."}), 400
    else:
        try:
            db.execute(
                'UPDATE user SET email = ?, is_admin = ? WHERE id = ?',
                (email, int(is_admin), id)
            )
            if change_summary:
                log_activity(db, 'user_updated', change_summary)
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({'error': f"A user with email '{email}' already exists."}), 400

    return jsonify({'id': id, 'email': email, 'is_admin': is_admin})


@bp.route('/<int:id>/stats', methods=('GET',))
@login_required
def user_stats(id):
    if id != g.user['id'] and not g.user['is_admin']:
        return jsonify({'error': 'Access denied.'}), 403

    db = get_db()
    row = db.execute(
        '''
        SELECT
          COUNT(DISTINCT chats.id) AS total_conversations,
          COALESCE(SUM(messages.tokens_used), 0) AS total_tokens_used,
          COUNT(messages.tokens_used) AS tracked_messages
        FROM chats
        LEFT JOIN messages ON messages.chat_id = chats.id
        WHERE chats.user_id = ?
        ''',
        (id,)
    ).fetchone()

    total_tokens_used = row['total_tokens_used']
    tracked_messages = row['tracked_messages']
    average_tokens_per_message = round(total_tokens_used / tracked_messages, 1) if tracked_messages else 0

    return jsonify({
        'total_conversations': row['total_conversations'],
        'total_tokens_used': total_tokens_used,
        'average_tokens_per_message': average_tokens_per_message,
    })


@bp.route('/<int:id>', methods=('DELETE',))
@admin_required
def delete_user(id):
    if id == g.user['id']:
        return jsonify({'error': 'You cannot delete your own account.'}), 400

    db = get_db()
    user = db.execute('SELECT * FROM user WHERE id = ?', (id,)).fetchone()
    if user is None:
        return jsonify({'error': 'User not found.'}), 404

    chat_ids = [row['id'] for row in db.execute('SELECT id FROM chats WHERE user_id = ?', (id,)).fetchall()]
    if chat_ids:
        placeholders = ','.join('?' * len(chat_ids))
        db.execute(f'DELETE FROM messages WHERE chat_id IN ({placeholders})', chat_ids)
    db.execute('DELETE FROM chats WHERE user_id = ?', (id,))

    try:
        db.execute('DELETE FROM user WHERE id = ?', (id,))
    except sqlite3.IntegrityError:
        db.rollback()
        return jsonify({'error': 'Cannot delete user: they have uploaded documents. Remove those documents first.'}), 400

    log_activity(db, 'user_deleted', f"Deleted user {user['email']}")
    db.commit()

    return jsonify({'success': True})
