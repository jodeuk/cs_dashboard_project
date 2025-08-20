import os
import re
import base64
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Optional
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

# ---- 1. FastAPI 기본 셋업 ----
app = FastAPI(title="CS Dashboard API", version="1.1.0")

# 타임아웃 설정 - TimeoutMiddleware는 존재하지 않으므로 제거
# from fastapi import Request
# from fastapi.middleware.timeout import TimeoutMiddleware
# app.add_middleware(TimeoutMiddleware, timeout=300)  # 5분 타임아웃

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- 2. 설정 ----
FONT_PATH = os.environ.get("FONT_PATH", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf")

# ---- 2-1. 날짜 제한 함수 ----
def limit_end_date(end_date_str: str) -> str:
    today_str = datetime.today().strftime("%Y-%m-%d")
    if end_date_str > today_str:
        return today_str
    return end_date_str

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
async def filter_options(start: str = Query(...), end: str = Query(...), refresh_mode: str = Query("cache")):
    try:
        print(f"[FILTER_OPTIONS] API 호출: start={start}, end={end}, refresh_mode={refresh_mode}")
        
        # 날짜 필터링 없이 전체 캐시 데이터 사용 (필터 옵션용)
        df = await get_cached_data("2025-04-01", "2025-12-31", refresh_mode="cache")
        print(f"[FILTER_OPTIONS] get_cached_data 결과: {len(df)} rows, 컬럼: {list(df.columns)}")
        
        if df.empty:
            print("[FILTER_OPTIONS] 데이터가 비어있음 - 기본값 반환")
            return {
                "고객유형": ["전체"], "문의유형": ["전체"], "서비스유형": ["전체"],
                "문의유형_2차": ["전체"], "서비스유형_2차": ["전체"],
            }

        def unique_nonempty(col):
            if col not in df.columns: return []
            vals = df[col].dropna()
            vals = [v for v in vals if v and str(v).strip() != '']
            return sorted(set(vals))

        def extract_primary(col):
            if col not in df.columns: 
                print(f"[FILTER] 컬럼 '{col}' 없음")
                return []
            vals = df[col].dropna()
            print(f"[FILTER] 컬럼 '{col}' 값들: {vals.head(10).tolist()}")
            s = set()
            for v in vals:
                if v and str(v).strip() != '':
                    txt = str(v)
                    # '/'가 있으면 첫 번째 값, 없으면 전체 값
                    primary = txt.split('/')[0].strip() if '/' in txt else txt.strip()
                    s.add(primary)
            result = sorted(s)
            print(f"[FILTER] 컬럼 '{col}' 1차 분류 결과: {result}")
            return result

        return {
            "고객유형": ["전체"] + extract_primary("고객유형"),
            "고객유형_2차": ["전체"] + unique_nonempty("고객유형_2차"),
            "문의유형": ["전체"] + extract_primary("문의유형"),
            "문의유형_2차": ["전체"] + unique_nonempty("문의유형_2차"),
            "서비스유형": ["전체"] + extract_primary("서비스유형"),
            "서비스유형_2차": ["전체"] + unique_nonempty("서비스유형_2차"),
        }
    except Exception as e:
        return {
            "고객유형": ["전체"], "문의유형": ["전체"], "서비스유형": ["전체"],
            "문의유형_2차": ["전체"], "서비스유형_2차": ["전체"],
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
        df = df[df["firstAskedAt"].notna()]
        s = pd.to_datetime(start)
        e = pd.to_datetime(end)
        filtered = df[(df["firstAskedAt"] >= s) & (df["firstAskedAt"] <= e)].copy()
        return filtered.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 데이터 조회 실패: {str(e)}")

# 5-2-1. 기간별 데이터 (프론트엔드 호환성)
@app.get("/api/period-data")
async def period_data(
    start: str = Query(...), 
    end: str = Query(...), 
    refresh_mode: str = Query("cache"),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체"),
    문의유형_2차: str = Query("전체"),
    서비스유형_2차: str = Query("전체")
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
        
        print(f"[PERIOD] params start={start} end={end} refresh_mode={refresh_mode} "
              f"고객유형={고객유형} 문의유형={문의유형} 서비스유형={서비스유형} 문의유형_2차={문의유형_2차} 서비스유형_2차={서비스유형_2차}")
        print(f"[PERIOD] date-filtered rows(before type filters): {len(df)}")

        # 모든 유형 필터가 '전체'면 바로 리턴 (이중필터로 0건 방지)
        if (고객유형 == "전체" and 문의유형 == "전체" and 서비스유형 == "전체"
            and 문의유형_2차 == "전체" and 서비스유형_2차 == "전체"):
            print("[PERIOD] all type filters == '전체' → skip type filtering")
            return df.to_dict(orient="records")

        # 유형 필터 적용
        filtered_df = get_filtered_df(
            df, 
            고객유형=고객유형,
            문의유형=문의유형,
            서비스유형=서비스유형,
            문의유형_2차=문의유형_2차,
            서비스유형_2차=서비스유형_2차
        )
        
        print(f"[FILTER] 유형 필터 적용: {고객유형}/{문의유형}/{서비스유형}/{문의유형_2차}/{서비스유형_2차}")
        print(f"[FILTER] 필터링 전: {len(df)} rows, 필터링 후: {len(filtered_df)} rows")
        print(f"[PERIOD] filtered rows(after type filters): {len(filtered_df)}")
        
        # firstAskedAt을 ISO 'YYYY-MM-DDTHH:MM:SS.sss'로 통일
        if "firstAskedAt" in filtered_df.columns:
            filtered_df["firstAskedAt"] = pd.to_datetime(filtered_df["firstAskedAt"], errors="coerce")
            filtered_df = filtered_df[filtered_df["firstAskedAt"].notna()].copy()
            # 밀리초 3자리까지 유지
            filtered_df["firstAskedAt"] = filtered_df["firstAskedAt"].dt.strftime("%Y-%m-%dT%H:%M:%S.%f").str.slice(0, 23)
        
        return filtered_df.to_dict(orient="records")
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
        # 반환 포맷 예시 컬럼:
        # firstAskedAt, userId, userChatId, A-1, A-2, comment_3, A-4, A-5, comment_6, csatSubmittedAt
        return df.to_dict(orient="records")
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

# 5-5. CSAT 분석 결과 (프론트엔드 호환성)
@app.get("/api/csat-analysis")
async def csat_analysis(start: str = Query(...), end: str = Query(...)):
    """
    CSAT 분석 결과를 반환합니다.
    """
    try:
        end = limit_end_date(end)
        csat_df = load_csat_rows_from_cache(start, end)
        
        if csat_df is None or csat_df.empty:
            return {
                "status": "success",
                "총응답수": 0,
                "요약": [],
                "유형별": {}
            }
        
        # 기존 CS 데이터 로드 (userchats)
        chats_df = await get_cached_data(start, end, refresh_mode="cache")
        
        # 🔧 컬럼 정규화: 조인 키 userId 사용
        if "userId" not in csat_df.columns:
            raise HTTPException(status_code=500, detail="CSAT 캐시에 userId가 없습니다.")
        if "userId" not in chats_df.columns:
            raise HTTPException(status_code=500, detail="CS 캐시에 userId가 없습니다. (최종 식별자 필요)")

        # 유형별 집계 (personId로 JOIN, 최종 결과에 userIds 포함)
        try:
            enriched = enrich_csat_with_user_types(csat_df, chats_df)
            type_scores = build_csat_type_scores(enriched)
            print(f"[CSAT] 유형별 집계 완료: {len(type_scores)}개 유형")
        except Exception as e:
            type_scores = {}
            print(f"[CSAT] 유형별 집계 실패: {type(e).__name__}: {e}")
        
        # 점수 항목 컬럼들
        score_cols = ["A-1", "A-2", "A-4", "A-5"]
        available_score_cols = [col for col in score_cols if col in csat_df.columns]
        
        if not available_score_cols:
            return {
                "status": "success",
                "총응답수": len(csat_df),
                "요약": [],
                "유형별": type_scores
            }
        
        # 항목별 요약 계산
        summary_list = []
        for col in available_score_cols:
            series = pd.to_numeric(csat_df[col], errors='coerce')
            valid = series.dropna()
            cnt = int(valid.count())
            
            # NaN/inf 값 안전하게 처리
            if cnt > 0:
                raw_avg = valid.mean()
                if pd.notna(raw_avg) and np.isfinite(raw_avg):
                    avg_score = float(raw_avg)
                else:
                    avg_score = 0.0
            else:
                avg_score = 0.0
            
            summary_list.append({
                "항목": col,
                "평균점수": round(avg_score, 2),
                "응답자수": cnt,
                "라벨": f"{col} ({round(avg_score, 2)}점)"
            })
        
        # 응답 데이터 안전성 검사
        try:
            response_data = {
                "status": "success",
                "총응답수": int(len(csat_df)),
                "요약": summary_list,
                "유형별": type_scores,   # ← 각 레코드에 userIds 포함
            }
            
            # JSON 직렬화 테스트
            import json
            json.dumps(response_data)
            print(f"[CSAT] 응답 데이터 JSON 직렬화 성공: {len(summary_list)}개 요약, {len(type_scores)}개 유형")
            
            return response_data
            
        except Exception as json_error:
            print(f"[CSAT] JSON 직렬화 실패: {type(json_error).__name__}: {json_error}")
            print(f"[CSAT] 문제 데이터: 요약={len(summary_list)}, 유형별={len(type_scores)}")
            raise HTTPException(status_code=500, detail=f"CSAT 응답 JSON 직렬화 실패: {str(json_error)}")
        
    except Exception as e:
        print(f"[CSAT] 전체 처리 실패: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"CSAT 분석 실패: {str(e)}")

# 6. (기존) 샘플/단일 조회 등 필요시 유지
@app.get("/api/user-chat/{userchat_id}")
async def get_user_chat(userchat_id: str):
    try:
        chat_data = await channel_api.get_userchat_by_id(userchat_id)
        return chat_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"UserChat 조회 실패: {str(e)}")