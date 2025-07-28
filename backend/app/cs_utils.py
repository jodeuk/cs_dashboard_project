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
        
        url = f"{self.base_url}/openapi/v3/userchats"
        params = {
            "startDate": start_date,
            "endDate": end_date,
            "limit": limit
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()

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

    def extract_level(self, tags: List[str]) -> str:
        """태그에서 고객 레벨을 추출합니다."""
        if not tags:
            return "일반"
        
        level_keywords = ["VIP", "골드", "실버", "브론즈"]
        for tag in tags:
            for keyword in level_keywords:
                if keyword in tag:
                    return keyword
        return "일반"

    async def process_userchat_data(self, data: List[Dict]) -> pd.DataFrame:
        """UserChat 데이터를 처리하여 DataFrame으로 변환합니다."""
        processed_data = []
        
        for item in data:
            processed_item = {
                "userId": item.get("userId"),
                "mediumType": item.get("mediumType"),
                "workflow": item.get("workflow"),
                "tags": item.get("tags", []),
                "chats": item.get("chats", []),
                "createdAt": item.get("createdAt"),
                "firstAskedAt": item.get("firstAskedAt"),
                "operationWaitingTime": item.get("operationWaitingTime"),
                "operationAvgReplyTime": item.get("operationAvgReplyTime"),
                "operationTotalReplyTime": item.get("operationTotalReplyTime"),
                "operationResolutionTime": item.get("operationResolutionTime"),
                "고객유형": self.extract_level(item.get("tags", [])),
                "문의유형": item.get("workflow", "기타"),
                "서비스유형": item.get("mediumType", "기타"),
                "문의유형_2차": "기타",  # 나중에 확장 가능
                "서비스유형_2차": "기타"   # 나중에 확장 가능
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