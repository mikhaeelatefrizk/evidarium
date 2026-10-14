"""Official ChatGPT plan OAuth for a standalone local open-source app."""
import base64, hashlib, json, os, secrets, threading, time, uuid, webbrowser
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlencode, urlparse, parse_qs
import requests, jwt, keyring
import math
from filelock import FileLock
ISSUER='https://auth.openai.com'
RESOURCE='https://api.openai.com/v1'
SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
SERVICE='org.evidarium.chatgpt'
LOCK=threading.Lock()
def root():
    p=Path(os.environ.get('EVIDARIUM_DATA_DIR',str(Path.home()/'.evidarium')));p.mkdir(parents=True,exist_ok=True,mode=0o700);return p

def config():
    p=root()/'identity.json'
    if p.exists(): return json.loads(p.read_text())
    c={'host_id':'urn:uuid:'+str(uuid.uuid4())};save_config(c);return c

def save_config(c):
    p=root()/'identity.json';temp=p.with_suffix('.tmp');temp.write_text(json.dumps(c));os.chmod(temp,0o600);os.replace(temp,p)

def backend():
    b=keyring.get_keyring()
    secure=('keyring.backends.windows','keyring.backends.macos','keyring.backends.secretservice','keyring.backends.libsecret','keyring.backends.kwallet')
    candidates=getattr(b,'backends',[b])
    if b.priority<=0 or not candidates or any(not type(item).__module__.lower().startswith(secure) for item in candidates): raise RuntimeError('A secure operating-system credential store is required. Enable Windows Credential Manager, macOS Keychain, or a Linux Secret Service keyring.')
    return b

def load_tokens():
    backend();c=config();value=keyring.get_password(SERVICE,c['host_id']);return json.loads(value) if value else None

def save_tokens(t):
    backend();keyring.set_password(SERVICE,config()['host_id'],json.dumps(t))

def discovery():
    r=requests.get(ISSUER+'/.well-known/openid-configuration',timeout=20);r.raise_for_status();d=r.json()
    if d.get('issuer')!=ISSUER: raise RuntimeError('OAuth issuer mismatch.')
    for k in ['authorization_endpoint','token_endpoint','jwks_uri']:
        if not d.get(k,'').startswith(ISSUER+'/'): raise RuntimeError('Unexpected OAuth endpoint.')
    return d

def validate_id(token,client_id,nonce=None):
    d=discovery();key=jwt.PyJWKClient(d['jwks_uri']).get_signing_key_from_jwt(token)
    claims=jwt.decode(token,key.key,algorithms=['RS256'],audience=client_id,issuer=ISSUER,options={'require':['exp','iss','aud','sub']})
    if not claims.get('sub') or (nonce is not None and claims.get('nonce')!=nonce): raise RuntimeError('OAuth identity validation failed.')
    return claims

def validated_tokens(t,client_id,nonce=None,subject=None,previous=None):
    """Validate an entire replacement before persisting any identity or credential."""
    if not isinstance(t,dict):raise RuntimeError('OAuth returned an invalid token response.')
    merged={**(previous or {}),**t}
    if not isinstance(t.get('access_token'),str) or not t['access_token']:raise RuntimeError('OAuth did not return an access token.')
    if not isinstance(merged.get('refresh_token'),str) or not merged['refresh_token']:raise RuntimeError('OAuth did not return renewable authorization.')
    if str(merged.get('token_type','')).lower()!='bearer':raise RuntimeError('OAuth returned an unsupported token type.')
    scopes=set(str(merged.get('scope','')).split())
    if not {'resource.invoke','chatgpt.tokens.use.direct'}<=scopes:raise RuntimeError('Permission to use ChatGPT plan allowance was not granted.')
    expiry=t.get('expires_in')
    if isinstance(expiry,bool) or not isinstance(expiry,(int,float)) or not math.isfinite(expiry) or expiry<=0:raise RuntimeError('OAuth returned an invalid token lifetime.')
    claims=None
    if t.get('id_token'):
        claims=validate_id(t['id_token'],client_id,nonce)
        if subject and claims['sub']!=subject:raise RuntimeError('The ChatGPT identity differs from this installation’s registered account.')
    elif previous is None:raise RuntimeError('OAuth did not return an identity token.')
    merged['expires_at']=time.time()+expiry
    return merged,claims

def login(emit):
    backend();c=config();d=discovery();verifier=secrets.token_urlsafe(64);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=');state=secrets.token_urlsafe(32);nonce=secrets.token_urlsafe(32);out={}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            p=urlparse(self.path);q=parse_qs(p.query)
            if p.path!='/auth/callback' or q.get('state',[''])[0]!=state:
                self.send_response(400);self.end_headers();self.wfile.write(b'Invalid OAuth callback.');return
            out.update({k:v[0] for k,v in q.items()});self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(b'<h2>Authorization received.</h2><p>Return to Evidarium. It will verify this response before enabling your model.</p>')
    server=HTTPServer(('127.0.0.1',0),Handler);server.timeout=1
    redirect=f'http://127.0.0.1:{server.server_port}/auth/callback';params={'client_id':c.get('client_id','dynamic_agent_client'),'ext_agent_host_id':c['host_id'],'response_type':'code','redirect_uri':redirect,'scope':SCOPES,'resource':RESOURCE,'state':state,'nonce':nonce,'code_challenge_method':'S256','code_challenge':challenge}
    if not c.get('client_id'):params['agent_name_hint']='Evidarium Local'
    else:
        retained=load_tokens()
        if retained and retained.get('id_token'):params['id_token_hint']=retained['id_token']
        if c.get('email'):params['login_hint']=c['email']
    url=d['authorization_endpoint']+'?'+urlencode(params);emit({'event':'authorization'});opened=webbrowser.open(url)
    if not opened:server.server_close();raise RuntimeError('No system browser could be opened. Start Evidarium in a desktop session with a default browser.')
    deadline=time.time()+300
    try:
        while not out and time.time()<deadline:server.handle_request()
    finally:server.server_close()
    if not out:raise RuntimeError('ChatGPT authorization timed out. Start sign-in again.')
    if out.get('error'):raise RuntimeError('ChatGPT authorization was declined or unavailable: '+out['error'])
    client=out.get('client_id') or c.get('client_id')
    if not client or client=='dynamic_agent_client':raise RuntimeError('OpenAI did not return an issued client ID.')
    if c.get('client_id') and c['client_id']!=client:raise RuntimeError('The authorization belongs to another client. Use the existing account or reset the local account registration explicitly.')
    if not out.get('code'):raise RuntimeError('OAuth callback did not contain an authorization code.')
    r=requests.post(d['token_endpoint'],data={'grant_type':'authorization_code','client_id':client,'code':out.get('code',''),'code_verifier':verifier,'redirect_uri':redirect,'resource':RESOURCE},timeout=30)
    if not r.ok:raise RuntimeError(f'OAuth token exchange failed (HTTP {r.status_code}). No model request was made.')
    t,claims=validated_tokens(r.json(),client,nonce,c.get('subject'))
    c.update(client_id=client,subject=claims['sub'],email=claims.get('email',''),name=claims.get('name','Researcher'))
    save_tokens(t);save_config(c)
    return {'connected':True,'account':c.get('email') or c.get('name')}

def access_token():
    with LOCK, FileLock(str(root()/'oauth-refresh.lock'), timeout=35):
        c=config();t=load_tokens()
        if not t:raise RuntimeError('Connect ChatGPT in the local application first.')
        if t.get('expires_at',0)>time.time()+90:return t['access_token']
        earliest=t.get('earliest_refresh_at',0)
        if isinstance(earliest,str):
            from datetime import datetime
            try:earliest=datetime.fromisoformat(earliest.replace('Z','+00:00')).timestamp()
            except ValueError:earliest=0
        if float(earliest or 0)>time.time():
            if t.get('expires_at',0)>time.time()+5:return t['access_token']
            raise RuntimeError('The provider does not allow token renewal yet. Retry after the renewal window opens.')
        r=requests.post(discovery()['token_endpoint'],data={'grant_type':'refresh_token','client_id':c['client_id'],'refresh_token':t.get('refresh_token',''),'resource':RESOURCE},timeout=30)
        if not r.ok:raise RuntimeError(f'ChatGPT authorization needs renewal (HTTP {r.status_code}). Sign in again.')
        merged,_=validated_tokens(r.json(),c['client_id'],subject=c.get('subject'),previous=t)
        save_tokens(merged);return merged['access_token']

def status():
    try:
        if not load_tokens():return {'connected':False,'models':[]}
        r=requests.get(RESOURCE+'/models',headers={'Authorization':'Bearer '+access_token()},timeout=25)
        if not r.ok:return {'connected':False,'models':[],'error':f'Account model catalog unavailable (HTTP {r.status_code}).'}
        models=[{'slug':x['slug'],'display_name':x.get('display_name',x['slug'])} for x in r.json().get('models',[]) if x.get('visibility')=='list']
        return {'connected':True,'models':models,'account':config().get('email'),'preferred_model':models[0]['slug'] if models else None}
    except Exception as e:return {'connected':False,'models':[],'error':str(e)}

def logout():
    c=config();t=load_tokens();warning=None
    if t:
        try:
            endpoint=discovery().get('revocation_endpoint')
            if not endpoint or not endpoint.startswith(ISSUER+'/'):raise RuntimeError('No supported revocation endpoint was advertised.')
            r=requests.post(endpoint,data={'token':t.get('refresh_token',''),'token_type_hint':'refresh_token','client_id':c.get('client_id','')},timeout=20);r.raise_for_status()
        except Exception:warning='Local credentials removed; remote revocation could not be confirmed. Disconnect Evidarium in ChatGPT settings.'
        keyring.delete_password(SERVICE,c['host_id'])
    return {'connected':False,'warning':warning}
