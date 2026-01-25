import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from shared.services.clickhouse_service import ClickHouseService

def test_clickhouse_connection():
    load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"), override=True)
    
    print(f"Testing ClickHouse at {os.getenv('CLICKHOUSE_HOST')}:{os.getenv('CLICKHOUSE_PORT')}")
    print(f"User: {os.getenv('CLICKHOUSE_USER')}")
    
    try:
        service = ClickHouseService.get_instance()
        if service.ping():
            print("ClickHouse connection successful!")
            result = service.query("SELECT 1")
            print(f"Query test result: {result.strip()}")
        else:
            print("ClickHouse ping failed!")
            sys.exit(1)
    except Exception as e:
        print(f"Error connecting to ClickHouse: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_clickhouse_connection()
