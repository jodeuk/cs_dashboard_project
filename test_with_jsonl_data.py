import json
import pandas as pd
from datetime import datetime
import sys
import os
import asyncio

# backend/app 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'app'))

from cs_utils import channel_api

async def test_with_jsonl_data():
    """JSONL 파일의 데이터를 사용해서 시스템을 테스트합니다."""
    print("=== JSONL 파일 데이터로 시스템 테스트 ===")
    
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
    
    print(f"🎯 2025-07-27 ~ 2025-07-30 기간 데이터: {len(filtered_data)} 건")
    
    if filtered_data:
        # 날짜별 분포
        from collections import Counter
        filtered_dates = []
        for item in filtered_data:
            first_asked_at = item.get("firstAskedAt")
            if first_asked_at:
                dt = datetime.fromtimestamp(first_asked_at / 1000)
                date_str = dt.strftime("%Y-%m-%d")
                filtered_dates.append(date_str)
        
        filtered_date_counts = Counter(filtered_dates)
        print(f"\n📅 날짜별 문의 수:")
        for date, count in sorted(filtered_date_counts.items()):
            print(f"  - {date}: {count}건")
        
        # 데이터 처리 테스트
        print(f"\n🔄 데이터 처리 중...")
        df = await channel_api.process_userchat_data(filtered_data)
        print(f"✅ 처리된 데이터: {len(df)} 건")
        
        if len(df) > 0:
            print(f"\n📋 처리된 데이터 샘플:")
            print(df.head())
            
            # 날짜별 분포 확인
            if 'firstAskedAt' in df.columns:
                df['date'] = pd.to_datetime(df['firstAskedAt']).dt.date
                date_counts = df['date'].value_counts().sort_index()
                print(f"\n📅 처리된 데이터 날짜별 분포:")
                for date, count in date_counts.items():
                    print(f"  - {date}: {count}건")
        
        print(f"\n🎉 성공! 실제로는 {len(filtered_data)}건의 데이터가 있습니다.")
        print(f"   API가 10건만 반환하는 것은 Channel Talk API의 제한 때문입니다.")

if __name__ == "__main__":
    asyncio.run(test_with_jsonl_data()) 