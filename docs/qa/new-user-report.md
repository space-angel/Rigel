# 다른 사람 컴퓨터에서의 Claude 연결 점검

2026-10-21 · `bash scripts/new-user-matrix.sh` · 맥(arm64), 앱 빌드 feat/windows

빈 홈 폴더와 최소 PATH(`/usr/bin:/bin`)로 앱을 띄워, 이 맥에 깔린 진짜 claude가 섞이지 않게 했다.
claude는 가짜(`docs/qa/fixtures/fake-claude.mjs`)이고, 출력 모양은 실제 claude 2.1.304를 따른다.
로그인 안 됨 출력은 실제 claude를 빈 홈 폴더에서 실행해 받은 것이다(`docs/qa/fixtures/claude-outputs/not-logged-in.json`, 단위 테스트에서 사용).

| 상황 | 꾸민 컴퓨터 | 설정 → Claude Code | 첫 행동 물어보기 | 짧은 할 일(Claude 없이) |
|---|---|---|---|---|
| none | claude 없음 | [없음] | Claude Code가 아직 없어요. | ✅ |
| native | 공식 설치 자리(~/.local/bin), 로그인됨(Pro) | [찾음] 자동으로 찾았어요 · 2.1.304 · Pro 구독 | 첫 행동을 받음 | ✅ |
| nvm | nvm으로 깐 npm claude(#!/usr/bin/env node, 같은 폴더의 node) | [찾음] 자동으로 찾았어요 · 2.1.304 · Pro 구독 | 첫 행동을 받음 | ✅ |
| logout | 깔렸지만 로그인 안 함 | [로그인 필요] | Claude Code에 먼저 로그인해 주세요. 터미널에서 claude를 실행하면 돼요. | ✅ |
| expired | 로그인 만료 | [로그인 필요] | Claude Code에 먼저 로그인해 주세요. 터미널에서 claude를 실행하면 돼요. | ✅ |
| limit | 구독 사용량 한도(resets 3pm) | [찾음] 자동으로 찾았어요 · 2.1.304 · Pro 구독 | Claude 사용량 한도에 닿았어요. 오후 3시 이후에 다시 쓸 수 있어요. | ✅ |
| offline | 인터넷 끊김(ENOTFOUND) | [찾음] 자동으로 찾았어요 · 2.1.304 · Pro 구독 | Claude에 연결하지 못했어요. 인터넷 연결을 확인해 주세요. | ✅ |
| apikey | API 키로 로그인 | [찾음] 자동으로 찾았어요 · 2.1.304 · API 키 | 첫 행동을 받음 | ✅ |
| old | auth 명령이 없는 옛 claude | [찾음] 자동으로 찾았어요 · 2.1.304 | 첫 행동을 받음 | ✅ |
| ancient | 앱 옵션을 모르는 아주 옛 claude | [찾음] 자동으로 찾았어요 · 2.1.304 | Claude Code가 오래됐어요. 터미널에서 claude update를 실행해 주세요. | ✅ |
| shell | 정해 둔 자리 밖, .zshrc의 PATH에만 있음 | [찾음] 자동으로 찾았어요 · 2.1.304 · Pro 구독 | 첫 행동을 받음 | ✅ |

## 시작하기 화면

| 상황 | 1단계 제목 | 안내 | 버튼 |
|---|---|---|---|
| none | Claude Code를 찾지 못했어요 | 짧은 할 일은 그대로 넣을 수 있어요. 할 일 나누기와 첫 행동 찾기에는 Claude Code가 필요해요. | 설치 방법 보기 · 직접 고르기 · 다시 찾기 |
| logout | Claude Code에 로그인해 주세요 | 터미널에서 claude를 실행하고 Claude 계정으로 로그인해 주세요. 다 되면 이 화면으로 돌아오세요. | 터미널 열기 · 다시 확인 |
| native | Claude Code (완료) | 경로 · 2.1.304 · Pro 구독 | — |

## 이번 점검으로 고친 것

- 사용량 한도·인터넷 끊김·옛 claude를 "첫 행동을 찾지 못했어요" 대신 각각 알린다. 한도는 풀리는 시각을 화면 언어로(오후 3시)
- 시작하기·설정이 로그인 여부와 구독 종류를 미리 보여 준다(`claude auth status`, 사용량을 쓰지 않음)
- nvm·volta·bun·pnpm·asdf·mise 자리와 사용자의 기본 셸(bash·fish 포함, 로그인→대화형)로 claude를 찾는다
- npm으로 깐 claude가 node를 못 찾던 문제: claude가 있는 폴더를 PATH 맨 앞에 둔다
- 미리 찾기는 로그인 안 됨·한도·옛 claude면 그 실행 동안 다시 부르지 않는다(남은 한도를 아낌)

## 아직 직접 확인하지 못한 것

- 실제 윈도우 PC: CI(windows-latest)에서 가짜 claude.cmd로 확인하도록 준비함. 진짜 윈도우의 트레이 위치·작업 표시줄 위로 열기는 사람이 봐야 한다
- 다른 사람의 실제 구독(Pro·Max)·실제 한도 문구: 문구는 알려진 CLI 문구로 맞췄다. 실제 한도에 걸린 출력을 받으면 fixture에 더할 것
