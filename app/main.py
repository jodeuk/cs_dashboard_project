
from fastapi import Body
from app.cs_utils import upsert_csat_row, load_csat_rows

# 단일 로우 업서트 (그 줄만 저장)
@app.post("/api/csat/upsert-row")
async def api_csat_upsert_row(payload: dict = Body(...)):
    """
    payload 예시:
    {
      "firstAskedAt": "2025-08-07 11:02:07",
      "lastSubmittedAt": "2025-08-07 16:47:45",
      "userId": "681ab9d97c36a6b26638",
      "userChatId": "68936d2891e5f37029ae",
      "A-1": 4, "A-2": 3, "A-3": "넵", "A-4": 4, "A-5": 4, "A-6": "넵"
    }
    """
    try:
        ok = upsert_csat_row(payload)
        if not ok:
            raise HTTPException(status_code=400, detail="업서트 실패")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"업서트 중 오류: {e}")

# 기간 로드 (그대로 반환)
@app.get("/api/csat/rows")
async def api_csat_rows(start: str = Query(...), end: str = Query(...)):
    try:
        end = limit_end_date(end)
        df = load_csat_rows(start, end)
        return [] if df.empty else df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSAT 로드 실패: {e}")

