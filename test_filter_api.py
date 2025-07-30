#!/usr/bin/env python3
"""
필터링 API 테스트 스크립트
제공해주신 전처리 코드가 적용된 백엔드 API를 테스트합니다.
"""

import requests
import json
from datetime import datetime, timedelta

# API 기본 URL
API_BASE = "https://cs-dashboard-project.onrender.com/api"

def test_api_health():
    """API 상태 확인"""
    try:
        response = requests.get(f"{API_BASE.replace('/api', '')}")
        print(f"✅ API 상태: {response.status_code}")
        return response.ok
    except Exception as e:
        print(f"❌ API 연결 실패: {e}")
        return False

def test_filter_options():
    """필터 옵션 조회 테스트"""
    try:
        # 최근 1개월 데이터
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        params = {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d")
        }
        
        response = requests.get(f"{API_BASE}/filter-options", params=params)
        print(f"📊 필터 옵션 조회: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print("필터 옵션:")
            for key, options in data.items():
                print(f"  {key}: {len(options)}개 옵션")
        else:
            print(f"❌ 필터 옵션 조회 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 필터 옵션 테스트 실패: {e}")

def test_period_counts():
    """기간별 문의량 테스트"""
    try:
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
        
        response = requests.get(f"{API_BASE}/period-counts", params=params)
        print(f"📈 기간별 문의량: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print(f"문의량 데이터: {len(data)}개 기간")
            for item in data[:5]:  # 처음 5개만 출력
                print(f"  {item}")
        else:
            print(f"❌ 기간별 문의량 조회 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 기간별 문의량 테스트 실패: {e}")

def test_avg_times():
    """평균 시간 테스트 (제공해주신 전처리 코드 적용 확인)"""
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
        
        response = requests.get(f"{API_BASE}/avg-times", params=params)
        print(f"⏰ 평균 시간: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print("평균 응답 시간 (제공해주신 전처리 코드 방식):")
            for key, value in data.items():
                print(f"  {key}: {value}")
        else:
            print(f"❌ 평균 시간 조회 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 평균 시간 테스트 실패: {e}")

def test_customer_type_cs():
    """고객유형별 CS 문의량 테스트"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        params = {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d"),
            "top_n": 5
        }
        
        response = requests.get(f"{API_BASE}/customer-type-cs", params=params)
        print(f"👥 고객유형별 문의량: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print("고객유형별 문의량:")
            for item in data:
                print(f"  {item['고객유형']}: {item['문의량']}건")
        else:
            print(f"❌ 고객유형별 문의량 조회 실패: {response.text}")
            
    except Exception as e:
        print(f"❌ 고객유형별 문의량 테스트 실패: {e}")

def main():
    """메인 테스트 함수"""
    print("🚀 필터링 API 테스트 시작")
    print("=" * 50)
    
    # 1. API 상태 확인
    if not test_api_health():
        print("❌ API가 연결되지 않아 테스트를 중단합니다.")
        return
    
    print("\n" + "=" * 50)
    
    # 2. 필터 옵션 테스트
    test_filter_options()
    
    print("\n" + "=" * 50)
    
    # 3. 기간별 문의량 테스트
    test_period_counts()
    
    print("\n" + "=" * 50)
    
    # 4. 평균 시간 테스트 (제공해주신 전처리 코드 적용 확인)
    test_avg_times()
    
    print("\n" + "=" * 50)
    
    # 5. 고객유형별 문의량 테스트
    test_customer_type_cs()
    
    print("\n" + "=" * 50)
    print("✅ 모든 테스트 완료!")

if __name__ == "__main__":
    main() 