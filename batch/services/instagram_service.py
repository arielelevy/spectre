import os
import requests
import logging

logger = logging.getLogger(__name__)

class InstagramClient:
    def __init__(self):
        self.access_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
        self.base_url = "https://graph.facebook.com/v18.0"

    def fetch_user_posts(self, user_id: str):
        """
        Fetch public posts from a specific business/creator account.
        """
        if not self.access_token:
            logger.error("INSTAGRAM_ACCESS_TOKEN not found.")
            return []
            
        url = f"{self.base_url}/{user_id}/media"
        params = {
            "access_token": self.access_token,
            "fields": "id,caption,comments_count,timestamp"
        }
        response = requests.get(url, params=params)
        return response.json().get("data", [])

    def fetch_post_comments(self, media_id: str):
        """
        Fetch comments from a post to map interactions.
        """
        url = f"{self.base_url}/{media_id}/comments"
        params = {
            "access_token": self.access_token,
            "fields": "id,text,from,timestamp"
        }
        response = requests.get(url, params=params)
        return response.json().get("data", [])
