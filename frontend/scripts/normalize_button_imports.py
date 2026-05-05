#!/usr/bin/env python3
"""
Rewrite JSX imports to use the single barrel: src/components/ui/buttons.jsx

Run from repo root:
  python3 user/frontend/scripts/normalize_button_imports.py

Skips: ui/AppButton.jsx, ui/AsyncButton.jsx, ui/InlineButtonProgress.jsx, ui/buttons.jsx
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
SKIP_FILES = {
    ROOT / "components" / "ui" / "AppButton.jsx",
    ROOT / "components" / "ui" / "AsyncButton.jsx",
    ROOT / "components" / "ui" / "InlineButtonProgress.jsx",
    ROOT / "components" / "ui" / "buttons.jsx",
}

IMPORT_RE = re.compile(
    r'^import\s+(?P<name>AppButton|AsyncButton|InlineButtonProgress)\s+from\s+["\'](?P<path>[^"\']+)["\']\s*;\s*\n',
    re.MULTILINE,
)


def barrel_path(file: Path) -> str:
    rel = file.relative_to(ROOT)
    parts = rel.parts
    if parts[0] == "pages":
        return "../components/ui/buttons.jsx"
    if parts[0] == "components":
        if len(parts) == 2:
            return "./ui/buttons.jsx"
        # components/ui/*.jsx — barrel lives alongside AppButton
        if len(parts) == 3 and parts[1] == "ui":
            return "./buttons.jsx"
        depth = len(parts) - 2
        return ("../" * depth) + "ui/buttons.jsx"
    return "../components/ui/buttons.jsx"


def process_file(path: Path) -> bool:
    if path in SKIP_FILES:
        return False
    text = path.read_text(encoding="utf-8")
    found = list(IMPORT_RE.finditer(text))
    if not found:
        return False
    names: set[str] = set()
    for m in found:
        p = m.group("path")
        if "AppButton.jsx" not in p and "AsyncButton.jsx" not in p and "InlineButtonProgress.jsx" not in p:
            continue
        names.add(m.group("name"))
    if not names:
        return False
    new_text = IMPORT_RE.sub("", text)
    # Remove accidental double blank lines at top
    barrel = barrel_path(path)
    ordered = sorted(names)
    line = f'import {{ {", ".join(ordered)} }} from "{barrel}";\n'
    # Insert after last leading comment block or at start
    insert_at = 0
    lines = new_text.splitlines(keepends=True)
    i = 0
    while i < len(lines) and (lines[i].strip() == "" or lines[i].startswith("//")):
        i += 1
    # Keep "use client" or imports together: insert before first import
    j = 0
    while j < len(lines):
        s = lines[j].strip()
        if s.startswith("import ") or s.startswith("export "):
            insert_at = j
            break
        j += 1
    else:
        insert_at = 0
    lines.insert(insert_at, line)
    path.write_text("".join(lines), encoding="utf-8")
    return True


def main() -> None:
    changed = 0
    for p in sorted(ROOT.rglob("*.jsx")):
        if process_file(p):
            print("updated:", p.relative_to(ROOT))
            changed += 1
    print(f"Done. {changed} files updated.")


if __name__ == "__main__":
    main()
