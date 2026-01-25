import os

from dotenv import load_dotenv

from shared.logging import configure_logging
from batch.github_worker import run_worker

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(BASE_DIR, ".env")

if os.path.exists(ENV_PATH):
    load_dotenv(dotenv_path=ENV_PATH)


if __name__ == "__main__":
    configure_logging("batch-worker")
    run_worker()
