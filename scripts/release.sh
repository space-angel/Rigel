#!/bin/bash
# 새 버전 올리기: CI가 만든 설치 파일을 공개 레포(space-angel/todoban-releases)의 릴리스로 올린다.
# 그러면 다운로드 페이지 버튼과 앱의 업데이트 확인이 이 버전을 가리킨다.
#
# 1. package.json의 version을 올리고 커밋·푸시한다(CI가 설치 파일을 만든다)
# 2. bash scripts/release.sh <CI 실행 번호> [메모]
#    실행 번호: gh run list --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId'
set -euo pipefail
RUN=${1:?CI 실행 번호}
NOTES=${2:-""}
REPO=space-angel/ban-todo
RELEASES=space-angel/todoban-releases
VERSION=$(node -p "require('./package.json').version")
WORK=$(mktemp -d -t todoban-release)

echo "v$VERSION · 실행 $RUN 의 설치 파일을 받는 중 ($WORK)"
TOKEN=$(gh auth token)
for name in installer-windows-latest installer-macos-latest; do
  id=$(gh api "repos/$REPO/actions/runs/$RUN/artifacts" --jq ".artifacts[] | select(.name==\"$name\") | .id")
  url=$(curl -s -o /dev/null -w '%{redirect_url}' -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$REPO/actions/artifacts/$id/zip")
  # 큰 파일이라 끊기면 이어받는다
  for i in 1 2 3 4 5 6; do curl -sS -L -C - --retry 5 --speed-time 60 --speed-limit 1000 -o "$WORK/$name.zip" "$url" && break; done
  unzip -q -o "$WORK/$name.zip" -d "$WORK/files"
done

ls -la "$WORK/files"
# 업데이트 정보(latest*.yml)가 이번 버전을 가리키는지 확인
grep -q "version: $VERSION" "$WORK/files/latest.yml"
grep -q "version: $VERSION" "$WORK/files/latest-mac.yml"

# 0.1.0(todoBAN 이름)의 맥 앱은 todoBAN-mac-*.dmg 주소로 새 버전을 받는다. 같은 파일을 예전 이름으로도 올린다.
for arch in arm64 x64; do cp "$WORK/files/Rigel-mac-$arch.dmg" "$WORK/files/todoBAN-mac-$arch.dmg"; done
gh release create "v$VERSION" --repo "$RELEASES" --title "Rigel $VERSION" --notes "${NOTES:-Rigel $VERSION}" "$WORK"/files/*
echo "올림: https://github.com/$RELEASES/releases/tag/v$VERSION"
