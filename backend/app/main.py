from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import (
    auth,
    budgets,
    categories,
    dashboard,
    entries,
    export,
    gym,
    habits,
    inventory,
    mood,
    push,
    recipes,
    recurring,
    savings,
    vendors,
)
from app.core.config import get_settings
from app.core.errors import Conflict, DomainError, Invalid, NotFound
from app.core.months import InvalidMonth

settings = get_settings()

app = FastAPI(
    title="MinimalBudget",
    version="0.1.0",
    description="Personal finance tracker. Per-user isolation is enforced by Postgres RLS.",
)

# AD-14/AD-15: the client is a separate static build on another origin, and which origins
# are allowed is configuration, not code.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


# Domain errors become status codes in exactly one place, so no router can invent its own
# mapping — and in particular, so nothing can accidentally answer 403 where AD-8 requires 404.
#
# Every body carries `code` beside `detail` (AD-44). `detail` stays an English sentence and
# is the fallback; `code` is what a client keys its own wording off, so a French screen
# never has to render the server's English. The API itself stays language-neutral (AD-14).
def _body(exc: DomainError) -> dict[str, str]:
    return {"detail": exc.detail, "code": exc.code}


@app.exception_handler(NotFound)
def _not_found(_: Request, exc: NotFound) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=_body(exc))


@app.exception_handler(Conflict)
def _conflict(_: Request, exc: Conflict) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=_body(exc))


@app.exception_handler(Invalid)
def _invalid(_: Request, exc: Invalid) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content=_body(exc))


@app.exception_handler(InvalidMonth)
def _invalid_month(_: Request, exc: InvalidMonth) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": str(exc), "code": "month_invalid"},
    )


@app.exception_handler(StarletteHTTPException)
def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Flatten the ``{"detail": ..., "code": ...}`` detail that ``errors.refused`` builds.

    Without this, FastAPI would nest it as ``{"detail": {"detail": ..., "code": ...}}`` and
    every existing caller reading ``["detail"]`` as a string would break. A plain string
    detail — anything raising ``HTTPException`` the ordinary way, including FastAPI's own
    404 for an unknown route — is wrapped the way FastAPI would have wrapped it.
    """
    detail = exc.detail
    content = (
        detail
        if isinstance(detail, dict) and "detail" in detail
        else {"detail": detail, "code": "error"}
    )
    return JSONResponse(
        status_code=exc.status_code, content=content, headers=getattr(exc, "headers", None)
    )


@app.exception_handler(RequestValidationError)
def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    """FastAPI's own 422, with a code added beside its list of field errors (AD-44).

    Without this the one family of errors the API returns *without* a code was the one a
    typo produces most often — and the client, having nothing to key off, fell back to
    rendering pydantic's English ("Input should be greater than or equal to 2") in whatever
    language the reader had chosen. `detail` keeps exactly the shape and content FastAPI
    would have sent, so nothing that reads it breaks; `code` is added, not substituted.
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": jsonable_encoder(exc.errors()), "code": "validation"},
    )


# FastAPI registers its own handler for its subclass, which would win over the Starlette
# one above; pointing both at the same function keeps one behaviour for both.
app.add_exception_handler(FastAPIHTTPException, _http_error)


app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(entries.router)
app.include_router(savings.router)
app.include_router(budgets.router)
app.include_router(dashboard.router)
app.include_router(inventory.router)
app.include_router(recurring.router)
app.include_router(export.router)
app.include_router(vendors.router)
app.include_router(push.router)
app.include_router(gym.router)
app.include_router(habits.router)
app.include_router(mood.router)
app.include_router(recipes.router)
app.include_router(recipes.foods_router)
app.include_router(recipes.meals_router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
