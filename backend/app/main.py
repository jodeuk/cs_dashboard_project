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
from app.cs_utils import get_cached_data, get_filtered_df, channel_api

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

# ---- 2-1. 날짜 제한 함수 ----
def limit_end_date(end_date_str: str) -> str:
    """종료일을 오늘 날짜 이하로 제한"""
    today_str = datetime.today().strftime("%Y-%m-%d")
    if end_date_str > today_str:
        print(f"[DATE_LIMIT] 요청 종료일 {end_date_str}을 오늘 날짜 {today_str}로 제한")
        return today_str
    return end_date_str

# ---- 2-1. Pydantic 모델 ----
class CSATFileUpload(BaseModel):
    filename: str
    file_data: str  # Base64 encoded file data
    file_type: str  # "xlsx" or "xls"

# ---- 4. API 엔드포인트 ----

@app.get("/")
async def root():
    return {"message": "CS Dashboard API", "version": "1.0.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api/health")
async def api_health():
    return {"status": "healthy", "api": True}

@app.get("/api/test")
async def test():
    return {"message": "API is working!"}

@app.get("/api/test-period-data")
async def test_period_data():
    """period-data API 테스트용 간단한 버전"""
    try:
        return {"message": "period-data API 테스트 성공", "data": []}
    except Exception as e:
        return {"error": str(e)}

# 캐시 관리 API 엔드포인트 추가
@app.get("/api/cache/status")
async def cache_status():
    """캐시 상태 확인"""
    try:
        from .cs_utils import server_cache
        import os
        
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
                file_path = os.path.join(cache_dir, filename)
                file_size = os.path.getsize(file_path)
                cache_files.append({
                    "filename": filename,
                    "size_mb": round(file_size / 1024 / 1024, 2),
                    "modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                })
                total_size += file_size
        
        return {
            "cache_enabled": True,
            "cache_dir": cache_dir,
            "cache_files": len(cache_files),
            "total_size_mb": round(total_size / 1024 / 1024, 2),
            "files": cache_files
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 상태 조회 실패: {str(e)}")

@app.get("/api/cache/check")
async def check_cache_for_period(start: str = Query(...), end: str = Query(...)):
    """특정 기간의 캐시 상태를 빠르게 확인"""
    try:
        from .cs_utils import server_cache
        
        def _get_required_months(start_date, end_date):
            """요청 범위에 필요한 모든 월 반환"""
            start_month = pd.to_datetime(start_date).to_period('M')
            end_month = pd.to_datetime(end_date).to_period('M')
            months = []
            current = start_month
            while current <= end_month:
                months.append(str(current))
                current += 1
            return months
        
        months = _get_required_months(start, end)
        cache_status = {}
        
        for month in months:
            cache_key = f"userchats_{month}"
            cached_df, metadata = server_cache.load_data(cache_key)
            is_valid = server_cache.is_cache_still_valid(metadata) if metadata else False
            cache_status[month] = {
                "exists": cached_df is not None,
                "valid": is_valid,
                "data_count": len(cached_df) if cached_df is not None else 0
            }
        
        return {
            "start_date": start,
            "end_date": end,
            "required_months": months,
            "cache_status": cache_status
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 확인 실패: {str(e)}")

@app.delete("/api/cache/clear")
async def clear_cache():
    """캐시 전체 삭제"""
    try:
        from .cs_utils import server_cache
        
        success = server_cache.clear_all_cache()
        if success:
            return {"message": "전체 캐시 삭제 완료"}
        else:
            raise HTTPException(status_code=500, detail="캐시 삭제 실패")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 삭제 실패: {str(e)}")

@app.get("/api/cache/check-consistency")
async def check_cache_consistency():
    """캐시 일관성 검사 및 자동 수정"""
    try:
        from .cs_utils import server_cache
        
        result = server_cache.check_and_fix_cache_consistency()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 일관성 검사 실패: {str(e)}")

@app.get("/api/cache/refresh")
async def refresh_cache(start: str = Query(...), end: str = Query(...)):
    """특정 기간의 캐시 새로고침"""
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        df = await get_cached_data(start, end)
        return {
            "message": "캐시 새로고침 완료",
            "data_count": len(df)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"캐시 새로고침 실패: {str(e)}")

@app.get("/api/debug-channel-api")
async def debug_channel_api():
    """ChannelTalk API 디버깅"""
    try:
        # 간단한 테스트 요청
        test_data = await channel_api.get_userchats("2025-01-01", "2025-01-31")
        return {
            "message": "ChannelTalk API 연결 성공",
            "test_data_count": len(test_data),
            "sample_data": test_data[:2] if test_data else []
        }
    except Exception as e:
        return {
            "message": "ChannelTalk API 연결 실패",
            "error": str(e)
        }

@app.get("/api/test-channel-api")
async def test_channel_api():
    """ChannelTalk API 테스트"""
    try:
        # 최근 데이터 가져오기
        from datetime import datetime, timedelta
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        userchats_data = await channel_api.get_userchats(start_date, end_date)
        
        if userchats_data:
            df = await channel_api.process_userchat_data(userchats_data)
            return {
                "message": "ChannelTalk API 테스트 성공",
                "raw_data_count": len(userchats_data),
                "processed_data_count": len(df),
                "columns": list(df.columns) if not df.empty else [],
                "sample_tags": df["tags"].head(5).tolist() if not df.empty and "tags" in df.columns else []
            }
        else:
            return {
                "message": "ChannelTalk API 테스트 완료 (데이터 없음)",
                "raw_data_count": 0,
                "processed_data_count": 0
            }
    except Exception as e:
        return {
            "message": "ChannelTalk API 테스트 실패",
            "error": str(e)
        }

@app.get("/api/test-messages")
async def test_messages_api():
    """Messages API 테스트"""
    try:
        # 8월 데이터만 테스트
        from datetime import datetime
        start_date = "2025-08-01"
        end_date = "2025-08-31"
        
        messages_data = await channel_api.get_messages(start_date, end_date)
        
        if messages_data:
            return {
                "message": "Messages API 테스트 완료",
                "raw_data_count": len(messages_data),
                "sample_data": messages_data[:3] if messages_data else [],
                "sample_keys": list(messages_data[0].keys()) if messages_data else []
            }
        else:
            return {
                "message": "Messages API 테스트 완료 (데이터 없음)",
                "raw_data_count": 0
            }
    except Exception as e:
        return {
            "message": "Messages API 테스트 실패",
            "error": str(e)
        }

# 필터 옵션 API - 로그 강화 및 빈값 필터링 보완
@app.get("/api/filter-options")
async def filter_options(start: str = Query(...), end: str = Query(...), force_refresh: bool = Query(False)):
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        print(f"[FILTER-OPTIONS] 필터 옵션 요청: {start} ~ {end}, force_refresh: {force_refresh}")
        
        if force_refresh:
            print(f"[FILTER-OPTIONS] 강제 새로고침 모드 - 캐시 무시하고 최신 데이터 가져오기")
            df = await get_cached_data(start, end, force_refresh=True)
        else:
        df = await get_cached_data(start, end)
        
        if df.empty:
            print(f"[FILTER-OPTIONS] 데이터가 비어있음")
            return {
                "고객유형": ["전체"],
                "문의유형": ["전체"],
                "서비스유형": ["전체"],
                "문의유형_2차": ["전체"],
                "서비스유형_2차": ["전체"],
            }
        
        print(f"[FILTER-OPTIONS] 캐시 데이터 컬럼: {list(df.columns)}")
        if "tags" in df.columns:
            print(f"[FILTER-OPTIONS] tags 샘플:")
            print(df["tags"].head(10).tolist())
        else:
            print("tags 컬럼 없음")

        def unique_nonempty(col):
            if col not in df.columns:
                return []
            vals = df[col].dropna()
            vals = [v for v in vals if v and str(v).strip() != '']
            return sorted(set(vals))

        def extract_primary_values(col):
            """복합값에서 1차 값만 추출 (예: '결제/결제문의' -> '결제')"""
            if col not in df.columns:
                return []
            vals = df[col].dropna()
            primary_vals = set()
            for v in vals:
                if v and str(v).strip() != '':
                    # '/'로 분리된 경우 첫 번째 값만 사용
                    if '/' in str(v):
                        primary = str(v).split('/')[0].strip()
                        if primary:
                            primary_vals.add(primary)
                    else:
                        primary_vals.add(str(v).strip())
            return sorted(primary_vals)

        filter_options = {
            "고객유형": ["전체"] + extract_primary_values("고객유형"),
            "고객유형_2차": ["전체"] + unique_nonempty("고객유형_2차"),
            "문의유형": ["전체"] + extract_primary_values("문의유형"),
            "문의유형_2차": ["전체"] + unique_nonempty("문의유형_2차"),
            "서비스유형": ["전체"] + extract_primary_values("서비스유형"),
            "서비스유형_2차": ["전체"] + unique_nonempty("서비스유형_2차"),
        }
        
        print(f"[FILTER-OPTIONS] 필터 옵션 생성 완료: {filter_options}")
        return filter_options
        
    except Exception as e:
        print(f"[FILTER-OPTIONS] 오류 발생: {e}")
        return {
            "고객유형": ["전체"],
            "문의유형": ["전체"],
            "서비스유형": ["전체"],
            "문의유형_2차": ["전체"],
            "서비스유형_2차": ["전체"],
        }

# 4-2. 기간별(월/주) 문의량
@app.get("/api/period-data")
async def period_data(
    start: str = Query(...), end: str = Query(...),
    date_group: str = Query("월간"),  # 호환성을 위해 유지하되 사용하지 않음
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체"),
    문의유형_2차: str = Query("전체"),
    서비스유형_2차: str = Query("전체")
):
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        print(f"[PERIOD-DATA] API 호출: {start} ~ {end}")
        df = await get_cached_data(start, end)
        print(f"[PERIOD-DATA] 캐시 데이터 로드: {len(df)} 건")
        
        if df.empty:
            print(f"[PERIOD-DATA] 데이터 없음")
            return []
        
        # 제공해주신 코드 방식으로 필터링 적용 (인덱스 문제 해결)
        filtered = df.copy()
        
        if 고객유형 != "전체":
            filtered = filtered[filtered["고객유형"] == 고객유형]
        if 문의유형 != "전체":
            filtered = filtered[filtered["문의유형"] == 문의유형]
        if 문의유형_2차 != "전체":
            filtered = filtered[filtered["문의유형_2차"] == 문의유형_2차]
        if 서비스유형 != "전체":
            filtered = filtered[filtered["서비스유형"] == 서비스유형]
        if 서비스유형_2차 != "전체":
            filtered = filtered[filtered["서비스유형_2차"] == 서비스유형_2차]
        
        filtered = filtered.reset_index(drop=True)
        print(f"[PERIOD-DATA] 필터링 결과: {len(filtered)}건")
        
        if filtered.empty:
            print(f"[PERIOD-DATA] 필터링 후 데이터 없음")
            return []
        
        # 날짜 파싱을 안전하게 처리
        try:
            filtered["firstAskedAt"] = pd.to_datetime(filtered["firstAskedAt"], errors='coerce', format='mixed')
            filtered = filtered[filtered["firstAskedAt"].notna()]  # 유효한 날짜만 유지
            print(f"[PERIOD-DATA] 날짜 파싱 후: {len(filtered)}건")
            
            if filtered.empty:
                print(f"[PERIOD-DATA] 날짜 파싱 후 데이터 없음")
                return []
            
            # 상세 데이터 반환 (집계하지 않음)
            result = filtered.to_dict(orient="records")
            print(f"[PERIOD-DATA] 상세 데이터 반환: {len(result)}개 항목")
            return result
            
        except Exception as e:
            print(f"[PERIOD-DATA] 날짜 파싱 오류: {e}")
            return []
            
    except Exception as e:
        print(f"[PERIOD-DATA] 전체 오류: {e}")
        raise HTTPException(status_code=500, detail=f"기간별 문의량 조회 실패: {str(e)}")

# 4-2. 캐시 데이터 전체 반환 (프론트 집계용)
@app.get("/api/userchats")
async def userchats(
    start: str = Query(...), end: str = Query(...), force_refresh: bool = Query(False)
):
    """
    지정 기간의 userchats 상세 row를 전부 반환 (집계 없이).
    (프론트에서 집계, 필터, 차트, 모든 계산 담당)
    force_refresh: True면 캐시 무시하고 최신 데이터 가져오기
    """
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        print(f"[USERCHATS] API 호출: {start} ~ {end}, force_refresh: {force_refresh}")
        
        if force_refresh:
            print(f"[USERCHATS] 강제 새로고침 모드 - 캐시 무시하고 최신 데이터 가져오기")
            # 캐시 무시하고 최신 데이터 가져오기
            df = await get_cached_data(start, end, force_refresh=True)
            else:
            df = await get_cached_data(start, end)
        
        if df.empty:
            print(f"[USERCHATS] 데이터 없음")
            return []
        
        # 날짜 파싱
        try:
            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors='coerce', format='mixed')
            df = df[df["firstAskedAt"].notna()]
        except Exception as e:
            print(f"[USERCHATS] 날짜 파싱 오류: {e}")
            return []
        
        if df.empty:
            print(f"[USERCHATS] 날짜 파싱 후 데이터 없음")
            return []
        
        # 날짜 필터링
        start_date = pd.to_datetime(start)
        end_date = pd.to_datetime(end)
        filtered = df[(df["firstAskedAt"] >= start_date) & (df["firstAskedAt"] <= end_date)].copy()
        
        # 상세 데이터 반환 (집계하지 않음)
        result = filtered.to_dict(orient="records")
        print(f"[USERCHATS] 상세 데이터 반환: {len(result)}개 항목")
                return result
            
        except Exception as e:
        print(f"[USERCHATS] 오류: {e}")
        raise HTTPException(status_code=500, detail=f"캐시 데이터 조회 실패: {str(e)}")

# 4-3. 월별 평균 시간 (백업용)
@app.get("/api/avg-times")
async def avg_times(
    start: str = Query(...), end: str = Query(...),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체"),
    date_group: str = Query("월간")
):
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        print(f"[AVG-TIMES] API 호출: {start} ~ {end}")
        df = await get_cached_data(start, end)
        
        if df.empty:
            print(f"[AVG-TIMES] 데이터 없음")
            return {"data": [], "time_names": ["대기시간", "첫응답시간", "총응답시간", "해결시간"]}
        
        # 필수 컬럼 확인 및 생성
        required_columns = ["firstAskedAt", "operationWaitingTime", "operationAvgReplyTime", "operationTotalReplyTime", "operationResolutionTime"]
        for col in required_columns:
            if col not in df.columns:
                print(f"[AVG-TIMES] 필수 컬럼 누락, 빈 값으로 생성: {col}")
                df[col] = None
        
        # 날짜 파싱
        try:
            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors='coerce', format='mixed')
            df = df[df["firstAskedAt"].notna()]
        except Exception as e:
            print(f"[AVG-TIMES] 날짜 파싱 오류: {e}")
            return {"data": [], "time_names": ["대기시간", "첫응답시간", "총응답시간", "해결시간"]}
        
        if df.empty:
            print(f"[AVG-TIMES] 날짜 파싱 후 데이터 없음")
            return {"data": [], "time_names": ["대기시간", "첫응답시간", "총응답시간", "해결시간"]}
        
        # 날짜 필터링 (중요!)
        start_date = pd.to_datetime(start)
        end_date = pd.to_datetime(end)
        filtered = df[(df["firstAskedAt"] >= start_date) & (df["firstAskedAt"] <= end_date)].copy()
        
        # 추가 필터링
        if 고객유형 != "전체":
            filtered = filtered[filtered["고객유형"] == 고객유형]
        if 문의유형 != "전체":
            filtered = filtered[filtered["문의유형"] == 문의유형]
        if 서비스유형 != "전체":
            filtered = filtered[filtered["서비스유형"] == 서비스유형]
        
        if filtered.empty:
            print(f"[AVG-TIMES] 필터링 후 데이터 없음")
            return {"data": [], "time_names": ["대기시간", "첫응답시간", "총응답시간", "해결시간"]}
        
        # 시간 파싱 함수
        def parse_time_to_seconds(time_str):
            if time_str is None or pd.isna(time_str):
                return 0
            try:
                # 이미 int나 float이면 그대로(초 단위로 간주)
                if isinstance(time_str, (int, float)):
                    return int(time_str)
                
                # 문자열 형태라면
                if isinstance(time_str, str):
                    time_str = time_str.strip()
                    # 빈 문자열
                    if not time_str:
                        return 0
                    # HH:MM:SS 혹은 MM:SS 형식
                    if ":" in time_str:
                        parts = [int(float(p)) for p in time_str.split(":")]
                        if len(parts) == 3:
                            hours, minutes, seconds = parts
                            return hours * 3600 + minutes * 60 + seconds
                        elif len(parts) == 2:
                            minutes, seconds = parts
                            return minutes * 60 + seconds
                    # 순수 숫자 문자열(ex. "142")
                    else:
                        return int(float(time_str))
                # 혹시 모를 case: 타입 불명
                    return int(float(time_str))
            except Exception as e:
                print(f"[parse_time_to_seconds] 변환 오류: 입력={time_str} | {e}")
                return 0
        
        # 시간 데이터를 숫자로 변환 (캐시 데이터 사용)
        time_columns = ['operationWaitingTime', 'operationAvgReplyTime', 'operationTotalReplyTime', 'operationResolutionTime']
        for col in time_columns:
            if col in filtered.columns:
                filtered[col] = filtered[col].apply(parse_time_to_seconds)
        
        # 월별 집계 (캐시 데이터 사용)
        filtered["month"] = filtered["firstAskedAt"].dt.to_period('M').astype(str)
        monthly_avg = filtered.groupby('month').agg({
            'operationWaitingTime': 'mean',
            'operationAvgReplyTime': 'mean', 
            'operationTotalReplyTime': 'mean',
            'operationResolutionTime': 'mean'
        }).reset_index()
        
        # 월별 라벨 생성
        result_data = []
        for _, row in monthly_avg.iterrows():
            try:
                year, month = row["month"].split('-')
                month_label = f"{int(month)}월"
                result_data.append({
                    "x축": month_label,
                    "operationWaitingTime": round(row["operationWaitingTime"], 2),
                    "operationAvgReplyTime": round(row["operationAvgReplyTime"], 2),
                    "operationTotalReplyTime": round(row["operationTotalReplyTime"], 2),
                    "operationResolutionTime": round(row["operationResolutionTime"], 2)
                })
            except:
                continue
        
        print(f"[AVG-TIMES] 월별 집계 결과: {len(result_data)}개 항목")
        
        return {
            "data": result_data,
            "time_names": ["대기시간", "첫응답시간", "총응답시간", "해결시간"]
        }
        
    except Exception as e:
        print(f"[AVG-TIMES] 오류: {e}")
        raise HTTPException(status_code=500, detail=f"평균 시간 조회 실패: {str(e)}")

# 4-4. 고객유형별 문의량
@app.get("/api/customer-type-cs")
async def customer_type_cs(
    start: str = Query(...), end: str = Query(...),
    top_n: int = Query(5)
):
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        print(f"[CUSTOMER-TYPE-CS] API 호출: {start} ~ {end}")
        df = await get_cached_data(start, end)
        
        if df.empty:
            print(f"[CUSTOMER-TYPE-CS] 데이터 없음")
            return []
        
        # 필수 컬럼 확인 및 생성
        if "고객유형" not in df.columns:
            print(f"[CUSTOMER-TYPE-CS] 고객유형 컬럼 누락, 빈 값으로 생성")
            df["고객유형"] = None
        
        if "firstAskedAt" not in df.columns:
            print(f"[CUSTOMER-TYPE-CS] firstAskedAt 컬럼 누락, 빈 값으로 생성")
            df["firstAskedAt"] = None
        
        # 날짜 파싱
        try:
            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors='coerce', format='mixed')
            df = df[df["firstAskedAt"].notna()]
        except Exception as e:
            print(f"[CUSTOMER-TYPE-CS] 날짜 파싱 오류: {e}")
            return []
        
        if df.empty:
            print(f"[CUSTOMER-TYPE-CS] 날짜 파싱 후 데이터 없음")
            return []
        
        # 상세 데이터 반환 (집계하지 않음)
        result = df.to_dict(orient="records")
        print(f"[CUSTOMER-TYPE-CS] 상세 데이터 반환: {len(result)}개 항목")
        return result
        
    except Exception as e:
        print(f"[CUSTOMER-TYPE-CS] 오류: {e}")
        raise HTTPException(status_code=500, detail=f"고객유형별 문의량 조회 실패: {str(e)}")

# 4-5. 통계
@app.get("/api/statistics")
async def get_statistics(start: str = Query(...), end: str = Query(...)):
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        print(f"[STATISTICS] API 호출: {start} ~ {end}")
        df = await get_cached_data(start, end)
        
        if df.empty:
            print(f"[STATISTICS] 데이터 없음")
            return {
                "총문의수": 0,
                "고객유형수": 0,
                "문의유형수": 0,
                "서비스유형수": 0,
                "평균첫응답시간": 0,
                "평균해결시간": 0
            }
        
        # 필수 컬럼 확인 및 생성
        required_columns = ["firstAskedAt", "고객유형", "문의유형", "서비스유형", "operationWaitingTime", "operationAvgReplyTime"]
        for col in required_columns:
            if col not in df.columns:
                print(f"[STATISTICS] 필수 컬럼 누락, 빈 값으로 생성: {col}")
                df[col] = None
        
        # 날짜 파싱
        try:
            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors='coerce', format='mixed')
            df = df[df["firstAskedAt"].notna()]
        except Exception as e:
            print(f"[STATISTICS] 날짜 파싱 오류: {e}")
            return {
                "총문의수": 0,
                "고객유형수": 0,
                "문의유형수": 0,
                "서비스유형수": 0,
                "평균첫응답시간": 0,
                "평균해결시간": 0
            }
        
        if df.empty:
            print(f"[STATISTICS] 날짜 파싱 후 데이터 없음")
            return {
                "총문의수": 0,
                "고객유형수": 0,
                "문의유형수": 0,
                "서비스유형수": 0,
                "평균첫응답시간": 0,
                "평균해결시간": 0
            }
        
        # 안전한 통계 계산 함수들
        def safe_mean(series):
            try:
                # 시간 문자열을 초로 변환
                def time_to_seconds(time_str):
                    if not time_str or pd.isna(time_str):
                        return 0
                    try:
                        if isinstance(time_str, str):
                            if ':' in time_str:
                                parts = time_str.split(':')
                                if len(parts) == 3:
                                    hours, minutes, seconds = map(int, parts)
                                    return hours * 3600 + minutes * 60 + seconds
                                elif len(parts) == 2:
                                    minutes, seconds = map(int, parts)
                                    return minutes * 60 + seconds
                            else:
                                return int(float(time_str))
                        else:
                            return int(float(time_str))
                    except:
                        return 0
                
                converted = series.apply(time_to_seconds)
                return converted.mean() if len(converted) > 0 else 0
            except:
                return 0
        
        def safe_nunique(series):
            try:
                non_null = series.dropna()
                non_empty = non_null[non_null.astype(str).str.strip() != '']
                return len(non_empty.unique())
            except:
                return 0
        
        # 상세 데이터 반환 (집계하지 않음)
        result = df.to_dict(orient="records")
        print(f"[STATISTICS] 상세 데이터 반환: {len(result)}개 항목")
        return result
        
    except Exception as e:
        print(f"[STATISTICS] 오류: {e}")
        raise HTTPException(status_code=500, detail=f"통계 조회 실패: {str(e)}")

@app.get("/api/sample")
async def sample(start: str = Query(...), end: str = Query(...), n: int = 5):
    """샘플 데이터 조회"""
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        df = await get_cached_data(start, end)
        if df.empty:
            return []
        return df.head(n).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"샘플 데이터 조회 실패: {str(e)}")

@app.get("/api/user-chat/{userchat_id}")
async def get_user_chat(userchat_id: str):
    """특정 UserChat 조회"""
    try:
        chat_data = await channel_api.get_userchat_by_id(userchat_id)
        return chat_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"UserChat 조회 실패: {str(e)}")

# 5. CSAT 관련 API
@app.post("/api/upload-csat")
async def upload_csat_file(file_upload: CSATFileUpload):
    """CSAT Excel 파일 업로드"""
    global _csat_data
    
    try:
        # Base64 디코딩
        file_bytes = base64.b64decode(file_upload.file_data)
        
        # Excel 파일 읽기
        if file_upload.file_type == "xlsx":
            df = pd.read_excel(io.BytesIO(file_bytes), engine='openpyxl')
        else:
            df = pd.read_excel(io.BytesIO(file_bytes), engine='xlrd')

        # 컬럼명 매핑 (A-1 ~ A-5 등으로 통일)
        try:
            rename_map = {
                "A-1. 상담원의 친절도는 어떠셨나요?": "A-1",
                "A-2. 상담원이 문제 해결에 도움이 되었다고 느끼시나요?": "A-2",
                "A-4. 플랫폼의 주요 기능의 작동과 안정성은 만족스러웠나요?": "A-4",
                "A-5. 플랫폼의 디자인과 시각적 구성(화면 구성, 글자 크기, 버튼 크기 등)에 대해 어떻게 생각하시나요?": "A-5",
            }
            df.rename(columns=rename_map, inplace=True)
        except Exception as e:
            print(f"[CSAT-UPLOAD] rename_map 적용 실패: {e}")

        # userId 문자열 통일(있을 경우)
        if "userId" in df.columns:
            try:
                df["userId"] = df["userId"].astype(str).str.strip()
            except Exception:
                pass
        
        # 데이터 전처리
        processed_data = []
        for _, row in df.iterrows():
            # 날짜 컬럼 처리
            date_cols = [col for col in df.columns if '날짜' in col or 'date' in col.lower()]
            for col in date_cols:
                if pd.notna(row[col]):
                    try:
                        if isinstance(row[col], str):
                            row[col] = pd.to_datetime(row[col])
                        elif isinstance(row[col], (int, float)):
                            row[col] = pd.to_datetime(row[col], unit='D', origin='1899-12-30')
                    except:
                        pass
            
            processed_data.append(row.to_dict())
        
        _csat_data = {
            "filename": file_upload.filename,
            "data": processed_data,
            "uploaded_at": datetime.now().isoformat()
        }

        # 업로드한 CSAT 데이터를 캐시에 저장 (키: csat_raw)
        try:
            from .cs_utils import server_cache
            df_processed = pd.DataFrame(processed_data)
            server_cache.save_data(
                "csat_raw",
                df_processed,
                {"saved_at": datetime.now().isoformat(), "source": "upload_csat_file"}
            )
        except Exception as e:
            # 캐시 저장 실패는致命은 아니므로 로그만 남기고 계속 진행
            print(f"[CSAT-UPLOAD] 캐시 저장 실패: {e}")
        
        return {
            "message": "CSAT 파일이 성공적으로 업로드되었습니다.",
            "filename": file_upload.filename,
            "data_count": len(processed_data)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSAT 파일 업로드 실패: {str(e)}")

@app.get("/api/csat-analysis")
async def csat_analysis(
    start: str = Query(...), 
    end: str = Query(...)
):
    """CSAT 업로드 데이터와 userchats 캐시를 userId와 firstAskedAt으로 병합하여 분석 결과 반환.
    - userId와 firstAskedAt이 일치하는 데이터로 母집단(total_responses) 산정
    - 항목별 요약(평균점수/응답자수/응답률) 및 유형별 평균점수 제공
    """
    global _csat_data
    
    # 종료일을 오늘 날짜 이하로 제한
    end = limit_end_date(end)

    try:
        # 1) CSAT 데이터: 캐시 우선 로드, 없으면 메모리 업로드 데이터 사용
        from .cs_utils import server_cache
        csat_df, _ = server_cache.load_data("csat_raw")
        if csat_df is None or csat_df.empty:
            if not _csat_data:
                return {"status": "error", "message": "CSAT 데이터 없음"}
            csat_df = pd.DataFrame(_csat_data.get("data", []))

        if csat_df is None or csat_df.empty:
            return {"status": "error", "message": "CSAT 데이터 없음"}

        # 2) userchats 데이터: 기간 캐시에서 불러오기
        user_df = await get_cached_data(start, end)
        if user_df is None or user_df.empty:
            return {"status": "error", "message": "문의 캐시 없음"}

        # userId와 firstAskedAt 형 맞추기
        if "userId" not in csat_df.columns or "userId" not in user_df.columns:
            return {"status": "error", "message": "userId 컬럼 누락"}
        if "firstAskedAt" not in csat_df.columns or "firstAskedAt" not in user_df.columns:
            return {"status": "error", "message": "firstAskedAt 컬럼 누락"}
        
        csat_df["userId"] = csat_df["userId"].astype(str).str.strip()
        user_df["userId"] = user_df["userId"].astype(str).str.strip()
        
        # firstAskedAt을 datetime으로 변환하고 날짜만 추출
        csat_df["firstAskedAt"] = pd.to_datetime(csat_df["firstAskedAt"], errors='coerce')
        user_df["firstAskedAt"] = pd.to_datetime(user_df["firstAskedAt"], errors='coerce')
        
        # 날짜만 추출 (시간 제거)
        csat_df["firstAskedAt_date"] = csat_df["firstAskedAt"].dt.date
        user_df["firstAskedAt_date"] = user_df["firstAskedAt"].dt.date

        # 母집단: 고정값 273으로 설정
        total_responses = 273

        if total_responses == 0:
            return {"status": "success", "총응답수": 0, "요약": [], "유형별": {}}

        # 병합 (userId와 날짜로 매칭)
        merged = pd.merge(
            user_df,
            csat_df,
            on=["userId", "firstAskedAt_date"],
            how="inner"
        )

        if merged.empty:
            return {"status": "success", "총응답수": total_responses, "요약": [], "유형별": {}}

        # 점수 항목 후보 (존재하는 것만 사용)
        score_cols_candidates = ["A-1", "A-2", "A-4", "A-5"]
        score_cols = [c for c in score_cols_candidates if c in merged.columns]

        # 항목별 요약 계산
        summary_list = []
        for col in score_cols:
            series = pd.to_numeric(merged[col], errors='coerce')
            valid = series.dropna()
            cnt = int(valid.count())
            rate = (cnt / total_responses * 100) if total_responses > 0 else 0.0
            avg_score = float(valid.mean()) if cnt > 0 else 0.0
            summary_list.append({
                "항목": col,
                "평균점수": round(avg_score, 2),
                "응답자수": cnt,
                "응답률(%)": round(rate, 1),
                "라벨": f"{col} ({round(avg_score, 2)}점)"
            })

        # 유형별 분석 (모든 유형 1차만)
        type_analysis = {}
        
        # 문의유형 1차 분석
        if "문의유형_1차" in merged.columns and len(score_cols) > 0:
            type_analysis["문의유형"] = {}
            for question in score_cols:
                g = merged[["문의유형_1차", question]].copy()
                g[question] = pd.to_numeric(g[question], errors='coerce')
                grouped = g.groupby("문의유형_1차")[question].agg(['mean', 'count']).reset_index()
                grouped.columns = ["문의유형_1차", '평균점수', '응답자수']
                grouped = grouped[grouped['평균점수'].notna() & (grouped['평균점수'] > 0)]
                grouped['평균점수'] = grouped['평균점수'].round(2)
                # 컬럼명을 문의유형으로 변경
                grouped = grouped.rename(columns={"문의유형_1차": "문의유형"})
                type_analysis["문의유형"][question] = grouped.to_dict(orient="records")
        
        # 고객유형 1차 분석
        if "고객유형_1차" in merged.columns and len(score_cols) > 0:
            type_analysis["고객유형"] = {}
            for question in score_cols:
                g = merged[["고객유형_1차", question]].copy()
                g[question] = pd.to_numeric(g[question], errors='coerce')
                grouped = g.groupby("고객유형_1차")[question].agg(['mean', 'count']).reset_index()
                grouped.columns = ["고객유형_1차", '평균점수', '응답자수']
                grouped = grouped[grouped['평균점수'].notna() & (grouped['평균점수'] > 0)]
                grouped['평균점수'] = grouped['평균점수'].round(2)
                # 컬럼명을 고객유형으로 변경
                grouped = grouped.rename(columns={"고객유형_1차": "고객유형"})
                type_analysis["고객유형"][question] = grouped.to_dict(orient="records")
        
        # 서비스유형 1차 분석
        if "서비스유형_1차" in merged.columns and len(score_cols) > 0:
            type_analysis["서비스유형"] = {}
            for question in score_cols:
                g = merged[["서비스유형_1차", question]].copy()
                g[question] = pd.to_numeric(g[question], errors='coerce')
                grouped = g.groupby("서비스유형_1차")[question].agg(['mean', 'count']).reset_index()
                grouped.columns = ["서비스유형_1차", '평균점수', '응답자수']
                grouped = grouped[grouped['평균점수'].notna() & (grouped['평균점수'] > 0)]
                grouped['평균점수'] = grouped['평균점수'].round(2)
                # 컬럼명을 서비스유형으로 변경
                grouped = grouped.rename(columns={"서비스유형_1차": "서비스유형"})
                type_analysis["서비스유형"][question] = grouped.to_dict(orient="records")
        
        return {
            "status": "success",
            "총응답수": total_responses,
            "요약": summary_list,
            "유형별": type_analysis
        }
        
    except Exception as e:
        print(f"[CSAT-ANALYSIS] 오류: {e}")
        raise HTTPException(status_code=500, detail=f"CSAT 분석 실패: {str(e)}")