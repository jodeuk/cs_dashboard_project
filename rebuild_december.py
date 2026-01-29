#!/usr/bin/env python3
"""
12월 userchats + CSAT 캐시 재저장 스크립트
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.cs_utils import get_cached_data, build_and_cache_csat_rows
import pandas as pd


async def rebuild_december():
    """12월 userchats + CSAT 캐시 재저장"""
    start = "2025-12-01"
    end = "2025-12-31"

    print("=" * 60)
    print("12월 캐시 재저장 (userchats + CSAT)")
    print("=" * 60)
    print(f"기간: {start} ~ {end}")
    print()

    try:
        # 1) userchats 캐시 재생성
        print("[1/2] userchats 캐시 재생성 중...")
        df = await get_cached_data(start, end, refresh_mode="refresh")
        df["firstAskedAt"] = pd.to_datetime(df["firstAskedAt"], errors="coerce")
        dec = df[(df["firstAskedAt"] >= start) & (df["firstAskedAt"] < "2026-01-01")]
        print(f"      userchats 12월: {len(dec)} rows (총 {len(df)} rows)")
        print()

        # 2) CSAT 캐시 재생성
        print("[2/2] CSAT 캐시 재생성 중...")
        csat_saved = await build_and_cache_csat_rows(start, end)
        print(f"      CSAT 저장: {csat_saved} rows")
        print()

        print("=" * 60)
        print("12월 캐시 재저장 완료")
        print("=" * 60)
        return df
    except Exception as e:
        print()
        print("=" * 60)
        print(f"재저장 실패: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    asyncio.run(rebuild_december())
