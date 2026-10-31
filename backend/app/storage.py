"""Store level documents in SQLite with a short connection per operation."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


class LevelStore:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute('CREATE TABLE IF NOT EXISTS levels (id TEXT PRIMARY KEY, level TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')

    @staticmethod
    def decode(row):
        if row is None:
            return None
        return {**dict(row), 'level': json.loads(row['level'])}

    def save(self, level, level_id=None):
        now = datetime.now(timezone.utc).isoformat()
        with self.connection() as db:
            if level_id is None:
                level_id = str(uuid4())
                db.execute('INSERT INTO levels VALUES (?, ?, ?, ?)', (level_id, json.dumps(level, allow_nan=False), now, now))
            else:
                cursor = db.execute('UPDATE levels SET level=?, updated_at=? WHERE id=?', (json.dumps(level, allow_nan=False), now, level_id))
                if not cursor.rowcount:
                    return None
            return self.decode(db.execute('SELECT * FROM levels WHERE id=?', (level_id,)).fetchone())

    def get(self, level_id):
        with self.connection() as db:
            return self.decode(db.execute('SELECT * FROM levels WHERE id=?', (level_id,)).fetchone())

    def list(self, offset=0):
        with self.connection() as db:
            return [self.decode(row) for row in db.execute('SELECT * FROM levels ORDER BY created_at, id LIMIT 100 OFFSET ?', (offset,))]
