#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import pandas as pd
import pickle

cache_dir = "/home/elice/cs_dashboard_project/cache"

print("=" * 80)
print("캐시 파일에서 firstAskedAt 없는 데이터 확인")
print("=" * 80)
print()

cache_files = [f for f in os.listdir(cache_dir) if f.startswith("userchats_") and f.endswith(".pkl")]

for cache_file in sorted(cache_files):
    cache_path = os.path.join(cache_dir, cache_file)
    print(f"\n파일: {cache_file}")
    print("-" * 80)
    
    try:
        df = pd.read_pickle(cache_path)
        print(f"총 행 수: {len(df)}")
        
        if 'firstAskedAt' not in df.columns:
            print("⚠️ firstAskedAt 컬럼이 없습니다!")
            continue
        
        if 'createdAt' not in df.columns:
            print("⚠️ createdAt 컬럼이 없습니다!")
            continue
        
        # firstAskedAt이 NaN인 행
        first_na = df['firstAskedAt'].isna()
        first_na_count = first_na.sum()
        print(f"firstAskedAt이 NaN인 행: {first_na_count}개")
        
        # createdAt은 있지만 firstAskedAt이 없는 행
        created_not_na = df['createdAt'].notna()
        both = first_na & created_not_na
        both_count = both.sum()
        print(f"createdAt은 있지만 firstAskedAt이 없는 행: {both_count}개")
        
        if both_count > 0:
            print("\n[샘플 데이터]")
            sample = df[both].head(3)
            for idx, row in sample.iterrows():
                print(f"  userId: {row.get('userId')}, direction: {row.get('direction')}, mediumType: {row.get('mediumType')}")
        
        # phone 데이터 중 firstAskedAt 없지만 createdAt 있는 경우
        if 'mediumType' in df.columns:
            phone_df = df[df['mediumType'] == 'phone']
            if len(phone_df) > 0:
                phone_first_na = phone_df['firstAskedAt'].isna()
                phone_created_not_na = phone_df['createdAt'].notna()
                phone_both = phone_first_na & phone_created_not_na
                phone_both_count = phone_both.sum()
                print(f"\nphone 데이터 중 firstAskedAt 없지만 createdAt 있는 행: {phone_both_count}개")
                
                if phone_both_count > 0:
                    print("\n[phone 샘플 데이터]")
                    phone_sample = phone_df[phone_both].head(3)
                    for idx, row in phone_sample.iterrows():
                        print(f"  userId: {row.get('userId')}, direction: {row.get('direction')}")
                        if row.get('direction') != 'OB':
                            print(f"    ⚠️ direction이 OB가 아닙니다! (현재: {row.get('direction')})")
        
        # direction 분포
        if 'direction' in df.columns:
            print(f"\ndirection 분포:")
            print(df['direction'].value_counts().to_dict())
            
    except Exception as e:
        print(f"오류: {e}")
        import traceback
        traceback.print_exc()
