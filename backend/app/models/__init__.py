"""SQLAlchemy entities.

Constraints that carry an architectural invariant (composite foreign keys per AD-18,
``amount > 0`` per AD-6, the kind match of AD-7) are declared in the migration as well as
here. The migration is the authority; these declarations keep the ORM honest about them.
"""

from app.models.base import Base
from app.models.ledger import Category, Entry, EntryKind
from app.models.savings import SavingsType
from app.models.user import User

__all__ = ["Base", "Category", "Entry", "EntryKind", "SavingsType", "User"]
