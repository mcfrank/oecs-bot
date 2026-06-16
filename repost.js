// Re-share the most recent OECS post a few hours later, for a second wave of reach.
// Bluesky: repost; Twitter: retweet. Best-effort per platform.
//
//   node repost.js            repost the latest post
//   node repost.js --dry-run  print what would be reposted, do nothing

const fs = require('fs');
const path = require('path');
const { BskyAgent } = require('@atproto/api');
const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const postedPath = path.join(__dirname, 'data', 'posted.json');

async function repostBluesky(uri, cid) {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });
  await agent.repost(uri, cid);
}

async function retweet(tweetId) {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_KEY_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
  const me = await client.v2.me();
  await client.v2.retweet(me.data.id, tweetId);
}

async function main() {
  if (!fs.existsSync(postedPath)) throw new Error('No data/posted.json');
  const posted = JSON.parse(fs.readFileSync(postedPath, 'utf8'));
  const last = posted.history[posted.history.length - 1];
  if (!last) {
    console.log('Nothing posted yet — nothing to repost.');
    return;
  }
  console.log(`Reposting: ${last.title} (${last.date})`);

  if (DRY_RUN) {
    console.log('[dry-run] nothing reposted.');
    return;
  }

  if (last.bluesky_uri && last.bluesky_cid) {
    try {
      await repostBluesky(last.bluesky_uri, last.bluesky_cid);
      console.log('Reposted on Bluesky.');
    } catch (e) {
      console.error('Bluesky repost failed:', e.message);
    }
  }
  if (last.tweet_id) {
    try {
      await retweet(last.tweet_id);
      console.log('Retweeted on Twitter.');
    } catch (e) {
      console.error('Twitter retweet failed:', e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
