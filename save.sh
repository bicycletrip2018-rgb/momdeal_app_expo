#!/bin/bash

# Check if commit message is provided
if [ -z "$1" ]
then
  echo "Error: 커밋 메시지를 입력해주세요. (예: ./save.sh '홈 화면 수정 완료')"
  exit 1
fi

echo "🚀 세이브루 코드를 금고(GitHub)로 안전하게 전송합니다..."

# 1. Add all changes
git add .

# 2. Commit with the provided message
git commit -m "$1"

# 3. Push to remote (main branch)
git push origin main

if [ $? -eq 0 ]; then
  echo "✅ 백업 성공! v12.0 지침에 따라 안전하게 저장되었습니다."
else
  echo "❌ 백업 실패! 인터넷 연결이나 권한 설정을 확인해주세요."
fi
