import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, users, practice, quran, recite, tts

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


@app.get("/health")
def health():
    return {"status": "ok", "service": "noorhafiz"}
