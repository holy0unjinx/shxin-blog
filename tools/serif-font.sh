#!/bin/sh
# Computer Modern Unicode의 CMU Serif를 라틴 기본/확장 WOFF2로 만든다.
# 의존 도구: curl, pyftsubset (fonttools와 brotli).
# 결과물과 OFL 라이선스는 fonts/에 보관하여 외부 요청 없이 배포한다.
set -e
cd "$(dirname "$0")/.."
SRC=tools/fonts
UPSTREAM=https://mirrors.ctan.org/fonts/cm-unicode
mkdir -p "$SRC"
for face in cmunrm cmunbx cmunti cmunbi; do
  if [ ! -f "$SRC/$face.otf" ]; then
    curl -fL --retry 3 "$UPSTREAM/fonts/otf/$face.otf" -o "$SRC/$face.otf.tmp"
    mv "$SRC/$face.otf.tmp" "$SRC/$face.otf"
  fi
done
if [ ! -f fonts/cmu-OFL.txt ]; then
  curl -fL --retry 3 "$UPSTREAM/doc/OFL.txt" -o fonts/cmu-OFL.txt.tmp
  mv fonts/cmu-OFL.txt.tmp fonts/cmu-OFL.txt
fi

# 라틴 기본. 끝의 셋은 각각 바이트 순서 표시, 없는 글자 표시, 그리고 빼기
# 기호다 — 수식이 아닌 본문에서도 쓰인다.
BASE='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2212,U+2215,U+FEFF,U+FFFD'
# 라틴 확장과 그에 딸린 것들.
# U+0131과 U+0152-0153은 위 BASE가 이미 집었다 — 라틴 확장 구간 안에
# 있지만 흔히 쓰여서, 확장을 받지 않은 글에서도 나와야 한다.
EXT='U+0100-0130,U+0132-0151,U+0154-024F,U+0259,U+1E00-1EFF,U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF'

total=0
for pair in "cmunrm:regular" "cmunbx:bold" "cmunti:italic" "cmunbi:bolditalic"; do
  face=${pair%%:*}
  name=${pair#*:}
  for tier in "base:$BASE:" "ext:$EXT:-ext"; do
    kind=${tier%%:*}
    rest=${tier#*:}
    ranges=${rest%:*}
    suffix=${rest##*:}
    out="fonts/cmu-$name$suffix.woff2"
    pyftsubset "$SRC/$face.otf" \
      --output-file="$out" \
      --flavor=woff2 \
      --unicodes="$ranges" \
      --layout-features='*' \
      --no-hinting
    size=$(stat -c%s "$out")
    total=$((total + size))
    printf '%-28s %8s bytes\n' "$out" "$size"
  done
done
printf '%-28s %8s bytes\n' "합계" "$total"
