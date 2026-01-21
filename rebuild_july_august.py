#!/usr/bin/env python3
"""
7월, 8월 userchats 캐시만 재생성하는 스크립트
"""
import asyncio
import sys
import os

# 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.cs_utils import get_cached_data
import pandas as pd

async def rebuild_july_august():
    """7월, 8월 캐시만 재생성"""
    print("=" * 60)
    print("7월, 8월 userchats 캐시 재생성 시작")
    print("=" * 60)
    
    # 7월 1일부터 8월 31일까지
    start = "2025-07-01"
    end = "2025-08-31"
    
    print(f"기간: {start} ~ {end}")
    print(f"refresh_mode='refresh'로 재생성합니다...")
    print()
    
    try:
        df = await get_cached_data(start, end, refresh_mode="refresh")
        
        # 재생성 후 검증
        print("\n재생성 결과 검증 중...")
        df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'], errors='coerce')
        july = df[(df['firstAskedAt'] >= '2025-07-01') & (df['firstAskedAt'] < '2025-08-01')]
        august = df[(df['firstAskedAt'] >= '2025-08-01') & (df['firstAskedAt'] < '2025-09-01')]
        
        print()
        print("=" * 60)
        print(f"✅ 재생성 완료!")
        print(f"총 {len(df)} rows")
        print(f"7월 데이터: {len(july)}개")
        print(f"8월 데이터: {len(august)}개")
        print("=" * 60)
        return df
    except Exception as e:
        print()
        print("=" * 60)
        print(f"❌ 재생성 실패: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    asyncio.run(rebuild_july_august())

