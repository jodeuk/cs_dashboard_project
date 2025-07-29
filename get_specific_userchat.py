import httpx
import asyncio
import os
from datetime import datetime
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

class ChannelTalkAPI:
    def __init__(self, access_key: str = None, access_secret: str = None):
        self.base_url = "https://api.channel.io"
        
        # 환경변수에서 인증 정보 가져오기 (우선순위: 매개변수 > 환경변수)
        self.access_key = access_key or os.getenv("CHANNEL_ACCESS_KEY")
        self.access_secret = access_secret or os.getenv("CHANNEL_ACCESS_SECRET")
        
        if not self.access_key or not self.access_secret:
            raise ValueError("CHANNEL_ACCESS_KEY와 CHANNEL_ACCESS_SECRET이 필요합니다. 환경변수나 매개변수로 설정해주세요.")
        
        self.headers = {
            "x-access-key": self.access_key,
            "x-access-secret": self.access_secret,
            "Content-Type": "application/json"
        }

    async def get_userchat_by_id(self, userchat_id: str):
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

def format_timestamp(timestamp):
    """Unix timestamp를 읽기 쉬운 날짜로 변환"""
    if timestamp:
        return datetime.fromtimestamp(timestamp / 1000000).strftime('%Y-%m-%d %H:%M:%S')
    return "N/A"

async def main():
    # 환경변수에서 사용자 ID 가져오기 (기본값 설정)
    USERCHAT_ID = os.getenv("TEST_USERCHAT_ID", "6888615a04ae7d5fab51")
    
    try:
        # API 클라이언트 초기화 (환경변수 사용)
        api = ChannelTalkAPI()
        
        print(f"=== UserChat 조회 ===")
        print(f"UserChat ID: {USERCHAT_ID}")
        print(f"Access Key: {api.access_key[:10]}...")
        print()
        
        # UserChat 조회
        userchat_data = await api.get_userchat_by_id(USERCHAT_ID)
        
        # UserChat 기본 정보
        userchat = userchat_data.get('userChat', {})
        print("📋 UserChat 기본 정보")
        print(f"  ID: {userchat.get('id', 'N/A')}")
        print(f"  상태: {userchat.get('state', 'N/A')}")
        print(f"  채널 ID: {userchat.get('channelId', 'N/A')}")
        print(f"  담당자 ID: {userchat.get('assigneeId', 'N/A')}")
        print(f"  팀 ID: {userchat.get('teamId', 'N/A')}")
        print(f"  태그: {userchat.get('tags', [])}")
        print()
        
        # 시간 정보
        print("⏰ 시간 정보")
        print(f"  생성일: {format_timestamp(userchat.get('createdAt'))}")
        print(f"  첫 문의일: {format_timestamp(userchat.get('firstAskedAt'))}")
        print(f"  문의일: {format_timestamp(userchat.get('askedAt'))}")
        print(f"  닫힌일: {format_timestamp(userchat.get('closedAt'))}")
        print(f"  첫 응답일: {format_timestamp(userchat.get('firstRepliedAtAfterOpen'))}")
        print()
        
        # 성능 지표
        print("📊 성능 지표")
        print(f"  대기 시간: {userchat.get('waitingTime', 0)}ms")
        print(f"  평균 응답 시간: {userchat.get('avgReplyTime', 0)}ms")
        print(f"  총 응답 시간: {userchat.get('totalReplyTime', 0)}ms")
        print(f"  응답 횟수: {userchat.get('replyCount', 0)}")
        print(f"  해결 시간: {userchat.get('resolutionTime', 0)}ms")
        print()
        
        # 사용자 정보
        if 'user' in userchat_data:
            user = userchat_data['user']
            print("👤 사용자 정보")
            print(f"  사용자 ID: {user.get('id', 'N/A')}")
            print(f"  이름: {user.get('name', 'N/A')}")
            print(f"  이메일: {user.get('email', 'N/A')}")
            print(f"  전화번호: {user.get('mobileNumber', 'N/A')}")
            print(f"  사용자 타입: {user.get('type', 'N/A')}")
            print()
        
        # 메시지 정보
        if 'message' in userchat_data:
            message = userchat_data['message']
            print("💬 메시지 정보")
            print(f"  메시지 ID: {message.get('id', 'N/A')}")
            print(f"  상태: {message.get('state', 'N/A')}")
            print(f"  생성일: {format_timestamp(message.get('createdAt'))}")
            print(f"  언어: {message.get('language', 'N/A')}")
            
            if 'plainText' in message:
                print(f"  메시지 내용:")
                print(f"    {message['plainText']}")
            print()
        
        # 세션 정보
        if 'session' in userchat_data:
            session = userchat_data['session']
            print("🔗 세션 정보")
            print(f"  세션 ID: {session.get('id', 'N/A')}")
            print(f"  읽음 여부: {session.get('unread', 0)}")
            print(f"  알림: {session.get('alert', 0)}")
            print(f"  읽은 시간: {format_timestamp(session.get('readAt'))}")
            print()
        
        print("✅ UserChat 조회 완료!")
        
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