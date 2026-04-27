from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, users, practice

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="NoorHafiz API",
    description="AI-powered Quran memorization companion",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(practice.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "noorhafiz"}
