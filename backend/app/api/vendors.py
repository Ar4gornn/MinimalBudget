import uuid

from fastapi import APIRouter, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.schemas.common import Page
from app.schemas.ledger import VendorCreate, VendorOut
from app.services import ledger

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("", response_model=Page[VendorOut])
def list_vendors(user_id: CurrentUserId, session: DbSession) -> Page[VendorOut]:
    rows = ledger.list_vendors(session, user_id)
    return Page[VendorOut](items=[VendorOut.model_validate(r) for r in rows])


@router.post("", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
def create_vendor(payload: VendorCreate, user_id: CurrentUserId, session: DbSession) -> VendorOut:
    """AD-12: idempotent by name, so a second create returns the first rather than a duplicate."""
    return VendorOut.model_validate(
        ledger.get_or_create_vendor(session, user_id, name=payload.name)
    )


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(vendor_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    ledger.delete_vendor(session, user_id, vendor_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
