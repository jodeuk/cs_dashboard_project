import os
import re
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
from datetime import datetime
from typing import Optional
from .cs_utils import get_cached_data, get_filtered_df, channel_api, get_events_analysis

# ---- 1. FastAPI 기본 셋업 ----
app = FastAPI(title="CS Dashboard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- 2. 설정 ----
FONT_PATH = os.environ.get("FONT_PATH", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf")

# ---- 3. Stopwords/필터 ----
stopwords = [
    "안녕하세요", "감사합니다", "네", "고맙습니다", "수고하세요", "수고하셨습니다",
    "감사", "문의", "확인", "예", "잘 부탁드립니다", "넵", "혹시", "제가", "맞습니다",
    "수 있을까요", "지금"
]

def filter_chats(chat_list):
    if not isinstance(chat_list, list):
        return []
    cleaned = []
    for text in chat_list:
        if not isinstance(text, str):
            continue
        if "@" in text or re.search(r"https?://", text) or "\n" in text:
            continue
        if any(word in text for word in stopwords):
            continue
        cleaned.append(text)
    return cleaned

def extract_keywords(text):
    # 간단한 키워드 추출 (KoNLPy 대신)
    words = text.split()
    return [word for word in words if len(word) > 1 and word.isalpha()]

# ---- 4. API 엔드포인트 ----

@app.get("/")
async def root():
    return {"message": "CS Dashboard API", "version": "1.0.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api/test")
async def test():
    return {"message": "API is working!"}

@app.get("/api/debug-channel-api")
async def debug_channel_api():
    """Channel Talk API 상세 디버깅"""
    try:
        # 환경변수 확인
        access_key = os.environ.get("CHANNEL_ACCESS_TOKEN")
        
        if not access_key:
            return {
                "status": "error",
                "message": "CHANNEL_ACCESS_TOKEN not found",
                "access_key_exists": False
            }
        
        # API 설정 정보
        api_info = {
            "base_url": channel_api.base_url,
            "access_key_length": len(access_key),
            "access_key_prefix": access_key[:10] + "..." if len(access_key) > 10 else access_key,
            "headers": {
                "Authorization": "Bearer ***",
                "Content-Type": "application/json"
            }
        }
        
        # 테스트 API 호출
        try:
            # 작은 범위로 테스트
            test_data = await channel_api.get_userchats("2024-12-01", "2024-12-31", limit=1)
            
            return {
                "status": "success",
                "api_info": api_info,
                "test_result": {
                    "data_count": len(test_data) if test_data else 0,
                    "has_data": bool(test_data),
                    "sample_item": test_data[0] if test_data else None
                }
            }
        except Exception as api_error:
            return {
                "status": "api_error",
                "api_info": api_info,
                "error": str(api_error),
                "error_type": type(api_error).__name__
            }
            
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__
        }

@app.get("/api/test-channel-api")
async def test_channel_api():
    """Channel Talk API 연결 테스트"""
    try:
        # 환경변수 확인
        access_key = os.environ.get("CHANNEL_ACCESS_TOKEN")
        if not access_key:
            return {"error": "CHANNEL_ACCESS_TOKEN not found", "status": "failed"}
        
        # API 클라이언트 테스트
        test_data = await channel_api.get_userchats("2024-01-01", "2024-01-31", limit=5)
        
        return {
            "status": "success",
            "access_key_exists": bool(access_key),
            "access_key_length": len(access_key) if access_key else 0,
            "data_count": len(test_data) if test_data else 0,
            "sample_data": test_data[:2] if test_data else [],
            "api_url": f"{channel_api.base_url}/open/v5/user-chats",
            "headers": {"Authorization": "Bearer ***", "Content-Type": "application/json"}
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__,
            "access_key_exists": bool(os.environ.get("CHANNEL_ACCESS_TOKEN")),
            "api_url": f"{channel_api.base_url}/open/v5/user-chats"
        }

# 4-1. 필터 옵션 제공
@app.get("/api/filter-options")
async def filter_options(start: str = Query(...), end: str = Query(...)):
    try:
        df = await get_cached_data(start, end)
        
        # 데이터가 비어있거나 컬럼이 없는 경우 빈 배열 반환
        if df.empty or "고객유형" not in df.columns:
            return {
                "고객유형": ["전체"],
                "문의유형": ["전체"],
                "서비스유형": ["전체"],
                "문의유형_2차": ["전체"],
                "서비스유형_2차": ["전체"],
            }
        
        return {
            "고객유형": ["전체"] + sorted(df["고객유형"].dropna().unique().tolist()),
            "문의유형": ["전체"] + sorted(df["문의유형"].dropna().unique().tolist()),
            "서비스유형": ["전체"] + sorted(df["서비스유형"].dropna().unique().tolist()),
            "문의유형_2차": ["전체"] + sorted(df["문의유형_2차"].dropna().unique().tolist()),
            "서비스유형_2차": ["전체"] + sorted(df["서비스유형_2차"].dropna().unique().tolist()),
        }
    except Exception as e:
        # 오류 발생 시에도 빈 배열 반환
        return {
            "고객유형": ["전체"],
            "문의유형": ["전체"],
            "서비스유형": ["전체"],
            "문의유형_2차": ["전체"],
            "서비스유형_2차": ["전체"],
        }

# 4-2. 기간별(월/주) 문의량
@app.get("/api/period-counts")
async def period_counts(
    start: str = Query(...), end: str = Query(...),
    date_group: str = Query("월간"),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체"),
    문의유형_2차: str = Query("전체"),
    서비스유형_2차: str = Query("전체")
):
    try:
        df = await get_cached_data(start, end)
        temp = get_filtered_df(df, start, end, 고객유형, 문의유형, 서비스유형, 문의유형_2차, 서비스유형_2차)
        
        temp = temp.copy()
        temp["month"] = pd.to_datetime(temp["firstAskedAt"]).dt.to_period('M').astype(str)
        temp["week"] = pd.to_datetime(temp["firstAskedAt"]).dt.to_period('W').astype(str)
        
        if date_group == "월간":
            out = temp.groupby("month").size().reset_index(name="문의량")
            out["x축"] = out["month"].apply(lambda x: str(x)[-2:])
        else:
            out = temp.groupby("week").size().reset_index(name="문의량")
            out["x축"] = out["week"].apply(lambda x: x[5:7])
        
        return out[["x축", "문의량"]].to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기간별 문의량 조회 실패: {str(e)}")

# 4-3. 월별 평균 시간
@app.get("/api/avg-times")
async def avg_times(
    start: str = Query(...), end: str = Query(...),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
    try:
        time_keys = [
            ("operationWaitingTime", "첫응답시간"),
            ("operationAvgReplyTime", "평균응답시간"),
            ("operationTotalReplyTime", "총응답시간"),
            ("operationResolutionTime", "해결시간")
        ]
        
        df = await get_cached_data(start, end)
        temp = get_filtered_df(df, start, end, 고객유형, 문의유형, 서비스유형)
        
        result = {}
        for key, label in time_keys:
            if key in temp.columns:
                avg_time = temp[key].mean()
                result[label] = avg_time if pd.notna(avg_time) else 0
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"평균 시간 조회 실패: {str(e)}")

# 4-4. 고객유형별 CS 문의량
@app.get("/api/customer-type-cs")
async def customer_type_cs(
    start: str = Query(...), end: str = Query(...),
    top_n: int = Query(5)
):
    try:
        df = await get_cached_data(start, end)
        temp = df[(df['firstAskedAt'] >= start) & (df['firstAskedAt'] <= end)]
        
        customer_counts = temp["고객유형"].value_counts().head(top_n)
        data = []
        for customer_type, count in customer_counts.items():
            data.append({
                "고객유형": customer_type,
                "문의량": int(count)
            })
        
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"고객유형별 문의량 조회 실패: {str(e)}")

# 4-5. CSAT 분석
@app.get("/api/csat-analysis")
async def csat_analysis(
    start: str = Query(...), end: str = Query(...),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
    try:
        df = await get_cached_data(start, end)
        temp = get_filtered_df(df, start, end, 고객유형, 문의유형, 서비스유형)
        
        # CSAT 데이터가 있는 경우에만 처리
        csat_columns = [col for col in temp.columns if col.startswith('A-')]
        
        if not csat_columns:
            return {
                "평균점수": [],
                "월별트렌드": {},
                "문항목록": []
            }
        
        # CSAT 평균 점수
        csat_avg = temp[csat_columns].mean().reset_index()
        csat_avg.columns = ["문항", "평균점수"]
        
        # 월별 CSAT 트렌드
        temp["month"] = pd.to_datetime(temp["firstAskedAt"]).dt.to_period('M').astype(str)
        trend_data = {}
        for col in csat_columns:
            trend_df = temp.groupby("month")[col].mean().reset_index()
            trend_df["월"] = trend_df["month"].apply(lambda x: str(x)[-2:])
            trend_data[col] = trend_df[["월", col]].to_dict(orient="records")
        
        return {
            "평균점수": csat_avg.to_dict(orient="records"),
            "월별트렌드": trend_data,
            "문항목록": csat_columns
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSAT 분석 실패: {str(e)}")

# 4-6. 워드클라우드 (키워드 분석)
@app.get("/api/wordcloud")
async def get_wordcloud(
    start: str = Query(...), end: str = Query(...),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
    try:
        df = await get_cached_data(start, end)
        temp = get_filtered_df(df, start, end, 고객유형, 문의유형, 서비스유형)
        temp["filtered_chats"] = temp["chats"].apply(filter_chats)
        texts = temp["filtered_chats"].dropna().apply(lambda x: " ".join(x)).astype(str)
        keyword_list = extract_keywords(" ".join(texts))
        
        # 상위 20개 키워드 반환
        from collections import Counter
        keyword_counts = Counter(keyword_list)
        top_keywords = keyword_counts.most_common(20)
        
        return {
            "keywords": [{"word": word, "count": count} for word, count in top_keywords],
            "message": "워드클라우드 이미지는 임시로 비활성화되었습니다."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"키워드 분석 실패: {str(e)}")

# 4-7. 데이터 통계
@app.get("/api/statistics")
async def get_statistics(start: str = Query(...), end: str = Query(...)):
    try:
        df = await get_cached_data(start, end)
        temp = df[(df['firstAskedAt'] >= start) & (df['firstAskedAt'] <= end)]
        
        return {
            "총문의수": len(temp),
            "고객유형수": temp["고객유형"].nunique(),
            "문의유형수": temp["문의유형"].nunique(),
            "서비스유형수": temp["서비스유형"].nunique(),
            "평균첫응답시간": temp["operationWaitingTime"].mean() if "operationWaitingTime" in temp.columns else 0,
            "평균응답시간": temp["operationAvgReplyTime"].mean() if "operationAvgReplyTime" in temp.columns else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"통계 조회 실패: {str(e)}")

# 4-8. 원본 데이터 일부 확인
@app.get("/api/sample")
async def sample(start: str = Query(...), end: str = Query(...), n: int = 5):
    try:
        df = await get_cached_data(start, end)
        return df.sample(min(n, len(df))).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"샘플 데이터 조회 실패: {str(e)}")

# 4-9. 사용자 이벤트 분석
@app.get("/api/user-events")
async def user_events_analysis(
    user_ids: str = Query(...),  # 쉼표로 구분된 사용자 ID들
    since: Optional[int] = Query(None)  # Unix timestamp (microseconds)
):
    try:
        # 쉼표로 구분된 사용자 ID를 리스트로 변환
        user_id_list = [uid.strip() for uid in user_ids.split(",") if uid.strip()]
        
        if not user_id_list:
            raise HTTPException(status_code=400, detail="사용자 ID가 필요합니다.")
        
        # 이벤트 분석 수행
        analysis_result = await get_events_analysis(user_id_list, since)
        
        return analysis_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이벤트 분석 실패: {str(e)}")

# 4-10. 단일 사용자 이벤트 조회
@app.get("/api/user-events/{user_id}")
async def get_user_events(
    user_id: str,
    since: Optional[int] = Query(None),
    limit: int = Query(25)
):
    try:
        events = await channel_api.get_user_events(user_id, since, limit)
        return events
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"사용자 이벤트 조회 실패: {str(e)}") 