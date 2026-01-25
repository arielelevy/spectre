import os
import requests


class XClient:
    def __init__(self):
        self.bearer_token = os.getenv("X_BEARER_TOKEN")
        if not self.bearer_token:
            raise ValueError("X_BEARER_TOKEN is not set in environment variables")
        self.base_url = "https://api.twitter.com/2"

    def _get_headers(self):
        return {
            "Authorization": f"Bearer {self.bearer_token}",
            "User-Agent": "SpectreIntelligence/1.0",
        }

    def search_recent_tweets(self, query: str, max_results: int = 10):
        """
        Search for recent tweets.
        Note: Requires Basic, Pro, or Enterprise access for full search features.
        """
        url = f"{self.base_url}/tweets/search/recent"
        params = {
            "query": query,
            "max_results": max_results,
            "tweet.fields": "created_at,author_id,lang",
        }

        response = requests.get(url, headers=self._get_headers(), params=params)

        if response.status_code != 200:
            raise Exception(
                f"Request returned an error: {response.status_code} {response.text}"
            )

        return response.json()

    def get_user_by_username(self, username: str):
        """
        Get user information by username.
        """
        url = f"{self.base_url}/users/by/username/{username}"
        response = requests.get(url, headers=self._get_headers())

        if response.status_code != 200:
            raise Exception(
                f"Request returned an error: {response.status_code} {response.text}"
            )

        return response.json()


if __name__ == "__main__":
    # Test execution
    try:
        client = XClient()
        print("X Client initialized successfully.")

        # Example: Get info for a specific user (e.g., 'innerbi' if it exists, or 'X')
        try:
            user_info = client.get_user_by_username("X")
            print(f"User Info: {user_info}")
        except Exception as e:
            print(f"Error fetching user: {e}")

    except Exception as e:
        print(f"Initialization failed: {e}")
