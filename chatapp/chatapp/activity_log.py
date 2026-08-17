from flask import Blueprint, g, jsonify

from chatapp.auth import admin_required
from chatapp.db import get_db

bp = Blueprint('activity_log', __name__, url_prefix='/api/admin/logs')


def log_activity(db, action, details=None, actor_email=None):
    if actor_email is None:
        actor_email = g.user['email'] if g.user else 'system'
    db.execute(
        'INSERT INTO activity_log (actor_email, action, details) VALUES (?, ?, ?)',
        (actor_email, action, details)
    )


@bp.route('', methods=('GET',))
@admin_required
def list_activity():
    db = get_db()
    rows = db.execute(
        'SELECT actor_email, action, details, created FROM activity_log ORDER BY created DESC LIMIT 200'
    ).fetchall()
    return jsonify([
        {
            'actor_email': r['actor_email'],
            'action': r['action'],
            'details': r['details'],
            'timestamp': r['created'].isoformat() if r['created'] else None,
        }
        for r in rows
    ])
