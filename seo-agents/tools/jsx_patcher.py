"""Apply approved SEO meta changes to JSX page files."""
from __future__ import annotations

import re
from pathlib import Path

import config


def _page_path_from_file(file_path: str) -> Path:
    p = Path(file_path)
    if not p.is_absolute():
        p = config.REPO_ROOT / file_path
    return p


def patch_use_seo_meta_field(file_path: str, field: str, new_value: str) -> bool:
    """
    Replace a useSeoMeta field value in a JSX file.
    Supports: title, description, keywords, canonical
    """
    path = _page_path_from_file(file_path)
    if not path.exists():
        raise FileNotFoundError(str(path))

    source = path.read_text(encoding="utf-8")
    escaped = new_value.replace("\\", "\\\\").replace('"', '\\"')

    patterns = [
        (rf'({field}\s*:\s*")([^"]*)(")', rf'\1{escaped}\3'),
        (rf"({field}\s*:\s*')([^']*)(')", rf"\1{escaped}\3"),
    ]

    updated = source
    replaced = False
    for pattern, repl in patterns:
        new_source, n = re.subn(pattern, repl, updated, count=1)
        if n:
            updated = new_source
            replaced = True
            break

    if not replaced and field == "description":
        multiline = re.search(
            rf"{field}\s*:\s*\n\s*\"([^\"]*)\"",
            source,
        )
        if multiline:
            updated = source.replace(multiline.group(0), f'{field}:\n      "{escaped}"', 1)
            replaced = True

    if not replaced:
        raise ValueError(f"Could not find useSeoMeta field '{field}' in {path}")

    path.write_text(updated, encoding="utf-8")
    return True
