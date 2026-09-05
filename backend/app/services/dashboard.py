"""Dashboard aggregation.

AD-9: every figure here is a SQL aggregate. Nothing is summed row by row in Python, so
there is one definition of "August's expenses" rather than one per endpoint.

AD-22: every aggregate is wrapped so no rows yields 0, never NULL; and budget-versus-actual
is joined **from** the categories side, so a budgeted category with no spending appears at
zero instead of vanishing.

AD-1: every query below also carries an explicit ``user_id`` filter. Row-level security is
the authority and already scopes the session, so these are redundant — deliberately. They
are the same defence in depth the rest of the services keep, and this is the module where a
policy regression would leak totals rather than rows.
"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.months import add_months, month_range, parse_month

_TOTALS = text(
    """
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expense,
        COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0)  AS income
    FROM entries
    WHERE user_id = :uid AND occurred_on >= :start AND occurred_on < :end
    """
)

_SAVED = text(
    """
    SELECT COALESCE(SUM(amount), 0) AS saved
    FROM savings_contributions
    WHERE user_id = :uid AND occurred_on >= :start AND occurred_on < :end
    """
)

# The join direction is the decision here. Driving from categories means a budgeted
# category with no spending this month is reported at zero rather than disappearing, and a
# category with spending but no budget is reported with a null budget rather than dropped.
_BUDGET_VS_ACTUAL = text(
    """
    SELECT c.id            AS category_id,
           c.name          AS category_name,
           b.monthly_amount AS budget,
           COALESCE(spent.total, 0) AS actual
    FROM categories c
    LEFT JOIN budgets b
           ON b.user_id = c.user_id AND b.category_id = c.id
    LEFT JOIN (
        SELECT category_id, SUM(amount) AS total
        FROM entries
        WHERE user_id = :uid AND kind = 'expense'
          AND occurred_on >= :start AND occurred_on < :end
        GROUP BY category_id
    ) spent ON spent.category_id = c.id
    WHERE c.user_id = :uid AND c.kind = 'expense'
      AND (b.monthly_amount IS NOT NULL OR spent.total IS NOT NULL)
    ORDER BY lower(c.name), c.id
    """
)

_TARGET_VS_ACTUAL = text(
    """
    SELECT s.id   AS savings_type_id,
           s.name AS savings_type_name,
           t.monthly_amount AS target,
           COALESCE(put_aside.total, 0) AS actual
    FROM savings_types s
    LEFT JOIN savings_targets t
           ON t.user_id = s.user_id AND t.savings_type_id = s.id
    LEFT JOIN (
        SELECT savings_type_id, SUM(amount) AS total
        FROM savings_contributions
        WHERE user_id = :uid AND occurred_on >= :start AND occurred_on < :end
        GROUP BY savings_type_id
    ) put_aside ON put_aside.savings_type_id = s.id
    WHERE s.user_id = :uid AND (t.monthly_amount IS NOT NULL OR put_aside.total IS NOT NULL)
    ORDER BY lower(s.name), s.id
    """
)

# generate_series is what makes an empty month a zero rather than a gap (AD-9). Filling
# gaps client-side would mean every client had to agree on how — and they would not.
_TRENDS = text(
    """
    WITH months AS (
        SELECT CAST(
            generate_series(CAST(:start AS date), CAST(:last AS date), interval '1 month')
            AS date
        ) AS m
    ),
    entry_totals AS (
        SELECT CAST(date_trunc('month', occurred_on) AS date) AS m,
               COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0)  AS income,
               COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expense
        FROM entries
        WHERE user_id = :uid AND occurred_on >= :start AND occurred_on < :end
        GROUP BY 1
    ),
    savings_totals AS (
        SELECT CAST(date_trunc('month', occurred_on) AS date) AS m,
               COALESCE(SUM(amount), 0) AS saved
        FROM savings_contributions
        WHERE user_id = :uid AND occurred_on >= :start AND occurred_on < :end
        GROUP BY 1
    )
    SELECT to_char(months.m, 'YYYY-MM')     AS month,
           COALESCE(entry_totals.income, 0)  AS income,
           COALESCE(entry_totals.expense, 0) AS expense,
           COALESCE(savings_totals.saved, 0) AS saved
    FROM months
    LEFT JOIN entry_totals   ON entry_totals.m = months.m
    LEFT JOIN savings_totals ON savings_totals.m = months.m
    ORDER BY months.m
    """
)

# One row per (category, month) for every month in the window, so each series has exactly
# as many points as there are months.
_EXPENSE_SERIES = text(
    """
    WITH months AS (
        SELECT CAST(
            generate_series(CAST(:start AS date), CAST(:last AS date), interval '1 month')
            AS date
        ) AS m
    ),
    spent AS (
        SELECT category_id,
               CAST(date_trunc('month', occurred_on) AS date) AS m,
               SUM(amount) AS total
        FROM entries
        WHERE user_id = :uid AND kind = 'expense'
          AND occurred_on >= :start AND occurred_on < :end
        GROUP BY 1, 2
    ),
    used_categories AS (
        SELECT DISTINCT c.id, c.name
        FROM categories c
        JOIN spent ON spent.category_id = c.id
    )
    SELECT used_categories.id   AS category_id,
           used_categories.name AS category_name,
           to_char(months.m, 'YYYY-MM') AS month,
           COALESCE(spent.total, 0) AS total
    FROM used_categories
    CROSS JOIN months
    LEFT JOIN spent
           ON spent.category_id = used_categories.id AND spent.m = months.m
    ORDER BY lower(used_categories.name), used_categories.id, months.m
    """
)


# AD-29. The monthly rate is SUM(amount) / SUM(quantity) — volume-weighted — never the
# average of per-entry rates: two fills of 10 l at 1.60 and 50 l at 1.40 cost 1.433/l, not
# 1.50/l. ROUND(x, 4) in Postgres rounds half away from zero, which for a positive rate is
# the same ROUND_HALF_UP the model's ``unit_price`` property uses; a test holds them equal.
# A month with nothing quantified is NULL for the rate — the one deliberate exception to
# AD-22, because 0.0000 is a price — and 0 for the quantity, because "bought nothing" is one.
_UNIT_PRICES = text(
    """
    WITH months AS (
        SELECT CAST(
            generate_series(CAST(:start AS date), CAST(:last AS date), interval '1 month')
            AS date
        ) AS m
    ),
    quantified AS (
        SELECT category_id,
               unit,
               CAST(date_trunc('month', occurred_on) AS date) AS m,
               SUM(amount)   AS spent,
               SUM(quantity) AS qty
        FROM entries
        WHERE user_id = :uid AND kind = 'expense' AND quantity IS NOT NULL
          AND occurred_on >= :start AND occurred_on < :end
        GROUP BY 1, 2, 3
    ),
    series AS (
        SELECT DISTINCT q.category_id, c.name AS category_name, q.unit
        FROM quantified q
        JOIN categories c ON c.id = q.category_id AND c.user_id = :uid
    )
    SELECT series.category_id,
           series.category_name,
           series.unit,
           to_char(months.m, 'YYYY-MM') AS month,
           CASE WHEN quantified.qty IS NULL THEN NULL
                ELSE ROUND(quantified.spent / quantified.qty, 4) END AS unit_price,
           COALESCE(quantified.qty, 0) AS quantity
    FROM series
    CROSS JOIN months
    LEFT JOIN quantified
           ON quantified.category_id = series.category_id
          AND quantified.unit = series.unit
          AND quantified.m = months.m
    ORDER BY lower(series.category_name), series.unit, series.category_id, months.m
    """
)


class Summary:
    def __init__(
        self,
        month: str,
        income: Decimal,
        expense: Decimal,
        saved: Decimal,
        budgets: list[dict],
        savings: list[dict],
    ) -> None:
        self.month = month
        self.income = income
        self.expense = expense
        self.net = income - expense
        self.saved = saved
        self.budgets = budgets
        self.savings = savings


def summary(session: Session, user_id: uuid.UUID, month: str) -> Summary:
    start, end = month_range(month)
    window = {"uid": str(user_id), "start": start, "end": end}

    totals = session.execute(_TOTALS, window).one()
    saved = session.execute(_SAVED, window).scalar_one()

    budgets = [
        {
            "category_id": row.category_id,
            "category_name": row.category_name,
            "budget": row.budget,
            "actual": row.actual,
        }
        for row in session.execute(_BUDGET_VS_ACTUAL, window)
    ]
    savings = [
        {
            "savings_type_id": row.savings_type_id,
            "savings_type_name": row.savings_type_name,
            "target": row.target,
            "actual": row.actual,
        }
        for row in session.execute(_TARGET_VS_ACTUAL, window)
    ]

    return Summary(month, totals.income, totals.expense, saved, budgets, savings)


def _window_ending_at(user_id: uuid.UUID, last_month: dt.date, months: int) -> dict:
    first = add_months(last_month, -(months - 1))
    return {
        "uid": str(user_id),
        "start": first,
        "last": last_month,
        "end": add_months(last_month, 1),
    }


def trends(
    session: Session, user_id: uuid.UUID, *, months: int, ending: str | None = None
) -> dict:
    last_month = parse_month(ending) if ending else dt.date.today().replace(day=1)
    window = _window_ending_at(user_id, last_month, months)

    rows = session.execute(_TRENDS, window).all()
    series = {
        "months": [row.month for row in rows],
        "income": [row.income for row in rows],
        "expense": [row.expense for row in rows],
        "saved": [row.saved for row in rows],
    }

    by_category: dict[uuid.UUID, dict] = {}
    for row in session.execute(_EXPENSE_SERIES, window):
        entry = by_category.setdefault(
            row.category_id,
            {"category_id": row.category_id, "category_name": row.category_name, "values": []},
        )
        entry["values"].append(row.total)

    return {
        "months": series["months"],
        "income": series["income"],
        "expense": series["expense"],
        "saved": series["saved"],
        "expense_by_category": list(by_category.values()),
    }


def unit_prices(
    session: Session, user_id: uuid.UUID, *, months: int, ending: str | None = None
) -> dict:
    last_month = parse_month(ending) if ending else dt.date.today().replace(day=1)
    window = _window_ending_at(user_id, last_month, months)

    labels = [row.month for row in session.execute(_TRENDS, window)]

    by_key: dict[tuple[uuid.UUID, str], dict] = {}
    for row in session.execute(_UNIT_PRICES, window):
        series = by_key.setdefault(
            (row.category_id, row.unit),
            {
                "category_id": row.category_id,
                "category_name": row.category_name,
                "unit": row.unit,
                "unit_price": [],
                "quantity": [],
            },
        )
        series["unit_price"].append(row.unit_price)
        series["quantity"].append(row.quantity)

    return {"months": labels, "series": list(by_key.values())}
