import os
import httpx
import pandas as pd
import json
import pickle
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import asyncio
from dotenv import load_dotenv

print("====[CS_UTILS.PY 코드가 Docker에서 로드되었습니다]====")

CACHE_EXPIRE_HOURS = 24

def get_cache_directory():
    is_docker = os.getenv('DOCKER_ENV') or os.path.exists('/.dockerenv')
    is_render = os.getenv('RENDER') or os.path.exists('/opt/render')
    
    if is_docker or is_render:
        cache_dir = os.getenv('CACHE_DIR', '/data/cache')
        print(f"[DEBUG] Docker/Render 환경 감지됨 - Persistent Disk 캐시 디렉토리: {cache_dir}")
    else:
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        cache_dir = os.path.join(project_root, 'cache')
        print(f"[DEBUG] 로컬 환경 - 캐시 디렉토리: {cache_dir}")
    
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
        print(f"[DEBUG] 캐시 디렉토리 생성: {cache_dir}")
    
    return cache_dir

CACHE_DIR = get_cache_directory()
print(f"[DEBUG] 최종 설정된 캐시 디렉토리: {CACHE_DIR}")
print(f"[DEBUG] 캐시 디렉토리 내 파일: {os.listdir(CACHE_DIR) if os.path.exists(CACHE_DIR) else '디렉토리 없음'}")

load_dotenv()

class ChannelTalkAPI:
    def __init__(self):
        self.base_url = "https://api.channel.io"
        self.access_key = os.getenv("CHANNEL_ACCESS_KEY")
        self.access_secret = os.getenv("CHANNEL_ACCESS_SECRET")
        self.headers = {
            "x-access-key": self.access_key,
            "x-access-secret": self.access_secret,
            "Content-Type": "application/json"
        }

    async def get_all_users(self, limit: int = 100) -> List[Dict]:
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        url = f"{self.base_url}/open/v5/users"
        params = {"limit": limit}
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            data = response.json()
            return data.get('users', [])

    async def get_userchats(self, start_date: str, end_date: str, limit: int = 1000) -> List[Dict]:
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        start_timestamp = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000)
        end_timestamp = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)
        
        all_userchats = []
        since = None
        page_count = 0
        max_pages = 10
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
                    
                    if not user_chats:
                        print("[API] 더 이상 userChats 없음, 종료")
                        break
                    
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
                    
                    if not next_value or not str(next_value).strip():
                        print("[API] next 없음, 종료")
                        break
                    
                    if next_value == last_next:
                        consecutive_same_next += 1
                        print(f"[API] 동일 next 반복 {consecutive_same_next}회 | next: {next_value}")
                        if consecutive_same_next >= 2:
                            print("[API] 무한루프 방지, 종료")
                            break
                    else:
                        consecutive_same_next = 0
                    
                    if user_chats:
                        latest_chat = user_chats[0]
                        latest_timestamp = latest_chat.get("firstAskedAt")
                        if latest_timestamp and latest_timestamp < start_timestamp:
                            print(f"[API] 최신 데이터({latest_timestamp})가 요청 기간({start_timestamp})보다 이전, 종료")
                            break
                    
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
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        url = f"{self.base_url}/open/v5/user-chats/{userchat_id}"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()

    def hms_to_seconds(self, time_str: str) -> int:
        """HH:MM:SS 형식의 시간 문자열을 초 단위로 변환"""
        try:
            hours, minutes, seconds = map(int, time_str.split(':'))
            return hours * 3600 + minutes * 60 + seconds
        except:
            return 0

    def extract_level(self, tags: List[str], type_name: str, level: int) -> Optional[str]:
        """태그에서 특정 타입의 레벨을 추출합니다."""
        if not tags:
            print(f"[EXTRACT] 태그 없음: {type_name}")
            return None
        
        print(f"[EXTRACT] 태그 목록: {tags}")
        print(f"[EXTRACT] 찾는 타입: {type_name}, 레벨: {level}")
        
        for tag in tags:
            if tag.startswith(f"{type_name}/"):
                parts = tag.split("/")
                if len(parts) > level:
                    result = parts[level]
                    print(f"[EXTRACT] 매칭 태그: {tag}, 파트: {parts}, 추출 결과: {result}")
                    return result
                else:
                    print(f"[EXTRACT] 레벨 부족: {len(parts)} <= {level}")
        
        print(f"[EXTRACT] 매칭 태그 없음: {type_name}")
        return None

    async def process_userchat_data(self, data: List[Dict]) -> pd.DataFrame:
        keep_keys = [
            "userId", "mediumType", "workflowId", "tags", "chats", "createdAt", 
            "firstAskedAt", "operationWaitingTime", "operationAvgReplyTime", 
            "operationTotalReplyTime", "operationResolutionTime"
        ]

        def convert_time(key, ms):
            if ms is None:
                return None
            try:
                if key == "firstAskedAt":
                    # 💡 항상 pandas.Timestamp로 변환!
                    if isinstance(ms, str):
                        return pd.to_datetime(ms, errors='coerce')
                    elif isinstance(ms, (int, float)):
                        return pd.to_datetime(ms, unit='ms')
                    elif isinstance(ms, (pd.Timestamp, datetime)):
                        return ms
                    else:
                        return pd.NaT
                else:
                    from datetime import timedelta
                    td = timedelta(milliseconds=ms)
                    total_seconds = int(td.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    return f"{hours:02}:{minutes:02}:{seconds:02}"
            except Exception as e:
                print(f"[convert_time] 오류 key={key} value={ms}: {e}")
                return None

        processed_data = []
        
        for idx, item in enumerate(data):
            # firstAskedAt 존재 여부 체크
            first_asked_at = item.get("firstAskedAt")
            if first_asked_at is None:
                print(f"[PROCESS] 아이템 #{idx} - firstAskedAt 없음, 스킵")
                continue
            
            print(f"[PROCESS] 원본 아이템 #{idx} 키들: {list(item.keys())}")
            tags = item.get('tags', [])
            print(f"[PROCESS] 아이템 #{idx} tags: {tags}")

            new_obj = {}
            for key in keep_keys:
                value = item.get(key)
                if key == "workflowId":
                    value = item.get("source", {}).get("workflow", {}).get("id")
                elif key in ["firstAskedAt", "operationWaitingTime", "operationAvgReplyTime", "operationTotalReplyTime", "operationResolutionTime"]:
                    value = convert_time(key, value)
                new_obj[key] = value

            고객유형_1차 = self.extract_level(tags, "고객유형", 1)
            고객유형_2차 = self.extract_level(tags, "고객유형", 2)
            문의유형_1차 = self.extract_level(tags, "문의유형", 1)
            문의유형_2차 = self.extract_level(tags, "문의유형", 2)
            서비스유형_1차 = self.extract_level(tags, "서비스유형", 1)
            서비스유형_2차 = self.extract_level(tags, "서비스유형", 2)

            고객유형 = f"{고객유형_1차}/{고객유형_2차}" if 고객유형_1차 and 고객유형_2차 else 고객유형_1차
            문의유형 = f"{문의유형_1차}/{문의유형_2차}" if 문의유형_1차 and 문의유형_2차 else 문의유형_1차
            서비스유형 = f"{서비스유형_1차}/{서비스유형_2차}" if 서비스유형_1차 and 서비스유형_2차 else 서비스유형_1차

            print(f"[PROCESS] 추출 결과 - 고객유형: {고객유형}, 문의유형: {문의유형}, 서비스유형: {서비스유형}")

            processed_item = {
                **new_obj,
                "고객유형": 고객유형,
                "문의유형": 문의유형,
                "서비스유형": 서비스유형,
                "고객유형_1차": 고객유형_1차,
                "문의유형_1차": 문의유형_1차,
                "서비스유형_1차": 서비스유형_1차,
                "고객유형_2차": 고객유형_2차,
                "문의유형_2차": 문의유형_2차,
                "서비스유형_2차": 서비스유형_2차,
            }
            processed_data.append(processed_item)

        df = pd.DataFrame(processed_data)

        # firstAskedAt 컬럼 전체 타입 강제변환 (진짜 안전하게!)
        if "firstAskedAt" in df.columns:
            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors="coerce")

        # 필수 컬럼들이 없으면 빈 값으로 생성
        required_columns = [
            "고객유형", "문의유형", "서비스유형",
            "고객유형_1차", "문의유형_1차", "서비스유형_1차",
            "고객유형_2차", "문의유형_2차", "서비스유형_2차",
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

channel_api = ChannelTalkAPI()

class ServerCache:
    def __init__(self, cache_dir=None):
        if cache_dir is None:
            self.cache_dir = CACHE_DIR
        else:
            self.cache_dir = cache_dir
        print(f"[CACHE] ServerCache 초기화 - 캐시 디렉토리: {os.path.abspath(self.cache_dir)}")
        self.ensure_cache_dir()
    
    def ensure_cache_dir(self):
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)
    
    def get_cache_path(self, cache_key: str) -> str:
        return os.path.join(self.cache_dir, f"{cache_key}.pkl")
    
    def get_metadata_path(self, cache_key: str) -> str:
        return os.path.join(self.cache_dir, f"{cache_key}_metadata.json")
    
    def save_data(self, cache_key: str, data: pd.DataFrame, metadata: Dict):
        print(f"====[save_data 진입]==== key={cache_key}, 데이터길이={len(data)}")
        print(f"cache_key: {cache_key}")
        print(f"data type: {type(data)}, len: {len(data)}")
        print(f"data columns: {getattr(data, 'columns', 'N/A')}")
        print(f"data.empty: {getattr(data, 'empty', 'N/A')}")
        if hasattr(data, 'head'):
            print(f"data.head():\n{data.head()}")
        
        try:
            self.ensure_cache_dir()
            metadata.update({
                "saved_at": datetime.now().isoformat(),
                "data_count": len(data),
                "cache_version": "1.0"
            })
            
            # 💡 firstAskedAt 컬럼 전체 타입 강제변환
            print(f"[DEBUG] 'firstAskedAt' in data.columns: {'firstAskedAt' in data.columns}")
            print(f"[DEBUG] not data.empty: {not data.empty}")
            if "firstAskedAt" in data.columns and not data.empty:
                print(f"[DEBUG] 원본 firstAskedAt dtype: {data['firstAskedAt'].dtype}")
                print(f"[DEBUG] 원본 firstAskedAt 샘플: {data['firstAskedAt'].head(10).tolist()}")
                
                data["firstAskedAt"] = pd.to_datetime(data["firstAskedAt"], errors="coerce")
                print(f"[DEBUG] 변환 후 firstAskedAt dtype: {data['firstAskedAt'].dtype}")
                print(f"[DEBUG] 변환 후 firstAskedAt 샘플: {data['firstAskedAt'].head(10).tolist()}")
                
                valid_times = data["firstAskedAt"].dropna()
                print(f"[DEBUG] dropna 후 valid_times 개수: {len(valid_times)}")
                print(f"[DEBUG] valid_times 샘플: {valid_times.head(10).tolist()}")

                def safe_to_iso(val):
                    if isinstance(val, (pd.Timestamp, datetime)):
                        if pd.isna(val):
                            return ""
                        return val.isoformat()
                    if isinstance(val, str):
                        try:
                            dt = pd.to_datetime(val, errors="coerce")
                            if pd.isna(dt):
                                return ""
                            return dt.isoformat()
                        except Exception as e:
                            print(f"[CACHE] safe_to_iso: str 변환 실패 {val}: {e}")
                            return ""
                    return ""
                
                if not valid_times.empty:
                    start_val = valid_times.min()
                    end_val = valid_times.max()
                    print(f"[DEBUG] min: {start_val} (type: {type(start_val)})")
                    print(f"[DEBUG] max: {end_val} (type: {type(end_val)})")
                else:
                    start_val = ""
                    end_val = ""
                    print(f"[DEBUG] valid_times가 비어있음 - 빈 문자열로 설정")
                
                metadata["first_asked_start"] = safe_to_iso(start_val)
                metadata["first_asked_end"] = safe_to_iso(end_val)
            else:
                print("[DEBUG] firstAskedAt 조건문 진입 안됨 - 컬럼 없거나 데이터 비어있음")

            data_path = self.get_cache_path(cache_key)
            data.to_pickle(data_path)
            metadata_path = self.get_metadata_path(cache_key)
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            print(f"[CACHE] 데이터 저장 완료: {cache_key}")
            return True
        except Exception as e:
            print(f"[CACHE] 데이터 저장 실패: {e}")
            import traceback
            print(f"[CACHE] 상세 오류: {traceback.format_exc()}")
            return False
    # 이하 동일 (생략)
server_cache = ServerCache()
