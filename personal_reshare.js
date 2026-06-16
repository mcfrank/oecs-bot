// Reshare the most recent bot post from your *personal* accounts, on a reduced
// cadence (weekly), to amplify reach without spamming followers daily.
// Skips gracefully if personal credentials aren't configured.
//
// Env (.env / secrets):
//   PERSONAL_BLUESKY_USERNAME, PERSONAL_BLUESKY_PASSWORD
//   PERSONAL_TWITTER_API_KEY, PERSONAL_TWITTER_API_KEY_SECRET,
//   PERSONAL_TWITTER_ACCESS_TOKEN, PERSONAL_TWITTER_ACCESS_TOKEN_SECRET

const fs = require('fs');
const path = require('path');
const { BskyAgent } = require('@atproto/api');
const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');

async function repostBluesky(uri, cid) {
  const u = process.env.PERSONAL_BLUESKY_USERNAME;
  const p = process.env.PERSONAL_BLUESKY_PASSWORD;
  if (!u || !p) return console.log('Personal Bluesky not configured — skipping.');
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: u, password: p });
  await agent.repost(uri, cid);
  console.log(`Reshared on Bluesky as ${u}`);
}

async function retweet(tweetId) {
  const k = process.env.PERSONAL_TWITTER_API_KEY;
  if (!k) return console.log('Personal Twitter not configured — skipping.');
  const client = new TwitterApi({
    appKey: k,
    appSecret: process.env.PERSONAL_TWITTER_API_KEY_SECRET,
    accessToken: process.env.PERSONAL_TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.PERSONAL_TWITTER_ACCESS_TOKEN_SECRET,
  });
  const me = await client.v2.me();
  await client.v2.retweet(me.data.id, tweetId);
  console.log(`Retweeted as @${me.data.username}`);
}

async function main() {
  const posted = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'posted.json'), 'utf8'));
  const last = posted.history[posted.history.length - 1];
  if (!last) return console.log('Nothing posted yet.');
  console.log(`Resharing: ${last.title} (${last.date})`);

  if (DRY_RUN) return console.log('[dry-run] nothing reshared.');

  if (last.bluesky_uri && last.bluesky_cid) {
    try { await repostBluesky(last.bluesky_uri, last.bluesky_cid); }
    catch (e) { console.error('Personal Bluesky reshare failed:', e.message); }
  }
  if (last.tweet_id) {
    try { await retweet(last.tweet_id); }
    catch (e) { console.error('Personal Twitter reshare failed:', e.message); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
