from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import CurrentUserId, get_session
from app.services import export

router = APIRouter(prefix="/api/export", tags=["export"])

# The one place the session must outlive the path function. Every other route gets
# ``DbSession``, whose commit runs before the response is sent (``scope="function"``); an
# export streams its rows *while* the response is being sent, from a generator the path
# function only creates. Closed early, the session loses its tenant setting with the
# transaction and every RLS-filtered read answers zero rows — a file with a header and no
# body, which is the silent partial export AD-4 exists to forbid. Request scope keeps the
# transaction open until the last chunk has gone out. Nothing here writes, so there is
# nothing for the late commit to lose.
StreamSession = Annotated[Session, Depends(get_session, scope="request")]

_KINDS = {
    "entries": export.entries_csv,
    "savings": export.savings_csv,
    "inventory": export.inventory_csv,
    "mood": export.mood_csv,
    "books": export.books_csv,
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
def entries(user_id: CurrentUserId, session: StreamSession) -> StreamingResponse:
    return _csv(export.entries_csv(session, user_id), export.filename("entries"))


@router.get("/savings.csv")
def savings(user_id: CurrentUserId, session: StreamSession) -> StreamingResponse:
    return _csv(export.savings_csv(session, user_id), export.filename("savings"))


@router.get("/inventory.csv")
def inventory(user_id: CurrentUserId, session: StreamSession) -> StreamingResponse:
    return _csv(export.inventory_csv(session, user_id), export.filename("inventory"))


@router.get("/mood.csv")
def mood(user_id: CurrentUserId, session: StreamSession) -> StreamingResponse:
    return _csv(export.mood_csv(session, user_id), export.filename("mood"))


@router.get("/books.csv")
def books(user_id: CurrentUserId, session: StreamSession) -> StreamingResponse:
    return _csv(export.books_csv(session, user_id), export.filename("books"))
