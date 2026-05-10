import os
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


# ── Load local .env if present (no python-dotenv required) ───────────────
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env_path = os.path.join(_backend_dir, ".env")
if os.path.exists(_env_path):
    with open(_env_path, "r", encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            _k = _k.strip()
            # Local backend/.env is the deployment source for this app. Override
            # inherited shell values so stale API keys do not shadow edits here.
            os.environ[_k] = _v.strip().strip('"').strip("'")

from app.database import engine, Base
from app.routers import auth, users, practice, quran, recite, tts, tutor, tajweed

# Configure logging — route all noorhafiz loggers to stdout for visibility
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logging.getLogger("noorhafiz").setLevel(logging.DEBUG)

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="NoorHafiz API",
    description="AI-powered Quran memorization companion",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(practice.router)
app.include_router(quran.router)
app.include_router(recite.router)
app.include_router(tts.router)
app.include_router(tutor.router)
app.include_router(tajweed.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "noorhafiz"}
