"""Install one optional engine in its own environment; never stores model credentials."""
import argparse, json, os, subprocess, sys, time
from pathlib import Path

KINDS={'asreview':'screen_rank','indra':'mechanism_graph','pysr':'symbolic_regression'}
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('engine',choices=KINDS)
    args=parser.parse_args()
    if sys.version_info<(3,11):raise SystemExit('Python 3.11 or newer is required.')
    data=Path(os.environ.get('EVIDARIUM_DATA_DIR',Path.home()/'.evidarium')).resolve()
    data.mkdir(parents=True,exist_ok=True,mode=0o700)
    # Install while the application is closed, avoiding replacement beneath a live task.
    lock=data/'server.lock'
    if lock.exists():
        try:os.kill(int(lock.read_text()),0)
        except (ProcessLookupError,ValueError):pass
        except PermissionError:raise SystemExit('Close Evidarium before installing an engine.')
        else:raise SystemExit('Close Evidarium before installing an engine.')
    install_lock=data/'engine-install.lock'
    try:fd=os.open(install_lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    except FileExistsError:raise SystemExit('Another engine installation is active. If it crashed, remove engine-install.lock after confirming no installer is running.')
    os.close(fd)
    try:
        env=data/'engines'/args.engine
        subprocess.run([sys.executable,'-m','venv',str(env)],check=True)
        python=env/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
        subprocess.run([str(python),'-m','pip','install','--disable-pip-version-check','--no-input','-r',str(ROOT/'companion/engines'/f'{args.engine}.txt')],check=True)
        # Record only after dependency resolution and installation have succeeded.
        config=data/'engine-runtimes.json'
        values=json.loads(config.read_text()) if config.exists() else {}
        values[KINDS[args.engine]]={'python':str(python),'installed_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
        temp=config.with_suffix('.tmp');temp.write_text(json.dumps(values,indent=2)+'\n');os.chmod(temp,0o600);os.replace(temp,config)
        print(f'{args.engine} installed in a separate environment. Restart Evidarium. Installation is not a scientific validation.')
    finally:install_lock.unlink(missing_ok=True)

if __name__=='__main__':main()
