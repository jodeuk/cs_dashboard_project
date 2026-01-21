#!/bin/bash

# 백엔드 API 엔드포인트 확인
API_BASE="http://61.107.201.48:8081"

echo "=========================================="
echo "캐시에서 firstAskedAt 없는 데이터 확인"
echo "=========================================="
echo ""

# API 엔드포인트 호출
echo "API 호출 중: ${API_BASE}/api/cache/check-firstasked"
echo ""

curl -s "${API_BASE}/api/cache/check-firstasked" | python3 -m json.tool

echo ""
echo "=========================================="
echo "완료"
echo "=========================================="
