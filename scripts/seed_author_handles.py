"""Seed data/author_handles.json with candidate Bluesky handles for each author.

Searches Bluesky for every author name and records the top matches as *candidates*
for a human to verify. The bot only @-mentions an author once someone fills in the
verified handle and sets "verified": true. Twitter has no open search API, so those
are left blank for manual entry.

Merges into any existing file (never overwrites verified entries).

Run:  python scripts/seed_author_handles.py
"""
import json
import time
from pathlib import Path

from curl_cffi import requests

ROOT = Path(__file__).resolve().parents[1]
SEARCH = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors"


def unique_authors(index):
    seen = []
    for art in index:
        for name in art.get("authors") or []:
            if name not in seen:
                seen.append(name)
    return seen


def candidates_for(session, name):
    try:
        r = session.get(SEARCH, params={"q": name, "limit": 3}, timeout=30)
        actors = r.json().get("actors", []) if r.ok else []
    except Exception:
        actors = []
    return [
        {"handle": a["handle"], "displayName": a.get("displayName", ""), "description": (a.get("description") or "")[:120]}
        for a in actors
    ]


def main():
    index = json.loads((ROOT / "data" / "index.json").read_text())
    path = ROOT / "data" / "author_handles.json"
    handles = json.loads(path.read_text()) if path.exists() else {}

    session = requests.Session(impersonate="chrome")
    added = 0
    for name in unique_authors(index):
        entry = handles.get(name)
        if entry and entry.get("verified"):
            continue  # never disturb verified entries
        cands = candidates_for(session, name)
        handles[name] = {
            "bsky": (entry or {}).get("bsky"),
            "twitter": (entry or {}).get("twitter"),
            "verified": False,
            "bsky_candidates": cands,
        }
        added += 1
        time.sleep(0.1)

    path.write_text(json.dumps(handles, indent=2, ensure_ascii=False))
    print(f"Wrote {len(handles)} authors ({added} updated) to data/author_handles.json")


if __name__ == "__main__":
    main()
