@echo off
rem Fake claude for scenarios on Windows. Runs through the shell like the npm claude.cmd.
node "%~dp0fake-claude.mjs" %*
