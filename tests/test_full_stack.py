#!/usr/bin/env python3
"""
전체 스택 (백엔드 + 프론트엔드) 테스트 스크립트
"""

import requests
import time
import sys
from datetime import datetime

def test_backend_health():
    """백엔드 헬스체크 테스트"""
    try:
        response = requests.get("http://localhost:8000/health", timeout=10)
        if response.status_code == 200:
            print("✅ 백엔드 헬스체크 성공")
            return True
        else:
            print(f"❌ 백엔드 헬스체크 실패: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ 백엔드 연결 실패: {e}")
        return False

def test_frontend_health():
    """프론트엔드 헬스체크 테스트"""
    try:
        response = requests.get("http://localhost:3000", timeout=10)
        if response.status_code == 200:
            print("✅ 프론트엔드 헬스체크 성공")
            return True
        else:
            print(f"❌ 프론트엔드 헬스체크 실패: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ 프론트엔드 연결 실패: {e}")
        return False

def test_api_proxy():
    """프론트엔드를 통한 API 프록시 테스트"""
    try:
        response = requests.get("http://localhost:3000/api/test", timeout=10)
        if response.status_code == 200:
            print("✅ API 프록시 테스트 성공")
            return True
        else:
            print(f"❌ API 프록시 테스트 실패: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ API 프록시 연결 실패: {e}")
        return False

def test_cache_system():
    """캐시 시스템 테스트"""
    try:
        response = requests.get("http://localhost:3000/api/cache/status", timeout=10)
        if response.status_code == 200:
            cache_info = response.json()
            print(f"✅ 캐시 시스템 상태: {cache_info}")
            return True
        else:
            print(f"❌ 캐시 시스템 테스트 실패: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ 캐시 시스템 연결 실패: {e}")
        return False

def main():
    """메인 테스트 함수"""
    print("🚀 CS Dashboard 전체 스택 테스트 시작...")
    
    # 서버 시작 대기
    print("⏳ 서버 시작 대기 중...")
    backend_ready = False
    frontend_ready = False
    
    for i in range(60):  # 60초 대기
        if not backend_ready:
            backend_ready = test_backend_health()
        if not frontend_ready:
            frontend_ready = test_frontend_health()
        
        if backend_ready and frontend_ready:
            break
            
        time.sleep(1)
        print(f"⏳ 대기 중... ({i+1}/60)")
    
    if not backend_ready:
        print("❌ 백엔드 서버 시작 실패")
        sys.exit(1)
    
    if not frontend_ready:
        print("❌ 프론트엔드 서버 시작 실패")
        sys.exit(1)
    
    print("\n📋 API 프록시 테스트...")
    api_proxy_success = test_api_proxy()
    
    print("\n📋 캐시 시스템 테스트...")
    cache_success = test_cache_system()
    
    print("\n📊 테스트 결과:")
    print(f"백엔드: ✅ 성공")
    print(f"프론트엔드: ✅ 성공")
    print(f"API 프록시: {'✅ 성공' if api_proxy_success else '❌ 실패'}")
    print(f"캐시 시스템: {'✅ 성공' if cache_success else '❌ 실패'}")
    
    if api_proxy_success and cache_success:
        print("\n🎉 모든 테스트 통과!")
        print("\n🌐 접속 정보:")
        print("   프론트엔드: http://localhost:3000")
        print("   백엔드 API: http://localhost:8000")
        print("   API 문서: http://localhost:8000/docs")
        return True
    else:
        print("\n❌ 일부 테스트 실패")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 