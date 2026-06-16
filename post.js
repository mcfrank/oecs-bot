// OECS bot poster. Reads committed data/ (no live PubPub/Cloudflare dependency),
// picks an unposted article, posts to Bluesky + Twitter, and records the post.
//
//   node post.js            post for real
//   node post.js --dry-run  compose and print, post nothing
//
// Env (.env): BLUESKY_USERNAME, BLUESKY_PASSWORD,
//             TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET

const fs = require('fs');
const path = require('path');
const { BskyAgent, RichText } = require('@atproto/api');
const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const DATA = path.join(__dirname, 'data');

const readJson = (p, fallback) =>
  fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;

// "A" / "A and B" / "A et al."
function formatAuthors(authors) {
  if (!authors || authors.length === 0) return null;
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  return `${authors[0]} et al.`;
}

function composeText(article) {
  const author = formatAuthors(article.authors);
  const by = author ? ` by ${author}` : '';
  return `${article.title}${by}: ${article.link}`;
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

async function postBluesky(text) {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({
    identifier: process.env.BLUESKY_USERNAME,
    password: process.env.BLUESKY_PASSWORD,
  });
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  const res = await agent.post({ text: rt.text, facets: rt.facets });
  return res.uri;
}

async function postTwitter(text) {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_KEY_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
  const res = await client.v2.tweet(text);
  return res.data.id;
}

async function main() {
  const index = readJson(path.join(DATA, 'index.json'), null);
  if (!index || index.length === 0) {
    throw new Error('data/index.json missing or empty — run scripts/fetch_articles.py first');
  }
  const postedPath = path.join(DATA, 'posted.json');
  const posted = readJson(postedPath, { posted: [], history: [] });

  const article = pickArticle(index, posted);
  const text = composeText(article);

  console.log(`Article: ${article.title} (${article.id})`);
  console.log(`Text (${text.length} chars):\n${text}\n`);

  if (DRY_RUN) {
    console.log('[dry-run] nothing posted.');
    return;
  }

  const record = { id: article.id, slug: article.slug, title: article.title, date: new Date().toISOString() };

  try {
    record.bluesky_uri = await postBluesky(text);
    console.log(`Posted to Bluesky: ${record.bluesky_uri}`);
  } catch (e) {
    console.error('Bluesky post failed:', e.message);
  }

  try {
    record.tweet_id = await postTwitter(text);
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
