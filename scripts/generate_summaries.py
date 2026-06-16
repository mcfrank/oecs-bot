"""Generate one-sentence social hooks for OECS articles via Gemini.

Reads the full-text cache (data/articles/*.json), writes data/summaries.json
keyed by article id. Incremental by default: only summarizes articles not
already in summaries.json (re-run is cheap; use --force to redo all).

Run:  python scripts/generate_summaries.py [--force]
Env (.secrets):  GEMINI_API_KEY
"""
import argparse
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai

ROOT = Path(__file__).resolve().parents[1]
MAX_HOOK_CHARS = 150
TEXT_BUDGET = 4000  # chars of article body sent to the model

PROMPT = (
    "You write short, engaging social-media posts promoting Open Encyclopedia of "
    "Cognitive Science articles to a broad, curious, educated audience (not specialists). "
    "Given an article's title and text, write ONE vivid sentence (max 150 characters) that "
    "makes someone want to read it. Rules: no hashtags, no emoji, no first person, do not "
    "restate the title verbatim, avoid clichés like 'delves into' or 'this article explores'. "
    "Return only the sentence, nothing else.\n\n"
)


def load_model():
    return json.loads((ROOT / "config.json").read_text())["gemini"]["model"]


def make_hook(client, model, title, text):
    contents = f"{PROMPT}TITLE: {title}\n\nTEXT: {text[:TEXT_BUDGET]}"
    for attempt in range(1, 4):
        try:
            resp = client.models.generate_content(model=model, contents=contents)
            hook = (resp.text or "").strip().strip('"').replace("\n", " ").strip()
            if len(hook) > MAX_HOOK_CHARS:
                hook = hook[: MAX_HOOK_CHARS - 1].rstrip() + "…"
            return hook
        except Exception as exc:
            if attempt == 3:
                raise
            time.sleep(2 * attempt)


def main():
    parser = argparse.ArgumentParser(description="Generate Gemini hooks for OECS articles.")
    parser.add_argument("--force", action="store_true", help="Re-summarize all articles.")
    args = parser.parse_args()

    load_dotenv(ROOT / ".secrets")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Missing GEMINI_API_KEY in .secrets")

    model = load_model()
    client = genai.Client(api_key=api_key)

    articles_dir = ROOT / "data" / "articles"
    files = sorted(articles_dir.glob("*.json"))
    if not files:
        raise SystemExit("No data/articles/*.json — run scripts/fetch_articles.py first")

    summaries_path = ROOT / "data" / "summaries.json"
    summaries = json.loads(summaries_path.read_text()) if summaries_path.exists() else {}

    generated = 0
    for f in files:
        art = json.loads(f.read_text())
        aid, title, text = art["id"], art.get("title") or "", art.get("plain_text") or ""
        if not args.force and aid in summaries:
            continue
        if not text:
            print(f"  skip (no text): {title}")
            continue
        hook = make_hook(client, model, title, text)
        summaries[aid] = hook
        generated += 1
        print(f"  {title}: {hook}")

    summaries_path.write_text(json.dumps(summaries, indent=2, ensure_ascii=False))
    print(f"\nGenerated {generated} new summaries; {len(summaries)} total in data/summaries.json")


if __name__ == "__main__":
    main()
