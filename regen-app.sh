#!/usr/bin/env bash
# Regenerate app/index.html from index.html's <head>.
#
# The app shell is a derived file: same stylesheet, paths climbing one
# level because it's served from /app/. Editing index.html without
# running this leaves the two out of sync, which is how the font broke
# and how the tile styles went missing.
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
import re
src = open('index.html').read()
head_end = src.index('</head>') + len('</head>')
head = src[:head_end]
# Climb one level for every asset reference, in attributes AND in CSS.
head = (head
    .replace('src="js/', 'src="../js/')
    .replace('href="assets/', 'href="../assets/')
    .replace('src="assets/', 'src="../assets/')
    .replace("url('assets/", "url('../assets/"))
body = open('app/index.html').read()
body = body[body.index('</head>') + len('</head>'):]
open('app/index.html','w').write(head + body)
print('app/index.html regenerated from index.html head')
PY
