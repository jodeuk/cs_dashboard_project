#!/usr/bin/env python3
import pandas as pd
import json
from datetime import datetime

# 7월 캐시 확인
df = pd.read_pickle('cache/userchats_2025-07.pkl')
print(f'7월 캐시 파일: {len(df)}개 행')

df['firstAskedAt'] = pd.to_datetime(df['firstAskedAt'], errors='coerce')
july = df[(df['firstAskedAt'] >= '2025-07-01') & (df['firstAskedAt'] < '2025-08-01')]
print(f'실제 7월 데이터: {len(july)}개')

# 메타데이터 확인
with open('cache/userchats_2025-07_metadata.json') as f:
    meta = json.load(f)
print(f'\n메타데이터:')
print(f'  saved_at: {meta.get("saved_at")}')
print(f'  data_count: {meta.get("data_count")}')
print(f'  first_asked_start: {meta.get("first_asked_start")}')
print(f'  first_asked_end: {meta.get("first_asked_end")}')

