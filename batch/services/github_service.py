import json
import os
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

import redis
import requests


@dataclass
class GitHubConfig:
    token: str
    base_url: str = "https://api.github.com"
    user_agent: str = "SpectreIntelligence/1.0"
    per_page: int = 100
    timeout_seconds: int = 30

    def __post_init__(self) -> None:
        if self.per_page > 100:
            self.per_page = 100
        if self.per_page < 1:
            self.per_page = 1


@dataclass
class RedisStreamConfig:
    url: str
    stream: str = "ext:ingest:stream"
    maxlen: int = 50000


class GitHubClient:
    def __init__(self, config: GitHubConfig):
        if not config.token:
            raise ValueError("GITHUB_TOKEN is required for GitHub ingestion")
        self.config = config

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": self.config.user_agent,
        }

    def list_commits(
        self, owner: str, repo: str, since: Optional[str] = None
    ) -> List[dict]:
        url = f"{self.config.base_url}/repos/{owner}/{repo}/commits"
        params: Dict[str, Any] = {"per_page": self.config.per_page}
        if since:
            params["since"] = str(since)
        response = requests.get(
            url,
            headers=self._headers(),
            params=params,
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def list_issues(
        self, owner: str, repo: str, since: Optional[str] = None
    ) -> List[dict]:
        url = f"{self.config.base_url}/repos/{owner}/{repo}/issues"
        params: Dict[str, Any] = {"per_page": self.config.per_page, "state": "all"}
        if since:
            params["since"] = str(since)
        response = requests.get(
            url,
            headers=self._headers(),
            params=params,
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def list_pull_requests(
        self, owner: str, repo: str, state: str = "all"
    ) -> List[dict]:
        url = f"{self.config.base_url}/repos/{owner}/{repo}/pulls"
        params: Dict[str, Any] = {"per_page": self.config.per_page, "state": state}
        response = requests.get(
            url,
            headers=self._headers(),
            params=params,
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def list_releases(self, owner: str, repo: str) -> List[dict]:
        url = f"{self.config.base_url}/repos/{owner}/{repo}/releases"
        params: Dict[str, Any] = {"per_page": self.config.per_page}
        response = requests.get(
            url,
            headers=self._headers(),
            params=params,
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def list_public_events(self, page: int = 1) -> List[dict]:
        url = f"{self.config.base_url}/events"
        params: Dict[str, Any] = {"per_page": self.config.per_page, "page": page}
        response = requests.get(
            url,
            headers=self._headers(),
            params=params,
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()

    def list_repository_events(
        self, owner: str, repo: str, page: int = 1
    ) -> List[dict]:
        url = f"{self.config.base_url}/repos/{owner}/{repo}/events"
        params: Dict[str, Any] = {"per_page": self.config.per_page, "page": page}
        response = requests.get(
            url,
            headers=self._headers(),
            params=params,
            timeout=self.config.timeout_seconds,
        )
        if response.status_code == 422:
            return []
        response.raise_for_status()
        return response.json()

    def search_repositories(
        self,
        query: str,
        sort: str = "stars",
        order: str = "desc",
        page: int = 1,
    ) -> List[dict]:
        url = f"{self.config.base_url}/search/repositories"
        params: Dict[str, Any] = {
            "q": query,
            "sort": sort,
            "order": order,
            "per_page": self.config.per_page,
            "page": page,
        }
        response = requests.get(
            url,
            headers=self._headers(),
            params=params,
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json() if response.content else {}
        return payload.get("items", [])


class RedisStreamPublisher:
    def __init__(self, config: RedisStreamConfig):
        self.config = config
        self.client = redis.Redis.from_url(self.config.url, decode_responses=True)

    def publish(self, event_type: str, payload: dict) -> str:
        message: Dict[Any, Any] = {
            "event_type": event_type,
            "payload": json.dumps(payload),
        }
        return str(
            self.client.xadd(
                self.config.stream,
                message,
                maxlen=self.config.maxlen,
                approximate=True,
            )
        )

    def publish_batch(self, events: Iterable[dict]) -> List[str]:
        ids = []
        for event in events:
            ids.append(self.publish(event["event_type"], event["payload"]))
        return ids


def build_events(kind: str, owner: str, repo: str, items: List[dict]) -> List[dict]:
    events = []
    for item in items:
        events.append(
            {
                "event_type": f"github.{kind}",
                "payload": {
                    "owner": owner,
                    "repo": repo,
                    "data": item,
                },
            }
        )
    return events


def build_public_events(items: List[dict]) -> List[dict]:
    events = []
    for item in items:
        events.append(
            {
                "event_type": "github.public_event",
                "payload": item,
            }
        )
    return events


def _parse_github_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def run_ingest(owner: str, repo: str, since: Optional[str] = None) -> Dict[str, int]:
    github_config = GitHubConfig(
        token=os.getenv("GITHUB_TOKEN", ""),
        per_page=int(os.getenv("GITHUB_PER_PAGE", "100")),
    )
    redis_config = RedisStreamConfig(
        url=os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )

    client = GitHubClient(github_config)
    publisher = RedisStreamPublisher(redis_config)

    commits = client.list_commits(owner, repo, since=since)
    issues = [
        issue
        for issue in client.list_issues(owner, repo, since=since)
        if "pull_request" not in issue
    ]
    pulls = client.list_pull_requests(owner, repo)
    releases = client.list_releases(owner, repo)

    events = []
    events.extend(build_events("commit", owner, repo, commits))
    events.extend(build_events("issue", owner, repo, issues))
    events.extend(build_events("pull_request", owner, repo, pulls))
    events.extend(build_events("release", owner, repo, releases))

    publisher.publish_batch(events)

    return {
        "commits": len(commits),
        "issues": len(issues),
        "pull_requests": len(pulls),
        "releases": len(releases),
        "events": len(events),
    }


def run_public_ingest(minutes: int = 10) -> Dict[str, int]:
    github_config = GitHubConfig(
        token=os.getenv("GITHUB_TOKEN", ""),
        per_page=int(os.getenv("GITHUB_PER_PAGE", "100")),
    )
    redis_config = RedisStreamConfig(
        url=os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )

    client = GitHubClient(github_config)
    publisher = RedisStreamPublisher(redis_config)

    public_events = fetch_public_events(minutes=minutes, client=client)

    events = build_public_events(public_events)
    publisher.publish_batch(events)

    return {
        "public_events": len(public_events),
        "events": len(events),
        "minutes": minutes,
    }


def fetch_public_events(
    minutes: int = 10, client: Optional[GitHubClient] = None
) -> List[dict]:
    if client is None:
        github_config = GitHubConfig(
            token=os.getenv("GITHUB_TOKEN", ""),
            per_page=int(os.getenv("GITHUB_PER_PAGE", "100")),
        )
        client = GitHubClient(github_config)

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    events: List[dict] = []

    page = 1
    while True:
        page_items = client.list_public_events(page=page)
        if not page_items:
            break

        oldest_time: Optional[datetime] = None
        for item in page_items:
            created_at = item.get("created_at")
            if not created_at:
                continue
            created_time = _parse_github_time(created_at)
            if oldest_time is None or created_time < oldest_time:
                oldest_time = created_time
            if created_time >= cutoff:
                events.append(item)

        if oldest_time and oldest_time < cutoff:
            break

        page += 1

    return events


def fetch_repo_events_pages(
    minutes: int = 10, client: Optional[GitHubClient] = None
) -> Iterable[List[dict]]:
    if client is None:
        github_config = GitHubConfig(
            token=os.getenv("GITHUB_TOKEN", ""),
            per_page=int(os.getenv("GITHUB_PER_PAGE", "100")),
        )
        client = GitHubClient(github_config)

    del minutes
    search_query = os.getenv("GITHUB_REPO_SEARCH_QUERY", "stars:>5000")
    search_sort = os.getenv("GITHUB_REPO_SEARCH_SORT", "stars")
    search_order = os.getenv("GITHUB_REPO_SEARCH_ORDER", "desc")
    max_repos = int(os.getenv("GITHUB_REPO_SEARCH_MAX_REPOS", "100"))
    max_search_pages = int(os.getenv("GITHUB_REPO_SEARCH_PAGES", "1"))

    logger.info(
        "Repo ingest: query=%s sort=%s order=%s max_repos=%s search_pages=%s",
        search_query,
        search_sort,
        search_order,
        max_repos,
        max_search_pages,
    )

    repos: List[dict] = []
    for page in range(1, max_search_pages + 1):
        logger.info("Repo search page %s", page)
        items = client.search_repositories(
            search_query, sort=search_sort, order=search_order, page=page
        )
        if not items:
            break
        repos.extend(items)
        logger.info("Repo search page %s returned %s items", page, len(items))
        if len(repos) >= max_repos:
            repos = repos[:max_repos]
            break

    logger.info("Repo search resolved %s repos", len(repos))

    for repo in repos:
        full_name = repo.get("full_name")
        if not full_name or "/" not in full_name:
            continue
        owner, name = full_name.split("/", 1)
        logger.info("Repo events for %s/%s", owner, name)

        page = 1
        while True:
            logger.info("Repo events page %s for %s/%s", page, owner, name)
            page_items = client.list_repository_events(owner, name, page=page)
            if not page_items:
                break
            page_events = page_items

            logger.info(
                "Repo events page %s for %s/%s returned %s items",
                page,
                owner,
                name,
                len(page_items),
            )
            if page_events:
                yield page_events
            page += 1


def fetch_repo_events(
    minutes: int = 10, client: Optional[GitHubClient] = None
) -> List[dict]:
    events: List[dict] = []
    for page_events in fetch_repo_events_pages(minutes=minutes, client=client):
        events.extend(page_events)
    return events


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Ingest GitHub data into Redis Streams"
    )
    parser.add_argument("owner", nargs="?")
    parser.add_argument("repo", nargs="?")
    parser.add_argument("--since", default=None)
    parser.add_argument("--public", action="store_true")
    parser.add_argument("--minutes", type=int, default=10)
    args = parser.parse_args()

    if args.public:
        stats = run_public_ingest(minutes=args.minutes)
        print(json.dumps(stats, indent=2))
    else:
        if not args.owner or not args.repo:
            raise SystemExit("owner and repo are required unless --public is used")
        stats = run_ingest(args.owner, args.repo, since=args.since)
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
logger = logging.getLogger(__name__)
