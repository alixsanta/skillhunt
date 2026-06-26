from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # C2.2.3 — Secrets hors du code, chargés depuis les variables d'environnement
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/skillhunt"
    redis_url: str = "redis://localhost:6379/0"
    backend_core_url: str = "http://localhost:3001"


settings = Settings()
