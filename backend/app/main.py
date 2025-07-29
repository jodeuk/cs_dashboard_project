import os
import re
import base64
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
from datetime import datetime
from typing import Optional
import io
from pydantic import BaseModel
from .cs_utils import get_cached_data, get_filtered_df, channel_api

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

# CSAT 데이터 저장소
_csat_data = None

# ---- 2-1. Pydantic 모델 ----
class CSATFileUpload(BaseModel):
    filename: str
    file_data: str  # Base64 encoded file data
    file_type: str  # "xlsx" or "xls"

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
        access_key = os.environ.get("CHANNEL_ACCESS_KEY")
        access_secret = os.environ.get("CHANNEL_ACCESS_SECRET")
        
        if not access_key or not access_secret:
            return {
                "status": "error",
                "message": "CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET not found",
                "access_key_exists": bool(access_key),
                "access_secret_exists": bool(access_secret)
            }
        
        # API 설정 정보
        api_info = {
            "base_url": channel_api.base_url,
            "access_key_length": len(access_key),
            "access_key_prefix": access_key[:10] + "..." if len(access_key) > 10 else access_key,
            "access_secret_length": len(access_secret),
            "access_secret_prefix": access_secret[:10] + "..." if len(access_secret) > 10 else access_secret,
            "headers": {
                "x-access-key": "***",
                "x-access-secret": "***",
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
        access_key = os.environ.get("CHANNEL_ACCESS_KEY")
        access_secret = os.environ.get("CHANNEL_ACCESS_SECRET")
        if not access_key or not access_secret:
            return {"error": "CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET not found", "status": "failed"}
        
        # API 클라이언트 테스트
        test_data = await channel_api.get_userchats("2024-01-01", "2024-01-31", limit=5)
        
        return {
            "status": "success",
            "access_key_exists": bool(access_key),
            "access_secret_exists": bool(access_secret),
            "access_key_length": len(access_key) if access_key else 0,
            "access_secret_length": len(access_secret) if access_secret else 0,
            "data_count": len(test_data) if test_data else 0,
            "sample_data": test_data[:2] if test_data else [],
            "api_url": f"{channel_api.base_url}/open/v5/user-chats",
            "headers": {"x-access-key": "***", "x-access-secret": "***", "Content-Type": "application/json"}
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__,
            "access_key_exists": bool(os.environ.get("CHANNEL_ACCESS_KEY")),
            "access_secret_exists": bool(os.environ.get("CHANNEL_ACCESS_SECRET")),
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
        
        # 날짜 컬럼을 datetime으로 변환
        df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'])
        start_date = pd.to_datetime(start)
        end_date = pd.to_datetime(end)
        
        temp = get_filtered_df(df, start, end, 고객유형, 문의유형, 서비스유형)
        
        result = {}
        for key, label in time_keys:
            if key in temp.columns:
                avg_time = temp[key].mean()
                result[label] = float(avg_time) if pd.notna(avg_time) else 0.0
        
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
        
        # 날짜 컬럼을 datetime으로 변환
        df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'])
        start_date = pd.to_datetime(start)
        end_date = pd.to_datetime(end)
        
        temp = df[(df['firstAskedAt'] >= start_date) & (df['firstAskedAt'] <= end_date)]
        
        # NaN 값을 안전하게 처리
        customer_counts = temp["고객유형"].dropna().value_counts().head(top_n)
        data = []
        for customer_type, count in customer_counts.items():
            if pd.notna(customer_type):  # NaN 값 제외
                data.append({
                    "고객유형": str(customer_type),
                    "문의량": int(count)
                })
        
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"고객유형별 문의량 조회 실패: {str(e)}")

# 4-5. 워드클라우드 (키워드 분석)
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
        
        # chats 컬럼이 있는지 확인
        if "chats" not in temp.columns:
            return {
                "keywords": [],
                "message": "채팅 데이터가 없습니다."
            }
        
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

# 4-6. 데이터 통계
@app.get("/api/statistics")
async def get_statistics(start: str = Query(...), end: str = Query(...)):
    try:
        df = await get_cached_data(start, end)
        
        # 날짜 컬럼을 datetime으로 변환 (더 안전한 파싱)
        print(f"[STATISTICS] 전체 데이터 수: {len(df)}")
        print(f"[STATISTICS] firstAskedAt 샘플 값들:")
        print(df['firstAskedAt'].head().tolist())
        
        # 더 안전한 날짜 파싱
        try:
            df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'], errors='coerce')
            start_date = pd.to_datetime(start)
            end_date = pd.to_datetime(end)
            
            print(f"[STATISTICS] 시작 날짜: {start_date}")
            print(f"[STATISTICS] 종료 날짜: {end_date}")
            print(f"[STATISTICS] firstAskedAt 범위: {df['firstAskedAt'].min()} ~ {df['firstAskedAt'].max()}")
            
            temp = df[(df['firstAskedAt'] >= start_date) & (df['firstAskedAt'] <= end_date)]
            
            print(f"[STATISTICS] 필터링 후 데이터 수: {len(temp)}")
        except Exception as e:
            print(f"[STATISTICS] 날짜 파싱 오류: {e}")
            temp = df  # 날짜 필터링 실패 시 전체 데이터 사용
        
        # NaN 값을 안전하게 처리하는 함수
        def safe_mean(series):
            if series.empty or series.isna().all():
                return 0.0
            mean_val = series.mean()
            return float(mean_val) if pd.notna(mean_val) else 0.0
        
        def safe_nunique(series):
            if series.empty:
                return 0
            return int(series.nunique())
        
        return {
            "총문의수": len(temp),
            "고객유형수": safe_nunique(temp["고객유형"]) if "고객유형" in temp.columns else 0,
            "문의유형수": safe_nunique(temp["문의유형"]) if "문의유형" in temp.columns else 0,
            "서비스유형수": safe_nunique(temp["서비스유형"]) if "서비스유형" in temp.columns else 0,
            "평균첫응답시간": safe_mean(temp["operationWaitingTime"]) if "operationWaitingTime" in temp.columns else 0.0,
            "평균응답시간": safe_mean(temp["operationAvgReplyTime"]) if "operationAvgReplyTime" in temp.columns else 0.0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"통계 조회 실패: {str(e)}")

# 4-7. 원본 데이터 일부 확인
@app.get("/api/sample")
async def sample(start: str = Query(...), end: str = Query(...), n: int = 5):
    try:
        df = await get_cached_data(start, end)
        return df.sample(min(n, len(df))).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"샘플 데이터 조회 실패: {str(e)}")

# 4-8. 특정 UserChat 조회
@app.get("/api/user-chat/{userchat_id}")
async def get_user_chat(userchat_id: str):
    """특정 UserChat ID로 상세 정보를 조회합니다."""
    try:
        userchat_data = await channel_api.get_userchat_by_id(userchat_id)
        return userchat_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"UserChat 조회 실패: {str(e)}")

# 4-9. CSAT Excel 파일 업로드 (임시 비활성화)
@app.post("/api/upload-csat")
async def upload_csat_file(file_upload: CSATFileUpload):
    """CSAT Excel 파일을 Base64로 업로드하고 분석 데이터를 저장합니다."""
    global _csat_data
    
    try:
        # 파일 확장자 확인
        if file_upload.file_type not in ['xlsx', 'xls']:
            return {
                "message": "지원하지 않는 파일 형식입니다. .xlsx 또는 .xls 파일을 업로드해주세요.",
                "status": "error"
            }
        
        # Base64 디코딩
        try:
            file_content = base64.b64decode(file_upload.file_data)
        except Exception as e:
            return {
                "message": f"파일 디코딩에 실패했습니다: {str(e)}",
                "status": "error"
            }
        
        # Excel 파일 읽기
        try:
            if file_upload.file_type == 'xlsx':
                df = pd.read_excel(io.BytesIO(file_content), sheet_name=0)
            else:  # xls
                df = pd.read_excel(io.BytesIO(file_content), sheet_name=0, engine='xlrd')
        except Exception as e:
            return {
                "message": f"Excel 파일 읽기에 실패했습니다: {str(e)}",
                "status": "error"
            }
        
        # firstAskedAt 컬럼 확인
        if 'firstAskedAt' not in df.columns:
            return {
                "message": "firstAskedAt 컬럼이 없습니다. Excel 파일의 첫 번째 시트에 firstAskedAt 컬럼이 포함되어야 합니다.",
                "status": "error"
            }
        
        # NaN 값을 안전하게 처리
        df = df.fillna('')
        
        # 데이터를 딕셔너리 리스트로 변환
        _csat_data = df.to_dict(orient="records")
        
        return {
            "message": f"CSAT 데이터가 성공적으로 업로드되었습니다. 총 {len(_csat_data)}건의 데이터가 저장되었습니다.",
            "status": "success",
            "data_count": len(_csat_data),
            "columns": list(df.columns)
        }
        
    except Exception as e:
        return {
            "message": f"파일 업로드 중 오류가 발생했습니다: {str(e)}",
            "status": "error"
        }

# 4-10. CSAT 분석 데이터 조회
@app.get("/api/csat-analysis")
async def csat_analysis(
    start: str = Query(...), 
    end: str = Query(...),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
    """업로드된 CSAT 데이터를 분석합니다."""
    global _csat_data
    
    try:
        if _csat_data is None:
            return {
                "평균점수": [],
                "월별트렌드": {},
                "문항목록": [],
                "message": "CSAT 데이터가 업로드되지 않았습니다. Excel 파일을 먼저 업로드해주세요."
            }
        
        # DataFrame으로 변환
        df = pd.DataFrame(_csat_data)
        
        # 날짜 컬럼 찾기 (firstAskedAt 우선)
        if 'firstAskedAt' in df.columns:
            date_col = 'firstAskedAt'
        else:
            date_columns = [col for col in df.columns if any(keyword in col.lower() for keyword in ['날짜', 'date', '생성', 'created'])]
            if not date_columns:
                return {
                    "평균점수": [],
                    "월별트렌드": {},
                    "문항목록": [],
                    "message": "날짜 컬럼을 찾을 수 없습니다."
                }
            date_col = date_columns[0]
        
        # 날짜 형식 변환
        try:
            df[date_col] = pd.to_datetime(df[date_col])
        except:
            return {
                "평균점수": [],
                "월별트렌드": {},
                "문항목록": [],
                "message": "날짜 형식 변환에 실패했습니다."
            }
        
        # 기간 필터링
        start_date = pd.to_datetime(start)
        end_date = pd.to_datetime(end)
        filtered_df = df[(df[date_col] >= start_date) & (df[date_col] <= end_date)]
        
        if filtered_df.empty:
            return {
                "평균점수": [],
                "월별트렌드": {},
                "문항목록": [],
                "message": "선택한 기간에 데이터가 없습니다."
            }
        
        # CSAT 관련 컬럼 찾기 (A-1, A-2, A-4, A-5 우선)
        csat_score_columns = []
        csat_text_columns = []
        
        # 점수 컬럼 (A-1, A-2, A-4, A-5)
        for col in filtered_df.columns:
            if col.startswith('A-') and col in ['A-1', 'A-2', 'A-4', 'A-5']:
                if filtered_df[col].dtype in ['int64', 'float64']:
                    csat_score_columns.append(col)
        
        # 텍스트 컬럼 (A-3, A-6)
        for col in filtered_df.columns:
            if col.startswith('A-') and col in ['A-3', 'A-6']:
                csat_text_columns.append(col)
        
        if not csat_score_columns:
            return {
                "평균점수": [],
                "월별트렌드": {},
                "문항목록": [],
                "텍스트응답": [],
                "message": "CSAT 점수 컬럼을 찾을 수 없습니다."
            }
        
        # 평균 점수 계산
        csat_avg = filtered_df[csat_score_columns].mean().reset_index()
        csat_avg.columns = ["문항", "평균점수"]
        
        # 월별 트렌드 계산
        filtered_df["month"] = filtered_df[date_col].dt.to_period('M')
        trend_data = {}
        for col in csat_score_columns:
            trend_df = filtered_df.groupby("month")[col].mean().reset_index()
            trend_df["월"] = trend_df["month"].apply(lambda x: str(x)[-2:])
            trend_data[col] = trend_df[["월", col]].to_dict(orient="records")
        
        # 텍스트 응답 분석
        text_responses = {}
        for col in csat_text_columns:
            # 빈 값이 아닌 텍스트 응답만 필터링
            valid_responses = filtered_df[col].dropna()
            if len(valid_responses) > 0:
                text_responses[col] = valid_responses.tolist()
        
        return {
            "평균점수": csat_avg.to_dict(orient="records"),
            "월별트렌드": trend_data,
            "문항목록": csat_score_columns,
            "텍스트응답": text_responses
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSAT 분석 실패: {str(e)}") 