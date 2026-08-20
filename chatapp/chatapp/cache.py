import time

TTL_SECONDS = 30
MAX_ENTRIES = 200

_store = {}


def get(key):
    entry = _store.get(key)
    if entry is None:
        return None

    value, expires_at = entry
    if time.monotonic() > expires_at:
        _store.pop(key, None)
        return None

    return value


def set(key, value, ttl=TTL_SECONDS):
    if key not in _store and len(_store) >= MAX_ENTRIES:
        _store.pop(next(iter(_store)), None)
    _store[key] = (value, time.monotonic() + ttl)


def invalidate(key):
    _store.pop(key, None)
