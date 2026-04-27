from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import httpx

router = APIRouter(prefix="/quran", tags=["quran"])

TEXT_API = "https://api.alquran.cloud/v1/ayah"
AUDIO_BASE = "https://everyayah.com/data"


@router.get("/ayah/{surah}:{ayah}")
async def get_ayah(surah: int, ayah: int):
    """Proxy Quran text API to avoid CORS issues in browser."""
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{TEXT_API}/{surah}:{ayah}", timeout=10)
        return res.json()


@router.get("/audio/{reciter}/{surah_ayah}")
async def get_audio(reciter: str, surah_ayah: str):
    """Proxy Quran audio to avoid CORS/connection issues in browser."""
    url = f"{AUDIO_BASE}/{reciter}/{surah_ayah}.mp3"
    async with httpx.AsyncClient() as client:
        res = await client.get(url, timeout=15, follow_redirects=True)
        return StreamingResponse(
            iter([res.content]),
            media_type="audio/mpeg",
            headers={
                "Content-Length": str(len(res.content)),
                "Cache-Control": "public, max-age=86400",
            },
        )
