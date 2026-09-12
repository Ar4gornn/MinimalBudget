from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUserId, DbSession
from app.services import export

router = APIRouter(prefix="/api/export", tags=["export"])

_KINDS = {
    "entries": export.entries_csv,
    "savings": export.savings_csv,
    "inventory": export.inventory_csv,
    "mood": export.mood_csv,
}


def _csv(rows, name: str) -> StreamingResponse:
    return StreamingResponse(
        rows,
        media_type="text/csv; charset=utf-8",
        headers={
            # attachment, so a browser saves it rather than rendering it as a page.
            "Content-Disposition": f'attachment; filename="{name}"',
            # An export is a snapshot of the moment it was asked for.
            "Cache-Control": "no-store",
        },
    )


@router.get("/entries.csv")
def entries(user_id: CurrentUserId, session: DbSession) -> StreamingResponse:
    return _csv(export.entries_csv(session, user_id), export.filename("entries"))


@router.get("/savings.csv")
def savings(user_id: CurrentUserId, session: DbSession) -> StreamingResponse:
    return _csv(export.savings_csv(session, user_id), export.filename("savings"))


@router.get("/inventory.csv")
def inventory(user_id: CurrentUserId, session: DbSession) -> StreamingResponse:
    return _csv(export.inventory_csv(session, user_id), export.filename("inventory"))


@router.get("/mood.csv")
def mood(user_id: CurrentUserId, session: DbSession) -> StreamingResponse:
    return _csv(export.mood_csv(session, user_id), export.filename("mood"))
