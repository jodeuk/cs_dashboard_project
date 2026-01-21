import os
import httpx
import pandas as pd
import numpy as np
import json
import pickle
from datetime import datetime, timedelta, timezone, time as dtime
from typing import List, Dict, Optional, Tuple
import asyncio
import re
from dotenv import load_dotenv

# CSAT 빌더 중복 실행 방지 락
csat_build_lock = asyncio.Lock()

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

# ==== 영업시간 설정 (KST, 평일만) ====
BIZ_TZ = "Asia/Seoul"

# 여러 구간 지원: "HH:MM-HH:MM,HH:MM-HH:MM" 형식
# 기본값: 평일 10:00-12:00, 13:00-18:00 (점심 12-13 제외)
BUSINESS_WINDOWS = os.getenv("BUSINESS_WINDOWS", "10:00-12:00,13:00-18:00")

def _parse_windows(s: str):
    wins = []
    for seg in (s or "").split(","):
        seg = seg.strip()
        if not seg or "-" not in seg:
            continue
        a, b = seg.split("-")
        ha, ma = map(int, a.split(":"))
        hb, mb = map(int, b.split(":"))
        wins.append(((ha, ma), (hb, mb)))
    # 파싱 실패 시 안전 기본값(10-12,13-18)
    return wins or [((10,0),(12,0)), ((13,0),(18,0))]

_BIZ_WINDOWS = _parse_windows(BUSINESS_WINDOWS)

# 주말 제외(월=0 … 금=4)
WEEKDAYS = {0,1,2,3,4}

# CSV "YYYY-MM-DD,YYYY-MM-DD"
_HOLS = set()
for _d in filter(None, (os.getenv("BUSINESS_HOLIDAYS", "").split(","))):
    try:
        _HOLS.add(pd.to_datetime(_d.strip()).date())
    except Exception:
        pass

def _to_kst_naive(dt):
    if dt is None or pd.isna(dt):
        return None
    dt = pd.to_datetime(dt, errors="coerce")
    if pd.isna(dt):
        return None
    # tz-aware -> Asia/Seoul로 변환 후 naive
    if getattr(dt, "tzinfo", None) is not None or getattr(getattr(dt, "tz", None), "zone", None):
        return dt.tz_convert(BIZ_TZ).tz_localize(None)
    return dt

def business_seconds_between(start, end,
                             windows=_BIZ_WINDOWS,
                             weekdays=WEEKDAYS,
                             holidays=_HOLS):
    """
    start~end 사이에서 '평일'의 지정된 영업시간 구간들만 누적(초).
    예: windows=[((10,0),(12,0)), ((13,0),(18,0))]  → 점심 시간 제외
    """
    s = _to_kst_naive(start); e = _to_kst_naive(end)
    if s is None or e is None or e <= s:
        return 0

    total = 0
    cur = s.normalize()  # 00:00
    end_day = e.normalize()
    while cur <= end_day:
        d = cur.date()
        if (cur.weekday() in weekdays) and (d not in holidays):
            for (sh, sm), (eh, em) in windows:
                day_start = cur.replace(hour=sh, minute=sm, second=0, microsecond=0)
                day_end   = cur.replace(hour=eh, minute=em, second=0, microsecond=0)
                # 이 구간과 [s,e] 교집합
                seg_start = max(s, day_start)
                seg_end   = min(e, day_end)
                if seg_end > seg_start:
                    total += int((seg_end - seg_start).total_seconds())
        cur += pd.Timedelta(days=1)
    return max(0, total)

def seconds_to_hms(sec: int) -> str:
    if sec <= 0:
        return "00:00:00"
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    return f"{h:02}:{m:02}:{s:02}"

# === [NEW] 영업시간 계산 유틸 ==============================
WORK_BLOCKS = [(dtime(10,0), dtime(12,0)), (dtime(13,0), dtime(18,0))]  # 평일 10-12, 13-18
WORKWEEK = set(range(0,5))  # 월(0)~금(4)

def _overlap_minutes(a_start, a_end, b_start, b_end) -> int:
    s = max(a_start, b_start)
    e = min(a_end, b_end)
    if e <= s:
        return 0
    return int((e - s).total_seconds() // 60)

def working_minutes_between_kst(start_dt, end_dt) -> int:
    """
    start_dt ~ end_dt 사이의 '영업시간' 분(min)만 누적.
    - 평일만 카운트
    - 10:00~12:00, 13:00~18:00
    - 점심(12~13)은 제외
    - 입력은 KST 'naive' Timestamp를 가정 (convert_time에서 보정)
    """
    try:
        if pd.isna(start_dt) or pd.isna(end_dt) or end_dt <= start_dt:
            return 0
        # 일 단위 루프
        minutes = 0
        cur = pd.Timestamp(start_dt.date())
        last = pd.Timestamp(end_dt.date())
        while cur <= last:
            if cur.weekday() in WORKWEEK:
                for (ws, we) in WORK_BLOCKS:
                    w_start = pd.Timestamp.combine(cur, ws)
                    w_end   = pd.Timestamp.combine(cur, we)
                    minutes += _overlap_minutes(start_dt, end_dt, w_start, w_end)
            cur += pd.Timedelta(days=1)
        return minutes
    except Exception:
        return 0

def _fmt_hhmmss_from_minutes(mins: int) -> str:
    h = mins // 60
    m = mins % 60
    return f"{int(h):02}:{int(m):02}:00"

# === [REPLACE] attach_resolution_fallback ==================
def attach_resolution_fallback(df: pd.DataFrame) -> pd.DataFrame:
    """
    operationResolutionTime(문자열 H:M:S) 이 비어있는 행에 한해서,
    openedAt~closedAt 영업시간 기반으로 계산한 값을 직접 채워넣는다.
    - 점심(12~13) 제외, 평일 10-12/13-18만 카운트
    - 계산 결과가 0분이면 채우지 않음(그대로 None 유지)
    """
    if df is None or df.empty:
        return df

    out = df.copy()
    for c in ["openedAt", "closedAt"]:
        if c not in out.columns:
            out[c] = pd.NaT
        else:
            out[c] = pd.to_datetime(out[c], errors="coerce")

    if "operationResolutionTime" not in out.columns:
        out["operationResolutionTime"] = None

    def _blank_time(x):
        if x is None: return True
        if isinstance(x, str):
            s = x.strip().lower()
            return s in ("", "nan", "null", "undefined", "00:00:00")
        return False

    # 필요 행만 계산해서 덮어쓰기
    for idx, row in out.iterrows():
        base = row.get("operationResolutionTime")
        if not _blank_time(base):
            continue  # 이미 값 있으면 건드리지 않음
        oa, ca = row.get("openedAt"), row.get("closedAt")
        if pd.isna(oa) or pd.isna(ca):
            continue
        mins = working_minutes_between_kst(oa, ca)
        if mins and mins > 0:
            out.at[idx, "operationResolutionTime"] = _fmt_hhmmss_from_minutes(mins)

    return out
# ===========================================================

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

    # === (RESTORED) CSAT 라벨 정규화 유틸 ===
    def _clean_label(self, s: str) -> str:
        """폼 라벨의 앞뒤 공백/불필요한 구분자 제거 (한글 키워드 매칭 보존)."""
        if not s:
            return ""
        s = str(s)
        # 줄바꿈/중복 공백 정리 및 흔한 구분자 제거
        s = re.sub(r"\s+", " ", s).strip()
        s = s.replace("·", " ").replace("•", " ").replace(":", " ").replace("–", "-").replace("—", "-")
        return s

    def _leading_num(self, s: str):
        """문항 앞의 숫자(예: '1) ...', '3 . ...')를 정수로 반환. 없으면 None."""
        if not s:
            return None
        m = re.match(r"^\s*([0-9]+)", str(s))
        return int(m.group(1)) if m else None

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
        max_pages = 100  # 4,5,6,7월 데이터를 가져오기 위해 페이지 제한 증가
        collected_ids = set()  # userChat 단위로 중복 방지
        
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
                
                # 모든 데이터 수집 (나중에 날짜 필터링)
                for chat in user_chats:
                    chat_id = (
                        chat.get("id")
                        or chat.get("chatId")
                        or (chat.get("mainKey") or "").replace("userChat-", "")
                    )
                    if chat_id and chat_id not in collected_ids:
                        all_userchats.append(chat)
                        collected_ids.add(chat_id)
                
                print(f"[API] {page_count}번째 페이지: {len(user_chats)}개 수신 (누적: {len(all_userchats)}개)")
                
                if not next_value or not str(next_value).strip():
                    break
                
                since = next_value
            
            # 수집 완료 후 날짜 필터링
            filtered_userchats = []
            for chat in all_userchats:
                first_asked_at = chat.get("firstAskedAt")
                if first_asked_at and start_ts <= first_asked_at <= end_ts:
                    filtered_userchats.append(chat)
                elif not first_asked_at:
                    # firstAskedAt이 없으면 일단 포함 (나중에 필터링)
                    filtered_userchats.append(chat)
            
            all_userchats = filtered_userchats
            print(f"[API] 날짜 필터링 완료: {len(all_userchats)}개 (원본: {len(collected_ids)}개)")
                    
        except Exception as e:
            print(f"[get_userchats] 오류: {e}")
            raise
        
        print(f"[API] 총 수집된 채팅 수: {len(all_userchats)} (기간: {start_date} ~ {end_date})")
        await self._hydrate_open_closed(all_userchats)  # openedAt/closedAt 보강 (update/refresh 경로에서만)
        print(f"[API] openedAt/closedAt 보강 완료 후 반환: {len(all_userchats)} chats")
        return all_userchats

    async def get_userchat_by_id(self, userchat_id: str) -> Dict:
        await self._ensure_keys()
        url = f"{self.base_url}/open/v5/user-chats/{userchat_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=self.headers)
            r.raise_for_status()
            return r.json()

    async def _hydrate_open_closed(self, chats: list, max_concurrency: int = 8) -> None:
        """
        openedAt/closedAt가 비어있는 userChat만 상세 API(/open/v5/user-chats/{id})로 보강.
        chats 리스트 원소를 in-place 수정.
        """
        import asyncio
        sem = asyncio.Semaphore(max_concurrency)

        async def fetch_and_patch(chat):
            # 이미 둘 다 있으면 스킵
            if chat.get("openedAt") is not None and chat.get("closedAt") is not None:
                return
            chat_id = chat.get("id") or chat.get("chatId") or chat.get("mainKey", "").replace("userChat-", "")
            if not chat_id:
                return
            async with sem:
                try:
                    detail = await self.get_userchat_by_id(str(chat_id))
                    # ↓ 실제 스키마에 맞게 키 후보 몇 개 대비
                    opened = (detail.get("openedAt")
                              or detail.get("openAt")
                              or (detail.get("state") or {}).get("openedAt"))
                    closed = (detail.get("closedAt")
                              or detail.get("closeAt")
                              or (detail.get("state") or {}).get("closedAt"))
                    created = detail.get("createdAt", chat.get("createdAt"))

                    if opened is not None: chat["openedAt"] = opened
                    if closed is not None: chat["closedAt"] = closed
                    if created is not None: chat["createdAt"] = created
                except Exception as e:
                    print(f"[HYDRATE] chatId={chat_id} 상세조회 실패: {e}")

        targets = [c for c in chats if c.get("openedAt") is None or c.get("closedAt") is None]
        if not targets:
            return

        print(f"[HYDRATE] openedAt/closedAt 보강 대상: {len(targets)}개 (전체 {len(chats)}개)")
        await asyncio.gather(*(fetch_and_patch(c) for c in targets))

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
        # (교체) 추출 키 목록
        keep_keys = [
            "userId", "personId", "mediumType", "mediumName", "workflowId", "tags", "chats",
            "createdAt", "firstAskedAt", "openedAt", "closedAt",
            "operationWaitingTime", "operationAvgReplyTime",
            "operationTotalReplyTime", "operationResolutionTime",
            "managerIds", "assigneeId"
        ]

        # (교체) 변환기
        def convert_time(key, ms):
            if ms is None:
                return None
            try:
                if key in {"firstAskedAt", "createdAt", "openedAt", "closedAt"}:
                    if isinstance(ms, str):
                        return pd.to_datetime(ms, errors='coerce')
                    elif isinstance(ms, (int, float)):
                        # UTC(ms) -> KST naive
                        return pd.to_datetime(ms, unit='ms', utc=True).tz_convert('Asia/Seoul').tz_localize(None)
                    elif isinstance(ms, (pd.Timestamp, datetime)):
                        return pd.to_datetime(ms, errors='coerce')
                    else:
                        return pd.NaT

                if key in {"operationWaitingTime","operationAvgReplyTime","operationTotalReplyTime","operationResolutionTime"}:
                    td = timedelta(milliseconds=ms)
                    total_seconds = int(td.total_seconds())
                    h, m, s = total_seconds // 3600, (total_seconds % 3600) // 60, total_seconds % 60
                    return f"{h:02}:{m:02}:{s:02}"
                return None
            except Exception:
                return None

        processed_data = []
        # 첫 번째 아이템에서 managerIds, assigneeId, mediumName 확인 (디버깅)
        if len(data) > 0:
            first_item = data[0]
            print(f"[PROCESS] 첫 번째 아이템 키들: {list(first_item.keys())}")
            print(f"[PROCESS] managerIds 직접 접근: {first_item.get('managerIds')}")
            print(f"[PROCESS] assigneeId 직접 접근: {first_item.get('assigneeId')}")
            print(f"[PROCESS] mediumName 직접 접근: {first_item.get('mediumName')}")
            # 중첩 구조 확인
            if "manager" in first_item:
                print(f"[PROCESS] manager 객체: {first_item.get('manager')}")
            if "assignee" in first_item:
                print(f"[PROCESS] assignee 객체: {first_item.get('assignee')}")
            if "medium" in first_item:
                print(f"[PROCESS] medium 객체: {first_item.get('medium')}")
        
        for item in data:
            first_asked_at = item.get("firstAskedAt")
            is_outbound = False
            
            # mediumType 미리 확인 (디버깅용)
            medium_obj = item.get("source", {}).get("medium", {})
            medium_type = medium_obj.get("mediumType") if isinstance(medium_obj, dict) else None
            if medium_type is None:
                medium_type = item.get("mediumType")
            
            # firstAskedAt이 None이면 createdAt으로 대체하고 OB 태그 추가
            if first_asked_at is None:
                first_asked_at = item.get("createdAt")
                is_outbound = True
                item["firstAskedAt"] = first_asked_at
                # 디버깅: OB로 분류되는 경우 로그
                if medium_type == "phone":
                    print(f"[DIRECTION DEBUG] OB로 분류됨 - mediumType: {medium_type}, firstAskedAt 원본: None, createdAt: {first_asked_at}, userId: {item.get('userId')}")
            
            # createdAt도 없으면 건너뛰기
            if first_asked_at is None:
                continue
            
            tags = item.get('tags', [])
            new_obj = {}
            for key in keep_keys:
                value = item.get(key)
                # managerIds와 assigneeId는 중첩 구조일 수 있으므로 확인
                if key == "managerIds" and value is None:
                    # 중첩 구조 확인
                    if "manager" in item:
                        manager_obj = item.get("manager")
                        if isinstance(manager_obj, dict):
                            value = manager_obj.get("ids") or manager_obj.get("id")
                        elif isinstance(manager_obj, list) and len(manager_obj) > 0:
                            value = [m.get("id") if isinstance(m, dict) else m for m in manager_obj]
                elif key == "assigneeId" and value is None:
                    # 중첩 구조 확인
                    if "assignee" in item:
                        assignee_obj = item.get("assignee")
                        if isinstance(assignee_obj, dict):
                            value = assignee_obj.get("id")
                        elif isinstance(assignee_obj, list) and len(assignee_obj) > 0:
                            value = assignee_obj[0].get("id") if isinstance(assignee_obj[0], dict) else assignee_obj[0]
                if key == "workflowId":
                    value = item.get("source", {}).get("workflow", {}).get("id")
                elif key == "mediumType":
                    # source.medium.mediumType에서 가져오기 (최상위에 없으므로 항상 source에서 가져옴)
                    medium_obj = item.get("source", {}).get("medium", {})
                    if isinstance(medium_obj, dict):
                        value = medium_obj.get("mediumType")
                    # 없으면 최상위에서도 시도
                    if value is None:
                        value = item.get("mediumType")
                elif key == "mediumName":
                    # source.medium에서 name 또는 mediumName 가져오기
                    medium_obj = item.get("source", {}).get("medium", {})
                    if isinstance(medium_obj, dict):
                        value = medium_obj.get("name") or medium_obj.get("mediumName")
                    # 없으면 최상위에서도 시도
                    if value is None:
                        value = item.get("mediumName")
                elif key in ["firstAskedAt","createdAt","openedAt","closedAt",
                             "operationWaitingTime","operationAvgReplyTime",
                             "operationTotalReplyTime","operationResolutionTime"]:
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
            처리유형_1차 = self.extract_level(tags, "처리유형", 1)
            처리유형_2차 = self.extract_level(tags, "처리유형", 2)

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
                "처리유형": 처리유형_1차,
                "고객유형_1차": 고객유형_1차,
                "문의유형_1차": 문의유형_1차,
                "서비스유형_1차": 서비스유형_1차,
                "처리유형_1차": 처리유형_1차,
                "고객유형_2차": 고객유형_2차,
                "문의유형_2차": 문의유형_2차,
                "서비스유형_2차": 서비스유형_2차,
                "처리유형_2차": 처리유형_2차,
                # userChat id
                "userChatId": item.get("id") or item.get("chatId") or item.get("mainKey", "").replace("userChat-", ""),
                # direction: OB (Outbound) if firstAskedAt was None, IB (Inbound) otherwise
                "direction": "OB" if is_outbound else "IB"
            }
            processed_data.append(processed_item)

        df = pd.DataFrame(processed_data)
        
        # (추가) DF 생성 후 보정
        if "firstAskedAt" in df.columns:
            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors='coerce')
        for c in ["createdAt","openedAt","closedAt"]:
            if c in df.columns:
                df[c] = pd.to_datetime(df[c], errors='coerce')

        # (교체) 필수 컬럼
        required_columns = [
            "고객유형","문의유형","서비스유형",
            "고객유형_1차","문의유형_1차","서비스유형_1차",
            "고객유형_2차","문의유형_2차","서비스유형_2차",
            "firstAskedAt","createdAt","openedAt","closedAt",
            "operationWaitingTime","operationAvgReplyTime",
            "operationTotalReplyTime","operationResolutionTime",
            "userChatId","userId","personId","direction",
            "managerIds","assigneeId","mediumName"
        ]
        for col in required_columns:
            if col not in df.columns:
                df[col] = None

        return df


    # ▼ 신규: 메시지 배열에서 CSAT 설문 추출
    def extract_csat_from_messages(self, msgs: List[Dict], allowed_trigger_ids: Optional[set] = None) -> Dict:
        """
        ...
        """
        result = {}
        latest_submit_ts = None
        person_id = None

        # ▶ 분모/분자 플래그 초기화
        result.setdefault("wf_768201_started", False)  # 설문 '시작자'(대상자)
        result.setdefault("has_score_any", False)      # A-1/2/4/5 중 하나라도 응답

        allowed_set = set(map(str, allowed_trigger_ids or []))

        # 코멘트 순번 (이 채팅 내에서 발견되는 csatComment 0번째 → A-3, 1번째 → A-6)
        comment_seq = 0

        def norm_label(label: str) -> Optional[str]:
            s = self._clean_label(label)
            if not s:
                return None

            # 숫자 접두 자동 인식 (예: "3) ..." "6 . ..." 포함)
            n = self._leading_num(s)
            if n == 1: return "A-1"
            if n == 2: return "A-2"
            if n == 3: return "comment_3"
            if n == 4: return "A-4"
            if n == 5: return "A-5"
            if n == 6: return "comment_6"

            # --- 백업 규칙(키워드) 조금 정교하게 ---
            if "친절도" in s:
                return "A-1"
            if "문제 해결" in s:
                return "A-2"

            # comment_3: 상담 과정 관련
            if "상담 과정" in s:
                return "comment_3"

            # comment_6: 플랫폼 + 개선/건의
            if "플랫폼" in s and ("개선점" in s or "건의사항" in s or "건의 사항" in s):
                return "comment_6"

            # 남은 '개선점'만 있으면 일단 comment_3 쪽으로
            if "개선점" in s:
                return "comment_3"

            if "안정성" in s:
                return "A-4"
            if "디자인" in s or "시각적 구성" in s:
                return "A-5"

            return None

        for m in msgs:
            log = m.get("log") or {}
            wf = (m.get("workflow") or {})
            wf_id = str(wf.get("id") or "")
            trig_type = log.get("triggerType")
            trig_id = str(log.get("triggerId")) if log.get("triggerId") is not None else ""
            action = (log.get("action") or log.get("type") or "").lower()

            # personId 추출 (user 메시지 기준)
            if person_id is None and m.get("personType") == "user":
                person_id = m.get("personId") or m.get("person", {}).get("id")

            # === [핵심] '설문 시작' 넓게 감지 ===
            # 1) 로그 트리거: action 이 start* 류
            if trig_type == "workflow" and (not allowed_set or trig_id in allowed_set) and action.startswith("start"):
                result["wf_768201_started"] = True
            # 2) 메시지에 workflow.id 가 목표 ID
            if wf_id and (not allowed_set or wf_id in allowed_set):
                result["wf_768201_started"] = True

            form = m.get("form")
            inputs = (form or {}).get("inputs") or []
            # 3) CSAT 바인딩 키가 포함된 폼이면 '시작'으로 간주 (점수 미응답이어도 대상자)
            has_csat_input = any((inp.get("bindingKey") or "").startswith("userChat.profile.csat") for inp in inputs)
            if has_csat_input:
                result["wf_768201_started"] = True

            # --- 제출 시각 (있으면 최신값 유지)
            submitted_at = (form or {}).get("submittedAt")
            if submitted_at:
                latest_submit_ts = max(latest_submit_ts or submitted_at, submitted_at)

            # === [완화된 파싱 게이트] ===
            # allowed_trigger_ids 가 주어졌더라도,
            # - 트리거ID 매치 OR workflow.id 매치 OR CSAT 입력 폼 포함 이면 파싱 허용
            parse_ok = True
            if allowed_set:
                parse_ok = (trig_type == "workflow" and trig_id in allowed_set) or (wf_id in allowed_set) or has_csat_input
            if not parse_ok:
                continue

            # === 폼 입력 → 라벨 매핑(기존 로직 유지) ===
            if form:
                in_first_group  = wf.get("actionIndex") in (0, 1)
                in_second_group = wf.get("actionIndex") in (2, 3)

                # 이 메시지 내에서 코멘트 순번 초기화 (각 메시지마다 독립적으로 카운트)
                msg_comment_seq = 0

                for inp in inputs:
                    original_label = inp.get("label")
                    val = inp.get("value")
                    bk = (inp.get("bindingKey") or "").strip()

                    label = norm_label(original_label)

                    # Fallback: 코멘트 라벨 추정
                    # 점수 문항 추정은 여전히 스킵
                    if not label and bk == "userChat.profile.csat":
                        pass

                    # ✅ 1순위: csatComment 계열을 순서대로 매핑
                    # actionIndex가 꼬여도, 한 채팅 안에서
                    # 1번째 코멘트 → A-3, 2번째 코멘트 → A-6 으로 처리
                    if not label and bk.startswith("userChat.profile.csatComment"):
                        if msg_comment_seq == 0:
                            label = "comment_3"
                        elif msg_comment_seq == 1:
                            label = "comment_6"
                        msg_comment_seq += 1
                        # 전역 comment_seq도 업데이트 (디버깅용)
                        comment_seq = msg_comment_seq

                    # ✅ 2순위: 그래도 라벨을 못 잡았고 텍스트가 있으면,
                    #           actionIndex 기준으로 마지막 보정
                    if not label and isinstance(val, str) and val.strip():
                        if in_first_group:
                            label = "comment_3"
                        elif in_second_group:
                            label = "comment_6"

                    if original_label and val:
                        print(f"[CSAT_DEBUG] 원본: '{original_label}' → 매핑: '{label}' → 값: '{val}'")

                    if not label:
                        continue

                    if label.startswith("A-"):
                        try:
                            result[label] = int(val) if val is not None else None
                        except Exception:
                            result[label] = None
                        if label in ("A-1","A-2","A-4","A-5"):
                            if val is not None and str(val).strip() != "":
                                try:
                                    int(val)
                                    result["has_score_any"] = True
                                except Exception:
                                    pass
                    elif label.startswith("comment_"):
                        if label not in result:
                            result[label] = []
                        if isinstance(val, str) and val.strip():
                            result[label].append(val.strip())

        # 제출 ISO(KST)
        if latest_submit_ts:
            try:
                kst = timezone(timedelta(hours=9))
                dt = datetime.fromtimestamp(latest_submit_ts/1000, tz=kst)
                result["csatSubmittedAt"] = dt.isoformat()
            except Exception:
                pass

        if person_id:
            result["personId"] = person_id

        # comment 배열 → 문자열
        for key in ["comment_3", "comment_6"]:
            if key in result:
                if isinstance(result[key], list):
                    result[key] = result[key][0].strip() if result[key] else None
                elif isinstance(result[key], str):
                    result[key] = result[key].strip() or None

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
            # first_asked_start/end가 metadata에 이미 있으면 그대로 사용 (CSAT 캐시 등)
            # 없으면 실제 데이터의 firstAskedAt min/max 사용
            if "first_asked_start" not in metadata or "first_asked_end" not in metadata:
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
            # firstAskedAt이 없으면 createdAt 사용 (OB 데이터 처리)
            first = pd.to_datetime(df.get('firstAskedAt'), errors='coerce')
            created = pd.to_datetime(df.get('createdAt'), errors='coerce')
            
            if getattr(first.dt, "tz", None) is not None:
                first = first.dt.tz_convert('Asia/Seoul').dt.tz_localize(None)
            if getattr(created.dt, "tz", None) is not None:
                created = created.dt.tz_convert('Asia/Seoul').dt.tz_localize(None)
            
            # firstAskedAt이 NaN이면 createdAt 사용
            date_for_filter = first.fillna(created)

            start_kst = pd.to_datetime(start_date)
            end_kst = pd.to_datetime(end_date) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)
            mask = (date_for_filter >= start_kst) & (date_for_filter <= end_kst)
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
    
    if refresh_mode == "refresh":
        # 전체 갱신: 전체 기간에 대해 한 번만 API 호출 (ChannelTalk API는 날짜 필터링 미지원)
        print(f"[REFRESH] 전체 기간({start_date} ~ {end_date}) → userchats API 호출 후 월별 재분류 저장")
        try:
            # 전체 기간에 대해 한 번만 API 호출
            userchats = await channel_api.get_userchats(start_date, end_date)
            if userchats:
                df = await channel_api.process_userchat_data(userchats)
                df = attach_resolution_fallback(df)
                # firstAskedAt 기준으로 월별로 재분류 (CSAT 캐시와 동일 정책)
                if "firstAskedAt" in df.columns and not df.empty:
                    df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors="coerce")
                    if getattr(df["firstAskedAt"].dt, "tz", None) is not None:
                        df["firstAskedAt"] = df["firstAskedAt"].dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
                    # createdAt이 있으면 firstAskedAt이 없을 때 사용
                    if "createdAt" in df.columns:
                        df["createdAt"] = pd.to_datetime(df["createdAt"], errors="coerce")
                        if getattr(df["createdAt"].dt, "tz", None) is not None:
                            df["createdAt"] = df["createdAt"].dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
                        df["bucketDate"] = df["firstAskedAt"].fillna(df["createdAt"])
                    else:
                        df["bucketDate"] = df["firstAskedAt"]
                    df = df[df["bucketDate"].notna()].copy()
                    
                    # 요청된 기간(start_date ~ end_date) 내의 데이터만 필터링
                    start_dt = pd.to_datetime(start_date)
                    end_dt = pd.to_datetime(end_date)
                    df = df[(df["bucketDate"] >= start_dt) & (df["bucketDate"] <= end_dt)].copy()
                    
                    df["month"] = df["bucketDate"].dt.to_period("M").astype(str)
                    # 요청된 기간 내의 월만 필터링
                    requested_months = set(months)
                    # 월별로 저장
                    for m, mdf in df.groupby("month"):
                        if m in requested_months:  # 요청된 기간 내의 월만 저장
                            mdf = mdf.drop(columns=["month", "bucketDate"])
                            key = f"userchats_{m}"
                            month_period = pd.Period(m)
                            month_start = month_period.start_time.replace(hour=0, minute=0, second=0, microsecond=0)
                            month_end = month_period.end_time.replace(hour=23, minute=59, second=59, microsecond=999999)
                            meta = {
                                "month": m,
                                "range": [start_date, end_date],
                                "api_fetch": True,
                                "first_asked_start": month_start.isoformat(),
                                "first_asked_end": month_end.isoformat()
                            }
                            server_cache.save_data(key, mdf, meta)
                            all_data.append(mdf)
                            print(f"[REFRESH] {m} 캐시 저장 완료: {len(mdf)} rows")
                else:
                    # firstAskedAt이 없으면 기존 방식으로 저장 (요청된 기간의 첫 월에만)
                    if months:
                        meta = {"month": months[0], "range": [start_date, end_date], "api_fetch": True}
                        server_cache.save_data(f"userchats_{months[0]}", df, meta)
                        all_data.append(df)
        except Exception as e:
            print(f"[REFRESH] 전체 기간 실패: {e}")
    
    for month in months:
        if refresh_mode == "refresh":
            # refresh_mode="refresh"는 위에서 이미 처리했으므로 skip
            continue
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
                            combined_df = attach_resolution_fallback(combined_df)
                            # firstAskedAt 기준으로 월별로 재분류하여 저장
                            if "firstAskedAt" in combined_df.columns and not combined_df.empty:
                                combined_df["firstAskedAt"] = pd.to_datetime(combined_df["firstAskedAt"], errors="coerce")
                                if getattr(combined_df["firstAskedAt"].dt, "tz", None) is not None:
                                    combined_df["firstAskedAt"] = combined_df["firstAskedAt"].dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
                                if "createdAt" in combined_df.columns:
                                    combined_df["createdAt"] = pd.to_datetime(combined_df["createdAt"], errors="coerce")
                                    if getattr(combined_df["createdAt"].dt, "tz", None) is not None:
                                        combined_df["createdAt"] = combined_df["createdAt"].dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
                                    combined_df["bucketDate"] = combined_df["firstAskedAt"].fillna(combined_df["createdAt"])
                                else:
                                    combined_df["bucketDate"] = combined_df["firstAskedAt"]
                                combined_df = combined_df[combined_df["bucketDate"].notna()].copy()
                                combined_df["month"] = combined_df["bucketDate"].dt.to_period("M").astype(str)
                                # 월별로 저장
                                for m, mdf in combined_df.groupby("month"):
                                    mdf = mdf.drop(columns=["month", "bucketDate"])
                                    key = f"userchats_{m}"
                                    month_period = pd.Period(m)
                                    month_start = month_period.start_time.replace(hour=0, minute=0, second=0, microsecond=0)
                                    month_end = month_period.end_time.replace(hour=23, minute=59, second=59, microsecond=999999)
                                    meta = {
                                        "month": m,
                                        "range": [start, end],
                                        "api_fetch": True,
                                        "updated": True,
                                        "first_asked_start": month_start.isoformat(),
                                        "first_asked_end": month_end.isoformat()
                                    }
                                    server_cache.save_data(key, mdf, meta)
                                    # 현재 요청한 월이면 all_data에 추가
                                    if m == month:
                                        print(f"[UPDATE] {month} 캐시 업데이트 완료: {len(df)} → {len(mdf)} rows")
                                        all_data.append(mdf)
                            else:
                                # firstAskedAt이 없으면 기존 방식으로 저장
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
                        df = attach_resolution_fallback(df)
                        # firstAskedAt 기준으로 월별로 재분류 (CSAT 캐시와 동일 정책)
                        if "firstAskedAt" in df.columns and not df.empty:
                            df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors="coerce")
                            if getattr(df["firstAskedAt"].dt, "tz", None) is not None:
                                df["firstAskedAt"] = df["firstAskedAt"].dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
                            if "createdAt" in df.columns:
                                df["createdAt"] = pd.to_datetime(df["createdAt"], errors="coerce")
                                if getattr(df["createdAt"].dt, "tz", None) is not None:
                                    df["createdAt"] = df["createdAt"].dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
                                df["bucketDate"] = df["firstAskedAt"].fillna(df["createdAt"])
                            else:
                                df["bucketDate"] = df["firstAskedAt"]
                            df = df[df["bucketDate"].notna()].copy()
                            df["month"] = df["bucketDate"].dt.to_period("M").astype(str)
                            # 월별로 저장
                            for m, mdf in df.groupby("month"):
                                mdf = mdf.drop(columns=["month", "bucketDate"])
                                key = f"userchats_{m}"
                                month_period = pd.Period(m)
                                month_start = month_period.start_time.replace(hour=0, minute=0, second=0, microsecond=0)
                                month_end = month_period.end_time.replace(hour=23, minute=59, second=59, microsecond=999999)
                                meta = {
                                    "month": m,
                                    "range": [start, end],
                                    "api_fetch": True,
                                    "first_asked_start": month_start.isoformat(),
                                    "first_asked_end": month_end.isoformat()
                                }
                                server_cache.save_data(key, mdf, meta)
                                # 현재 요청한 월이면 all_data에 추가
                                if m == month:
                                    all_data.append(mdf)
                        else:
                            # firstAskedAt이 없으면 기존 방식으로 저장
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
    
    # firstAskedAt 처리 아래에 이어서
    for col in ["createdAt","openedAt","closedAt"]:
        if col in combined.columns:
            try:
                combined[col] = pd.to_datetime(combined[col], errors='coerce')
            except Exception:
                pass
    
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
        # 1) firstAskedAt이 없으면 createdAt 사용 (OB 데이터 처리)
        # firstAskedAt과 createdAt 모두 KST naive로 정규화
        fa = pd.to_datetime(combined['firstAskedAt'], errors='coerce')
        ca = pd.to_datetime(combined.get('createdAt'), errors='coerce')
        
        # tz-aware인 경우만 Asia/Seoul로 변환 후 tz 제거
        if getattr(fa.dt, "tz", None) is not None:
            fa = fa.dt.tz_convert('Asia/Seoul').dt.tz_localize(None)
        if getattr(ca.dt, "tz", None) is not None:
            ca = ca.dt.tz_convert('Asia/Seoul').dt.tz_localize(None)
        
        # firstAskedAt이 NaN이면 createdAt 사용
        date_for_filter = fa.fillna(ca)
        combined['firstAskedAt'] = fa  # 원본은 유지
        combined['_date_for_filter'] = date_for_filter  # 필터링용 날짜

        # 2) 비교 범위 (KST naive)
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)

        # 3) 디버그: 특정 날짜 점검(원하시면 날짜 바꿔서 보세요)
        # 특정 일자 카운트(예: 2025-08-19)
        if start_date == end_date:
            target_date = pd.to_datetime(start_date).date()
            same_day = (date_for_filter.dt.date == target_date).sum()
            print(f"[DEBUG] same-day({target_date}) rows(before mask): {same_day}")

        print(f"[DEBUG] 날짜 범위: {start_date} ~ {end_date} (KST naive) → {start_dt} ~ {end_dt}")
        print(f"[DEBUG] firstAskedAt 유효: {fa.notna().sum()}개, createdAt 유효: {ca.notna().sum()}개, 필터링용 날짜 유효: {date_for_filter.notna().sum()}개")
        mask = (date_for_filter >= start_dt) & (date_for_filter <= end_dt)
        print(f"[DEBUG] 마스크 적용: {mask.sum()}개 True, {len(mask) - mask.sum()}개 False")
        
        result = combined[mask].reset_index(drop=True)
        # 임시 컬럼 제거
        if '_date_for_filter' in result.columns:
            result = result.drop(columns=['_date_for_filter'])
        print(f"[FILTER] 날짜 필터링 완료: {start_date} ~ {end_date} (KST) → {start_dt} ~ {end_dt} (KST)")
        print(f"[FILTER] 필터링 전: {len(combined)} rows, 필터링 후: {len(result)} rows")
        
    except Exception as e:
        print(f"[ERROR] 날짜 필터링 실패: {type(e).__name__}: {e}")
        return pd.DataFrame()
    
    return result

# === 신규: CSAT 캐시 빌드 ===
async def build_and_cache_csat_rows(start_date: str, end_date: str) -> int:
    """
    userchats 캐시(혹은 방금 새로고침된 데이터)를 바탕으로,
    각 userChat의 messages를 조회 → CSAT 설문 파싱 → 월별 csat 캐시 저장.
    반환: 저장된 row 총 개수
    """
    # 혹시 이전 작업이 비정상 종료되어 lock이 남아 있다면 초기화
    # asyncio.Lock은 직접 release()를 호출할 수 없으므로,
    # locked() 상태만 확인하고 로그만 남김 (실제로는 context manager가 정리함)
    try:
        if csat_build_lock.locked():
            print("[CSAT] Warning: lock is locked (should not happen normally)")
    except:
        pass
    
    # 중복 실행 가드
    if csat_build_lock.locked():
        print("[CSAT] build already running — skip this trigger")
        return 0
    
    async with csat_build_lock:
        # 0) 기존 CSAT 캐시 불러오기 (증분 업데이트용)
        existing_csat = load_csat_rows_from_cache(start_date, end_date)
        existing_ids = set()
        
        # 디버깅: 캐시 로드 결과 확인
        if existing_csat is None:
            print(f"[CSAT] 기존 캐시 없음: None 반환 (전체 수집)")
        elif existing_csat.empty:
            print(f"[CSAT] 기존 캐시 없음: 빈 DataFrame (전체 수집)")
        elif "userChatId" not in existing_csat.columns:
            print(f"[CSAT] 기존 캐시 컬럼 확인: {list(existing_csat.columns)}")
            print(f"[CSAT] 기존 캐시 없음: userChatId 컬럼 없음 (전체 수집)")
        else:
            existing_ids = set(existing_csat["userChatId"].astype(str).tolist())
            print(f"[CSAT] 기존 캐시된 chatId 수: {len(existing_ids)} (범위: {start_date} ~ {end_date})")
        
        # 1) 사용자 문의 데이터 확보 (날짜 필터링 전의 전체 데이터 필요)
        # get_cached_data는 날짜 필터링을 내부에서 하는데,
        # CSAT 처리를 위해 날짜 필터링 전의 전체 데이터가 필요함
        # 날짜 필터링 전의 데이터를 가져오기 위해 내부 로직을 직접 호출
        
        # 월별 데이터를 모아서 날짜 필터링 전의 전체 데이터 구성
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
            df = get_cached_data_month(month)
            if df is not None and not df.empty:
                all_data.append(df)
        
        if not all_data:
            # 캐시가 없으면 refresh로 전체 수집
            user_df = await get_cached_data(start_date, end_date, refresh_mode="refresh")
            if user_df is None or user_df.empty:
                return 0
            # refresh 후에도 날짜 필터링이 적용되어 있으므로
            # 월별 캐시에서 다시 가져오기
            all_data = []
            for month in months:
                df = get_cached_data_month(month)
                if df is not None and not df.empty:
                    all_data.append(df)
            if not all_data:
                return 0
        
        # 날짜 필터링 전의 전체 데이터 합치기
        user_df = pd.concat(all_data, ignore_index=True)
        if 'userChatId' in user_df.columns:
            user_df = user_df.drop_duplicates(subset=['userChatId'], keep='first')
        
        print(f"[CSAT] 전체 userChat 수 (날짜 필터링 전): {len(user_df)}")

        # 2) CSAT 데이터가 있는 userChat만 필터링 (triggerId: 768201)
        
        # userChat 레벨에서는 workflowId가 아니라 triggerId를 확인해야 함
        # 하지만 userChat 자체에는 triggerId가 없고, 메시지 레벨에서만 확인 가능
        # 따라서 모든 userChat을 대상으로 하고, 메시지 레벨에서 필터링
        csat_df = user_df.copy()
        print(f"[CSAT] 전체 userChat 대상 (메시지 레벨에서 triggerId 필터링)")

        # 3) firstAskedAt을 확실하게 datetime으로 변환 (정렬 전 필수)
        # 문자열 상태로 정렬하면 날짜 순서가 뒤죽박죽이 됨
        if "firstAskedAt" in csat_df.columns:
            # utc=True로 파싱 후 KST로 변환하여 일관성 보장
            csat_df["firstAskedAt"] = pd.to_datetime(
                csat_df["firstAskedAt"], 
                errors="coerce", 
                utc=True
            ).dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
            print(f"[CSAT] firstAskedAt datetime 변환 완료: {csat_df['firstAskedAt'].notna().sum()}개 유효")
        
        # 4) 최신순 정렬 (내림차순) - datetime 변환 후 반드시 필요
        csat_df = csat_df.sort_values("firstAskedAt", ascending=False, na_position="last")
        
        # 정렬 확인용 로그
        if len(csat_df) > 0 and csat_df["firstAskedAt"].notna().sum() > 0:
            latest = csat_df["firstAskedAt"].max()
            oldest = csat_df["firstAskedAt"].min()
            print(f"[CSAT] 정렬 확인: 최신={latest}, 가장 오래됨={oldest}")
        
        # 5) chatId 목록과 userId/firstAskedAt 매핑 (날짜 슬라이싱 제거)
        need_cols = ["userChatId", "userId", "firstAskedAt"]
        for c in need_cols:
            if c not in csat_df.columns:
                csat_df[c] = None
        
        # 날짜 필터링 없이 전체 데이터 사용
        # 중요: 정렬된 csat_df에서 sub를 만들되, drop_duplicates 후에도 정렬 유지
        sub = csat_df[need_cols].dropna(subset=["userChatId"]).drop_duplicates(subset=["userChatId"], keep="first")
        # drop_duplicates 후에도 firstAskedAt 기준 정렬 유지
        sub = sub.sort_values("firstAskedAt", ascending=False, na_position="last")
        print(f"[CSAT] 처리 대상 chatId 수: {len(sub)} (날짜 범위 체크로 조기 종료 예정)")

        # 6) 각 chatId의 메시지 조회 & CSAT 파싱
        # 날짜 필터링 없이 전체 데이터를 최신순으로 돌면서 날짜 체크로 조기 종료
        rows = []
        total_n = len(sub)
        skipped_count = 0
        processed_count = 0
        start_dt = pd.to_datetime(start_date, errors="coerce")
        end_dt = pd.to_datetime(end_date, errors="coerce") + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)
        
        for i, (_, row) in enumerate(sub.iterrows(), start=1):
            chat_id = str(row["userChatId"])
            user_id = str(row["userId"]) if pd.notna(row["userId"]) else None
            asked_at = pd.to_datetime(row["firstAskedAt"], errors="coerce")
            if not chat_id or pd.isna(asked_at):
                continue

            # 날짜 범위밖 → 더 이상 볼 필요 없음 (정렬되어 있으므로)
            # 최신순 정렬이므로 start_date보다 작아지면 더 이상 처리할 필요 없음
            if asked_at < start_dt:
                print(f"[CSAT] 날짜 범위 벗어남 → 루프 중단 (firstAskedAt: {asked_at} < start_date: {start_date})")
                print(f"[CSAT] 처리 완료: 총 {i-1}개 확인, 신규 {len(rows)}개, 스킵 {skipped_count}개, 실제 처리 {processed_count}개")
                break
            
            # end_date보다 크면 스킵 (미래 데이터)
            if asked_at > end_dt:
                continue

            # 이미 저장된 chatId는 건너뛰기 (증분 업데이트)
            if chat_id in existing_ids:
                skipped_count += 1
                if skipped_count % 100 == 0 or skipped_count == 1:
                    print(f"[CSAT] 기존 chatId 스킵: {chat_id} (총 스킵: {skipped_count})")
                continue
            
            processed_count += 1

            try:
                print(f"[CSAT] 처리 중: {chat_id} ({i}/{total_n})")
                msgs = await channel_api.get_messages_by_chat(chat_id, limit=500, sort_order="desc")
                # ✅ CSAT 설문 워크플로우(768201)만 파싱 (잡음 제거)
                cs = channel_api.extract_csat_from_messages(msgs, allowed_trigger_ids={"768201"})
                # ✅ 768201을 시작한 건은 점수 제출 여부와 무관하게 저장 대상
                if not cs or not cs.get("wf_768201_started"):
                    continue

                rows.append({
                    "firstAskedAt": asked_at,
                    "userId": user_id,
                    "userChatId": chat_id,
                    "personId": cs.get("personId"),
                    "A-1": cs.get("A-1"),
                    "A-2": cs.get("A-2"),
                    "comment_3": cs.get("comment_3"),
                    "A-4": cs.get("A-4"),
                    "A-5": cs.get("A-5"),
                    "comment_6": cs.get("comment_6"),
                    "csatSubmittedAt": cs.get("csatSubmittedAt"),
                    "csatDate": pd.to_datetime(cs.get("csatSubmittedAt"), errors="coerce"),
                    # 👉 공통 분모 계산용 플래그 저장
                    "wf_768201_started": bool(cs.get("wf_768201_started")),
                    "has_score_any": bool(cs.get("has_score_any")),
                })
            except Exception as e:
                print(f"[CSAT] chatId={chat_id} 파싱 실패: {e}")
                continue

        if skipped_count > 0:
            print(f"[CSAT] 기존 chatId 스킵 완료: 총 {skipped_count}개")
        
        if not rows:
            print("[CSAT] 파싱된 CSAT 데이터가 없습니다. (모두 기존 캐시에 있거나 CSAT 없음)")
            return 0

        print(f"[CSAT] 신규 CSAT {len(rows)}개 파싱 완료")

        # 6) 월별로 쪼개서 저장 (userchats 캐시와 동일 정책)
        csat_df = pd.DataFrame(rows)

        # === 기존 buggy 블록 지우고 아래로 교체 ===
        # 1) 두 날짜 컬럼을 각각 KST naive로 정규화
        first_dt = pd.to_datetime(csat_df["firstAskedAt"], errors="coerce")
        if getattr(first_dt.dt, "tz", None) is not None:
            first_dt = first_dt.dt.tz_convert("Asia/Seoul").dt.tz_localize(None)

        # csatSubmittedAt에서 만든 csatDate는 KST(+09:00) tz-aware 문자열일 수 있음
        # → utc=True로 파싱 후 KST로 변환, tz 제거
        csat_dt = pd.to_datetime(csat_df["csatDate"], errors="coerce", utc=True)
        csat_dt = csat_dt.dt.tz_convert("Asia/Seoul").dt.tz_localize(None)

        # 2) 제출일 우선, 없으면 firstAskedAt
        csat_df["bucketDate"] = csat_dt.fillna(first_dt)

        # 3) 버킷 없는 행 제외 후 month 생성
        csat_df = csat_df[csat_df["bucketDate"].notna()].copy()
        csat_df["month"] = csat_df["bucketDate"].dt.to_period("M").astype(str)
        total_saved = 0
        for month, mdf in csat_df.groupby("month"):
            mdf = mdf.drop(columns=["month", "bucketDate"])
            key = f"csat_{month}"
            # 각 월의 첫날 00:00:00부터 마지막 날 23:59:59.999999까지
            month_period = pd.Period(month)
            month_start = month_period.start_time.replace(hour=0, minute=0, second=0, microsecond=0)
            month_end = month_period.end_time.replace(hour=23, minute=59, second=59, microsecond=999999)
            meta = {
                "month": month, 
                "range": [start_date, end_date], 
                "api_fetch": True, 
                "kind": "csat",
                "first_asked_start": month_start.isoformat(),
                "first_asked_end": month_end.isoformat()
            }
            server_cache.save_data(key, mdf, meta)
            total_saved += len(mdf)   # ✅ 누적 저장 수 반영
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
    
    # ✅ 기간 필터: 제출일(우선) → 제출일이 없으면 firstAskedAt
    # ✅ tz-aware(예: +09:00) → Asia/Seoul로 변환 후 naive 비교
    date_candidates = [c for c in ["csatDate", "csatSubmittedAt", "submittedAt", "firstAskedAt"] if c in out.columns]
    date_key = date_candidates[0] if date_candidates else None

    def _to_kst_naive_series(s):
        dt = pd.to_datetime(s, errors="coerce")
        # tz-aware면 KST로 변환 후 tz 제거
        try:
            if getattr(dt.dt, "tz", None) is not None:
                dt = dt.dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
        except Exception:
            # 일부 케이스는 tz_localize로만 들어오는 경우가 있어 보조 처리
            try:
                dt = pd.to_datetime(s, errors="coerce", utc=True).dt.tz_convert("Asia/Seoul").dt.tz_localize(None)
            except Exception:
                pass
        return dt

    if date_key is not None:
        out["_csat_dt"] = _to_kst_naive_series(out[date_key])

        # 모든 값이 NaT면 firstAskedAt로 폴백 시도
        if out["_csat_dt"].notna().sum() == 0 and "firstAskedAt" in out.columns:
            out["_csat_dt"] = _to_kst_naive_series(out["firstAskedAt"])

        s = pd.to_datetime(start_date)
        e = pd.to_datetime(end_date) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)

        mask = out["_csat_dt"].notna() & (out["_csat_dt"] >= s) & (out["_csat_dt"] <= e)
        out = out.loc[mask].drop(columns=["_csat_dt"]).reset_index(drop=True)
    else:
        # 날짜 키가 전혀 없으면 필터를 건너뜀(텅 비는 것 방지)
        print("[CSAT] 경고: 날짜 컬럼을 찾지 못해 기간 필터를 건너뜁니다.")
    
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

        # 중복 CSAT 응답 정리: userChatId+csatSubmittedAt 조합으로 중복 제거
        if "csatSubmittedAt" in merged.columns and "userChatId" in merged.columns:
            merged = (merged
                      .sort_values(["userChatId", "csatSubmittedAt"])
                      .drop_duplicates(subset=["userChatId", "csatSubmittedAt"], keep="last"))
        
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
        # --- 1) wf_768201_started를 견고한 bool 시리즈로 정규화 ---
        raw = df["wf_768201_started"] if "wf_768201_started" in df.columns else pd.Series(False, index=df.index)
        elig = pd.Series(raw, index=df.index)  # 인덱스 정렬
        elig = (elig
                .replace({True: True, False: False,
                          'True': True, 'False': False,
                          'true': True, 'false': False,
                          '1': True, '0': False, 1: True, 0: False})
                .fillna(False)
                .astype(bool))

        # 이 문항 값만 숫자화 (응답 유무 판단용)
        tmp = pd.to_numeric(df[score_col], errors="coerce")

        records = []
        # dropna=False 로 그룹핑해야 NaN 라벨(빈 값)도 따로 집계 가능
        for label_val, sub in df.groupby(label_col, dropna=False):
            # 빈 값이나 NaN은 "미분류"로 표시
            if pd.isna(label_val) or str(label_val).strip() == "":
                label_val = "미분류"
            sub_idx = sub.index

            # --- 2) 공통 분모: 설문 시작자 수 (해당 그룹 범위로 인덱스 맞춰 합산) ---
            denom = int(elig.reindex(sub_idx).sum())

            # --- 3) 문항별 응답자수: 이 문항에 실제 값이 있는 사람 수 ---
            answered_this = int(tmp.reindex(sub_idx).notna().sum())

            # --- 4) 문항별 미응답자수 ---
            non_responded = max(0, denom - answered_this)

            # 디버그 로그
            print(f"[CSAT_GRP] {label_col}={label_val} denom={denom} answered_this({score_col})={answered_this}")

            # 평균점수(문항별) 계산
            series = pd.to_numeric(sub[score_col], errors='coerce').dropna()
            avg = float(series.mean()) if len(series) else 0.0
            if not np.isfinite(avg):
                avg = 0.0

            user_ids = sub.get("userId")
            user_ids = sorted(set(user_ids.dropna().astype(str).tolist()))[:50] if user_ids is not None else []

            records.append({
                label_col: label_val,
                "평균점수": avg,
                "userIds": user_ids,

                # ✅ 공통 분모 + 문항별 응답/미응답
                "대상자수": denom,
                "응답자수": answered_this,
                "미응답자수": non_responded,
                "막대값": answered_this,  # 차트 막대 길이 = 문항별 응답자수
            })

        # 안전장치
        for r in records:
            r["평균점수"] = float(np.nan_to_num(r["평균점수"], nan=0.0, posinf=0.0, neginf=0.0))
            r["응답자수"] = int(np.nan_to_num(r["응답자수"], nan=0, posinf=0, neginf=0))
            r["미응답자수"] = int(np.nan_to_num(r["미응답자수"], nan=0, posinf=0, neginf=0))
            r["대상자수"] = int(np.nan_to_num(r["대상자수"], nan=0, posinf=0, neginf=0))
            r["막대값"]   = int(np.nan_to_num(r["막대값"],   nan=0, posinf=0, neginf=0))

        return sorted(records, key=lambda r: r["응답자수"], reverse=True)

    for label in ["문의유형", "고객유형", "서비스유형"]:
        result[label] = {}
        for a in csat_cols:
            result[label][a] = _group_payload(enriched_df, label, a)
            print(f"  - {label}별 {a}: {len(result[label][a])}개 그룹")

    print(f"[CSAT] 유형별 집계 완료: {len(result)}개 유형")
    return result