"""Compare the website's real REML calculations with independently executed R/metafor."""
import argparse,csv,json,math,os,random,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True);args=parser.parse_args()
    raw=list(csv.DictReader((ROOT/'tests/fixtures/bcg.csv').open()));ys=[];vs=[]
    for r in raw:
        a,b,c,d=[float(r[k]) for k in ['tpos','tneg','cpos','cneg']]
        ys.append(math.log((a/(a+b))/(c/(c+d))));vs.append(1/a-1/(a+b)+1/c-1/(c+d))
    cases=[{'name':'published-bcg','effects':ys,'variances':vs},{'name':'zero-heterogeneity','effects':[.1,.11,.09,.1,.12],'variances':[.2,.2,.2,.2,.2]}, {'name':'identical-effects','effects':[.5]*4,'variances':[.1,.2,.3,.4]}]
    rng=random.Random(20261014)
    for k in [3,5,13,50,200]:
        for tau in [0,.1,2]:
            v=[10**rng.uniform(-2,.5) for _ in range(k)];y=[rng.gauss(.3,math.sqrt(x+tau)) for x in v]
            cases.append({'name':f'k{k}-tau{tau}','effects':y,'variances':v})
    cases.extend([{'name':'small-scale','effects':[x*1e-4 for x in ys],'variances':[x*1e-8 for x in vs]},{'name':'shifted-scale','effects':[x+1000 for x in ys],'variances':vs}])
    with tempfile.TemporaryDirectory(prefix='evidarium-web-reference-') as tmp:
        data=Path(tmp)/'cases.json';data.write_text(json.dumps(cases))
        r='''suppressPackageStartupMessages(library(metafor));library(jsonlite)
x<-fromJSON(commandArgs(TRUE)[1],simplifyVector=FALSE)
out<-lapply(x,function(d){m<-rma(yi=unlist(d$effects),vi=unlist(d$variances),method="REML",test="knha",control=list(threshold=min(unlist(d$variances))*1e-10,maxiter=10000,stepadj=.5));list(name=d$name,estimate=as.numeric(m$b),se=m$se,ci_lower=m$ci.lb,ci_upper=m$ci.ub,tau2=m$tau2,I2=m$I2,QE=m$QE,p_value=if(is.finite(m$pval))m$pval else NULL)})
cat(toJSON(list(R=as.character(getRversion()),metafor=as.character(packageVersion("metafor")),results=out),digits=16,auto_unbox=TRUE,null="null"))'''
        script=Path(tmp)/'reference.R';script.write_text(r)
        reference=json.loads(subprocess.check_output([os.environ.get('EVIDARIUM_RSCRIPT','Rscript'),str(script),str(data)],text=True))
        js="import {fitMeta} from './lib/web-science.mjs';let s='';for await(const x of process.stdin)s+=x;console.log(JSON.stringify(JSON.parse(s).map(c=>fitMeta(c.effects,c.variances))));"
        results=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps(cases),cwd=ROOT,text=True))
    max_error={};fixture=[]
    for case,expected,actual in zip(cases,reference['results'],results):
        errors={}
        for key in ['estimate','se','ci_lower','ci_upper','tau2','I2','QE','p_value']:
            a,b=actual[key],expected[key]
            if case['name']=='identical-effects' and key=='p_value':continue
            if b is None:assert a is None,(case['name'],key,a,b);continue
            unit=max(case['variances']+( [(max(case['effects'])-min(case['effects']))**2] ))
            if key in ['estimate','se','ci_lower','ci_upper']:unit=math.sqrt(unit)
            elif key!='tau2':unit=1
            error=abs(a-b);tolerance=1e-8*unit+abs(b)*2e-6
            assert error<=tolerance,(case['name'],key,a,b,error,tolerance)
            errors[key]=error;max_error[key]=max(max_error.get(key,0),error)
        fixture.append({**case,'reference':expected,'actual':{k:actual[k] for k in expected if k!='name'},'absolute_errors':errors})
    report={'status':'passed','cases':len(cases),'reference_engine':{'R':reference['R'],'metafor':reference['metafor']},'candidate':'Evidarium native JavaScript 0.4.0 / jStat 1.9.6','absolute_plus_relative_tolerance':'1e-8 * dimensional scale + abs(reference)*2e-6','maximum_absolute_errors':max_error,'scope':'Reference agreement for these cases; not independent researcher review or general scientific validation. Identical-effect p-value excluded because zero-standard-error inference is undefined.','fixtures':fixture}
    Path(args.output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='fixtures'}))
if __name__=='__main__':main()
