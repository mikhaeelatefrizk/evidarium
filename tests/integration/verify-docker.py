"""Run the real isolated adapter and check its declared boundaries."""
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'companion'))
from evidarium_agent.tools import run_tool

code='''import json, pathlib, socket
import pandas as pd
d=pd.read_csv('/work/input')
assert float(d['value'].mean())==4
try:
 pathlib.Path('/root-write-test').write_text('must fail')
 raise AssertionError('root filesystem was writable')
except OSError: pass
try:
 socket.create_connection(('1.1.1.1',443),timeout=1)
 raise AssertionError('network unexpectedly available')
except OSError: pass
d.describe().to_csv('/output/summary.csv')
print(json.dumps({'mean':4,'read_only_root':True,'network_blocked':True}))
'''
with tempfile.TemporaryDirectory() as tmp:
    p=Path(tmp)/'input.csv';p.write_text('value\n2\n4\n6\n')
    out=run_tool('python',{'code':code,'timeout_seconds':30,'memory_gib':2,'cpus':1},str(p))
    assert out['result']['exit_code']==0
    assert json.loads(out['result']['stdout'])=={'mean':4,'read_only_root':True,'network_blocked':True}
    assert out['result']['artifact_files'][0]['name']=='summary.csv'
    assert out['result']['container_image_id'].startswith('sha256:')
    print(json.dumps({'status':'passed','checks':['real Docker execution','known numeric result','read-only root','disabled network','retained artifact','image fingerprint'],'scope':'Declared boundary checks, not a container security certification'}))
