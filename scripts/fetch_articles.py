"""Fetch OECS articles from the PubPub API and write them to data/.

PubPub now sits behind Cloudflare, which blocks plain HTTP clients (the old bot
broke on this). curl_cffi with browser impersonation gets through. Auth uses the
OECS account (keccak-512 hashed password), same scheme as the crosslinker.

Outputs:
  data/articles/<slug>.json  full record (incl. plain_text, for summaries)
  data/index.json            lean list the poster reads

Run:  python scripts/fetch_articles.py [--limit N]
Env (.secrets):  OECS_ACCOUNT, OECS_PASSWORD
"""
import argparse
import json
import os
import re
from pathlib import Path

from Crypto.Hash import keccak
from curl_cffi import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
IMAGE_RE = re.compile(r"https://assets\.pubpub\.org/[^\"'\\ )]+\.(?:png|jpg|jpeg|gif|webp)", re.IGNORECASE)


def load_config():
    return json.loads((ROOT / "config.json").read_text())["pubpub"]


def login(session, base_url, email, password):
    h = keccak.new(digest_bits=512)
    h.update(password.encode("utf-8"))
    resp = session.post(
        f"{base_url}/login",
        json={"email": email, "password": h.hexdigest()},
        headers={"Accept": "application/json"},
        timeout=60,
    )
    resp.raise_for_status()


def get_json(session, url, params=None):
    resp = session.get(url, params=params, headers={"Accept": "application/json"}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def doc_to_text(node):
    """Flatten a ProseMirror doc into plain text."""
    out = []

    def walk(n):
        if isinstance(n, dict):
            if n.get("type") == "text":
                out.append(n.get("text", ""))
            for v in n.get("content", []) or []:
                walk(v)
        elif isinstance(n, list):
            for x in n:
                walk(x)

    walk(node)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def authors_from(pub):
    """Ordered list of author names (attributions flagged isAuthor)."""
    attrs = [a for a in (pub.get("attributions") or []) if a.get("isAuthor")]
    attrs.sort(key=lambda a: a.get("order") or 0)
    return [a["name"] for a in attrs if a.get("name")]


def main():
    parser = argparse.ArgumentParser(description="Fetch OECS PubPub articles.")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of pubs fetched (for testing).")
    args = parser.parse_args()

    load_dotenv(ROOT / ".secrets")
    email = os.getenv("OECS_ACCOUNT")
    password = os.getenv("OECS_PASSWORD")
    if not (email and password):
        raise SystemExit("Missing OECS_ACCOUNT / OECS_PASSWORD in .secrets")

    cfg = load_config()
    base = cfg["base_url"]
    session = requests.Session(impersonate="chrome")
    login(session, base, email, password)

    pubs = get_json(
        session,
        f"{base}/collectionPubs",
        params={
            "collectionId": cfg["collection_id"],
            "communityId": cfg["community_id"],
            "limit": cfg.get("limit", 1000),
            "offset": 0,
        },
    )
    if args.limit:
        pubs = pubs[: args.limit]
    print(f"Fetched {len(pubs)} pubs from collection")

    articles_dir = ROOT / "data" / "articles"
    articles_dir.mkdir(parents=True, exist_ok=True)

    index = []
    for i, pub in enumerate(pubs, 1):
        pub_id = pub.get("id")
        slug = pub.get("slug")
        if not (pub_id and slug):
            continue

        text_resp = session.get(f"{base}/pubs/{pub_id}/text", headers={"Accept": "application/json"}, timeout=60)
        plain_text = ""
        image_url = None
        if text_resp.ok:
            raw = text_resp.text
            m = IMAGE_RE.search(raw)
            image_url = m.group(0) if m else None
            try:
                plain_text = doc_to_text(text_resp.json())
            except Exception:
                plain_text = ""

        doi = pub.get("doi")
        link = f"https://doi.org/{doi}" if doi else f"https://oecs.mit.edu/pub/{slug}"
        authors = authors_from(pub)

        record = {
            "id": pub_id,
            "slug": slug,
            "title": pub.get("title"),
            "authors": authors,
            "doi": doi,
            "link": link,
            "description": (pub.get("description") or "").strip(),
            "image_url": image_url,
            "plain_text": plain_text,
        }
        (articles_dir / f"{slug}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
        index.append({k: record[k] for k in ("id", "slug", "title", "authors", "doi", "link", "description", "image_url")})
        print(f"  [{i}/{len(pubs)}] {record['title']} — {', '.join(authors) or 'no author'}{' [img]' if image_url else ''}")

    (ROOT / "data" / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False))
    print(f"\nWrote {len(index)} articles to data/index.json")


if __name__ == "__main__":
    main()
