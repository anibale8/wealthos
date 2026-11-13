from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    database_url: str = "sqlite:///./data/wealthos.db"
    environment: str = "development"
    base_currency: str = "EUR"
    yfinance_cache_ttl: int = 300
    coingecko_rate_limit: int = 30


settings = Settings()
