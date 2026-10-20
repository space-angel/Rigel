# todoBAN 작업 착수 문서

2026년 10월 20일 · @wozz · v0.3 (다크 글래스 기본 디자인, 도구로 첫 행동 빚기)

## 이 문서의 목적

이 문서는 개인용 맥 할 일 앱 todoBAN의 첫 버전을 Claude Code로 만들 때 기준으로 삼는 범위, 화면, 데이터, 연결 방식, 작업 순서를 정의합니다. Claude Code는 작업마다 이 문서를 기준으로 삼습니다.

| 항목 | 내용 |
|---|---|
| 대상 독자 | 앱을 만드는 나, 그리고 이 문서를 읽고 구현하는 Claude Code |
| 읽고 나면 알 수 있는 것 | 1. 첫 버전에서 만들 것과 만들지 않을 것 2. 화면과 사용 순서 3. 데이터 모델 4. Claude Code와 피그마를 연결하는 방법 5. 테마 구조 |
| 다루지 않는 것 | 앱스토어 배포, 다른 사람에게 공유하는 방법 |
| 관련 문서 | 디자인: [Figma — todoBAN](https://www.figma.com/design/uLkrdQtbosV1DMYSYHsYeB) “todoBAN · Full flow” 페이지 (A1~D4) |

한 문장 요약: 맥 어디서든 단축키로 생각을 적으면, 맥에 로그인된 Claude Code가 그 내용을 바로 시작할 수 있는 할 일로 나누고, 할 일 옆의 시작 버튼을 누르면 작업할 피그마 파일이 열립니다.

### v0.2에서 바뀐 것

| 항목 | v0.2 | v0.3 | 이유 |
|---|---|---|---|
| 기본 디자인 | 밝은 SEED 그레이 + 민트 그라데이션 | 다크 글래스. 글로우는 화면당 주인공 카드 하나에만 (9장) | 창과 카드가 모두 빛나면 어디를 봐야 할지 흐려짐 |
| 화면 문구 | 한국어 해요체 | 영어. 할 일 제목과 예시는 사용자가 쓴 말 그대로 | 디자인 시안을 영어로 확정 |
| 첫 행동 | 할 일 제목과 원문만 보고 Claude가 고름 | 내 말, 내 도구(LOCAL/MCP), 크기, 출처별 비율을 골라 빚음 (7장) | 일반적인 조언(“예상 질문 정리하기”)이 아니라 내 자료에서 나온 첫 행동이 필요함 |
| Claude 도구 사용 | 모든 호출에서 막음 | 나누기·첫 행동은 그대로 막고, MCP 도구는 읽기 전용 `collect` 호출에서만 엶 (7장) | 도구가 필요한 호출을 하나로 모아 느린 시간과 권한 범위를 가둠 |
| 설정 탭 | 일반, 바로가기 | 일반, 도구, 바로가기, 테마 | 도구 연결을 따로 관리 |
| 메뉴바 목록 아래 | 단축키 힌트 바 | 입력 바(빠른 입력과 같은 규칙) | 목록을 연 채로 바로 적을 수 있게 |

### v0.1에서 바뀐 것

| 항목 | v0.1 | v0.2 | 이유 |
|---|---|---|---|
| 앱 기술 | SwiftUI + SwiftData | Electron + React + TypeScript | Xcode를 설치할 디스크 공간이 없고, 이 맥의 Command Line Tools로는 Swift 앱이 빌드되지 않음. Node 24는 이미 설치되어 있음 |
| 저장 | SwiftData | JSON 파일 하나 (원자적 쓰기) | 데이터가 작고, 네이티브 모듈 빌드를 피함 |
| 앱 이름 | 미정 | todoBAN (임시) | 폴더와 앱 ID에 사용 |
| 화면 스타일 | 다루지 않음 | 테마 파일로 분리하고 기본 테마와 Phantom 테마를 내장 | 디자인 시안 두 개를 모두 쓰고, v1.1에서 Claude로 테마를 만들기 위해 |

## 용어

| 용어 | 뜻 | 예시 |
|---|---|---|
| 빠른 입력 | 단축키로 여는 입력창에 생각을 정리하지 않은 채 적는 것 | “내일 포폴 고치고 사일로 발표 자료 봐야 함” |
| 할 일 | 제목 한 줄로 된 작업 하나. 제목은 “대상 + 동사” 형태 | “포폴 올리브영 장표 지표 문장 고치기” |
| 정리 안 된 할 일 | 제목만 보고는 무엇부터 할지 알 수 없는 할 일 | “포폴 손보기”, “면접 준비” |
| 첫 행동 | 정리 안 된 할 일을 바로 시작할 수 있게 바꾼 할 일 하나 | “면접 준비” → “토스 PO 공고 질문 5개 답변 쓰기” |
| 바로가기 | 할 일과 연결해 두는 작업 장소(피그마 파일이나 프레임) | 이름 “포폴”, 링크는 피그마 포폴 덱 |
| 오늘 / 나중 | 할 날짜가 오늘 이하인 할 일 / 할 날짜가 없거나 미래인 할 일 | |
| 테마 | 색, 글꼴, 모양, 질감, 연출, 문구를 담은 JSON 파일 하나 | 기본(다크 글래스), Phantom |
| 도구 | 첫 행동을 빚을 때 참고하는 자료의 출처 | 피그마, 캘린더, 파일, todoBAN, Gmail |
| LOCAL 도구 | 앱이 맥 안에서 직접 읽는 도구. 빠르고 Claude 권한이 필요 없음 | 피그마 바로가기, 캘린더, Spotlight 최근 파일 |
| MCP 도구 | Claude Code가 MCP로 읽는 외부 서비스. 읽기 전용이고 느림 | Gmail, Notion, Linear |
| 주인공 카드 | 한 화면에서 사용자가 지금 결정할 카드 하나. 글로우는 여기에만 씀 | 지금 할 일, 첫 행동 결과 |

## 1. 할 일을 넣기 전에 무엇을 할지 정하는 단계가 가장 어렵습니다

월요일 아침에 “포폴 해야 되는데, 면접 준비도 해야 하고…”라는 생각은 있지만, 할 일 앱을 열면 무엇을 적어야 할지 정하지 못하고 닫게 됩니다. (문제를 설명하기 위해 만든 예시입니다.) 기존 할 일 앱은 사용자가 할 일을 이미 알고 있다고 가정하고, 그것을 빨리 넣는 방법에 집중합니다.

말이나 글로 적은 내용을 할 일 여러 개로 나누는 기능은 이미 있습니다. Todoist의 Ramble은 말한 내용을 프로젝트, 날짜, 우선순위가 지정된 할 일로 바꿉니다. 그래서 이 앱은 나누기 자체가 아니라, 정리 안 된 할 일을 바로 시작할 수 있는 첫 행동으로 바꾸는 것을 핵심으로 합니다.

| 구분 | 차별점 | 동작 |
|---|---|---|
| UX | 정리 안 된 할 일을 첫 행동 하나로 바꿉니다 | AI가 하위 할 일 목록을 만들지 않고 첫 행동 하나만 제안합니다. 판단할 정보가 부족하면 질문을 하나만 합니다. 첫 행동을 끝내면 다음 행동을 다시 제안합니다 |
| UX | 시작 버튼으로 작업 장소를 엽니다 | 할 일에 바로가기가 연결되어 있으면, 시작 버튼을 눌렀을 때 피그마의 해당 파일이나 프레임이 열립니다 |
| UX | 첫 행동이 내 자료에서 나옵니다 | 할 일에서 고른 내 말, 켜 둔 도구에서 읽은 자료(메일, 일정, 피그마 프레임), 원하는 크기(5분~2시간)를 섞어 첫 행동을 만듭니다. 결과 카드에 어떤 자료에서 몇 %씩 나왔는지 보여 줍니다 |
| 디자인 | 정리 안 된 할 일이 한눈에 보입니다 | 기본 테마는 파란 점과 읽을 수 있는 흰 55% 글씨로, Phantom 테마는 어두운 리본과 ??? 도장으로 표시합니다. 취소선과 35% 글씨는 끝낸 할 일에만 씁니다. 머리글에 정리할 할 일 수가 보입니다 |

## 2. 첫 버전은 빠른 입력, 첫 행동, 피그마 열기, 테마 구조만 만듭니다

첫 버전의 목표는 내가 일주일 동안 매일 쓰는 것입니다. 아래 범위 밖의 기능은 일주일 사용 후 필요하다고 판단할 때 추가합니다.

| 만들 것 (v1) | 만들지 않을 것 |
|---|---|
| 전역 단축키로 여는 빠른 입력창 | 우선순위, 프로젝트, 태그 |
| Claude Code로 할 일 나누기와 첫 행동 제안 | 마감 시각, 반복, 알림 |
| 첫 행동 빚기: 내 말, LOCAL 도구, MCP 도구(읽기 전용), 크기, 출처별 비율 (7장) | MCP 도구로 쓰기(메일 보내기, 일정 만들기) |
| 할 일 확인 창(수정, 삭제, 오늘/나중 변경) | 하위 할 일 |
| 메뉴바 목록(체크, 끌어서 순서 변경, 시작 버튼) | iCloud 동기화, 아이폰 앱 |
| 정리 안 된 할 일 표시 | 피그마 외 바로가기(노션, 리니어, VS Code) |
| 피그마 바로가기 등록과 열기 | 앱스토어 배포, 다른 사람에게 공유 |
| 어제 못 끝낸 할 일 가져오기 | 음성 입력 |
| 테마 구조(CSS 변수)와 내장 테마 2개: 기본, Phantom | Claude랑 테마 만들기 → **v1.1** (11장) |

## 3. 화면은 빠른 입력창, 확인 창, 메뉴바 목록, 설정 네 개입니다

창 크기는 앱이 고정합니다. 테마는 창 안의 모습만 바꾸고 창 크기와 위치는 바꾸지 못합니다. 모든 연출(첫 행동 카드, 질문, 완료 연출)은 해당 창 안에서만 그립니다.

| 화면 | 여는 방법 | 창 크기 | 하는 일 |
|---|---|---|---|
| 빠른 입력창 | 전역 단축키(기본 ⌥ Space) | 680×최대 260, 투명, 테두리 없음 (패널 640) | 생각을 적고 Enter로 보냅니다 |
| 확인 창 | 빠른 입력 후 자동으로 열림 | 520×내용 높이 | AI가 나눈 할 일을 확인하고 고친 뒤 넣습니다 |
| 메뉴바 목록 | 메뉴바 아이콘 클릭 | 380×최대 640, 투명, 테두리 없음 (카드 360) | 오늘 할 일을 보고, 체크하고, 시작 버튼을 누르고, 아래 입력 바에 적습니다. 첫 행동 빚기(C1, C2)도 이 창 안에서 합니다 |
| 설정 | 메뉴바 목록의 설정 아이콘, ⌘, | 560×내용 높이 | 일반, 도구, 바로가기, 테마 탭 |

화면별 시안은 Figma “todoBAN · Full flow” 페이지에 있습니다. A 할 일 목록(A1 오늘, A2 어제 할 일, A3 나중·완료, A4 다 끝냄), B 받아 적기(B1 입력창, B2 나누는 중, B3 확인 창, B4 응답 없음), C 첫 행동(C1 빚기, C2 결과), D 설정과 처음 실행(D1 일반, D2 도구, D3 바로가기, D4 시작하기). Phantom 시안은 Prototype · Phantom 페이지(PH1~PH7)에 있습니다.

### 처음 실행

1. 시작하기 창(D4)을 엽니다. 한 장의 카드에 세 단계가 있습니다.
   1. Claude Code 찾기: 찾으면 경로와 로그인 상태를 보여 주고 끝낸 단계로 표시합니다.
   2. 단축키: 기본값 ⌥ Space를 보여 줍니다. 등록에 실패하면 녹화 버튼을 보여 줍니다.
   3. 도구 고르기: 도구 탭(D2)과 같은 목록에서 고릅니다. 건너뛰어도 됩니다.
2. 아직 안 끝난 단계 하나가 주인공 카드(글로우)입니다. “Start”를 누르면 메뉴바 목록을 엽니다. “Set up later”는 시작하기 창을 닫습니다.
3. Claude Code를 못 찾으면 시작하기 창 아래에 안내 카드를 띄웁니다. 버튼은 Install guide, Choose file, Search again입니다. Claude Code 없이도 30자 이하 한 줄 입력은 그대로 들어갑니다.
4. 메뉴바에 아이콘을 표시합니다. 아이콘 옆 숫자는 **오늘 남은 할 일 수** 하나만 뜻합니다. 0이면 숫자를 숨깁니다. Dock에는 표시하지 않습니다.

### 할 일 넣기

1. 사용자가 단축키를 누르면 화면 가운데에 빠른 입력창이 열립니다. (B1)
2. 사용자가 생각을 적고 Enter를 누릅니다.
3. 입력이 한 줄이고 30자 이하면, 앱은 AI를 호출하지 않고 그대로 할 일 하나로 오늘 목록에 넣습니다. 이 할 일은 `isClear = false`로 저장합니다. 부르는 말이 들어 있으면 바로가기를 앱이 직접 연결합니다.
4. 그 외에는 확인 창이 열리고 “Claude is splitting your thought…”와 원래 문장을 표시합니다. 앱은 Claude Code를 호출합니다. (B2)
5. 응답이 오면 확인 창에 할 일 목록을 표시합니다. 각 할 일에는 제목, Today/Later/날짜, 연결된 바로가기, Clear/Unclear가 보입니다. 첫 번째 Unclear 할 일이 주인공 카드입니다. (B3)
6. 사용자는 제목을 고치거나, 할 일을 빼거나, 날짜와 바로가기를 바꿉니다.
7. 사용자가 “Add N tasks”를 누르면 할 일이 저장되고 창이 닫힙니다.
8. 메뉴바 목록 아래 입력 바도 같은 규칙을 씁니다. 짧으면 바로 넣고, 길면 확인 창을 엽니다.

### 오늘 보기

1. 사용자가 메뉴바 아이콘을 누르면 오늘 할 일 목록이 열립니다. 머리글은 “Today”와 날짜, 남은 수, 정리할 수입니다. 맨 위 할 일이 지금 할 일(Now 카드)이며 주인공 카드입니다. (A1)
2. 정리 안 된 할 일은 테마가 정한 방식으로 구분해서 표시합니다. 마우스를 올리면 “First step”이 보이고, 누르면 앱이 첫 행동을 요청하고 같은 창 안에 결과 카드를 띄웁니다. 주 버튼은 “Use this step” 하나이고, “Reshape”와 “Keep as is”는 텍스트 버튼입니다. 정보가 부족하면 질문 하나를 띄우고, 답하면 다시 요청합니다. 도구를 골라 빚는 흐름(C1, C2)은 7장입니다.
3. 바로가기가 연결된 할 일에는 시작 버튼이 보입니다. 사용자가 누르면 피그마가 열립니다.
4. 사용자가 할 일을 체크하면 끝낸 할 일로 바뀌고 목록 아래로 이동합니다. 테마에 완료 연출이 있으면 창 안에서 0.8초 동안 보여 줍니다. (PH4)
5. 사용자는 할 일을 끌어서 순서를 바꿉니다.
6. 목록 아래의 “Done”과 “Later” 묶음은 조용한 글자 링크입니다. Later는 접혀 있고, 사용자가 할 일을 오늘로 옮길 수 있습니다. 오늘 할 일을 다 끝내면 “All clear for today”를 보여 줍니다. (A3, A4)
7. 키보드로도 다룹니다. ↑↓ 이동, Space 체크, Enter 시작 버튼, ⌘⌫ 삭제, ⌘N 입력 바로 이동.

### 다음 날

1. 사용자가 그날 처음 목록을 열면, 앱은 할 날짜가 지났는데 끝나지 않은 할 일이 있는지 확인합니다.
2. 있으면 목록 맨 위에 “Bring these N tasks into today?” 카드를 띄웁니다. 이 카드가 주인공 카드가 되고, Now 카드는 글로우를 내려놓습니다. (A2)
3. 사용자가 가져오기를 고르면 할 날짜가 오늘로 바뀌고, 나중으로 고르면 할 날짜가 비워집니다.

## 4. 데이터는 할 일, 바로가기, 설정 세 가지면 충분합니다

사용자가 직접 입력하는 값은 제목뿐입니다. 나머지는 AI가 제안하거나 앱이 채웁니다. 모두 `~/Library/Application Support/todoBAN/data.json` 하나에 저장합니다. 저장할 때는 임시 파일에 쓴 뒤 이름을 바꿔서, 쓰는 도중에 앱이 꺼져도 파일이 깨지지 않게 합니다. 읽을 때는 zod 스키마로 검사합니다.

### TodoItem (할 일)

| 필드 | 타입 | 채우는 주체 | 설명 |
|---|---|---|---|
| id | string (UUID) | 앱 | 구분용 값입니다 |
| title | string | AI 제안, 사용자 수정 | “대상 + 동사” 형태의 한 줄입니다 |
| plannedDate | string \| null (YYYY-MM-DD) | AI 제안, 사용자 수정 | 할 날짜입니다. 비어 있으면 나중입니다 |
| order | number | 사용자(끌기) | 목록 순서입니다. 작을수록 위에 표시합니다. 우선순위 필드를 대신합니다 |
| completedAt | string \| null (ISO) | 앱(체크할 때) | 비어 있으면 끝나지 않은 할 일입니다 |
| createdAt | string (ISO) | 앱 | 만든 시각입니다 |
| rawText | string | 앱 | 빠른 입력에 적은 원래 문장입니다. AI가 나누면서 뜻이 빠졌는지 확인할 때 씁니다 |
| isClear | boolean | AI 판단, 사용자 수정 | 첫 행동이 정해졌는지 표시합니다. AI 없이 바로 넣은 짧은 입력은 false입니다 |
| shortcutId | string \| null | AI 제안, 사용자 수정 | 연결된 바로가기입니다. 비어 있으면 시작 버튼을 표시하지 않습니다 |

order는 두 할 일 사이에 끼워 넣을 때 앞뒤 값의 중간값을 씁니다. 그래서 다른 할 일의 값을 바꾸지 않아도 됩니다.

### Shortcut (바로가기)

| 필드 | 타입 | 설명 |
|---|---|---|
| id | string (UUID) | 구분용 값입니다 |
| name | string | 목록에 표시하는 이름입니다. 예: “포폴” |
| keywords | string[] | AI가 할 일과 연결할 때 비교하는 단어입니다. 예: 포폴, 포트폴리오, 덱 |
| url | string | 피그마 파일 또는 프레임 링크입니다 |
| appBundleId | string \| null | 링크를 열 앱입니다. 기본값은 `com.figma.Desktop`입니다. 비어 있으면 기본 브라우저로 엽니다 |

### Settings (설정)

| 필드 | 타입 | 설명 |
|---|---|---|
| hotkey | string | 기본값 `Alt+Space` |
| claudePath | string \| null | 찾았거나 사용자가 지정한 claude 경로 |
| model | string \| null | 비어 있으면 claude 기본 모델 |
| themeId | string | 기본값 `default` |
| openAtLogin | boolean | 로그인할 때 열기 |
| lastCarryOverCheck | string \| null | 마지막으로 “어제 못 끝낸 할 일”을 확인한 날짜 |
| tools | ToolSettings | 첫 행동을 빚을 때 쓸 도구와 기본 비율 (7장). v0.3에서 추가 |

### ToolSettings (도구 설정, v0.3에서 추가)

| 필드 | 타입 | 설명 |
|---|---|---|
| local | { figma, calendar, files, todoban: boolean } | LOCAL 도구 켜기/끄기. 기본값 figma·todoban true, calendar·files false (캘린더와 파일은 맥 권한을 받은 뒤 켬) |
| mcp | { id: string, server: string, enabled: boolean }[] | 켜 둔 MCP 도구. `server`는 `claude mcp list`에 나오는 서버 이름. 예: `{ id: "gmail", server: "claude.ai Gmail", enabled: true }` |
| defaultMix | Record<string, number> | 출처별 기본 비율(%). 합은 100이고 `claude` 몫(일반 지식)을 포함. 예: `{ figma: 30, calendar: 15, gmail: 20, todoban: 15, claude: 20 }` |

데이터 파일의 `version`을 2로 올리고, 읽을 때 `tools`가 없으면 기본값을 채웁니다.

우선순위, 프로젝트, 태그, 마감 시각, 반복, 하위 할 일은 넣지 않습니다. 필드가 하나 늘 때마다 할 일을 넣을 때 정해야 할 것이 하나 늘어나기 때문입니다.

## 5. AI는 맥에 로그인된 Claude Code를 앱이 직접 실행해서 씁니다

앱은 API 키를 쓰지 않습니다. 맥에 설치되고 구독 계정으로 로그인된 Claude Code CLI를 Electron 메인 프로세스에서 `child_process.spawn`으로 실행하고, 결과를 JSON으로 받습니다. 사용량은 Claude 구독에서 차감됩니다.

### 호출 방법

```
cwd: ~/Library/Application Support/todoBAN/claude
stdin: <요청 본문 JSON>
claude -p --output-format json --tools "" --setting-sources project --no-session-persistence --model sonnet
```

- `-p`는 대화창 없이 요청 하나에 답 하나를 받는 모드입니다. 요청 본문은 인자가 아니라 표준 입력으로 보내서, 따옴표나 줄바꿈 때문에 명령이 깨지지 않게 합니다.
- `--output-format json`이면 CLI가 결과를 JSON 객체 하나로 돌려줍니다. 앱은 그 안의 `result` 문자열을 꺼내 다시 JSON으로 파싱합니다. `result` 앞뒤에 코드 블록 표시(```)가 있으면 제거한 뒤 파싱합니다.
- `split`과 `firstStep`에서는 도구 사용을 `--tools ""`로 모두 막습니다. (2.1.304에서 확인) MCP 도구를 여는 호출은 7장의 `collect` 하나뿐입니다.
- `--setting-sources project --no-session-persistence`를 붙여 이 맥의 전역 설정과 플러그인 훅을 읽지 않게 합니다. 0단계에서 응답 시간이 11.5초에서 7.0초로 줄었습니다.
- `--bare`는 쓰지 않습니다. 구독 로그인(OAuth)을 읽지 않고 API 키만 쓰기 때문입니다.
- 모델은 `--model sonnet`으로 고정합니다. 0단계에서 가장 빠르고(평균 6.5초) 편차가 작았고, haiku는 더 빠르지 않았습니다. CLI 시작 시간이 대부분을 차지하기 때문입니다.
- 대화를 이어가는 방식(`--resume`)은 쓰지 않습니다. 예전 할 일을 기억하는 장점보다, 대화가 길어질수록 응답이 느려지고 사용량이 늘어나는 단점이 더 크기 때문입니다.

### 전용 폴더와 CLAUDE.md

앱은 처음 실행할 때 `~/Library/Application Support/todoBAN/claude/` 폴더를 만들고 그 안에 CLAUDE.md를 씁니다. 모든 호출은 이 폴더를 작업 폴더로 실행하므로, Claude Code는 매번 같은 규칙을 읽습니다. 규칙을 바꾸고 싶으면 이 파일만 고칩니다. (설정 화면의 “규칙 파일 열기”)

CLAUDE.md 초안:

```markdown
# 할 일 정리 규칙

너는 한 사람의 할 일 목록을 대신 정리한다. 요청 본문의 type에 따라 답한다.
반드시 JSON만 출력한다. 설명, 인사, 코드 블록 표시는 쓰지 않는다.

## 제목 규칙
- 25자 이내, "대상 + 동사" 형태로 끝낸다. 예: "포폴 올리브영 장표 지표 문장 고치기"
- 인사, 배경 설명, 존댓말은 뺀다.
- 무엇부터 할지 제목만 보고 알 수 있으면 isClear는 true, 아니면 false다.
  예: "포폴 손보기" false, "포폴 3번 장표 지표 문장 고치기" true

## 날짜 규칙
- "오늘", "내일", "금요일까지" 같은 말이 있으면 today 기준으로 plannedDate를 YYYY-MM-DD로 쓴다.
- 날짜 말이 없으면 plannedDate는 오늘이다. "언젠가", "나중에"면 null이다.

## 바로가기 규칙
- 요청 본문의 shortcuts 중 keywords와 뜻이 맞는 것이 있으면 그 name을 shortcut에 쓴다. 없으면 null이다.

## type: split
입력: {"type":"split","today":"YYYY-MM-DD","text":"...","shortcuts":[{"name":"포폴","keywords":["포폴","포트폴리오"]}]}
출력: {"tasks":[{"title":"","plannedDate":"YYYY-MM-DD" 또는 null,"isClear":true,"shortcut":"포폴" 또는 null}]}

## type: firstStep
입력: {"type":"firstStep","today":"YYYY-MM-DD","title":"면접 준비","rawText":"...","answer":null 또는 "사용자 답","previous":["이미 제안한 첫 행동"],"shortcuts":[...],
      "words":["면접","토스","PO"] 또는 생략,"minutes":30 또는 생략,
      "context":[{"source":"gmail","label":"Re: 토스 PO 서류 합격 안내","text":"요약 400자 이내","weight":20}] 또는 생략}
출력: {"title":"첫 행동 제목" 또는 null,"question":"질문 하나" 또는 null,"shortcut":"포폴" 또는 null,
      "minutes":30 또는 null,"sources":[{"source":"gmail","label":"질문 3개 · 합격 안내 메일","weight":20}]}
- 첫 행동을 정할 수 있으면 title을 쓰고 question은 null이다.
- 정할 수 없으면 title은 null이고 question에 질문 하나만 쓴다.
- 하위 할 일 목록을 만들지 않는다. 첫 행동은 항상 하나다.
- words가 있으면 그 말을 title에 최대한 그대로 쓴다.
- minutes가 있으면 그 시간 안에 끝나는 크기로 고른다.
- context가 있으면 weight가 큰 자료를 더 많이 참고하고, 실제로 쓴 자료만 sources에 적는다.
  context에 없는 사실(메일 내용, 일정, 파일 이름)을 지어내지 않는다.
```

`type: theme`은 v1.1에서 추가합니다. (11장)

### claude 실행 파일 찾기

맥 앱은 터미널의 PATH 설정을 읽지 않습니다. 그래서 앱이 아래 순서로 직접 찾고, 찾은 경로를 저장합니다.

1. 설정 화면에서 사용자가 지정한 경로
2. `~/.local/bin/claude` (이 맥에서 확인한 위치), `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, `~/.claude/local/claude`
3. `/bin/zsh -lc "command -v claude"`의 출력

프로세스를 실행할 때는 환경 변수 PATH에 `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`을 추가합니다. npm으로 설치한 Claude Code는 node를 찾아야 실행되기 때문입니다.

### 오류 처리

어떤 오류가 나도 사용자가 입력한 내용은 사라지지 않아야 합니다. 빠른 입력 원문은 claude를 호출하기 전에 먼저 저장해 둡니다.

| 상황 | 앱의 동작 | 시안 |
|---|---|---|
| claude를 찾지 못함 | 시작하기 창이나 설정 화면에서 경로를 입력하게 안내합니다 | D4 |
| 로그인이 안 되어 있음 (JSON의 `is_error`가 true이거나 오류 메시지에 로그인 안내가 있음) | 터미널에서 claude를 실행해 로그인하라고 안내합니다 | B4 |
| 60초 안에 응답이 없음 | 프로세스를 종료하고 다시 시도 버튼을 보여 줍니다 | B4, PH7 |
| 결과 JSON 파싱 실패 | 원래 문장 첫 줄을 제목으로 하는 정리 안 된 할 일 하나를 확인 창에 넣습니다 | B4 |

## 6. 시작 버튼은 피그마 데스크톱 앱에서 지정한 프레임을 엽니다

바로가기는 사용자가 설정 화면에서 한 번 등록합니다. 이후 AI가 빠른 입력 내용과 바로가기의 keywords를 비교해 할 일에 연결합니다. (시안 D3)

### 등록

1. 사용자가 피그마에서 작업할 프레임을 선택하고 “링크 복사”를 합니다. 복사한 링크에는 node-id가 포함되어 있어 해당 프레임을 가리킵니다.
2. 설정 화면의 바로가기 탭에서 “Add”를 누르고 이름, 부르는 말(Called), 링크를 입력합니다. 링크에 node-id가 있으면 “Has a node-id — opens right at this frame”이라고 알려 줍니다. 이 시트가 설정 창의 주인공 카드입니다.

### 열기

1. 사용자가 시작 버튼을 누릅니다.
2. 앱이 `open -b com.figma.Desktop <링크>`를 실행합니다. 번들 ID `com.figma.Desktop`은 이 맥에서 확인했습니다.
3. 실패하면(피그마 앱이 없으면) `shell.openExternal(<링크>)`로 기본 브라우저에서 엽니다.

### AI 연결 규칙

- 앱은 호출할 때마다 바로가기의 name과 keywords만 요청 본문에 넣습니다. 링크는 보내지 않습니다.
- AI가 돌려준 shortcut 이름이 바로가기 목록에 없으면 앱은 연결하지 않습니다.
- 확인 창에서 사용자가 바로가기를 바꾸거나 해제할 수 있습니다.

## 7. 첫 행동은 내 말과 내 도구로 빚습니다

“면접 준비”에 일반적인 AI는 “면접 예상 질문 리스트 정리하기”라고 답합니다. todoBAN은 합격 메일에 적힌 질문, 금요일 일정, 포폴 덱 프레임처럼 **내 자료**에서 첫 행동을 만듭니다. 이 흐름은 메뉴바 목록 창 안에서 두 화면으로 진행합니다. (시안 C1, C2)

### 흐름

1. 정리 안 된 할 일을 누르면 C1 “Shape with your tools”가 열립니다. 위에 할 일 제목이 보입니다.
2. **01 Your words**: 할 일 제목과 원문(rawText)을 낱말로 나눠 칩으로 보여 줍니다. 사용자가 꼭 쓰고 싶은 말을 누르면 흰 칩이 됩니다. 조사와 흔한 말(“해야”, “되고”)은 앱이 미리 꺼 둡니다.
3. **02 Your tools**: 도구 탭에서 켠 도구마다 카드 하나를 보여 줍니다. 카드에는 그 도구에서 찾은 자료 한 줄(예: “Toss PO interview · Fri 2 PM”)과 LOCAL/MCP 배지가 있습니다. 사용자가 토글로 이번에 쓸 도구를 고릅니다.
4. **03 How big?**: 부채꼴 다이얼로 크기를 고릅니다. 5 min, 15 min, 30 min, 1 hour, 2 hours. 기본값은 캘린더에 맞는 일정이 있으면 남은 날로 정하고(1일 이하 15 min, 3일 이하 30 min, 그 외 1 hour), 없으면 30 min입니다. 다이얼 위에 근거(“FROM CALENDAR · 3 DAYS LEFT”)를 보여 줍니다.
5. **04 Mix by source**: 고른 도구와 Claude(일반 지식)의 비율 막대입니다. 칸 경계를 끌어서 바꿉니다. 처음 값은 도구 탭의 기본 비율을 고른 도구만으로 다시 나눈 값입니다.
6. “Shape it”을 누르면 `firstStep` 요청을 보냅니다. 응답이 오면 C2 결과 카드를 보여 줍니다.
7. C2 결과 카드(주인공): 첫 행동 제목, 크기와 마감 배지(“30 MIN · BEFORE FRI 2 PM”), “Made from” 목록(출처, 자료 한 줄, 비율), 쓴 낱말 칩입니다. 아래에는 “Swap into today” 토글, 대표 자료 열기 버튼(“Open mail”, 피그마면 바로가기 열기), “Reshape”가 있습니다.
8. “Use this step”(목록 안 카드) 또는 C2의 확정은 지금처럼 `applyFirstStep`으로 할 일 제목을 바꿉니다. Swap into today가 켜져 있으면 할 날짜도 오늘로 바꿉니다.

목록의 “Let Claude find a first step” 알약과 Enter는 C1을 건너뛰고 기본값(낱말 없음, 켠 도구 전부, 기본 크기, 기본 비율)으로 바로 요청합니다.

### LOCAL 도구: 앱이 맥 안에서 직접 읽습니다

LOCAL 도구는 Claude 권한이 필요 없고 1초 안에 끝나야 합니다. 앱이 읽은 결과는 **제목 한 줄과 짧은 요약만** 요청 본문 `context`에 넣습니다. 링크와 파일 내용은 보내지 않습니다.

| 도구 | 읽는 방법 | 넣는 내용 | 맥 권한 |
|---|---|---|---|
| Figma | 등록한 바로가기 중 낱말과 부르는 말이 맞는 것 | 바로가기 이름과 frame 표시(“포폴 덱 · frame 12-408”) | 없음 |
| Calendar | `osascript -l JavaScript`로 캘린더 앱의 앞으로 7일 일정을 읽고, 낱말이 제목에 들어간 일정을 고름. 결과는 10분 동안 기억 | 일정 제목, 날짜·시각 | 자동화(캘린더) 허용. 처음 켤 때 macOS가 묻습니다 |
| Files | `mdfind`로 최근 7일에 연 문서 중 이름에 낱말이 들어간 것 | 파일 이름만 | 없음 |
| todoBAN | data.json의 끝낸 할 일과 나중 할 일 중 낱말이 들어간 것 | 할 일 제목, 끝낸 날짜 | 없음 |

피그마 “최근 파일”은 피그마 API 토큰이 필요해서 v1에서는 등록한 바로가기만 씁니다.

### MCP 도구: Claude가 읽기 전용으로 읽습니다

Gmail, Notion, Linear처럼 앱이 직접 못 읽는 서비스는 사용자가 Claude Code에 연결해 둔 MCP 서버로 읽습니다. 도구가 열리는 호출을 **`collect` 하나로 모아서**, 느린 시간과 권한 범위를 그 안에 가둡니다. 첫 행동을 만드는 `firstStep` 호출에는 여전히 도구를 열지 않습니다.

1. C1이 열리면 앱은 켜 둔 MCP 도구마다 `collect` 요청을 바로 보냅니다. 그동안 카드에 로딩 표시를 보여 주고, 사용자는 낱말과 크기를 고릅니다.
2. `collect`는 낱말로 검색해 가장 맞는 자료 하나를 제목 한 줄과 요약(400자 이내)으로 돌려줍니다. 결과가 오면 카드에 보여 줍니다.
3. 사용자가 “Shape it”을 누를 때 `collect`가 안 끝났으면, 카드에 “Still reading…”을 보여 주고 버튼을 “Shape it · waiting for Notion”으로 바꿔 끝날 때까지 기다립니다. 15초를 넘기면 그 도구를 빼고 진행할 수 있게 “Skip Notion”을 보여 줍니다. (7-a 측정 평균 10초, 최대 13초)
4. 실패하면(연결 끊김, 시간 초과) 그 카드만 “Couldn't read Gmail”로 바꾸고 나머지 도구로 진행합니다.

호출 방법 (7-a에서 확인):

```
cwd: ~/Library/Application Support/todoBAN/claude
stdin: {"type":"collect","source":"notion","words":["면접","포트폴리오"],"today":"YYYY-MM-DD"}
claude -p --output-format stream-json --verbose --no-session-persistence --model sonnet \
  --setting-sources user,project --tools ToolSearch \
  --permission-mode dontAsk --allowedTools ToolSearch mcp__claude_ai_Notion__notion-search mcp__claude_ai_Notion__notion-fetch
```

- **`--setting-sources user,project`**: claude.ai 커넥터(Gmail, Notion, Linear …)는 user 설정에서만 보입니다. `project`나 `project,local`만 주면 MCP 서버가 하나도 뜨지 않습니다. `project`는 전용 폴더의 CLAUDE.md(collect 규칙)를 읽으려고 함께 줍니다. `split`과 `firstStep`은 지금처럼 `project`만 씁니다.
- **`--tools ToolSearch`**: 내장 도구(Bash, 파일, 웹)는 모두 막고, MCP 도구를 불러오는 ToolSearch 하나만 엽니다. `--tools ""`로 ToolSearch까지 막으면 MCP 도구가 지연 로드 상태라 부를 수 없습니다. `ENABLE_TOOL_SEARCH=false`로 MCP 도구를 처음부터 다 싣는 방법은 도구 222개가 프롬프트에 들어가서 더 느렸습니다(평균 15.7초).
- **`--permission-mode dontAsk` + `--allowedTools`**: 목록에 없는 도구는 묻지 않고 막힙니다. 서비스별 **읽기 도구 이름만** 앱에 고정해 두고 적습니다. 쓰기 도구는 목록에 넣지 않는 것만으로 막히므로 `--disallowedTools`는 쓰지 않습니다. (목록 밖의 `notion-get-users`를 부르게 했을 때 `permission_denials`로 막힌 것을 확인)
- **`stream-json`**: 첫 줄(init)에 서버별 상태(`connected`, `pending`, `needs-auth`, `failed`)가 있어서, 결과가 비었을 때 연결 문제인지 자료가 없는지 구분합니다. `pending`이어도 호출 중에 연결되어 정상 동작했습니다.

서비스별 읽기 도구 (앱에 고정):

| 서비스 | 서버 이름 | 여는 도구 | 확인 |
|---|---|---|---|
| Notion | `claude.ai Notion` | `notion-search`, `notion-fetch` | 7-a에서 3번 성공 |
| Linear | `claude.ai Linear` | `list_issues`, `get_issue` | 7-a에서 1번 성공 (해당 이슈 없음) |
| Gmail | `claude.ai Gmail` | 미정 | 이 맥에서 `needs-auth`. Claude Code 안에서 다시 인증한 뒤 도구 이름을 확인합니다 |
| Google Calendar | `claude.ai Google Calendar` | 미정 | 이 맥에서 `needs-auth`. LOCAL 캘린더(osascript)를 먼저 씁니다 |

CLAUDE.md에 추가할 규칙:

```markdown
## type: collect
입력: {"type":"collect","source":"gmail","words":["면접","토스"],"today":"YYYY-MM-DD"}
출력: {"items":[{"label":"Re: 토스 PO 서류 합격 안내","text":"요약 400자 이내","date":"YYYY-MM-DD" 또는 null}]}
- source에 해당하는 MCP 도구만 쓴다. 읽기만 하고 보내기, 만들기, 고치기는 하지 않는다.
- words와 가장 맞는 자료를 최대 1개 고른다. 없으면 items는 빈 배열이다.
- text는 첫 행동을 정하는 데 필요한 사실만 쓴다. 개인정보(전화번호, 주소)는 빼고 쓴다.
```

### 출처별 비율

- 비율은 Claude에게 주는 참고 값입니다. 정확히 그 비율로 섞인다는 보장은 없으므로, C2에는 Claude가 돌려준 `sources[].weight`를 보여 줍니다.
- `claude` 몫은 일반 지식입니다. 막대에서 점선 칸으로 표시하고 최소 10%입니다.
- 고른 도구가 하나도 없으면 비율 막대를 숨기고 지금의 firstStep과 같게 동작합니다.

### 무엇이 Claude에게 가는지

- 사용자가 C1에서 켠 도구의 자료 한 줄과 요약만 갑니다. 끈 도구는 읽지도 않습니다.
- LOCAL 자료의 링크, 파일 경로, 파일 내용은 보내지 않습니다.
- MCP 도구는 Claude가 직접 읽으므로, 그 서비스의 자료는 Claude 쪽에서 처리됩니다. 도구 탭에 이 차이를 한 줄로 안내합니다(D2 아래 안내).

### 설정 → 도구 탭 (D2)

- LOCAL · FAST 묶음: Figma, Calendar, Files, todoBAN. 각 행에 설명, LOCAL 배지, 토글.
- MCP · READ ONLY · ~10S 묶음: 앱이 고정해 둔 서비스(Notion, Linear, Gmail)만 보여 줍니다. 연결된 서비스는 MCP 배지와 토글, 아닌 서비스는 “Connect” 버튼입니다. Connect는 터미널을 열고 Claude Code 안에서 `/mcp`로 인증하라고 안내합니다. 앱이 직접 OAuth를 하지 않습니다.
- 연결 상태는 두 단계로 판단합니다. 설정을 열 때 `claude mcp list`(약 11초, 한 줄에 `이름: 주소 - ✔ Connected` / `! Needs authentication` / `✘ Failed to connect`)를 백그라운드로 읽어 먼저 표시하고, collect를 실행했을 때 init의 상태가 `needs-auth`면 그 값으로 바꿉니다. **`mcp list`가 Connected라고 해도 print 모드에서는 `needs-auth`일 수 있습니다**(이 맥의 Gmail, Google Calendar).
- DEFAULT MIX: 출처별 기본 비율 막대.

### 오류 처리

| 상황 | 앱의 동작 |
|---|---|
| LOCAL 도구가 1초 안에 안 끝남 | 그 도구만 빼고 진행합니다. 카드에 “Took too long”을 보여 줍니다 |
| 캘린더 권한 거부 | 토글을 끄고 “Allow Calendar in System Settings” 안내를 보여 줍니다 |
| MCP 서버가 목록에 없음 | 도구 탭에서 Connect 버튼으로 바꾸고, C1 카드는 숨깁니다 |
| `collect` 시간 초과(30초) | 그 카드만 실패로 표시하고 나머지로 진행합니다 |
| init 상태가 `needs-auth` | 카드를 “Sign in to Notion in Claude Code”로 바꾸고 도구 탭의 상태도 바꿉니다 |
| `firstStep` 응답의 sources에 보내지 않은 출처가 있음 | 그 항목은 버리고 보여 주지 않습니다 |

## 8. Electron 메뉴바 앱으로 만듭니다

| 항목 | 선택 | 이유 |
|---|---|---|
| 런타임 | Electron (최신 안정판), Node 24 | 이 맥에 Node 24가 있고, Xcode 없이 빌드할 수 있습니다 |
| UI | React + TypeScript + Vite (electron-vite) | 화면을 고치면 실행 중인 앱에 바로 반영됩니다 |
| 메뉴바 목록 | `Tray` + 아이콘 아래에 띄우는 `BrowserWindow`(frame: false, transparent: true, hasShadow: false) | 테마가 사각형이 아닌 모양을 그릴 수 있게 투명 창을 씁니다. 그림자는 창 안에 CSS로 그립니다 |
| 빠른 입력창 | `BrowserWindow`(frame: false, transparent: true, alwaysOnTop, 모든 데스크톱에서 보임), 포커스를 잃으면 닫힘 | Spotlight처럼 다른 앱 위에 열려야 합니다. 배경을 어둡게 하지 않습니다 |
| 전역 단축키 | `globalShortcut` | 녹화 UI는 설정 화면에 직접 만듭니다 |
| 저장 | JSON 파일 + zod (4장) | 네이티브 모듈 빌드가 필요 없습니다 |
| AI 호출 | `child_process.spawn` + `claude -p` (5장) | |
| Dock 아이콘 | `app.dock.hide()` | 메뉴바에서만 쓰는 앱입니다 |
| 로그인할 때 열기 | `app.setLoginItemSettings` | 설정에서 끄고 켭니다 |
| 글꼴 | 기본 테마는 SF Pro(시스템)와 한글 Pretendard, 숫자·라벨은 SF Mono(시스템). Phantom용 Black Han Sans, Anton, Noto Serif KR은 앱에 내장 (모두 OFL) | 테마가 고를 수 있는 글꼴을 앱이 정합니다. 시안의 Geist Mono는 내장하지 않고 SF Mono로 대신합니다 |
| 아이콘 | [Mono Icons](https://icons.mono.company) (MIT, `mono-icons` 1.3.1)의 SVG를 React 컴포넌트로 감싸서 씁니다. 16px, 면으로 채운 외곽선 스타일. 예외: AI ✦는 자체 SVG `AiSparkle`, 터미널·⌘·로더는 Mono에 없어서 Lucide | 피그마 아이콘 컴포넌트도 Mono 원본 경로로 만들어서 디자인과 코드가 같은 아이콘을 씁니다 |
| 패키징 | 개발 중에는 `npm run dev`, 매일 쓸 때는 electron-builder `--dir`로 서명 없이 로컬 빌드 | 내 맥에서만 씁니다 |

### 폴더 구조 제안

```
src/
  main/                    // Electron 메인 프로세스
    index.ts               // 앱 진입점, Tray, 창 만들기, 단축키 등록
    windows.ts             // 메뉴바 목록, 빠른 입력, 확인 창, 설정 창 (크기 고정)
    store.ts               // data.json 읽기·쓰기, zod 스키마
    claude/
      client.ts            // claude 실행, 시간 제한, JSON 파싱, 오류 분류
      setup.ts             // 전용 폴더와 CLAUDE.md 생성, 실행 파일 찾기
    shortcutOpener.ts      // 피그마 열기
    ipc.ts                 // 렌더러와 주고받는 채널
  preload/index.ts
  renderer/
    windows/               // TodayList, QuickInput, Review, Settings
    components/            // TaskRow, Chip, Button …
    theme/
      schema.ts            // 테마 JSON 스키마(zod)
      apply.ts             // 테마 → CSS 변수
      themes/default.json
      themes/phantom.json
  shared/types.ts          // TodoItem, Shortcut, Settings
docs/kickoff.md            // 이 문서
scripts/claude-probe.ts    // 0단계 측정 스크립트
```

## 9. 디자인

디자인은 Figma 파일 하나에 있습니다: https://www.figma.com/design/uLkrdQtbosV1DMYSYHsYeB

| 페이지 | 내용 |
|---|---|
| todoBAN · Full flow | **기준 시안.** 다크 글래스 기본 테마의 A1~D4 열여섯 장과 “Glow hierarchy” 범례 |
| List v4 | Full flow의 C1, C2를 처음 그린 페이지 |
| Foundations, Components, Prototype | v0.2 밝은 테마 시안. 더 이상 기준이 아닙니다 |
| Prototype · Phantom | 페르소나풍 실험 테마. Phantom Kit과 PH1~PH7 |

코드의 값은 `src/renderer/src/theme/default.css`의 CSS 변수에 모읍니다.

### 디자인 원칙 (v0.3, 2026-10-20)

- 바탕은 거의 검정(`#07080A`~`#15181D`)이고, 면은 흰색 투명도로 만든 글래스입니다. 초록빛이 도는 검정은 쓰지 않습니다.
- 강조색은 파랑 그라데이션(`#2F6BFF → #6FA6FF`) 하나입니다. 체크, 토글, 선택된 칸, 정리 필요 점, AI ✦에 씁니다. 주황(`#FF6A2A`)은 다이얼 바늘, 마감 배지, MCP 배지, 오류 아이콘에만 씁니다. 초록(`#34C08A`)은 “찾음/연결됨” 상태에만 씁니다. 보라, 핑크, 노랑은 쓰지 않습니다.
- **글로우 위계.** 파란 안쪽 글로우(아래쪽, y −18, 반경 42, 32%)는 위계를 나누는 데만 씁니다. 바깥으로 번지는 글로우는 쓰지 않습니다.

  | 단계 | 대상 | 모습 |
  |---|---|---|
  | L0 창 | 메뉴바 목록 카드, 확인 창, 설정 창 | 글로우 없음. 위쪽 1px 흰 하이라이트, 흰 16% 테두리, 그림자 |
  | L1 주인공 카드 | 화면마다 하나. 사용자가 지금 결정할 카드 | 파란 안쪽 글로우, 아래쪽이 파래지는 그라데이션 테두리, 12px 점 격자 |
  | L2 주요 동작 | 목록 아래 입력 바 | 글로우 대신 파란 그라데이션 테두리 |
  | L3 나머지 | 할 일 행, 설정 묶음, 안내 카드 | 흰 7%→3% 글래스, 흰 10% 테두리 |

  예외: 빠른 입력창은 창 자체가 주인공이라 L1으로 그립니다.
- 주인공이 둘 생기면 앞의 것만 남깁니다. 메뉴바 목록은 어제 할 일 카드 > 첫 행동 카드 > Now 카드 순서, 확인 창은 첫 번째 Unclear 할 일입니다. CSS `:has()`와 형제 선택자로 처리합니다.
- 버튼은 세 가지입니다. 주 버튼은 흰 알약과 검정 글씨(한 화면에 하나), 보조 버튼은 글래스 알약, 조용한 동작(Later, Keep as is)은 글자 버튼입니다.
- 한 줄 결정은 알약 질문 + 파란 토글로 묻습니다. 예: “Shape a first step after adding?”, “Open in Figma app”.
- 라벨, 날짜, 개수, 키 표시는 대문자 모노 글꼴 10px입니다. 예: `TUE · OCT 20`, `3 SHORTCUTS`, `FROM YESTERDAY`.
- 글씨 투명도: 본문 100%, 보조 55%, 라벨 45%, 끝낸 할 일 35% + 취소선. 정리 안 된 할 일은 55%와 파란 점입니다.
- 모서리: 창 20, 주인공 카드·묶음 16, 행 14, 입력 10, 버튼·칩·토글 full.
- 간격: 4px 배수. 창 가장자리 12~24, 행 사이 6, 묶음 사이 20.
- 문구는 영어이고 짧게 씁니다. 사용자를 탓하는 말은 쓰지 않습니다. 할 일 제목과 예시(“포폴”)는 사용자가 쓴 말 그대로 둡니다.
- 앱 내부 규칙(30자 기준 등)은 설명하지 않고, 입력에 따라 바뀌는 힌트로만 보여 줍니다.

### 시안에는 있지만 코드에 아직 없는 것

| 시안 | 내용 | 언제 |
|---|---|---|
| A1 머리 | Done/Today/Later 부채꼴 다이얼과 비율 막대(완료·오늘·첫 행동 대기) | 7장 작업 뒤 일주일 사용 중 필요하면 |
| B3 | Today/Later를 알약 토글로, “Shape a first step after adding?” 알약, 3칸 비율 막대 | 7-b |
| C1, C2 | 첫 행동 빚기 전체 | 7-b, 7-c |
| D1 | “Split long thoughts with Claude”, “Ask about yesterday's tasks” 스위치. 모델 부채꼴 다이얼(지금은 세 칸 선택 버튼) | 설정 값이 없어서 보류 |
| D2 | 도구 탭 | 7-b, 7-c |
| D4 | 시작하기 창 | 7-d |
| 설정 Theme 탭 | 테마 고르기 | 11장 |

## 10. Claude 호출부터 확인하고, 화면은 그다음에 만듭니다

가장 불확실한 부분은 앱에서 claude -p를 실행했을 때 제대로 응답이 오는지와 몇 초가 걸리는지입니다. 그래서 0단계에서 이것부터 확인합니다. 각 단계는 완료 기준을 모두 확인하고 커밋한 뒤 멈추고, 승인을 받은 다음에 넘어갑니다.

| 단계 | 할 일 | 완료 기준 |
|---|---|---|
| 0 | `scripts/claude-probe.ts`로 split 요청을 보냅니다. 기본 모델·가벼운 모델 × `--bare` 사용 여부를 비교합니다 | 예시 문장 3개에서 할 일 JSON이 파싱됩니다. 조건마다 응답 시간을 3번 재서 이 문서에 기록했습니다 |
| 1 | electron-vite 프로젝트, Tray와 메뉴바 목록 창, data.json 저장, 직접 추가, 체크, 끌어서 순서 변경을 만듭니다. 화면 값은 처음부터 CSS 변수로 쓰고 기본 테마를 적용합니다 | 앱을 다시 실행해도 할 일과 순서가 유지됩니다 |
| 2 | 빠른 입력창과 전역 단축키를 만듭니다 | 다른 앱을 쓰는 중에 ⌥ Space로 입력창이 열립니다. 30자 이하 한 줄은 바로 오늘 목록에 들어갑니다 |
| 3 | 확인 창을 만들고 split 요청과 오류 처리를 연결합니다 | 긴 입력이 할 일 여러 개로 나뉘어 확인 창에 보입니다. claude 경로를 틀리게 해도 입력한 내용이 사라지지 않습니다 |
| 4 | 정리 안 된 할 일 표시와 firstStep 요청을 연결합니다 | 정리 안 된 할 일이 구분되어 보입니다. 누르면 첫 행동이나 질문 하나가 나오고, 답하면 첫 행동이 제안됩니다 |
| 5 | 바로가기 설정과 피그마 열기를 만듭니다 | “포폴” 바로가기를 등록한 뒤 “포폴 장표 고쳐야 함”을 입력하면 바로가기가 연결됩니다. 시작 버튼을 누르면 피그마 앱에서 지정한 프레임이 열립니다 |
| 6 | 어제 못 끝낸 할 일 가져오기를 만듭니다 | plannedDate가 어제인 할 일을 만들어 두고 목록을 열면 가져오기 질문이 나옵니다 |
| 6.5 | 기본 디자인을 다크 글래스로 바꿉니다 (v0.3) | 네 창이 Full flow 시안의 색, 글래스 단계, 글로우 위계, 영어 문구를 따릅니다. 주인공 카드가 화면마다 하나입니다. 스냅숏으로 확인했습니다 |
| 7-a | `scripts/collect-probe.ts`로 collect를 측정합니다 ✅ | 어떤 설정에서 claude.ai 커넥터가 보이는지, `--allowedTools`로 읽기 도구만 열리는지, `claude mcp list` 출력 형식, collect 응답 시간 3번을 이 문서에 기록했습니다. Gmail은 인증이 필요해서 Notion으로 쟀습니다 |
| 7-b | LOCAL 도구, C1·C2 화면, 도구 탭, firstStep 요청 확장 | “면접 준비”에서 낱말·도구·크기·비율을 고르면 그 자료가 들어간 첫 행동이 나오고, C2에 출처별 비율이 보입니다. 도구를 다 끄면 지금의 firstStep과 같게 동작합니다 |
| 7-c | MCP collect를 연결합니다 | Notion을 켜면 C1 카드에 페이지 한 줄이 채워지고, 연결을 끊어도 나머지 도구로 첫 행동이 나옵니다. 쓰기 도구는 열리지 않습니다. Gmail은 인증 후 같은 기준으로 확인합니다 |
| 7-d | 시작하기 창(D4) | data.json이 없는 상태로 실행하면 시작하기 창이 열리고, Claude Code를 못 찾는 경우 안내 카드가 보입니다 |
| 8 | Phantom 테마를 만들고 설정 Theme 탭에서 테마를 바꿀 수 있게 합니다 | 설정에서 Phantom을 고르면 네 창이 모두 바뀌고, 창 크기는 그대로입니다. 다시 실행해도 선택이 유지됩니다 |
| 9 | 일주일 동안 매일 씁니다 | 매일 넣은 할 일 수, 정리 안 된 할 일 수, 시작 버튼을 누른 횟수, 첫 행동에 도구를 쓴 횟수를 기록했습니다 |

### 0단계 측정 결과 (2026-10-20)

`scripts/claude-probe.ts`, 예시 문장 3개 × 조건 4개. 12번 모두 JSON 파싱에 성공했습니다.

| 조건 | 성공 | 평균 | 최대 |
|---|---|---|---|
| A 기본 (`-p --output-format json --tools ""`) | 3/3 | 11.5s | 14.6s |
| B A + `--setting-sources project --no-session-persistence` | 3/3 | 7.0s | 8.4s |
| C B + `--model sonnet` | 3/3 | 6.5s | 6.8s |
| D B + `--model haiku` | 3/3 | 6.9s | 9.2s |

- 나누기 품질은 네 조건이 거의 같았습니다. 날짜(내일, 금요일까지, 언젠가)와 바로가기(포폴, 사일로)를 모두 맞게 채웠습니다.
- 확인할 점: “포트폴리오 사이트 도메인 알아보기”가 키워드 “포트폴리오” 때문에 포폴 바로가기에 연결됐습니다. 확인 창에서 바꿀 수 있으니 일주일 사용 중에 얼마나 자주 생기는지 봅니다.
- `isClear` 판단은 같은 문장에서도 조건마다 조금씩 달랐습니다(예: “운동 루틴 다시 짜기”). 확인 창에서 사용자가 고칠 수 있어서 문제는 아닙니다.
- 6~7초가 걸리므로 확인 창의 “나누는 중” 화면은 꼭 필요합니다. 10초가 넘으면 “조금 오래 걸리고 있어요”를 띄웁니다.

### 7-a 측정 결과 (2026-10-20)

`scripts/collect-probe.ts`, Claude Code 2.1.304, 모델 sonnet. 자료 내용은 기록하지 않고 시간과 상태만 봤습니다.

| 조건 | 결과 | 평균 | 최대 |
|---|---|---|---|
| `--setting-sources project` (split과 같은 설정) | MCP 서버 0개. collect 불가 | - | - |
| `--setting-sources project,local` | MCP 서버 0개 | - | - |
| `--setting-sources user`, `--tools ToolSearch` | Notion 성공 1/1 | 7.5s | 7.5s |
| **`--setting-sources user,project`, `--tools ToolSearch`, `dontAsk`** | **Notion 성공 6/6** (두 번 실행) | **10.4s** | **13.2s** |
| 위 + `ENABLE_TOOL_SEARCH=false`, `--tools ""` | Notion 성공 3/3, 도구 222개 적재 | 15.7s | 16.4s |
| Linear (위 굵은 조건) | 도구 호출 성공, 해당 이슈 없음 | 10.1s | 10.1s |
| Gmail (위 굵은 조건) | 서버 `needs-auth`. ToolSearch만 부르고 빈 결과 | - | - |

- 목록 밖 도구는 막힙니다. `notion-get-users`를 부르게 하자 `permission_denials`에 남고 실행되지 않았습니다.
- 대부분 ToolSearch → 검색 도구, 3턴으로 끝났습니다. 시안의 `~20S`는 `~10S`로 고칩니다.
- `claude mcp list`는 서버 상태 확인에 약 11초가 걸리므로 화면을 막지 않고 백그라운드로 읽습니다.
- Gmail과 Google Calendar는 `mcp list`에서 Connected인데 실제 도구는 인증 도구만 보입니다. Claude Code 안에서 `/mcp`로 다시 인증해야 합니다. 7-c는 Notion으로 먼저 연결하고, Gmail은 인증 후 도구 이름을 확인해 표에 채웁니다.

## 11. 테마: v1은 구조만, v1.1에서 Claude랑 테마를 만듭니다

### v1 — 테마 구조와 내장 테마 2개

- 화면의 색, 글꼴, 모양, 질감, 연출, 문구를 모두 테마 JSON 하나에서 읽습니다. 렌더러는 테마를 CSS 변수와 문구 표로 바꿔 적용합니다.
- 내장 테마는 `default`(다크 글래스, 9장)와 `phantom`(페르소나풍 시안) 두 개입니다.
- 처음부터 이렇게 나눠 두면 v1.1에서 테마 만들기를 붙일 때 화면 코드를 고치지 않아도 됩니다.

테마 JSON이 바꿀 수 있는 것:

| 영역 | 키 예시 | 값의 범위 |
|---|---|---|
| 색 | `color.bg`, `color.row`, `color.accent`, `color.textUnclear` | 6자리 hex |
| 글꼴 | `font.title`, `font.body`, `font.number` | 앱에 내장한 글꼴 목록 안에서만 |
| 모양 | `shape.skewDeg`, `shape.radius`, `shape.jitter`, `shape.shadowOffset` | 각각 정해진 최솟값~최댓값 |
| 질감 | `texture` | `none` / `halftone` / `noise` |
| 연출 | `motion.complete` | `none` / `burst` / `confetti` |
| 정리 안 된 할 일 표시 | `unclearStyle` | `dim`(흐린 글씨) / `stamp`(어두운 리본 + ???) |
| 문구 | `copy.insert`, `copy.firstStepTitle`, `copy.timeout` … | 문자열, 각 40자 이내 |

테마가 바꿀 수 없는 것:

- 창 크기와 위치. 앱이 고정합니다.
- 코드 실행. JS는 받지 않습니다. 스키마 검사를 통과한 값만 CSS 변수로 넣습니다. 원격 URL과 외부 글꼴도 막습니다.
- 글자 대비. 본문 글씨와 배경의 대비가 4.5:1보다 낮거나, 정리 안 된 할 일과 정리된 할 일이 구분되지 않으면 적용하기 전에 경고합니다.

### v1.1 — Claude랑 테마 만들기

설정 → 테마 → “Claude랑 만들기”에서 원하는 느낌을 적으면, Claude Code가 테마 JSON을 만들고 앱이 세 창을 목업 데이터로 미리 보여 줍니다. (시안 E1~E4)

1. 사용자가 원하는 느낌을 적습니다. 예: “페르소나 느낌인데 파란색, 말투는 존댓말”
2. 앱이 `type: "theme"` 요청을 보냅니다. 본문에는 현재 테마 JSON, 쓸 수 있는 글꼴 목록, 값의 범위, 사용자 요청을 넣습니다.
3. 응답 JSON을 스키마로 검사하고 대비를 계산합니다. 통과하면 미리보기에 적용하고, 바뀐 항목을 칩으로 보여 줍니다.
4. 사용자가 “조금 더 기울여”처럼 이어서 요청하면 현재 JSON과 요청만 다시 보냅니다. `--resume`은 쓰지 않습니다.
5. 저장하면 `~/Library/Application Support/todoBAN/themes/<id>.json`에 쓰고, 버전 기록을 남겨 되돌릴 수 있게 합니다.

CLAUDE.md에 추가할 규칙:

```markdown
## type: theme
입력: {"type":"theme","current":{...테마 JSON},"fonts":["Pretendard","Black Han Sans",...],"limits":{...},"request":"..."}
출력: {"theme":{...테마 JSON},"changes":["바뀐 점 한 줄", ...]}
- current에서 request와 관계없는 값은 그대로 둔다.
- fonts에 없는 글꼴, limits 밖의 값은 쓰지 않는다.
- changes는 최대 5개, 각 20자 이내로 쓴다.
```

| 단계 | 할 일 | 완료 기준 |
|---|---|---|
| 1.1-a | 테마 만들기 창과 theme 요청 | “파란 Phantom, 존댓말”을 요청하면 세 창 미리보기가 바뀌고, 바뀐 점이 칩으로 보입니다 |
| 1.1-b | 검사와 버전 기록 | 대비가 낮은 응답에는 경고가 뜨고, 저장한 테마를 이전 버전으로 되돌릴 수 있습니다 |

## 12. 아직 정하지 않은 것

- [x] 앱 이름 → todoBAN (임시)
- [x] 도구 사용을 막는 claude 옵션 → `--tools ""`
- [x] 피그마 데스크톱 앱의 번들 ID → `com.figma.Desktop`
- [ ] 프로젝트 구분이 필요한지. 일주일 사용 후 정합니다.
- [x] 모델 → sonnet 고정 (0단계 측정)
- [x] `--bare` → 쓰지 않음 (OAuth를 읽지 않음). 대신 `--setting-sources project`
- [ ] 로그인할 때 앱을 자동으로 실행할지 (설정에 스위치는 둡니다)
- [ ] 기본 단축키 ⌥ Space가 다른 앱과 겹치는지. Alfred와 ChatGPT 데스크톱 앱이 같은 조합을 씁니다. 2단계에서 `globalShortcut.register`가 실패하면 설정에서 다른 조합을 고르게 안내합니다. ⌃Space는 입력 소스 전환 키라서 쓰지 않습니다.
- [x] 기본으로 쓸 테마 → 다크 글래스 기본 테마
- [x] MCP collect 설정 → `--setting-sources user,project --tools ToolSearch --permission-mode dontAsk`, 평균 10.4초 (7-a)
- [ ] `user` 설정을 읽으면 이 맥의 전역 훅과 플러그인도 같이 돕니다. collect에만 쓰지만, 훅이 느려지거나 부작용이 생기면 collect 전용 설정 파일(`--settings`)로 훅을 끄는 방법을 봅니다
- [ ] 출처별 비율을 사용자가 실제로 만지는지. 안 만지면 C1에서 접어 둡니다 (9단계 사용 기록)
- [ ] 캘린더 읽기를 osascript로 할지, 작은 도우미 앱으로 할지. osascript가 1초를 넘기면 다시 정합니다 (7-b)
