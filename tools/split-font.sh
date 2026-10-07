#!/bin/sh
# 본문 글꼴을 두 벌로 나눈다. tools/fonts/sm.woff2가 원본이고, fonts/에 놓이는
# 두 파일이 실제로 배포된다.
#
#   sm-base.woff2  한글 음절·호환 자모·가나·중일한 부호·전각 반각, 그리고
#                  화살표. 어느 글에나 쓰이므로 미리 받아 둔다.
#
# 화살표(U+2190–21FF)는 신명조가 맡는다. → 와 ↗를 한 벌로 표시한다.
#   sm-han.woff2   한자. 원본의 81%를 차지하는데 지금 글에는 한 자도 없다.
#                  unicode-range가 달라 한자가 실제로 나오는 글에서만 내려온다.
#
# style.css의 @font-face에 적은 범위와 여기 적은 범위는 반드시 같아야 한다.
# 브라우저는 범위만 보고 파일을 받으므로, 범위가 넓고 글자가 없으면 헛걸음이
# 되고 범위가 좁으면 있는 글자를 안 쓴다.
#
# pyftsubset은 fonttools에 들어 있다(pip install fonttools brotli). 배포
# 이미지에는 파이썬이 없으므로, 이 스크립트는 글꼴을 바꿀 때 사람이 돌리고
# 결과물을 저장소에 넣는다.
set -e
cd "$(dirname "$0")/.."
SRC=tools/fonts/sm.woff2
BASE='U+2190-21FF,U+3000-303F,U+3040-30FF,U+3130-318F,U+AC00-D7A3,U+FF00-FFEF'
HAN='U+4E00-9FFF,U+F900-FAFF'
for pair in "sm-base:$BASE" "sm-han:$HAN"; do
  name=${pair%%:*}
  ranges=${pair#*:}
  pyftsubset "$SRC" \
    --output-file="fonts/$name.woff2" \
    --flavor=woff2 \
    --unicodes="$ranges" \
    --layout-features='*' \
    --no-hinting
  printf '%-16s %8s bytes\n' "fonts/$name.woff2" "$(stat -c%s "fonts/$name.woff2")"
done
