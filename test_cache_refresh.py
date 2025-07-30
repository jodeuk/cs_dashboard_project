import asyncio
import sys
import os
import shutil

# backend/app 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'app'))

from cs_utils import get_cached_data, server_cache, channel_api

async def test_cache_refresh():
    """캐시 새로고침을 테스트합니다."""
    print("=== 캐시 새로고침 테스트 시작 ===")
    
    start_date = "2025-06-29"
    end_date = "2025-07-30"
    
    # 1. 기존 캐시 확인
    print("1. 기존 캐시 확인")
    if os.path.exists(server_cache.cache_dir):
        cache_files = [f for f in os.listdir(server_cache.cache_dir) if f.endswith('_metadata.json')]
        print(f"기존 캐시 파일 수: {len(cache_files)}")
    
    # 2. 첫 번째 요청 (캐시 사용)
    print("\n2. 첫 번째 요청 (캐시 사용)")
    df1 = await get_cached_data(start_date, end_date)
    print(f"캐시에서 로드된 데이터: {len(df1)} 건")
    
    # 3. 캐시 삭제 (새로고침 시뮬레이션)
    print("\n3. 캐시 삭제 (새로고침)")
    if os.path.exists(server_cache.cache_dir):
        shutil.rmtree(server_cache.cache_dir)
        print("캐시 디렉토리 삭제 완료")
    
    # 4. 두 번째 요청 (API 재호출)
    print("\n4. 두 번째 요청 (API 재호출)")
    df2 = await get_cached_data(start_date, end_date)
    print(f"API에서 새로 로드된 데이터: {len(df2)} 건")
    
    # 5. 결과 비교
    print("\n5. 결과 비교")
    if len(df1) == len(df2):
        print(f"✅ 데이터 수 동일: {len(df1)} 건")
    else:
        print(f"❌ 데이터 수 다름: 캐시 {len(df1)}건 vs API {len(df2)}건")
    
    # 6. 새로운 캐시 확인
    print("\n6. 새로운 캐시 확인")
    if os.path.exists(server_cache.cache_dir):
        cache_files = [f for f in os.listdir(server_cache.cache_dir) if f.endswith('_metadata.json')]
        print(f"새로운 캐시 파일 수: {len(cache_files)}")
        for file in cache_files:
            print(f"  - {file}")
            
            # 메타데이터 확인
            metadata_path = os.path.join(server_cache.cache_dir, file)
            import json
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            print(f"    데이터 수: {metadata.get('data_count', 'N/A')}")
            print(f"    업데이트: {metadata.get('updated_at', 'N/A')}")

if __name__ == "__main__":
    asyncio.run(test_cache_refresh()) 