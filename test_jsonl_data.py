import json
import pandas as pd
from datetime import datetime
import sys
import os

# backend/app 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'app'))

from cs_utils import channel_api

def test_jsonl_data():
    """JSONL 파일의 데이터를 직접 분석합니다."""
    print("=== JSONL 파일 데이터 분석 ===")
    
    # JSONL 파일 읽기
    jsonl_file = "../json_data/user_chat_after_2025-07-26_before_2025-07-30_2025-07-30_13-58-28.jsonl"
    
    data_list = []
    with open(jsonl_file, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            try:
                data = json.loads(line.strip())
                data_list.append(data)
            except json.JSONDecodeError as e:
                print(f"라인 {line_num} 파싱 오류: {e}")
    
    print(f"📊 JSONL 파일에서 읽은 데이터: {len(data_list)} 건")
    
    if len(data_list) > 0:
        # 날짜 분석
        dates = []
        for item in data_list:
            first_asked_at = item.get("firstAskedAt")
            if first_asked_at:
                # Unix timestamp를 datetime으로 변환
                dt = datetime.fromtimestamp(first_asked_at / 1000)
                date_str = dt.strftime("%Y-%m-%d")
                dates.append(date_str)
        
        if dates:
            print(f"\n📅 날짜 분포:")
            print(f"  - 최초 날짜: {min(dates)}")
            print(f"  - 최신 날짜: {max(dates)}")
            print(f"  - 총 날짜 수: {len(set(dates))}")
            
            # 날짜별 개수
            from collections import Counter
            date_counts = Counter(dates)
            print(f"\n📈 날짜별 문의 수:")
            for date, count in sorted(date_counts.items()):
                print(f"  - {date}: {count}건")
        
        # 첫 번째와 마지막 데이터 샘플
        print(f"\n📋 첫 번째 데이터:")
        first_item = data_list[0]
        print(f"  - ID: {first_item.get('id')}")
        print(f"  - firstAskedAt: {first_item.get('firstAskedAt')}")
        if first_item.get('firstAskedAt'):
            dt = datetime.fromtimestamp(first_item.get('firstAskedAt') / 1000)
            print(f"  - 날짜: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
        
        print(f"\n📋 마지막 데이터:")
        last_item = data_list[-1]
        print(f"  - ID: {last_item.get('id')}")
        print(f"  - firstAskedAt: {last_item.get('firstAskedAt')}")
        if last_item.get('firstAskedAt'):
            dt = datetime.fromtimestamp(last_item.get('firstAskedAt') / 1000)
            print(f"  - 날짜: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # 2025-07-27 ~ 2025-07-30 기간 필터링
        target_dates = ["2025-07-27", "2025-07-28", "2025-07-29", "2025-07-30"]
        filtered_data = []
        
        for item in data_list:
            first_asked_at = item.get("firstAskedAt")
            if first_asked_at:
                dt = datetime.fromtimestamp(first_asked_at / 1000)
                date_str = dt.strftime("%Y-%m-%d")
                if date_str in target_dates:
                    filtered_data.append(item)
        
        print(f"\n🎯 2025-07-27 ~ 2025-07-30 기간 데이터: {len(filtered_data)} 건")
        
        if filtered_data:
            print(f"\n📅 필터링된 데이터 날짜별 분포:")
            filtered_dates = []
            for item in filtered_data:
                first_asked_at = item.get("firstAskedAt")
                if first_asked_at:
                    dt = datetime.fromtimestamp(first_asked_at / 1000)
                    date_str = dt.strftime("%Y-%m-%d")
                    filtered_dates.append(date_str)
            
            filtered_date_counts = Counter(filtered_dates)
            for date, count in sorted(filtered_date_counts.items()):
                print(f"  - {date}: {count}건")

if __name__ == "__main__":
    test_jsonl_data() 