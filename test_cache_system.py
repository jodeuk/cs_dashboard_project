#!/usr/bin/env python3
"""
캐시 시스템 테스트 스크립트
제공해주신 전처리 코드가 적용된 서버 캐시 시스템을 테스트합니다.
"""

import requests
import json
from datetime import datetime, timedelta
import time

# API 기본 URL
API_BASE = "https://cs-dashboard-project.onrender.com/api"

def test_cache_status():
    """캐시 상태 확인 테스트"""
    try:
        response = requests.get(f"{API_BASE}/cache/status")
        print(f"📊 캐시 상태: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print("캐시 상태:")
            print(f"  캐시 활성화: {data.get('cache_enabled', False)}")
            print(f"  캐시 디렉토리: {data.get('cache_dir', 'N/A')}")
            print(f"  캐시 파일 수: {data.get('cache_files', 0)}")
            print(f"  총 크기: {data.get('total_size_mb', 0)} MB")
            
            if data.get('files'):
                print("  캐시 파일 목록:")
                for file in data['files'][:5]:  # 처음 5개만 출력
                    print(f"    - {file['filename']}: {file['size_mb']} MB")
        else:
            print(f"❌ 캐시 상태 조회 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 캐시 상태 테스트 실패: {e}")

def test_data_loading_with_cache():
    """캐시를 사용한 데이터 로딩 테스트"""
    try:
        # 최근 1개월 데이터
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        params = {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d"),
            "date_group": "월간",
            "고객유형": "전체",
            "문의유형": "전체",
            "서비스유형": "전체"
        }
        
        print("🔄 첫 번째 요청 (캐시 생성):")
        start_time = time.time()
        response1 = requests.get(f"{API_BASE}/period-counts", params=params)
        time1 = time.time() - start_time
        
        print(f"  응답 시간: {time1:.2f}초")
        print(f"  상태 코드: {response1.status_code}")
        
        if response1.ok:
            data1 = response1.json()
            print(f"  데이터 개수: {len(data1)}")
        
        print("\n🔄 두 번째 요청 (캐시 사용):")
        start_time = time.time()
        response2 = requests.get(f"{API_BASE}/period-counts", params=params)
        time2 = time.time() - start_time
        
        print(f"  응답 시간: {time2:.2f}초")
        print(f"  상태 코드: {response2.status_code}")
        
        if response2.ok:
            data2 = response2.json()
            print(f"  데이터 개수: {len(data2)}")
        
        if time1 > 0 and time2 > 0:
            speedup = time1 / time2
            print(f"\n⚡ 성능 개선: {speedup:.1f}배 빨라짐")
            
    except Exception as e:
        print(f"❌ 데이터 로딩 테스트 실패: {e}")

def test_cache_refresh():
    """캐시 새로고침 테스트"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        params = {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d")
        }
        
        print("🔄 캐시 새로고침:")
        response = requests.get(f"{API_BASE}/cache/refresh", params=params)
        print(f"  상태 코드: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print(f"  메시지: {data.get('message', 'N/A')}")
            print(f"  데이터 개수: {data.get('data_count', 0)}")
            print(f"  캐시 키: {data.get('cache_key', 'N/A')}")
        else:
            print(f"❌ 캐시 새로고침 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 캐시 새로고침 테스트 실패: {e}")

def test_cache_clear():
    """캐시 삭제 테스트"""
    try:
        print("🗑️ 캐시 삭제:")
        response = requests.delete(f"{API_BASE}/cache/clear")
        print(f"  상태 코드: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print(f"  메시지: {data.get('message', 'N/A')}")
        else:
            print(f"❌ 캐시 삭제 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 캐시 삭제 테스트 실패: {e}")

def test_avg_times_with_cache():
    """캐시를 사용한 평균 시간 테스트 (제공해주신 전처리 코드 적용 확인)"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        params = {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d"),
            "고객유형": "전체",
            "문의유형": "전체",
            "서비스유형": "전체"
        }
        
        print("⏰ 평균 시간 (캐시 사용):")
        response = requests.get(f"{API_BASE}/avg-times", params=params)
        print(f"  상태 코드: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print("  평균 응답 시간 (제공해주신 전처리 코드 방식):")
            for key, value in data.items():
                print(f"    {key}: {value}")
        else:
            print(f"❌ 평균 시간 조회 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 평균 시간 테스트 실패: {e}")

def main():
    """메인 테스트 함수"""
    print("🚀 캐시 시스템 테스트 시작")
    print("=" * 50)
    
    # 1. API 상태 확인
    try:
        response = requests.get(f"{API_BASE.replace('/api', '')}")
        if not response.ok:
            print("❌ API가 연결되지 않아 테스트를 중단합니다.")
            return
    except Exception as e:
        print(f"❌ API 연결 실패: {e}")
        return
    
    print("✅ API 연결 확인됨")
    print("\n" + "=" * 50)
    
    # 2. 초기 캐시 상태 확인
    test_cache_status()
    
    print("\n" + "=" * 50)
    
    # 3. 데이터 로딩 테스트 (캐시 성능 비교)
    test_data_loading_with_cache()
    
    print("\n" + "=" * 50)
    
    # 4. 평균 시간 테스트 (제공해주신 전처리 코드 적용 확인)
    test_avg_times_with_cache()
    
    print("\n" + "=" * 50)
    
    # 5. 캐시 새로고침 테스트
    test_cache_refresh()
    
    print("\n" + "=" * 50)
    
    # 6. 캐시 삭제 테스트
    test_cache_clear()
    
    print("\n" + "=" * 50)
    
    # 7. 최종 캐시 상태 확인
    test_cache_status()
    
    print("\n" + "=" * 50)
    print("✅ 모든 캐시 시스템 테스트 완료!")

if __name__ == "__main__":
    main() 