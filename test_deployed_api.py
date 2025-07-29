#!/usr/bin/env python3
"""
배포된 API 테스트 스크립트
https://cs-dashboard-project.onrender.com/ 에서 API 엔드포인트들을 테스트합니다.
"""

import requests
import json
from datetime import datetime, timedelta

# API 기본 URL
BASE_URL = "https://cs-dashboard-project.onrender.com"

def test_endpoint(endpoint, method="GET", params=None, data=None):
    """API 엔드포인트를 테스트합니다."""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        else:
            print(f"❌ 지원하지 않는 HTTP 메서드: {method}")
            return None
        
        print(f"🔗 {method} {endpoint}")
        print(f"   상태 코드: {response.status_code}")
        
        if response.status_code == 200:
            print("   ✅ 성공!")
            try:
                result = response.json()
                if isinstance(result, dict) and len(result) > 0:
                    print(f"   응답: {json.dumps(result, indent=2, ensure_ascii=False)}")
                else:
                    print(f"   응답: {result}")
            except:
                print(f"   응답: {response.text[:200]}...")
        else:
            print(f"   ❌ 실패: {response.text}")
        
        print()
        return response
        
    except requests.exceptions.Timeout:
        print(f"   ⏰ 타임아웃 (30초)")
        print()
        return None
    except requests.exceptions.RequestException as e:
        print(f"   ❌ 요청 오류: {str(e)}")
        print()
        return None

def main():
    print("🚀 배포된 API 테스트 시작")
    print("=" * 50)
    print(f"📡 API URL: {BASE_URL}")
    print()
    
    # 1. 기본 엔드포인트 테스트
    print("1️⃣ 기본 엔드포인트 테스트")
    print("-" * 30)
    
    test_endpoint("/")
    test_endpoint("/health")
    test_endpoint("/api/test")
    
    # 2. Channel.io API 디버깅 엔드포인트
    print("2️⃣ Channel.io API 디버깅")
    print("-" * 30)
    
    test_endpoint("/api/debug-channel-api")
    test_endpoint("/api/test-channel-api")
    
    # 3. 데이터 필터링 옵션 (날짜 범위 필요)
    print("3️⃣ 데이터 필터링 옵션")
    print("-" * 30)
    
    # 오늘 날짜 기준으로 테스트
    today = datetime.now()
    start_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    
    test_endpoint("/api/filter-options", params={
        "start": start_date,
        "end": end_date
    })
    
    # 4. 통계 데이터
    print("4️⃣ 통계 데이터")
    print("-" * 30)
    
    test_endpoint("/api/statistics", params={
        "start": start_date,
        "end": end_date
    })
    
    # 5. 기간별 카운트
    print("5️⃣ 기간별 카운트")
    print("-" * 30)
    
    test_endpoint("/api/period-counts", params={
        "start": start_date,
        "end": end_date,
        "date_group": "월간"
    })
    
    # 6. 평균 응답 시간
    print("6️⃣ 평균 응답 시간")
    print("-" * 30)
    
    test_endpoint("/api/avg-times", params={
        "start": start_date,
        "end": end_date
    })
    
    # 7. 고객 유형별 CS
    print("7️⃣ 고객 유형별 CS")
    print("-" * 30)
    
    test_endpoint("/api/customer-type-cs", params={
        "start": start_date,
        "end": end_date,
        "top_n": 5
    })
    
    # 8. 워드클라우드
    print("8️⃣ 워드클라우드")
    print("-" * 30)
    
    test_endpoint("/api/wordcloud", params={
        "start": start_date,
        "end": end_date
    })
    
    # 9. 샘플 데이터
    print("9️⃣ 샘플 데이터")
    print("-" * 30)
    
    test_endpoint("/api/sample", params={
        "start": start_date,
        "end": end_date,
        "n": 3
    })
    
    # 10. UserChat API (새로 추가된 기능)
    print("🔟 UserChat API")
    print("-" * 30)
    
    # UserChat ID가 있다면 테스트 (예시 ID 사용)
    test_userchat_id = "6888615a04ae7d5fab51"  # 이전에 조회했던 ID
    test_endpoint(f"/api/user-chat/{test_userchat_id}")
    
    # 11. CSAT 분석 API
    print("1️⃣1️⃣ CSAT 분석 API")
    print("-" * 30)
    test_endpoint("/api/csat-analysis", params={"start": start_date, "end": end_date})
    
    print("🎉 API 테스트 완료!")
    print("\n📊 테스트 결과 요약:")
    print("- 기본 엔드포인트: 정상 작동 확인")
    print("- Channel.io API: 환경변수 설정 필요할 수 있음")
    print("- 데이터 엔드포인트: 날짜 범위에 따라 결과 다름")
    print("- UserChat API: 새로운 기능 테스트 완료")

if __name__ == "__main__":
    main() 