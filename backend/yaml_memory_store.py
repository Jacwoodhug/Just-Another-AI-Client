import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import yaml


class YamlMemoryStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._entries: List[Dict[str, str]] = []
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            self._entries = []
            return
        raw = self.path.read_text(encoding="utf-8")
        if not raw.strip():
            self._entries = []
            return
        data = yaml.safe_load(raw)
        if isinstance(data, list):
            self._entries = [e for e in data if isinstance(e, dict)]
        else:
            self._entries = []

    def _save(self) -> None:
        self.path.write_text(
            yaml.dump(self._entries, default_flow_style=False, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

    def store(self, content: str) -> str:
        entry_id = uuid.uuid4().hex[:8]
        entry = {
            "id": entry_id,
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "content": content,
        }
        self._entries.append(entry)
        self._save()
        return entry_id

    def edit(self, entry_id: str, new_content: str) -> bool:
        for entry in self._entries:
            if entry.get("id") == entry_id:
                entry["content"] = new_content
                self._save()
                return True
        return False

    def delete(self, entry_id: str) -> bool:
        before = len(self._entries)
        self._entries = [e for e in self._entries if e.get("id") != entry_id]
        if len(self._entries) < before:
            self._save()
            return True
        return False

    def get_all(self) -> List[Dict[str, str]]:
        return list(self._entries)

    def format_for_context(self) -> str:
        if not self._entries:
            return ""
        lines = ["Your stored memories about this user:"]
        for entry in self._entries:
            eid = entry.get("id", "?")
            content = entry.get("content", "")
            lines.append(f"- [{eid}] {content}")
        return "\n".join(lines)
