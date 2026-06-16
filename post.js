// OECS bot poster. Reads committed data/ (no live PubPub/Cloudflare dependency),
// picks an unposted article, posts to Bluesky + Twitter, and records the post.
//
//   node post.js                 post a random unposted article
//   node post.js --dry-run        compose and print, post nothing
//   node post.js --article=<slug> post a specific article (manual / testing)
//
// Env (.env): BLUESKY_USERNAME, BLUESKY_PASSWORD,
//             TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET

const fs = require('fs');
const path = require('path');
const { BskyAgent, RichText } = require('@atproto/api');
const { TwitterApi } = require('twitter-api-v2');
const { makeCard } = require('./card');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const ARTICLE_SLUG = (process.argv.find((a) => a.startsWith('--article=')) || '').split('=')[1];
const DATA = path.join(__dirname, 'data');

const readJson = (p, fallback) =>
  fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;

const BSKY_LIMIT = 300; // Bluesky's cap; Twitter (280, URLs counted as 23) fits whenever this does.
const HASHTAG = '#CognitiveScience';

// Byline for one platform: an author becomes "@handle" only if a verified handle
// exists for that platform, otherwise their plain name. Falls back to "A"/"A and
// B"/"A et al." Bluesky and Twitter handles differ, hence the per-platform render.
function bylineFor(authors, handles, platform) {
  if (!authors || authors.length === 0) return null;
  const render = (name) => {
    const h = handles[name];
    return h && h.verified && h[platform] ? `@${h[platform]}` : name;
  };
  if (authors.length === 1) return render(authors[0]);
  if (authors.length === 2) return `${render(authors[0])} and ${render(authors[1])}`;
  return `${render(authors[0])} et al.`;
}

// includeLink=false omits the article link (used for the X main tweet, since X
// suppresses posts with links — the link goes in a reply instead).
function composeText(article, hook, byline, { includeLink = true } = {}) {
  const head = `${article.title}${byline ? ` by ${byline}` : ''}`;
  const linkLine = includeLink ? `\n${article.link}` : '';
  if (!hook) return includeLink ? `${head}: ${article.link}\n\n${HASHTAG}` : `${head}\n\n${HASHTAG}`;

  const tail = `\n\n${head}${linkLine}\n\n${HASHTAG}`;
  let text = hook + tail;
  if (text.length > BSKY_LIMIT) {
    const overage = text.length - BSKY_LIMIT;
    const trimmed = hook.slice(0, Math.max(0, hook.length - overage - 1)).trimEnd() + '…';
    text = trimmed + tail;
  }
  return text;
}

// Pick a random article not yet posted this cycle; reset the cycle when exhausted.
function pickArticle(index, posted) {
  let available = index.filter((a) => !posted.posted.includes(a.id));
  if (available.length === 0) {
    posted.posted = [];
    available = index;
  }
  return available[Math.floor(Math.random() * available.length)];
}

const BSKY_BLOB_LIMIT = 1000000; // Bluesky rejects blobs >~1MB.

// Returns { buffer, mime } or null. Best-effort: any failure -> post without image.
async function downloadImage(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const mime = resp.headers.get('content-type') || 'image/png';
    return { buffer, mime };
  } catch {
    return null;
  }
}

async function postBluesky(text, image, alt) {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({
    identifier: process.env.BLUESKY_USERNAME,
    password: process.env.BLUESKY_PASSWORD,
  });
  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  let embed;
  if (image && image.buffer.length <= BSKY_BLOB_LIMIT) {
    try {
      const up = await agent.uploadBlob(image.buffer, { encoding: image.mime });
      embed = { $type: 'app.bsky.embed.images', images: [{ image: up.data.blob, alt }] };
    } catch (e) {
      console.error('Bluesky image upload failed, posting text-only:', e.message);
    }
  }
  const res = await agent.post({ text: rt.text, facets: rt.facets, ...(embed && { embed }) });
  return { uri: res.uri, cid: res.cid }; // cid is needed to repost later
}

async function postTwitter(text, image, alt, replyText) {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_KEY_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
  let mediaIds;
  if (image) {
    try {
      const id = await client.v1.uploadMedia(image.buffer, { mimeType: image.mime });
      await client.v1.createMediaMetadata(id, { alt_text: { text: alt } });
      mediaIds = [id];
    } catch (e) {
      console.error('Twitter image upload failed, posting text-only:', e.message);
    }
  }
  const main = await client.v2.tweet(text, mediaIds ? { media: { media_ids: mediaIds } } : undefined);
  // Link goes in a reply: X down-ranks posts that contain links.
  if (replyText) {
    try {
      await client.v2.tweet(replyText, { reply: { in_reply_to_tweet_id: main.data.id } });
    } catch (e) {
      console.error('Twitter link-reply failed:', e.message);
    }
  }
  return main.data.id;
}

async function main() {
  const index = readJson(path.join(DATA, 'index.json'), null);
  if (!index || index.length === 0) {
    throw new Error('data/index.json missing or empty — run scripts/fetch_articles.py first');
  }
  const postedPath = path.join(DATA, 'posted.json');
  const posted = readJson(postedPath, { posted: [], history: [] });
  const summaries = readJson(path.join(DATA, 'summaries.json'), {});
  const handles = readJson(path.join(DATA, 'author_handles.json'), {});

  const article = ARTICLE_SLUG
    ? index.find((a) => a.slug === ARTICLE_SLUG)
    : pickArticle(index, posted);
  if (!article) throw new Error(`No article with slug "${ARTICLE_SLUG}"`);
  const hook = summaries[article.id];
  const bskyText = composeText(article, hook, bylineFor(article.authors, handles, 'bsky'));
  const twitterText = composeText(article, hook, bylineFor(article.authors, handles, 'twitter'), { includeLink: false });
  const twitterReply = `Read the full article: ${article.link}`;
  const plainByline = bylineFor(article.authors, {}, 'bsky'); // names, no @-handles

  console.log(`Article: ${article.title} (${article.id})`);
  console.log(`Bluesky (${bskyText.length} chars):\n${bskyText}\n`);
  console.log(`Twitter (${twitterText.length} chars):\n${twitterText}\n  ↳ reply: ${twitterReply}\n`);
  console.log(`Image: ${article.image_url ? 'article figure' : 'generated card'}`);

  if (DRY_RUN) {
    console.log('[dry-run] nothing posted.');
    return;
  }

  // Article figure if it has one; otherwise a branded typographic card.
  let image, alt;
  if (article.image_url) {
    image = await downloadImage(article.image_url);
    alt = `Figure from the OECS article "${article.title}".`;
  }
  if (!image) {
    try {
      image = { buffer: makeCard({ title: article.title, byline: plainByline, abstract: article.abstract }), mime: 'image/png' };
      alt = `Open Encyclopedia of Cognitive Science: "${article.title}"${plainByline ? ` by ${plainByline}` : ''}. ${(article.abstract || '').slice(0, 200)}`;
    } catch (e) {
      console.error('Card generation failed, posting text-only:', e.message);
    }
  }

  const record = { id: article.id, slug: article.slug, title: article.title, date: new Date().toISOString() };

  try {
    const res = await postBluesky(bskyText, image, alt);
    record.bluesky_uri = res.uri;
    record.bluesky_cid = res.cid;
    console.log(`Posted to Bluesky: ${record.bluesky_uri}`);
  } catch (e) {
    console.error('Bluesky post failed:', e.message);
  }

  try {
    record.tweet_id = await postTwitter(twitterText, image, alt, twitterReply);
    console.log(`Posted to Twitter: ${record.tweet_id}`);
  } catch (e) {
    console.error('Twitter post failed:', e.message);
  }

  if (!record.bluesky_uri && !record.tweet_id) {
    throw new Error('Both platforms failed — not recording as posted.');
  }

  posted.posted.push(article.id);
  posted.history.push(record);
  fs.writeFileSync(postedPath, JSON.stringify(posted, null, 2));
  console.log('Recorded in data/posted.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
