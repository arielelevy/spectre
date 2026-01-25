from backend.services.clickhouse_service import ClickHouseService


def test_clickhouse_ping():
    client = ClickHouseService.get_instance()
    assert client.ping() is True
