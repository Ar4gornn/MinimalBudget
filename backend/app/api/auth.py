import uuid

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import tenant_session
from app.core.deps import AnonSession, CurrentUserId, DbSession
from app.core.ratelimit import LoginLimiter, email_key, source_key
from app.core.security import create_access_token
from app.schemas.auth import (
    Credentials,
    CurrencyUpdate,
    PasswordChange,
    PasswordConfirm,
    RecoverRequest,
    RecoveryCodesOut,
    RecoveryStatusOut,
    RefreshRequest,
    RegistrationRequest,
    TokenOut,
    UserOut,
)
from app.services import auth as auth_service
from app.services import invites as invite_service
from app.services import recovery as recovery_service
from app.services import sessions as session_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

_settings = get_settings()

# Module-level, so the counters are shared across requests. See the note in ratelimit.py
# about what in-process means for restarts and replicas.
login_limiter = LoginLimiter(
    max_attempts=_settings.login_max_attempts,
    lockout_seconds=_settings.login_lockout_minutes * 60,
)
# Its own counters: a recovery code is a credential too, and guessing one must be as
# expensive as guessing a password — without the two lockouts masking each other.
recovery_limiter = LoginLimiter(
    max_attempts=_settings.login_max_attempts,
    lockout_seconds=_settings.login_lockout_minutes * 60,
)

_RECOVERY_REFUSED = "Incorrect email or recovery code"


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest) -> auth_service.UserRow:
    settings = get_settings()

    # AD-19: the id is minted here, the transaction is pinned to it, and only then is
    # anything written. No write path runs outside row-level security.
    user_id = uuid.uuid4()
    with tenant_session(user_id) as session:
        # AD-25. Checked first so a bad code costs a SELECT rather than an Argon2 hash,
        # then consumed after the user exists, because used_by is a foreign key to users.
        # Both happen in the transaction that creates the account, so any failure below
        # rolls the invite back to unused rather than burning it.
        closed = settings.registration_mode == "invite"
        if closed:
            try:
                invite_service.verify(session, code=payload.invite_code or "")
            except invite_service.InviteRejected:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="That invite code is not valid.",
                ) from None

        try:
            created = auth_service.register(
                session,
                user_id=user_id,
                email=payload.email,
                password=payload.password,
                currency=payload.currency,
            )
        except auth_service.EmailAlreadyRegistered:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email is already registered",
            ) from None

        if closed:
            try:
                invite_service.consume(session, code=payload.invite_code or "", user_id=user_id)
            except invite_service.InviteRejected:
                # Claimed by a concurrent registration between verify and here.
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="That invite code is not valid.",
                ) from None

        return created


@router.post("/login", response_model=TokenOut)
def login(payload: Credentials, session: AnonSession, request: Request) -> TokenOut:
    keys = (email_key(payload.email), source_key(request.client.host if request.client else None))

    # AD-26: checked before the password is verified, so a locked account costs an attacker
    # a rejection rather than an Argon2 hash.
    for key in keys:
        retry_after = login_limiter.retry_after(key)
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed sign-in attempts. Try again shortly.",
                headers={"Retry-After": str(retry_after)},
            )

    user_id = auth_service.authenticate(session, email=payload.email, password=payload.password)
    if user_id is None:
        for key in keys:
            login_limiter.record_failure(key)
        # Deliberately identical for an unknown email and a wrong password.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    for key in keys:
        login_limiter.clear(key)

    token, expires_in = create_access_token(user_id)
    # A fresh family per login, so revoking one device does not sign out the others.
    with tenant_session(user_id) as tenant:
        refresh = session_service.issue(tenant, user_id=user_id)
    return TokenOut(access_token=token, expires_in=expires_in, refresh_token=refresh)


@router.post("/refresh", response_model=TokenOut)
def refresh(payload: RefreshRequest, session: AnonSession) -> TokenOut:
    try:
        lookup = session_service.look_up(session, payload.refresh_token)
    except session_service.RefreshRejected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again."
        ) from None

    # Reuse detection. A token presented after it was already rotated means a copy exists,
    # and there is no way to tell whether this caller is the thief or the victim — so both
    # are signed out and the theft becomes visible.
    if lookup.revoked:
        with tenant_session(lookup.user_id) as tenant:
            session_service.revoke_family(tenant, lookup.family_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again."
        )

    if lookup.expired:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again."
        )

    with tenant_session(lookup.user_id) as tenant:
        try:
            rotated = session_service.rotate(tenant, token=payload.refresh_token, lookup=lookup)
        except session_service.RefreshRejected:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again."
            ) from None

    token, expires_in = create_access_token(lookup.user_id)
    return TokenOut(access_token=token, expires_in=expires_in, refresh_token=rotated)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, session: AnonSession) -> Response:
    """Revoking is idempotent and never reports whether the token was real.

    An unauthenticated caller holding someone's refresh token can only revoke it, which is
    a favour to the victim, so this needs no access token of its own.
    """
    try:
        lookup = session_service.look_up(session, payload.refresh_token)
    except session_service.RefreshRejected:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    with tenant_session(lookup.user_id) as tenant:
        session_service.revoke(tenant, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/recover", status_code=status.HTTP_204_NO_CONTENT)
def recover(payload: RecoverRequest, session: AnonSession, request: Request) -> Response:
    """Forgot password. Unknown email, wrong code and used code are refused identically.

    The transaction is pinned to the id the email resolves to before the code is read
    (AD-19's registration pattern), so the code check itself runs under row-level
    security, and ``auth_set_password`` will only write that tenant's hash (AD-32).
    """
    keys = (
        "recover:" + email_key(payload.email),
        "recover:" + source_key(request.client.host if request.client else None),
    )
    for key in keys:
        retry_after = recovery_limiter.retry_after(key)
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Try again shortly.",
                headers={"Retry-After": str(retry_after)},
            )

    def refused() -> HTTPException:
        for key in keys:
            recovery_limiter.record_failure(key)
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_RECOVERY_REFUSED)

    row = session.execute(
        text("SELECT user_id FROM auth_lookup(:email)"), {"email": payload.email}
    ).one_or_none()
    if row is None:
        raise refused()
    user_id = row.user_id

    with tenant_session(user_id) as tenant:
        if not recovery_service.redeem(tenant, user_id, payload.code):
            raise refused()
        recovery_service.set_password(tenant, user_id, payload.new_password)
        session_service.revoke_all(tenant, user_id)

    for key in keys:
        recovery_limiter.clear(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _confirm_password(session, user_id: uuid.UUID, password: str) -> None:
    """403, not 401: the caller is authenticated and failing a rule about their own data."""
    profile = auth_service.read_profile(session, user_id)
    if (
        profile is None
        or auth_service.authenticate(session, email=profile.email, password=password) != user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="That password is not correct."
        )


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChange, user_id: CurrentUserId, session: DbSession
) -> Response:
    """Change a known password. Every session is revoked; the client signs in again."""
    _confirm_password(session, user_id, payload.current_password)
    recovery_service.set_password(session, user_id, payload.new_password)
    session_service.revoke_all(session, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/recovery-codes", response_model=RecoveryCodesOut)
def generate_recovery_codes(
    payload: PasswordConfirm, user_id: CurrentUserId, session: DbSession
) -> RecoveryCodesOut:
    """A fresh set of codes, shown once. Any previous set stops working."""
    _confirm_password(session, user_id, payload.password)
    return RecoveryCodesOut(codes=recovery_service.generate(session, user_id))


@router.get("/me/recovery-codes", response_model=RecoveryStatusOut)
def recovery_status(user_id: CurrentUserId, session: DbSession) -> RecoveryStatusOut:
    unused, total = recovery_service.status(session, user_id)
    return RecoveryStatusOut(unused=unused, total=total)


@router.patch("/me/currency", response_model=UserOut)
def set_currency(
    payload: CurrencyUpdate, user_id: CurrentUserId, session: DbSession
) -> auth_service.UserRow:
    try:
        return auth_service.set_currency(session, user_id, payload.currency)
    except auth_service.CurrencyLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This account already has entries. Changing the currency would relabel them "
                "rather than convert them, so it is locked."
            ),
        ) from None


@router.get("/me", response_model=UserOut)
def me(user_id: CurrentUserId, session: DbSession) -> auth_service.UserRow:
    profile = auth_service.read_profile(session, user_id)
    if profile is None:
        # A valid token for a user that no longer exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return profile
