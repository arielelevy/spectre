import os
import pandas as pd
import praw


class RedditClient:
    def __init__(self):
        self.client_id = os.getenv("REDDIT_CLIENT_ID")
        self.client_secret = os.getenv("REDDIT_CLIENT_SECRET")
        self.user_agent = os.getenv("REDDIT_USER_AGENT", "SpectreIntelligence/1.0")

        if not self.client_id or not self.client_secret:
            print("Warning: REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET not set.")

        self.reddit = praw.Reddit(
            client_id=self.client_id,
            client_secret=self.client_secret,
            user_agent=self.user_agent,
        )

    def fetch_subreddit_data(self, subreddit_name: str = "osint", limit: int = 100):
        """
        Fetch hot posts from a subreddit and return a list of dictionaries.
        """
        try:
            subreddit = self.reddit.subreddit(subreddit_name)
            data = []

            print(f"Fetching top {limit} hot posts from r/{subreddit_name}...")

            # Using 'hot' as default, but could be configurable
            for post in subreddit.hot(limit=limit):
                data.append(
                    {
                        "id": post.id,
                        "title": post.title,
                        "author": str(post.author),
                        "score": post.score,
                        "created_utc": post.created_utc,
                        "num_comments": post.num_comments,
                        "url": post.url,
                        "selftext": post.selftext[:500]
                        if post.selftext
                        else "",  # Truncate body for preview
                    }
                )

            return data
        except Exception as e:
            print(f"Error fetching subreddit data: {e}")
            return []

    def fetch_post_comments(self, post_id: str):
        """
        Fetch comments for a specific post to map interactions.
        Returns a list of interactions (User A -> User B).
        """
        try:
            submission = self.reddit.submission(id=post_id)
            submission.comments.replace_more(limit=0)  # Flatten tree, ignore 'load more'
            
            interactions = []
            post_author = str(submission.author) if submission.author else "[deleted]"

            for comment in submission.comments.list():
                if not hasattr(comment, "author") or not comment.author:
                    continue
                
                author = str(comment.author)
                parent_author = None

                if comment.is_root:
                    # Top level comment -> replies to Post Author
                    parent_author = post_author
                else:
                    # Reply -> replies to Parent Comment Author
                    parent = comment.parent()
                    if hasattr(parent, "author") and parent.author:
                        parent_author = str(parent.author)
                    else:
                        parent_author = "[deleted]"

                if parent_author and parent_author != "[deleted]":
                    interactions.append({
                        "post_id": post_id,
                        "source_user": author,
                        "target_user": parent_author,
                        "type": "reply",
                        "body_snippet": comment.body[:100]
                    })
            
            return interactions
        except Exception as e:
            print(f"Error fetching comments for {post_id}: {e}")
            return []

    def get_as_dataframe(self, subreddit_name: str = "osint", limit: int = 100):
        """
        Fetch data and return as a Pandas DataFrame.
        """
        data = self.fetch_subreddit_data(subreddit_name, limit)
        return pd.DataFrame(data)


if __name__ == "__main__":
    # Test execution
    client = RedditClient()

    # Check if credentials are placeholders
    if client.client_id == "CHANGE_ME":
        print(
            "Please update REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env to run this test."
        )
    else:
        try:
            df = client.get_as_dataframe("osint", limit=10)
            if not df.empty:
                print("Successfully fetched data:")
                print(df[["title", "author", "score", "url"]].head())
            else:
                print("No data fetched or error occurred.")
        except Exception as e:
            print(f"Execution failed: {e}")
