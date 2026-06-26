"""
Enterprise Database Configuration
Async SQLAlchemy 2.x with PostgreSQL, connection pooling, and replica support.
"""
from __future__ import annotations

import contextlib
from typing import Any, AsyncGenerator, AsyncIterator, Optional

from sqlalchemy import MetaData, NullPool, create_engine, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column
from sqlalchemy.schema import CreateSchema

from app.core.config import settings

# ── Naming convention for constraints ───────────────────────────────────────
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=convention)  # type: ignore


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    metadata = metadata

    @declared_attr
    def __tablename__(cls) -> str:
        """Auto-generate table name from class name (snake_case)."""
        name = cls.__name__
        # Convert CamelCase to snake_case
        result = [name[0].lower()]
        for char in name[1:]:
            if char.isupper():
                result.extend(["_", char.lower()])
            else:
                result.append(char)
        return "".join(result)

    # Audit fields for all models
    created_at: Mapped[Optional[Any]]
    updated_at: Mapped[Optional[Any]]
    created_by: Mapped[Optional[str]]
    updated_by: Mapped[Optional[str]]
    is_deleted: Mapped[Optional[bool]]
    version: Mapped[Optional[int]]


# ── Engine factory ──────────────────────────────────────────────────────────

def create_db_engine(url: Optional[str] = None) -> AsyncEngine:
    """Create async SQLAlchemy engine with enterprise configuration."""
    db_url = url or settings.database_url

    engine_kwargs: dict[str, Any] = {
        "url": db_url,
        "echo": settings.DATABASE_ECHO,
        "pool_size": settings.DATABASE_POOL_SIZE,
        "max_overflow": settings.DATABASE_MAX_OVERFLOW,
        "pool_timeout": settings.DATABASE_POOL_TIMEOUT,
        "pool_recycle": settings.DATABASE_POOL_RECYCLE,
        "pool_pre_ping": True,
        "connect_args": {
            "statement_timeout": settings.DATABASE_STATEMENT_TIMEOUT,
            "command_timeout": settings.DATABASE_STATEMENT_TIMEOUT,
        },
    }

    if settings.ENVIRONMENT == "testing":
        engine_kwargs["poolclass"] = NullPool
        engine_kwargs.pop("pool_size", None)
        engine_kwargs.pop("max_overflow", None)

    if "sqlite" in db_url:
        engine_kwargs["connect_args"] = {"check_same_thread": False}

    engine = create_async_engine(**engine_kwargs)

    @event.listens_for(engine.sync_engine, "connect")
    def set_search_path(dbapi_connection, connection_record):
        """Set schema search path on connection."""
        cursor = dbapi_connection.cursor()
        cursor.execute("SET search_path TO public, v8;")
        cursor.close()

    return engine


# ── Session factory ─────────────────────────────────────────────────────────

engine: AsyncEngine = create_db_engine()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency provider for async database sessions."""
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Alias for get_async_session."""
    async for session in get_async_session():
        yield session


@contextlib.asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Context manager for database sessions with automatic commit/rollback."""
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


# ── Schema management ────────────────────────────────────────────────────────

async def create_schema_if_not_exists() -> None:
    """Create the v8 schema if it doesn't exist."""
    async with engine.connect() as conn:
        await conn.execute(CreateSchema("v8", if_not_exists=True))
        await conn.commit()


async def init_db() -> None:
    """Initialize database: create schema and all tables."""
    await create_schema_if_not_exists()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Dispose of the database engine."""
    await engine.dispose()


# ── Health Check ─────────────────────────────────────────────────────────────

async def check_db_health() -> dict[str, Any]:
    """Check database connectivity and return status."""
    try:
        async with engine.connect() as conn:
            await conn.execute(engine.dialect.statement_compiler(engine.dialect, None).__class__(
                engine.dialect,
                None,
            ).__class__.__module__)
            result = await conn.execute(engine.text("SELECT 1"))
            return {
                "status": "healthy",
                "database": settings.DB_NAME,
                "provider": settings.DATABASE_PROVIDER.value,
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "database": settings.DB_NAME,
        }


# ── Read Replica Support ────────────────────────────────────────────────────

replica_engine: Optional[AsyncEngine] = None
replica_session_factory: Optional[async_sessionmaker] = None


def configure_read_replica(url: str) -> None:
    """Configure a read replica connection for analytics workloads."""
    global replica_engine, replica_session_factory
    replica_engine = create_db_engine(url)
    replica_session_factory = async_sessionmaker(
        replica_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_read_replica_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a session connected to the read replica."""
    if not replica_session_factory:
        async for session in get_async_session():
            yield session
        return
    session = replica_session_factory()
    try:
        yield session
    finally:
        await session.close()
