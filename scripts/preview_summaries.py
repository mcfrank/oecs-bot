"""Preview hooks for the current prompt without saving — for prompt iteration.

Edit scripts/summary_prompt.txt, run this, eyeball, repeat. When happy, run
generate_summaries.py --force to regenerate all of data/summaries.json.

Run:
  python scripts/preview_summaries.py --sample 8
  python scripts/preview_summaries.py --slugs imt0sy0t,go1i5g7i   (specific articles)
"""
import argparse
import json
import os
import random
from pathlib import Path

from dotenv import load_dotenv
from google import genai

from generate_summaries import load_model, load_prompt, make_hook

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description="Preview hooks (no save).")
    parser.add_argument("--sample", type=int, default=8, help="Number of random articles.")
    parser.add_argument("--slugs", type=str, default=None, help="Comma-separated slugs to preview.")
    parser.add_argument("--seed", type=int, default=0, help="Random seed for sampling.")
    args = parser.parse_args()

    load_dotenv(ROOT / ".secrets")
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model, prompt = load_model(), load_prompt()
    summaries = json.loads((ROOT / "data" / "summaries.json").read_text())

    files = sorted((ROOT / "data" / "articles").glob("*.json"))
    arts = [json.loads(f.read_text()) for f in files]
    if args.slugs:
        wanted = set(args.slugs.split(","))
        arts = [a for a in arts if a["slug"] in wanted]
    else:
        random.seed(args.seed)
        arts = random.sample([a for a in arts if a.get("plain_text")], min(args.sample, len(arts)))

    for a in arts:
        new = make_hook(client, model, prompt, a["title"], a["plain_text"])
        print(f"### {a['title']}")
        print(f"  current: {summaries.get(a['id'], '(none)')}")
        print(f"  preview: {new}\n")


if __name__ == "__main__":
    main()
