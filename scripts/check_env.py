#!/usr/bin/env python3
"""
환경변수 확인 스크립트
"""

import os
import sys
from dotenv import load_dotenv

def check_env_variables():
    """환경변수 확인"""
    print("🔍 환경변수 확인 중...")
    
    # .env 파일 로드
    if os.path.exists('.env'):
        load_dotenv()
        print("✅ .env 파일을 찾았습니다.")
    else:
        print("❌ .env 파일이 없습니다.")
        print("💡 config/env.example을 복사해서 .env 파일을 생성하세요.")
        return False
    
    # 필수 환경변수 확인
    required_vars = [
        'CHANNEL_ACCESS_KEY',
        'CHANNEL_ACCESS_SECRET'
    ]
    
    missing_vars = []
    for var in required_vars:
        value = os.getenv(var)
        if not value or value == f'your_{var.lower()}_here':
            missing_vars.append(var)
            print(f"❌ {var}: 설정되지 않음")
        else:
            print(f"✅ {var}: 설정됨")
    
    # 선택적 환경변수 확인
    optional_vars = [
        'CACHE_DIR',
        'PORT',
        'HOST',
        'DOCKER_ENV'
    ]
    
    for var in optional_vars:
        value = os.getenv(var)
        if value:
            print(f"✅ {var}: {value}")
        else:
            print(f"⚠️  {var}: 기본값 사용")
    
    if missing_vars:
        print(f"\n❌ 누락된 환경변수: {', '.join(missing_vars)}")
        print("💡 .env 파일에서 실제 값으로 수정해주세요.")
        return False
    
    print("\n🎉 모든 환경변수가 올바르게 설정되었습니다!")
    return True

if __name__ == "__main__":
    success = check_env_variables()
    sys.exit(0 if success else 1) 