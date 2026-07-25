# memory-brain 30-second demo — recorded with vhs (charmbracelet/vhs)
# Re-record: vhs docs/assets/demo.tape   (requires: bun link 완료 상태, CFGM_LANG=en)
Output docs/assets/demo.gif

Set FontSize 15
Set Width 1080
Set Height 620
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 12

Env CFGM_LANG "en"

Hide
Type "cd /Users/treestar/dev/memory-brain && alias cfgm='bun run bin/cfgm.ts' && clear"
Enter
Sleep 1s
Show

Type "cfgm search 'memory routing policy' --limit 2"
Sleep 500ms
Enter
Sleep 3s

Type "cfgm ask 'why did we reverse the Honcho self-host decision'"
Sleep 500ms
Enter
Sleep 5s

Type "cfgm stats"
Sleep 500ms
Enter
Sleep 4s
