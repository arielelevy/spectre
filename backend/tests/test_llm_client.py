import os

from backend.services.llm_client import AzureFoundryLLMClient, LLMConfig


def test_llm_chat_smoke():
    if not os.getenv("AZURE_OPENAI_API_KEY"):
        raise RuntimeError("Missing AZURE_OPENAI_API_KEY in environment")

    config = LLMConfig(
        endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
        deployment_name=os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT_NAME", ""),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2023-05-15"),
        timeout_seconds=int(os.getenv("AZURE_OPENAI_TIMEOUT_SECONDS", "60")),
    )

    client = AzureFoundryLLMClient(config)
    result = client.chat(
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Say OK only."},
        ],
        temperature=0.0,
        max_tokens=5,
    )

    assert "choices" in result
    assert result["choices"][0]["message"]["content"].strip()
