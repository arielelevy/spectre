"""ClickHouse service client shared by backend and batch."""

from dataclasses import dataclass
import os
from typing import Any, Optional

import requests


@dataclass
class ClickHouseConfig:
    host: str
    port: str
    user: str
    password: str
    database: str
    timeout_seconds: int = 10


class ClickHouseService:
    """Singleton ClickHouse HTTP client."""

    _instance: Optional["ClickHouseService"] = None

    def __init__(self, config: ClickHouseConfig):
        self._config = config
        self._session = requests.Session()

    @staticmethod
    def from_env() -> ClickHouseConfig:
        def _required(name: str) -> str:
            value = os.getenv(name)
            if not value:
                raise ValueError(f"{name} environment variable required")
            return value

        return ClickHouseConfig(
            host=_required("CLICKHOUSE_HOST"),
            port=_required("CLICKHOUSE_PORT"),
            user=_required("CLICKHOUSE_USER"),
            password=_required("CLICKHOUSE_PASSWORD"),
            database=_required("CLICKHOUSE_DATABASE"),
            timeout_seconds=int(_required("CLICKHOUSE_TIMEOUT_SECONDS")),
        )

    @classmethod
    def get_instance(
        cls, config: ClickHouseConfig | None = None
    ) -> "ClickHouseService":
        if cls._instance is None:
            cls._instance = cls(config or cls.from_env())
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        if cls._instance is not None:
            cls._instance.close()
        cls._instance = None

    def _base_url(self) -> str:
        return f"http://{self._config.host}:{self._config.port}/?database={self._config.database}"

    def query(self, sql: str, params: dict[str, Any] | None = None) -> str:
        response = self._session.post(
            self._base_url(),
            params={"user": self._config.user, "password": self._config.password},
            data=sql,
            timeout=self._config.timeout_seconds,
        )
        response.raise_for_status()
        return response.text

    def ping(self) -> bool:
        return self.query("SELECT 1").strip() == "1"

    def close(self) -> None:
        self._session.close()
