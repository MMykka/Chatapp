import requests, json, time
from collections import deque
from datetime import datetime, timezone

OLLAMA_HOST = "http://localhost:11434"
MODEL_NAME = "llama3.2"

LOG_BUFFER = deque(maxlen=50)


def _log(kind, status, duration=None, model=None, error=None):
    LOG_BUFFER.appendleft({
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'kind': kind,
        'status': status,
        'duration_ms': round(duration * 1000) if duration is not None else None,
        'model': model,
        'error': error,
    })


def get_logs():
    return list(LOG_BUFFER)


def check_connection():
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=2)
        response.json()
        return True, MODEL_NAME
    except requests.exceptions.RequestException:
        return False, None


def chat_completion(messages, context_chunks=None):
    start = time.monotonic()
    try:
        if context_chunks:
            context_text = "\n".join(context_chunks)
            system_message = {"role": "system", "content": f"Use the following context to answer the question:\n{context_text}"}
            messages = [system_message] + messages

        payload = {"model": MODEL_NAME, "messages": messages, "stream": False}
        response = requests.post(f"{OLLAMA_HOST}/api/chat", json=payload, timeout=10)
        print("STATUS:", response.status_code)
        print("BODY:", response.text)
        data = response.json()
        tokens_used = data.get("prompt_eval_count", 0) + data.get("eval_count", 0)
        _log("chat", "ok", duration=time.monotonic() - start, model=data.get("model", MODEL_NAME))
        return {
            "content": data["message"]["content"],
            "model": data.get("model", MODEL_NAME),
            "tokens_used": tokens_used,
        }
    except requests.exceptions.RequestException as e:
        print("EXCEPTION:", e)
        _log("chat", "error", duration=time.monotonic() - start, model=MODEL_NAME, error=str(e))
        return {
            "content": "Sorry, I couldn't reach the model right now.",
            "model": MODEL_NAME,
            "tokens_used": None,
        }

def get_embedding(text):
    start = time.monotonic()
    try:
        payload = {"model": "nomic-embed-text", "prompt": text}
        response = requests.post(f"{OLLAMA_HOST}/api/embeddings", json=payload, timeout=30)
        print("STATUS:", response.status_code)
        print("BODY:", response.text[:200])
        _log("embedding", "ok", duration=time.monotonic() - start, model="nomic-embed-text")
        return response.json()["embedding"]
    except requests.exceptions.RequestException as e:
        print("EXCEPTION:", e)
        _log("embedding", "error", duration=time.monotonic() - start, model="nomic-embed-text", error=str(e))
        return None


def chat_completion_stream(messages, context_chunks=None, usage=None):
    if context_chunks:
        context_text = "\n".join(context_chunks)
        system_message = {"role": "system", "content": f"Use the following context to answer the question:\n{context_text}"}
        messages = [system_message] + messages

    payload = {"model": MODEL_NAME, "messages": messages, "stream": True}
    start = time.monotonic()

    try:
        response = requests.post(f"{OLLAMA_HOST}/api/chat", json=payload, stream=True, timeout=30)
        for line in response.iter_lines():
            if line:
                chunk = json.loads(line)
                piece = chunk.get("message", {}).get("content", "")
                if piece:
                    yield piece
                if chunk.get("done"):
                    if usage is not None:
                        usage["model"] = chunk.get("model", MODEL_NAME)
                        usage["tokens_used"] = chunk.get("prompt_eval_count", 0) + chunk.get("eval_count", 0)
                    _log("chat_stream", "ok", duration=time.monotonic() - start, model=chunk.get("model", MODEL_NAME))
                    break
    except requests.exceptions.RequestException as e:
        if usage is not None:
            usage["model"] = MODEL_NAME
            usage["tokens_used"] = None
        _log("chat_stream", "error", duration=time.monotonic() - start, model=MODEL_NAME, error=str(e))
        yield "Sorry, I couldn't reach the model right now."