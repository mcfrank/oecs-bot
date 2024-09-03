import tweepy

# Replace with your own credentials
consumer_key = '598904227-4a1M7zG6tFFVUoF46jllfxEjIuFwBCIpNS0Svd2u'
consumer_secret = 'qvtCwp6baAq4bFG7d0soMcRRobYV2loNgLwGQltj1GO74'
access_token = 'udTDtQR72PaN9IKhQjgiwHEOl'
access_token_secret = 'qOUUGSZ1qnV07A9v9ztuCIhE6cOCUB2NJAQ7XmOKh0HDQQjtrf'

# Authenticate to Twitter
auth = tweepy.OAuthHandler(consumer_key, consumer_secret)
auth.set_access_token(access_token, access_token_secret)
api = tweepy.API(auth)

# Function to create a tweet
def create_tweet():
    tweet = "Hello, World! This is my first tweet from a bot."
    api.update_status(tweet)

# Run the function
if __name__ == "__main__":
    create_tweet()