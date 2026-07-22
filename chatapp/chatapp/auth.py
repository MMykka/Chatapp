import functools

from flask import Blueprint, g, request, session, jsonify
from werkzeug.security import check_password_hash

from chatapp.db import get_db

bp = Blueprint('auth', __name__, url_prefix='/api')


@bp.route('/login', methods=('POST',))
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    db = get_db()
    error = None
    user = db.execute(
        'SELECT * FROM user WHERE email = ?', (email,)
    ).fetchone()

    if user is None:
        error = 'Incorrect email or password.'
    elif not check_password_hash(user['password'], password):
        error = 'Incorrect email or password.'

    if error is None:
        session.clear()
        session['user_id'] = user['id']
        return jsonify({'is_admin': bool(user['is_admin'])})

    return jsonify({'error': error}), 401


@bp.route('/logout', methods=('POST',))
def logout():
    session.clear()
    return jsonify({'success': True})


@bp.before_app_request
def load_logged_in_user():
    user_id = session.get('user_id')
    if user_id is None:
        g.user = None
    else:
        g.user = get_db().execute(
            'SELECT * FROM user WHERE id = ?', (user_id,)
        ).fetchone()


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return jsonify({'error': 'Login required.'}), 401
        return view(**kwargs)
    return wrapped_view

def admin_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return jsonify({'error': 'Login required.'}), 401
        if not g.user['is_admin']:
            return jsonify({'error': 'Admin access required.'}), 403
        return view(**kwargs)
    return wrapped_view