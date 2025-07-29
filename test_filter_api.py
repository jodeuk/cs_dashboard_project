import requests
import json

def test_filter_api():
    url = "https://cs-dashboard-project.onrender.com/api/filter-options"
    params = {
        "start": "2025-07-01",
        "end": "2025-07-29"
    }
    
    try:
        print("🔍 필터 옵션 API 테스트 중...")
        response = requests.get(url, params=params, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 성공! 응답: {json.dumps(data, indent=2, ensure_ascii=False)}")
        else:
            print(f"❌ 실패! 응답: {response.text}")
            
    except requests.exceptions.Timeout:
        print("❌ 타임아웃 발생")
    except requests.exceptions.RequestException as e:
        print(f"❌ 요청 오류: {e}")
    except Exception as e:
        print(f"❌ 예상치 못한 오류: {e}")

if __name__ == "__main__":
    test_filter_api() 