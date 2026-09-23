import re, json, html, os
PLACEHOLDER = re.compile(r'\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}')
def display(t): return re.sub(r'\s+', ' ', PLACEHOLDER.sub('[…]', t)).strip()
def is_code(d):
    if re.search(r'=>|\bexport \b|\bconst \b|\bfunction\b|\breturn\b|\|\||&&|===|!==|\)\.|\(\)|\[\]', d): return True
    if re.fullmatch(r'[\W\d\[\]…]+', d): return True
    if not re.findall(r"[A-Za-z][A-Za-z'’\-]+", d): return True
    if d[:1] in '.)}': return True
    return False

rows, seen = [], set()
def scan(path, group, patterns):
    src = open(path).read()
    if path.endswith('.js'):
        src = re.sub(r'/\*[\s\S]*?\*/', lambda m: '\n' * m.group(0).count('\n'), src)
        src = re.sub(r'(?m)^\s*//.*$', '', src)
    else:
        src = re.sub(r'<(script|style)[\s\S]*?</\1>', lambda m: '\n' * m.group(0).count('\n'), src)
        src = re.sub(r'<!--[\s\S]*?-->', lambda m: '\n' * m.group(0).count('\n'), src)
    for pat, grp in patterns:
        for m in re.finditer(pat, src):
            raw = html.unescape(m.group(grp))
            d = display(raw)
            if len(d) < 3 or '${' in d or is_code(d) or d in seen: continue
            seen.add(d)
            rows.append({'group': group, 'line': src[:m.start()].count('\n') + 1, 'display': d})

MARKUP = [(r'>([^<>`{}]{3,}?)<', 1),
          (r'(?:placeholder|aria-label|title|alt)="([^"$]{3,})"', 1)]
SET = r'(?:textContent|innerText|title|placeholder|label|summary)\s*[:=]\s*'
CALL = r'(?:flash|say|confirmDialog|renderProgressError)\(\s*'
# One pattern per quote character: a class excluding all three cut
# "Couldn't…" at the apostrophe.
JS = MARKUP + [(lead + q + r'([^' + q + r']{3,})' + q, 1)
               for lead in (SET, CALL) for q in ('"', "'", '`')]
scan('docs/index.html', 'Landing page', MARKUP)
scan('docs/app/index.html', 'App shell', MARKUP)
for fn in ['app.js', 'insights.js', 'matching.js', 'search.js', 'spotify.js',
           'history.js', 'watchlist.js', 'lastfm.js', 'cover.js', 'demo.js',
           'library-cache.js', 'auth.js', 'storage.js']:
    scan('docs/js/' + fn, 'App — ' + fn, JS)

groups = list(dict.fromkeys(r['group'] for r in rows))
rows.sort(key=lambda r: (groups.index(r['group']), r['line']))
for n, r in enumerate(rows, 1): r['id'] = f'S{n:03d}'
json.dump(rows, open('/tmp/strings.json', 'w'), indent=1)
from collections import Counter
print(len(rows)); [print(f'{n:5}  {g}') for g, n in Counter(r['group'] for r in rows).most_common()]
