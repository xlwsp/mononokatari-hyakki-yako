#!/bin/bash
# 届いたご意見・バグ報告を、このPCのブラウザで見る（tools/feedback.html は外には配信しない・GitHubにも上げない）
#   使い方:  bash tools/feedback.sh
cd "$(dirname "$0")/.."
if [ ! -f tools/feedback.html ]; then
  echo "<meta charset=utf-8><p>まだご意見は届いていません</p>" > tools/feedback.html
fi
open tools/feedback.html
