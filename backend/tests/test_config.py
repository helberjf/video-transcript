from app.core.config import Settings


def test_settings_support_cors_origin_regex() -> None:
    settings = Settings(
        cors_origins="http://localhost:3000, https://app.example.com",
        cors_origin_regex=r"https://.*\.vercel\.app",
    )

    assert settings.cors_origin_list == ["http://localhost:3000", "https://app.example.com"]
    assert settings.cors_origin_regex == r"https://.*\.vercel\.app"