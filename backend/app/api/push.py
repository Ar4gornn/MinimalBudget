from fastapi import APIRouter, HTTPException, Response, status

from app.core.config import get_settings
from app.core.deps import CurrentUserId, DbSession
from app.schemas.push import PushKeyOut, PushStatusOut, SubscriptionIn, UnsubscribeIn
from app.services import push

router = APIRouter(prefix="/api/push", tags=["push"])


def _require_enabled() -> None:
    """Push is off unless the instance was given VAPID keys (AD-15: no working default)."""
    if not get_settings().push_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications are not configured on this instance.",
        )


@router.get("/status", response_model=PushStatusOut)
def push_status(user_id: CurrentUserId, session: DbSession) -> PushStatusOut:
    """Answers even when push is off, so the client can hide the toggle rather than guess."""
    settings = get_settings()
    devices = len(push.list_subscriptions(session, user_id)) if settings.push_enabled else 0
    return PushStatusOut(enabled=settings.push_enabled, devices=devices)


@router.get("/key", response_model=PushKeyOut)
def push_key() -> PushKeyOut:
    _require_enabled()
    return PushKeyOut(public_key=get_settings().vapid_public_key)


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(payload: SubscriptionIn, user_id: CurrentUserId, session: DbSession) -> Response:
    _require_enabled()
    push.subscribe(
        session,
        user_id,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(payload: UnsubscribeIn, user_id: CurrentUserId, session: DbSession) -> Response:
    """Idempotent, and works even when push is off — turning it off must always be possible."""
    push.unsubscribe(session, user_id, payload.endpoint)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
