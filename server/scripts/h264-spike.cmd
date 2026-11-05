@echo off
node --loader ts-node/esm --no-warnings "%~dp0h264-spike.ts" %*
