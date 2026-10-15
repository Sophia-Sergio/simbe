#!/usr/bin/env bash
# Static check: no two lanes own the same files (unless one declares the other in "Depends on (merged)").
# Usage: bash docs/superpowers/parallel/check-ownership.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
exec python3 -I - <<'PY'
import glob, re, fnmatch, itertools, sys

def expand(g):
    m = re.search(r"\{([^{}]*)\}", g)
    if not m: return [g]
    return [x for part in m.group(1).split(",") for x in expand(g[:m.start()] + part + g[m.end():])]

lanes = {}
for path in sorted(glob.glob("docs/superpowers/plans/2026-10/*.md")):
    text = open(path).read()
    lane = re.search(r"^\*\*Lane:\*\*\s+(\S+)", text, re.M)
    owns = re.search(r"^\*\*Owns:\*\*(.*)$", text, re.M)
    if not lane and not owns: continue
    if bool(lane) != bool(owns):
        print(f"ERROR {path}: needs both **Lane:** and **Owns:**"); sys.exit(1)
    wave = re.search(r"\*\*Wave:\*\*\s+(\d)", text)
    dep = re.search(r"^\*\*Depends on \(merged\):\*\*(.*)$", text, re.M)
    globs = [x for g in re.findall(r"`([^`]+)`", owns.group(1)) for x in expand(g)]
    lanes[lane.group(1)] = dict(path=path, wave=int(wave.group(1)) if wave else 0, owns=globs, dep=dep.group(1) if dep else "")

def depends(a, b):
    """a depends on b (explicit id or whole-wave mention)"""
    d = lanes[a]["dep"]
    if b in d: return True
    wb = lanes[b]["wave"]
    if wb == 0 and "Wave 0" in d: return True
    if wb == 1 and "Wave 1" in d: return True
    return False

def overlap(a, b):
    if a == b: return True
    for x, y in ((a, b), (b, a)):
        if x.endswith("/**") and (y.startswith(x[:-2]) or y == x[:-3]): return True
        if fnmatch.fnmatch(y, x): return True
    return False

bad = 0
for a, b in itertools.combinations(lanes, 2):
    if lanes[a]["wave"] >= 3 or lanes[b]["wave"] >= 3: continue   # ownership relaxed in Wave 3
    if depends(a, b) or depends(b, a): continue                   # sequential, not parallel
    for x in lanes[a]["owns"]:
        for y in lanes[b]["owns"]:
            if overlap(x, y):
                print(f"CONFLICT {a} owns {x}  <->  {b} owns {y}"); bad += 1
print(f"{len(lanes)} lanes checked, {bad} conflicts")
sys.exit(1 if bad else 0)
PY
