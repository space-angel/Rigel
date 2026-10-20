# 배포

todoBAN은 사용자 컴퓨터에 깔린 **Claude Code**(사용자 본인의 Claude 구독이나 API 키)로 할 일을 나누고 첫 행동을 찾는다.
앱은 Claude 계정 정보를 직접 다루지 않는다. 사용자가 터미널에서 `claude`로 로그인해 두면, 앱은 그 claude를 실행만 한다.

## 받는 사람이 준비할 것

1. Claude Code 설치: https://docs.claude.com/en/docs/claude-code/setup
   - 맥: 공식 설치 스크립트(`~/.local/bin/claude`), Homebrew, npm(nvm·volta 포함) 모두 자동으로 찾는다
   - 윈도우: 공식 설치 프로그램(`%USERPROFILE%\.local\bin\claude.exe`), npm(`%APPDATA%\npm\claude.cmd`)을 찾는다
   - 다른 자리라면 설정 → 일반 → Claude Code → 실행 파일에 경로를 적는다
2. 터미널에서 `claude`를 한 번 실행해 로그인한다(Pro·Max·Team 구독 또는 API 키)
3. todoBAN을 연다. 시작하기 화면이 찾았는지·로그인했는지·어떤 구독인지 보여 준다
4. (선택) Notion·Linear·Figma: claude.ai → 설정 → 커넥터에서 연결하고, 터미널 `claude` → `/mcp`에서 로그인

짧은 할 일(30자 이하)은 Claude 없이도 바로 들어간다.

## 패키지 만들기

```sh
npm ci
npm run dist:mac   # dist/todoBAN-<버전>-mac-arm64.dmg, -x64.dmg, zip
npm run dist:win   # dist/todoBAN-<버전>-win-x64-setup.exe, -arm64-setup.exe
npm run dist:dir   # 설치 파일 없이 앱 폴더만(확인용)
```

- 윈도우 설치 파일은 윈도우에서 만드는 것이 정식이다(실행 파일에 아이콘·정보를 넣는 단계가 윈도우 도구를 쓴다).
  맥에서 시험 삼아 만들려면 `npx electron-builder --win nsis --x64 -c.win.signAndEditExecutable=false`
- GitHub Actions(`.github/workflows/ci.yml`)가 맥·윈도우에서 검사한 뒤 설치 파일을 만들어 Artifacts로 올린다.
  윈도우 단계는 가짜 `claude.cmd`로 첫 행동 미리 찾기까지 실제로 돌린다.
- 아이콘을 바꾸면 `npm run tray-icon`(트레이 아이콘·앱 아이콘을 다시 그림)

## 서명과 공증

서명하지 않은 앱은 처음 열 때 경고가 뜬다. 친구에게 시험 배포할 때는 아래처럼 열면 된다.

| | 서명 없이 열기 | 정식 배포 |
|---|---|---|
| 맥 | Finder에서 앱을 **오른쪽 클릭 → 열기 → 열기** (한 번만) | Apple Developer Program(연 99달러)의 Developer ID 인증서로 서명하고 공증 |
| 윈도우 | SmartScreen 경고에서 **추가 정보 → 실행** | 코드 서명 인증서(OV/EV) 또는 Azure Trusted Signing |

맥 서명·공증을 켜려면 `electron-builder.yml`의 `notarize: false`를 지우고, 빌드할 때 환경 변수를 준다.

```sh
export CSC_LINK=/path/DeveloperID.p12 CSC_KEY_PASSWORD=…        # 인증서
export APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=…  # 공증
npm run dist:mac
```

## 업데이트

지금은 자동 업데이트가 없다. 새 버전은 설치 파일을 다시 받아 덮어 설치한다(데이터는 그대로 남는다).
- 맥: `~/Library/Application Support/todoBAN`
- 윈도우: `%APPDATA%\todoBAN`

자동 업데이트가 필요하면 electron-updater + GitHub Releases(맥은 서명이 있어야 함)를 붙인다.

## 다른 사람 컴퓨터에서 확인하기

`bash scripts/new-user-matrix.sh <결과 폴더>` — 빈 홈 폴더와 최소 PATH로 앱을 띄워, claude가 없는 경우·로그인 안 한 경우·사용량 한도·
인터넷 끊김·npm/nvm으로 깐 경우 등을 가짜 claude(`docs/qa/fixtures/fake-claude.mjs`)로 돌린다. 결과는 `docs/qa/new-user-report.md`.
