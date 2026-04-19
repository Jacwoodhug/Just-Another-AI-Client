import json
import math
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return dot / (mag_a * mag_b)


class MemoryStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    embedding TEXT,
                    created_at REAL NOT NULL
                );
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memory_session ON memory(session_id);"
            )

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        embedding: Optional[List[float]] = None,
    ) -> None:
        embedding_json = json.dumps(embedding) if embedding else None
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO memory (session_id, role, content, embedding, created_at)
                VALUES (?, ?, ?, ?, ?);
                """,
                (session_id, role, content, embedding_json, time.time()),
            )

    def get_recent(self, session_id: str, limit: int = 8) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT role, content, created_at FROM memory
                WHERE session_id = ? AND role IN ('user', 'assistant')
                ORDER BY id DESC
                LIMIT ?;
                """,
                (session_id, limit),
            ).fetchall()
        rows.reverse()
        return [
            {"role": role, "content": content, "created_at": created_at}
            for role, content, created_at in rows
        ]

    def search(self, query_embedding: List[float], top_k: int = 4) -> List[Dict[str, Any]]:
        if not query_embedding:
            return []
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT session_id, role, content, embedding, created_at
                FROM memory
                WHERE embedding IS NOT NULL;
                """
            ).fetchall()

        scored: List[Tuple[float, Dict[str, str]]] = []
        for session_id, role, content, embedding_json, created_at in rows:
            try:
                embedding = json.loads(embedding_json)
            except json.JSONDecodeError:
                continue
            score = _cosine_similarity(query_embedding, embedding)
            if score <= 0.0:
                continue
            scored.append(
                (
                    score,
                    {
                        "session_id": session_id,
                        "role": role,
                        "content": content,
                        "created_at": created_at,
                    },
                )
            )

        scored.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in scored[:top_k]]

    def delete_last_n_messages(self, session_id: str, n: int = 2) -> int:
        """Delete the last *n* messages for the given session. Returns the count deleted."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT id FROM memory
                WHERE session_id = ? AND role IN ('user', 'assistant')
                ORDER BY id DESC
                LIMIT ?;
                """,
                (session_id, n),
            ).fetchall()
            if not rows:
                return 0
            ids = [row[0] for row in rows]
            placeholders = ",".join("?" * len(ids))
            conn.execute(f"DELETE FROM memory WHERE id IN ({placeholders});", ids)
            return len(ids)
