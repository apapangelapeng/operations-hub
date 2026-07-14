import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


default_database_url = (
    "sqlite:////data/operations_hub.db"
    if os.environ.get("FLY_APP_NAME") and os.path.isdir("/data")
    else "sqlite:///./operations_hub.db"
)
DATABASE_URL = os.environ.get("DATABASE_URL", default_database_url)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
