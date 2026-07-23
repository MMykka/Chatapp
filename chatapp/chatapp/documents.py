import os
from flask import Blueprint, request, jsonify, g
from chatapp.db import get_db
from chatapp.auth import admin_required
from chatapp.rag import add_document, delete_document

bp = Blueprint('documents', __name__, url_prefix='/api/documents')

UPLOAD_FOLDER = 'instance/uploads'
ALLOWED_EXTENSIONS = ('.txt', '.md', '.pdf')


@bp.route('', methods=('POST',))
@admin_required
def upload():
    file = request.files['file']

    if not file.filename.endswith(ALLOWED_EXTENSIONS):
        return jsonify({'error': 'Unsupported file type.'}), 400

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)

    db = get_db()
    db.execute(
        'INSERT INTO documents (filename, uploaded_by) VALUES (?, ?)',
        (file.filename, g.user['id'])
    )
    db.commit()

    add_document(filepath, file.filename)

    return jsonify({'filename': file.filename})


@bp.route('', methods=('GET',))
def list_documents():
    db = get_db()
    docs = db.execute('SELECT id, filename FROM documents').fetchall()
    return jsonify([{'id': d['id'], 'filename': d['filename']} for d in docs])


@bp.route('/<int:id>', methods=('DELETE',))
@admin_required
def delete(id):
    db = get_db()
    doc = db.execute('SELECT * FROM documents WHERE id = ?', (id,)).fetchone()

    if doc is None:
        return jsonify({'error': 'Document not found.'}), 404

    db.execute('DELETE FROM documents WHERE id = ?', (id,))
    db.commit()

    os.remove(os.path.join(UPLOAD_FOLDER, doc['filename']))
    delete_document(doc['filename'])

    return jsonify({'success': True})