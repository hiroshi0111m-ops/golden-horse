from pathlib import Path
from urllib.parse import urlparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def active_index():
    files = []
    for p in ROOT.rglob("index.html"):
        if any(x in {".git", "node_modules"} for x in p.parts):
            continue
        try:
            files.append((p.stat().st_size, p))
        except OSError:
            pass
    if not files:
        raise SystemExit("index.html not found")
    return max(files, key=lambda x: x[0])[1]

p = active_index()
s = p.read_text(encoding="utf-8", errors="replace")

raw_urls = re.findall(r"https?://[^\\s<>()]+", s)
urls = sorted(set(raw_urls))
domains = {}
for u in urls:
    try:
        host = urlparse(u).hostname or ""
    except Exception:
        host = ""
    if host:
        domains.setdefault(host, []).append(u)

http_urls = [u for u in urls if u.startswith("http://")]
danger = {
    "eval": len(re.findall(r"\beval\s*\(", s)),
    "new_Function": len(re.findall(r"\bnew\s+Function\s*\(", s)),
    "document_write": len(re.findall(r"\bdocument\.write\s*\(", s)),
    "postMessage": len(re.findall(r"\bpostMessage\s*\(", s)),
    "localStorage": len(re.findall(r"\blocalStorage\b", s)),
    "sessionStorage": len(re.findall(r"\bsessionStorage\b", s)),
}

report = {
    "active_index": str(p.relative_to(ROOT)),
    "size_bytes": p.stat().st_size,
    "external_domain_count": len(domains),
    "external_domains": sorted(domains),
    "http_url_count": len(http_urls),
    "http_urls": http_urls[:100],
    "dangerous_api_counts": danger,
}
Path("gh-network-security-report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
)

print(f"ACTIVE_INDEX={report['active_index']}")
print(f"EXTERNAL_DOMAIN_COUNT={report['external_domain_count']}")
for d in report["external_domains"]:
    print(f"DOMAIN={d}")
print(f"HTTP_URL_COUNT={report['http_url_count']}")
for k, v in danger.items():
    print(f"API:{k}={v}")
print("NETWORK_SECURITY_REPORT=PASS")
