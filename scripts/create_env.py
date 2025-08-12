#!/usr/bin/env python3
"""
환경변수 파일 생성 스크립트
"""

import os
import sys

def create_env_file():
    """환경변수 파일 생성"""
    env_content = """# Channel Talk API 설정
CHANNEL_ACCESS_KEY=your_channel_access_key_here
CHANNEL_ACCESS_SECRET=your_channel_access_secret_here

# 캐시 설정
CACHE_DIR=/data/cache

# 서버 설정
PORT=8000
HOST=0.0.0.0
DOCKER_ENV=true
"""
    
    if os.path.exists('.env'):
        print("❌ .env 파일이 이미 존재합니다.")
        response = input("덮어쓰시겠습니까? (y/N): ")
        if response.lower() != 'y':
            print("취소되었습니다.")
            return False
    
    try:
        with open('.env', 'w', encoding='utf-8') as f:
            f.write(env_content)
        print("✅ .env 파일이 생성되었습니다.")
        print("📝 실제 API 키로 수정해주세요.")
        return True
    except Exception as e:
        print(f"❌ .env 파일 생성 실패: {e}")
        return False

if __name__ == "__main__":
    success = create_env_file()
    sys.exit(0 if success else 1) 