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
        
        all_userchats = []
        next_key = None
        
        async with httpx.AsyncClient() as client:
            while True:
                params = {
                    "limit": limit,
                    "startDate": start_date,
                    "endDate": end_date
                }
                if next_key:
                    params["nextKey"] = next_key
                
                response = await client.get(
                    f"{self.base_url}/openapi/v1/userchats",
                    headers=self.headers,
                    params=params
                )
                
                if response.status_code != 200:
                    raise Exception(f"API 호출 실패: {response.status_code} - {response.text}")
                
                data = response.json()
                userchats = data.get("userchats", [])
                all_userchats.extend(userchats)
                
                # 다음 페이지가 있는지 확인
                next_key = data.get("nextKey")
                if not next_key:
                    break
        
        return all_userchats
    
    def extract_level(self, tags: List[str], type_name: str, level: int) -> Optional[str]:
        """태그에서 특정 레벨의 값을 추출합니다."""
        if not tags:
            return None
        for tag in tags:
            if tag.startswith(f"{type_name}/"):
                parts = tag.split("/")
                if len(parts) > level:
                    return parts[level]
        return None
    
    def hms_to_seconds(self, hms_str: str) -> Optional[int]:
        """HH:MM:SS 형식의 시간을 초로 변환합니다."""
        if not hms_str or pd.isna(hms_str):
            return None
        try:
            h, m, s = map(int, str(hms_str).split(":"))
            return h * 3600 + m * 60 + s
        except:
            return None
    
    def process_userchat_data(self, userchats: List[Dict]) -> pd.DataFrame:
        """UserChat 데이터를 DataFrame으로 변환하고 필요한 필드를 추출합니다."""
        processed_data = []
        
        for userchat in userchats:
            # 필요한 필드 추출
            processed_item = {
                "userId": userchat.get("user", {}).get("id"),
                "mediumType": userchat.get("mediumType"),
                "workflow": userchat.get("workflow"),
                "tags": userchat.get("chatTags", []),
                "chats": userchat.get("messages", []),
                "createdAt": userchat.get("createdAt"),
                "firstAskedAt": userchat.get("firstAskedAt"),
                "operationWaitingTime": userchat.get("operationWaitingTime"),
                "operationAvgReplyTime": userchat.get("operationAvgReplyTime"),
                "operationTotalReplyTime": userchat.get("operationTotalReplyTime"),
                "operationResolutionTime": userchat.get("operationResolutionTime")
            }
            
            # 태그에서 계층 구조 추출
            tags = [tag.get("name") for tag in userchat.get("chatTags", [])]
            processed_item["서비스유형"] = self.extract_level(tags, "서비스유형", 1)
            processed_item["서비스유형_2차"] = self.extract_level(tags, "서비스유형", 2)
            processed_item["고객유형"] = self.extract_level(tags, "고객유형", 1)
            processed_item["문의유형"] = self.extract_level(tags, "문의유형", 1)
            processed_item["문의유형_2차"] = self.extract_level(tags, "문의유형", 2)
            
            # 날짜 변환
            if processed_item["firstAskedAt"]:
                processed_item["firstAskedAt"] = pd.to_datetime(processed_item["firstAskedAt"], unit='ms')
                processed_item["month"] = processed_item["firstAskedAt"].strftime('%Y-%m')
            
            # CSAT 데이터 처리 (있는 경우)
            if "cs_satisfaction" in userchat and isinstance(userchat["cs_satisfaction"], dict):
                for k, v in userchat["cs_satisfaction"].items():
                    processed_item[k] = v
            
            processed_data.append(processed_item)
        
        return pd.DataFrame(processed_data)

# 전역 API 클라이언트 인스턴스
channel_api = ChannelTalkAPI()

# 데이터 캐시 (메모리 기반)
_data_cache = {}
_cache_timestamp = None
CACHE_DURATION = 300  # 5분

async def get_cached_data(start_date: str, end_date: str) -> pd.DataFrame:
    """캐시된 데이터를 반환하거나 API에서 새로 가져옵니다."""
    global _data_cache, _cache_timestamp
    
    cache_key = f"{start_date}_{end_date}"
    current_time = datetime.now()
    
    # 캐시가 유효한지 확인
    if (_cache_timestamp and 
        (current_time - _cache_timestamp).seconds < CACHE_DURATION and 
        cache_key in _data_cache):
        return _data_cache[cache_key]
    
    # API에서 새 데이터 가져오기
    try:
        userchats = await channel_api.get_userchats(start_date, end_date)
        df = channel_api.process_userchat_data(userchats)
        
        # 캐시 업데이트
        _data_cache[cache_key] = df
        _cache_timestamp = current_time
        
        return df
    except Exception as e:
        # API 호출 실패 시 캐시된 데이터 반환 (있는 경우)
        if cache_key in _data_cache:
            return _data_cache[cache_key]
        raise e

def get_filtered_df(
    df: pd.DataFrame,
    start: str, 
    end: str, 
    고객유형: str = "전체", 
    문의유형: str = "전체", 
    서비스유형: str = "전체", 
    문의유형_2차: str = "전체", 
    서비스유형_2차: str = "전체"
) -> pd.DataFrame:
    """필터 조건에 따라 DataFrame을 필터링합니다."""
    temp = df.copy()
    
    # 날짜 필터링
    start_dt = pd.to_datetime(start)
    end_dt = pd.to_datetime(end)
    temp = temp[(temp['firstAskedAt'] >= start_dt) & (temp['firstAskedAt'] <= end_dt)]
    
    # 기타 필터링
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
