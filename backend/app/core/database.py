from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import event

from app.core.config import settings

connect_args = {"check_same_thread": False}
engine = create_engine(str(settings.DATABASE_URL), connect_args=connect_args)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
