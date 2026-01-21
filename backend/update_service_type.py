#!/usr/bin/env python3
"""
사용유형이 'ECI'인 고객들의 서비스유형을 'ECI'로 일괄 업데이트하는 스크립트
"""
import sys
import os
import json
import requests

# 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 파일 저장 경로 설정: main.py와 동일한 로직
if not os.environ.get("CLOUD_CUSTOMERS_FILE") and not os.environ.get("JSON_DB_FILE"):
    # 실제 서버 환경 경로 우선 확인
    server_paths = [
        "/data/cloud_customers/cloud_customers.json",
        "/data/cache/cloud_customers.json",
    ]
    
    found_path = None
    for path in server_paths:
        if os.path.exists(path):
            found_path = path
            break
    
    if found_path:
        os.environ.setdefault("CLOUD_CUSTOMERS_FILE", found_path)
    else:
        # 기존 파일이 있는지 확인 (backend/app/cloud_customers.json 우선)
        script_dir = os.path.dirname(os.path.abspath(__file__))
        legacy_path = os.path.join(script_dir, "app", "cloud_customers.json")
        if os.path.exists(legacy_path):
            os.environ.setdefault("JSON_DB_FILE", legacy_path)
        else:
            os.environ.setdefault("JSON_DB_FILE", "/tmp/cloud_customers.json")

from app.db.json_db import load_json_db, save_json_db, file_lock, DEFAULT_DB_PATH

def update_service_type():
    """사용유형이 'ECI'인 고객들의 서비스유형을 'ECI'로 일괄 업데이트"""
    print(f"환경변수 CLOUD_CUSTOMERS_FILE: {os.environ.get('CLOUD_CUSTOMERS_FILE')}")
    print(f"환경변수 JSON_DB_FILE: {os.environ.get('JSON_DB_FILE')}")
    print(f"데이터베이스 파일 경로: {DEFAULT_DB_PATH}")
    print(f"파일 존재 여부: {os.path.exists(DEFAULT_DB_PATH)}")
    
    # 가능한 다른 경로들 확인
    possible_paths = [
        "/data/cloud_customers/cloud_customers.json",
        "/data/cache/cloud_customers.json",
        "/tmp/cloud_customers.json",
        os.path.join(os.path.dirname(__file__), "app", "cloud_customers.json"),
    ]
    
    print("\n가능한 다른 경로 확인:")
    data_found = False
    actual_data_path = None
    for path in possible_paths:
        if os.path.exists(path):
            print(f"  ✓ {path} (존재함)")
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict) and "customers" in data:
                        count = len(data["customers"])
                    elif isinstance(data, list):
                        count = len(data)
                    else:
                        count = 0
                    print(f"    - 고객 수: {count}건")
                    if count > 0:
                        data_found = True
                        actual_data_path = path
            except Exception as e:
                print(f"    - 읽기 오류: {e}")
        else:
            print(f"  ✗ {path} (존재하지 않음)")
    
    # API를 통해 데이터 확인 시도
    api_data = None
    if not data_found:
        print("\nAPI를 통해 데이터 확인 시도...")
        try:
            api_url = os.environ.get("API_BASE_URL", "http://localhost:8081")
            response = requests.get(f"{api_url}/api/cloud-customers", timeout=5)
            if response.status_code == 200:
                api_data = response.json()
                if isinstance(api_data, list) and len(api_data) > 0:
                    print(f"  ✓ API에서 {len(api_data)}건의 고객 데이터를 확인했습니다.")
                    rows = api_data
                    data_found = True
                    print("  API를 통해 데이터를 업데이트합니다.")
        except Exception as e:
            print(f"  API 확인 실패: {e}")
    
    # API 데이터를 사용하는 경우
    if api_data and isinstance(api_data, list):
        print(f"\n총 {len(api_data)}건의 고객 데이터를 확인합니다.")
        
        # 사용유형별 통계 출력
        usage_type_stats = {}
        for row in api_data:
            if isinstance(row, dict):
                usage_type = row.get("사용유형", "없음")
                usage_type_stats[usage_type] = usage_type_stats.get(usage_type, 0) + 1
        
        print("사용유형별 통계:")
        for usage_type, count in usage_type_stats.items():
            print(f"  - {usage_type}: {count}건")
        
        updated_count = 0
        updated_customers = []
        
        for row in api_data:
            if not isinstance(row, dict):
                continue
                
            사용유형 = row.get("사용유형", "")
            if 사용유형 == "ECI":
                if row.get("서비스유형") != "ECI":
                    row["서비스유형"] = "ECI"
                    updated_count += 1
                    updated_customers.append(row)
                    print(f"고객 ID {row.get('id')} ({row.get('이름', '알 수 없음')}) 업데이트: 서비스유형 -> ECI")
        
        if updated_count > 0:
            # API를 통해 각 고객 업데이트
            print(f"\n{updated_count}건의 고객을 API를 통해 업데이트합니다...")
            api_url = os.environ.get("API_BASE_URL", "http://localhost:8081")
            success_count = 0
            fail_count = 0
            
            for customer in updated_customers:
                try:
                    response = requests.put(
                        f"{api_url}/api/cloud-customers/{customer.get('id')}",
                        json=customer,
                        timeout=5
                    )
                    if response.status_code == 200:
                        success_count += 1
                    else:
                        print(f"  고객 ID {customer.get('id')} 업데이트 실패: {response.status_code}")
                        fail_count += 1
                except Exception as e:
                    print(f"  고객 ID {customer.get('id')} 업데이트 오류: {e}")
                    fail_count += 1
            
            print(f"\n총 {updated_count}건 중 성공 {success_count}건, 실패 {fail_count}건 업데이트되었습니다.")
            return success_count
        else:
            print("업데이트할 고객이 없습니다. (이미 업데이트되었거나 조건에 맞는 고객이 없습니다)")
            return 0
    
    if not os.path.exists(DEFAULT_DB_PATH):
        print(f"\n경고: 데이터베이스 파일이 존재하지 않습니다: {DEFAULT_DB_PATH}")
        if actual_data_path:
            print(f"실제 데이터가 있는 경로를 사용하세요: CLOUD_CUSTOMERS_FILE={actual_data_path} python3 update_service_type.py")
        else:
            print("실제 데이터 파일 경로를 확인하거나 환경변수를 설정해주세요.")
        return 0
    
    with file_lock(DEFAULT_DB_PATH):
        rows = load_json_db()
    
    if not os.path.exists(DEFAULT_DB_PATH):
        print(f"\n경고: 데이터베이스 파일이 존재하지 않습니다: {DEFAULT_DB_PATH}")
        if actual_data_path:
            print(f"실제 데이터가 있는 경로를 사용하세요: CLOUD_CUSTOMERS_FILE={actual_data_path} python3 update_service_type.py")
        else:
            print("실제 데이터 파일 경로를 확인하거나 환경변수를 설정해주세요.")
        return 0
    
    with file_lock(DEFAULT_DB_PATH):
        rows = load_json_db()
        
        # 데이터 구조 확인 및 처리
        if isinstance(rows, dict):
            # {"customers": [...]} 형태인 경우
            if "customers" in rows:
                rows = rows["customers"]
            else:
                print(f"데이터 구조 확인: {list(rows.keys())}")
                return 0
        
        print(f"\n총 {len(rows)}건의 고객 데이터를 확인합니다.")
        
        # 사용유형별 통계 출력
        usage_type_stats = {}
        for row in rows:
            if isinstance(row, dict):
                usage_type = row.get("사용유형", "없음")
                usage_type_stats[usage_type] = usage_type_stats.get(usage_type, 0) + 1
        
        print("사용유형별 통계:")
        for usage_type, count in usage_type_stats.items():
            print(f"  - {usage_type}: {count}건")
        
        updated_count = 0
        
        for row in rows:
            if not isinstance(row, dict):
                continue
                
            사용유형 = row.get("사용유형", "")
            if 사용유형 == "ECI":
                if row.get("서비스유형") != "ECI":
                    row["서비스유형"] = "ECI"
                    updated_count += 1
                    print(f"고객 ID {row.get('id')} ({row.get('이름', '알 수 없음')}) 업데이트: 서비스유형 -> ECI")
        
        if updated_count > 0:
            # 원래 데이터 구조 유지
            if os.path.exists(DEFAULT_DB_PATH):
                with open(DEFAULT_DB_PATH, 'r', encoding='utf-8') as f:
                    original_data = json.load(f)
                if isinstance(original_data, dict) and "customers" in original_data:
                    original_data["customers"] = rows
                    with open(DEFAULT_DB_PATH, 'w', encoding='utf-8') as f:
                        json.dump(original_data, f, ensure_ascii=False, indent=2)
                else:
                    save_json_db(rows)
            else:
                save_json_db(rows)
            
            print(f"\n총 {updated_count}건의 고객 서비스유형이 'ECI'로 업데이트되었습니다.")
        else:
            print("업데이트할 고객이 없습니다. (이미 업데이트되었거나 조건에 맞는 고객이 없습니다)")
        
        return updated_count

if __name__ == "__main__":
    try:
        update_service_type()
    except Exception as e:
        print(f"오류 발생: {e}")
        sys.exit(1)
