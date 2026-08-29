import uuid

from fastapi import APIRouter, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.models.ledger import EntryKind
from app.schemas.common import Page
from app.schemas.ledger import CategoryCreate, CategoryOut
from app.services import ledger

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=Page[CategoryOut])
def list_categories(
    user_id: CurrentUserId,
    session: DbSession,
    kind: EntryKind | None = None,
) -> Page[CategoryOut]:
    rows = ledger.list_categories(session, user_id, kind=kind)
    return Page[CategoryOut](items=[CategoryOut.model_validate(r) for r in rows])


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate, user_id: CurrentUserId, session: DbSession
) -> CategoryOut:
    # AD-12: idempotent. Asking twice for the same name is not an error, it is the
    # same category — which is what makes the create-by-name path on entries safe.
    category = ledger.get_or_create_category(
        session, user_id, kind=payload.kind, name=payload.name
    )
    return CategoryOut.model_validate(category)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> Response:
    ledger.delete_category(session, user_id, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
