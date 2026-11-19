#!/bin/bash
# ゲームの画面（ファイル）を GitHub Pages に公開・更新する
#   初回:   bash publish_github.sh            （リポジトリ作成 → アップロード → GitHub Pages を有効化）
#   2回目～: bash publish_github.sh            （変更をアップロード）
# 先に GitHub へのログインが必要:  tools/bin/gh auth login
cd "$(dirname "$0")"
GH=tools/bin/gh
NAME=${REPO_NAME:-nakama-survivor}
"$GH" auth status >/dev/null 2>&1 || { echo "先に GitHub にログインしてね:  tools/bin/gh auth login"; exit 1; }
OWNER=$("$GH" api user --jq .login)
REPO="$OWNER/$NAME"
echo "REPO=$REPO" > tools/github.conf

"$GH" auth setup-git >/dev/null 2>&1
if [ ! -d .git ]; then
  git init -q -b main
fi
# サーバーのURLを書く場所（最初は空）
[ -f server.json ] || echo '{"ws":""}' > server.json
git add -A
git commit -q -m "ゲームを更新" >/dev/null 2>&1 || true

if ! "$GH" repo view "$REPO" >/dev/null 2>&1; then
  echo "GitHub にリポジトリ $REPO を作成します（公開）..."
  "$GH" repo create "$NAME" --public --source . --remote origin --push >/dev/null || { echo "作成に失敗しました"; exit 1; }
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
  git pull -q --rebase origin main >/dev/null 2>&1 || true
  git push -q -u origin main || { echo "アップロードに失敗しました"; exit 1; }
fi

# GitHub Pages を有効化（すでに有効なら何もしない）
"$GH" api "repos/$REPO/pages" >/dev/null 2>&1 || \
  "$GH" api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1
echo ""
echo "公開ページ（ずっと同じURL）:  https://$OWNER.github.io/$NAME/"
echo "（反映まで1〜2分かかることがあります）"
