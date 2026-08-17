import os
from flask import Flask, render_template, g, redirect, jsonify


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY="dev",
        DATABASE=os.path.join(app.instance_path, "chatapp.sqlite"),
    )

    if test_config is None:
        app.config.from_pyfile("config.py" , silent=True)
    else:
        app.config.from_mapping(test_config)
        
    os.makedirs(app.instance_path, exist_ok=True)

    @app.route('/')
    def index():
        return redirect('/login')

    @app.route('/login')
    def login_page():
        return render_template('login.html')

    @app.route('/chat')
    def chat_page():
        if g.user is None:
            return redirect('/login')
        return render_template('chat.html', is_admin=bool(g.user['is_admin']), user_email=g.user['email'])

    @app.route('/dashboard')
    def dashboard_page():
        if g.user is None:
            return redirect('/login')
        if not g.user['is_admin']:
            return redirect('/chat')
        return render_template('dashboard.html', user_email=g.user['email'])

    @app.route('/dashboard/documents')
    def dashboard_documents_page():
        if g.user is None:
            return redirect('/login')
        if not g.user['is_admin']:
            return redirect('/chat')
        return render_template('dashboard_documents.html', user_email=g.user['email'])

    @app.route('/dashboard/model')
    def dashboard_model_page():
        if g.user is None:
            return redirect('/login')
        if not g.user['is_admin']:
            return redirect('/chat')
        return render_template('dashboard_model.html', user_email=g.user['email'])

    @app.route('/dashboard/logs')
    def dashboard_logs_page():
        if g.user is None:
            return redirect('/login')
        if not g.user['is_admin']:
            return redirect('/chat')
        return render_template('dashboard_logs.html', user_email=g.user['email'])

    @app.route('/settings')
    def settings_page():
        if g.user is None:
            return redirect('/login')
        return render_template('settings.html', user_email=g.user['email'], user_id=g.user['id'])

    @app.route('/api/status')
    def ollama_status():
        from .ollama_client import check_connection
        connected, model = check_connection()
        return jsonify(connected=connected, model=model)

    from . import db
    db.init_app(app)

    from . import auth
    app.register_blueprint(auth.bp)

    from . import chats
    app.register_blueprint(chats.bp)

    from . import documents
    app.register_blueprint(documents.bp)

    from . import users
    app.register_blueprint(users.bp)

    from . import admin_model
    app.register_blueprint(admin_model.bp)

    from . import activity_log
    app.register_blueprint(activity_log.bp)

    return app