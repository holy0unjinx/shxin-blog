#!/bin/sh
# 코드 글꼴 두 벌을 fonts/에 만든다. 원본은 npm 패키지(geist, pretendard)에
# 들어 있고, 여기서 나온 두 파일이 실제로 배포된다.
#
#   geist-mono.woff2     Geist Mono 가변 글꼴. 굵기 100–900이 한 파일에 들어
#                        있어, 코드 강조가 굵게 쓰는 자리도 이 한 벌로 된다.
#   pretendard-code.woff2  Pretendard에서 한글 쪽만 떼어낸 몫. 코드의 로마자는
#                        Geist Mono가 지고, Geist Mono에 없는 한글이 여기로
#                        떨어진다. 로마자를 빼는 것은 Geist Mono를 지나쳐
#                        Pretendard가 잡는 일이 없게 하려는 것이기도 하다.
#
# style.css의 @font-face에 적은 범위와 여기 적은 범위는 반드시 같아야 한다.
# tools/split-font.sh와 같은 규칙이다 — 사람이 돌리고 결과물을 저장소에 넣는다.
# pyftsubset은 fonttools에 들어 있다(pip install fonttools brotli).
set -e
cd "$(dirname "$0")/.."
MONO=node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2
HANGUL=node_modules/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2
for src in "$MONO" "$HANGUL"; do
  [ -f "$src" ] || { echo "없음: $src (npm install 먼저)" >&2; exit 1; }
done
cp "$MONO" fonts/geist-mono.woff2
# 신명조 base와 같은 구간이다. 한글 음절·호환 자모·가나·중일한 부호·전각 반각.
pyftsubset "$HANGUL" \
  --output-file=fonts/pretendard-code.woff2 \
  --flavor=woff2 \
  --unicodes='U+3000-303F,U+3040-30FF,U+3130-318F,U+AC00-D7A3,U+FF00-FFEF' \
  --layout-features='*' \
  --no-hinting
for out in fonts/geist-mono.woff2 fonts/pretendard-code.woff2; do
  printf '%-28s %8s bytes\n' "$out" "$(stat -c%s "$out")"
done
