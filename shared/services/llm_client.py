import os
from dataclasses import dataclass
from typing import List

from openai import AzureOpenAI


@dataclass
class LLMConfig:
    endpoint: str
    api_key: str
    deployment_name: str
    api_version: str = "2023-05-15"
    timeout_seconds: int = 60


class AzureFoundryLLMClient:
    def __init__(self, config: LLMConfig):
        if not config.endpoint or not config.api_key or not config.deployment_name:
            raise ValueError("Missing Azure OpenAI configuration values")

        self.config = config
        self.client = AzureOpenAI(
            api_key=self.config.api_key,
            api_version=self.config.api_version,
            azure_endpoint=self.config.endpoint,
        )

    def chat(
        self, messages: List[dict], temperature: float = 0.3, max_tokens: int = 800
    ) -> dict:
        response = self.client.chat.completions.create(
            model=self.config.deployment_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=self.config.timeout_seconds,
        )
        return response.model_dump()


def load_llm_config_from_env() -> LLMConfig:
    return LLMConfig(
        endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
        deployment_name=os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT_NAME", ""),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2023-05-15"),
        timeout_seconds=int(os.getenv("AZURE_OPENAI_TIMEOUT_SECONDS", "60")),
    )


if __name__ == "__main__":
    config = load_llm_config_from_env()
    client = AzureFoundryLLMClient(config)
    result = client.chat(
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello from Spectre."},
        ],
    )
    print(result)
