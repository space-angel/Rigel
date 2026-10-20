#!/bin/sh
# 시나리오용 가짜 claude (맥·리눅스). 동작은 fake-claude.mjs
exec node "$(dirname "$0")/fake-claude.mjs" "$@"
