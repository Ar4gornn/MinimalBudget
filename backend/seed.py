"""Populate a demo account with a few months of plausible data.

    ALLOW_SEED=1 python seed.py --email demo@example.com --password demo-password-1234

Refuses to run without ALLOW_SEED=1: it creates an account whose password is printed in a
public README, which is harmless locally and a handed-out login on a server.

Runs entirely through the service layer with a tenant-pinned session, so it obeys exactly
the same row-level security as a request does — a seed script that bypassed RLS would be a
seed script that could hide an RLS bug.

Idempotent per account: re-running wipes that user's rows and rebuilds them.
"""

import argparse
import datetime as dt
import os
import sys
import uuid
from decimal import Decimal

from sqlalchemy import delete, select

from app.core.db import tenant_session
from app.models.inventory import InventoryItem, Space
from app.models.ledger import Entry, EntryKind
from app.models.savings import SavingsContribution, SavingsTarget, SavingsType
from app.models.user import User
from app.services import auth as auth_service
from app.services import inventory, ledger, savings

MONTHS_OF_HISTORY = 6

INCOME = [("Salary", "3200.00"), ("Freelance", "450.00")]

# (category, monthly budget, [amount per month, oldest first])
EXPENSES: list[tuple[str, str, list[str]]] = [
    ("Rent", "1200.00", ["1200.00"] * 6),
    ("Groceries", "400.00", ["372.40", "418.90", "395.10", "441.25", "388.60", "402.15"]),
    ("Transport", "120.00", ["96.50", "112.00", "88.75", "134.20", "101.40", "118.90"]),
    ("Utilities", "150.00", ["143.10", "138.65", "129.40", "151.75", "162.30", "147.05"]),
    ("Eating out", "180.00", ["210.55", "165.30", "198.75", "142.60", "223.40", "176.20"]),
    # Budgeted and never spent on — the row the dashboard must still show at zero.
    ("Gym", "45.00", ["0.00"] * 6),
]

# Fuel is the unit-price case (AD-29): litres and a rate that drifts, so the category page
# has a price-per-litre series to draw. (litres, price per litre) per month, oldest first.
FUEL: list[tuple[str, str]] = [
    ("42.150", "1.4490"),
    ("38.900", "1.4790"),
    ("45.300", "1.5120"),
    ("40.000", "1.4990"),
    ("43.700", "1.5310"),
    ("41.200", "1.5590"),
]

# (space, [(item, quantity, restock_below, cost, note)])
INVENTORY: list[tuple[str, list[tuple[str, int, int | None, str | None, str | None]]]] = [
    (
        "Fridge",
        [
            ("Milk", 0, 1, "3.50", None),
            ("Eggs", 6, 2, "3.20", None),
            ("Butter", 1, 1, "2.80", "salted"),
        ],
    ),
    (
        "Garage",
        [("Engine oil", 1, None, "24.00", "5W-30"), ("Windscreen wash", 2, 1, "4.50", None)],
    ),
    (
        "House stuff",
        [("Toilet paper", 2, 4, "12.00", None), ("AA batteries", 8, 4, "9.90", None)],
    ),
]

SAVINGS = [
    ("startup", "600.00", ["600.00", "600.00", "300.00", "600.00", "750.00", "600.00"]),
    ("vacation", "250.00", ["250.00", "250.00", "250.00", "0.00", "250.00", "400.00"]),
]


def month_starts(count: int, today: dt.date) -> list[dt.date]:
    first = today.replace(day=1)
    months = []
    for step in range(count - 1, -1, -1):
        total = first.year * 12 + first.month - 1 - step
        months.append(dt.date(total // 12, total % 12 + 1, 1))
    return months


def refuse_unless_allowed() -> None:
    """This script creates an account whose password is printed in a public README.

    That is fine on a laptop and dangerous on an internet-facing instance, and the script
    ships inside the production image because invite.py and reset_password.py have to. So
    it refuses by default rather than relying on nobody typing it on the wrong machine.
    """
    if os.environ.get("ALLOW_SEED") == "1":
        return
    print(
        "Refusing to seed.\n\n"
        "This creates an account whose credentials are published in the README, so running\n"
        "it on an internet-facing instance hands anyone who reads the repository a login.\n\n"
        "If this really is a local or throwaway database, set ALLOW_SEED=1:\n"
        "    ALLOW_SEED=1 python seed.py\n",
        file=sys.stderr,
    )
    raise SystemExit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", default="demo@example.com")
    parser.add_argument("--password", default="demo-password-1234")
    args = parser.parse_args()

    refuse_unless_allowed()

    email = args.email.strip().lower()

    # Find the account, or make one. auth_lookup is the only way to resolve an email
    # without a tenant, which is exactly the point of AD-19.
    from app.core.db import anonymous_session

    user_id: uuid.UUID | None = None
    for session in anonymous_session():
        user_id = auth_service.authenticate(session, email=email, password=args.password)

    if user_id is None:
        user_id = uuid.uuid4()
        with tenant_session(user_id) as session:
            existing = session.execute(
                select(User.id).where(User.email == email)
            ).scalar_one_or_none()
            if existing is not None:
                print(
                    f"{email} already exists but the password given does not match it.",
                    file=sys.stderr,
                )
                return 1
            auth_service.register(session, user_id=user_id, email=email, password=args.password)
        print(f"created {email}")
    else:
        print(f"using existing account {email}")

    today = dt.date.today()
    months = month_starts(MONTHS_OF_HISTORY, today)

    with tenant_session(user_id) as session:
        # Order matters: the RESTRICT foreign keys refuse it otherwise (AD-21).
        session.execute(delete(InventoryItem).where(InventoryItem.user_id == user_id))
        session.execute(delete(Space).where(Space.user_id == user_id))
        session.execute(delete(SavingsContribution).where(SavingsContribution.user_id == user_id))
        session.execute(delete(SavingsTarget).where(SavingsTarget.user_id == user_id))
        session.execute(delete(Entry).where(Entry.user_id == user_id))
        session.flush()

        for name, amount in INCOME:
            category = ledger.get_or_create_category(
                session, user_id, kind=EntryKind.income, name=name
            )
            for month in months:
                session.add(
                    Entry(
                        user_id=user_id,
                        kind=EntryKind.income,
                        category_id=category.id,
                        amount=Decimal(amount),
                        occurred_on=month.replace(day=2),
                        note=None,
                    )
                )

        for name, budget, amounts in EXPENSES:
            category = ledger.get_or_create_category(
                session, user_id, kind=EntryKind.expense, name=name
            )
            savings.set_budget(session, user_id, category.id, monthly_amount=Decimal(budget))
            for month, amount in zip(months, amounts, strict=True):
                if Decimal(amount) == 0:
                    continue
                session.add(
                    Entry(
                        user_id=user_id,
                        kind=EntryKind.expense,
                        category_id=category.id,
                        amount=Decimal(amount),
                        occurred_on=month.replace(day=min(14, 28)),
                        note=None,
                    )
                )

        fuel = ledger.get_or_create_category(session, user_id, kind=EntryKind.expense, name="Fuel")
        savings.set_budget(session, user_id, fuel.id, monthly_amount=Decimal("70.00"))
        for month, (litres, rate) in zip(months, FUEL, strict=True):
            amount = (Decimal(litres) * Decimal(rate)).quantize(Decimal("0.01"))
            session.add(
                Entry(
                    user_id=user_id,
                    kind=EntryKind.expense,
                    category_id=fuel.id,
                    amount=amount,
                    occurred_on=month.replace(day=9),
                    note=None,
                    quantity=Decimal(litres),
                    unit="l",
                )
            )

        for space_name, things in INVENTORY:
            for name, quantity, restock_below, cost, note in things:
                inventory.create_item(
                    session,
                    user_id,
                    name=name,
                    quantity=quantity,
                    restock_below=restock_below,
                    cost=Decimal(cost) if cost else None,
                    note=note,
                    space_id=None,
                    space_name=space_name,
                )

        for name, target, amounts in SAVINGS:
            savings_type = session.execute(
                select(SavingsType).where(SavingsType.user_id == user_id, SavingsType.name == name)
            ).scalar_one_or_none()
            if savings_type is None:
                savings_type = savings.get_or_create_type(session, user_id, name=name)
            savings.set_target(session, user_id, savings_type.id, monthly_amount=Decimal(target))
            for month, amount in zip(months, amounts, strict=True):
                if Decimal(amount) == 0:
                    continue
                session.add(
                    SavingsContribution(
                        user_id=user_id,
                        savings_type_id=savings_type.id,
                        amount=Decimal(amount),
                        occurred_on=month.replace(day=3),
                        note=None,
                    )
                )

        # A savings type with a target and nothing put into it, so the dashboard shows the
        # zero-progress case too.
        investment = session.execute(
            select(SavingsType).where(
                SavingsType.user_id == user_id, SavingsType.name == "investment"
            )
        ).scalar_one_or_none()
        if investment is not None:
            savings.set_target(session, user_id, investment.id, monthly_amount=Decimal("200.00"))

        session.flush()

    print(f"seeded {MONTHS_OF_HISTORY} months ending {months[-1]:%Y-%m}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
