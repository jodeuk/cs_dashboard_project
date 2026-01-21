#!/usr/bin/env python3
import sys
import os

# pandas와 pickle을 사용하기 위해 경로 추가
try:
    import pandas as pd
    import pickle
    import json
except ImportError as e:
    print(f"필요한 라이브러리를 import할 수 없습니다: {e}")
    print("pandas가 설치되어 있는지 확인하세요: pip install pandas")
    sys.exit(1)

# 로컬 캐시 디렉토리
local_cache_dir = "/home/elice/cs_dashboard_project/cache"

# Docker 컨테이너 내부 캐시 확인
import subprocess

print("캐시 디렉토리 확인:\n")
print(f"  로컬: {local_cache_dir}")

# Docker 컨테이너 내부 파일 목록 가져오기
docker_files = []
try:
    result = subprocess.run(
        ["docker", "exec", "cs_dashboard_backend", "ls", "/data/cache/"],
        capture_output=True,
        text=True,
        timeout=5
    )
    if result.returncode == 0:
        docker_files = [f.strip() for f in result.stdout.split('\n') if f.strip().startswith("userchats_") and f.strip().endswith(".pkl")]
        print(f"  Docker 컨테이너: /data/cache (파일 {len(docker_files)}개 발견)")
    else:
        print(f"  Docker 컨테이너: 접근 실패 ({result.stderr})")
except Exception as e:
    print(f"  Docker 컨테이너: 확인 실패 ({e})")

print()

# 로컬 파일 찾기
local_files = []
if os.path.exists(local_cache_dir):
    try:
        local_files = [f for f in os.listdir(local_cache_dir) if f.startswith("userchats_") and f.endswith(".pkl")]
    except Exception as e:
        print(f"⚠️ 로컬 디렉토리 읽기 실패: {e}")

# Docker 컨테이너 내부 파일도 확인 (docker exec로 파일 읽기)
all_cache_files = []

# 로컬 파일 추가
for f in local_files:
    all_cache_files.append(("로컬", local_cache_dir, f))

# Docker 파일 추가 (컨테이너 내부에서 읽기)
for f in docker_files:
    all_cache_files.append(("Docker", "/data/cache", f))

cache_files = all_cache_files

if not cache_files:
    print("userchats 캐시 파일을 찾을 수 없습니다.")
    sys.exit(1)

print(f"발견된 캐시 파일: {len(cache_files)}개\n")

for name, cache_dir, cache_file in sorted(cache_files, key=lambda x: x[2]):
    print("=" * 80)
    print(f"캐시 파일: {cache_file} ({name})")
    print(f"경로: {cache_dir}/{cache_file}")
    print("=" * 80)
    
    try:
        # DataFrame 로드
        print("캐시 파일 로드 중...")
        
        # Docker 컨테이너 내부 파일인 경우 docker exec로 읽기
        if name == "Docker":
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as tmp_file:
                tmp_path = tmp_file.name
            try:
                # 컨테이너에서 파일 복사
                result = subprocess.run(
                    ["docker", "cp", f"cs_dashboard_backend:{cache_dir}/{cache_file}", tmp_path],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode != 0:
                    print(f"❌ 파일 복사 실패: {result.stderr}")
                    continue
                df = pd.read_pickle(tmp_path)
                os.unlink(tmp_path)
            except Exception as e:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                raise e
        else:
            cache_path = os.path.join(cache_dir, cache_file)
            df = pd.read_pickle(cache_path)
        
        meta_path = None
        if name == "Docker":
            # 메타데이터도 복사해서 읽기
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp_meta:
                tmp_meta_path = tmp_meta.name
            try:
                meta_file = cache_file.replace(".pkl", "_metadata.json")
                result = subprocess.run(
                    ["docker", "cp", f"cs_dashboard_backend:{cache_dir}/{meta_file}", tmp_meta_path],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    meta_path = tmp_meta_path
            except:
                pass
        else:
            cache_path = os.path.join(cache_dir, cache_file)
            meta_path = cache_path.replace(".pkl", "_metadata.json")
        print(f"✅ 총 행 수: {len(df)}")
        
        # 컬럼 확인
        if 'firstAskedAt' not in df.columns:
            print("⚠️ 경고: 'firstAskedAt' 컬럼이 없습니다!")
            print(f"사용 가능한 컬럼: {list(df.columns)}")
            continue
        
        if 'createdAt' not in df.columns:
            print("⚠️ 경고: 'createdAt' 컬럼이 없습니다!")
            continue
        
        # firstAskedAt이 NaN인 행 확인
        first_na = df['firstAskedAt'].isna()
        first_na_count = first_na.sum()
        print(f"\n📊 firstAskedAt이 NaN인 행: {first_na_count}개 ({first_na_count/len(df)*100:.2f}%)")
        
        # createdAt은 있지만 firstAskedAt이 없는 행
        created_not_na = df['createdAt'].notna()
        both_condition = first_na & created_not_na
        both_count = both_condition.sum()
        print(f"📊 createdAt은 있지만 firstAskedAt이 없는 행: {both_count}개")
        
        if both_count > 0:
            print(f"\n🔍 [샘플 데이터 - createdAt은 있지만 firstAskedAt이 없는 행]")
            sample = df[both_condition].head(5)
            for idx, row in sample.iterrows():
                print(f"\n  행 {idx}:")
                print(f"    userId: {row.get('userId', 'N/A')}")
                print(f"    userChatId: {row.get('userChatId', 'N/A')}")
                print(f"    direction: {row.get('direction', 'N/A')}")
                print(f"    mediumType: {row.get('mediumType', 'N/A')}")
                print(f"    firstAskedAt: {row.get('firstAskedAt')}")
                print(f"    createdAt: {row.get('createdAt')}")
                
                # direction이 OB가 맞는지 확인
                if row.get('direction') != 'OB':
                    print(f"    ⚠️ 경고: direction이 OB가 아닙니다! (현재: {row.get('direction')})")
        
        # direction 분포 확인
        if 'direction' in df.columns:
            print(f"\n📊 [direction 분포 (전체)]")
            direction_counts = df['direction'].value_counts()
            for direction, count in direction_counts.items():
                print(f"    {direction}: {count}개 ({count/len(df)*100:.2f}%)")
            
            # phone 데이터의 direction 분포
            if 'mediumType' in df.columns:
                phone_df = df[df['mediumType'] == 'phone']
                if len(phone_df) > 0:
                    print(f"\n📊 [phone 데이터 통계]")
                    print(f"    총 phone 데이터: {len(phone_df)}개")
                    
                    phone_direction = phone_df['direction'].value_counts()
                    print(f"    direction 분포:")
                    for direction, count in phone_direction.items():
                        print(f"      {direction}: {count}개 ({count/len(phone_df)*100:.2f}%)")
                    
                    # phone 데이터 중 firstAskedAt이 없지만 createdAt이 있는 경우
                    phone_first_na = phone_df['firstAskedAt'].isna()
                    phone_created_not_na = phone_df['createdAt'].notna()
                    phone_both = phone_first_na & phone_created_not_na
                    phone_both_count = phone_both.sum()
                    print(f"\n    phone 데이터 중 firstAskedAt 없지만 createdAt 있는 행: {phone_both_count}개")
                    
                    if phone_both_count > 0:
                        print(f"\n    🔍 [샘플 - phone 데이터 중 firstAskedAt 없지만 createdAt 있는 행]")
                        phone_sample = phone_df[phone_both].head(3)
                        for idx, row in phone_sample.iterrows():
                            print(f"\n      행 {idx}:")
                            print(f"        userId: {row.get('userId', 'N/A')}")
                            print(f"        direction: {row.get('direction', 'N/A')}")
                            print(f"        firstAskedAt: {row.get('firstAskedAt')}")
                            print(f"        createdAt: {row.get('createdAt')}")
                            
                            # OB가 맞는지 확인
                            if row.get('direction') != 'OB':
                                print(f"        ⚠️ 경고: direction이 OB가 아닙니다! (현재: {row.get('direction')})")
                            else:
                                print(f"        ✅ direction이 OB로 올바르게 설정됨")
        
        # 메타데이터 확인
        if meta_path and os.path.exists(meta_path):
            print(f"\n📄 메타데이터:")
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            print(f"    저장일시: {meta.get('saved_at', 'N/A')}")
            print(f"    데이터 개수: {meta.get('data_count', 'N/A')}")
            print(f"    월: {meta.get('month', 'N/A')}")
            if 'first_asked_start' in meta:
                print(f"    firstAskedAt 시작: {meta.get('first_asked_start', 'N/A')}")
                print(f"    firstAskedAt 종료: {meta.get('first_asked_end', 'N/A')}")
            # 임시 파일 삭제
            if name == "Docker" and meta_path.startswith("/tmp"):
                try:
                    os.unlink(meta_path)
                except:
                    pass
        
        print()
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        print()
