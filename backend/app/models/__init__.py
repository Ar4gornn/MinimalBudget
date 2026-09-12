"""SQLAlchemy entities.

Constraints that carry an architectural invariant (composite foreign keys per AD-18,
``amount > 0`` per AD-6, the kind match of AD-7) are declared in the migration as well as
here. The migration is the authority; these declarations keep the ORM honest about them.
"""

from app.models.base import Base
from app.models.gym import (
    Exercise,
    Routine,
    RoutineExercise,
    WeightUnit,
    Workout,
    WorkoutSet,
)
from app.models.habits import Habit, HabitCheckin, ScheduleKind
from app.models.inventory import InventoryItem, InventoryItemChange, Space
from app.models.ledger import Budget, Category, Entry, EntryKind, Unit, Vendor
from app.models.mood import MoodDay
from app.models.purchase import InventoryPurchase
from app.models.push import PushSubscription
from app.models.recipes import (
    Food,
    FoodBasis,
    MealLog,
    Recipe,
    RecipeIngredient,
    RecipeStep,
    RecipeUnit,
)
from app.models.recurring import Cadence, OccurrenceStatus, RecurringOccurrence, RecurringTemplate
from app.models.savings import SavingsContribution, SavingsTarget, SavingsType
from app.models.user import User

__all__ = [
    "Base",
    "Budget",
    "Cadence",
    "OccurrenceStatus",
    "RecurringOccurrence",
    "RecurringTemplate",
    "Category",
    "Entry",
    "EntryKind",
    "Exercise",
    "Habit",
    "HabitCheckin",
    "ScheduleKind",
    "InventoryItem",
    "InventoryPurchase",
    "PushSubscription",
    "Routine",
    "RoutineExercise",
    "WeightUnit",
    "Workout",
    "WorkoutSet",
    "InventoryItemChange",
    "MoodDay",
    "SavingsContribution",
    "SavingsTarget",
    "SavingsType",
    "Food",
    "FoodBasis",
    "MealLog",
    "Recipe",
    "RecipeIngredient",
    "RecipeStep",
    "RecipeUnit",
    "Space",
    "Unit",
    "User",
    "Vendor",
]
