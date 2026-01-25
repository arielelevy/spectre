import os
import sys
import logging
from collections import Counter

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from batch.services.instagram_service import InstagramClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def run_instagram_graph_ingest(target_user_id):
    """
    Independent ingestor for Instagram social mapping.
    """
    client = InstagramClient()
    
    if not client.access_token:
        logger.error("Instagram credentials missing.")
        return

    logger.info(f"--- Starting Instagram Graph Ingest for User: {target_user_id} ---")

    # 1. Fetch Posts from the account
    posts = client.fetch_user_posts(target_user_id)
    logger.info(f"Found {len(posts)} posts to analyze.")

    connection_strength = Counter()

    # 2. Extract Interactions (Who comments on this user's posts)
    for post in posts:
        media_id = post['id']
        logger.info(f"Analyzing comments for media: {media_id}")
        
        comments = client.fetch_post_comments(media_id)
        for comment in comments:
            # In Instagram API, 'from' contains the user who commented
            if 'from' in comment:
                commenter = comment['from'].get('username', 'unknown')
                # Interaction: Commenter -> Post Owner (target_user_id)
                connection_strength[(commenter, target_user_id)] += 1

    # 3. Report
    logger.info("--- Top Instagram Interactions Found ---")
    for (source, target), count in connection_strength.most_common(10):
        logger.info(f"📸 {source} interactuó con {target} : {count} veces")

if __name__ == "__main__":
    # Example usage: python batch/instagram_worker.py <user_id>
    target_id = sys.argv[1] if len(sys.argv) > 1 else "me"
    run_instagram_graph_ingest(target_id)
