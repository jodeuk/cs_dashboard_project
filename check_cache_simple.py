#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

try:
    import pandas as pd
    import pickle
    import json
    
    cache_dir = "/home/elice/cs_dashboard_project/cache"
    cache_file = os.path.join(cache_dir, "userchats_2025-09.pkl")
    
    if not os.path.exists(cache_file):
        print(f"캐시 파일이 없습니다: {cache_file}")
        sys.exit(1)
    
    print(f"캐시 파일 로드: {cache_file}")
    df = pd.read_pickle(cache_file)
    print(f"총 행 수: {len(df)}")
    
    # firstAskedAt이 NaN인 행
    if 'firstAskedAt' in df.columns:
        first_na = df['firstAskedAt'].isna()
        first_na_count = first_na.sum()
        print(f"\nfirstAskedAt이 NaN인 행: {first_na_count}개")
        
        # createdAt은 있지만 firstAskedAt이 없는 행
        if 'createdAt' in df.columns:
            created_not_na = df['createdAt'].notna()
            both = first_na & created_not_na
            both_count = both.sum()
            print(f"createdAt은 있지만 firstAskedAt이 없는 행: {both_count}개")
            
            if both_count > 0:
                print("\n[샘플 - createdAt은 있지만 firstAskedAt이 없는 행]")
                sample = df[both].head(3)
                for idx, row in sample.iterrows():
                    print(f"\n행 {idx}:")
                    print(f"  userId: {row.get('userId', 'N/A')}")
                    print(f"  direction: {row.get('direction', 'N/A')}")
                    print(f"  mediumType: {row.get('mediumType', 'N/A')}")
                    print(f"  firstAskedAt: {row.get('firstAskedAt')}")
                    print(f"  createdAt: {row.get('createdAt')}")
        
        # direction 분포
        if 'direction' in df.columns:
            print(f"\n[direction 분포 (전체)]")
            print(df['direction'].value_counts().to_dict())
            
            # phone 데이터의 direction 분포
            if 'mediumType' in df.columns:
                phone_df = df[df['mediumType'] == 'phone']
                if len(phone_df) > 0:
                    print(f"\n[phone 데이터 direction 분포]")
                    print(phone_df['direction'].value_counts().to_dict())
                    
                    # phone 데이터 중 firstAskedAt이 없지만 createdAt이 있는 경우
                    phone_first_na = phone_df['firstAskedAt'].isna()
                    phone_created_not_na = phone_df['createdAt'].notna()
                    phone_both = phone_first_na & phone_created_not_na
                    phone_both_count = phone_both.sum()
                    print(f"\nphone 데이터 중 firstAskedAt 없지만 createdAt 있는 행: {phone_both_count}개")
                    if phone_both_count > 0:
                        print("\n[샘플 - phone 데이터 중 firstAskedAt 없지만 createdAt 있는 행]")
                        phone_sample = phone_df[phone_both].head(3)
                        for idx, row in phone_sample.iterrows():
                            print(f"\n행 {idx}:")
                            print(f"  userId: {row.get('userId', 'N/A')}")
                            print(f"  direction: {row.get('direction', 'N/A')}")
                            print(f"  firstAskedAt: {row.get('firstAskedAt')}")
                            print(f"  createdAt: {row.get('createdAt')}")
                            
                            # OB가 맞는지 확인
                            if row.get('direction') != 'OB':
                                print(f"  ⚠️ 경고: direction이 OB가 아닙니다!")
    
except Exception as e:
    print(f"오류: {e}")
    import traceback
    traceback.print_exc()
