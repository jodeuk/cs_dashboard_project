import os
import io
import re
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import pandas as pd
from datetime import datetime
# from konlpy.tag import Okt  # 임시 제거
# from wordcloud import WordCloud  # 임시 제거
# import matplotlib.pyplot as plt  # 임시 제거
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
# okt = Okt()  # 임시 제거

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
    # 임시로 간단한 키워드 추출 (KoNLPy 대신)
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

# 4-1. 필터 옵션 제공
@app.get("/api/filter-options")
async def filter_options(start: str = Query(...), end: str = Query(...)):
    try:
        df = await get_cached_data(start, end)
        return {
            "고객유형": ["전체"] + sorted(df["고객유형"].dropna().unique().tolist()),
            "문의유형": ["전체"] + sorted(df["문의유형"].dropna().unique().tolist()),
            "서비스유형": ["전체"] + sorted(df["서비스유형"].dropna().unique().tolist()),
            "문의유형_2차": ["전체"] + sorted(df["문의유형_2차"].dropna().unique().tolist()),
            "서비스유형_2차": ["전체"] + sorted(df["서비스유형_2차"].dropna().unique().tolist()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"필터 옵션 조회 실패: {str(e)}")

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
        temp = temp.copy()
        temp["month"] = pd.to_datetime(temp["firstAskedAt"]).dt.to_period('M').astype(str)
        
        result = {"월": [], "첫응답시간": [], "평균응답시간": [], "총응답시간": [], "해결시간": []}
        months = sorted(temp["month"].dropna().unique())
        
        for m in months:
            result["월"].append(m[-2:])
            for key, label in time_keys:
                s = temp[temp["month"] == m][key].dropna().map(channel_api.hms_to_seconds)
                avg_min = (s.mean() / 60) if not s.empty else None
                result[label].append(round(avg_min, 2) if avg_min else None)
        
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
        temp = get_filtered_df(df, start, end)
        counts = temp["고객유형"].value_counts().dropna()
        
        if len(counts) > top_n:
            top = counts.iloc[:top_n]
            others = counts.iloc[top_n:].sum()
            plot_counts = pd.concat([top, pd.Series({"기타": others})])
        else:
            plot_counts = counts
        
        total = plot_counts.sum()
        data = []
        for k, v in plot_counts.items():
            percent = v / total * 100 if total else 0
            data.append({"고객유형": k, "문의량": int(v), "비율": round(percent, 1)})
        
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

# 4-6. 워드클라우드 (임시 비활성화)
@app.get("/api/wordcloud")
async def get_wordcloud(
    start: str = Query(...), end: str = Query(...),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
    # 임시로 텍스트 기반 키워드 반환
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
        return {
            "총문의수": len(df),
            "기간": f"{start} ~ {end}",
            "고객유형수": df["고객유형"].nunique(),
            "문의유형수": df["문의유형"].nunique(),
            "서비스유형수": df["서비스유형"].nunique()
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