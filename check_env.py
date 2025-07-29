#!/usr/bin/env python3
"""
환경변수 설정 확인 스크립트
보안을 위해 실제 값은 노출하지 않고 설정 여부만 확인합니다.
"""

import os
from dotenv import load_dotenv

def check_environment_variables():
    """환경변수 설정 상태를 확인합니다."""
    
    # .env 파일 로드
    load_dotenv()
    
    print("🔍 환경변수 설정 확인")
    print("=" * 50)
    
    # 필수 환경변수 목록
    required_vars = {
        "CHANNEL_ACCESS_KEY": "Channel.io API Access Key",
        "CHANNEL_ACCESS_SECRET": "Channel.io API Access Secret"
    }
    
    # 선택적 환경변수 목록
    optional_vars = {
        "FONT_PATH": "폰트 파일 경로",
        "TEST_USER_ID": "테스트용 사용자 ID",
        "TEST_USERCHAT_ID": "테스트용 UserChat ID"
    }
    
    all_good = True
    
    # 필수 환경변수 확인
    print("📋 필수 환경변수:")
    for var_name, description in required_vars.items():
        value = os.getenv(var_name)
        if value:
            print(f"  ✅ {var_name}: {description}")
            print(f"     길이: {len(value)} 문자")
            print(f"     미리보기: {value[:10]}...")
        else:
            print(f"  ❌ {var_name}: {description} - 설정되지 않음")
            all_good = False
        print()
    
    # 선택적 환경변수 확인
    print("📋 선택적 환경변수:")
    for var_name, description in optional_vars.items():
        value = os.getenv(var_name)
        if value:
            print(f"  ✅ {var_name}: {description}")
            print(f"     값: {value}")
        else:
            print(f"  ⚠️  {var_name}: {description} - 설정되지 않음 (선택사항)")
        print()
    
    # 보안 체크
    print("🔒 보안 체크:")
    
    # .env 파일 존재 확인
    env_file_exists = os.path.exists(".env")
    print(f"  {'✅' if env_file_exists else '❌'} .env 파일 존재: {env_file_exists}")
    
    # .gitignore에 .env 포함 확인
    gitignore_exists = os.path.exists(".gitignore")
    if gitignore_exists:
        with open(".gitignore", "r", encoding="utf-8") as f:
            gitignore_content = f.read()
            env_in_gitignore = ".env" in gitignore_content
            print(f"  {'✅' if env_in_gitignore else '❌'} .env가 .gitignore에 포함됨: {env_in_gitignore}")
    else:
        print("  ❌ .gitignore 파일이 없음")
    
    print()
    
    # 결과 요약
    print("📊 결과 요약:")
    if all_good:
        print("  ✅ 모든 필수 환경변수가 설정되었습니다!")
        print("  🚀 API 테스트를 진행할 수 있습니다.")
    else:
        print("  ❌ 일부 필수 환경변수가 설정되지 않았습니다.")
        print("  🔧 환경변수를 설정한 후 다시 확인해주세요.")
    
    print()
    print("💡 도움말:")
    print("  1. .env 파일을 생성하고 필요한 환경변수를 설정하세요")
    print("  2. 또는 시스템 환경변수로 설정하세요")
    print("  3. 자세한 설정 방법은 README_ENV_SETUP.md를 참조하세요")

if __name__ == "__main__":
    check_environment_variables() 