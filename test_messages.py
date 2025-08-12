import asyncio
from app.cs_utils import channel_api

async def test_messages():
    try:
        print('🔍 Messages API 테스트 시작...')
        messages = await channel_api.get_messages('2025-08-01', '2025-08-31', limit=10)
        print(f'✅ 성공! 메시지 수: {len(messages)}')
        if messages:
            print(f'📋 첫 번째 메시지 키들: {list(messages[0].keys())}')
            print(f'📄 샘플 데이터: {messages[0]}')
        else:
            print('⚠️ 데이터 없음')
    except Exception as e:
        print(f'❌ 오류: {e}')

if __name__ == "__main__":
    asyncio.run(test_messages())
