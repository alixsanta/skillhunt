from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # C2.2.3 — Secrets hors du code, chargés depuis les variables d'environnement
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://user:password@localhost:5433/skillhunt"
    redis_url: str = "redis://localhost:6379/0"
    backend_core_url: str = "http://localhost:3001"
    match_cache_ttl: int = 60  # TTL (s) du cache des résultats /match (SH-14)


settings = Settings()
