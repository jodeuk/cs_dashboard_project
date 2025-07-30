import requests
import json
import time
from datetime import datetime, timedelta
import pandas as pd

API_BASE = "https://cs-dashboard-project.onrender.com/api"

def monitor_realtime_data():
    """실시간 데이터 추가를 모니터링합니다."""
    print("🔍 실시간 데이터 모니터링 시작")
    print("=" * 50)
    
    # 현재 시간 기준으로 날짜 범위 설정
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    
    print(f"📅 모니터링 기간: {start_date} ~ {end_date}")
    print(f"⏰ 시작 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # 초기 데이터 상태 확인
    print("📊 초기 데이터 상태 확인...")
    initial_status = check_data_status(start_date, end_date)
    
    # 실시간 모니터링 (5분 간격으로 10번 체크)
    for i in range(10):
        print(f"\n🔄 {i+1}번째 체크 ({datetime.now().strftime('%H:%M:%S')})")
        
        # 캐시 상태 확인
        cache_status = check_cache_status()
        print(f"   캐시 파일 수: {cache_status.get('cache_files', 0)}")
        print(f"   캐시 크기: {cache_status.get('total_size_mb', 0)} MB")
        
        # 데이터 상태 확인
        current_status = check_data_status(start_date, end_date)
        
        # 변화량 계산
        if initial_status and current_status:
            data_change = current_status.get('total_count', 0) - initial_status.get('total_count', 0)
            if data_change > 0:
                print(f"   🆕 새로운 데이터 추가됨: +{data_change}건")
            elif data_change == 0:
                print(f"   ✅ 데이터 변화 없음")
            else:
                print(f"   ⚠️ 데이터 감소: {data_change}건")
        
        # 최신 데이터 확인 (최근 1시간)
        recent_start = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d")
        recent_data = check_recent_data(recent_start, end_date)
        
        if recent_data:
            print(f"   📈 최근 1시간 데이터: {recent_data.get('count', 0)}건")
        
        # 5분 대기
        if i < 9:  # 마지막 체크에서는 대기하지 않음
            print(f"   ⏳ 5분 후 다시 체크...")
            time.sleep(300)  # 5분 = 300초
    
    print("\n✅ 실시간 모니터링 완료")

def check_cache_status():
    """캐시 상태를 확인합니다."""
    try:
        response = requests.get(f"{API_BASE}/cache/status")
        if response.status_code == 200:
            return response.json()
        else:
            print(f"   ❌ 캐시 상태 확인 실패: {response.status_code}")
            return {}
    except Exception as e:
        print(f"   ❌ 캐시 상태 확인 오류: {e}")
        return {}

def check_data_status(start_date, end_date):
    """데이터 상태를 확인합니다."""
    try:
        # 기간별 문의량으로 데이터 상태 확인
        response = requests.get(f"{API_BASE}/period-counts", params={
            "start": start_date,
            "end": end_date
        })
        
        if response.status_code == 200:
            data = response.json()
            total_count = sum(item.get('문의량', 0) for item in data)
            return {
                'total_count': total_count,
                'periods': len(data),
                'data': data
            }
        else:
            print(f"   ❌ 데이터 상태 확인 실패: {response.status_code}")
            return None
    except Exception as e:
        print(f"   ❌ 데이터 상태 확인 오류: {e}")
        return None

def check_recent_data(start_date, end_date):
    """최근 데이터를 확인합니다."""
    try:
        # 고객유형별 문의량으로 최근 데이터 확인
        response = requests.get(f"{API_BASE}/customer-type-cs", params={
            "start": start_date,
            "end": end_date,
            "top_n": 10
        })
        
        if response.status_code == 200:
            data = response.json()
            total_count = sum(item.get('문의량', 0) for item in data)
            return {
                'count': total_count,
                'data': data
            }
        else:
            return None
    except Exception as e:
        return None

def test_incremental_update():
    """증분 업데이트를 테스트합니다."""
    print("\n🧪 증분 업데이트 테스트")
    print("=" * 30)
    
    # 1. 캐시 삭제
    print("1️⃣ 캐시 삭제...")
    response = requests.delete(f"{API_BASE}/cache/clear")
    if response.status_code == 200:
        print("   ✅ 캐시 삭제 완료")
    else:
        print(f"   ❌ 캐시 삭제 실패: {response.status_code}")
    
    # 2. 첫 번째 데이터 조회 (캐시 생성)
    print("2️⃣ 첫 번째 데이터 조회 (캐시 생성)...")
    start_time = time.time()
    response = requests.get(f"{API_BASE}/period-counts", params={
        "start": "2025-01-01",
        "end": "2025-01-31"
    })
    first_time = time.time() - start_time
    
    if response.status_code == 200:
        print(f"   ✅ 첫 번째 조회 완료 (소요시간: {first_time:.2f}초)")
    else:
        print(f"   ❌ 첫 번째 조회 실패: {response.status_code}")
    
    # 3. 두 번째 데이터 조회 (캐시 사용)
    print("3️⃣ 두 번째 데이터 조회 (캐시 사용)...")
    start_time = time.time()
    response = requests.get(f"{API_BASE}/period-counts", params={
        "start": "2025-01-01",
        "end": "2025-01-31"
    })
    second_time = time.time() - start_time
    
    if response.status_code == 200:
        print(f"   ✅ 두 번째 조회 완료 (소요시간: {second_time:.2f}초)")
        speedup = first_time / second_time if second_time > 0 else 0
        print(f"   🚀 성능 향상: {speedup:.1f}배 빠름")
    else:
        print(f"   ❌ 두 번째 조회 실패: {response.status_code}")
    
    # 4. 새로운 날짜 범위 조회 (증분 업데이트)
    print("4️⃣ 새로운 날짜 범위 조회 (증분 업데이트)...")
    start_time = time.time()
    response = requests.get(f"{API_BASE}/period-counts", params={
        "start": "2025-01-01",
        "end": "2025-02-28"
    })
    incremental_time = time.time() - start_time
    
    if response.status_code == 200:
        print(f"   ✅ 증분 업데이트 완료 (소요시간: {incremental_time:.2f}초)")
    else:
        print(f"   ❌ 증분 업데이트 실패: {response.status_code}")

def main():
    """메인 함수"""
    print("🚀 실시간 데이터 모니터링 시스템")
    print("=" * 50)
    
    # 1. 증분 업데이트 테스트
    test_incremental_update()
    
    # 2. 실시간 모니터링
    monitor_realtime_data()

if __name__ == "__main__":
    main() 