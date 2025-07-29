#!/usr/bin/env python3
"""
CS Dashboard Project - App Entry Point
Render 배포를 위한 앱 진입점
"""

import os
import re
import httpx
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import asyncio
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

# ---- 1. FastAPI 기본 셋업 ----
app = FastAPI(title="CS Dashboard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- 2. Channel Talk API 클래스 ----
class ChannelTalkAPI:
    def __init__(self):
        self.base_url = "https://api.channel.io"
        self.access_key = os.getenv("CHANNEL_ACCESS_TOKEN")
        self.access_secret = os.getenv("CHANNEL_ACCESS_SECRET")
        
        # Basic Authentication 방식으로 변경
        import base64
        credentials = f"{self.access_key}:{self.access_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        self.headers = {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/json"
        }

    async def get_userchats(self, start_date: str, end_date: str, limit: int = 100) -> List[Dict]:
        """Channel Talk API에서 UserChat 데이터를 가져옵니다."""
        if not self.access_key:
            raise ValueError("CHANNEL_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")
        
        url = f"{self.base_url}/open/v5/user-chats"
        
        start_timestamp = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000000)
        end_timestamp = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000000)
        
        params = {
            "startAt": start_timestamp,
            "endAt": end_timestamp,
            "limit": limit,
            "sortOrder": "desc"
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                data = response.json()
                
                if "userChats" in data:
                    return data["userChats"]
                elif isinstance(data, list):
                    return data
                else:
                    return []
                    
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            print(f"API 호출 중 오류 발생: {str(e)}")
            raise

# ---- 3. API 인스턴스 생성 ----
channel_api = ChannelTalkAPI()

# ---- 4. API 엔드포인트 ----

@app.get("/")
async def root():
    return {"message": "CS Dashboard API", "version": "1.0.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api/test")
async def test():
    return {"message": "API is working!"}

@app.get("/api/debug-channel-api")
async def debug_channel_api():
    """Channel Talk API 상세 디버깅"""
    try:
        access_key = os.environ.get("CHANNEL_ACCESS_TOKEN")
        
        if not access_key:
            return {
                "status": "error",
                "message": "CHANNEL_ACCESS_TOKEN not found",
                "access_key_exists": False
            }
        
        api_info = {
            "base_url": channel_api.base_url,
            "access_key_length": len(access_key),
            "access_key_prefix": access_key[:10] + "..." if len(access_key) > 10 else access_key,
            "access_secret_exists": bool(channel_api.access_secret),
            "headers": {
                "Authorization": "Basic ***",
                "Content-Type": "application/json"
            }
        }
        
        try:
            test_data = await channel_api.get_userchats("2024-12-01", "2024-12-31", limit=1)
            
            return {
                "status": "success",
                "api_info": api_info,
                "test_result": {
                    "data_count": len(test_data) if test_data else 0,
                    "has_data": bool(test_data),
                    "sample_item": test_data[0] if test_data else None
                }
            }
        except Exception as api_error:
            return {
                "status": "api_error",
                "api_info": api_info,
                "error": str(api_error),
                "error_type": type(api_error).__name__
            }
            
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__
        }

@app.get("/api/test-channel-api")
async def test_channel_api():
    """Channel Talk API 연결 테스트"""
    try:
        access_key = os.environ.get("CHANNEL_ACCESS_TOKEN")
        if not access_key:
            return {"error": "CHANNEL_ACCESS_TOKEN not found", "status": "failed"}
        
        test_data = await channel_api.get_userchats("2024-01-01", "2024-01-31", limit=5)
        
        return {
            "status": "success",
            "access_key_exists": bool(access_key),
            "access_key_length": len(access_key) if access_key else 0,
            "data_count": len(test_data) if test_data else 0,
            "sample_data": test_data[:2] if test_data else [],
            "api_url": f"{channel_api.base_url}/open/v5/user-chats",
            "headers": {"Authorization": "Bearer ***", "Content-Type": "application/json"}
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__,
            "access_key_exists": bool(os.environ.get("CHANNEL_ACCESS_TOKEN")),
            "api_url": f"{channel_api.base_url}/open/v5/user-chats"
        }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port) 