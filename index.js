const { BskyAgent } = require('@atproto/api');
const dotenv = require('dotenv');
const { CronJob } = require('cron');
const process = require('process');

dotenv.config();

// Create a Bluesky Agent 
const agent = new BskyAgent({
    service: 'https://bsky.social',
  })


// Array of links to post
const links = [
    'https://oecs.mit.edu/pub/qwrz95aw',
    'https://oecs.mit.edu/pub/rbmlimm5',
    'https://oecs.mit.edu/pub/984ungzu',
    // Add more links as needed
];

// Track which links have been posted
let postedLinks = new Set();

// Get links function
function getNextLink() {
    // Filter out already posted links
    const availableLinks = links.filter(link => !postedLinks.has(link));
    
    // If all links have been posted, reset the tracker
    if (availableLinks.length === 0) {
        postedLinks.clear();
        return getNextLink(); // Recursively call to restart with the full list
    }
    
    // Choose the next link (sequentially or randomly)
    const nextLink = availableLinks[0]; // Sequentially
    // const nextLink = availableLinks[Math.floor(Math.random() * availableLinks.length)]; // Randomly

    // Mark this link as posted
    postedLinks.add(nextLink);
    return nextLink;
}

// main posting function
async function main() {
    try {
        const nextLink = getNextLink();
        await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });
        await agent.post({
            text: `Check out this article: ${nextLink}`
        });
        console.log(`Posted: ${nextLink}`);
    } catch (error) {
        console.error("Error in main function:", error);
        // Removed process.exit(1) to avoid crashing the app
    }
}

main();


// Run this on a cron job
const isTesting = process.env.NODE_ENV !== 'production';
const scheduleExpression = isTesting ? '* * * * *' : '0 */3 * * *'; // Every minute for testing, every three hours for prod

const job = new CronJob(scheduleExpression, main);

job.start();