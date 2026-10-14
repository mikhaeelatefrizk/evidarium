"""Reproduce bounded engine checks. Select engines installed in the current environment."""
import argparse,csv,hashlib,json,math,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'companion'))
from evidarium_agent.tools import run_tool

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('engine',choices=['metafor','asreview','pysr','indra'])
    parser.add_argument('--dataset',help='Downloaded, unmodified Appenzeller-Herzog_2020 CSV for the ASReview check')
    parser.add_argument('--output',required=True)
    args=parser.parse_args();report={'engine':args.engine,'scope':'Bounded engineering/reference check; not independent researcher review.'}
    with tempfile.TemporaryDirectory() as tmp:
        if args.engine=='metafor':
            import numpy as np
            from scipy.optimize import minimize_scalar
            from scipy.stats import t
            raw=ROOT/'tests/fixtures/bcg.csv';rows=list(csv.DictReader(raw.open()))
            a,b,c,d=np.array([[float(r[k]) for k in ['tpos','tneg','cpos','cneg']] for r in rows]).T
            y=np.log((a/(a+b))/(c/(c+d)));v=1/a-1/(a+b)+1/c-1/(c+d)
            p=Path(tmp)/'effects.csv'
            with p.open('w',newline='') as f:w=csv.writer(f);w.writerow(['yi','vi']);w.writerows(zip(y,v))
            out=run_tool('meta_analysis',{'effect':'yi','variance':'vi','independent_effects_confirmed':True},str(p));actual=out['result']
            # Independent numerical implementation of the intercept-only REML objective.
            def objective(tau):
                w=1/(v+tau);mu=np.dot(w,y)/sum(w)
                return .5*(np.log(v+tau).sum()+math.log(sum(w))+np.dot(w,(y-mu)**2))
            fit=minimize_scalar(objective,bounds=(0,5),method='bounded',options={'xatol':1e-12})
            w=1/(v+fit.x);mu=np.dot(w,y)/sum(w);se=math.sqrt(np.dot(w,(y-mu)**2)/(len(y)-1)/sum(w));margin=t.ppf(.975,len(y)-1)*se
            reference={'estimate':float(mu),'tau2':float(fit.x),'se':se,'ci_lower':float(mu-margin),'ci_upper':float(mu+margin)}
            differences={key:abs(value-actual[key]) for key,value in reference.items()}
            assert max(differences.values())<1e-5,differences
            report.update(reference=reference,absolute_differences=differences,execution=out,reference_source='https://wviechtb.github.io/metafor/',input_sha256=hashlib.sha256(raw.read_bytes()).hexdigest())
        elif args.engine=='asreview':
            if not args.dataset:raise ValueError('--dataset is required. See docs/release-0.3.md for the source and fingerprint.')
            p=Path(args.dataset);digest=hashlib.sha256(p.read_bytes()).hexdigest()
            if digest!='456f9306b0ce1aee840ac0244f11df3b2a168aa46007a92f5dcf59916d309a69':raise ValueError('This is not the pinned screening fixture. Do not compare its results as the same benchmark.')
            rows=list(csv.DictReader(p.open(encoding='utf-8-sig')));labels=[int(r['label_included']) for r in rows]
            seeds=set([i for i,y in enumerate(labels) if y][:5]+[i for i,y in enumerate(labels) if not y][:5])
            sources=[{'id':str(i),'title':r['title'],'abstract':r['abstract'],'stage':'title_abstract','decision':('include' if labels[i] else 'exclude') if i in seeds else 'unknown'} for i,r in enumerate(rows)]
            out=run_tool('screen_rank',{'stage':'title_abstract'},project={'sources':sources});order=[int(x['source_id']) for x in out['result']['priority_order']]
            assert len(order)==len(rows)-len(seeds) and len(set(order))==len(order) and not seeds.intersection(order)
            report.update(dataset_sha256=digest,records=len(rows),seeds=sorted(seeds),ranked=len(order),remaining_inclusions=sum(labels[i] for i in order),included_in_top_100=sum(labels[i] for i in order[:100]),ranking_sha256=hashlib.sha256(json.dumps(order).encode()).hexdigest(),provenance=out['provenance'],scope='One fixed-seed ranking. No guarantee of recall; final inclusion labels used as seeds.')
        elif args.engine=='pysr':
            p=Path(tmp)/'known.csv'
            with p.open('w',newline='') as f:w=csv.writer(f);w.writerow(['x','y']);w.writerows((i/10,2*(i/10)+3) for i in range(-50,50))
            out=run_tool('symbolic_regression',{'features':['x'],'target':'y','iterations':5},str(p))
            assert out['result']['held_out_rmse']<1e-4,out['result']
            report.update(execution=out,expected_equation='y = 2*x + 3',scope='Synthetic equation recovery. Does not establish scientific discovery performance.')
        else:
            source={'type':'Activation','obj_activity':'activity','subj':{'name':'same-name','db_refs':{'HGNC':'1097'}},'obj':{'name':'same-name','db_refs':{'HGNC':'6840'}},'evidence':[{'source_api':'synthetic-fixture','text':'Synthetic verification only.'}]}
            out=run_tool('mechanism_graph',{'statements':[source]});assert len(out['result']['nodes'])==2
            try:run_tool('mechanism_graph',{'statements':[source,{'type':'UnknownStatement'}]})
            except ValueError:pass
            else:raise AssertionError('Malformed statements were silently dropped.')
            report.update(execution=out,scope='Synthetic representation and rejection tests, not a biological validation.')
    report['status']='passed';Path(args.output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':'passed','report':args.output}))

if __name__=='__main__':main()
