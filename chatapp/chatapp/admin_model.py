from flask import Blueprint, jsonify

from chatapp.auth import admin_required
from chatapp.ollama_client import check_connection, MODEL_NAME, get_logs

bp = Blueprint('admin_model', __name__, url_prefix='/api/admin/model')


@bp.route('', methods=('GET',))
@admin_required
def model_status():
    connected, model = check_connection()
    return jsonify({'connected': connected, 'model': model or MODEL_NAME})


@bp.route('/logs', methods=('GET',))
@admin_required
def model_logs():
    return jsonify(get_logs())
