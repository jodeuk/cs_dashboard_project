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
        self.access_key = os.getenv("CHANNEL_ACCESS_KEY")
        self.access_secret = os.getenv("CHANNEL_ACCESS_SECRET")
        
        # 올바른 인증 헤더 설정 (x-access-key, x-access-secret 사용)
        self.headers = {
            "x-access-key": self.access_key,
            "x-access-secret": self.access_secret,
            "Content-Type": "application/json"
        }

    async def get_userchats(self, start_date: str, end_date: str, limit: int = 1000) -> List[Dict]:
        """Channel Talk API에서 UserChat 데이터를 가져옵니다."""
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY 또는 CHANNEL_ACCESS_SECRET 환경변수가 설정되지 않았습니다.")
        
        # 올바른 API 엔드포인트 사용
        url = f"{self.base_url}/open/v5/user-chats"
        
        # 날짜를 Unix timestamp로 변환 (마이크로초 단위)
        start_timestamp = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000000)
        end_timestamp = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000000)
        
        params = {
            "startAt": start_timestamp,
            "endAt": end_timestamp,
            "limit": limit,
            "sortOrder": "desc"
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                data = response.json()
                
                # API 응답 구조에 맞게 처리
                print(f"[API] 전체 응답 키들: {list(data.keys()) if isinstance(data, dict) else 'list'}")
                print(f"[API] 응답 데이터 타입: {type(data)}")
                
                if "userChats" in data:
                    user_chats = data["userChats"]
                    print(f"[API] userChats 개수: {len(user_chats)}")
                    return user_chats
                elif isinstance(data, list):
                    print(f"[API] list 데이터 개수: {len(data)}")
                    return data
                else:
                    print(f"[API] 예상치 못한 응답 구조: {data}")
                    return []
                    
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"API 호출 중 오류 발생: {str(e)}")
            raise

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
        processed_data = []
        
        for item in data:
            # API 응답 구조에 맞게 수정
            userchat = item.get("userChat", item)  # userChat 키가 있으면 사용, 없으면 item 자체
            user = item.get("user", {})
            
            tags = userchat.get("tags", [])
            
            # firstAskedAt을 Unix timestamp에서 ISO 문자열로 변환
            first_asked_at = userchat.get("firstAskedAt")
            if first_asked_at and isinstance(first_asked_at, (int, float)):
                # Unix timestamp (밀리초)를 ISO 문자열로 변환
                from datetime import datetime
                first_asked_at = datetime.fromtimestamp(first_asked_at / 1000).isoformat()
            
            processed_item = {
                # 실제 데이터 구조에 맞춘 키들
                "userId": userchat.get("userId"),
                "mediumType": userchat.get("mediumType"),
                "workflow": userchat.get("workflow"),
                "tags": tags,
                "chats": userchat.get("chats", []),
                "firstAskedAt": first_asked_at,
                # operation이 붙은 키들 (우리가 사용할 키들)
                "operationWaitingTime": userchat.get("operationWaitingTime", 0),
                "operationAvgReplyTime": userchat.get("operationAvgReplyTime", 0),
                "operationTotalReplyTime": userchat.get("operationTotalReplyTime", 0),
                "operationResolutionTime": userchat.get("operationResolutionTime", 0),
                # 추가 정보들
                "userChatId": userchat.get("id"),
                "channelId": userchat.get("channelId"),
                "state": userchat.get("state"),
                "managed": userchat.get("managed"),
                "name": userchat.get("name"),
                "description": userchat.get("description"),
                "assigneeId": userchat.get("assigneeId"),
                "teamId": userchat.get("teamId"),
                "firstOpenedAt": userchat.get("firstOpenedAt"),
                "openedAt": userchat.get("openedAt"),
                "closedAt": userchat.get("closedAt"),
                "askedAt": userchat.get("askedAt"),
                "firstRepliedAtAfterOpen": userchat.get("firstRepliedAtAfterOpen"),
                "replyCount": userchat.get("replyCount", 0),
                "goalState": userchat.get("goalState"),
                "goalEventName": userchat.get("goalEventName"),
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

# 전역 데이터 캐시
_data_cache = {}

async def get_cached_data(start_date: str, end_date: str) -> pd.DataFrame:
    """캐시된 데이터를 가져오거나 JSON 파일에서 새로 가져옵니다."""
    cache_key = f"{start_date}_{end_date}"
    
    if cache_key in _data_cache:
        return _data_cache[cache_key]
    
    try:
        # 실제 JSON 파일에서 데이터 읽기
        import json
        import os
        
        # JSON 파일 경로 (상대 경로)
        json_file_path = "../../json_data/cs_chat_4-7.jsonl"
        
        if not os.path.exists(json_file_path):
            # 절대 경로로 시도
            json_file_path = "json_data/cs_chat_4-7.jsonl"
        
        if not os.path.exists(json_file_path):
            raise FileNotFoundError(f"JSON 파일을 찾을 수 없습니다: {json_file_path}")
        
        # JSONL 파일 읽기
        data = []
        with open(json_file_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    data.append(json.loads(line))
        
        df = pd.DataFrame(data)
        _data_cache[cache_key] = df
        print(f"데이터 로드 성공: {len(df)} 건")
        return df
    except Exception as e:
        print(f"데이터 로드 실패: {e}")
        # 실제 데이터 구조에 맞춘 샘플 데이터
        sample_data = [
            {
                "userId": "sample_user_1",
                "mediumType": "native",
                "workflow": "support",
                "tags": ["고객유형/일반고객", "문의유형/기술지원", "서비스유형/웹서비스"],
                "firstAskedAt": "2025-06-15T10:00:00",
                "operationWaitingTime": 300,
                "operationAvgReplyTime": 600,
                "operationTotalReplyTime": 1800,
                "operationResolutionTime": 3600,
                "cs_satisfaction": None,
                "chats": ["안녕하세요", "로그인이 안됩니다", "도와주세요"]
            },
            {
                "userId": "sample_user_2",
                "mediumType": "native",
                "workflow": "billing",
                "tags": ["고객유형/기업고객", "문의유형/결제문의", "서비스유형/결제서비스"],
                "firstAskedAt": "2025-06-20T14:30:00",
                "operationWaitingTime": 180,
                "operationAvgReplyTime": 450,
                "operationTotalReplyTime": 1200,
                "operationResolutionTime": 2400,
                "cs_satisfaction": None,
                "chats": ["환불 요청합니다", "결제 취소 부탁드립니다"]
            },
            {
                "userId": "sample_user_3",
                "mediumType": "native",
                "workflow": "account",
                "tags": ["고객유형/일반고객", "문의유형/계정문의", "서비스유형/계정서비스"],
                "firstAskedAt": "2025-06-25T09:15:00",
                "operationWaitingTime": 120,
                "operationAvgReplyTime": 300,
                "operationTotalReplyTime": 900,
                "operationResolutionTime": 1800,
                "cs_satisfaction": None,
                "chats": ["비밀번호를 변경하고 싶습니다", "이메일 인증이 안됩니다"]
            },
            {
                "userId": "sample_user_4",
                "mediumType": "native",
                "workflow": "technical",
                "tags": ["고객유형/기업고객", "문의유형/기술지원", "서비스유형/API서비스"],
                "firstAskedAt": "2025-06-28T16:45:00",
                "operationWaitingTime": 600,
                "operationAvgReplyTime": 900,
                "operationTotalReplyTime": 2700,
                "operationResolutionTime": 5400,
                "cs_satisfaction": None,
                "chats": ["API 연동에 문제가 있습니다", "인증 토큰이 만료되었습니다"]
            }
        ]
        return pd.DataFrame(sample_data)

def get_filtered_df(df: pd.DataFrame, start: str, end: str, 
                   고객유형="전체", 문의유형="전체", 서비스유형="전체", 
                   문의유형_2차="전체", 서비스유형_2차="전체") -> pd.DataFrame:
    """필터링된 DataFrame을 반환합니다."""
    temp = df.copy()
    
    # 날짜 컬럼을 datetime으로 변환
    temp['firstAskedAt'] = pd.to_datetime(temp['firstAskedAt'])
    start_date = pd.to_datetime(start)
    end_date = pd.to_datetime(end)
    
    temp = temp[(temp['firstAskedAt'] >= start_date) & (temp['firstAskedAt'] <= end_date)]
    
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

 