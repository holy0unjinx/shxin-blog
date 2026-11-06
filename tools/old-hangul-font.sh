#!/bin/sh
# 옛한글 조합 자모와 방점만 Noto Serif CJK KR에서 뽑는다.
# CSS의 옛한글 명조 unicode-range와 범위를 함께 바꿔야 한다.
# 의존 도구: curl, pyftsubset (fonttools와 brotli).
set -eu
cd "$(dirname "$0")/.."

REV=f8d157532fbfaeda587e826d4cd5b21a49186f7c
EXPECTED=77b4b741f864d27f15e90f275b17106dde90b2ad28f82bab72dc95805db5fb42
SRC=$(mktemp)
trap 'rm -f "$SRC"' EXIT
curl -fL --retry 3 \
  "https://raw.githubusercontent.com/notofonts/noto-cjk/$REV/Serif/OTF/Korean/NotoSerifCJKkr-Regular.otf" \
  -o "$SRC"
printf '%s  %s\n' "$EXPECTED" "$SRC" | sha256sum -c -
# 조합 결과의 일부는 Unicode 코드 포인트가 없는 CID 글리프다. 자모만
# 뽑으면 예컨대 ᅀᆞᆫ이 .notdef로 떨어지므로 뒤쪽 조합 글리프도 보존한다.
pyftsubset "$SRC" \
  --output-file=fonts/noto-serif-old-hangul.woff2 \
  --flavor=woff2 \
  --unicodes=U+1100-11FF,U+A960-A97F,U+D7B0-D7FF,U+302E-302F \
  --gids=62000-65534 \
  --layout-features='*' \
  --no-hinting
# 신명조의 cmap에는 윤곽선이 빈 현대 음절이 여럿 있다. 빈 음절을 빼야
# 브라우저가 다음 글꼴로 넘어간다. 빠진 음절만 Noto에서 별도로 뽑는다.
python3 tools/fallback-fonts.py "$SRC"
