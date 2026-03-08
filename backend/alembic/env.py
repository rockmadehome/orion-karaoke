import sys
from pathlib import Path

# Make app importable from alembic context
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from sqlmodel import SQLModel

# Import all models so Alembic can detect them
from app.domain.models.job import ProcessingJob
from app.domain.models.song import Song
from app.domain.models.playback import PlaybackQueueItem
from app.domain.models.user import User
from app.core.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", str(settings.DATABASE_URL))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
