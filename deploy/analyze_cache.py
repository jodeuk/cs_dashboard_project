#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
7월 캐시 데이터에서 "클라우드접속불가" 해결시간 분석
"""

import pandas as pd
import pickle
import os
from datetime import datetime

def analyze_july_cloud_access():
    """7월 캐시 데이터에서 클라우드접속불가 관련 해결시간 분석"""
    
    # 캐시 파일 경로
    cache_file = "/data/cache/userchats_2025-07.pkl"
    
    if not os.path.exists(cache_file):
        print(f"❌ 캐시 파일을 찾을 수 없습니다: {cache_file}")
        return
    
    print(f"📁 캐시 파일 로드 중: {cache_file}")
    
    try:
        # 캐시 파일 로드
        with open(cache_file, 'rb') as f:
            data = pickle.load(f)
        
        print(f"✅ 데이터 로드 완료: {len(data)} rows")
        
        # DataFrame으로 변환
        df = pd.DataFrame(data)
        print(f"📊 DataFrame 생성: {df.shape}")
        
        # 컬럼 확인
        print(f"\n🔍 사용 가능한 컬럼:")
        for col in df.columns:
            print(f"  - {col}")
        
        # 클라우드접속불가 관련 데이터 필터링
        print(f"\n🔍 '클라우드접속불가' 관련 데이터 검색...")
        
        # 문의유형 컬럼에서 "클라우드" 또는 "접속" 포함된 데이터 찾기
        cloud_access_data = []
        
        for idx, row in df.iterrows():
            문의유형 = str(row.get('문의유형', ''))
            문의유형_2차 = str(row.get('문의유형_2차', ''))
            
            # 클라우드 접속 관련 키워드 검색
            if any(keyword in 문의유형 for keyword in ['클라우드', '접속', 'cloud', 'access']):
                cloud_access_data.append(row)
            elif any(keyword in 문의유형_2차 for keyword in ['클라우드', '접속', 'cloud', 'access']):
                cloud_access_data.append(row)
        
        print(f"✅ 클라우드 접속 관련 데이터: {len(cloud_access_data)}건")
        
        if cloud_access_data:
            # DataFrame으로 변환
            cloud_df = pd.DataFrame(cloud_access_data)
            
            print(f"\n📋 클라우드 접속 관련 데이터 상세:")
            for idx, row in cloud_df.iterrows():
                print(f"\n--- 데이터 {idx+1} ---")
                print(f"  문의유형: {row.get('문의유형', 'N/A')}")
                print(f"  문의유형_2차: {row.get('문의유형_2차', 'N/A')}")
                print(f"  서비스유형: {row.get('서비스유형', 'N/A')}")
                print(f"  서비스유형_2차: {row.get('서비스유형_2차', 'N/A')}")
                print(f"  firstAskedAt: {row.get('firstAskedAt', 'N/A')}")
                print(f"  operationResolutionTime: {row.get('operationResolutionTime', 'N/A')}")
                print(f"  operationAvgReplyTime: {row.get('operationAvgReplyTime', 'N/A')}")
                print(f"  operationTotalReplyTime: {row.get('operationTotalReplyTime', 'N/A')}")
                print(f"  operationWaitingTime: {row.get('operationWaitingTime', 'N/A')}")
            
            # 해결시간 통계
            print(f"\n📊 해결시간 통계:")
            
            # operationResolutionTime 분석
            resolution_times = []
            for row in cloud_access_data:
                time_val = row.get('operationResolutionTime')
                if time_val and str(time_val).strip() not in ['', 'null', 'undefined', 'None']:
                    resolution_times.append(time_val)
            
            if resolution_times:
                print(f"  해결시간 데이터: {len(resolution_times)}건")
                print(f"  해결시간 샘플: {resolution_times[:5]}")
            else:
                print(f"  해결시간 데이터: 없음")
            
            # operationAvgReplyTime 분석
            reply_times = []
            for row in cloud_access_data:
                time_val = row.get('operationAvgReplyTime')
                if time_val and str(time_val).strip() not in ['', 'null', 'undefined', 'None']:
                    reply_times.append(time_val)
            
            if reply_times:
                print(f"  평균응답시간 데이터: {len(reply_times)}건")
                print(f"  평균응답시간 샘플: {reply_times[:5]}")
            else:
                print(f"  평균응답시간 데이터: 없음")
        
        else:
            print(f"❌ 클라우드 접속 관련 데이터를 찾을 수 없습니다.")
            
            # 전체 데이터에서 문의유형 분포 확인
            print(f"\n🔍 전체 데이터 문의유형 분포:")
            if '문의유형' in df.columns:
                문의유형_counts = df['문의유형'].value_counts()
                print(f"  문의유형 분포:")
                for 문의유형, count in 문의유형_counts.head(10).items():
                    print(f"    {문의유형}: {count}건")
            
            if '문의유형_2차' in df.columns:
                문의유형_2차_counts = df['문의유형_2차'].value_counts()
                print(f"  문의유형_2차 분포:")
                for 문의유형_2차, count in 문의유형_2차_counts.head(10).items():
                    print(f"    {문의유형_2차}: {count}건")
    
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 7월 캐시 데이터 분석 시작...")
    analyze_july_cloud_access()
    print("\n✅ 분석 완료")
