import os
import httpx
import pandas as pd
import json
import pickle
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import asyncio
from dotenv import load_dotenv

# 실전 서비스 수준 캐시 설정
CACHE_EXPIRE_HOURS = 24

# Docker/Render 환경 감지 및 캐시 디렉토리 설정
def get_cache_directory():
    """Docker/Render 환경에서는 /data/cache 사용, 로컬에서는 프로젝트 루트의 cache 사용"""
    # Docker/Render 환경 감지
    is_docker = os.getenv('DOCKER_ENV') or os.path.exists('/.dockerenv')
    is_render = os.getenv('RENDER') or os.path.exists('/opt/render')
    
    if is_docker or is_render:
        # Docker/Render 환경: Persistent Disk 사용 (/data/cache)
        cache_dir = os.getenv('CACHE_DIR', '/data/cache')
        print(f"[DEBUG] Docker/Render 환경 감지됨 - Persistent Disk 캐시 디렉토리: {cache_dir}")
    else:
        # 로컬 환경: 프로젝트 루트의 cache 사용
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        cache_dir = os.path.join(project_root, 'cache')
        print(f"[DEBUG] 로컬 환경 - 캐시 디렉토리: {cache_dir}")
    
    # 캐시 디렉토리가 없으면 생성
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
        print(f"[DEBUG] 캐시 디렉토리 생성: {cache_dir}")
    
    return cache_dir

# 전역 캐시 디렉토리 설정
CACHE_DIR = get_cache_directory()
print(f"[DEBUG] 최종 설정된 캐시 디렉토리: {CACHE_DIR}")
print(f"[DEBUG] 캐시 디렉토리 내 파일: {os.listdir(CACHE_DIR) if os.path.exists(CACHE_DIR) else '디렉토리 없음'}")

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

    async def get_userchats(self, start_date: str, end_date: str, limit: int = 1000) -> List[Dict]:
        """지정된 기간의 UserChat 데이터를 가져옵니다."""
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        # 날짜를 timestamp로 변환
        start_timestamp = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000)
        end_timestamp = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)
        
        all_userchats = []
        since = None
        page_count = 0
        max_pages = 10  # 최대 페이지 수를 줄여서 성능 개선
        collected_ids = set()
        last_next = None
        consecutive_same_next = 0
        
        try:
            while page_count < max_pages:
                page_count += 1
                url = f"{self.base_url}/open/v5/user-chats"
                params = {"limit": limit, "state": "closed"}
                if since:
                    params["since"] = since

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(url, headers=self.headers, params=params)
                    response.raise_for_status()
                    data = response.json()

                user_chats = data.get('userChats', [])
                next_value = data.get('next', None)

                print(f"[API] {page_count}번째 | since: {since} | userChats: {len(user_chats)} | next: {next_value}")

                # 1. userChats 없으면 무조건 break (끝)
                if not user_chats:
                    print("[API] 더 이상 userChats 없음, 종료")
                    break

                # 2. 날짜 필터링을 먼저 적용하여 필요한 데이터만 수집
                filtered_chats = []
                for chat in user_chats:
                    chat_id = chat.get("id")
                    if chat_id not in collected_ids:
                        first_asked_at = chat.get("firstAskedAt")
                        if first_asked_at and start_timestamp <= first_asked_at <= end_timestamp:
                            filtered_chats.append(chat)
                            collected_ids.add(chat_id)
                
                all_userchats.extend(filtered_chats)
                print(f"[API] 날짜 필터링 후 추가된 채팅: {len(filtered_chats)}")

                # 3. next가 없거나 빈값이면 종료
                if not next_value or not str(next_value).strip():
                    print("[API] next 없음, 종료")
                    break

                # 4. next가 동일하게 반복되면 종료
                if next_value == last_next:
                    consecutive_same_next += 1
                    print(f"[API] 동일 next 반복 {consecutive_same_next}회 | next: {next_value}")
                    if consecutive_same_next >= 2:
                        print("[API] 무한루프 방지, 종료")
                        break
                else:
                    consecutive_same_next = 0

                # 5. 최신 데이터가 요청 기간보다 이전이면 종료 (성능 최적화)
                if user_chats:
                    latest_chat = user_chats[0]  # 가장 최신 채팅
                    latest_timestamp = latest_chat.get("firstAskedAt")
                    if latest_timestamp and latest_timestamp < start_timestamp:
                        print(f"[API] 최신 데이터({latest_timestamp})가 요청 기간({start_timestamp})보다 이전, 종료")
                        break

                # 6. 다음 루프 준비
                since = next_value
                last_next = next_value
                        
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"API 호출 중 오류 발생: {str(e)}")
            raise
        
        print(f"[API] 총 수집된 채팅 수: {len(all_userchats)} (기간: {start_date} ~ {end_date})")
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
            print(f"[EXTRACT] 태그 없음: {type_name}")
            return None
        
        print(f"[EXTRACT] 태그 목록: {tags}")
        print(f"[EXTRACT] 찾는 타입: {type_name}, 레벨: {level}")
        
        for tag in tags:
            if tag.startswith(f"{type_name}/"):
                parts = tag.split("/")
                print(f"[EXTRACT] 매칭 태그: {tag}, 파트: {parts}")
                if len(parts) > level:
                    result = parts[level]
                    print(f"[EXTRACT] 추출 결과: {result}")
                    return result
                else:
                    print(f"[EXTRACT] 레벨 부족: {len(parts)} <= {level}")
        
        print(f"[EXTRACT] 매칭 태그 없음: {type_name}")
        return None

    async def process_userchat_data(self, data: List[Dict]) -> pd.DataFrame:
        """UserChat 데이터를 처리하여 DataFrame으로 변환합니다."""
        # 필요한 필드들만 추출
        keep_keys = [
            "userId",
            "mediumType", 
            "workflowId",
            "tags",
            "chats",
            "createdAt",
            "firstAskedAt",
            "operationWaitingTime",
            "operationAvgReplyTime", 
            "operationTotalReplyTime",
            "operationResolutionTime"
        ]

        def convert_time(key, ms):
            """시간 데이터 변환 함수"""
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
            # userChats 데이터에서 필요한 필드들만 추출
            new_obj = {}
            
            print(f"[PROCESS] 원본 아이템 키들: {list(item.keys())}")
            print(f"[PROCESS] 원본 tags: {item.get('tags', 'NOT_FOUND')}")
            
            for key in keep_keys:
                value = item.get(key)
                
                # workflowId는 source에서 추출
                if key == "workflowId":
                    value = item.get("source", {}).get("workflow", {}).get("id")
                elif key in ["firstAskedAt", "operationWaitingTime", "operationAvgReplyTime", "operationTotalReplyTime", "operationResolutionTime"]:
                    value = convert_time(key, item.get(key))
                
                new_obj[key] = value
            
            # 태그에서 카테고리 정보 추출
            tags = new_obj.get("tags", [])
            print(f"[PROCESS] 아이템 {len(processed_data)} 태그: {tags}")
            
            # 최종 처리된 아이템 (필요한 필드들만)
            고객유형 = self.extract_level(tags, "고객유형", 1)
            문의유형 = self.extract_level(tags, "문의유형", 1)
            서비스유형 = self.extract_level(tags, "서비스유형", 1)
            문의유형_2차 = self.extract_level(tags, "문의유형", 2)
            서비스유형_2차 = self.extract_level(tags, "서비스유형", 2)
            
            print(f"[PROCESS] 추출 결과 - 고객유형: {고객유형}, 문의유형: {문의유형}, 서비스유형: {서비스유형}")
            
            processed_item = {
                **new_obj,  # 기본 필드들 (chats 포함)
                # 태그에서 추출한 카테고리들
                "고객유형": 고객유형,
                "문의유형": 문의유형,
                "서비스유형": 서비스유형,
                "문의유형_2차": 문의유형_2차,
                "서비스유형_2차": 서비스유형_2차,
            }
            processed_data.append(processed_item)
        
        # DataFrame 생성 후 필수 컬럼 보장
        df = pd.DataFrame(processed_data)
        
        # 필수 컬럼들이 없으면 빈 값으로 생성
        required_columns = [
            "고객유형", "문의유형", "서비스유형", 
            "문의유형_2차", "서비스유형_2차",
            "firstAskedAt", "operationWaitingTime", 
            "operationAvgReplyTime", "operationTotalReplyTime", 
            "operationResolutionTime"
        ]
        
        for col in required_columns:
            if col not in df.columns:
                print(f"[PROCESS] 필수 컬럼 누락, 빈 값으로 생성: {col}")
                df[col] = None
        
        print(f"[PROCESS] 최종 컬럼 목록: {list(df.columns)}")
        print(f"[PROCESS] 데이터 처리 완료: {len(df)} 건")
        
        return df

# 전역 API 클라이언트 인스턴스
channel_api = ChannelTalkAPI()

# 서버 캐시 시스템
class ServerCache:
    def __init__(self, cache_dir=None):
        # 강제 지정된 절대경로 사용
        if cache_dir is None:
            self.cache_dir = CACHE_DIR  # 전역 변수 사용
        else:
            self.cache_dir = cache_dir
        print(f"[CACHE] ServerCache 초기화 - 캐시 디렉토리: {os.path.abspath(self.cache_dir)}")
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
        """데이터와 메타데이터 저장 (saved_at 포함)"""
        try:
            # 캐시 디렉토리 확인 및 생성
            self.ensure_cache_dir()
            
            # 실전 서비스 수준 메타데이터 구조
            metadata.update({
                "saved_at": datetime.now().isoformat(),
                "data_count": len(data),
                "cache_version": "1.0"
            })
            
            # 데이터 저장
            data_path = self.get_cache_path(cache_key)
            print(f"[CACHE] 데이터 저장 경로: {data_path}")
            data.to_pickle(data_path)
            
            # 메타데이터 저장
            metadata_path = self.get_metadata_path(cache_key)
            print(f"[CACHE] 메타데이터 저장 경로: {metadata_path}")
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
            print(f"[CACHE] 데이터 저장 완료: {cache_key} (저장시간: {metadata['saved_at']})")
            return True
        except Exception as e:
            print(f"[CACHE] 데이터 저장 실패: {e}")
            print(f"[CACHE] 현재 작업 디렉토리: {os.getcwd()}")
            print(f"[CACHE] 캐시 디렉토리: {self.cache_dir}")
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
    
    def is_cache_still_valid(self, metadata: Dict) -> bool:
        """실전 서비스 수준 캐시 유효성 검사 - saved_at 기준 24시간 이내면 True"""
        if not metadata or "saved_at" not in metadata:
            return False
        try:
            saved_at = pd.to_datetime(metadata["saved_at"])
            hours_since_save = (datetime.now() - saved_at).total_seconds() / 3600
            is_valid = hours_since_save < CACHE_EXPIRE_HOURS
            print(f"[CACHE] 캐시 유효성: {is_valid} (경과: {hours_since_save:.1f}시간)")
            return is_valid
        except Exception as e:
            print(f"[CACHE] 캐시 유효성 검사 실패: {e}")
            return False

    def is_cache_valid(self, metadata: Dict, start_date: str, end_date: str) -> bool:
        """캐시 유효성 검사 - 24시간 만료 + firstAskedAt 기준"""
        if not metadata:
            return False
        
        try:
            # 1. 24시간 만료 체크
            if not self.is_cache_still_valid(metadata):
                return False
            
            # 2. firstAskedAt 범위 체크
            cache_start = metadata.get("first_asked_start")
            cache_end = metadata.get("first_asked_end")
            
            if not cache_start or not cache_end:
                print(f"[CACHE] 캐시 메타데이터에 firstAskedAt 범위 없음")
                return False
            
            # 요청 기간의 firstAskedAt이 캐시 범위에 포함되는지 확인
            request_start = pd.to_datetime(start_date)
            request_end = pd.to_datetime(end_date)
            cache_start_dt = pd.to_datetime(cache_start)
            cache_end_dt = pd.to_datetime(cache_end)
            
            # 요청 기간이 캐시 범위에 완전히 포함되는지 확인
            if request_start >= cache_start_dt and request_end <= cache_end_dt:
                print(f"[CACHE] 캐시 유효함 (24시간 내 + firstAskedAt 범위 포함)")
                return True
            else:
                print(f"[CACHE] 캐시 만료됨 (firstAskedAt 범위 벗어남)")
                return False
                
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
    """실전 서비스 수준 캐시 데이터 가져오기 - 모든 월 캐시 유효하면 캐시만, 아니면 필요한 월만 fetch"""
    print(f"[CACHE] 데이터 요청: {start_date} ~ {end_date}")
    
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
    
    # 캐시 디렉토리 생성 확인
    server_cache.ensure_cache_dir()
    
    # 1. 필요한 월들 확인
    months = _get_required_months(start_date, end_date)
    print(f"[CACHE] 필요한 월들: {months}")
    
    all_data = []
    fetch_needed_months = []
    
    # 2. 월별로 캐시 체크
    for month in months:
        cache_key = f"userchats_{month}"
        cached_df, metadata = server_cache.load_data(cache_key)
        
        if cached_df is not None and server_cache.is_cache_still_valid(metadata):
            print(f"[CACHE] 월 캐시 유효: {month}")
            all_data.append(cached_df)
        else:
            print(f"[CACHE] 월 캐시 없음 또는 만료: {month}")
            fetch_needed_months.append(month)
    
    # 3. 외부 fetch 필요한 월만 fetch & 캐시저장
    for month in fetch_needed_months:
        try:
            month_start = pd.Period(month, freq='M').start_time.strftime("%Y-%m-%d")
            month_end = pd.Period(month, freq='M').end_time.strftime("%Y-%m-%d")
            
            print(f"[CACHE] 월 데이터 fetch: {month} ({month_start} ~ {month_end})")
            userchats_data = await channel_api.get_userchats(month_start, month_end)
            
            if userchats_data:
                df = await channel_api.process_userchat_data(userchats_data)
                
                # 실전 서비스 수준 메타데이터
                meta = {
                    "saved_at": datetime.now().isoformat(),
                    "start_date": month_start,
                    "end_date": month_end,
                    "data_count": len(df),
                    "first_asked_start": df["firstAskedAt"].min().isoformat() if not df.empty and df["firstAskedAt"].min() is not None else None,
                    "first_asked_end": df["firstAskedAt"].max().isoformat() if not df.empty and df["firstAskedAt"].max() is not None else None,
                    "cache_version": "1.0"
                }
                server_cache.save_data(cache_key, df, meta)
                all_data.append(df)
                print(f"[CACHE] 월 캐시 저장 완료: {month} ({len(df)} 건)")
            else:
                print(f"[CACHE] 월 데이터 없음: {month}")
                all_data.append(pd.DataFrame())
                
        except Exception as e:
            print(f"[CACHE] 월 데이터 fetch 실패: {month} - {e}")
            all_data.append(pd.DataFrame())
    
    # 4. 데이터 합치고 필터링
    if not all_data:
        print(f"[CACHE] 데이터 없음")
        return pd.DataFrame()
    
    combined = pd.concat(all_data, ignore_index=True)
    
    # 중복 제거
    if 'userId' in combined.columns:
        combined = combined.drop_duplicates(subset=['userId'], keep='first')
    
    # 날짜 범위 필터링 후 반환
    final_data = server_cache.filter_data_by_date_range(combined, start_date, end_date)
    print(f"[CACHE] 최종 데이터 반환: {len(final_data)} 건")
    return final_data
            

def get_filtered_df(df: pd.DataFrame, 고객유형="전체", 문의유형="전체", 서비스유형="전체", 
                   문의유형_2차="전체", 서비스유형_2차="전체") -> pd.DataFrame:
    """필터링된 DataFrame을 반환합니다. (제공해주신 전처리 코드 방식 적용)"""
    temp = df.copy()
    
    # 필수 컬럼 존재 여부 확인 및 생성
    required_columns = ["고객유형", "문의유형", "서비스유형", "문의유형_2차", "서비스유형_2차"]
    for col in required_columns:
        if col not in temp.columns:
            print(f"[FILTER] 필수 컬럼 누락, 빈 값으로 생성: {col}")
            temp[col] = None
    
    # 2. 카테고리별 필터링 (제공해주신 전처리 코드의 keep_keys 방식)
    if 고객유형 != "전체" and "고객유형" in temp.columns: 
        temp = temp[temp["고객유형"] == 고객유형]
    if 문의유형 != "전체" and "문의유형" in temp.columns: 
        temp = temp[temp["문의유형"] == 문의유형]
    if 문의유형_2차 != "전체" and "문의유형_2차" in temp.columns: 
        temp = temp[temp["문의유형_2차"] == 문의유형_2차]
    if 서비스유형 != "전체" and "서비스유형" in temp.columns: 
        temp = temp[temp["서비스유형"] == 서비스유형]
    if 서비스유형_2차 != "전체" and "서비스유형_2차" in temp.columns: 
        temp = temp[temp["서비스유형_2차"] == 서비스유형_2차]
    
    # 3. 필수 키들이 있는지 확인하고 정리
    required_keys = ["userId", "mediumType", "workflowId", "tags", "firstAskedAt"]
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

 