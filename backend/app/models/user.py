import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedMixin


class User(TimestampedMixin, Base):
    __tablename__ = "users"

    # AD-19: generated in the application, not by the database, so tenancy can be
    # established before the row exists.
    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    # Scoped to the account, not the entry: every amount in one ledger is the same unit,
    # so no conversion and no rate history are needed. See migration 0006.
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="USD")
