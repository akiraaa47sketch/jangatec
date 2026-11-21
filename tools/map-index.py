#!/usr/bin/env python3
"""Gera o índice de arquivos (linhas, classes, métodos) para o PROJECT_MAP.md.
Uso (na raiz do projeto): python3 tools/map-index.py > /tmp/index.md
"""
import re, glob
files = sorted(glob.glob('client/src/**/*.js', recursive=True)) + ['server/server.js']
for f in files:
    raw = open(f, encoding='utf-8').read()
    crlf = '\r\n' in raw
    s = raw.replace('\r\n', '\n')
    head = ' '.join(l[3:].strip() for l in s.split('\n')[:4] if l.startswith('//'))[:150]
    cls = re.findall(r'^export class (\w+)', s, re.M)
    fns = re.findall(r'^export (?:async )?function (\w+)', s, re.M)
    ms = [m for m in re.findall(r'^  (?:async )?(?:get )?([a-zA-Z_]\w*)\(.*\) \{$', s, re.M)
          if m not in ('if', 'for', 'while', 'switch', 'constructor')]
    print(f"- `{f}` ({s.count(chr(10)) + 1}l{', CRLF' if crlf else ''}) {head}")
    if cls or fns: print(f"  - exporta: {', '.join(cls + fns)}")
    if ms: print(f"  - métodos: {', '.join(ms[:30])}")
