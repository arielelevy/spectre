import os
import sys

from dotenv import load_dotenv
import uvicorn

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_PATH = os.path.join(BASE_DIR, ".env")

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if os.path.exists(ENV_PATH):
    load_dotenv(dotenv_path=ENV_PATH)


if __name__ == "__main__":
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=False)
