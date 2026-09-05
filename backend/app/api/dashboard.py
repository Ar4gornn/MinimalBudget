from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUserId, DbSession
from app.schemas.dashboard import SummaryOut, TrendsOut, UnitPricesOut
from app.services import dashboard

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=SummaryOut)
def summary(
    user_id: CurrentUserId,
    session: DbSession,
    month: Annotated[str, Query(description="YYYY-MM")],
) -> SummaryOut:
    return SummaryOut.model_validate(dashboard.summary(session, user_id, month))


@router.get("/trends", response_model=TrendsOut)
def trends(
    user_id: CurrentUserId,
    session: DbSession,
    months: Annotated[int, Query(ge=1, le=36)] = 6,
    ending: Annotated[str | None, Query(description="YYYY-MM, defaults to this month")] = None,
) -> TrendsOut:
    return TrendsOut.model_validate(
        dashboard.trends(session, user_id, months=months, ending=ending)
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
