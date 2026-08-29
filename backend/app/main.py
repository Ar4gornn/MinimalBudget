from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth
from app.core.config import get_settings

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

app.include_router(auth.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
