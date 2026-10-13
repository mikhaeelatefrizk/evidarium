"""Create reproducible source/local ZIPs with an explicit exclusion policy."""
import hashlib,json,os,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'downloads';OUT.mkdir(parents=True,exist_ok=True)
SKIP={'.git','node_modules','.venv','__pycache__','.sites-runtime','.agents','.codex','.wrangler','.next','.vinext','dist','dist-local','downloads','outputs','work','coverage','upload'}
def source_files():
    for folder,dirs,files in os.walk(ROOT):
        dirs[:]=sorted(d for d in dirs if d not in SKIP)
        for name in sorted(files):
            p=Path(folder)/name
            if p.is_symlink() or name.startswith('.env') or p.suffix in {'.pyc','.pem','.gguf','.sqlite','.sqlite3','.db','.log','.tsbuildinfo'} or name in {'identity.json','server.lock','next-env.d.ts'}:continue
            yield p

def archive(name,local):
    files=list(source_files())
    if local:files.extend(p for p in (ROOT/'dist-local').rglob('*') if p.is_file() and not p.is_symlink())
    dest=OUT/name
    with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(set(files)):
            info=zipfile.ZipInfo('evidarium/'+p.relative_to(ROOT).as_posix(),(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o755 if p.name.endswith('.sh') else 0o644)<<16;z.writestr(info,p.read_bytes())
    return {'file':name,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
if not (ROOT/'dist-local'/'index.html').is_file():raise SystemExit('Build the local UI before packaging.')
results=[archive('evidarium-source.zip',False),archive('evidarium-local.zip',True)]
(OUT/'checksums.json').write_text(json.dumps({'version':'0.1.0','artifacts':results},indent=2)+'\n')
print(json.dumps(results,indent=2))
