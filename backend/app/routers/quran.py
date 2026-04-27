from fastapi import APIRouter
import httpx

router = APIRouter(prefix="/quran", tags=["quran"])

TEXT_API = "https://api.alquran.cloud/v1/ayah"


@router.get("/ayah/{surah}:{ayah}")
async def get_ayah(surah: int, ayah: int):
    """Proxy Quran text API to avoid CORS issues in browser."""
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{TEXT_API}/{surah}:{ayah}", timeout=10)
        return res.json()
