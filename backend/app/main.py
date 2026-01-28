import os
import re
import base64
import asyncio
import math
import numpy as np
import json
import logging
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks, Header, Depends, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
from datetime import datetime
from typing import Optional, List, Any
import io
from pydantic import BaseModel
from app.cs_utils import (
    get_cached_data, 
    channel_api, 
    server_cache,
    build_and_cache_csat_rows,
    load_csat_rows_from_cache,
    enrich_csat_with_user_types,
    build_csat_type_scores,
    get_filtered_df
)
from app.db.json_db import load_json_db, save_json_db, file_lock, DEFAULT_DB_PATH

LOG = logging.getLogger("uvicorn.error")

# 파일 저장 경로 설정: CLOUD_CUSTOMERS_FILE 우선, 없으면 기존 파일 확인 후 기본값
if not os.environ.get("CLOUD_CUSTOMERS_FILE") and not os.environ.get("JSON_DB_FILE"):
    # 기존 파일이 있는지 확인 (backend/app/cloud_customers.json 우선)
    legacy_path = os.path.join(os.path.dirname(__file__), "cloud_customers.json")
    if os.path.exists(legacy_path):
        os.environ.setdefault("JSON_DB_FILE", legacy_path)
    else:
        os.environ.setdefault("JSON_DB_FILE", "/tmp/cloud_customers.json")


def _get_refund_db_path() -> str:
    env_path = os.environ.get("REFUND_CUSTOMERS_FILE")
    if env_path:
        return env_path
    base_dir = os.path.dirname(DEFAULT_DB_PATH) if DEFAULT_DB_PATH else ""
    if not base_dir:
        base_dir = "/tmp"
    return os.path.join(base_dir, "refund_customers.json")


def _get_crm_db_path() -> str:
    """
    CRM 고객(기관) 정보를 저장할 JSON 파일 경로를 반환.
    환경변수 CRM_CUSTOMERS_FILE 이 우선, 없으면 cloud/refund 와 동일한 디렉토리에 저장.
    """
    env_path = os.environ.get("CRM_CUSTOMERS_FILE")
    if env_path:
        return env_path
    base_dir = os.path.dirname(DEFAULT_DB_PATH) if DEFAULT_DB_PATH else ""
    if not base_dir:
        base_dir = "/tmp"
    return os.path.join(base_dir, "crm_customers.json")


REFUND_DB_PATH = _get_refund_db_path()
CRM_DB_PATH = _get_crm_db_path()

def _clean_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()

# ---- 유틸 함수 ----
def _iso_millis(series):
    s = pd.to_datetime(series, errors="coerce")
    return s.dt.strftime("%Y-%m-%dT%H:%M:%S.%f").str.slice(0, 23)

# ---- 필터 유틸 ----
def _norm(v: Optional[str]) -> str:
    return (str(v or "").strip().lower())

def _parse_values(val) -> list[str]:
    """
    쿼리로 들어온 값(단일/CSV/배열)을 ['a','b'] 형태로 표준화.
    '전체' 또는 빈값이면 [] 반환하여 '필터 미적용' 의미.
    """
    if val is None:
        return []
    if isinstance(val, (list, tuple)):
        candidates = val
    else:
        # "a,b , c" → ["a","b","c"]
        candidates = [x for x in str(val).split(",")]
    out = [x.strip() for x in candidates if x is not None and str(x).strip()]
    out = [x for x in out if _norm(x) != _norm("전체")]
    return out

# ---- 1. FastAPI 기본 셋업 ----
app = FastAPI(title="CS Dashboard API", version="1.1.0")

# 타임아웃 설정 - TimeoutMiddleware는 존재하지 않으므로 제거
# from fastapi import Request
# from fastapi.middleware.timeout import TimeoutMiddleware
# app.add_middleware(TimeoutMiddleware, timeout=300)  # 5분 타임아웃

# CORS 설정 강화 - 정확한 오리진 나열
ALLOWED_ORIGINS = [
    "http://61.107.201.48:8080",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",  # React 개발 서버
    "http://127.0.0.1:3000",  # React 개발 서버
    "http://localhost:3001",  # 추가 포트
    "http://127.0.0.1:3001",  # 추가 포트
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,   # "*" 대신 명시적 오리진 나열
    allow_credentials=False,         # 쿠키 안 쓰면 False가 안전
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],            # 에러 응답에도 헤더 노출
    max_age=86400,                   # 24시간 캐시
)

# ---- 2. 설정 ----
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "supersecret")  # 기본값 supersecret

# ---- 2-1. 날짜 제한 함수 ----
def limit_end_date(end_date_str: str) -> str:
    today_str = datetime.today().strftime("%Y-%m-%d")
    if end_date_str > today_str:
        return today_str
    return end_date_str

# ---- 2-2. 관리자 토큰 검증 ----
def admin_guard(x_admin_token: str = Header(None)):
    expected = os.getenv("ADMIN_TOKEN")
    if not expected or x_admin_token != expected:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return True

# ---- 2-3. NaN/Inf sanitize 유틸 ----
def _sanitize_json(o):
    # float / numpy float -> 0.0 for NaN/Inf
    if isinstance(o, float):
        if math.isnan(o) or math.isinf(o): return 0.0
        return float(o)
    if isinstance(o, (np.floating,)):
        v = float(o)
        return 0.0 if (math.isnan(v) or math.isinf(v)) else v
    # numpy int -> int
    if isinstance(o, (np.integer,)):
        return int(o)
    # 컨테이너 순회
    if isinstance(o, dict):
        return {k: _sanitize_json(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_sanitize_json(v) for v in o]
    return o

# ---- 2-1. Pydantic 모델 ----
# CSAT 업로드 관련 모델 제거됨

# ---- 3. 헬스체크 ----
@app.get("/")
async def root():
    return {"message": "CS Dashboard API", "version": "1.1.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api/health")
async def api_health():
    return {"status": "healthy", "api": True}

# ---- 4. 캐시 상태/관리 ----
@app.get("/api/cache/status")
async def cache_status():
    try:
        cache_dir = server_cache.cache_dir
        if not os.path.exists(cache_dir):
            return {
                "cache_enabled": True,
                "cache_dir": cache_dir,
                "cache_files": 0,
                "total_size_mb": 0,
                "message": "캐시 디렉토리가 없습니다."
            }
        cache_files = []
        total_size = 0
        for filename in os.listdir(cache_dir):
            if filename.endswith('.pkl'):
                p = os.path.join(cache_dir, filename)
                sz = os.path.getsize(p)
                cache_files.append({
                    "filename": filename,
                    "size_mb": round(sz/1024/1024, 2),
                    "modified": datetime.fromtimestamp(os.path.getmtime(p)).isoformat()
                })
                total_size += sz
        return {
            "cache_enabled": True,
            "cache_dir": cache_dir,
            "cache_files": len(cache_files),
            "total_size_mb": round(total_size/1024/1024, 2),
            "files": cache_files
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 상태 조회 실패: {str(e)}")

@app.delete("/api/cache/clear")
async def clear_cache():
    try:
        ok = server_cache.clear_all_cache()
        if ok:
            return {"message": "전체 캐시 삭제 완료"}
        raise HTTPException(status_code=500, detail="캐시 삭제 실패")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 삭제 실패: {str(e)}")

@app.get("/api/cache/check-firstasked")
async def check_cache_firstasked():
    """캐시에 firstAskedAt이 없는 데이터가 있는지 확인"""
    try:
        import pandas as pd
        cache_dir = server_cache.cache_dir
        
        # 캐시 디렉토리 확인
        if not os.path.exists(cache_dir):
            return {
                "error": f"캐시 디렉토리가 없습니다: {cache_dir}",
                "cache_dir": cache_dir,
                "files_checked": 0,
                "results": []
            }
        
        try:
            cache_files = [f for f in os.listdir(cache_dir) if f.startswith("userchats_") and f.endswith(".pkl")]
        except Exception as e:
            return {
                "error": f"캐시 디렉토리 읽기 실패: {str(e)}",
                "cache_dir": cache_dir,
                "files_checked": 0,
                "results": []
            }
        
        results = []
        for cache_file in sorted(cache_files):
            cache_path = os.path.join(cache_dir, cache_file)
            try:
                df = pd.read_pickle(cache_path)
                
                if df.empty:
                    results.append({
                        "file": cache_file,
                        "error": "빈 DataFrame"
                    })
                    continue
                
                if 'firstAskedAt' not in df.columns or 'createdAt' not in df.columns:
                    results.append({
                        "file": cache_file,
                        "error": "필수 컬럼이 없습니다",
                        "columns": list(df.columns) if 'firstAskedAt' not in df.columns else None
                    })
                    continue
                
                # firstAskedAt이 NaN인 행
                first_na = df['firstAskedAt'].isna()
                first_na_count = int(first_na.sum())
                
                # createdAt은 있지만 firstAskedAt이 없는 행
                created_not_na = df['createdAt'].notna()
                both_condition = first_na & created_not_na
                both_count = int(both_condition.sum())
                
                # direction 분포
                direction_counts = {}
                if 'direction' in df.columns:
                    direction_counts = {str(k): int(v) for k, v in df['direction'].value_counts().to_dict().items()}
                
                # phone 데이터 통계
                phone_stats = {}
                if 'mediumType' in df.columns:
                    phone_df = df[df['mediumType'] == 'phone']
                    if len(phone_df) > 0:
                        phone_first_na = phone_df['firstAskedAt'].isna()
                        phone_created_not_na = phone_df['createdAt'].notna()
                        phone_both = phone_first_na & phone_created_not_na
                        phone_both_count = int(phone_both.sum())
                        
                        phone_direction = {}
                        if 'direction' in phone_df.columns:
                            phone_direction = {str(k): int(v) for k, v in phone_df['direction'].value_counts().to_dict().items()}
                        
                        # 샘플 데이터
                        samples = []
                        if phone_both_count > 0:
                            phone_sample = phone_df[phone_both].head(3)
                            for idx, row in phone_sample.iterrows():
                                first_val = row.get('firstAskedAt')
                                created_val = row.get('createdAt')
                                samples.append({
                                    "userId": str(row.get('userId', 'N/A')),
                                    "direction": str(row.get('direction', 'N/A')),
                                    "firstAskedAt": str(first_val) if pd.notna(first_val) else None,
                                    "createdAt": str(created_val) if pd.notna(created_val) else None,
                                })
                        
                        phone_stats = {
                            "total": int(len(phone_df)),
                            "firstAskedAt_na_but_createdAt_exists": phone_both_count,
                            "direction_distribution": phone_direction,
                            "samples": samples
                        }
                
                results.append({
                    "file": cache_file,
                    "total_rows": int(len(df)),
                    "firstAskedAt_na_count": first_na_count,
                    "firstAskedAt_na_percent": round(first_na_count / len(df) * 100, 2) if len(df) > 0 else 0,
                    "createdAt_exists_but_firstAskedAt_na": both_count,
                    "direction_distribution": direction_counts,
                    "phone_stats": phone_stats
                })
            except Exception as e:
                import traceback
                error_detail = f"{str(e)}\n{traceback.format_exc()}"
                results.append({
                    "file": cache_file,
                    "error": str(e),
                    "error_detail": error_detail
                })
        
        return {
            "cache_dir": cache_dir,
            "files_checked": len(cache_files),
            "results": results
        }
    except Exception as e:
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=f"캐시 확인 실패: {error_detail}")

# ---- 4-1. 전구간 재수집 작업 본체 ----
async def _rebuild_all_cache_task(start: str, end: str):
    """관리자 전용: 전체 캐시 삭제 후 전구간 재수집"""
    try:
        # 1) 전체 캐시 삭제
        ok = server_cache.clear_all_cache()
        print(f"[ADMIN] clear_all_cache: {ok}")

        # 2) 전구간 재수집 (월별 저장 + openedAt/closedAt 포함 + CSAT 캐시도 함께)
        #    get_cached_data(refresh_mode='refresh')는 월별로 API 수집하며 캐시에 저장함
        df = await get_cached_data(start, end, refresh_mode="refresh")
        print(f"[ADMIN] userchats rebuild finished. rows={len(df)}")

        # 3) CSAT 캐시도 함께 재수집
        csat_saved = await build_and_cache_csat_rows(start, end)
        print(f"[ADMIN] CSAT rebuild finished. rows={csat_saved}")

        print(f"[ADMIN] 전체 재빌드 완료: userchats={len(df)}, csat={csat_saved}")
        return {"userchats_rows": len(df), "csat_rows": csat_saved}
    except Exception as e:
        print(f"[ADMIN] 재빌드 작업 실패: {e}")
        raise e

# === 기존: 캐시 새로고침 (API 호출 없이 캐시만 재로딩) + 확장: include_csat 파라미터 ===
@app.get("/api/cache/refresh")
async def refresh_cache(
    start: str = Query(...),
    end: str = Query(...),
    include_csat: bool = Query(False),
    force: bool = Query(False)
):
    """
    force=false: 캐시만 로드(원격 API 호출 없음)  ← 기본
    force=true: userchats를 강제 새로고침(API 호출) + include_csat=True일 때 CSAT도 함께 수집/저장
    """
    try:
        end = limit_end_date(end)
        if not force:
            df = await get_cached_data(start, end, refresh_mode="cache")
            if include_csat:
                _ = load_csat_rows_from_cache(start, end)
            return {"message": "캐시 새로고침 완료(원격 호출 없음)", "data_count": len(df)}
        else:
            df = await get_cached_data(start, end, refresh_mode="refresh")
            csat_saved = 0
            if include_csat:
                # CSAT 최신화: 가장 최근 캐시된 날짜부터 오늘까지 자동으로 처리
                try:
                    from datetime import datetime
                    today = datetime.now().strftime("%Y-%m-%d")
                    
                    # 현재 캐시된 CSAT 데이터의 가장 최근 날짜 찾기
                    csat_cache_months = []
                    cache_dir = server_cache.cache_dir
                    if os.path.exists(cache_dir):
                        for filename in os.listdir(cache_dir):
                            if filename.startswith("csat_") and filename.endswith(".pkl"):
                                month = filename.replace("csat_", "").replace(".pkl", "")
                                csat_cache_months.append(month)
                    
                    if csat_cache_months:
                        # 가장 최근 캐시된 월 찾기
                        csat_cache_months.sort()
                        latest_month = csat_cache_months[-1]
                        print(f"[CSAT] 가장 최근 캐시된 월: {latest_month}")
                        
                        # 해당 월의 마지막 날부터 오늘까지 CSAT 최신화
                        if latest_month:
                            # 월의 마지막 날 계산 (예: 2025-08 -> 2025-08-31)
                            year, month = latest_month.split("-")
                            last_day = pd.Timestamp(year=int(year), month=int(month), day=1) + pd.offsets.MonthEnd(1)
                            latest_cached_date = last_day.strftime("%Y-%m-%d")
                            
                            print(f"[CSAT] CSAT 최신화 범위: {latest_cached_date} ~ {today}")
                            csat_saved = await build_and_cache_csat_rows(latest_cached_date, today)
                        else:
                            csat_saved = await build_and_cache_csat_rows(start, end)
                    else:
                        # CSAT 캐시가 없으면 전체 범위로
                        print(f"[CSAT] CSAT 캐시 없음, 전체 범위로 최신화: {start} ~ {end}")
                        csat_saved = await build_and_cache_csat_rows(start, end)
                        
                except Exception as e:
                    print(f"[CSAT] 자동 범위 계산 실패, 기본 범위 사용: {e}")
                    csat_saved = await build_and_cache_csat_rows(start, end)
                    
        return {
                "message": "강제 새로고침 완료(원격 호출 포함)",
                "userchats_rows": len(df),
                "csat_rows_saved": csat_saved
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 새로고침 실패: {str(e)}")

# ---- 5. 데이터 조회 (모두 캐시 우선/전용) ----

# 5-1. 필터 옵션
@app.get("/api/filter-options")
async def filter_options(
    start: str = Query(...), 
    end: str = Query(...), 
    refresh_mode: str = Query("cache"),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
    """
    1차/2차 옵션을 캐시에서만 생성.
    - 1차: *_1차 컬럼 사용
    - 2차: 선택된 1차로 DF를 먼저 좁힌 뒤 *_2차 고유값 반환
    """
    try:
        # 기간과 무관하게, 옵션은 전체 캐시 기반으로 생성
        df = await get_cached_data("2025-04-01", "2025-12-31", refresh_mode="cache")
        if df is None or df.empty:
            return {
                "고객유형": ["전체"], "문의유형": ["전체"], "서비스유형": ["전체"],
                "고객유형_2차": ["전체"], "문의유형_2차": ["전체"], "서비스유형_2차": ["전체"],
            }

        # 안전 정규화 유틸
        def norm_series(s):
            return (s.astype(str)
                     .str.strip()
                     .replace({"None": "", "nan": ""}))

        # 실제 사용할 컬럼 매핑 (cs_utils.process_userchat_data에서 생성됨)
        COLS = {
            "고객유형": ("고객유형_1차", "고객유형_2차"),
            "문의유형": ("문의유형_1차", "문의유형_2차"),
            "서비스유형": ("서비스유형_1차", "서비스유형_2차"),
        }

        # 없으면 만들어두기
        for p, (c1, c2) in COLS.items():
            if c1 not in df.columns: df[c1] = None
            if c2 not in df.columns: df[c2] = None
            df[c1] = norm_series(df[c1])
            df[c2] = norm_series(df[c2])

        # 1차 옵션 뽑기
        def primary_opts(col1):
            vals = df[col1].dropna()
            vals = [v for v in vals if v]
            return ["전체"] + sorted(set(vals))

        # 2차 옵션 뽑기
        def secondary_opts(col2):
            vals = df[col2].dropna()
            vals = [v for v in vals if v]
            return ["전체"] + sorted(set(vals))

        result = {
            "고객유형": primary_opts(COLS["고객유형"][0]),
            "문의유형": primary_opts(COLS["문의유형"][0]),
            "서비스유형": primary_opts(COLS["서비스유형"][0]),
            # 2차 풀리스트도 유지
            "고객유형_2차": secondary_opts(COLS["고객유형"][1]),
            "문의유형_2차": secondary_opts(COLS["문의유형"][1]),
            "서비스유형_2차": secondary_opts(COLS["서비스유형"][1]),
        }

        # ✅ [추가] subtype_maps 통합 생성
        def _build_map(df, p, c):
            return (
                df[[p, c]].dropna()
                  .groupby(p)[c].unique()
                  .apply(lambda xs: sorted(set([x for x in xs.tolist() if str(x).strip()])))
                  .to_dict()
            )

        subtype_maps = {
            "inquiry":  {k: ['전체'] + v for k, v in _build_map(df, '문의유형_1차',  '문의유형_2차').items()},
            "service":  {k: ['전체'] + v for k, v in _build_map(df, '서비스유형_1차',  '서비스유형_2차').items()},
            "customer": {k: ['전체'] + v for k, v in _build_map(df, '고객유형_1차', '고객유형_2차').items()},
        }

        result.update({
            "subtype_maps": subtype_maps,  # [ADD] 통합 맵
        })

        return result

    except Exception:
        # 문제가 나도 UI가 깨지지 않도록 기본값 반환
        return {
            "고객유형": ["전체"], "문의유형": ["전체"], "서비스유형": ["전체"],
            "고객유형_2차": ["전체"], "문의유형_2차": ["전체"], "서비스유형_2차": ["전체"],
        }

# 5-2. 기간 상세(프론트 집계용)
@app.get("/api/userchats")
async def userchats(start: str = Query(...), end: str = Query(...), force_refresh: bool = Query(False)):
    try:
        end = limit_end_date(end)
        refresh_mode = "refresh" if force_refresh else "cache"
        df = await get_cached_data(start, end, refresh_mode=refresh_mode)
        if df.empty:
            return []
        # get_cached_data에서 이미 기간 필터 완료 → 그대로 반환
        # firstAskedAt이 없어도 createdAt이 있으면 포함 (OB 데이터 처리)
        # firstAskedAt 또는 createdAt 중 하나라도 있어야 함
        has_first = df["firstAskedAt"].notna()
        has_created = pd.to_datetime(df.get("createdAt", pd.Series()), errors='coerce').notna()
        df = df[has_first | has_created]
        
        s = pd.to_datetime(start)
        e = pd.to_datetime(end)
        # firstAskedAt이 없으면 createdAt 사용
        date_for_filter = pd.to_datetime(df["firstAskedAt"], errors='coerce').fillna(
            pd.to_datetime(df.get("createdAt"), errors='coerce')
        )
        filtered = df[(date_for_filter >= s) & (date_for_filter <= e)].copy()
        
        # filtered 만들고 나서
        for col in ["firstAskedAt","createdAt","openedAt","closedAt"]:
            if col in filtered.columns:
                filtered.loc[:, col] = _iso_millis(filtered[col])
        
        # NaN/Inf 값 제거
        filtered = filtered.replace([np.inf, -np.inf], np.nan)
        data_dict = filtered.to_dict(orient="records")
        return _sanitize_json(data_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 데이터 조회 실패: {str(e)}")

# 5-2-1. 기간별 데이터 (프론트엔드 호환성)
@app.get("/api/period-data")
async def period_data(
    start: str = Query(...), 
    end: str = Query(...), 
    refresh_mode: str = Query("cache"),
    고객유형: str = Query("전체"),
    고객유형_2차: str = Query("전체"),
    문의유형: str = Query("전체"),
    문의유형_2차: str = Query("전체"),
    서비스유형: str = Query("전체"),
    서비스유형_2차: str = Query("전체"),
    request: Request = None
):
    """
    프론트엔드 호환성을 위한 /api/period-data 엔드포인트
    
    refresh_mode:
    - "cache": 기존 캐시만 사용 (기본값)
    - "update": 기존 캐시 유지 + 누락된 기간만 API 호출
    - "refresh": 기존 캐시 완전 삭제 + 전체 새로 수집
    
    유형 필터:
    - 고객유형, 문의유형, 서비스유형: 1차 분류
    - 문의유형_2차, 서비스유형_2차: 2차 분류
    """
    try:
        end = limit_end_date(end)
        df = await get_cached_data(start, end, refresh_mode=refresh_mode)
        if df.empty:
            return []
        
        # ---- (1) 프론트 영문 키 alias도 수용 (없는 값이면 무시)
        # inquiryType, serviceType, customerType (+ Sub)
        if request is not None:
            qp = request.query_params
            # parent
            if _norm(문의유형) == _norm("전체"):
                문의유형 = qp.get("inquiryType") or qp.get("inquiryTypes") or 문의유형
            if _norm(서비스유형) == _norm("전체"):
                서비스유형 = qp.get("serviceType") or qp.get("serviceTypes") or 서비스유형
            if _norm(고객유형)   == _norm("전체"):
                고객유형   = qp.get("customerType") or qp.get("customerTypes") or 고객유형
            # child
            if _norm(문의유형_2차) == _norm("전체"):
                문의유형_2차 = qp.get("inquirySubtype") or qp.get("inquirySubtypes") or 문의유형_2차
            if _norm(서비스유형_2차) == _norm("전체"):
                서비스유형_2차 = qp.get("serviceSubtype") or qp.get("serviceSubtypes") or 서비스유형_2차
            if _norm(고객유형_2차) == _norm("전체"):
                고객유형_2차 = qp.get("customerSubtype") or qp.get("customerSubtypes") or 고객유형_2차

        print(f"[PERIOD] params start={start} end={end} refresh_mode={refresh_mode} "
              f"고객유형={고객유형} 문의유형={문의유형} 서비스유형={서비스유형} 문의유형_2차={문의유형_2차} 서비스유형_2차={서비스유형_2차}")
        original_len = len(df)
        print(f"[PERIOD] date-filtered rows(before type filters): {original_len}")

        # ---- (2) 실제 DF 컬럼 매핑: 1차/2차는 *_1차 / *_2차 로 통일
        COLS = {
            "문의유형":   ("문의유형_1차", "문의유형_2차"),
            "서비스유형": ("서비스유형_1차", "서비스유형_2차"),
            "고객유형":   ("고객유형_1차", "고객유형_2차"),
        }
        for _, (c1, c2) in COLS.items():
            if c1 not in df.columns: df[c1] = None
            if c2 not in df.columns: df[c2] = None

        # ---- (3) 다중값/CSV 지원 + 정규화 비교
        parent_vals = {
            "문의유형":   _parse_values(문의유형),
            "서비스유형": _parse_values(서비스유형),
            "고객유형":   _parse_values(고객유형),
        }
        child_vals = {
            "문의유형_2차":   _parse_values(문의유형_2차),
            "서비스유형_2차": _parse_values(서비스유형_2차),
            "고객유형_2차":   _parse_values(고객유형_2차),
        }

        # 안전 정규화 시리즈
        def _norm_series(s: pd.Series) -> pd.Series:
            return s.astype(str).str.strip().str.lower().replace({"none": "", "nan": ""})

        for key in ["문의유형", "서비스유형", "고객유형"]:
            p_col, c_col = COLS[key]
            p_vals = set(map(_norm, parent_vals[key]))
            c_vals = set(map(_norm, child_vals[f"{key}_2차"]))
            if p_vals and c_vals:
                # 부모+자식 동시 적용
                df = df[_norm_series(df[p_col]).isin(p_vals) & _norm_series(df[c_col]).isin(c_vals)]
            elif p_vals:
                # 부모만 적용
                df = df[_norm_series(df[p_col]).isin(p_vals)]
            elif c_vals:
                # ✅ 부모 없이 자식만 선택해도 적용
                df = df[_norm_series(df[c_col]).isin(c_vals)]

        filtered_df = df
        
        print("[FILTER] parent:", parent_vals, "child:", child_vals)
        print(f"[FILTER] 유형 필터 적용: "
              f"고객({고객유형})/{고객유형_2차}, "
              f"문의({문의유형})/{문의유형_2차}, "
              f"서비스({서비스유형})/{서비스유형_2차}")
        print(f"[FILTER] 필터링 전: {original_len} rows, 필터링 후: {len(filtered_df)} rows")
        print(f"[PERIOD] filtered rows(after type filters): {len(filtered_df)}")
        
        # 기존 firstAskedAt 변환 자리에 아래처럼 4개 모두 처리
        for col in ["firstAskedAt","createdAt","openedAt","closedAt"]:
            if col in filtered_df.columns:
                filtered_df.loc[:, col] = _iso_millis(filtered_df[col])
        
        # NaN/Inf 값 제거
        filtered_df = filtered_df.replace([np.inf, -np.inf], np.nan)
        data_dict = filtered_df.to_dict(orient="records")
        return _sanitize_json(data_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기간별 데이터 조회 실패: {str(e)}")

# 5-3. CSAT "행" 조회(캐시 전용)
@app.get("/api/csat/rows")
async def csat_rows(start: str = Query(...), end: str = Query(...)):
    """
    평소 사용 경로. 절대로 원격 API를 호출하지 않고, csat_YYYY-MM 캐시만 로드해서 반환.
    """
    try:
        end = limit_end_date(end)
        df = load_csat_rows_from_cache(start, end)
        
        if df is None or df.empty:
            return []
        
        # NaN/Inf 값 제거
        df = df.replace([np.inf, -np.inf], np.nan)
        data_dict = df.to_dict(orient="records")
        return _sanitize_json(data_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSAT 캐시 조회 실패: {str(e)}")

# 5-4. (선택) CSAT만 강제 갱신
@app.post("/api/csat/refresh")
async def csat_refresh(start: str = Query(...), end: str = Query(...)):
    """
    필요 시 수동으로 CSAT만 강제 수집(API 호출).
    대시보드의 '데이터 갱신' 버튼은 /api/cache/refresh?force=true&include_csat=true 를 호출하면 된다.
    """
    try:
        end = limit_end_date(end)
        saved = await build_and_cache_csat_rows(start, end)
        return {"message": "CSAT 강제 갱신 완료", "saved_rows": saved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSAT 강제 갱신 실패: {str(e)}")

# 5-6. 담당자별 통계 (managerIds와 assigneeId가 동일한 경우만 집계)
@app.get("/api/manager-stats")
async def manager_stats(start: str = Query(...), end: str = Query(...)):
    """
    담당자별 문의량과 문의유형 비율을 반환합니다.
    managerIds와 assigneeId가 동일한 경우만 집계합니다.
    """
    try:
        end = limit_end_date(end)
        df = await get_cached_data(start, end, refresh_mode="cache")
        
        if df is None or df.empty:
            print(f"[MANAGER_STATS] 데이터 없음: df is None or empty")
            return {
                "manager_counts": [],
                "manager_inquiry_types": {}
            }
        
        # 담당자 ID -> 이름 매핑
        manager_map = {
            "557191": "안예은",
            "547547": "조용준",
            "531024": "우지훈"
        }
        
        # managerIds 리스트에 assigneeId와 동일한 값이 있는 경우만 필터링
        def _check_manager_match(manager_ids, assignee_id):
            """managerIds 리스트에 assigneeId와 동일한 값이 있는지 확인"""
            try:
                if hasattr(manager_ids, '__iter__') and not isinstance(manager_ids, (str, list)):
                    manager_ids = list(manager_ids)
                if hasattr(assignee_id, '__iter__') and not isinstance(assignee_id, (str, int, float)):
                    assignee_id = list(assignee_id)[0] if len(list(assignee_id)) > 0 else None
                
                if assignee_id is None:
                    return False
                if manager_ids is None:
                    return False
                
                try:
                    if pd.isna(assignee_id):
                        return False
                except (ValueError, TypeError):
                    pass
                
                try:
                    if pd.isna(manager_ids):
                        return False
                except (ValueError, TypeError):
                    pass
                
                assignee_str = str(assignee_id).strip()
                
                if isinstance(manager_ids, list):
                    for mgr_id in manager_ids:
                        if str(mgr_id).strip() == assignee_str:
                            return True
                    return False
                else:
                    return str(manager_ids).strip() == assignee_str
            except Exception as e:
                print(f"[MANAGER_STATS] _check_manager_match 오류: {e}")
                return False
        
        # managerIds와 assigneeId가 동일한 행만 필터링
        filtered_df = df.copy()
        
        if "managerIds" not in filtered_df.columns:
            filtered_df["managerIds"] = None
        if "assigneeId" not in filtered_df.columns:
            filtered_df["assigneeId"] = None
        
        def _check_match_row(row):
            try:
                return _check_manager_match(row.get("managerIds"), row.get("assigneeId"))
            except Exception as e:
                print(f"[MANAGER_STATS] _check_match_row 오류: {e}")
                return False
        
        mask = filtered_df.apply(_check_match_row, axis=1)
        filtered_df = filtered_df[mask].copy()
        
        if filtered_df.empty:
            return {
                "manager_counts": [],
                "manager_inquiry_types": {}
            }
        
        # 1. 담당자별 문의량 집계
        def _has_manager_id(manager_ids, target_id):
            """managerIds 리스트에 target_id가 있는지 확인"""
            try:
                if hasattr(manager_ids, '__iter__') and not isinstance(manager_ids, (str, list)):
                    manager_ids = list(manager_ids)
                
                if pd.isna(manager_ids) or manager_ids is None:
                    return False
                target_str = str(target_id).strip()
                if isinstance(manager_ids, list):
                    for mgr_id in manager_ids:
                        if str(mgr_id).strip() == target_str:
                            return True
                    return False
                return str(manager_ids).strip() == target_str
            except Exception as e:
                print(f"[MANAGER_STATS] _has_manager_id 오류: {e}")
                return False
        
        manager_counts = []
        for manager_id, manager_name in manager_map.items():
            # managerIds에 해당 ID가 포함된 행만 필터링
            manager_mask = filtered_df["managerIds"].apply(
                lambda mgr_ids: _has_manager_id(mgr_ids, manager_id)
            )
            manager_data = filtered_df[manager_mask].copy()
            
            if len(manager_data) == 0:
                manager_counts.append({
                    "managerId": manager_id,
                    "managerName": manager_name,
                    "total": 0,
                    "chat": 0,
                    "phone": 0,
                    "phoneIB": 0,
                    "phoneOB": 0
                })
                continue
            
            # mediumType과 direction 컬럼 확인
            if "mediumType" not in manager_data.columns:
                manager_data["mediumType"] = None
            if "direction" not in manager_data.columns:
                manager_data["direction"] = None
            
            # 채팅 상담 (mediumType != "phone")
            chat_count = len(manager_data[manager_data["mediumType"] != "phone"])
            
            # 유선 상담 (mediumType == "phone")
            phone_data = manager_data[manager_data["mediumType"] == "phone"].copy()
            
            # 같은 날짜에 같은 userId가 여러 번 나타나면 중복 제거
            if len(phone_data) > 0 and "userId" in phone_data.columns and "firstAskedAt" in phone_data.columns:
                # firstAskedAt을 날짜만 추출 (시간 제외)
                phone_data["date_only"] = pd.to_datetime(phone_data["firstAskedAt"], errors="coerce").dt.date
                # userId와 날짜 기준으로 중복 제거 (첫 번째 것만 유지)
                phone_data = phone_data.drop_duplicates(subset=["userId", "date_only"], keep="first")
                # 임시 컬럼 제거
                phone_data = phone_data.drop(columns=["date_only"])
            
            phone_count = len(phone_data)
            
            # 유선 상담 IB (mediumType == "phone" AND direction == "IB")
            phone_ib_count = len(phone_data[phone_data["direction"] == "IB"])
            
            # 유선 상담 OB (mediumType == "phone" AND direction == "OB")
            phone_ob_count = len(phone_data[phone_data["direction"] == "OB"])
            
            manager_counts.append({
                "managerId": manager_id,
                "managerName": manager_name,
                "total": int(len(manager_data)),
                "chat": int(chat_count),
                "phone": int(phone_count),
                "phoneIB": int(phone_ib_count),
                "phoneOB": int(phone_ob_count)
            })
        
        # 문의량 순으로 정렬
        manager_counts.sort(key=lambda x: x["total"], reverse=True)
        
        # 2. 담당자별 문의유형 비율 집계
        manager_inquiry_types = {}
        for manager_id, manager_name in manager_map.items():
            # managerIds에 해당 ID가 포함된 행만 필터링
            manager_mask = filtered_df["managerIds"].apply(
                lambda mgr_ids: _has_manager_id(mgr_ids, manager_id)
            )
            manager_data = filtered_df[manager_mask].copy()
            if len(manager_data) == 0:
                continue
            
            # 문의유형별 집계
            inquiry_type_counts = {}
            for _, row in manager_data.iterrows():
                inquiry_type = row.get("문의유형")
                if pd.isna(inquiry_type) or not inquiry_type:
                    inquiry_type = "미분류"
                else:
                    inquiry_type = str(inquiry_type).strip()
                
                inquiry_type_counts[inquiry_type] = inquiry_type_counts.get(inquiry_type, 0) + 1
            
            # 비율 계산
            total = len(manager_data)
            inquiry_type_ratios = []
            for inquiry_type, count in sorted(inquiry_type_counts.items(), key=lambda x: x[1], reverse=True):
                inquiry_type_ratios.append({
                    "문의유형": inquiry_type,
                    "count": int(count),
                    "ratio": round((count / total) * 100, 1) if total > 0 else 0.0
                })
            
            manager_inquiry_types[manager_id] = {
                "managerName": manager_name,
                "total": int(total),
                "inquiryTypes": inquiry_type_ratios
            }
        
        return {
            "manager_counts": manager_counts,
            "manager_inquiry_types": manager_inquiry_types
        }
        
    except Exception as e:
        print(f"[MANAGER_STATS] 오류: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"담당자별 통계 조회 실패: {str(e)}")

# 5-5-1. CSAT 텍스트 분석 (comment_3, comment_6)
@app.get("/api/csat-text-analysis")
async def csat_text_analysis(start: str = Query(...), end: str = Query(...)):
    """
    CSAT의 comment_3, comment_6 텍스트 데이터를 분석하여 반환합니다.
    """
    try:
        end = limit_end_date(end)
        csat_df = load_csat_rows_from_cache(start, end)
        
        if csat_df is None or csat_df.empty:
            return {"status": "error", "message": "CSAT 데이터가 없습니다."}
        
        # NaN/Inf 값 제거
        csat_df = csat_df.replace([np.inf, -np.inf], np.nan)
        
        # comment_3, comment_6 데이터 추출
        comment_3_data = []
        comment_6_data = []
        
        for _, row in csat_df.iterrows():
            if pd.notna(row.get('comment_3')) and str(row['comment_3']).strip():
                comment_3_data.append({
                    "firstAskedAt": row['firstAskedAt'],
                    "userId": row['userId'],
                    "text": str(row['comment_3']).strip(),
                    "tags": {
                        "고객유형": row.get('고객유형', ''),
                        "문의유형": row.get('문의유형', ''),
                        "서비스유형": row.get('서비스유형', '')
                    }
                })
            
            if pd.notna(row.get('comment_6')) and str(row['comment_6']).strip():
                comment_6_data.append({
                    "firstAskedAt": row['firstAskedAt'],
                    "userId": row['userId'],
                    "text": str(row['comment_6']).strip(),
                    "tags": {
                        "고객유형": row.get('고객유형', ''),
                        "문의유형": row.get('문의유형', ''),
                        "서비스유형": row.get('서비스유형', '')
                    }
                })
        
        # 날짜순으로 정렬 (최신순)
        comment_3_data.sort(key=lambda x: x.get('firstAskedAt', ''), reverse=True)
        comment_6_data.sort(key=lambda x: x.get('firstAskedAt', ''), reverse=True)
        
        result = {
            "status": "success",
            "comment_3": {
                "total": len(comment_3_data),
                "data": comment_3_data
            },
            "comment_6": {
                "total": len(comment_6_data),
                "data": comment_6_data
            }
        }
        
        return _sanitize_json(result)
        
    except Exception as e:
        print(f"[CSAT_TEXT] 분석 실패: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"CSAT 텍스트 분석 실패: {str(e)}")

# 5-5. CSAT 분석 결과 (프론트엔드 호환성)
@app.get("/api/csat-analysis")
async def csat_analysis(start: str = Query(...), end: str = Query(...)):
    """
    캐시 전용 CSAT 분석:
    - 절대 외부 API 호출 안 함
    - userId/조인키가 없어도 500 던지지 않고 가능한 결과만 반환
    - 상세 코멘트 포함(comments.comment_3 / comments.comment_6)
    """
    try:
        end = limit_end_date(end)
        csat_df = load_csat_rows_from_cache(start, end)

        # 비어 있으면 빈 성공 응답
        if csat_df is None or csat_df.empty:
            return {"status": "success", "총응답수": 0, "요약": [], "유형별": {}, "comments": {
                "comment_3": {"total": 0, "data": []},
                "comment_6": {"total": 0, "data": []},
            }}

        import pandas as pd
        import numpy as np

        # ---- 코멘트 payload (프론트 상세의견용) ----
        def _clean_ts(v):
            try:
                if pd.isna(v): return None
                return pd.to_datetime(v, errors="coerce").isoformat()
            except Exception:
                return None

        def _pack_comments(df, text_col, score_col_hint):
            data = []
            if text_col in df.columns:
                for _, r in df.iterrows():
                    txt = r.get(text_col)
                    if pd.notna(txt) and str(txt).strip():
                        data.append({
                            "firstAskedAt": _clean_ts(r.get("firstAskedAt")),
                            "userId": r.get("userId"),
                            "personId": r.get("personId"),
                            "userChatId": r.get("userChatId"),
                            "text": str(txt).strip(),
                            # 점수는 힌트 컬럼이 있으면 같이 내려줌(없어도 OK)
                            "score": (pd.to_numeric(r.get(score_col_hint), errors="coerce")
                                      if score_col_hint in df.columns else None),
                            # 태그는 프론트에서 userchats 캐시와 매칭해 채워줌
                        })
            # 최신순 정렬
            data.sort(key=lambda x: x.get("firstAskedAt") or "", reverse=True)
            return {"total": len(data), "data": data}

        comments_payload = {
            "comment_3": _pack_comments(csat_df, "comment_3", "A-2"),
            "comment_6": _pack_comments(csat_df, "comment_6", "A-5"),
        }

        # ---- 기본 요약 (A-1/2/4/5) ----
        score_cols = [c for c in ["A-1", "A-2", "A-4", "A-5"] if c in csat_df.columns]

        # ✅ 공통 분모(대상자수) = 설문 워크플로우 시작자 수로 산정
        raw = csat_df.get("wf_768201_started")
        elig = pd.Series(raw if raw is not None else False, index=csat_df.index)
        elig = (elig.replace({
            True: True, False: False,
            "True": True, "False": False,
            "true": True, "false": False,
            "1": True, "0": False, 1: True, 0: False
        }).fillna(False).astype(bool))
        elig_count = int(elig.sum())

        summary_list = []
        for col in score_cols:
            series = pd.to_numeric(csat_df[col], errors="coerce")
            valid = series.dropna()
            avg_score = float(valid.mean()) if len(valid) > 0 and np.isfinite(valid.mean()) else 0.0

            answered_this = int(valid.count())
            non_responded = max(0, elig_count - answered_this)

            summary_list.append({
                "항목": col,
                "평균점수": round(avg_score, 2),
                "응답자수": answered_this,
                "대상자수": elig_count,        # ✅ 추가
                "미응답자수": non_responded,    # ✅ 추가
                "라벨": f"{col} ({round(avg_score, 2)}점)",
            })

        # ✅ 총응답수 = 공통 분모(대상자수)
        total_responses = int(elig_count)

        # ---- 유형별 집계(가능할 때만) : 캐시만 사용, 조인 실패해도 스킵 ----
        type_scores = {}
        try:
            chats_df = await get_cached_data(start, end, refresh_mode="cache")  # 캐시 전용
            if chats_df is not None and not chats_df.empty:
                # 조인키 우선순위: userId → personId → userChatId
                join_key = next((k for k in ["userId", "personId", "userChatId"]
                                 if k in csat_df.columns and k in chats_df.columns), None)
                if join_key == "userId":
                    # 기존 함수 재사용
                    enriched = enrich_csat_with_user_types(csat_df, chats_df)
                elif join_key is not None:
                    # 간단 조인(1차 분류만 가져와 붙임)
                    need_cols = ["userId", "personId", "userChatId", "문의유형", "고객유형", "서비스유형"]
                    use_cols = [c for c in need_cols if c in chats_df.columns]
                    enriched = pd.merge(
                        csat_df.copy(),
                        chats_df[use_cols].drop_duplicates(subset=[join_key], keep="last"),
                        on=join_key,
                        how="inner",
                    )
                else:
                    enriched = pd.DataFrame()

                if enriched is not None and not enriched.empty:
                    scores = build_csat_type_scores(enriched)
                    type_scores = _sanitize_json(scores)   # ✅ NaN/Inf/numpy 스칼라 전부 정리
        except Exception as e:
            print(f"[CSAT] 유형별 집계 스킵: {type(e).__name__}: {e}")
            type_scores = {}

        # ---- 최종 응답 ----
        
        resp = {
            "status": "success",
            "총응답수": total_responses,
            "요약": summary_list,
            "유형별": type_scores,     # 조인 안되면 {}
            "comments": comments_payload,
        }

        # ✅ NaN/Inf/numpy 스칼라 전부 정리
        safe_payload = _sanitize_json(resp)
        return JSONResponse(content=safe_payload)

    except Exception as e:
        print(f"[CSAT] 전체 처리 실패: {type(e).__name__}: {e}")
        # 어떤 경우에도 500이 전체 탭을 죽이지 않도록, 안전한 빈 결과 반환
        return {"status": "success", "총응답수": 0, "요약": [], "유형별": {}, "comments": {
            "comment_3": {"total": 0, "data": []},
            "comment_6": {"total": 0, "data": []},
        }}

# 6. (기존) 샘플/단일 조회 등 필요시 유지
@app.get("/api/user-chat/{userchat_id}")
async def get_user_chat(userchat_id: str):
    try:
        chat_data = await channel_api.get_userchat_by_id(userchat_id)
        return chat_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"UserChat 조회 실패: {str(e)}")

# ---- 7. 관리자 전용 엔드포인트 ----
@app.post("/api/admin/cache/rebuild")
async def admin_rebuild_cache(
    start: str = Query("2025-04-01"),
    end: str = Query(...),
    background: BackgroundTasks = None,
    _=Depends(admin_guard)
):
    """
    관리자 전용: 전체 캐시 초기화 + 전구간 재수집
    
    - X-Admin-Token 헤더로 인증 필요
    - 긴 작업이므로 백그라운드로 실행 (응답은 즉시)
    - userchats와 CSAT 캐시 모두 재수집
    """
    try:
        end = limit_end_date(end)
        
        # 긴 작업: 백그라운드로 실행 (응답은 즉시)
        if background is not None:
            background.add_task(_rebuild_all_cache_task, start, end)
            return {
                "status": "accepted", 
                "message": "재빌드 작업이 백그라운드에서 시작되었습니다.", 
                "range": [start, end]
            }
        else:
            # 동기 실행 (테스트용)
            result = await _rebuild_all_cache_task(start, end)
            return {
                "status": "ok",
                "message": "재빌드 작업이 완료되었습니다.",
                "range": [start, end],
                "result": result
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"관리자 재빌드 실패: {str(e)}")

@app.post("/api/admin/full-refresh")
async def admin_full_refresh(
    start: str = Query(...),
    end: str = Query(...),
    include_csat: bool = Query(False),
    x_admin_token: str = Header(None)
):
    # 관리자 토큰 체크
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")

    end = limit_end_date(end)

    # 전체 캐시 재수집 (userchats)
    df = await get_cached_data(start, end, refresh_mode="refresh")

    # 필요 시 CSAT도 수집
    csat_rows = 0
    if include_csat:
        csat_rows = await build_and_cache_csat_rows(start, end)

    return {
        "message": "full refresh done",
        "userchats_rows": int(len(df) if df is not None else 0),
        "csat_rows_saved": int(csat_rows),
        "range": [start, end]
    }

# ---- 8. Cloud 고객 관리 API ----

# Cloud 고객 모델
class CloudCustomer(BaseModel):
    id: Optional[int] = None
    사업유형: str
    담당자: Optional[str] = ""
    이름: str
    기관: Optional[str] = ""
    이메일: Optional[str] = ""
    사용자원: Optional[Any] = None  # 배열 또는 문자열 지원
    사용유형: Optional[str] = ""
    사용기간: Optional[str] = ""
    계약정산금액: Optional[str] = ""
    비고: Optional[str] = ""

class CloudCustomerCreate(BaseModel):
    사업유형: str
    담당자: Optional[str] = ""
    이름: str
    기관: Optional[str] = ""
    이메일: Optional[str] = ""
    사용자원: Optional[Any] = None  # 배열 또는 문자열 지원
    사용유형: Optional[str] = ""
    사용기간: Optional[str] = ""
    계약정산금액: Optional[str] = ""
    비고: Optional[str] = ""

# Cloud/환불/CRM 고객 데이터는 JSON DB로 관리


class RefundCustomer(BaseModel):
    id: Optional[int] = None
    이름: str
    기관: Optional[str] = ""
    기관링크: Optional[str] = ""
    크레딧충전금액: Optional[str] = ""
    환불금액: str
    환불날짜: str
    환불사유: Optional[str] = ""


class RefundCustomerCreate(BaseModel):
    이름: str
    기관: Optional[str] = ""
    기관링크: Optional[str] = ""
    크레딧충전금액: Optional[str] = ""
    환불금액: str
    환불날짜: str
    환불사유: Optional[str] = ""


class CrmCustomer(BaseModel):
    id: Optional[int] = None
    기관생성일: Optional[str] = ""
    성함: str
    이메일: str
    카드미등록발송일자: Optional[str] = ""
    카드등록일: Optional[str] = ""
    크레딧충전일: Optional[str] = ""
    기관링크: Optional[str] = ""
    기관어드민링크: Optional[str] = ""


class CrmCustomerCreate(BaseModel):
    기관생성일: Optional[str] = ""
    성함: str
    이메일: str
    카드미등록발송일자: Optional[str] = ""
    카드등록일: Optional[str] = ""
    크레딧충전일: Optional[str] = ""
    기관링크: Optional[str] = ""
    기관어드민링크: Optional[str] = ""

@app.get("/api/cloud-customers")
async def get_cloud_customers():
    """Cloud 고객 목록 조회"""
    with file_lock(DEFAULT_DB_PATH):
        rows = load_json_db()
        # 기존 고객 중 업데이트 날짜가 없는 경우 현재 날짜로 설정
        current_date = datetime.now().strftime("%Y-%m-%d")
        updated = False
        for row in rows:
            if "업데이트날짜" not in row or not row.get("업데이트날짜"):
                row["업데이트날짜"] = current_date
                updated = True
        if updated:
            save_json_db(rows)
        # 업데이트 날짜 최신순으로 정렬
        rows.sort(key=lambda x: x.get("업데이트날짜", ""), reverse=True)
        return rows

@app.post("/api/cloud-customers")
async def create_cloud_customer(customer: dict):
    """신규 고객 등록"""
    # 필수 필드 검증
    if not customer.get("사업유형") or not customer.get("이름"):
        raise HTTPException(status_code=400, detail="사업유형과 이름은 필수 입력 항목입니다.")
    
    with file_lock(DEFAULT_DB_PATH):
        rows = load_json_db()
        new_id = (max([r.get("id", 0) for r in rows]) + 1) if rows else 1
        
        # 새 고객 생성 (프론트엔드 필드명 유지)
        current_date = datetime.now().strftime("%Y-%m-%d")
        new_customer = {
            "id": new_id,
            "사업유형": customer.get("사업유형", ""),
            "담당자": customer.get("담당자", ""),
            "이름": customer.get("이름", ""),
            "기관": customer.get("기관", ""),
            "기관페이지링크": customer.get("기관페이지링크", ""),
            "이메일": customer.get("이메일", ""),
            "문의날짜": customer.get("문의날짜", ""),
            "계약날짜": customer.get("계약날짜", ""),
            "세일즈단계": customer.get("세일즈단계", ""),
            "서비스유형": customer.get("서비스유형", ""),
            "사용자원": customer.get("사용자원", ""),
            "사용자원수량": customer.get("사용자원수량", ""),
            "사용유형": customer.get("사용유형", ""),
            "사용기간": customer.get("사용기간", ""),
            "견적/정산금액": customer.get("견적/정산금액", customer.get("계약정산금액", "")),
            "비고": customer.get("비고", ""),
            "업데이트날짜": current_date
        }
        
        rows.append(new_customer)
        save_json_db(rows)
        return new_customer

@app.put("/api/cloud-customers/{customer_id}")
async def update_cloud_customer(customer_id: int, customer: dict):
    """고객 정보 수정"""
    # 필수 필드 검증
    if not customer.get("사업유형") or not customer.get("이름"):
        raise HTTPException(status_code=400, detail="사업유형과 이름은 필수 입력 항목입니다.")
    
    with file_lock(DEFAULT_DB_PATH):
        rows = load_json_db()
        idx = next((i for i, r in enumerate(rows) if r.get("id") == customer_id), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="고객을 찾을 수 없습니다.")
        
        # 기존 데이터 가져오기
        existing = rows[idx]
        
        # 담당자 필드를 제외한 다른 필드가 변경되었는지 확인
        fields_to_check = [
            "사업유형", "이름", "기관", "기관페이지링크", "이메일", 
            "문의날짜", "계약날짜", "세일즈단계", "서비스유형", "사용자원", "사용자원수량",
            "사용유형", "사용기간", "견적/정산금액", "비고"
        ]
        
        other_fields_changed = False
        for field in fields_to_check:
            existing_value = existing.get(field, "")
            new_value = customer.get(field, customer.get("계약정산금액", "") if field == "견적/정산금액" else "")
            
            # 사용자원은 배열일 수 있으므로 JSON 문자열로 비교
            if field == "사용자원":
                import json
                existing_json = json.dumps(existing_value, sort_keys=True) if existing_value else ""
                new_json = json.dumps(new_value, sort_keys=True) if new_value else ""
                if existing_json != new_json:
                    other_fields_changed = True
                    break
            else:
                if str(existing_value) != str(new_value):
                    other_fields_changed = True
                    break
        
        # 정보 업데이트 (프론트엔드 필드명 유지)
        update_data = {
            "사업유형": customer.get("사업유형", ""),
            "담당자": customer.get("담당자", ""),
            "이름": customer.get("이름", ""),
            "기관": customer.get("기관", ""),
            "기관페이지링크": customer.get("기관페이지링크", ""),
            "이메일": customer.get("이메일", ""),
            "문의날짜": customer.get("문의날짜", ""),
            "계약날짜": customer.get("계약날짜", ""),
            "세일즈단계": customer.get("세일즈단계", ""),
            "서비스유형": customer.get("서비스유형", ""),
            "사용자원": customer.get("사용자원", ""),
            "사용자원수량": customer.get("사용자원수량", ""),
            "사용유형": customer.get("사용유형", ""),
            "사용기간": customer.get("사용기간", ""),
            "견적/정산금액": customer.get("견적/정산금액", customer.get("계약정산금액", "")),
            "비고": customer.get("비고", ""),
        }
        
        # 담당자 필드만 변경된 경우가 아니면 업데이트 날짜 변경
        if other_fields_changed:
            current_date = datetime.now().strftime("%Y-%m-%d")
            update_data["업데이트날짜"] = current_date
        else:
            # 담당자만 변경된 경우 기존 업데이트 날짜 유지
            update_data["업데이트날짜"] = existing.get("업데이트날짜", "")
        
        rows[idx] = {
            **existing,
            **update_data,
            "id": customer_id
        }
        save_json_db(rows)
        return rows[idx]

@app.delete("/api/cloud-customers/{customer_id}")
async def delete_cloud_customer(customer_id: int):
    """고객 삭제"""
    with file_lock(DEFAULT_DB_PATH):
        rows = load_json_db()
        new_rows = [r for r in rows if r.get("id") != customer_id]
        if len(new_rows) == len(rows):
            raise HTTPException(status_code=404, detail="고객을 찾을 수 없습니다.")
        save_json_db(new_rows)
        return {"ok": True}

@app.post("/api/cloud-customers/migrate")
async def migrate_from_memory_to_json():
    """레거시 메모리 캐시(server_cache['cloud_customers']) → JSON 파일로 강제 덤프"""
    try:
        legacy_rows = server_cache.get("cloud_customers") or []
        if not legacy_rows:
            return {"ok": True, "migrated": 0, "detail": "legacy empty"}
        with file_lock(DEFAULT_DB_PATH):
            current = load_json_db()
            # id 기준으로 머지(파일에 없던 id만 추가)
            have = {r.get("id") for r in current if isinstance(r, dict)}
            to_add = [r for r in legacy_rows if isinstance(r, dict) and r.get("id") not in have]
            merged = (current or []) + to_add
            save_json_db(merged)
            return {"ok": True, "migrated": len(to_add), "detail": f"{len(to_add)}건 추가됨"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"마이그레이션 실패: {str(e)}")

# ---- 9. 환불 고객 관리 API ----

@app.get("/api/refund-customers")
async def get_refund_customers():
    """환불 고객 목록 조회"""
    with file_lock(REFUND_DB_PATH):
        rows = load_json_db(REFUND_DB_PATH)
        if not isinstance(rows, list):
            rows = []
        # 등록일 최신순으로 정렬
        rows.sort(key=lambda x: x.get("등록일", x.get("업데이트날짜", "")), reverse=True)
        return rows

@app.post("/api/refund-customers")
async def create_refund_customer(refund: RefundCustomerCreate):
    """신규 환불 고객 등록"""
    if not refund.이름 or not refund.환불금액 or not refund.환불날짜:
        raise HTTPException(status_code=400, detail="이름, 환불금액, 환불날짜는 필수 입력 항목입니다.")
    
    with file_lock(REFUND_DB_PATH):
        rows = load_json_db(REFUND_DB_PATH)
        if not isinstance(rows, list):
            rows = []
        
        # 새 ID 생성
        existing_ids = [r.get("id") for r in rows if isinstance(r, dict) and r.get("id")]
        new_id = (max(existing_ids) + 1) if existing_ids else 1
        
        now_iso = datetime.now().isoformat()
        new_refund = {
            "id": new_id,
            "이름": _clean_str(refund.이름),
            "기관": _clean_str(refund.기관),
            "기관링크": _clean_str(refund.기관링크),
            "크레딧충전금액": _clean_str(refund.크레딧충전금액),
            "환불금액": _clean_str(refund.환불금액),
            "환불날짜": _clean_str(refund.환불날짜),
            "환불사유": _clean_str(refund.환불사유),
            "등록일": now_iso,
            "업데이트날짜": now_iso,
        }
        
        rows.append(new_refund)
        save_json_db(rows, REFUND_DB_PATH)
        return new_refund

@app.put("/api/refund-customers/{refund_id}", response_model=RefundCustomer)
async def update_refund_customer(refund_id: int, refund: RefundCustomerCreate):
    """환불 고객 정보 수정"""
    if not refund.이름 or not refund.환불금액 or not refund.환불날짜:
        raise HTTPException(status_code=400, detail="이름, 환불금액, 환불날짜는 필수 입력 항목입니다.")
    
    with file_lock(REFUND_DB_PATH):
        rows = load_json_db(REFUND_DB_PATH)
        if not isinstance(rows, list):
            rows = []
        
        target_index = -1
        for idx, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            rid = row.get("id")
            rid_val = rid
            if isinstance(rid, str) and rid.isdigit():
                rid_val = int(rid)
            if rid_val == refund_id:
                row["id"] = int(rid)
                target_index = idx
                break

        if target_index < 0:
            raise HTTPException(status_code=404, detail="환불 고객을 찾을 수 없습니다.")

        existing = rows[target_index] if isinstance(rows[target_index], dict) else {}
        now_iso = datetime.now().isoformat()

        rows[target_index] = {
            **existing,
            **{
                "id": refund_id,
                "이름": _clean_str(refund.이름),
                "기관": _clean_str(refund.기관),
                "기관링크": _clean_str(refund.기관링크),
                "크레딧충전금액": _clean_str(refund.크레딧충전금액),
                "환불금액": _clean_str(refund.환불금액),
                "환불날짜": _clean_str(refund.환불날짜),
                "환불사유": _clean_str(refund.환불사유),
                "업데이트날짜": now_iso,
            },
        }

        if not rows[target_index].get("등록일"):
            rows[target_index]["등록일"] = now_iso

        save_json_db(rows, REFUND_DB_PATH)
        return rows[target_index]


@app.delete("/api/refund-customers/{refund_id}")
async def delete_refund_customer(refund_id: int):
    """환불 고객 삭제"""
    with file_lock(REFUND_DB_PATH):
        rows = load_json_db(REFUND_DB_PATH)
        if not isinstance(rows, list):
            rows = []

        kept_rows = []
        removed = False
        for row in rows:
            if not isinstance(row, dict):
                kept_rows.append(row)
                continue

            rid = row.get("id")
            rid_val = rid
            if isinstance(rid, str) and rid.isdigit():
                rid_val = int(rid)

            if rid_val == refund_id:
                removed = True
                continue
            kept_rows.append(row)

        if not removed:
            raise HTTPException(status_code=404, detail="환불 고객을 찾을 수 없습니다.")

        save_json_db(kept_rows, REFUND_DB_PATH)
        return {"ok": True}


# ---- 10. CRM 고객(기관) 관리 API ----

@app.get("/api/crm-customers")
async def get_crm_customers():
    """CRM 고객(기관) 목록 조회"""
    with file_lock(CRM_DB_PATH):
        rows = load_json_db(CRM_DB_PATH)
        if not isinstance(rows, list):
            rows = []
        # 등록일 또는 업데이트날짜 기준 최신순 정렬
        rows.sort(key=lambda x: x.get("등록일", x.get("업데이트날짜", "")), reverse=True)
        return rows


@app.post("/api/crm-customers")
async def create_crm_customer(crm: CrmCustomerCreate):
    """신규 CRM 고객(기관) 등록"""
    if not crm.성함 or not crm.이메일:
        raise HTTPException(status_code=400, detail="성함과 이메일은 필수 입력 항목입니다.")

    with file_lock(CRM_DB_PATH):
        rows = load_json_db(CRM_DB_PATH)
        if not isinstance(rows, list):
            rows = []

        existing_ids = [r.get("id") for r in rows if isinstance(r, dict) and r.get("id")]
        new_id = (max(existing_ids) + 1) if existing_ids else 1

        now_iso = datetime.now().isoformat()
        new_crm = {
            "id": new_id,
            "기관생성일": _clean_str(crm.기관생성일),
            "성함": _clean_str(crm.성함),
            "이메일": _clean_str(crm.이메일),
            "카드미등록발송일자": _clean_str(crm.카드미등록발송일자),
            "카드등록일": _clean_str(crm.카드등록일),
            "크레딧충전일": _clean_str(crm.크레딧충전일),
            "기관링크": _clean_str(crm.기관링크),
            "기관어드민링크": _clean_str(crm.기관어드민링크),
            "등록일": now_iso,
            "업데이트날짜": now_iso,
        }

        rows.append(new_crm)
        save_json_db(rows, CRM_DB_PATH)
        return new_crm


@app.put("/api/crm-customers/{crm_id}", response_model=CrmCustomer)
async def update_crm_customer(crm_id: int, crm: CrmCustomerCreate):
    """CRM 고객(기관) 정보 수정"""
    if not crm.성함 or not crm.이메일:
        raise HTTPException(status_code=400, detail="성함과 이메일은 필수 입력 항목입니다.")

    with file_lock(CRM_DB_PATH):
        rows = load_json_db(CRM_DB_PATH)
        if not isinstance(rows, list):
            rows = []

        target_index = -1
        for idx, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            rid = row.get("id")
            rid_val = rid
            if isinstance(rid, str) and rid.isdigit():
                rid_val = int(rid)
            if rid_val == crm_id:
                row["id"] = int(rid)
                target_index = idx
                break

        if target_index < 0:
            raise HTTPException(status_code=404, detail="CRM 고객을 찾을 수 없습니다.")

        existing = rows[target_index] if isinstance(rows[target_index], dict) else {}
        now_iso = datetime.now().isoformat()

        rows[target_index] = {
            **existing,
            **{
                "id": crm_id,
                "기관생성일": _clean_str(crm.기관생성일),
                "성함": _clean_str(crm.성함),
                "이메일": _clean_str(crm.이메일),
                "카드미등록발송일자": _clean_str(crm.카드미등록발송일자),
                "카드등록일": _clean_str(crm.카드등록일),
                "크레딧충전일": _clean_str(crm.크레딧충전일),
                "기관링크": _clean_str(crm.기관링크),
                "기관어드민링크": _clean_str(crm.기관어드민링크),
                "업데이트날짜": now_iso,
            },
        }

        if not rows[target_index].get("등록일"):
            rows[target_index]["등록일"] = now_iso

        save_json_db(rows, CRM_DB_PATH)
        return rows[target_index]


@app.delete("/api/crm-customers/{crm_id}")
async def delete_crm_customer(crm_id: int):
    """CRM 고객(기관) 삭제"""
    with file_lock(CRM_DB_PATH):
        rows = load_json_db(CRM_DB_PATH)
        if not isinstance(rows, list):
            rows = []

        kept_rows = []
        removed = False
        for row in rows:
            if not isinstance(row, dict):
                kept_rows.append(row)
                continue

            rid = row.get("id")
            rid_val = rid
            if isinstance(rid, str) and rid.isdigit():
                rid_val = int(rid)

            if rid_val == crm_id:
                removed = True
                continue
            kept_rows.append(row)

        if not removed:
            raise HTTPException(status_code=404, detail="CRM 고객을 찾을 수 없습니다.")

        save_json_db(kept_rows, CRM_DB_PATH)
        return {"ok": True}


@app.post("/api/crm-customers/upload-csv")
async def upload_crm_customers_csv(file: UploadFile = File(...)):
    """CSV 파일로 CRM 고객 일괄 등록"""
    try:
        # CSV 파일 읽기
        contents = await file.read()
        
        # 인코딩 시도 (utf-8-sig, utf-8, cp949 순서)
        csv_text = None
        for encoding in ['utf-8-sig', 'utf-8', 'cp949']:
            try:
                csv_text = contents.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        
        if csv_text is None:
            raise HTTPException(status_code=400, detail="CSV 파일 인코딩을 인식할 수 없습니다. UTF-8 또는 CP949 형식으로 저장해주세요.")
        
        # pandas로 CSV 파싱
        df = pd.read_csv(io.StringIO(csv_text))
        
        # 필수 컬럼 확인
        required_cols = ['성함', '이메일']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400, 
                detail=f"필수 컬럼이 없습니다: {', '.join(missing_cols)}"
            )
        
        # 데이터 정리 및 검증
        rows = []
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # 필수 필드 검증
                성함 = _clean_str(row.get('성함', ''))
                이메일 = _clean_str(row.get('이메일', ''))
                
                if not 성함 or not 이메일:
                    errors.append(f"행 {idx + 2}: 성함과 이메일은 필수 입력 항목입니다.")
                    continue
                
                # 날짜 필드 정리 (NaN이면 빈 문자열)
                기관생성일 = _clean_str(row.get('기관생성일', ''))
                카드미등록발송일자 = _clean_str(row.get('카드미등록발송일자', ''))
                카드등록일 = _clean_str(row.get('카드등록일', ''))
                크레딧충전일 = _clean_str(row.get('크레딧충전일', ''))
                
                rows.append({
                    "기관생성일": 기관생성일,
                    "성함": 성함,
                    "이메일": 이메일,
                    "카드미등록발송일자": 카드미등록발송일자,
                    "카드등록일": 카드등록일,
                    "크레딧충전일": 크레딧충전일,
                    "기관링크": _clean_str(row.get('기관링크', '')),
                    "기관어드민링크": _clean_str(row.get('기관어드민링크', '')),
                })
            except Exception as e:
                errors.append(f"행 {idx + 2}: 처리 중 오류 - {str(e)}")
                continue
        
        if not rows:
            raise HTTPException(
                status_code=400,
                detail="업로드할 유효한 데이터가 없습니다. " + ("\n".join(errors[:5]) if errors else "")
            )
        
        # 일괄 저장
        with file_lock(CRM_DB_PATH):
            existing_rows = load_json_db(CRM_DB_PATH)
            if not isinstance(existing_rows, list):
                existing_rows = []
            
            existing_ids = [r.get("id") for r in existing_rows if isinstance(r, dict) and r.get("id")]
            next_id = (max(existing_ids) + 1) if existing_ids else 1
            
            now_iso = datetime.now().isoformat()
            new_rows = []
            
            for row_data in rows:
                new_crm = {
                    "id": next_id,
                    "기관생성일": row_data["기관생성일"],
                    "성함": row_data["성함"],
                    "이메일": row_data["이메일"],
                    "카드미등록발송일자": row_data["카드미등록발송일자"],
                    "카드등록일": row_data["카드등록일"],
                    "크레딧충전일": row_data["크레딧충전일"],
                    "기관링크": row_data["기관링크"],
                    "기관어드민링크": row_data["기관어드민링크"],
                    "등록일": now_iso,
                    "업데이트날짜": now_iso,
                }
                new_rows.append(new_crm)
                next_id += 1
            
            existing_rows.extend(new_rows)
            save_json_db(existing_rows, CRM_DB_PATH)
        
        result = {
            "success": True,
            "uploaded": len(new_rows),
            "errors": errors[:10] if errors else []  # 최대 10개 에러만 반환
        }
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV 업로드 실패: {str(e)}")