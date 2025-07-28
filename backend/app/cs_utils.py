import os
import httpx
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import asyncio
from dotenv import load_dotenv

load_dotenv()

class ChannelTalkAPI:
    def __init__(self):
        self.base_url = "https://api.channel.io"
        self.access_key = os.getenv("CHANNEL_ACCESS_TOKEN")
        self.headers = {
            "Authorization": f"Bearer {self.access_key}",
            "Content-Type": "application/json"
        }

    async def get_userchats(self, start_date: str, end_date: str, limit: int = 100) -> List[Dict]:
        """Channel Talk API에서 UserChat 데이터를 가져옵니다."""
        if not self.access_key:
            raise ValueError("CHANNEL_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")
        
        url = f"{self.base_url}/openapi/v5/userchats"
        params = {
            "startDate": start_date,
            "endDate": end_date,
            "limit": limit
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()

    async def get_user_events(self, user_id: str, since: Optional[int] = None, limit: int = 25) -> Dict:
        """Channel Talk API에서 사용자 이벤트 데이터를 가져옵니다."""
        if not self.access_key:
            raise ValueError("CHANNEL_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")
        
        url = f"{self.base_url}/open/v5/users/{user_id}/events"
        params = {
            "sortOrder": "desc",
            "limit": limit
        }
        
        if since:
            params["since"] = since
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()

    async def get_all_user_events(self, user_ids: List[str], since: Optional[int] = None) -> List[Dict]:
        """여러 사용자의 이벤트 데이터를 병렬로 가져옵니다."""
        if not self.access_key:
            raise ValueError("CHANNEL_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")
        
        tasks = []
        for user_id in user_ids:
            task = self.get_user_events(user_id, since)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        all_events = []
        for result in results:
            if isinstance(result, dict) and "events" in result:
                all_events.extend(result["events"])
        
        return all_events

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
        processed_data = []
        
        for item in data:
            tags = item.get("tags", [])
            processed_item = {
                "userId": item.get("userId"),
                "mediumType": item.get("mediumType"),
                "workflow": item.get("workflow"),
                "tags": tags,
                "chats": item.get("chats", []),
                "createdAt": item.get("createdAt"),
                "firstAskedAt": item.get("firstAskedAt"),
                "operationWaitingTime": item.get("operationWaitingTime"),
                "operationAvgReplyTime": item.get("operationAvgReplyTime"),
                "operationTotalReplyTime": item.get("operationTotalReplyTime"),
                "operationResolutionTime": item.get("operationResolutionTime"),
                "서비스유형": self.extract_level(tags, "서비스유형", 1),
                "서비스유형_2차": self.extract_level(tags, "서비스유형", 2),
                "고객유형": self.extract_level(tags, "고객유형", 1),
                "문의유형": self.extract_level(tags, "문의유형", 1),
                "문의유형_2차": self.extract_level(tags, "문의유형", 2),
            }
            processed_data.append(processed_item)
        
        return pd.DataFrame(processed_data)

# 전역 API 클라이언트 인스턴스
channel_api = ChannelTalkAPI()

# 전역 데이터 캐시
_data_cache = {}

async def get_cached_data(start_date: str, end_date: str) -> pd.DataFrame:
    """캐시된 데이터를 가져오거나 API에서 새로 가져옵니다."""
    cache_key = f"{start_date}_{end_date}"
    
    if cache_key in _data_cache:
        return _data_cache[cache_key]
    
    try:
        raw_data = await channel_api.get_userchats(start_date, end_date)
        df = await channel_api.process_userchat_data(raw_data)
        _data_cache[cache_key] = df
        return df
    except Exception as e:
        print(f"데이터 로드 실패: {e}")
        return pd.DataFrame()

def get_filtered_df(df: pd.DataFrame, start: str, end: str, 
                   고객유형="전체", 문의유형="전체", 서비스유형="전체", 
                   문의유형_2차="전체", 서비스유형_2차="전체") -> pd.DataFrame:
    """필터링된 DataFrame을 반환합니다."""
    temp = df.copy()
    temp = temp[(temp['firstAskedAt'] >= start) & (temp['firstAskedAt'] <= end)]
    
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
    
    return temp.reset_index(drop=True)

async def process_events_data(events: List[Dict]) -> pd.DataFrame:
    """이벤트 데이터를 처리하여 DataFrame으로 변환합니다."""
    processed_events = []
    
    for event in events:
        processed_event = {
            "userId": event.get("userId"),
            "eventId": event.get("id"),
            "channelId": event.get("channelId"),
            "eventName": event.get("name"),
            "properties": event.get("property", {}),
            "createdAt": event.get("createdAt"),
            "expireAt": event.get("expireAt"),
            "version": event.get("version")
        }
        processed_events.append(processed_event)
    
    return pd.DataFrame(processed_events)

async def get_events_analysis(user_ids: List[str], since: Optional[int] = None) -> Dict:
    """이벤트 데이터 분석을 수행합니다."""
    try:
        events = await channel_api.get_all_user_events(user_ids, since)
        df = await process_events_data(events)
        
        if df.empty:
            return {
                "total_events": 0,
                "event_types": [],
                "top_events": [],
                "events_by_user": {},
                "recent_events": []
            }
        
        # 이벤트 타입별 통계
        event_counts = df["eventName"].value_counts()
        
        # 사용자별 이벤트 수
        user_event_counts = df["userId"].value_counts()
        
        # 최근 이벤트 (최대 10개)
        recent_events = df.sort_values("createdAt", ascending=False).head(10)
        
        return {
            "total_events": len(df),
            "event_types": event_counts.to_dict(),
            "top_events": event_counts.head(10).to_dict(),
            "events_by_user": user_event_counts.head(10).to_dict(),
            "recent_events": recent_events.to_dict(orient="records")
        }
    except Exception as e:
        print(f"이벤트 분석 실패: {e}")
        return {
            "total_events": 0,
            "event_types": [],
            "top_events": [],
            "events_by_user": {},
            "recent_events": []
        } 