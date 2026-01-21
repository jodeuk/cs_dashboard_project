#!/usr/bin/env python3
import pandas as pd

# 7월 캐시 확인
df7 = pd.read_pickle('cache/userchats_2025-07.pkl')
df7['firstAskedAt'] = pd.to_datetime(df7['firstAskedAt'], errors='coerce')
july = df7[(df7['firstAskedAt'] >= '2025-07-01') & (df7['firstAskedAt'] < '2025-08-01')]
print(f'7월 캐시 파일: 총 {len(df7)}개 행')
print(f'실제 7월 데이터: {len(july)}개')

# 8월 캐시 확인
df8 = pd.read_pickle('cache/userchats_2025-08.pkl')
df8['firstAskedAt'] = pd.to_datetime(df8['firstAskedAt'], errors='coerce')
august = df8[(df8['firstAskedAt'] >= '2025-08-01') & (df8['firstAskedAt'] < '2025-09-01')]
print(f'8월 캐시 파일: 총 {len(df8)}개 행')
print(f'실제 8월 데이터: {len(august)}개')

# 전체 데이터에서 7, 8월 데이터 찾기
print('\n전체 캐시에서 7, 8월 데이터 검색...')
all_months = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']
july_all = []
august_all = []

for month in all_months:
    try:
        df = pd.read_pickle(f'cache/userchats_{month}.pkl')
        df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'], errors='coerce')
        j = df[(df['firstAskedAt'] >= '2025-07-01') & (df['firstAskedAt'] < '2025-08-01')]
        a = df[(df['firstAskedAt'] >= '2025-08-01') & (df['firstAskedAt'] < '2025-09-01')]
        if len(j) > 0:
            print(f'{month} 캐시에 7월 데이터 {len(j)}개 발견')
            july_all.append(j)
        if len(a) > 0:
            print(f'{month} 캐시에 8월 데이터 {len(a)}개 발견')
            august_all.append(a)
    except Exception as e:
        print(f'{month} 캐시 읽기 실패: {e}')

if july_all:
    july_combined = pd.concat(july_all, ignore_index=True)
    print(f'\n전체 캐시에서 발견된 7월 데이터: {len(july_combined)}개')
if august_all:
    august_combined = pd.concat(august_all, ignore_index=True)
    print(f'전체 캐시에서 발견된 8월 데이터: {len(august_combined)}개')

