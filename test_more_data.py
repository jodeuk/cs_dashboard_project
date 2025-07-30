import asyncio
import sys
import os
import pandas as pd

# backend/app 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'app'))

from cs_utils import get_cached_data, server_cache, channel_api

async def test_more_data():
    """더 많은 데이터를 가져오는지 테스트합니다."""
    print("=== 더 많은 데이터 테스트 시작 ===")
    
    # 캐시 삭제
    if os.path.exists(server_cache.cache_dir):
        import shutil
        shutil.rmtree(server_cache.cache_dir)
        print("기존 캐시 삭제 완료")
    
    start_date = "2025-06-01"
    end_date = "2025-07-30"
    
    print(f"데이터 요청: {start_date} ~ {end_date}")
    
    try:
        df = await get_cached_data(start_date, end_date)
        print(f"총 데이터 수: {len(df)}")
        
        if len(df) > 0:
            print("\n데이터 샘플:")
            print(df.head())
            
            # 날짜 범위 확인
            if 'firstAskedAt' in df.columns:
                df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'], errors='coerce', format='mixed')
                min_date = df['firstAskedAt'].min()
                max_date = df['firstAskedAt'].max()
                print(f"\n실제 데이터 날짜 범위: {min_date} ~ {max_date}")
                
                # 요청 범위와 비교
                request_start = pd.to_datetime(start_date)
                request_end = pd.to_datetime(end_date)
                print(f"요청 범위: {request_start} ~ {request_end}")
                
                # 범위 내 데이터 수
                in_range = df[(df['firstAskedAt'] >= request_start) & (df['firstAskedAt'] <= request_end)]
                print(f"요청 범위 내 데이터 수: {len(in_range)}")
                
                # 전체 데이터와 범위 내 데이터 비교
                print(f"전체 데이터: {len(df)}건")
                print(f"범위 내 데이터: {len(in_range)}건")
                print(f"범위 외 데이터: {len(df) - len(in_range)}건")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_more_data()) 