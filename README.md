# oecs-bot

Posts articles from the [Open Encyclopedia of Cognitive Science](https://oecs.mit.edu)
to [Bluesky](https://bsky.app/profile/oecs-bot.bsky.social) and
[Twitter/X](https://x.com/oecs_bot), daily, with a one-sentence hook and the
article's figure.

## How it works

Three decoupled steps. The daily post reads only committed data, so it never
touches PubPub at post time (PubPub now sits behind Cloudflare, which is what
broke the original bot).

1. **Fetch** — `scripts/fetch_articles.py` logs into PubPub (via `curl_cffi`,
   which gets past Cloudflare) and writes `data/index.json` (title, authors, DOI,
   first-paragraph abstract, figure URL) + a full-text cache in `data/articles/`
   (gitignored).
2. **Summarize** — `scripts/generate_summaries.py` asks Gemini for a one-sentence
   hook per article → `data/summaries.json` (incremental; only new articles). The
   prompt lives in `scripts/summary_prompt.txt`.
3. **Post** — `post.js` picks an unposted article and posts:
   - **Bluesky**: hook + title/author + link + hashtag, single post.
   - **Twitter/X**: same, but link-free (X down-ranks links) with the link in a
     reply.
   - **Image**: the article's figure, or — for the ~78% without one — a branded
     typographic card (`card.js`, title + author + abstract excerpt).
   Records the post in `data/posted.json`.

`repost.js` re-shares the latest post ~6h later; `personal_reshare.js` reshares
it weekly from your personal accounts (if configured).

## Iterating on post text

Edit `scripts/summary_prompt.txt`, then preview without saving:

```sh
python scripts/preview_summaries.py --sample 8         # random articles
python scripts/preview_summaries.py --slugs <slug>,<slug>
```

When happy: `python scripts/generate_summaries.py --force` regenerates all.

## Automation (GitHub Actions)

- **`post.yml`** — daily, 13:00 UTC (9am EDT) on weekdays. Commits `posted.json`.
- **`repost.yml`** — 19:00 UTC weekdays; reposts the day's post. Disable in the
  Actions tab to turn off.
- **`personal_reshare.yml`** — weekly (Fri 14:00 UTC); reshares the latest post
  from your personal accounts. Needs the `PERSONAL_*` secrets; skips if unset.
- **`refresh.yml`** — manual (`workflow_dispatch`). Re-fetch + re-summarize when
  OECS publishes new articles. Commits updated data.

Secrets (repo settings): `BLUESKY_USERNAME`, `BLUESKY_PASSWORD`, `TWITTER_API_KEY`,
`TWITTER_API_KEY_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`,
`OECS_ACCOUNT`, `OECS_PASSWORD`, `GEMINI_API_KEY`. Optional for personal reshare:
`PERSONAL_BLUESKY_USERNAME`, `PERSONAL_BLUESKY_PASSWORD`, `PERSONAL_TWITTER_API_KEY`,
`PERSONAL_TWITTER_API_KEY_SECRET`, `PERSONAL_TWITTER_ACCESS_TOKEN`,
`PERSONAL_TWITTER_ACCESS_TOKEN_SECRET`.

## Author mentions

`data/author_handles.json` maps author names to social handles. The bot
@-mentions an author **only** when an entry has `"verified": true` and a handle
for that platform. `scripts/seed_author_handles.py` pre-fills Bluesky *candidates*
(unverified) to make manual review easier.

## Local use

```sh
python -m venv .venv && .venv/bin/pip install -r requirements.txt
# credentials in .env (Bluesky/Twitter) and .secrets (OECS/Gemini) — both gitignored

.venv/bin/python scripts/fetch_articles.py        # refresh article data
.venv/bin/python scripts/generate_summaries.py     # refresh summaries
node post.js --dry-run                             # preview a post
node post.js --article=<slug>                      # post a specific article
```
