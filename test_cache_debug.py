import asyncio
import sys
import os

# backend/app 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'app'))

from cs_utils import get_cached_data, server_cache, channel_api

async def test_cache_system():
    """캐시 시스템을 테스트합니다."""
    print("=== 캐시 시스템 테스트 시작 ===")
    
    # 1. 캐시 디렉토리 확인
    print(f"캐시 디렉토리: {server_cache.cache_dir}")
    print(f"캐시 디렉토리 존재: {os.path.exists(server_cache.cache_dir)}")
    
    if os.path.exists(server_cache.cache_dir):
        cache_files = [f for f in os.listdir(server_cache.cache_dir) if f.endswith('_metadata.json')]
        print(f"기존 캐시 파일 수: {len(cache_files)}")
        for file in cache_files:
            print(f"  - {file}")
    
    # 2. 첫 번째 데이터 요청 테스트 (API 호출)
    start_date = "2025-06-29"
    end_date = "2025-07-30"
    
    print(f"\n=== 첫 번째 요청 (API 호출) ===")
    print(f"데이터 요청: {start_date} ~ {end_date}")
    
    try:
        df1 = await get_cached_data(start_date, end_date)
        print(f"반환된 데이터 수: {len(df1)}")
        
        if len(df1) > 0:
            print("데이터 샘플:")
            print(df1.head())
            
            # 캐시 파일 확인
            cache_files = [f for f in os.listdir(server_cache.cache_dir) if f.endswith('_metadata.json')]
            print(f"\n캐시 생성 후 파일 수: {len(cache_files)}")
            for file in cache_files:
                print(f"  - {file}")
                
                # 메타데이터 확인
                metadata_path = os.path.join(server_cache.cache_dir, file)
                import json
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                print(f"    데이터 수: {metadata.get('data_count', 'N/A')}")
                print(f"    시작일: {metadata.get('start_date', 'N/A')}")
                print(f"    종료일: {metadata.get('end_date', 'N/A')}")
                print(f"    업데이트: {metadata.get('updated_at', 'N/A')}")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()
    
    # 3. 두 번째 데이터 요청 테스트 (캐시 사용)
    print(f"\n=== 두 번째 요청 (캐시 사용) ===")
    print(f"데이터 요청: {start_date} ~ {end_date}")
    
    try:
        df2 = await get_cached_data(start_date, end_date)
        print(f"반환된 데이터 수: {len(df2)}")
        
        if len(df2) > 0:
            print("데이터 샘플:")
            print(df2.head())
            
            # 데이터가 동일한지 확인
            if len(df1) == len(df2):
                print("✅ 캐시에서 동일한 데이터를 가져왔습니다!")
            else:
                print("❌ 캐시 데이터가 다릅니다!")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_cache_system()) 