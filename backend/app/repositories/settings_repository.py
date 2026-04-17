from sqlalchemy.orm import Session

from app.models.system_config import SystemConfig


class SettingsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self) -> SystemConfig | None:
        return self.db.get(SystemConfig, 1)

    def save(self, config: SystemConfig) -> SystemConfig:
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config
