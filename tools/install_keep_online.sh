#!/bin/bash
# サーバーの見張り（tools/keep_online.sh）を、Mac にログインしたら自動で動くように登録する
#   登録:  bash tools/install_keep_online.sh
#   外す:  bash tools/install_keep_online.sh --remove
cd "$(dirname "$0")/.."
ROOT=$(pwd)
LABEL=com.mononokatari.keeponline
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOM="gui/$(id -u)"

launchctl bootout "$DOM/$LABEL" 2>/dev/null
if [ "$1" = "--remove" ]; then
  rm -f "$PLIST"
  echo "見張りを外しました（サーバーは手動で bash start_online.sh で起動してね）"
  exit 0
fi

PYDIR=$(dirname "$(command -v python3)")
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$ROOT/tools/keep_online.sh</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PYDIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/tools/keep_online.out</string>
  <key>StandardErrorPath</key><string>$ROOT/tools/keep_online.out</string>
</dict>
</plist>
EOF
launchctl bootstrap "$DOM" "$PLIST" && echo "✅ 見張りを登録しました。Mac にログインしている間、サーバーと公開URLを自動で保ちます（記録: tools/keep_online.log）"
