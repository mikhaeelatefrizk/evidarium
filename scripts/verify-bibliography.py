"""Check exported files with independent RIS/BibTeX readers, not Evidarium's parser.

Test-only dependencies: rispy==0.9.0, bibtexparser==1.4.3.
"""
import argparse, importlib.metadata, json, subprocess
from pathlib import Path
import rispy, bibtexparser
ROOT=Path(__file__).resolve().parents[1]
CASES=[
    {'id':'journal','type':'article-journal','title':'A measured result','author':[{'family':'Rizk','given':'Mikhaeel'},{'literal':'Research consortium'}],'issued':{'date-parts':[[2024,6,12]]},'container-title':'Journal of Test Evidence','volume':'12','issue':'2','page':'10-18','DOI':'10.1234/example'},
    {'id':'book','type':'book','title':'Methods & uncertainty','author':[{'family':'van Example','given':'A'}],'issued':{'date-parts':[[2023]]},'publisher':'Research Press','ISBN':'9781234567890'},
    {'id':'unicode','type':'article-journal','title':'Δ effects: étude and measured changes','author':[{'literal':'مجموعة البحث'}],'issued':{'date-parts':[[2022]]},'DOI':'10.1234/unicode'}
]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output');args=parser.parse_args()
    code="import {parseReferences,exportReferences} from './lib/references.mjs';let raw='';for await(const chunk of process.stdin)raw+=chunk;const records=parseReferences(raw,'csl-json').records.map((s,i)=>({...s,id:'record'+i}));process.stdout.write(JSON.stringify({ris:exportReferences(records,'ris'),bib:exportReferences(records,'bibtex'),csl:exportReferences(records,'csl-json')}));"
    actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps(CASES),text=True,cwd=ROOT))
    ris=rispy.loads(actual['ris']);bib=bibtexparser.loads(actual['bib']).entries;csldata=json.loads(actual['csl'])
    assert len(ris)==len(bib)==len(CASES)==3
    for i,original in enumerate(CASES):
        assert ris[i]['title']==original['title']
        assert csldata[i]['author']==original['author']
        assert str(original['issued']['date-parts'][0][0])==str(ris[i]['year'])==bib[i]['year']
    assert ris[0]['authors']==['Rizk, Mikhaeel','Research consortium']
    assert ris[0]['doi']=='10.1234/example' and bib[0]['doi']=='10.1234/example'
    assert ris[1]['type_of_reference']=='BOOK' and bib[1]['ENTRYTYPE']=='book'
    assert ris[1]['issn']=='9781234567890' # RIS SN is a shared identifier tag; rispy names it issn.
    assert bib[0]['title']==CASES[0]['title'] and bib[2]['title']==CASES[2]['title']
    assert 'Research consortium' in bib[0]['author']
    report={'status':'passed','cases':len(CASES),'readers':{p:importlib.metadata.version(p) for p in ['rispy','bibtexparser']},'checks':['RIS independently parsed with expected authors, titles, dates, DOI and book type','BibTeX independently parsed with expected entry count, authors, titles, dates, DOI and book type','CSL structured author data preserved'],'scope':'Bounded interchange fixtures. Not a Zotero/EndNote browser test, exhaustive format conformance, or journal-style validation.'}
    if args.output:Path(args.output).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
