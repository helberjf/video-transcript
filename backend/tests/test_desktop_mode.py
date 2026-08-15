from app.core.config import Settings


def build_settings(**overrides) -> Settings:
    # _env_file=None isola o teste do .env local, que liga o modo desktop.
    return Settings(_env_file=None, **overrides)


def test_electron_app_env_turns_off_credit_limits() -> None:
    settings = build_settings(app_env="desktop")

    assert settings.is_desktop is True
    assert settings.credit_limits_enabled is False


def test_web_deployment_keeps_credit_limits() -> None:
    settings = build_settings(app_env="production")

    assert settings.is_desktop is False
    assert settings.credit_limits_enabled is True
    assert settings.trial_credit_limit == 20


def test_explicit_desktop_mode_overrides_app_env() -> None:
    assert build_settings(app_env="development", desktop_mode=True).credit_limits_enabled is False
    assert build_settings(app_env="desktop", desktop_mode=False).credit_limits_enabled is True
