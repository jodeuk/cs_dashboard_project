import asyncio
import sys
import os
import shutil
import pandas as pd

# backend/app 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'app'))

from cs_utils import channel_api, server_cache

async def test_full_data():
    """캐시를 완전히 삭제하고 모든 데이터를 새로 가져옵니다."""
    print("=== 전체 데이터 새로 가져오기 테스트 ===")
    
    # 캐시 완전 삭제
    cache_dir = "backend/app/cache"
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir)
        print("✅ 기존 캐시 완전 삭제 완료")
    
    # 더 넓은 기간으로 테스트
    start_date = "2024-01-01"  # 2024년부터
    end_date = "2025-12-31"    # 2025년까지
    
    print(f"📅 테스트 기간: {start_date} ~ {end_date}")
    
    try:
        # 직접 API 호출
        print("\n🔍 API에서 데이터 가져오는 중...")
        raw_data = await channel_api.get_userchats(start_date, end_date)
        print(f"📊 API에서 가져온 원시 데이터: {len(raw_data)} 건")
        
        if len(raw_data) > 0:
            print(f"\n📅 첫 번째 데이터:")
            print(f"  - ID: {raw_data[0].get('id')}")
            print(f"  - firstAskedAt: {raw_data[0].get('firstAskedAt')}")
            print(f"  - createdAt: {raw_data[0].get('createdAt')}")
            
            print(f"\n📅 마지막 데이터:")
            print(f"  - ID: {raw_data[-1].get('id')}")
            print(f"  - firstAskedAt: {raw_data[-1].get('firstAskedAt')}")
            print(f"  - createdAt: {raw_data[-1].get('createdAt')}")
            
            # 날짜 분포 확인
            dates = []
            for item in raw_data:
                first_asked_at = item.get("firstAskedAt")
                if first_asked_at:
                    dates.append(first_asked_at)
            
            if dates:
                print(f"\n📈 날짜 분포:")
                print(f"  - 최초 날짜: {min(dates)}")
                print(f"  - 최신 날짜: {max(dates)}")
                print(f"  - 총 날짜 수: {len(set(dates))}")
        
        # 데이터 처리
        print(f"\n🔄 데이터 처리 중...")
        df = await channel_api.process_userchat_data(raw_data)
        print(f"✅ 처리된 데이터: {len(df)} 건")
        
        if len(df) > 0:
            print(f"\n📋 처리된 데이터 샘플:")
            print(df.head())
            
            # 날짜별 분포 확인
            if 'firstAskedAt' in df.columns:
                df['date'] = pd.to_datetime(df['firstAskedAt']).dt.date
                date_counts = df['date'].value_counts().sort_index()
                print(f"\n📅 날짜별 문의 수:")
                for date, count in date_counts.head(10).items():
                    print(f"  - {date}: {count}건")
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_full_data()) 