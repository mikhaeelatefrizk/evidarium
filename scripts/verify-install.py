"""Exercise the real launcher and local HTTP server without opening a browser or signing in."""
import json, os, re, signal, socket, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    if not (ROOT/'dist-local/index.html').is_file():raise SystemExit('Build the production local UI before this installation check.')
    with tempfile.TemporaryDirectory(prefix='evidarium-install-') as tmp:
        data=Path(tmp)/'research';log=Path(tmp)/'launcher.log'
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        env={**os.environ,'EVIDARIUM_DATA_DIR':str(data),'EVIDARIUM_PORT':str(port),'EVIDARIUM_NO_OPEN':'1'}
        command=['pwsh','-NoProfile','-File',str(ROOT/'start-windows.ps1')] if os.name=='nt' else ['bash',str(ROOT/'start.sh')]
        flags={'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}
        with log.open('w') as output:
            process=subprocess.Popen(command,cwd=ROOT,env=env,stdout=output,stderr=subprocess.STDOUT,**flags)
            try:
                origin=f'http://127.0.0.1:{port}';deadline=time.monotonic()+180
                while True:
                    try:
                        with urllib.request.urlopen(origin+'/api/bootstrap',timeout=2) as r:boot=json.load(r)
                        break
                    except Exception:
                        if process.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Launcher failed or timed out.\n'+log.read_text(errors='replace')[-6000:])
                        time.sleep(.2)
                assert boot['local'] is True
                with urllib.request.urlopen(origin,timeout=10) as r:html=r.read().decode()
                asset=re.search(r'src="([^"]+\.js)"',html)
                assert asset,'Production UI has no JavaScript entry point.'
                with urllib.request.urlopen(origin+asset[1],timeout=10) as r:assert r.status==200 and len(r.read())>1000
                req=urllib.request.Request(origin+'/api/projects',data=json.dumps({'title':'Installer verification'}).encode(),headers={'Content-Type':'application/json'},method='POST')
                with urllib.request.urlopen(req,timeout=10) as r:p=json.load(r)
                with urllib.request.urlopen(origin+'/api/projects/'+p['id']+'/export',timeout=10) as r:export=json.load(r)
                assert export['project']['title']=='Installer verification'
                def request(route, body=None, method=None):
                    req=urllib.request.Request(origin+'/api/'+route,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'},method=method or ('POST' if body is not None else 'GET'))
                    with urllib.request.urlopen(req,timeout=10) as response:return json.load(response)
                prefix='projects/'+p['id']
                bibliography={'format':'csl-json','text':json.dumps([{'title':'Installer reference','type':'article-journal','DOI':'10.1234/install-check','author':[{'family':'Example','given':'A'}],'issued':{'date-parts':[[2024]]}}])}
                preview=request(prefix+'/bibliography/preview',bibliography)
                imported=request(prefix+'/bibliography/import',{**bibliography,'sha256':preview['sha256']})
                assert imported['added']==1
                source=request(prefix)['sources'][0]
                draft=request(prefix+'/manuscripts',{'title':'Installer draft'})
                text='A reproducible observation [S:'+source['id']+'].'
                saved=request(prefix+'/manuscripts/'+draft['id'],{'title':draft['title'],'content':text,'revision':1},'PUT')
                assert saved['revision']==2
                rendered=request(prefix+'/manuscripts/'+draft['id']+'/preview',{'title':draft['title'],'content':text})
                assert rendered['references'][0]['id']==source['id'] and not rendered['issues']
                assert request(prefix+'/screening-ledger')['total_records']==1
                print(json.dumps({'status':'passed','platform':sys.platform,'python':sys.version.split()[0],'checks':['real launcher','dependency installation','bootstrap','production UI asset served','project creation','project export','bibliography preview and import','draft save and numbered citation preview','screening ledger'],'scope':'HTTP installation check; no browser, OAuth, or model inference'}))
            finally:
                if process.poll() is None:
                    if os.name=='nt':subprocess.run(['taskkill','/pid',str(process.pid),'/T','/F'],capture_output=True)
                    else:os.killpg(process.pid,signal.SIGTERM)
                    process.wait(timeout=20)

if __name__=='__main__':main()
