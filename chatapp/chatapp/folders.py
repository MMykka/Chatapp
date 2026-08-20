from flask import Blueprint, g, jsonify, abort, request
from chatapp.auth import login_required
from chatapp.db import get_db
from chatapp.activity_log import log_activity
from chatapp import cache


bp = Blueprint('folders', __name__, url_prefix='/api/folders')


@bp.route('', methods=('GET',))
@login_required
def list_folders():
    db = get_db()
    folders = db.execute(
        'SELECT id, name FROM folders WHERE user_id = ? ORDER BY name COLLATE NOCASE',
        (g.user['id'],)
    ).fetchall()
    return jsonify([{'id': f['id'], 'name': f['name']} for f in folders])


@bp.route('', methods=('POST',))
@login_required
def create_folder():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Folder name cannot be empty.'}), 400

    db = get_db()
    cursor = db.execute(
        'INSERT INTO folders (user_id, name) VALUES (?, ?)',
        (g.user['id'], name)
    )
    log_activity(db, 'folder_created', f"Created folder '{name}'")
    db.commit()
    return jsonify({'id': cursor.lastrowid, 'name': name})


def get_folder(id):
    db = get_db()
    folder = db.execute('SELECT * FROM folders WHERE id = ?', (id,)).fetchone()

    if folder is None:
        abort(404, f"Folder id {id} doesn't exist.")

    if folder['user_id'] != g.user['id']:
        abort(403)

    return folder


@bp.route('/<int:id>', methods=('PUT',))
@login_required
def rename_folder(id):
    folder = get_folder(id)

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Folder name cannot be empty.'}), 400

    db = get_db()
    db.execute('UPDATE folders SET name = ? WHERE id = ?', (name, id))
    log_activity(db, 'folder_renamed', f"Renamed folder #{id} from '{folder['name']}' to '{name}'")
    db.commit()
    return jsonify({'id': id, 'name': name})


@bp.route('/<int:id>', methods=('DELETE',))
@login_required
def delete_folder(id):
    folder = get_folder(id)
    db = get_db()

    affected_chat_ids = [
        row['id'] for row in db.execute('SELECT id FROM chats WHERE folder_id = ?', (id,)).fetchall()
    ]

    db.execute('UPDATE chats SET folder_id = NULL WHERE folder_id = ?', (id,))
    db.execute('DELETE FROM folders WHERE id = ?', (id,))
    log_activity(db, 'folder_deleted', f"Deleted folder #{id} ('{folder['name']}')")
    db.commit()

    for chat_id in affected_chat_ids:
        cache.invalidate(f'chat_detail:{chat_id}')

    return jsonify({'success': True})
