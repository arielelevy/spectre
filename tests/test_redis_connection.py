import os
import sys
import pytest
from dotenv import load_dotenv

# Add project root to path to ensure modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from shared.services.redis_service import RedisService


def test_redis_connection():
    """
    Verifies that the RedisService can successfully connect to Redis.
    Uses the .env file for configuration.
    """
    # Load environment variables from the root .env file
    dotenv_path = os.path.join(os.path.dirname(__file__), "../../.env")
    load_dotenv(dotenv_path, override=True)

    # Check if REDIS_URL is set
    redis_url = os.getenv("REDIS_URL")
    print(f"\nLoaded .env from: {dotenv_path}")
    print(f"Testing with REDIS_URL: {redis_url}")
    assert redis_url is not None, "REDIS_URL must be set in .env"

    # Initialize service
    # We use eager=True to force an immediate connection attempt
    try:
        redis_service = RedisService.get_instance(eager=True)
        is_healthy = redis_service.health_check()
        assert is_healthy is True
        print("Redis connection successful!")

        # Test a simple write/read
        client = redis_service.client
        client.set("test_key", "hello_redis")
        value = client.get("test_key")
        assert value == "hello_redis"
        print("Redis write/read successful!")

        # Cleanup
        client.delete("test_key")
        redis_service.close()

    except Exception as e:
        pytest.fail(f"Failed to connect to Redis: {e}")


if __name__ == "__main__":
    test_redis_connection()
