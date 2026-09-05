from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    auth,
    budgets,
    categories,
    dashboard,
    entries,
    export,
    gym,
    inventory,
    push,
    recurring,
    savings,
    vendors,
)
from app.core.config import get_settings
from app.core.errors import Conflict, Invalid, NotFound
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
@app.exception_handler(NotFound)
def _not_found(_: Request, exc: NotFound) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": exc.detail})


@app.exception_handler(Conflict)
def _conflict(_: Request, exc: Conflict) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": exc.detail})


@app.exception_handler(Invalid)
def _invalid(_: Request, exc: Invalid) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": exc.detail}
    )


@app.exception_handler(InvalidMonth)
def _invalid_month(_: Request, exc: InvalidMonth) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": str(exc)}
    )


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


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
