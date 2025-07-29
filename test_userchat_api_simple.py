import httpx
import asyncio
import base64

async def test_channel_api():
    """Channel.io API 인증 테스트"""
    
    # 제공된 인증 정보
    ACCESS_KEY = "68883a95c1c0f08306f3"
    ACCESS_SECRET = "7c7fc51ce244238c23c6fb86c0d7583a"
    USER_ID = "674523ee339f9bd5feb9"
    
    base_url = "https://api.channel.io"
    
    # 테스트할 인증 방식들
    auth_methods = [
        {
            "name": "Bearer Token (Access Key)",
            "headers": {
                "Authorization": f"Bearer {ACCESS_KEY}",
                "Content-Type": "application/json"
            }
        },
        {
            "name": "Bearer Token (Access Secret)",
            "headers": {
                "Authorization": f"Bearer {ACCESS_SECRET}",
                "Content-Type": "application/json"
            }
        },
        {
            "name": "Basic Auth (Key:Secret)",
            "headers": {
                "Authorization": f"Basic {base64.b64encode(f'{ACCESS_KEY}:{ACCESS_SECRET}'.encode()).decode()}",
                "Content-Type": "application/json"
            }
        },
        {
            "name": "X-API-Key Header",
            "headers": {
                "X-API-Key": ACCESS_KEY,
                "Content-Type": "application/json"
            }
        },
        {
            "name": "X-Channel-Token Header",
            "headers": {
                "X-Channel-Token": ACCESS_KEY,
                "Content-Type": "application/json"
            }
        }
    ]
    
    print("=== Channel.io API 인증 테스트 ===")
    print(f"Access Key: {ACCESS_KEY}")
    print(f"Access Secret: {ACCESS_SECRET}")
    print(f"User ID: {USER_ID}")
    print()
    
    # 사용자 이벤트 API 테스트
    test_url = f"{base_url}/open/v5/users/{USER_ID}/events"
    params = {"limit": 1}
    
    for method in auth_methods:
        print(f"테스트 중: {method['name']}")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(test_url, headers=method['headers'], params=params)
                
                if response.status_code == 200:
                    print(f"✅ 성공! {method['name']}")
                    data = response.json()
                    print(f"   응답 데이터: {data}")
                    return method['headers']  # 성공한 인증 방식 반환
                else:
                    print(f"❌ 실패: {response.status_code}")
                    print(f"   응답: {response.text}")
                    
        except Exception as e:
            print(f"❌ 오류: {str(e)}")
        
        print()
    
    print("모든 인증 방식이 실패했습니다.")
    print("\n=== 해결 방법 ===")
    print("1. Channel.io 관리자 페이지에서 API 설정을 확인하세요.")
    print("2. Access Token이 올바른지 확인하세요.")
    print("3. API 권한이 설정되어 있는지 확인하세요.")
    print("4. 채널 ID가 올바른지 확인하세요.")
    
    return None

async def test_userchat_with_auth(headers):
    """성공한 인증 방식으로 UserChat 조회 테스트"""
    if not headers:
        print("인증 정보가 없습니다.")
        return
    
    ACCESS_KEY = "68883a95c1c0f08306f3"
    USER_ID = "674523ee339f9bd5feb9"
    
    print("\n=== UserChat 조회 테스트 ===")
    
    # 먼저 사용자 이벤트에서 UserChat ID 찾기
    base_url = "https://api.channel.io"
    events_url = f"{base_url}/open/v5/users/{USER_ID}/events"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(events_url, headers=headers, params={"limit": 10})
            if response.status_code == 200:
                events_data = response.json()
                events = events_data.get('events', [])
                
                print(f"사용자 이벤트 개수: {len(events)}")
                
                # UserChat ID 찾기
                userchat_ids = []
                for event in events:
                    if 'userChatId' in event:
                        userchat_ids.append(event['userChatId'])
                
                if userchat_ids:
                    print(f"발견된 UserChat ID: {userchat_ids[0]}")
                    
                    # UserChat 조회
                    userchat_url = f"{base_url}/open/v5/user-chats/{userchat_ids[0]}"
                    userchat_response = await client.get(userchat_url, headers=headers)
                    
                    if userchat_response.status_code == 200:
                        userchat_data = userchat_response.json()
                        print("✅ UserChat 조회 성공!")
                        print(f"UserChat 정보: {userchat_data}")
                    else:
                        print(f"❌ UserChat 조회 실패: {userchat_response.status_code}")
                        print(f"응답: {userchat_response.text}")
                else:
                    print("UserChat ID를 찾을 수 없습니다.")
            else:
                print(f"이벤트 조회 실패: {response.status_code}")
                
    except Exception as e:
        print(f"오류: {str(e)}")

async def main():
    # 인증 테스트
    successful_auth = await test_channel_api()
    
    # 성공한 인증 방식으로 UserChat 테스트
    if successful_auth:
        await test_userchat_with_auth(successful_auth)

if __name__ == "__main__":
    asyncio.run(main()) 