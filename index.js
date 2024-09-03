const { BskyAgent, Atproto, RichText } = require('@atproto/api');
const dotenv = require('dotenv');
const { CronJob } = require('cron');
const process = require('process');
const axios = require('axios').default;


dotenv.config();

// Create a Bluesky Agent 
const agent = new BskyAgent({
    service: 'https://bsky.social',
  })


// API options for OECS
const options = {
  method: 'GET',
  url: 'https://www.pubpub.org/api/collectionPubs',
  params: {
    collectionId: '9dd2a47d-4a84-4126-9135-50a6383c26a9',
    communityId: 'e2759450-b8e2-433a-a70d-45aff0f75d45',
    limit: '500'
  },
  headers: {Accept: 'application/json'}
};


// article array
let articles = [];

// Function to fetch articles from an external API
async function fetchArticles() {
    try {
        // Replace 'https://api.example.com/articles' with the actual API endpoint
        const response = await axios.request(options);
        
        // Assuming each article has 'title' and 'doi', construct the link
        articles = response.data.map(article => ({
            author: article.attributions.find(attr => attr.isAuthor).name,
            name: article.title,
            link: article.doi ? `https://doi.org/${article.doi}` : `https://oecs.mit.edu/view/${article.viewHash}`, // Fall back to viewHash if DOI is not available
        }));
        
        console.log('Articles fetched successfully:', articles);
    } catch (error) {
        console.error('Error fetching articles:', error);
    }
}


// Track which links have been posted
let postedArticles = new Set();

// Get links function
function getNextArticle() {
    // Filter out already posted articles
    const availableArticles = articles.filter(article => !postedArticles.has(article.link));
    
    // If all articles have been posted, reset the tracker
    if (availableArticles.length === 0) {
        postedArticles.clear();
        return getNextArticle(); // Recursively call to restart with the full list
    }
    
    // Choose the next article (sequentially or randomly)
    // const nextArticle = availableArticles[0]; // Sequentially
    const nextArticle = availableArticles[Math.floor(Math.random() * availableArticles.length)]; // Randomly

    // Mark this article as posted
    postedArticles.add(nextArticle.link);
    return nextArticle;
}

// main posting function
async function main() {
    try {


        // Fetch articles if not already done
        if (articles.length === 0) {
            await fetchArticles();
        }

        const nextArticle = getNextArticle();

        // log into bluesky
        await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });

        const rt = new RichText({
            text : `${nextArticle.name} by ${nextArticle.author}: ${nextArticle.link}`
        });

        await rt.detectFacets(agent)

        await agent.post({
            text: rt.text, 
            facets: rt.facets
        });
        console.log(`Posted: ${nextArticle.name} by ${nextArticle.author}: ${nextArticle.link}`);
    } catch (error) {
        console.error("Error in main function:", error);
        // Removed process.exit(1) to avoid crashing the app
    }
}
main();


// Run this on a cron job
const isTesting = process.env.NODE_ENV !== 'production';
const scheduleExpression = isTesting ? '* * * * *' : '0 12 * * *'; // Every minute for testing, every three hours for prod

const job = new CronJob(scheduleExpression, main);

job.start();