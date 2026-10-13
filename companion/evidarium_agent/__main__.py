import contextlib,json,sys,traceback

def emit(data):
    print(json.dumps(data,ensure_ascii=False,allow_nan=False),flush=True)

def main():
    try:
        payload=json.loads(sys.stdin.readline());command=payload.get('command')
        if command in ['status','login','logout']:
            from . import auth
            result=auth.login(emit) if command=='login' else getattr(auth,command)()
        elif command=='chat':
            from .agent import chat
            result=chat(payload,emit,lambda:json.loads(sys.stdin.readline()))
        elif command in ['tool','capabilities']:
            from .tools import run_tool,capabilities
            with contextlib.redirect_stdout(sys.stderr):result=capabilities() if command=='capabilities' else run_tool(payload['kind'],payload.get('args',{}),payload.get('path'),payload.get('project'))
        else:raise ValueError('Unknown worker command.')
        emit({'event':'result','result':result})
    except Exception as e:
        # Never print requests headers, OAuth responses, tokens or full tracebacks.
        emit({'event':'error','error':str(e)[:4000]});sys.exit(1)
if __name__=='__main__':main()
