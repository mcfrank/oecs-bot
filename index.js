const { BskyAgent } = require('@atproto/api');
const dotenv = require('dotenv');
const { CronJob } = require('cron');
const process = require('process');

dotenv.config();

// Create a Bluesky Agent 
const agent = new BskyAgent({
    service: 'https://bsky.social',
  })


async function main() {
    try {
        await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });
        await agent.post({
            text: "🙂"
        });
        console.log("Just posted!");
    } catch (error) {
        console.error("Error in main function:", error);
        process.exit(1);
    }
}

main();


// Run this on a cron job
const scheduleExpressionMinute = '* * * * *'; // Run once every minute for testing
const scheduleExpression = '0 */3 * * *'; // Run once every three hours in prod

const job = new CronJob(scheduleExpressionMinute, main); // change to scheduleExpressionMinute for testing

job.start();