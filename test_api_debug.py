import asyncio
import sys
import os

# backend/app 디렉토리를 Python 경로에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'app'))

from cs_utils import channel_api

async def test_api_debug():
    """API 호출을 자세히 디버깅합니다."""
    print("=== API 호출 디버깅 시작 ===")
    
    # 캐시 삭제
    if os.path.exists("backend/app/cache"):
        import shutil
        shutil.rmtree("backend/app/cache")
        print("기존 캐시 삭제 완료")
    
    start_date = "2025-06-01"
    end_date = "2025-07-30"
    
    print(f"API 호출 테스트: {start_date} ~ {end_date}")
    
    try:
        # 직접 API 호출
        raw_data = await channel_api.get_userchats(start_date, end_date)
        print(f"\n=== API 호출 결과 ===")
        print(f"총 데이터 수: {len(raw_data)}")
        
        if len(raw_data) > 0:
            print(f"\n첫 번째 데이터 샘플:")
            print(raw_data[0])
            
            print(f"\n마지막 데이터 샘플:")
            print(raw_data[-1])
            
            # 날짜 분포 확인
            dates = []
            for item in raw_data:
                first_asked_at = item.get("firstAskedAt")
                if first_asked_at:
                    dates.append(first_asked_at)
            
            if dates:
                print(f"\n날짜 분포:")
                print(f"최초 날짜: {min(dates)}")
                print(f"최신 날짜: {max(dates)}")
                print(f"총 날짜 수: {len(set(dates))}")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_api_debug()) 