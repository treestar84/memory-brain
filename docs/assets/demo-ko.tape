# memory-brain 30초 데모 — vhs (charmbracelet/vhs) 로 녹화, 한국어 기본 출력
# 재녹화: vhs docs/assets/demo-ko.tape   (CFGM_LANG 미설정 = 한국어 기본)
Output docs/assets/demo-ko.gif

Set FontSize 16
Set Width 1080
Set Height 560
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 12

Hide
Type "cd /Users/treestar/dev/memory-brain && alias cfgm='bun run bin/cfgm.ts' && clear"
Enter
Sleep 1s
Show

Type "cfgm ask '하이픈 들어간 검색어가 크래시나던 버그 왜 이렇게 고쳤지' --limit 1"
Sleep 500ms
Enter
Sleep 5s

Type "cfgm stats"
Sleep 500ms
Enter
Sleep 4s
