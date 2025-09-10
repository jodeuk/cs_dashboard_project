import os
import httpx
import pandas as pd
import numpy as np
import json
import pickle
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Tuple
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

    async def _ensure_keys(self):
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
    async def get_all_users(self, limit: int = 100) -> List[Dict]:
        await self._ensure_keys()
        url = f"{self.base_url}/open/v5/users"
        params = {"limit": limit}
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=self.headers, params=params)
            r.raise_for_status()
            return r.json().get("users", [])

    async def get_userchats(self, start_date: str, end_date: str, limit: int = 1000) -> List[Dict]:
        await self._ensure_keys()
        start_ts = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000)
        end_ts = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)

        all_userchats, since, page_count = [], None, 0
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
                    resp = await client.get(url, headers=self.headers, params=params)
                    resp.raise_for_status()
                    data = resp.json()

                user_chats = data.get("userChats", [])
                next_value = data.get("next")
                
                if not user_chats:
                    break
                
                for chat in user_chats:
                    user_id = chat.get("userId")
                    if user_id and user_id not in collected_ids:
                        all_userchats.append(chat)
                        collected_ids.add(user_id)
                
                if not next_value or not str(next_value).strip():
                    break
                
                if next_value == last_next:
                    consecutive_same_next += 1
                    if consecutive_same_next >= 2:
                        break
                else:
                    consecutive_same_next = 0
                
                if user_chats:
                    latest_ts = user_chats[0].get("firstAskedAt")
                    if latest_ts and latest_ts < start_ts:
                        break
                
                since = next_value
                last_next = next_value
                    
        except Exception as e:
            print(f"[get_userchats] 오류: {e}")
            raise
        
        print(f"[API] 총 수집된 채팅 수: {len(all_userchats)} (기간: {start_date} ~ {end_date})")
        return all_userchats

    async def get_userchat_by_id(self, userchat_id: str) -> Dict:
        await self._ensure_keys()
        url = f"{self.base_url}/open/v5/user-chats/{userchat_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=self.headers)
            r.raise_for_status()
            return r.json()

    async def get_messages(self, start_date: str, end_date: str, limit: int = 1000) -> List[Dict]:
        await self._ensure_keys()
        start_ts = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000)
        end_ts = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)

        all_messages, since, page_count = [], None, 0
        max_pages = 10
        collected_ids = set()
        
        try:
            while page_count < max_pages:
                page_count += 1
                url = f"{self.base_url}/open/v5/messages"
                params = {"limit": limit}
                if since:
                    params["since"] = since

                async with httpx.AsyncClient(timeout=30.0) as client:
                    r = await client.get(url, headers=self.headers, params=params)
                    r.raise_for_status()
                    data = r.json()
                    messages = data.get("messages", [])
                    next_value = data.get("next")

                    if not messages:
                        break

                    filtered = []
                    for m in messages:
                        mid = m.get("id")
                        if mid not in collected_ids:
                            created = m.get("createdAt")
                            if created and start_ts <= created <= end_ts:
                                filtered.append(m)
                                collected_ids.add(mid)
                    all_messages.extend(filtered)

                    if not next_value or not str(next_value).strip():
                        break
                    since = next_value
        except Exception as e:
            print(f"[get_messages] 오류: {e}")
            raise

        print(f"[MESSAGES API] 총 수집된 메시지 수: {len(all_messages)} (기간: {start_date} ~ {end_date})")
        return all_messages

    # ▼ 신규: 특정 userChat의 메시지 전부(pagination) 조회
    async def get_messages_by_chat(self, user_chat_id: str, limit: int = 500, sort_order: str = "desc") -> List[Dict]:
        await self._ensure_keys()
        url = f"{self.base_url}/open/v5/user-chats/{user_chat_id}/messages"
        since = None
        out: List[Dict] = []
        guard = 0
        try:
            while True:
                params = {"limit": limit, "sortOrder": sort_order}
                if since:
                    params["since"] = since
                async with httpx.AsyncClient(timeout=30.0) as client:
                    r = await client.get(url, headers=self.headers, params=params)
                    r.raise_for_status()
                    data = r.json()
                    msgs = data.get("messages", [])
                    next_value = data.get("next")
                    out.extend(msgs)
                    if not next_value:
                        break
                    since = next_value
                    guard += 1
                    if guard > 50:
                        break
        except Exception as e:
            print(f"[get_messages_by_chat] 오류: chatId={user_chat_id}, {e}")
            raise
        return out

    def hms_to_seconds(self, time_str: str) -> int:
        try:
            hours, minutes, seconds = map(int, time_str.split(':'))
            return hours * 3600 + minutes * 60 + seconds
        except:
            return 0

    def extract_level(self, tags: List[str], type_name: str, level: int) -> Optional[str]:
        if not tags:
            return None
        for tag in tags:
            if tag.startswith(f"{type_name}/"):
                parts = tag.split("/")
                if len(parts) > level:
                    # level 1 = parts[1], level 2 = parts[2] (0번째는 타입명)
                    return parts[level]
        return None

    async def process_userchat_data(self, data: List[Dict]) -> pd.DataFrame:
        keep_keys = [
            "userId", "personId", "mediumType", "workflowId", "tags", "chats", "createdAt", 
            "firstAskedAt", "operationWaitingTime", "operationAvgReplyTime", 
            "operationTotalReplyTime", "operationResolutionTime"
        ]

        def convert_time(key, ms):
            if ms is None:
                return None
            try:
                if key == "firstAskedAt":
                    if isinstance(ms, str):
                        return pd.to_datetime(ms, errors='coerce')
                    elif isinstance(ms, (int, float)):
                        return pd.to_datetime(ms, unit='ms')
                    elif isinstance(ms, (pd.Timestamp, datetime)):
                        return ms
                    else:
                        return pd.NaT
                else:
                    td = timedelta(milliseconds=ms)
                    total_seconds = int(td.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    return f"{hours:02}:{minutes:02}:{seconds:02}"
            except Exception:
                return None

        processed_data = []
        for item in data:
            first_asked_at = item.get("firstAskedAt")
            if first_asked_at is None:
                continue
            
            tags = item.get('tags', [])
            new_obj = {}
            for key in keep_keys:
                value = item.get(key)
                if key == "workflowId":
                    value = item.get("source", {}).get("workflow", {}).get("id")
                elif key in ["firstAskedAt", "operationWaitingTime", "operationAvgReplyTime", "operationTotalReplyTime", "operationResolutionTime"]:
                    value = convert_time(key, value)
                new_obj[key] = value

            # 태그 처리 과정 로깅
            print(f"[TAGS] 아이템 태그: {tags}")

            고객유형_1차 = self.extract_level(tags, "고객유형", 1)
            고객유형_2차 = self.extract_level(tags, "고객유형", 2)
            문의유형_1차 = self.extract_level(tags, "문의유형", 1)
            문의유형_2차 = self.extract_level(tags, "문의유형", 2)
            서비스유형_1차 = self.extract_level(tags, "서비스유형", 1)
            서비스유형_2차 = self.extract_level(tags, "서비스유형", 2)

            # 1차 분류만 사용 (2차 분류 제거)
            고객유형 = 고객유형_1차
            문의유형 = 문의유형_1차
            서비스유형 = 서비스유형_1차
            
            print(f"[EXTRACT] 문의유형: {문의유형} (1차: {문의유형_1차}, 2차: {문의유형_2차})")

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
                # userChat id
                "userChatId": item.get("id") or item.get("chatId") or item.get("mainKey", "").replace("userChat-", "")
            }
            processed_data.append(processed_item)

        df = pd.DataFrame(processed_data)
        if "firstAskedAt" in df.columns:
            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors="coerce")

        required_columns = [
            "고객유형", "문의유형", "서비스유형",
            "고객유형_1차", "문의유형_1차", "서비스유형_1차",
            "고객유형_2차", "문의유형_2차", "서비스유형_2차",
            "firstAskedAt", "operationWaitingTime",
            "operationAvgReplyTime", "operationTotalReplyTime",
            "operationResolutionTime", "userChatId", "userId", "personId"
        ]
        for col in required_columns:
            if col not in df.columns:
                df[col] = None

        return df

    # ▼ 신규: 메시지 배열에서 CSAT 설문 추출
    def extract_csat_from_messages(self, msgs: List[Dict], allowed_trigger_ids: Optional[set] = None) -> Dict:
        """
        반환 예시:
        {
          "A-1": 4, "A-2": 3, "comment_3": "텍스트",
          "A-4": 4, "A-5": 4, "comment_6": "텍스트",
          "csatSubmittedAt": "2025-08-07T16:47:45+09:00",
          "personId": "person_123"
        }
        """
        result = {}
        latest_submit_ts = None
        person_id = None

        def norm_label(label: str) -> Optional[str]:
            if not isinstance(label, str):
                return None
            s = label.strip()
            # 숫자. 로 시작하는 레이블 → A-n 매핑
            # 1. 상담원의 친절도..., 2. 문제 해결..., 4. 기능 안정성..., 5. 디자인...
            if s.startswith("1."): return "A-1"
            if s.startswith("2."): return "A-2"
            if s.startswith("4."): return "A-4"
            if s.startswith("5."): return "A-5"
            # 3/6 텍스트 응답은 코멘트 키
            if s.startswith("3."): return "comment_3"
            if s.startswith("6."): return "comment_6"
            # 업로드 Excel과 맞추기 위한 백업 라벨
            if "친절도" in s: return "A-1"
            if "문제 해결" in s: return "A-2"
            if "안정성" in s: return "A-4"
            if "디자인" in s: return "A-5"
            return None

        for m in msgs:
            # ▼ 추가: triggerId(= workflow 트리거) 우선 필터
            if allowed_trigger_ids:
                log = m.get("log") or {}
                trig_ok = (log.get("triggerType") == "workflow" and str(log.get("triggerId")) in allowed_trigger_ids)

                # 보수적으로, message.workflow.id 도 허용 (둘 중 하나라도 매치되면 통과)
                wf = (m.get("workflow") or {}).get("id")
                wf_ok = (wf is not None and str(wf) in allowed_trigger_ids)

                if not (trig_ok or wf_ok):
                    continue

            # personId 추출 (personType: "user"인 메시지에서만)
            if person_id is None and m.get("personType") == "user":
                person_id = m.get("personId") or m.get("person", {}).get("id")

            form = m.get("form")
            if not form:
                continue
            inputs = form.get("inputs") or []
            submitted_at = form.get("submittedAt")
            if submitted_at:
                latest_submit_ts = max(latest_submit_ts or submitted_at, submitted_at)
            for inp in inputs:
                label = norm_label(inp.get("label"))
                if not label:
                    continue
                val = inp.get("value")
                if label.startswith("A-"):
                    try:
                        result[label] = int(val) if val is not None else None
                    except Exception:
                        result[label] = None
                elif label.startswith("comment_"):
                    result[label] = val if isinstance(val, str) else None

        if latest_submit_ts:
            try:
                # API timestamp(ms) → ISO with KST
                kst = timezone(timedelta(hours=9))
                dt = datetime.fromtimestamp(latest_submit_ts/1000, tz=kst)
                result["csatSubmittedAt"] = dt.isoformat()
            except Exception:
                pass
        
        # personId 추가
        if person_id:
            result["personId"] = person_id
            
        return result

    # ▼ 신규: CSAT 데이터가 있는 userChat만 필터링
    def filter_csat_userchats(self, userchats: List[Dict]) -> List[Dict]:
        """CSAT 데이터가 있는 userChat만 필터링 (workflowId: 768201)"""
        csat_chats = []
        for chat in userchats:
            # workflowId 확인
            workflow_id = chat.get("source", {}).get("workflow", {}).get("id")
            if workflow_id == "768201":
                csat_chats.append(chat)
        return csat_chats

channel_api = ChannelTalkAPI()

class ServerCache:
    def __init__(self, cache_dir=None):
        self.cache_dir = cache_dir or CACHE_DIR
        print(f"[CACHE] ServerCache 초기화 - 캐시 디렉토리: {os.path.abspath(self.cache_dir)}")
        self.ensure_cache_dir()
    
    def ensure_cache_dir(self):
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir, exist_ok=True)
    
    def get_cache_path(self, cache_key: str) -> str:
        return os.path.join(self.cache_dir, f"{cache_key}.pkl")
    
    def get_metadata_path(self, cache_key: str) -> str:
        return os.path.join(self.cache_dir, f"{cache_key}_metadata.json")
    
    def save_data(self, cache_key: str, data: pd.DataFrame, metadata: Dict):
        try:
            self.ensure_cache_dir()
            metadata.update({
                "saved_at": datetime.now().isoformat(),
                "data_count": len(data),
                "cache_version": "1.1"
            })
            if "firstAskedAt" in data.columns and not data.empty:
                data["firstAskedAt"] = pd.to_datetime(data["firstAskedAt"], errors="coerce")
                valid = data["firstAskedAt"].dropna()
                def safe_iso(x):
                    if isinstance(x, (pd.Timestamp, datetime)):
                        return x.isoformat()
                    try:
                        return pd.to_datetime(x, errors="coerce").isoformat()
                    except Exception:
                        return ""
                metadata["first_asked_start"] = safe_iso(valid.min()) if not valid.empty else ""
                metadata["first_asked_end"] = safe_iso(valid.max()) if not valid.empty else ""
            data_path = self.get_cache_path(cache_key)
            data.to_pickle(data_path)
            meta_path = self.get_metadata_path(cache_key)
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            print(f"[CACHE] 저장 완료: {cache_key} ({len(data)} rows)")
            return True
        except Exception as e:
            print(f"[CACHE] save_data 실패: {e}")
            return False
    
    def load_data(self, cache_key: str):
        data_path = self.get_cache_path(cache_key)
        meta_path = self.get_metadata_path(cache_key)
        if os.path.exists(data_path) and os.path.exists(meta_path):
            df = pd.read_pickle(data_path)
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            return df, meta
        return None, None

    def clear_all_cache(self) -> bool:
        try:
            for fn in os.listdir(self.cache_dir):
                if fn.endswith(".pkl") or fn.endswith("_metadata.json"):
                    os.remove(os.path.join(self.cache_dir, fn))
            return True
        except Exception as e:
            print(f"[CACHE] 전체 삭제 실패: {e}")
            return False
    
    def is_cache_still_valid(self, metadata: dict) -> bool:
        if not metadata or "saved_at" not in metadata:
            return False
        try:
            saved_at = pd.to_datetime(metadata["saved_at"])
            now = pd.Timestamp.now(tz=saved_at.tz if hasattr(saved_at, 'tz') else None)
            hours = (now - saved_at).total_seconds() / 3600
            return hours < CACHE_EXPIRE_HOURS
        except Exception:
            return False

    def filter_data_by_date_range(self, df: pd.DataFrame, start_date: str, end_date: str) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame()
        try:
            first = pd.to_datetime(df['firstAskedAt'], errors='coerce')
            if getattr(first.dt, "tz", None) is not None:
                first = first.dt.tz_convert('Asia/Seoul').dt.tz_localize(None)

            start_kst = pd.to_datetime(start_date)
            end_kst = pd.to_datetime(end_date) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)
            mask = (first >= start_kst) & (first <= end_kst)
            out = df.loc[mask].copy()
            return out
        except Exception as e:
            print(f"[CACHE] 날짜 범위 필터 실패: {e}")
            return pd.DataFrame()

# 전역 캐시 인스턴스
server_cache = ServerCache()

# === 캐시 병합 유틸 ===
def get_cached_data_month(month: str) -> Optional[pd.DataFrame]:
    cache_key = f"userchats_{month}"
    df, _ = server_cache.load_data(cache_key)
    return df

async def get_cached_data(start_date: str, end_date: str, refresh_mode: str = "cache") -> pd.DataFrame:
    """
    refresh_mode:
    - "cache": 기존 캐시만 사용 (기본값)
    - "update": 기존 캐시 유지 + 누락된 기간만 API 호출
    - "refresh": 기존 캐시 완전 삭제 + 전체 새로 수집
    """
    def _months(s, e):
        sm = pd.to_datetime(s).to_period('M')
        em = pd.to_datetime(e).to_period('M')
        cur = sm
        out = []
        while cur <= em:
            out.append(str(cur))
            cur += 1
        return out

    months = _months(start_date, end_date)
    all_data = []
    
    for month in months:
        if refresh_mode == "refresh":
            # 전체 갱신: 기존 캐시 무시하고 API 호출
            print(f"[REFRESH] {month} → userchats API 호출 후 저장")
            year, m = map(int, month.split('-'))
            start = datetime(year, m, 1).strftime("%Y-%m-%d")
            if m == 12:
                end = datetime(year+1, 1, 1) - timedelta(days=1)
            else:
                end = datetime(year, m+1, 1) - timedelta(days=1)
            end = end.strftime("%Y-%m-%d")
            try:
                userchats = await channel_api.get_userchats(start, end)
                if userchats:
                    df = await channel_api.process_userchat_data(userchats)
                    meta = {"month": month, "range": [start, end], "api_fetch": True}
                    server_cache.save_data(f"userchats_{month}", df, meta)
                    all_data.append(df)
            except Exception as e:
                print(f"[REFRESH] {month} 실패: {e}")
        elif refresh_mode == "update":
            # 최신화: 기존 캐시 우선, 없으면 API 호출
            df = get_cached_data_month(month)
            year, m = map(int, month.split('-'))
            current_year = datetime.now().year
            current_month = datetime.now().month
            
            if df is not None and not df.empty:
                if year == current_year and m == current_month:
                    # 현재 달(8월): 기존 캐시 + 새로운 데이터 추가
                    print(f"[UPDATE] {month} 현재 달 → 기존 캐시({len(df)} rows) + 새로운 데이터 추가")
                    start = datetime(year, m, 1).strftime("%Y-%m-%d")
                    if m == 12:
                        end = datetime(year+1, 1, 1) - timedelta(days=1)
                    else:
                        end = datetime(year, m+1, 1) - timedelta(days=1)
                    end = end.strftime("%Y-%m-%d")
                    try:
                        userchats = await channel_api.get_userchats(start, end)
                        if userchats:
                            new_df = await channel_api.process_userchat_data(userchats)
                            # 기존 데이터 + 새로운 데이터 합치기
                            combined_df = pd.concat([df, new_df], ignore_index=True)
                            # 중복 제거 (userChatId 기준 - 각 문의마다 고유)
                            combined_df = combined_df.drop_duplicates(subset=['userChatId'], keep='first')
                            # 업데이트된 캐시 저장
                            meta = {"month": month, "range": [start, end], "api_fetch": True, "updated": True}
                            server_cache.save_data(f"userchats_{month}", combined_df, meta)
                            print(f"[UPDATE] {month} 캐시 업데이트 완료: {len(df)} → {len(combined_df)} rows")
                            all_data.append(combined_df)
                        else:
                            print(f"[UPDATE] {month} 새로운 데이터 없음, 기존 캐시 사용")
                            all_data.append(df)
                    except Exception as e:
                        print(f"[UPDATE] {month} 현재 달 갱신 실패: {e}, 기존 캐시 사용")
                        all_data.append(df)
                else:
                    # 과거 달: 기존 캐시 사용
                    print(f"[UPDATE] {month} 과거 달 → 캐시 사용 ({len(df)} rows)")
                    all_data.append(df)
            else:
                # 캐시가 없는 경우: API 호출
                print(f"[UPDATE] {month} 캐시 없음 → API 호출")
                start = datetime(year, m, 1).strftime("%Y-%m-%d")
                if m == 12:
                    end = datetime(year+1, 1, 1) - timedelta(days=1)
                else:
                    end = datetime(year, m+1, 1) - timedelta(days=1)
                end = end.strftime("%Y-%m-%d")
                try:
                    userchats = await channel_api.get_userchats(start, end)
                    if userchats:
                        df = await channel_api.process_userchat_data(userchats)
                        meta = {"month": month, "range": [start, end], "api_fetch": True}
                        server_cache.save_data(f"userchats_{month}", df, meta)
                        all_data.append(df)
                except Exception as e:
                    print(f"[UPDATE] {month} API 호출 실패: {e}")
        else:  # refresh_mode == "cache"
            # 캐시만 사용: API 호출 안 함
            df = get_cached_data_month(month)
            if df is not None and not df.empty:
                print(f"[CACHE] {month} 로드 ({len(df)} rows)")
                all_data.append(df)
            else:
                print(f"[CACHE] {month} 없음 (API 호출 안 함)")
                
    print(f"[DEBUG] all_data 개수: {len(all_data)}")
    print(f"[DEBUG] all_data 각 월별 개수: {[len(df) if df is not None else 0 for df in all_data]}")
    
    if not all_data:
        print(f"[DEBUG] all_data가 비어있음 - 빈 DataFrame 반환")
        return pd.DataFrame()
    
    print(f"[DEBUG] pd.concat 시작 - 총 {sum(len(df) if df is not None else 0 for df in all_data)} rows)")
    try:
        combined = pd.concat(all_data, ignore_index=True)
        print(f"[DEBUG] pd.concat 완료: {len(combined)} rows")
    except Exception as e:
        print(f"[ERROR] pd.concat 실패: {type(e).__name__}: {e}")
        return pd.DataFrame()
    
    print(f"[DEBUG] firstAskedAt 컬럼 변환 시작")
    try:
        combined['firstAskedAt'] = pd.to_datetime(combined['firstAskedAt'], errors='coerce')
        print(f"[DEBUG] firstAskedAt 변환 완료: {combined['firstAskedAt'].notna().sum()}개 유효, {combined['firstAskedAt'].isna().sum()}개 NaN")
    except Exception as e:
        print(f"[ERROR] firstAskedAt 변환 실패: {type(e).__name__}: {e}")
        return pd.DataFrame()
    
    print(f"[DEBUG] 중복 제거 시작")
    try:
        before_dedup = len(combined)
        if 'userChatId' in combined.columns:
            combined = combined.drop_duplicates(subset=['userChatId'], keep='first')
        else:
            combined = combined.drop_duplicates(subset=['userId', 'firstAskedAt', 'createdAt'], keep='first')
        after_dedup = len(combined)
        print(f"[DEBUG] 중복 제거 완료: {before_dedup} → {after_dedup} rows")
    except Exception as e:
        print(f"[ERROR] 중복 제거 실패: {type(e).__name__}: {e}")
        return pd.DataFrame()

    print(f"[DEBUG] 날짜 필터링 시작")
    try:
        # 1) firstAskedAt → KST naive 로 정규화
        fa = pd.to_datetime(combined['firstAskedAt'], errors='coerce')
        # tz-aware(예: UTC) 인 경우만 Asia/Seoul로 변환 후 tz 제거
        if getattr(fa.dt, "tz", None) is not None:
            fa = fa.dt.tz_convert('Asia/Seoul').dt.tz_localize(None)
        combined['firstAskedAt'] = fa

        # 2) 비교 범위 (KST naive)
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)

        # 3) 디버그: 특정 날짜 점검(원하시면 날짜 바꿔서 보세요)
        # 특정 일자 카운트(예: 2025-08-19)
        if start_date == end_date:
            target_date = pd.to_datetime(start_date).date()
            same_day = (combined['firstAskedAt'].dt.date == target_date).sum()
            print(f"[DEBUG] same-day({target_date}) rows(before mask): {same_day}")

        print(f"[DEBUG] 날짜 범위: {start_date} ~ {end_date} (KST naive) → {start_dt} ~ {end_dt}")
        mask = (combined['firstAskedAt'] >= start_dt) & (combined['firstAskedAt'] <= end_dt)
        print(f"[DEBUG] 마스크 적용: {mask.sum()}개 True, {len(mask) - mask.sum()}개 False")
        
        result = combined[mask].reset_index(drop=True)
        print(f"[FILTER] 날짜 필터링 완료: {start_date} ~ {end_date} (KST) → {start_dt} ~ {end_dt} (KST)")
        print(f"[FILTER] 필터링 전: {len(combined)} rows, 필터링 후: {len(result)} rows")
        
    except Exception as e:
        print(f"[ERROR] 날짜 필터링 실패: {type(e).__name__}: {e}")
        return pd.DataFrame()
    
    # 🔧 refresh_mode="refresh"일 때만 CSAT 캐시도 함께 갱신
    if refresh_mode == "refresh":
        print(f"[REFRESH] CSAT 캐시도 함께 갱신 시작...")
        try:
            csat_count = await build_and_cache_csat_rows(start_date, end_date)
            print(f"[REFRESH] CSAT 캐시 갱신 완료: {csat_count} rows")
        except Exception as e:
            print(f"[REFRESH] CSAT 캐시 갱신 실패: {e}")
    
    return result

# === 신규: CSAT 캐시 빌드 ===
async def build_and_cache_csat_rows(start_date: str, end_date: str) -> int:
    """
    userchats 캐시(혹은 방금 새로고침된 데이터)를 바탕으로,
    각 userChat의 messages를 조회 → CSAT 설문 파싱 → 월별 csat 캐시 저장.
    반환: 저장된 row 총 개수
    """
    # 1) 사용자 문의 데이터 확보(캐시 기준, API 호출 없이 우선 시도)
    user_df = await get_cached_data(start_date, end_date, refresh_mode="cache")
    if user_df is None or user_df.empty:
        # 그래도 없다면, 이 함수는 새로고침 경로에서만 호출하도록 설계했으니
        # 강제 새로고침(=API 호출)로 한번 채워준다.
        user_df = await get_cached_data(start_date, end_date, refresh_mode="refresh")
        if user_df is None or user_df.empty:
            return 0

    # 2) CSAT 데이터가 있는 userChat만 필터링 (triggerId: 768201)
    print(f"[CSAT] 전체 userChat 수: {len(user_df)}")
    
    # userChat 레벨에서는 workflowId가 아니라 triggerId를 확인해야 함
    # 하지만 userChat 자체에는 triggerId가 없고, 메시지 레벨에서만 확인 가능
    # 따라서 모든 userChat을 대상으로 하고, 메시지 레벨에서 필터링
    csat_df = user_df.copy()
    print(f"[CSAT] 전체 userChat 대상 (메시지 레벨에서 triggerId 필터링)")

    # 3) 최근부터 역순으로 정렬 (효율적인 검색을 위해)
    csat_df = csat_df.sort_values("firstAskedAt", ascending=False)
    
    # 4) chatId 목록과 userId/firstAskedAt 매핑
    need_cols = ["userChatId", "userId", "firstAskedAt"]
    for c in need_cols:
        if c not in csat_df.columns:
            csat_df[c] = None
    sub = csat_df[need_cols].dropna(subset=["userChatId"]).drop_duplicates()

    # 5) 각 chatId의 메시지 조회 & CSAT 파싱
    rows = []
    processed_count = 0
    for _, row in sub.iterrows():
        chat_id = str(row["userChatId"])
        user_id = str(row["userId"]) if pd.notna(row["userId"]) else None
        asked_at = pd.to_datetime(row["firstAskedAt"], errors="coerce")
        if not chat_id or pd.isna(asked_at):
            continue

        try:
            print(f"[CSAT] 처리 중: {chat_id} ({processed_count + 1}/{len(sub)})")
            msgs = await channel_api.get_messages_by_chat(chat_id, limit=500, sort_order="desc")
            cs = channel_api.extract_csat_from_messages(msgs, allowed_trigger_ids={'768201'})
            if not cs:
                print(f"[CSAT] {chat_id}: CSAT 데이터 없음")
                continue
            print(f"[CSAT] {chat_id}: CSAT 데이터 발견 - {list(cs.keys())}")
            
            rows.append({
                "firstAskedAt": asked_at,
                "userId": user_id,
                "userChatId": chat_id,
                "personId": cs.get("personId"),  # personId 추가
                "A-1": cs.get("A-1"),
                "A-2": cs.get("A-2"),
                "comment_3": cs.get("comment_3"),
                "A-4": cs.get("A-4"),
                "A-5": cs.get("A-5"),
                "comment_6": cs.get("comment_6"),
                "csatSubmittedAt": cs.get("csatSubmittedAt")
            })
            processed_count += 1
        except Exception as e:
            print(f"[CSAT] chatId={chat_id} 파싱 실패: {e}")
            continue

    if not rows:
        print("[CSAT] 파싱된 CSAT 데이터가 없습니다.")
        return 0

    print(f"[CSAT] 총 {len(rows)}개의 CSAT 응답 파싱 완료")

    # 6) 월별로 쪼개서 저장 (userchats 캐시와 동일 정책)
    csat_df = pd.DataFrame(rows)
    
    # CSAT 캐시 레코드 컬럼 보장(디버그 편의)
    need = ["firstAskedAt","userId","userChatId","comment_3","comment_6","A-1","A-2","A-4","A-5","csatSubmittedAt","personId"]
    for c in need:
        if c not in csat_df.columns:
            csat_df[c] = None
    
    csat_df["firstAskedAt"] = pd.to_datetime(csat_df["firstAskedAt"], errors="coerce")

    # 7) 월별로 쪼개서 저장
    csat_df["month"] = csat_df["firstAskedAt"].dt.to_period("M").astype(str)
    total_saved = 0
    for month, mdf in csat_df.groupby("month"):
        mdf = mdf.drop(columns=["month"])
        key = f"csat_{month}"
        meta = {"month": month, "range": [start_date, end_date], "api_fetch": True, "kind": "csat"}
        ok = server_cache.save_data(key, mdf, meta)
        if ok:
            total_saved += len(mdf)
            print(f"[CSAT] {month} 저장 완료: {len(mdf)} rows")
    
    print(f"[CSAT] 총 {total_saved} rows 저장 완료")
    return total_saved

# === 신규: csat_raw.pkl에서 직접 로드 (triggerId 필터링) ===
def load_csat_raw_data() -> Optional[pd.DataFrame]:
    """csat_raw.pkl에서 원본 데이터를 로드합니다. triggerId: 768201만 유효."""
    try:
        df, meta = server_cache.load_data("csat_raw")
        if df is None or df.empty:
            print(f"[CSAT] csat_raw.pkl 데이터 없음")
            return None
        
        # triggerId 컬럼이 있는지 확인
        if "triggerId" in df.columns:
            # triggerId가 768201인 데이터만 필터링
            filtered_df = df[df["triggerId"] == "768201"].copy()
            print(f"[CSAT] csat_raw.pkl 로드 성공: {len(df)} rows → triggerId 768201 필터링: {len(filtered_df)} rows")
            return filtered_df
        else:
            # triggerId 컬럼이 없으면 전체 데이터 반환 (하위 호환성)
            print(f"[CSAT] csat_raw.pkl 로드 성공: {len(df)} rows (triggerId 컬럼 없음)")
            return df
            
    except Exception as e:
        print(f"[CSAT] csat_raw.pkl 로드 실패: {e}")
        return None

# === 신규: 캐시 로더(캐시 전용) - 수정됨 ===
def load_csat_rows_from_cache(start_date: str, end_date: str) -> pd.DataFrame:
    """
    CSAT 데이터를 로드합니다.
    1. 먼저 csat_YYYY-MM.pkl 파일들을 찾아봅니다
    2. 없으면 csat_raw.pkl에서 직접 로드합니다
    """
    def _months(s, e):
        sm = pd.to_datetime(s).to_period('M')
        em = pd.to_datetime(e).to_period('M')
        cur = sm
        out = []
        while cur <= em:
            out.append(str(cur))
            cur += 1
        return out

    # 1단계: 월별 캐시 파일들에서 로드 시도
    months = _months(start_date, end_date)
    frames = []
    for month in months:
        key = f"csat_{month}"
        df, _ = server_cache.load_data(key)
        if df is not None and not df.empty:
            frames.append(df)
    
    if frames:
        # 월별 캐시가 있으면 그것을 사용
        print(f"[CSAT] 월별 캐시에서 {len(frames)}개 파일 로드")
        out = pd.concat(frames, ignore_index=True)
    else:
        # 2단계: csat_raw.pkl에서 직접 로드
        print(f"[CSAT] 월별 캐시 없음, csat_raw.pkl에서 직접 로드")
        raw_df = load_csat_raw_data()
        if raw_df is None or raw_df.empty:
            return pd.DataFrame()
        
        # 날짜 컬럼 찾기
        date_col = None
        for col in raw_df.columns:
            if any(keyword in col.lower() for keyword in ['date', '날짜', 'created', '생성', 'firstasked']):
                date_col = col
                break
        
        if date_col is None:
            print(f"[CSAT] 날짜 컬럼을 찾을 수 없음: {list(raw_df.columns)}")
            return pd.DataFrame()
        
        # 날짜 파싱 및 필터링
        try:
            raw_df[date_col] = pd.to_datetime(raw_df[date_col], errors='coerce')
            s = pd.to_datetime(start_date)
            e = pd.to_datetime(end_date) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)
            out = raw_df[(raw_df[date_col].notna()) & (raw_df[date_col] >= s) & (raw_df[date_col] <= e)].copy()
            print(f"[CSAT] csat_raw.pkl에서 {len(out)} rows 필터링 완료")
        except Exception as e:
            print(f"[CSAT] 날짜 필터링 실패: {e}")
            return pd.DataFrame()
    
    # 기간 필터 (이미 위에서 처리했지만 안전장치)
    if 'firstAskedAt' in out.columns:
        out["firstAskedAt"] = pd.to_datetime(out["firstAskedAt"], errors="coerce")
        s = pd.to_datetime(start_date)
        e = pd.to_datetime(end_date) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)
        out = out[(out["firstAskedAt"].notna()) & (out["firstAskedAt"] >= s) & (out["firstAskedAt"] <= e)].reset_index(drop=True)
    
    return out

def get_filtered_df(df: pd.DataFrame, 고객유형="전체", 고객유형_2차="전체", 문의유형="전체", 
                   문의유형_2차="전체", 서비스유형="전체", 서비스유형_2차="전체") -> pd.DataFrame:
    temp = df.copy()
    required_columns = ["고객유형","고객유형_2차","문의유형","문의유형_2차","서비스유형","서비스유형_2차"]
    for col in required_columns:
        if col not in temp.columns:
            temp[col] = None
    
    # 쉼표로 구분된 다중 선택 처리 (OR 조건)
    if 고객유형 != "전체": 
        고객유형_리스트 = [v.strip() for v in 고객유형.split(',') if v.strip()]
        if 고객유형_리스트:
            temp = temp[temp["고객유형"].isin(고객유형_리스트)]
    
    if 고객유형_2차 != "전체": 
        고객유형_2차_리스트 = [v.strip() for v in 고객유형_2차.split(',') if v.strip()]
        if 고객유형_2차_리스트:
            temp = temp[temp["고객유형_2차"].isin(고객유형_2차_리스트)]
    
    if 문의유형 != "전체": 
        문의유형_리스트 = [v.strip() for v in 문의유형.split(',') if v.strip()]
        if 문의유형_리스트:
            temp = temp[temp["문의유형"].isin(문의유형_리스트)]
    
    if 문의유형_2차 != "전체": 
        문의유형_2차_리스트 = [v.strip() for v in 문의유형_2차.split(',') if v.strip()]
        if 문의유형_2차_리스트:
            temp = temp[temp["문의유형_2차"].isin(문의유형_2차_리스트)]
    
    if 서비스유형 != "전체": 
        서비스유형_리스트 = [v.strip() for v in 서비스유형.split(',') if v.strip()]
        if 서비스유형_리스트:
            temp = temp[temp["서비스유형"].isin(서비스유형_리스트)]
    
    if 서비스유형_2차 != "전체": 
        서비스유형_2차_리스트 = [v.strip() for v in 서비스유형_2차.split(',') if v.strip()]
        if 서비스유형_2차_리스트:
            temp = temp[temp["서비스유형_2차"].isin(서비스유형_2차_리스트)]
    required_keys = ["userId","mediumType","workflowId","tags","firstAskedAt"]
    for k in required_keys:
        if k not in temp.columns:
            temp[k] = None
    for k in ["operationWaitingTime","operationAvgReplyTime","operationTotalReplyTime","operationResolutionTime"]:
        if k in temp.columns:
            temp[k] = temp[k].apply(lambda x: x if isinstance(x, str) else None)
    return temp.reset_index(drop=True)

def enrich_csat_with_user_types(csat_df: pd.DataFrame, chats_df: pd.DataFrame) -> pd.DataFrame:
    """
    csat_df:  personId, A-1, A-2, ...
    chats_df: userId, 문의유형, 문의유형_2차, 고객유형, ...
    반환:     userId, 유형 컬럼 + CSAT 문항이 합쳐진 DF
    """
    try:
        if csat_df is None or chats_df is None:
            print("[CSAT] 입력 데이터가 None입니다.")
            return pd.DataFrame()
        
        if csat_df.empty or chats_df.empty:
            print("[CSAT] 입력 데이터가 비어있습니다.")
            return pd.DataFrame()

        # userId 필수 방어 (CSAT 데이터)
        if "userId" not in csat_df.columns:
            raise ValueError("csat_df에 userId가 없습니다.")
        if "userId" not in chats_df.columns:
            raise ValueError("chats_df에 userId가 없습니다.")

        print(f"[CSAT] CSAT 데이터 {len(csat_df)}건에 유형 정보 추가 시작...")
        
        # CSAT 데이터는 이미 userId가 있으므로 그대로 사용
        csat_df_copy = csat_df.copy()
        
        # 조인에 필요한 최소 컬럼만 추출 (1차 분류만 사용)
        need_cols = ["userId", "문의유형", "고객유형", "서비스유형"]
        use_cols = [c for c in need_cols if c in chats_df.columns]
        
        # userId로 이너조인
        merged = pd.merge(
            csat_df_copy,
            chats_df[use_cols].drop_duplicates(subset=["userId"], keep="last"),
            on="userId",
            how="inner",
        )

        # 중복 CSAT 응답 정리: 같은 userId에 대해 csatSubmittedAt 최신 1건만 사용
        if "csatSubmittedAt" in merged.columns:
            merged = (merged
                      .sort_values(["userId", "csatSubmittedAt"])
                      .drop_duplicates(subset=["userId"], keep="last"))
        
        # 매칭된 건수 확인
        matched_count = len(merged)
        print(f"[CSAT] 유형 정보 매칭 완료: {matched_count}/{len(csat_df)}건 ({matched_count/len(csat_df)*100:.1f}%)")
        
        return merged
        
    except Exception as e:
        print(f"[CSAT] 유형 정보 추가 중 오류 발생: {e}")
        return pd.DataFrame()

def safe_mean(series):
    """안전한 평균 계산 함수 - NaN/inf 값 방지"""
    try:
        if series is None or series.empty:
            return 0.0
        non_null = series.dropna()
        if len(non_null) == 0:
            return 0.0
        mean_val = non_null.mean()
        if pd.notna(mean_val) and np.isfinite(mean_val):
            return float(mean_val)
        else:
            return 0.0
    except:
        return 0.0

def build_csat_type_scores(enriched_df: pd.DataFrame):
    """
    enriched_df: enrich_csat_with_user_types() 결과
      포함 컬럼: personId, userId, 문의유형, 문의유형_2차, 고객유형, A-1, A-2, ...
    반환: {
      "문의유형": { "A-1": [ { "문의유형": "...", "평균점수": 4.7, "응답자수": 12, "userIds": [...] }, ... ], ... },
      "고객유형": { ... }
    }
    """
    import pandas as pd
    import numpy as np
    
    if enriched_df is None or enriched_df.empty:
        print(f"[CSAT] enriched_df가 비어있습니다.")
        return {}

    print(f"[CSAT] 유형별 집계 시작: {len(enriched_df)}건")
    
    csat_cols = [c for c in enriched_df.columns if c.startswith("A-")]
    print(f"  - CSAT 문항 컬럼: {csat_cols}")
    
    result = {}

    def _group_payload(df, label_col, score_col):
        # 툴팁용 계산 방식을 그대로 사용
        def calculate_group_averages(df, label_col, score_col):
            result = {}
            for label_val in df[label_col].unique():
                series = pd.to_numeric(df[df[label_col] == label_val][score_col], errors='coerce')
                valid = series.dropna()
                if len(valid) > 0:
                    avg = valid.mean()
                    if pd.notna(avg) and np.isfinite(avg):
                        result[label_val] = float(avg)
                    else:
                        result[label_val] = 0.0
                else:
                    result[label_val] = 0.0
            return result

        # 응답자수 집계 (기존 방식 유지)
        tmp = df.copy()
        tmp[score_col] = pd.to_numeric(tmp[score_col], errors="coerce")
        tmp = tmp.dropna(subset=[label_col, score_col])
        if tmp.empty:
            return []
        
        # 집계: 응답자수 + userIds(고유)
        g = (tmp.groupby(label_col)
                .agg(응답자수=(score_col, "count"),
                     userIds=("userId", lambda x: sorted(set(x))))
                .reset_index())
        
        # 전체 데이터에서 계산한 평균점수 매핑
        averages = calculate_group_averages(df, label_col, score_col)
        for idx, row in g.iterrows():
            g.loc[idx, '평균점수'] = averages.get(row[label_col], 0.0)
        
        # 디버깅: 평균점수 계산 과정 확인
        for idx, row in g.iterrows():
            label_val = row[label_col]
            print(f"  - {label_col}={label_val}: {row['응답자수']}개 데이터, 평균점수={row['평균점수']}")
            if label_val in averages:
                print(f"    전체 데이터에서 계산된 평균: {averages[label_val]}")
        
        # 과도한 payload 방지: userIds는 최대 50개만 제공(필요시 확대)
        g["userIds"] = g["userIds"].apply(lambda li: li[:50])
        # 막대 차트에는 응답자수만 표시, 평균점수는 툴팁용으로만 유지
        g["막대값"] = g["응답자수"]  # 막대는 응답자수로 표시
        # 결과 dict
        records = g.sort_values("응답자수", ascending=False).to_dict(orient="records")
        return records

    for label in ["문의유형", "고객유형", "서비스유형"]:
        result[label] = {}
        for a in csat_cols:
            result[label][a] = _group_payload(enriched_df, label, a)
            print(f"  - {label}별 {a}: {len(result[label][a])}개 그룹")

    print(f"[CSAT] 유형별 집계 완료: {len(result)}개 유형")
    return result