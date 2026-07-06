from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from urllib.parse import quote_plus


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv(Path(__file__).with_name(".env"))

### BD ###
@dataclass(frozen=True)
class Settings:
    app_name: str = "AutLab API"
    db_host: str = os.getenv("DB_HOST", "172.25.21.100")
    db_port: int = int(os.getenv("DB_PORT", "3306"))
    db_name: str = os.getenv("DB_NAME", "autolabqr-devel")
    db_user: str = os.getenv("DB_USER", "desarrollo")
    db_password: str = os.getenv("DB_PASSWORD", "aplicaciones*2015")

    @property
    def database_url(self) -> str:
        user = quote_plus(self.db_user)
        password = quote_plus(self.db_password)
        database = quote_plus(self.db_name)
        return f"mysql+pymysql://{user}:{password}@{self.db_host}:{self.db_port}/{database}?charset=utf8mb4"


settings = Settings()

