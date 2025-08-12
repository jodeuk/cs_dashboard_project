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

# 필터 옵션 API - 로그 강화 및 빈값 필터링 보완
@app.get("/api/filter-options")
async def filter_options(start: str = Query(...), end: str = Query(...)):
    try:
        # 종료일을 오늘 날짜 이하로 제한
        end = limit_end_date(end)
        print(f"[FILTER-OPTIONS] 필터 옵션 요청: {start} ~ {end}")
        
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

        filter_options = {
            "고객유형": ["전체"] + unique_nonempty("고객유형"),
            "문의유형": ["전체"] + unique_nonempty("문의유형"),
            "서비스유형": ["전체"] + unique_nonempty("서비스유형"),
            "문의유형_2차": ["전체"] + unique_nonempty("문의유형_2차"),
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
            
            if date_group == "월간":
                # 월간 집계
                filtered["month"] = filtered["firstAskedAt"].dt.to_period('M').astype(str)
                period_counts = filtered.groupby('month').size().reset_index(name="문의량")
                
                # 월간 x축 레이블 생성 (MM월 형식만)
                def create_month_label(month_str):
                    try:
                        # '2025-05' 형식을 '5월' 형식으로 변환
                        year, month = month_str.split('-')
                        return f"{int(month)}월"
                    except:
                        return month_str
                
                period_counts["x축"] = period_counts["month"].apply(create_month_label)
                
                # 날짜 순으로 정렬
                period_counts = period_counts.sort_values("month")
                
                result = period_counts[["x축", "문의량"]].to_dict(orient="records")
                print(f"[PERIOD-DATA] 결과: {len(result)}개 항목")
                return result
            else:
                # 주간 집계
                filtered["week"] = filtered["firstAskedAt"].dt.to_period('W').astype(str)
                period_counts = filtered.groupby('week').size().reset_index(name="문의량")
                
                # 주간 라벨 생성 (1주, 2주, 3주... 형식)
                week_info = []
                prev_month = ""
                week_num_in_month = 1
                
                for _, row in period_counts.iterrows():
                    try:
                        year, wstr = row["week"].split('-W')
                        # 주의 시작일로 월 추출
                        week_start = pd.to_datetime(f"{year}-W{wstr}-1", format='%Y-W%W-%w')
                        cur_month = f"{week_start.month}"
                        
                        if cur_month != prev_month:
                            week_num_in_month = 1
                            prev_month = cur_month
                        
                        week_info.append({
                            "week": row["week"],
                            "문의량": row["문의량"],
                            "x축": f"{week_num_in_month}주",
                            "월레이블": f"{cur_month}월" if week_num_in_month == 1 else ""
                        })
                        week_num_in_month += 1
                    except:
                        # 파싱 실패 시 기본값
                        week_info.append({
                            "week": row["week"],
                            "문의량": row["문의량"],
                            "x축": "1주",
                            "월레이블": ""
                        })
                
                # 날짜 순으로 정렬
                week_info.sort(key=lambda x: x["week"])
                
                result = [
                    {"x축": item["x축"], "문의량": item["문의량"], "월레이블": item["월레이블"]}
                    for item in week_info
                ]
                print(f"[PERIOD-DATA] 결과: {len(result)}개 항목")
                return result
            
        except Exception as e:
            print(f"[PERIOD-DATA] 날짜 파싱 오류: {e}")
            return []
            
    except Exception as e:
        print(f"[PERIOD-DATA] 전체 오류: {e}")
        raise HTTPException(status_code=500, detail=f"기간별 문의량 조회 실패: {str(e)}")

# 4-3. 월별 평균 시간
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
        
        # 필터링
        filtered = df.copy()
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
        
        # 월별 집계
        filtered["month"] = filtered["firstAskedAt"].dt.to_period('M').astype(str)
        
        monthly_avg = filtered.groupby('month').agg({
            'operationWaitingTime': lambda x: x.apply(parse_time_to_seconds).mean(),
            'operationAvgReplyTime': lambda x: x.apply(parse_time_to_seconds).mean(),
            'operationTotalReplyTime': lambda x: x.apply(parse_time_to_seconds).mean(),
            'operationResolutionTime': lambda x: x.apply(parse_time_to_seconds).mean()
        }).reset_index()
        
        # 월 라벨 생성
        def create_month_label(month_str):
            try:
                year, month = month_str.split('-')
                return f"{int(month)}월"
            except:
                return month_str
        
        monthly_avg["x축"] = monthly_avg["month"].apply(create_month_label)
        monthly_avg = monthly_avg.sort_values("month")
        
        result = monthly_avg[["x축", "operationWaitingTime", "operationAvgReplyTime", "operationTotalReplyTime", "operationResolutionTime"]].to_dict(orient="records")
        print(f"[AVG-TIMES] 결과: {len(result)}개 항목")
        return {
            "data": result,
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
        
        # 고객유형별 집계
        customer_counts = df["고객유형"].value_counts().head(top_n)
        
        result = []
        for customer_type, count in customer_counts.items():
            if customer_type and str(customer_type).strip() != '':
                result.append({
                    "고객유형": customer_type,
                    "문의량": int(count)
                })
        
        print(f"[CUSTOMER-TYPE-CS] 결과: {len(result)}개 항목")
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
        
        # 통계 계산
        total_inquiries = len(df)
        customer_types = safe_nunique(df["고객유형"])
        inquiry_types = safe_nunique(df["문의유형"])
        service_types = safe_nunique(df["서비스유형"])
        avg_first_response = safe_mean(df["operationAvgReplyTime"])
        avg_resolution = safe_mean(df["operationResolutionTime"])
        
        result = {
            "총문의수": total_inquiries,
            "고객유형수": customer_types,
            "문의유형수": inquiry_types,
            "서비스유형수": service_types,
            "평균첫응답시간": round(avg_first_response, 2),
            "평균해결시간": round(avg_resolution, 2)
        }
        
        print(f"[STATISTICS] 결과: {result}")
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
    end: str = Query(...),
    고객유형: str = Query("전체"),
    문의유형: str = Query("전체"),
    서비스유형: str = Query("전체")
):
    """CSAT 분석 결과"""
    global _csat_data
    
    # 종료일을 오늘 날짜 이하로 제한
    end = limit_end_date(end)
    
    if not _csat_data:
        return {
            "message": "CSAT 데이터가 업로드되지 않았습니다. Excel 파일을 먼저 업로드해주세요.",
            "문항목록": [],
            "월별트렌드": {},
            "평균점수": []
        }
    
    try:
        df = pd.DataFrame(_csat_data["data"])
        
        # 날짜 필터링
        date_cols = [col for col in df.columns if '날짜' in col or 'date' in col.lower()]
        if date_cols:
            date_col = date_cols[0]
            df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
            df = df[(df[date_col] >= pd.to_datetime(start)) & (df[date_col] <= pd.to_datetime(end))]
        
        # 점수 컬럼 찾기
        score_cols = [col for col in df.columns if '점수' in col or 'score' in col.lower() or '만족도' in col]
        
        if not score_cols:
            return {
                "message": "점수 컬럼을 찾을 수 없습니다.",
                "문항목록": [],
                "월별트렌드": {},
                "평균점수": []
            }
        
        score_col = score_cols[0]
        
        # 월별 평균 점수 계산
        if date_cols:
            df['month'] = df[date_cols[0]].dt.to_period('M')
            monthly_avg = df.groupby('month')[score_col].mean().to_dict()
        else:
            monthly_avg = {}
        
        # 전체 평균 점수
        overall_avg = df[score_col].mean()
        
        return {
            "message": "CSAT 분석 완료",
            "문항목록": list(df.columns),
            "월별트렌드": monthly_avg,
            "평균점수": [overall_avg] if not pd.isna(overall_avg) else []
        }
        
    except Exception as e:
        return {
            "message": f"CSAT 분석 중 오류 발생: {str(e)}",
            "문항목록": [],
            "월별트렌드": {},
            "평균점수": []
        } 