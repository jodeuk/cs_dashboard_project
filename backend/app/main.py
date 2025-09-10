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
async def filter_options(
    start: str = Query(...), 
    end: str = Query(...), 
    refresh_mode: str = Query("cache"),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
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
            
        def unique_nonempty_from_df(dataframe, col):
            if col not in dataframe.columns: return []
            vals = dataframe[col].dropna()
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

        # 기본 1차 분류들
        result = {
            "고객유형": ["전체"] + extract_primary("고객유형"),
            "문의유형": ["전체"] + extract_primary("문의유형"),
            "서비스유형": ["전체"] + extract_primary("서비스유형"),
        }
        
        # 2차 분류는 선택된 1차 분류에 따라 필터링
        if 고객유형 != "전체":
            # 선택된 고객유형의 세부 분류만
            고객유형_리스트 = [v.strip() for v in 고객유형.split(',') if v.strip()]
            print(f"[FILTER_OPTIONS] 고객유형 필터링: {고객유형_리스트}")
            if 고객유형_리스트:
                filtered_df = df[df["고객유형"].isin(고객유형_리스트)]
                print(f"[FILTER_OPTIONS] 필터링된 데이터: {len(filtered_df)} rows")
                고객유형_2차_options = ["전체"] + unique_nonempty_from_df(filtered_df, "고객유형_2차")
                print(f"[FILTER_OPTIONS] 고객유형_2차 옵션: {고객유형_2차_options}")
            else:
                고객유형_2차_options = ["전체"]
        else:
            고객유형_2차_options = ["전체"]
            
        if 문의유형 != "전체":
            # 선택된 문의유형의 세부 분류만
            문의유형_리스트 = [v.strip() for v in 문의유형.split(',') if v.strip()]
            if 문의유형_리스트:
                filtered_df = df[df["문의유형"].isin(문의유형_리스트)]
                문의유형_2차_options = ["전체"] + unique_nonempty_from_df(filtered_df, "문의유형_2차")
            else:
                문의유형_2차_options = ["전체"]
        else:
            문의유형_2차_options = ["전체"]
            
        if 서비스유형 != "전체":
            # 선택된 서비스유형의 세부 분류만
            서비스유형_리스트 = [v.strip() for v in 서비스유형.split(',') if v.strip()]
            if 서비스유형_리스트:
                filtered_df = df[df["서비스유형"].isin(서비스유형_리스트)]
                서비스유형_2차_options = ["전체"] + unique_nonempty_from_df(filtered_df, "서비스유형_2차")
            else:
                서비스유형_2차_options = ["전체"]
        else:
            서비스유형_2차_options = ["전체"]
        
        result.update({
            "고객유형_2차": 고객유형_2차_options,
            "문의유형_2차": 문의유형_2차_options,
            "서비스유형_2차": 서비스유형_2차_options,
        })
        
        return result
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
    고객유형_2차: str = Query("전체"),
    문의유형: str = Query("전체"),
    문의유형_2차: str = Query("전체"),
    서비스유형: str = Query("전체"),
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
            고객유형_2차=고객유형_2차,
            문의유형=문의유형,
            문의유형_2차=문의유형_2차,
            서비스유형=서비스유형,
            서비스유형_2차=서비스유형_2차
        )
        
        print(f"[FILTER] 유형 필터 적용: {고객유형}/{고객유형_2차}/{문의유형}/{문의유형_2차}/{서비스유형}/{서비스유형_2차}")
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
        
        return {
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
        summary_list = []
        for col in score_cols:
            series = pd.to_numeric(csat_df[col], errors="coerce")
            valid = series.dropna()
            avg_score = float(valid.mean()) if len(valid) > 0 and np.isfinite(valid.mean()) else 0.0
            summary_list.append({
                "항목": col,
                "평균점수": round(avg_score, 2),
                "응답자수": int(valid.count()),
                "라벨": f"{col} ({round(avg_score, 2)}점)",
            })

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
                    type_scores = build_csat_type_scores(enriched)
        except Exception as e:
            print(f"[CSAT] 유형별 집계 스킵: {type(e).__name__}: {e}")
            type_scores = {}

        # ---- 최종 응답 ----
        resp = {
            "status": "success",
            "총응답수": int(len(csat_df)),
            "요약": summary_list,
            "유형별": type_scores,     # 조인 안되면 {}
            "comments": comments_payload,
        }

        # 직렬화 확인
        import json
        json.dumps(resp)
        return resp

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