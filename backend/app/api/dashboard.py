import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUserId, DbSession, StartDay
from app.core.months import Period
from app.schemas.dashboard import SummaryOut, TrendsOut, UnitPricesOut, VendorPricesOut
from app.services import dashboard

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=SummaryOut)
def summary(
    user_id: CurrentUserId,
    session: DbSession,
    month: Annotated[str, Query(description="YYYY-MM; the anchor, also for a year")],
    start_day: StartDay = 1,
    period: Annotated[Period, Query(description="month, year or all")] = Period.month,
) -> SummaryOut:
    """The four headline figures over a month, a year, or everything.

    ``month`` stays the anchor for all three: a year takes its year part, and all-time
    ignores it. Budget-vs-actual is monthly only — see the service for why.
    """
    return SummaryOut.model_validate(
        dashboard.summary(session, user_id, month, start_day, period)
    )


@router.get("/trends", response_model=TrendsOut)
def trends(
    user_id: CurrentUserId,
    session: DbSession,
    months: Annotated[int, Query(ge=1, le=36)] = 6,
    ending: Annotated[str | None, Query(description="YYYY-MM, defaults to this month")] = None,
    start_day: StartDay = 1,
) -> TrendsOut:
    return TrendsOut.model_validate(
        dashboard.trends(session, user_id, months=months, ending=ending, start_day=start_day)
    )


@router.get("/unit-prices", response_model=UnitPricesOut)
def unit_prices(
    user_id: CurrentUserId,
    session: DbSession,
    months: Annotated[int, Query(ge=1, le=36)] = 6,
    ending: Annotated[str | None, Query(description="YYYY-MM, defaults to this month")] = None,
) -> UnitPricesOut:
    """AD-29: one series per (category, unit), volume-weighted, null where nothing was bought."""
    return UnitPricesOut.model_validate(
        dashboard.unit_prices(session, user_id, months=months, ending=ending)
    )


@router.get("/vendor-prices", response_model=VendorPricesOut)
def vendor_prices(
    user_id: CurrentUserId,
    session: DbSession,
    category_id: uuid.UUID,
    months: Annotated[int, Query(ge=1, le=36)] = 6,
    ending: Annotated[str | None, Query(description="YYYY-MM, defaults to this month")] = None,
    start_day: StartDay = 1,
) -> VendorPricesOut:
    """Is one shop dearer than another, for this category? The reason vendors exist."""
    return VendorPricesOut.model_validate(
        dashboard.vendor_prices(
            session,
            user_id,
            category_id=category_id,
            months=months,
            ending=ending,
            start_day=start_day,
        )
    )
