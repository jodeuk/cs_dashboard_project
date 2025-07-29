import os
import httpx
import asyncio
import base64
from datetime import datetime
from typing import Dict, Optional
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

class ChannelTalkAPITest:
    def __init__(self, access_key: str = None, access_secret: str = None):
        self.base_url = "https://api.channel.io"
        
        # 환경변수에서 인증 정보 가져오기 (우선순위: 매개변수 > 환경변수)
        self.access_key = access_key or os.getenv("CHANNEL_ACCESS_KEY")
        self.access_secret = access_secret or os.getenv("CHANNEL_ACCESS_SECRET")
        
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY와 CHANNEL_ACCESS_SECRET이 필요합니다. 환경변수나 매개변수로 설정해주세요.")
        
        # 올바른 인증 헤더 설정 (x-access-key, x-access-secret 사용)
        self.headers = {
            "x-access-key": self.access_key,
            "x-access-secret": self.access_secret,
            "Content-Type": "application/json"
        }

    async def get_userchat_by_id(self, userchat_id: str) -> Dict:
        """특정 UserChat ID로 상세 정보를 가져옵니다."""
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

    async def get_user_events(self, user_id: str, since: Optional[int] = None, limit: int = 25) -> Dict:
        """Channel Talk API에서 사용자 이벤트 데이터를 가져옵니다."""
        url = f"{self.base_url}/open/v5/users/{user_id}/events"
        params = {
            "sortOrder": "desc",
            "limit": limit
        }
        
        if since:
            params["since"] = since
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"API 호출 중 오류 발생: {str(e)}")
            raise

    async def get_userchats(self, start_date: str = None, end_date: str = None, limit: int = 100) -> Dict:
        """UserChat 목록을 가져옵니다."""
        url = f"{self.base_url}/open/v5/user-chats"
        params = {
            "limit": limit,
            "sortOrder": "desc"
        }
        
        if start_date and end_date:
            # 날짜를 Unix timestamp로 변환 (마이크로초 단위)
            start_timestamp = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000000)
            end_timestamp = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000000)
            params["startAt"] = start_timestamp
            params["endAt"] = end_timestamp
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"API 호출 중 오류 발생: {str(e)}")
            raise

async def main():
    # 환경변수에서 사용자 ID 가져오기 (기본값 설정)
    USER_ID = os.getenv("TEST_USER_ID", "674523ee339f9bd5feb9")
    
    try:
        # API 클라이언트 초기화 (환경변수 사용)
        api = ChannelTalkAPITest()
        
        print("=== Channel.io API 테스트 ===")
        print(f"Access Key: {api.access_key[:10]}...")
        print(f"User ID: {USER_ID}")
        print()
        
        # 1. UserChat 목록 조회 (이미지에서 성공한 API)
        print("1. UserChat 목록 조회 중...")
        userchats = await api.get_userchats(limit=5)
        print(f"UserChat 개수: {len(userchats.get('userChats', []))}")
        
        if userchats.get('userChats'):
            print("최근 UserChat:")
            for i, userchat in enumerate(userchats['userChats'][:3]):
                print(f"  {i+1}. ID: {userchat.get('id', 'N/A')}")
                print(f"     상태: {userchat.get('state', 'N/A')}")
                print(f"     생성일: {userchat.get('createdAt', 'N/A')}")
                print()
        
        print()
        
        # 2. 특정 UserChat 조회 (첫 번째 UserChat ID 사용)
        if userchats.get('userChats'):
            first_userchat_id = userchats['userChats'][0]['id']
            print(f"2. 특정 UserChat 조회 중... (ID: {first_userchat_id})")
            
            userchat_data = await api.get_userchat_by_id(first_userchat_id)
            print("UserChat 조회 성공!")
            print(f"UserChat 상태: {userchat_data.get('userChat', {}).get('state', 'N/A')}")
            print(f"생성일: {userchat_data.get('userChat', {}).get('createdAt', 'N/A')}")
            
            # 주요 정보 출력
            userchat = userchat_data.get('userChat', {})
            print(f"채널 ID: {userchat.get('channelId', 'N/A')}")
            print(f"담당자 ID: {userchat.get('assigneeId', 'N/A')}")
            print(f"태그: {userchat.get('tags', [])}")
            
            # 메시지 정보가 있다면 출력
            if 'message' in userchat_data:
                message = userchat_data['message']
                print(f"메시지 ID: {message.get('id', 'N/A')}")
                print(f"메시지 상태: {message.get('state', 'N/A')}")
                if 'plainText' in message:
                    print(f"메시지 내용: {message['plainText'][:100]}...")
        
        print()
        
        # 3. 사용자 이벤트 조회
        print("3. 사용자 이벤트 조회 중...")
        events = await api.get_user_events(USER_ID, limit=10)
        print(f"이벤트 개수: {len(events.get('events', []))}")
        
        if events.get('events'):
            print("최근 이벤트:")
            for i, event in enumerate(events['events'][:3]):
                print(f"  {i+1}. {event.get('name', 'N/A')} - {event.get('createdAt', 'N/A')}")
        
    except ValueError as e:
        print(f"❌ 설정 오류: {str(e)}")
        print("\n🔧 해결 방법:")
        print("1. .env 파일을 생성하고 CHANNEL_ACCESS_KEY와 CHANNEL_ACCESS_SECRET을 설정하세요")
        print("2. 또는 환경변수로 직접 설정하세요:")
        print("   export CHANNEL_ACCESS_KEY=your_access_key")
        print("   export CHANNEL_ACCESS_SECRET=your_access_secret")
    except Exception as e:
        print(f"❌ 오류 발생: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())