import os
import sys
import logging
from collections import Counter
from datetime import datetime

# Add project root to path to allow imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from batch.services.reddit_service import RedditClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def run_social_graph_ingest(subreddit="osint", limit=5):
    """
    Ingests posts and comments to build a social interaction graph.
    """
    client = RedditClient()
    
    # Check credentials
    if not client.client_id or client.client_id == "CHANGE_ME":
        logger.error("Reddit credentials are missing. Check your .env file.")
        return

    logger.info(f"--- Starting Social Graph Ingest from r/{subreddit} ---")

    # 1. Fetch Posts
    posts = client.fetch_subreddit_data(subreddit_name=subreddit, limit=limit)
    logger.info(f"Found {len(posts)} posts to analyze.")

    all_interactions = []
    
    # 2. Extract Interactions (Replies)
    for post in posts:
        logger.info(f"Analyzing post: {post['title'][:30]}... (ID: {post['id']})")
        interactions = client.fetch_post_comments(post['id'])
        all_interactions.extend(interactions)
        logger.info(f"  Found {len(interactions)} interactions in this post.")

    # 3. Build the Graph (Adjacency List & Weights)
    # connection_strength: ("UserA", "UserB") -> count
    connection_strength = Counter()

    for interaction in all_interactions:
        source = interaction['source_user']
        target = interaction['target_user']
        
        # Self-replies are less interesting for "who knows who", but valid interactions
        if source != target:
            # Sort to make connection undirected? No, replies are directed.
            # But "knowing" is often mutual. We'll keep it directed for now.
            pair = (source, target)
            connection_strength[pair] += 1

    # 4. Report Results
    logger.info(f"--- Analysis Complete: {len(all_interactions)} total interactions processed ---")
    logger.info("--- Top Inferred Connections (Who talks to whom?) ---")
    
    # Sort by frequency (strength of relationship)
    most_common = connection_strength.most_common(20)
    
    if not most_common:
        logger.warning("No interactions found. Try a more active subreddit or check limits.")
    
    for (source, target), count in most_common:
        logger.info(f"🔗 {source} -> {target} : {count} interaction(s)")

    # (Optional) Return for further processing or DB storage
    return all_interactions

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build a social graph from Reddit comments")
    parser.add_argument("--subreddit", type=str, default="osint", help="Subreddit to analyze")
    parser.add_argument("--limit", type=int, default=5, help="Number of posts to scan")
    
    args = parser.parse_args()
    
    run_social_graph_ingest(subreddit=args.subreddit, limit=args.limit)
