# app/db/json_db.py

import json
import os
import tempfile
import shutil

try:
    import fcntl
    _HAS_FCNTL = True
except Exception:
    _HAS_FCNTL = False

from contextlib import contextmanager


# CLOUD_CUSTOMERS_FILE 환경변수를 우선 사용, 없으면 JSON_DB_FILE, 둘 다 없으면 기본값
def _get_default_db_path():
    return os.environ.get("CLOUD_CUSTOMERS_FILE") or os.environ.get("JSON_DB_FILE") or "/data/cache/cloud_customers.json"

DEFAULT_DB_PATH = _get_default_db_path()


@contextmanager
def file_lock(path):
    os.makedirs(os.path.dirname(path or "."), exist_ok=True)
    if _HAS_FCNTL:
        with open((path or "") + ".lock", "w") as lockf:
            fcntl.flock(lockf, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lockf, fcntl.LOCK_UN)
    else:
        # 락 미지원 환경(Windows 등)에서는 no-op (단일 인스턴스 가정)
        yield


def load_json_db(path: str = None) -> list:
    if path is None:
        path = _get_default_db_path()
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            data = []
    # {"customers": [], "next_id": 1} 형식 지원
    if isinstance(data, dict) and "customers" in data:
        return data["customers"]
    return data if isinstance(data, list) else []


def save_json_db(rows: list, path: str = None) -> None:
    if path is None:
        path = _get_default_db_path()
    tmpdir = os.path.dirname(path) or "."
    os.makedirs(tmpdir, exist_ok=True)
    tmpfd, tmppath = tempfile.mkstemp(dir=tmpdir, suffix=".tmp")
    try:
        with os.fdopen(tmpfd, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
        shutil.move(tmppath, path)  # atomic replace
    finally:
        if os.path.exists(tmppath):
            os.remove(tmppath)

