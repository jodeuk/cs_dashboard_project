#!/usr/bin/env python3
"""
Docker 백엔드 배포 후 테스트 스크립트
"""

import requests
import time
import sys

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

def test_api_endpoints():
    """주요 API 엔드포인트 테스트"""
    endpoints = [
        ("/", "루트 엔드포인트"),
        ("/api/test", "API 테스트"),
        ("/api/filter-options?start=2025-01-01&end=2025-01-31", "필터 옵션"),
    ]
    
    success_count = 0
    for endpoint, description in endpoints:
        try:
            response = requests.get(f"http://localhost:8000{endpoint}", timeout=10)
            if response.status_code == 200:
                print(f"✅ {description} 성공")
                success_count += 1
            else:
                print(f"❌ {description} 실패: {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"❌ {description} 연결 실패: {e}")
    
    return success_count == len(endpoints)

def test_cache_system():
    """캐시 시스템 테스트"""
    try:
        response = requests.get("http://localhost:8000/api/cache/status", timeout=10)
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
    print("🚀 Docker 백엔드 테스트 시작...")
    
    # 서버 시작 대기
    print("⏳ 서버 시작 대기 중...")
    for i in range(30):  # 30초 대기
        if test_backend_health():
            break
        time.sleep(1)
        print(f"⏳ 대기 중... ({i+1}/30)")
    else:
        print("❌ 서버 시작 실패")
        sys.exit(1)
    
    print("\n📋 API 엔드포인트 테스트...")
    api_success = test_api_endpoints()
    
    print("\n📋 캐시 시스템 테스트...")
    cache_success = test_cache_system()
    
    print("\n📊 테스트 결과:")
    print(f"API 엔드포인트: {'✅ 성공' if api_success else '❌ 실패'}")
    print(f"캐시 시스템: {'✅ 성공' if cache_success else '❌ 실패'}")
    
    if api_success and cache_success:
        print("\n🎉 모든 테스트 통과!")
        return True
    else:
        print("\n❌ 일부 테스트 실패")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 