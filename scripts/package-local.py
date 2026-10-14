"""Create reproducible source/local ZIPs with an explicit exclusion policy."""
import hashlib,json,os,zipfile,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'downloads';OUT.mkdir(parents=True,exist_ok=True)
SKIP={'.git','node_modules','.venv','__pycache__','.sites-runtime','.agents','.codex','.wrangler','.next','.vinext','dist','dist-local','downloads','outputs','work','coverage','upload','.ci-deps'}
def source_files():
    for folder,dirs,files in os.walk(ROOT):
        dirs[:]=sorted(d for d in dirs if d not in SKIP)
        for name in sorted(files):
            p=Path(folder)/name
            if p.is_symlink() or name.startswith('.env') or p.suffix in {'.pyc','.pem','.gguf','.sqlite','.sqlite3','.db','.log','.tsbuildinfo'} or name in {'identity.json','server.lock','next-env.d.ts','live-verification.json'}:continue
            yield p

def archive(name,local):
    files=list(source_files())
    if local:files.extend(p for p in (ROOT/'dist-local').rglob('*') if p.is_file() and not p.is_symlink())
    dest=OUT/name
    with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(set(files)):
            info=zipfile.ZipInfo('evidarium/'+p.relative_to(ROOT).as_posix(),(2026,10,14,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o755 if p.name.endswith('.sh') else 0o644)<<16;z.writestr(info,p.read_bytes())
        if local:
            script="const path=require('node:path');const a=path.dirname(require.resolve('saxes/package.json'));const b=path.dirname(require.resolve('xmlchars/package.json',{paths:[a]}));console.log(JSON.stringify({saxes:a,xmlchars:b,jstat:path.dirname(require.resolve('jstat/package.json')),unpdf:path.dirname(path.dirname(require.resolve('unpdf')))}))"
            roots=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True))
            info=zipfile.ZipInfo('evidarium/node_modules/saxes/LICENSE',(2026,10,14,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,(ROOT/'vendor'/'saxes.LICENSE').read_bytes())
            for package,folder in roots.items():
                folder=Path(folder)
                for p in sorted(folder.rglob('*')):
                    if not p.is_file() or p.is_symlink():continue
                    info=zipfile.ZipInfo('evidarium/node_modules/'+package+'/'+p.relative_to(folder).as_posix(),(2026,10,14,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,p.read_bytes())
    return {'file':name,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
if not (ROOT/'dist-local'/'index.html').is_file():raise SystemExit('Build the local UI before packaging.')
results=[archive('evidarium-source.zip',False),archive('evidarium-local.zip',True)]
(OUT/'checksums.json').write_text(json.dumps({'version':'0.4.0','artifacts':results},indent=2)+'\n')
print(json.dumps(results,indent=2))
