#!/usr/bin/env python3
"""
API 테스트 스크립트
"""

import requests
import json
import sys
from datetime import datetime, timedelta

def test_api_endpoints():
    """API 엔드포인트 테스트"""
    base_url = "http://localhost:8000"
    
    # 테스트할 엔드포인트들
    endpoints = [
        ("/", "루트 엔드포인트"),
        ("/health", "헬스체크"),
        ("/api/test", "API 테스트"),
    ]
    
    print("🧪 API 엔드포인트 테스트 시작...")
    
    for endpoint, description in endpoints:
        try:
            response = requests.get(f"{base_url}{endpoint}", timeout=10)
            if response.status_code == 200:
                print(f"✅ {description}: 성공")
                if endpoint == "/":
                    data = response.json()
                    print(f"   응답: {data}")
            else:
                print(f"❌ {description}: 실패 (상태 코드: {response.status_code})")
        except requests.exceptions.RequestException as e:
            print(f"❌ {description}: 연결 실패 - {e}")

def test_data_endpoints():
    """데이터 관련 엔드포인트 테스트"""
    base_url = "http://localhost:8000"
    
    # 테스트 날짜 범위
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    print(f"\n📊 데이터 엔드포인트 테스트 ({start_date} ~ {end_date})...")
    
    # 필터 옵션 테스트
    try:
        response = requests.get(
            f"{base_url}/api/filter-options",
            params={"start": start_date, "end": end_date},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 필터 옵션: 성공")
            print(f"   고객유형: {data.get('고객유형', [])}")
            print(f"   문의유형: {data.get('문의유형', [])}")
            print(f"   서비스유형: {data.get('서비스유형', [])}")
        else:
            print(f"❌ 필터 옵션: 실패 (상태 코드: {response.status_code})")
    except requests.exceptions.RequestException as e:
        print(f"❌ 필터 옵션: 연결 실패 - {e}")
    
    # 통계 테스트
    try:
        response = requests.get(
            f"{base_url}/api/statistics",
            params={"start": start_date, "end": end_date},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 통계: 성공")
            print(f"   총 문의수: {data.get('total_inquiries', 0)}")
        else:
            print(f"❌ 통계: 실패 (상태 코드: {response.status_code})")
    except requests.exceptions.RequestException as e:
        print(f"❌ 통계: 연결 실패 - {e}")

def test_cache_endpoints():
    """캐시 관련 엔드포인트 테스트"""
    base_url = "http://localhost:8000"
    
    print(f"\n💾 캐시 엔드포인트 테스트...")
    
    # 캐시 상태 확인
    try:
        response = requests.get(f"{base_url}/api/cache/status", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 캐시 상태: 성공")
            print(f"   캐시 활성화: {data.get('cache_enabled', False)}")
            print(f"   캐시 파일 수: {data.get('cache_files', 0)}")
            print(f"   총 크기: {data.get('total_size_mb', 0)} MB")
        else:
            print(f"❌ 캐시 상태: 실패 (상태 코드: {response.status_code})")
    except requests.exceptions.RequestException as e:
        print(f"❌ 캐시 상태: 연결 실패 - {e}")

def main():
    """메인 테스트 함수"""
    print("🚀 CS Dashboard API 테스트 시작...")
    
    # 기본 API 테스트
    test_api_endpoints()
    
    # 데이터 엔드포인트 테스트
    test_data_endpoints()
    
    # 캐시 엔드포인트 테스트
    test_cache_endpoints()
    
    print("\n🎉 API 테스트 완료!")

if __name__ == "__main__":
    main() 