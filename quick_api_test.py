#!/usr/bin/env python3
"""
빠른 API 테스트 스크립트
환경변수 설정 후 API가 제대로 작동하는지 확인합니다.
"""

import requests
import time

def test_api():
    """API 상태를 빠르게 테스트합니다."""
    base_url = "https://cs-dashboard-project.onrender.com"
    
    print("🔍 API 상태 확인 중...")
    print(f"📡 URL: {base_url}")
    print()
    
    # 1. 기본 상태 확인
    try:
        response = requests.get(f"{base_url}/", timeout=10)
        if response.status_code == 200:
            print("✅ 기본 API 정상 작동")
            print(f"   응답: {response.json()}")
        else:
            print(f"❌ 기본 API 오류: {response.status_code}")
    except Exception as e:
        print(f"❌ 기본 API 연결 실패: {str(e)}")
    
    print()
    
    # 2. Channel.io API 환경변수 확인
    try:
        response = requests.get(f"{base_url}/api/debug-channel-api", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print("🔧 Channel.io API 환경변수 상태:")
            print(f"   상태: {data.get('status', 'unknown')}")
            print(f"   메시지: {data.get('message', 'N/A')}")
            print(f"   Access Key 존재: {data.get('access_key_exists', False)}")
            print(f"   Access Secret 존재: {data.get('access_secret_exists', False)}")
            
            if data.get('status') == 'success':
                print("   ✅ 환경변수가 올바르게 설정됨!")
            else:
                print("   ⚠️ 환경변수 설정 필요")
        else:
            print(f"❌ 환경변수 확인 실패: {response.status_code}")
    except Exception as e:
        print(f"❌ 환경변수 확인 실패: {str(e)}")
    
    print()
    
    # 3. UserChat API 테스트 (환경변수가 설정된 경우)
    try:
        test_userchat_id = "6888615a04ae7d5fab51"
        response = requests.get(f"{base_url}/api/user-chat/{test_userchat_id}", timeout=15)
        if response.status_code == 200:
            print("✅ UserChat API 정상 작동!")
            data = response.json()
            userchat = data.get('userChat', {})
            print(f"   UserChat ID: {userchat.get('id', 'N/A')}")
            print(f"   상태: {userchat.get('state', 'N/A')}")
        elif response.status_code == 500:
            error_text = response.text
            if "환경변수" in error_text:
                print("❌ UserChat API: 환경변수 설정 필요")
            else:
                print(f"❌ UserChat API 오류: {error_text}")
        else:
            print(f"❌ UserChat API 오류: {response.status_code}")
    except Exception as e:
        print(f"❌ UserChat API 연결 실패: {str(e)}")
    
    print()
    print("🎯 테스트 완료!")

if __name__ == "__main__":
    test_api() 