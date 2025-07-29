#!/usr/bin/env python3
"""
.env 파일 생성 스크립트
올바른 인코딩으로 환경변수 파일을 생성합니다.
"""

def create_env_file():
    """환경변수 파일을 생성합니다."""
    
    env_content = """# Channel.io API 인증 정보
CHANNEL_ACCESS_KEY=68883a95c1c0f08306f3
CHANNEL_ACCESS_SECRET=7c7fc51ce244238c23c6fb86c0d7583a

# 기타 설정
FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf

# 테스트용 ID (선택사항)
TEST_USER_ID=674523ee339f9bd5feb9
TEST_USERCHAT_ID=6888615a04ae7d5fab51
"""
    
    try:
        with open('.env', 'w', encoding='utf-8') as f:
            f.write(env_content)
        print("✅ .env 파일이 성공적으로 생성되었습니다!")
        print("📁 파일 내용:")
        print(env_content)
    except Exception as e:
        print(f"❌ .env 파일 생성 실패: {str(e)}")

if __name__ == "__main__":
    create_env_file() 