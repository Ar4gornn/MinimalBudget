import uuid

from fastapi import APIRouter, HTTPException, status

from app.core.db import tenant_session
from app.core.deps import AnonSession, CurrentUserId, DbSession
from app.core.security import create_access_token
from app.schemas.auth import Credentials, TokenOut, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: Credentials) -> auth_service.UserRow:
    # AD-19: the id is minted here, the transaction is pinned to it, and only then is
    # anything written. No write path runs outside row-level security.
    user_id = uuid.uuid4()
    with tenant_session(user_id) as session:
        try:
            return auth_service.register(
                session, user_id=user_id, email=payload.email, password=payload.password
            )
        except auth_service.EmailAlreadyRegistered:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email is already registered",
            ) from None


@router.post("/login", response_model=TokenOut)
def login(payload: Credentials, session: AnonSession) -> TokenOut:
    user_id = auth_service.authenticate(session, email=payload.email, password=payload.password)
    if user_id is None:
        # Deliberately identical for an unknown email and a wrong password.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token, expires_in = create_access_token(user_id)
    return TokenOut(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=UserOut)
def me(user_id: CurrentUserId, session: DbSession) -> auth_service.UserRow:
    profile = auth_service.read_profile(session, user_id)
    if profile is None:
        # A valid token for a user that no longer exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return profile
