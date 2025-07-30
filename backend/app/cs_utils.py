import os
import httpx
import pandas as pd
import json
import pickle
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import asyncio
from dotenv import load_dotenv

load_dotenv()

class ChannelTalkAPI:
    def __init__(self):
        self.base_url = "https://api.channel.io"
        self.access_key = os.getenv("CHANNEL_ACCESS_KEY")
        self.access_secret = os.getenv("CHANNEL_ACCESS_SECRET")
        
        # 올바른 인증 헤더 설정 (x-access-key, x-access-secret 사용)
        self.headers = {
            "x-access-key": self.access_key,
            "x-access-secret": self.access_secret,
            "Content-Type": "application/json"
        }

    async def get_all_users(self, limit: int = 100) -> List[Dict]:
        """모든 사용자 목록을 가져옵니다."""
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        url = f"{self.base_url}/open/v5/users"
        params = {"limit": limit}
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                data = response.json()
                
                print(f"[API] 사용자 목록 응답 키들: {list(data.keys()) if isinstance(data, dict) else 'list'}")
                
                if "users" in data:
                    users = data["users"]
                    print(f"[API] 사용자 수: {len(users)}")
                    return users
                elif isinstance(data, list):
                    print(f"[API] 사용자 목록 개수: {len(data)}")
                    return data
                else:
                    print(f"[API] 예상치 못한 사용자 응답 구조: {data}")
                    return []
                    
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"사용자 목록 API 호출 중 오류 발생: {str(e)}")
            raise

    async def get_userchats(self, start_date: str, end_date: str, limit: int = 500) -> List[Dict]:
        """지정된 기간의 UserChat 데이터를 가져옵니다."""
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        # 날짜를 타임스탬프로 변환
        start_timestamp = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000)
        end_timestamp = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)
        
        all_userchats = []
        since = None
        page_count = 0
        max_pages = 50  # 무한 루프 방지
        
        try:
            while page_count < max_pages:
                page_count += 1
                print(f"[API] {page_count}번째 페이지 조회 중...")
                
                url = f"{self.base_url}/open/v5/user-chats"
                params = {"limit": limit}
                if since:
                    params["since"] = since
                
                print(f"[API] API 호출 중... since: {since}")
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(url, headers=self.headers, params=params)
                    response.raise_for_status()
                    data = response.json()
                
                print(f"[API] 응답 키들: {list(data.keys())}")
                
                if "userChats" in data:
                    user_chats = data["userChats"]
                    print(f"[API] 이번 페이지 채팅 수: {len(user_chats)}")
                    
                    if len(user_chats) == 0:
                        print("[API] 더 이상 데이터가 없습니다.")
                        break
                    
                    # 날짜 필터링
                    filtered_chats = []
                    for chat in user_chats:
                        first_asked_at = chat.get("firstAskedAt")
                        if first_asked_at and start_timestamp <= first_asked_at <= end_timestamp:
                            filtered_chats.append(chat)
                    
                    all_userchats.extend(filtered_chats)
                    print(f"[API] 필터링 후 이번 페이지 채팅 수: {len(filtered_chats)}")
                    
                    # 다음 페이지 확인
                    if "next" in data and data["next"]:
                        new_since = data["next"]
                        # since 값이 변경되지 않으면 무한 루프 방지
                        if new_since == since:
                            print(f"[API] since 값이 변경되지 않음, 루프 종료: {since}")
                            break
                        since = new_since
                        print(f"[API] 다음 페이지 since: {since}")
                    else:
                        print("[API] 더 이상 페이지가 없습니다.")
                        break
                else:
                    print(f"[API] userChats 키가 없습니다. 응답: {data}")
                    break
                    
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"API 호출 중 오류 발생: {str(e)}")
            raise
        
        print(f"[API] 총 수집된 채팅 수: {len(all_userchats)}")
        return all_userchats

    async def get_userchat_by_id(self, userchat_id: str) -> Dict:
        """특정 UserChat ID로 상세 정보를 가져옵니다."""
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        url = f"{self.base_url}/open/v5/user-chats/{userchat_id}"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"API 호출 중 오류 발생: {str(e)}")
            raise

    def hms_to_seconds(self, time_str: str) -> int:
        """HH:MM:SS 형식을 초로 변환합니다."""
        if not time_str or time_str == "00:00:00":
            return 0
        
        try:
            parts = time_str.split(":")
            if len(parts) == 3:
                hours, minutes, seconds = map(int, parts)
                return hours * 3600 + minutes * 60 + seconds
            return 0
        except:
            return 0

    def extract_level(self, tags: List[str], type_name: str, level: int) -> str:
        """태그에서 특정 타입의 레벨을 추출합니다."""
        if not tags:
            return None
        
        for tag in tags:
            if tag.startswith(f"{type_name}/"):
                parts = tag.split("/")
                if len(parts) > level:
                    return parts[level]
        return None

    async def process_userchat_data(self, data: List[Dict]) -> pd.DataFrame:
        """UserChat 데이터를 처리하여 DataFrame으로 변환합니다."""
        # 제공해주신 전처리 코드의 keep_keys 적용
        keep_keys = [
            "userId",
            "mediumType", 
            "workflow",
            "tags",
            "page",
            "firstAskedAt",
            "operationWaitingTime",
            "operationAvgReplyTime", 
            "operationTotalReplyTime",
            "operationResolutionTime"
        ]

        def convert_time(key, ms):
            """시간 데이터 변환 함수 (제공해주신 코드 적용)"""
            if ms is None:
                return None
            try:
                if key == "firstAskedAt":
                    from datetime import datetime
                    dt = datetime.utcfromtimestamp(ms / 1000)
                    return dt.replace(microsecond=0).isoformat()
                else:
                    from datetime import timedelta
                    td = timedelta(milliseconds=ms)
                    total_seconds = int(td.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    return f"{hours:02}:{minutes:02}:{seconds:02}"
            except:
                return None

        processed_data = []
        
        for item in data:
            # API 응답 구조에 맞게 수정
            userchat = item.get("userChat", item)  # userChat 키가 있으면 사용, 없으면 item 자체
            user = item.get("user", {})
            
            # 제공해주신 전처리 코드 방식으로 데이터 처리
            new_obj = {}
            
            for key in keep_keys:
                value = userchat.get(key)
                
                # page, workflow는 source에서 추출 (제공해주신 코드 적용)
                if key == "page":
                    value = userchat.get("source", {}).get("page")
                elif key == "workflow":
                    value = userchat.get("source", {}).get("workflow", {}).get("id")
                elif key in ["firstAskedAt", "operationWaitingTime", "operationAvgReplyTime", "operationTotalReplyTime", "operationResolutionTime"]:
                    value = convert_time(key, userchat.get(key))
                
                new_obj[key] = value
            
            # 태그에서 카테고리 정보 추출
            tags = new_obj.get("tags", [])
            
            # 추가 정보들 (기존 기능 유지)
            processed_item = {
                **new_obj,  # 전처리된 데이터
                "chats": userchat.get("chats", []),
                # User 정보
                "userName": user.get("name"),
                "userEmail": user.get("email"),
                "userMobileNumber": user.get("mobileNumber"),
                "userType": user.get("type"),
                "userMemberId": user.get("memberId"),
                # 태그에서 추출
                "고객유형": self.extract_level(tags, "고객유형", 1),
                "문의유형": self.extract_level(tags, "문의유형", 1),
                "서비스유형": self.extract_level(tags, "서비스유형", 1),
                "문의유형_2차": self.extract_level(tags, "문의유형", 2),
                "서비스유형_2차": self.extract_level(tags, "서비스유형", 2),
            }
            processed_data.append(processed_item)
        
        return pd.DataFrame(processed_data)

# 전역 API 클라이언트 인스턴스
channel_api = ChannelTalkAPI()

# 서버 캐시 시스템
class ServerCache:
    def __init__(self, cache_dir="cache"):
        self.cache_dir = cache_dir
        self.ensure_cache_dir()
    
    def ensure_cache_dir(self):
        """캐시 디렉토리 생성"""
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)
    
    def get_cache_path(self, cache_key: str) -> str:
        """캐시 파일 경로 반환"""
        return os.path.join(self.cache_dir, f"{cache_key}.pkl")
    
    def get_metadata_path(self, cache_key: str) -> str:
        """메타데이터 파일 경로 반환"""
        return os.path.join(self.cache_dir, f"{cache_key}_metadata.json")
    
    def save_data(self, cache_key: str, data: pd.DataFrame, metadata: Dict):
        """데이터와 메타데이터 저장"""
        try:
            # 데이터 저장
            data_path = self.get_cache_path(cache_key)
            data.to_pickle(data_path)
            
            # 메타데이터 저장
            metadata_path = self.get_metadata_path(cache_key)
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
            print(f"[CACHE] 데이터 저장 완료: {cache_key}")
            return True
        except Exception as e:
            print(f"[CACHE] 데이터 저장 실패: {e}")
            return False
    
    def load_data(self, cache_key: str) -> tuple[Optional[pd.DataFrame], Optional[Dict]]:
        """데이터와 메타데이터 로드"""
        try:
            data_path = self.get_cache_path(cache_key)
            metadata_path = self.get_metadata_path(cache_key)
            
            if os.path.exists(data_path) and os.path.exists(metadata_path):
                # 데이터 로드
                data = pd.read_pickle(data_path)
                
                # 메타데이터 로드
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                
                print(f"[CACHE] 캐시 로드 성공: {cache_key}")
                return data, metadata
            else:
                print(f"[CACHE] 캐시 파일 없음: {cache_key}")
                return None, None
        except Exception as e:
            print(f"[CACHE] 캐시 로드 실패: {e}")
            return None, None
    
    def is_cache_valid(self, metadata: Dict, start_date: str, end_date: str) -> bool:
        """캐시 유효성 검사 (24시간 이내) - 날짜 범위 변경은 허용"""
        if not metadata:
            return False
        
        try:
            # 업데이트 시간 확인 (24시간 이내)
            updated_at = datetime.fromisoformat(metadata.get("updated_at", ""))
            if datetime.now() - updated_at > timedelta(hours=24):
                print(f"[CACHE] 캐시 만료됨 (24시간 초과)")
                return False
            
            # 날짜 범위는 변경되어도 OK (기존 데이터 활용 가능)
            print(f"[CACHE] 캐시 유효함 (24시간 이내)")
            return True
        except Exception as e:
            print(f"[CACHE] 캐시 유효성 검사 실패: {e}")
            return False
    
    def get_required_date_range(self, cached_data: pd.DataFrame, start_date: str, end_date: str) -> tuple[str, str]:
        """캐시된 데이터를 고려하여 추가로 조회해야 할 날짜 범위를 계산"""
        if cached_data is None or cached_data.empty or 'firstAskedAt' not in cached_data.columns:
            return start_date, end_date
        
        try:
            # 캐시된 데이터의 날짜 범위 확인
            cached_data_copy = cached_data.copy()
            cached_data_copy['firstAskedAt'] = pd.to_datetime(cached_data_copy['firstAskedAt'], errors='coerce', format='mixed')
            
            cached_start = cached_data_copy['firstAskedAt'].min()
            cached_end = cached_data_copy['firstAskedAt'].max()
            
            request_start = pd.to_datetime(start_date)
            request_end = pd.to_datetime(end_date)
            
            # 추가로 조회해야 할 범위 계산
            new_start = start_date
            new_end = end_date
            
            # 시작 날짜가 캐시 범위보다 이전이면 추가 조회 필요
            if pd.notna(cached_start) and request_start < cached_start:
                new_start = start_date
            else:
                new_start = cached_end.strftime('%Y-%m-%d') if pd.notna(cached_end) else start_date
            
            # 종료 날짜가 캐시 범위보다 이후면 추가 조회 필요
            if pd.notna(cached_end) and request_end > cached_end:
                new_end = end_date
            else:
                new_end = cached_start.strftime('%Y-%m-%d') if pd.notna(cached_start) else end_date
            
            print(f"[CACHE] 캐시 범위: {cached_start} ~ {cached_end}")
            print(f"[CACHE] 요청 범위: {request_start} ~ {request_end}")
            print(f"[CACHE] 추가 조회 범위: {new_start} ~ {new_end}")
            
            return new_start, new_end
            
        except Exception as e:
            print(f"[CACHE] 날짜 범위 계산 실패: {e}")
            return start_date, end_date
    
    def merge_incremental_data(self, existing_data: pd.DataFrame, new_data: pd.DataFrame) -> pd.DataFrame:
        """기존 데이터와 새로운 데이터를 병합 (중복 제거)"""
        if existing_data is None or existing_data.empty:
            return new_data
        
        if new_data is None or new_data.empty:
            return existing_data
        
        # userId와 firstAskedAt을 기준으로 중복 제거
        combined = pd.concat([existing_data, new_data], ignore_index=True)
        
        # 중복 제거 (userId와 firstAskedAt이 같은 경우)
        if 'userId' in combined.columns and 'firstAskedAt' in combined.columns:
            combined = combined.drop_duplicates(subset=['userId', 'firstAskedAt'], keep='last')
        
        print(f"[CACHE] 증분 업데이트: 기존 {len(existing_data)}건 + 새로 {len(new_data)}건 = 총 {len(combined)}건")
        return combined
    
    def get_latest_cached_date(self, cache_key: str) -> Optional[str]:
        """캐시된 데이터의 가장 최근 날짜 반환"""
        try:
            data, metadata = self.load_data(cache_key)
            if data is not None and not data.empty and 'firstAskedAt' in data.columns:
                # ISO 형식 날짜를 datetime으로 변환
                data['firstAskedAt'] = pd.to_datetime(data['firstAskedAt'], errors='coerce', format='mixed')
                latest_date = data['firstAskedAt'].max()
                if pd.notna(latest_date):
                    return latest_date.strftime('%Y-%m-%d')
        except Exception as e:
            print(f"[CACHE] 최근 날짜 조회 실패: {e}")
        return None

    def filter_data_by_date_range(self, df: pd.DataFrame, start_date: str, end_date: str) -> pd.DataFrame:
        """캐시된 데이터에서 특정 날짜 범위의 데이터만 필터링합니다."""
        if df is None or df.empty:
            return pd.DataFrame()
        
        try:
            # firstAskedAt을 datetime으로 변환
            df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'], errors='coerce', format='mixed')
            
            # 날짜 범위 필터링
            start_datetime = pd.to_datetime(start_date)
            end_datetime = pd.to_datetime(end_date)
            
            filtered_df = df[(df['firstAskedAt'].notna()) & 
                            (df['firstAskedAt'] >= start_datetime) & 
                            (df['firstAskedAt'] <= end_datetime)]
            
            print(f"[CACHE] 날짜 범위 필터링 결과: {len(filtered_df)} 건")
            return filtered_df
        except Exception as e:
            print(f"[CACHE] 날짜 범위 필터링 실패: {e}")
            return pd.DataFrame()

# 전역 캐시 인스턴스
server_cache = ServerCache()

async def get_cached_data(start_date: str, end_date: str) -> pd.DataFrame:
    """캐시된 데이터를 가져오거나 API에서 새로 가져옵니다. (스마트 증분 업데이트)"""
    print(f"[CACHE] 데이터 요청: {start_date} ~ {end_date}")
    
    # 캐시 디렉토리 생성 확인
    server_cache.ensure_cache_dir()
    
    # 1. 기존 캐시 확인 (가장 큰 범위의 캐시 찾기)
    cached_data = None
    cached_metadata = None
    cache_key = None
    
    # 캐시 디렉토리에서 사용 가능한 캐시 찾기
    if os.path.exists(server_cache.cache_dir):
        print(f"[CACHE] 캐시 디렉토리 확인: {server_cache.cache_dir}")
        cache_files = [f for f in os.listdir(server_cache.cache_dir) if f.endswith('_metadata.json')]
        print(f"[CACHE] 발견된 캐시 파일 수: {len(cache_files)}")
        
        for filename in cache_files:
            try:
                # 캐시 키 추출 (userchats_2025-01-01_2025-01-31_metadata.json)
                cache_key_from_file = filename.replace('_metadata.json', '')
                if cache_key_from_file.startswith('userchats_'):
                    # 날짜 범위 추출
                    date_range = cache_key_from_file.replace('userchats_', '')
                    if '_' in date_range:
                        cached_start, cached_end = date_range.split('_', 1)
                        print(f"[CACHE] 캐시 파일 검사: {cached_start} ~ {cached_end}")
                        
                        # 요청 범위가 캐시 범위에 포함되는지 확인
                        if cached_start <= start_date and cached_end >= end_date:
                            print(f"[CACHE] 적합한 캐시 발견: {cached_start} ~ {cached_end}")
                            cached_data, cached_metadata = server_cache.load_data(cache_key_from_file)
                            if cached_data is not None:
                                cache_key = cache_key_from_file
                                print(f"[CACHE] 캐시 로드 성공: {cache_key}")
                                break
                            else:
                                print(f"[CACHE] 캐시 로드 실패: {cache_key_from_file}")
            except Exception as e:
                print(f"[CACHE] 캐시 파일 파싱 오류: {e}")
                continue
    else:
        print(f"[CACHE] 캐시 디렉토리가 존재하지 않음: {server_cache.cache_dir}")
    
    # 2. 캐시가 유효한 경우 필터링하여 반환
    if cached_data is not None:
        print(f"[CACHE] 캐시 데이터 발견: {len(cached_data)} 건")
        if server_cache.is_cache_valid(cached_metadata, start_date, end_date):
            print(f"[CACHE] 캐시 유효함 (24시간 이내)")
            filtered_data = server_cache.filter_data_by_date_range(cached_data, start_date, end_date)
            if len(filtered_data) > 0:
                print(f"[CACHE] 필터링된 데이터 반환: {len(filtered_data)} 건")
                return filtered_data
            else:
                print(f"[CACHE] 필터링 후 데이터 없음")
        else:
            print(f"[CACHE] 캐시 만료됨")
    
    # 3. 증분 업데이트 시도 (기존 캐시 + 당일 데이터만)
    if cached_data is not None:
        print(f"[CACHE] 증분 업데이트 시도")
        try:
            # 기존 캐시의 마지막 날짜 확인
            cached_end = cached_metadata.get('end_date', '')
            if cached_end and cached_end < end_date:
                # 당일 데이터만 추가 조회
                today = datetime.now().strftime('%Y-%m-%d')
                if cached_end < today:
                    print(f"[CACHE] 당일 데이터 추가 조회: {cached_end} ~ {today}")
                    new_data = await channel_api.get_userchats(cached_end, today)
                    if new_data:
                        new_df = await channel_api.process_userchat_data(new_data)
                        # 기존 데이터와 병합
                        combined_df = pd.concat([cached_data, new_df], ignore_index=True)
                        # 새로운 캐시 저장
                        new_cache_key = f"userchats_{start_date}_{end_date}"
                        new_metadata = {
                            "start_date": start_date, 
                            "end_date": end_date, 
                            "updated_at": datetime.now().isoformat(),
                            "data_count": len(combined_df),
                            "source": "incremental_update"
                        }
                        server_cache.save_data(new_cache_key, combined_df, new_metadata)
                        print(f"[CACHE] 증분 업데이트 완료: {len(combined_df)} 건")
                        return server_cache.filter_data_by_date_range(combined_df, start_date, end_date)
        except Exception as e:
            print(f"[CACHE] 증분 업데이트 실패: {e}")
    
    # 4. 전체 데이터 조회 (마지막 수단)
    print(f"[CACHE] 전체 데이터 조회 시작")
    try:
        raw_data = await channel_api.get_userchats(start_date, end_date)
        df = await channel_api.process_userchat_data(raw_data)
        
        # 캐시 저장
        cache_key = f"userchats_{start_date}_{end_date}"
        metadata = {
            "start_date": start_date, 
            "end_date": end_date, 
            "updated_at": datetime.now().isoformat(),
            "data_count": len(df),
            "source": "full_update"
        }
        server_cache.save_data(cache_key, df, metadata)
        print(f"[CACHE] 전체 데이터 저장 완료: {len(df)} 건")
        return df
    except Exception as e:
        print(f"[CACHE] 데이터 로드 실패: {e}")
        if cached_data is not None:
            print(f"[CACHE] 캐시된 데이터로 폴백")
            return server_cache.filter_data_by_date_range(cached_data, start_date, end_date)
        
        # 샘플 데이터 반환
        print(f"[CACHE] 샘플 데이터 반환")
        return pd.DataFrame({
            "firstAskedAt": ["2025-07-01T10:00:00", "2025-07-02T11:00:00"],
            "고객유형": ["SKmySUNI", "삼성전자"],
            "문의유형": ["과목_수업", "오류"],
            "서비스유형": ["엘리스LXP", "교원연수"],
            "문의유형_2차": ["로그인", "결제"],
            "서비스유형_2차": ["웹", "앱"]
        })

def get_filtered_df(df: pd.DataFrame, start: str, end: str, 
                   고객유형="전체", 문의유형="전체", 서비스유형="전체", 
                   문의유형_2차="전체", 서비스유형_2차="전체") -> pd.DataFrame:
    """필터링된 DataFrame을 반환합니다. (제공해주신 전처리 코드 방식 적용)"""
    temp = df.copy()
    
    # 1. 날짜 필터링 (ISO 문자열 형식 처리)
    if 'firstAskedAt' in temp.columns:
        # ISO 문자열을 datetime으로 변환 (더 안전한 방식)
        try:
            temp['firstAskedAt'] = pd.to_datetime(temp['firstAskedAt'], errors='coerce', format='mixed')
            start_date = pd.to_datetime(start)
            end_date = pd.to_datetime(end)
            
            # 유효한 날짜만 필터링
            temp = temp[(temp['firstAskedAt'].notna()) & 
                       (temp['firstAskedAt'] >= start_date) & 
                       (temp['firstAskedAt'] <= end_date)]
        except Exception as e:
            print(f"[FILTER] 날짜 파싱 오류: {e}")
            # 날짜 파싱 실패 시 전체 데이터 반환
            pass
    
    # 2. 카테고리별 필터링 (제공해주신 전처리 코드의 keep_keys 방식)
    if 고객유형 != "전체": 
        temp = temp[temp["고객유형"] == 고객유형]
    if 문의유형 != "전체": 
        temp = temp[temp["문의유형"] == 문의유형]
    if 문의유형_2차 != "전체": 
        temp = temp[temp["문의유형_2차"] == 문의유형_2차]
    if 서비스유형 != "전체": 
        temp = temp[temp["서비스유형"] == 서비스유형]
    if 서비스유형_2차 != "전체": 
        temp = temp[temp["서비스유형_2차"] == 서비스유형_2차]
    
    # 3. 필수 키들이 있는지 확인하고 정리
    required_keys = ["userId", "mediumType", "workflow", "tags", "firstAskedAt"]
    for key in required_keys:
        if key not in temp.columns:
            temp[key] = None
    
    # 4. operation 시간 데이터 정리 (제공해주신 convert_time 함수 방식)
    time_keys = ["operationWaitingTime", "operationAvgReplyTime", "operationTotalReplyTime", "operationResolutionTime"]
    for key in time_keys:
        if key in temp.columns:
            # 시간 데이터가 문자열이 아닌 경우 변환
            temp[key] = temp[key].apply(lambda x: x if isinstance(x, str) else None)
    
    return temp.reset_index(drop=True)

 