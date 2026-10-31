'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale,localizeMessage} from './i18n';
import {PROTOCOL_FIELDS} from '../lib/review-model.mjs';
import {Check,Copy,Download,LockKeyhole,RefreshCw,ShieldCheck,Users} from 'lucide-react';
import './screening.css';

type Obj=Record<string,any>;
type Notice={key:string;params?:Record<string,string|number>};
type Draft={decision:string;reason:string;resolution:string;resolutionReason:string;cancelReason:string};
const emptyDraft=():Draft=>({decision:'',reason:'',resolution:'',resolutionReason:'',cancelReason:''});
const INVITATION_KEY='evidarium.screening.invitation';
const encode=encodeURIComponent;

// Consume invitation tokens without discarding the active locale or other URL state.
function clearInvitationFragment(){
 const url=new URL(window.location.href);
 url.searchParams.set('screening','1');
 const fragment=new URLSearchParams(url.hash.slice(1));
 fragment.delete('review-invite');
 url.hash=fragment.toString();
 window.history.replaceState(null,'',url.pathname+url.search+url.hash);
}

async function api(path:string,method='GET',body?:unknown){
 const response=await fetch('/api/screening/'+path,{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 let value:Obj;try{value=await response.json()}catch{throw new Error('The server did not return a readable response. Your draft is still here.')}
 if(!response.ok)throw new Error(value.error||'The request could not be completed. Your draft is still here.');
 return value;
}
function download(value:unknown,name:string){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function webUrl(value:unknown){try{const url=new URL(String(value));return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}}
async function loadOwnedEvidence(project:string){
 const response=await fetch('/api/projects/'+encode(project),{cache:'no-store'});
 const value=await response.json() as Obj;
 if(!response.ok)throw new Error(value.error||'The project reference list could not be loaded.');
 return {sources:value.sources as Obj[],files:value.files as Obj[]};
}
async function fileAssociation(fileId:string,body?:Obj){
 const response=await fetch('/api/files/'+encode(fileId)+'/association',{method:body?'PUT':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const value=await response.json() as Obj;
 if(!response.ok)throw new Error(value.error||'The original evidence association could not be updated.');
 return value;
}

export function ScreeningDesk({project='',boot,onDirty}:{project?:string;sources?:Obj[];boot:Obj|null;onDirty?:(dirty:boolean)=>void}){
 const [ownedSources,setOwnedSources]=useState<Obj[]>([]);
 const [ownedFiles,setOwnedFiles]=useState<Obj[]>([]),[linkFileId,setLinkFileId]=useState(''),[association,setAssociation]=useState<Obj|null>(null),[linkSourceId,setLinkSourceId]=useState(''),[linkReason,setLinkReason]=useState('');
 const [archiveProgress,setArchiveProgress]=useState<Obj|null>(null);
 const [tab,setTab]=useState('rounds'),[projects,setProjects]=useState<Obj[]>([]),[pid,setPid]=useState(project),[listing,setListing]=useState<Obj|null>(null),[team,setTeam]=useState<Obj|null>(null),[selected,setSelected]=useState(''),[round,setRound]=useState<Obj|null>(null),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[email,setEmail]=useState(''),[invitation,setInvitation]=useState(''),[createdInvite,setCreatedInvite]=useState<Obj|null>(null),[sourceId,setSourceId]=useState(''),[stage,setStage]=useState('title_abstract'),[reviewerA,setReviewerA]=useState(''),[reviewerB,setReviewerB]=useState(''),[createReason,setCreateReason]=useState(''),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[status,setStatus]=useState<Notice|null>(null),[busy,setBusy]=useState(''),[loading,setLoading]=useState(false),[copied,setCopied]=useState(false);
 const {locale:language,ar,t,formatDate,formatNumber}=useLocale();
 const prefix='projects/'+encode(pid),owner=listing?.isOwner===true,rounds:Obj[]=listing?.rounds||[],draft=selected?(drafts[selected]||emptyDraft()):emptyDraft();
 const associationDirty=!!linkReason.trim()||!!association&&linkSourceId!==(association.sourceId||'');
 const needsChecksum=!!linkFileId&&ownedFiles.some(f=>f.id===linkFileId&&!f.sha256);
 const dirty=Object.values(drafts).some(d=>Object.values(d).some(Boolean))||!!email.trim()||!!createReason.trim()||!!sourceId||associationDirty;
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const requestSeq=useRef(0),roundSeq=useRef(0),associationSeq=useRef(0);
 const activeMembers:Obj[]=team?.members?.filter((m:Obj)=>m.status==='active')||[];
 const people:Obj[]=team?[team.owner,...activeMembers]:[];
 const person=(id:string)=>people.find(p=>p.userId===id)?.displayName||people.find(p=>p.userId===id)?.email||(id===boot?.user?.userId?t("You"):id);
 const choice=(v:string)=>v==='include'?t("Include"):v==='exclude'?t("Exclude"):t("Not submitted");
 const stageLabel=(v:string)=>v==='full_text'?t("Full text"):t("Title and abstract");
 const stateLabel=(v:string)=>({open:t("Independent decisions"),conflict:t("Needs resolution"),consensus:t("Agreement recorded"),resolved:t("Resolution recorded"),cancelled:t("Cancelled · history retained")}[v]||v);
 const date=(value:number)=>value?formatDate(value):'';
 const updateDraft=(field:keyof Draft,value:string)=>{setDrafts(old=>({...old,[selected]:{...(old[selected]||emptyDraft()),[field]:value}}));setStatus(null)};
 function downloadDrafts(){download({schema:'evidarium.screening.drafts',projectId:pid,savedAt:new Date().toISOString(),drafts,invitationForm:{email},assignmentForm:{sourceId,stage,reviewerIds:[reviewerA,reviewerB],reason:createReason},evidenceAssociationForm:{fileId:linkFileId,sourceId:linkSourceId||null,reason:linkReason,revision:association?.revision??null,sha256:association?.sha256??null},notice:'Unsaved personal forms. These are not submitted or verified screening decisions. Re-enter any retained text in the relevant form; this file does not automatically import or submit it.'},'evidarium-unsaved-screening-drafts.json')}
 function clearProjectForms(){setDrafts({});setEmail('');setSourceId('');setStage('title_abstract');setCreateReason('');setLinkFileId('');setAssociation(null);setLinkSourceId('');setLinkReason('');associationSeq.current++;setArchiveProgress(null);setFilter('all')}

 useEffect(()=>{
  const fragment=new URLSearchParams(window.location.hash.slice(1));const token=fragment.get('review-invite');
  if(token){setInvitation(token);try{sessionStorage.setItem(INVITATION_KEY,token)}catch{};clearInvitationFragment()}
  else{try{setInvitation(sessionStorage.getItem(INVITATION_KEY)||'')}catch{}}
 },[]);
 useEffect(()=>{onDirty?.(dirty)},[dirty,onDirty]);
 useEffect(()=>{if(!createdInvite||!team)return;const current=team.invitations.find((i:Obj)=>i.id===createdInvite.id);if(current&&(current.status!=='pending'||current.expires<=Date.now()))setCreatedInvite(null)},[team,createdInvite]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);

 const loadProjects=useCallback(async()=>{
  const value=await api('shared');setProjects(value.projects||[]);setPid(old=>old||value.projects?.[0]?.id||'');
 },[]);
 const loadProject=useCallback(async(id:string)=>{
  if(!id)return;
  const sequence=++requestSeq.current;setLoading(true);setError('');
  try{
   const value=await api('projects/'+encode(id)+'/rounds');
   if(sequence!==requestSeq.current)return;
   setListing(value);setTeam(null);setOwnedSources([]);setOwnedFiles([]);
   if(value.isOwner){const [members,evidence]=await Promise.all([api('projects/'+encode(id)+'/team'),loadOwnedEvidence(id)]);if(sequence!==requestSeq.current)return;setTeam(members);setOwnedSources(evidence.sources);setOwnedFiles(evidence.files);setReviewerA(old=>old||members.owner.userId)}
  }catch(e){if(sequence===requestSeq.current){setError((e as Error).message);setListing(null);setTeam(null);setOwnedSources([]);setOwnedFiles([])}}finally{if(sequence===requestSeq.current)setLoading(false)}
 },[]);
 useEffect(()=>{if(boot?.user&&!boot.local)loadProjects().catch(e=>setError(e.message))},[boot?.user?.userId,boot?.local,loadProjects]);
 useEffect(()=>{setSelected('');setRound(null);setCreatedInvite(null);setArchiveProgress(null);setLinkFileId('');setAssociation(null);setLinkSourceId('');setLinkReason('');associationSeq.current++;setListing(null);setTeam(null);setReviewerA('');setReviewerB('');if(pid&&boot?.user&&!boot.local)void loadProject(pid);return()=>{requestSeq.current++;roundSeq.current++}},[pid,boot?.user?.userId,boot?.local,loadProject]);

 async function selectRound(id:string){
  const seq=++roundSeq.current;setSelected(id);setRound(null);setError('');
  try{const value=await api(prefix+'/rounds/'+encode(id));if(seq===roundSeq.current)setRound(value)}catch(e){if(seq===roundSeq.current)setError((e as Error).message)}
 }
 async function chooseEvidenceFile(id:string){
  if(associationDirty&&!confirm(t("Discard the unsaved evidence association form?")))return;
  const seq=++associationSeq.current;setLinkFileId(id);setAssociation(null);setLinkSourceId('');setLinkReason('');setError('');
  if(!id||!ownedFiles.find(f=>f.id===id)?.sha256)return;
  try{const value=await fileAssociation(id);if(seq===associationSeq.current){setAssociation(value);setLinkSourceId(value.sourceId||'')}}catch(e){if(seq===associationSeq.current)setError((e as Error).message)}
 }
 useEffect(()=>{if(linkFileId&&!association&&ownedFiles.some(f=>f.id===linkFileId&&f.sha256))void chooseEvidenceFile(linkFileId)},[ownedFiles]);
 async function saveEvidenceLink(e:React.FormEvent){e.preventDefault();if(!association)return;await mutate('link-evidence',async()=>{
  const saved=await fileAssociation(linkFileId,{sourceId:linkSourceId||null,revision:association.revision,sha256:association.sha256,reason:linkReason});setAssociation(saved);setLinkSourceId(saved.sourceId||'');setLinkReason('');
  const evidence=await loadOwnedEvidence(pid);setOwnedSources(evidence.sources);setOwnedFiles(evidence.files);setStatus({key:"Original evidence association saved."});
 })}
 async function mutate(key:string,operation:()=>Promise<void>){
  if(busy)return;setBusy(key);setError('');setStatus(null);
  try{await operation()}catch(e){setError((e as Error).message)}finally{setBusy('')}
 }
 function setSavedRound(value:Obj){setRound(value);setListing(old=>old?{...old,rounds:old.rounds.map((r:Obj)=>r.id===value.id?value:r)}:old)}
 async function refresh(){
  await loadProject(pid);await loadProjects();if(selected)await selectRound(selected);
 }
 async function loadMore(){await mutate('more',async()=>{
  const value=await api(prefix+'/rounds?offset='+Number(listing?.nextOffset||0));
  setListing(old=>old?{...old,hasMore:value.hasMore,nextOffset:value.nextOffset,rounds:[...old.rounds,...value.rounds.filter((r:Obj)=>!old.rounds.some((known:Obj)=>known.id===r.id))]}:value);
 })}
 async function exportPage(){await mutate('export',async()=>{
  const offset=archiveProgress?.nextOffset||0;
  const value=await api(prefix+'/export?offset='+offset+(archiveProgress?'&version='+archiveProgress.version:''));
  const pagination=value.pagination;
  const page=Math.floor(pagination.offset/pagination.pageSize)+1;
  download(value,'evidarium-independent-screening-page-'+page+'.json');
  setArchiveProgress({project:pid,version:value.archiveVersion,page,totalPages:Math.max(1,Math.ceil(pagination.totalRounds/pagination.pageSize)),hasMore:pagination.hasMore,nextOffset:pagination.nextOffset,concealed:(archiveProgress?.concealed||0)+value.concealedDecisionEvents});
  setStatus({key:"Archive page downloaded. Keep every page and the original evidence files."});
 })}
 function switchProject(next:string){
  if(dirtyRef.current&&!confirm(t("Discard unsaved forms in this reviewer workspace? Download your drafts first.")))return;
  clearProjectForms();setPid(next);setTab('rounds');setStatus(null);
 }
 async function acceptInvitation(){if(dirtyRef.current&&!confirm(t("Accepting this invitation opens its project. Discard your unsaved forms? Download your drafts first.")))return;await mutate('accept',async()=>{
  const accepted=await api('invitations/accept','POST',{token:invitation});setInvitation('');try{sessionStorage.removeItem(INVITATION_KEY)}catch{}
  clearInvitationFragment();clearProjectForms();setPid(accepted.project.id);setTab('rounds');await loadProjects();setStatus({key:"Invitation accepted. Your assignments appear below."});
 })}
 async function createInvitation(e:React.FormEvent){e.preventDefault();await mutate('invite',async()=>{
  const value=await api(prefix+'/invitations','POST',{email});setCreatedInvite({...value,link:window.location.origin+'/?screening=1#review-invite='+encode(value.token)});setCopied(false);setEmail('');setTeam(await api(prefix+'/team'));setStatus({key:"Invitation created. Copy the link and share it with the named researcher."});
 })}
 async function createRound(e:React.FormEvent){e.preventDefault();await mutate('create',async()=>{
  const value=await api(prefix+'/rounds','POST',{sourceId,stage,reviewerIds:[reviewerA,reviewerB],reason:createReason});setSourceId('');setCreateReason('');setListing(old=>old?{...old,rounds:[value,...old.rounds]}:old);setSelected(value.id);setRound(value);setTab('rounds');setStatus({key:"Assignment saved with a snapshot of its evidence and criteria."});
 })}
 async function submitDecision(e:React.FormEvent){e.preventDefault();await mutate('decision',async()=>{
  const value=await api(prefix+'/rounds/'+encode(selected)+'/decision','PUT',{decision:draft.decision,reason:draft.reason,revision:round?.ownDecision?.revision??0});setSavedRound(value);setDrafts(old=>({...old,[selected]:emptyDraft()}));setStatus({key:"Your decision is saved and locked. Both decisions are revealed only after both reviewers submit."});
 })}
 async function resolve(e:React.FormEvent){e.preventDefault();await mutate('resolve',async()=>{
  const value=await api(prefix+'/rounds/'+encode(selected)+'/resolve','POST',{decision:draft.resolution,reason:draft.resolutionReason,revision:round?.revision});setSavedRound(value);setDrafts(old=>({...old,[selected]:emptyDraft()}));setStatus({key:"Resolution saved with your identity and reason."});
 })}
 async function cancelRound(e:React.FormEvent){e.preventDefault();await mutate('cancel-round',async()=>{
  const value=await api(prefix+'/rounds/'+encode(selected)+'/cancel','POST',{reason:draft.cancelReason,revision:round?.revision});setSavedRound(value);setDrafts(old=>({...old,[selected]:emptyDraft()}));setStatus({key:"Assignment cancelled. Its history is retained."});
 })}

 const introduction=<div className="screening-intro"><div><span className="screening-eyebrow"><Users size={15}/>{t("INDEPENDENT REVIEW")}</span><h3>{t("Two decisions. One transparent record.")}</h3><p>{t("Assess the same evidence independently, then resolve differences with a recorded reason.")}</p></div></div>;
 if(!boot)return <div className="screening-desk" dir={ar?'rtl':'ltr'} lang={language}>{introduction}<div className="screening-body" role="status">{t("Checking your account…")}</div></div>;
 if(boot.local)return <div className="screening-desk" dir={ar?'rtl':'ltr'} lang={language}>{introduction}<div className="screening-body"><div className="screening-notice"><LockKeyhole size={20}/><div><h4>{t("Separate hosted accounts are required")}</h4><p>{t("The local edition has one identity. Opening another tab cannot create an independent reviewer. Use the hosted workspace and invite another researcher there.")}</p></div></div><a className="primary" href="https://evidarium.mikhaeelatef.chatgpt.site/?screening=1" target="_blank" rel="noreferrer">{t("Open hosted review workspace")}</a></div></div>;

 return <div className="screening-desk" dir={ar?'rtl':'ltr'} lang={language}>
  {introduction}
  <div className="screening-body">
   {error&&<div className="screening-error" role="alert"><strong>{t("Action could not be completed")}</strong><p dir="auto">{localizeMessage(error,language)}</p><p>{t("Unsaved decision text remains in this workspace. Refresh saved records before retrying a conflicting submission.")}</p></div>}
   {status&&<div className="screening-success" role="status"><Check size={16}/><span>{t(status.key,status.params)}</span></div>}
   {!boot.user?<div className="screening-empty"><LockKeyhole size={28}/><h4>{t("Sign in as yourself")}</h4><p>{invitation?t("Use the ChatGPT account whose email received this invitation. The invitation is accepted only after you confirm below."):t("Your own account keeps your decisions separate from the other reviewer’s work.")}</p><p className="screening-fine">{t("Sign-in identifies you for project access. It does not use an AI subscription or AI allowance.")}</p><a className="primary" target="_top" href="/signin-with-chatgpt?return_to=%2F%3Fscreening%3D1" onClick={()=>{if(invitation)try{sessionStorage.setItem(INVITATION_KEY,invitation)}catch{}}}>{t("Continue with ChatGPT")}</a></div>:<>
    <div className="screening-account"><ShieldCheck size={16}/><span>{t("Signed in as")} <bdi>{boot.user.email||boot.user.displayName}</bdi></span></div>
    {dirty&&<div className="screening-draft-safety"><div><strong>{t("You have unsaved forms")}</strong><p>{t("Your decision, invitation, assignment and evidence-link drafts remain while this workspace is open, including after a failed save. They are not automatically saved across a reload. Download them before leaving; downloaded text can be re-entered manually.")}</p></div><button className="secondary" onClick={downloadDrafts}><Download size={15}/>{t("Download drafts")}</button></div>}
    {invitation&&<div className="screening-invitation"><h4>{t("Accept a reviewer invitation")}</h4><p>{t("Accepting grants access to the evidence assigned to you. It does not submit a screening decision. Your signed-in email must match the invitation.")}</p><button className="primary" disabled={!!busy} onClick={acceptInvitation}>{busy==='accept'?t("Accepting…"):t("Accept with this account")}</button><button className="secondary" disabled={!!busy} onClick={()=>{setInvitation('');try{sessionStorage.removeItem(INVITATION_KEY)}catch{}}}>{t("Dismiss invitation")}</button></div>}
    <div className="screening-toolbar"><label>{t("Research project")}<select value={pid} disabled={!!busy} onChange={e=>switchProject(e.target.value)}><option value="">{t("Choose a project")}</option>{projects.map(p=><option dir="auto" key={p.id} value={p.id}>{p.title} · {p.role==='owner'?t("Owner"):t("Reviewer")}</option>)}</select></label><button className="secondary" disabled={!!busy||loading||!pid} onClick={()=>void mutate('refresh',refresh)}><RefreshCw size={15}/>{t("Refresh saved records")}</button></div>
    {!pid?<div className="screening-empty"><Users size={28}/><h4>{t("Your assignments will appear here")}</h4><p>{t("Accept an invitation, or create a research project in the workspace and return here.")}</p></div>:loading?<p role="status">{t("Loading saved assignments…")}</p>:listing&&<>
     <nav className="screening-tabs" aria-label={t("Independent review sections")}>
      <button className={tab==='rounds'?'selected':''} aria-current={tab==='rounds'?'page':undefined} onClick={()=>setTab('rounds')}>{t("Screening")}</button>
      {owner&&<><button className={tab==='assign'?'selected':''} aria-current={tab==='assign'?'page':undefined} onClick={()=>setTab('assign')}>{t("Assign evidence")}</button><button className={tab==='team'?'selected':''} aria-current={tab==='team'?'page':undefined} onClick={()=>setTab('team')}>{t("Review team")}</button><button className={tab==='export'?'selected':''} aria-current={tab==='export'?'page':undefined} onClick={()=>setTab('export')}>{t("Record & export")}</button></>}
     </nav>
     {tab==='rounds'&&<>
      <div className="screening-notice"><LockKeyhole size={18}/><p>{t("Each decision stays private until both reviewers submit. Submitted decisions are locked. The final result is recorded in this independent-review ledger, separately from the workspace’s earlier single-reviewer labels.")}</p></div>
      <label className="screening-filter">{t("Show assignments")}<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{t("All assignments")}</option><option value="mine">{t("Waiting for my decision")}</option><option value="conflict">{t("Disagreements")}</option><option value="final">{t("Final decisions")}</option></select></label>
      <div className="screening-round-list">{rounds.filter(r=>filter==='all'||filter==='mine'&&r.canSubmit||filter==='conflict'&&r.status==='conflict'||filter==='final'&&['consensus','resolved'].includes(r.status)).map(r=><button key={r.id} className={'screening-round '+(selected===r.id?'selected':'')} disabled={!!busy} onClick={()=>void selectRound(r.id)} aria-pressed={selected===r.id}><span className="screening-round-title" dir="auto">{r.snapshot?.source?.title||r.sourceId}</span><span className="screening-round-meta"><span>{stageLabel(r.stage)} · {t("Round")} {formatNumber(r.round)}</span><span className={'screening-badge '+r.status}>{stateLabel(r.status)}</span></span></button>)}</div>
      {listing.hasMore&&<div className="screening-pagination"><p className="screening-fine">{t("Filters apply to the loaded assignments. Load more to inspect earlier rounds.")}</p><button className="secondary" disabled={!!busy} onClick={loadMore}>{busy==='more'?t("Loading…"):t("Load more assignments")}</button></div>}
      {!rounds.length&&<div className="screening-empty"><h4>{t("No independent assignments yet")}</h4><p>{owner?t("Invite a reviewer, then assign the same report to two different accounts."):t("The project owner has not assigned evidence to you yet.")}</p>{owner&&<button className="secondary" onClick={()=>setTab('team')}>{t("Set up the review team")}</button>}</div>}
      {selected&&!round&&!error&&<p role="status">{t("Loading the evidence snapshot…")}</p>}
      {round&&<article className="screening-detail" aria-label={t("Selected screening assignment")}>
       {round.round>1&&<div className="screening-notice"><p>{t("This is a later round. Reviewers may know earlier decisions; hiding the current decisions does not restore independent blinding. Record that limitation when reporting your methods.")}</p></div>}
       <div className="screening-detail-heading"><div><span className="screening-eyebrow">{stageLabel(round.stage)} · {t("Round")} {formatNumber(round.round)}</span><h4 dir="auto">{round.snapshot.source.title}</h4><p dir="auto">{[round.snapshot.source.authors,round.snapshot.source.year].filter(Boolean).join(' · ')}</p></div><span className={'screening-badge '+round.status}>{stateLabel(round.status)}</span></div>
       <details className="screening-evidence" open><summary>{t("Eligibility criteria saved for this assignment")}</summary><h5>{t("Research question")}</h5><p dir="auto">{round.snapshot.question||t("No question recorded.")}</p><h5>{t("Criteria")}</h5><p className="screening-preserve" dir="auto">{round.snapshot.criteria||t("No criteria recorded in the project brief. Inspect the protocol below before deciding.")}</p>{round.snapshot.protocol&&<details><summary>{t("Structured protocol snapshot")}</summary><dl>{Object.entries(round.snapshot.protocol).map(([key,value])=><div key={key}><dt>{t(PROTOCOL_FIELDS.find(([field])=>field===key)?.[1]||key)}</dt><dd className="screening-preserve" dir="auto">{typeof value==='string'?value:JSON.stringify(value,null,2)}</dd></div>)}</dl></details>}</details>
       <details className="screening-evidence" open><summary>{t("Source evidence")}</summary><h5>{t("Abstract")}</h5><p className="screening-preserve" dir="auto">{round.snapshot.source.abstract||t("No abstract is available in this saved record. Do not infer missing evidence.")}</p>{webUrl(round.snapshot.source.url)&&<a href={webUrl(round.snapshot.source.url)!} target="_blank" rel="noreferrer">{t("Open source website")} ↗</a>}
        {(round.snapshot.files||[]).map((file:Obj)=><details key={file.id} className="screening-file"><summary><bdi>{file.name}</bdi></summary><p>{t("Saved evidence file")} · <bdi>{file.mime}</bdi></p><a className="secondary" target="_blank" rel="noreferrer" href={'/api/screening/'+prefix+'/rounds/'+encode(round.id)+'/evidence/'+encode(file.id)}>{t("Download original evidence")}</a>{file.text&&<div className="screening-fine"><p>{file.text.complete?t("Extraction report marked complete. Inspect the original for figures, tables and extraction errors."):t("Extraction is partial or has method limitations. Inspect the original before deciding.")}</p>{[...(file.text.warnings||[]),...(file.text.limitations||[])].map((warning:string,index:number)=><p key={index} dir="auto">{localizeMessage(warning,language)}</p>)}</div>}{file.text?.segments?.length?<div className="screening-segments">{file.text.segments.map((segment:Obj,i:number)=><section key={i}><h5 dir="auto">{segment.location?localizeMessage(segment.location,language):formatNumber(i+1)}</h5><p className="screening-preserve" dir="auto">{segment.text}</p></section>)}</div>:<p>{t("No extracted text is available in this snapshot. Inspect the original file.")}</p>}</details>)}
       </details>
       {round.canSubmit&&<form className="screening-decision-form" onSubmit={submitDecision}><h4>{t("Your independent decision")}</h4><p>{t("Read the saved criteria and evidence before submitting. Your choice and reason will become visible when both reviewers have submitted.")}</p><fieldset disabled={!!busy}><legend>{t("Decision")}</legend><div className="screening-choices">{['include','exclude'].map(value=><label key={value} className={draft.decision===value?'selected':''}><input type="radio" name={'decision-'+round.id} value={value} checked={draft.decision===value} onChange={()=>updateDraft('decision',value)} required/>{choice(value)}</label>)}</div><label>{t("Reason and relevant criterion")}<textarea dir="auto" rows={4} maxLength={2000} value={draft.reason} onChange={e=>updateDraft('reason',e.target.value)} required/></label><p className="screening-fine">{t("If evidence is insufficient, leave this assignment unsubmitted and obtain the missing material. An uncertain decision is not an inclusion or exclusion.")}</p><div className="screening-actions"><button className="primary" disabled={!draft.decision||!draft.reason.trim()}><LockKeyhole size={15}/>{busy==='decision'?t("Saving…"):t("Submit and lock my decision")}</button><button type="button" className="secondary" onClick={()=>download({schema:'evidarium.screening.draft',project:pid,round:round.id,snapshotHash:round.snapshotHash,decision:draft.decision,reason:draft.reason,notice:'Unsaved personal draft, not a submitted review decision.'},'evidarium-decision-draft.json')}><Download size={15}/>{t("Download unsaved draft")}</button></div></fieldset></form>}
       {round.ownDecision?.submitted&&<div className="screening-own-decision"><LockKeyhole size={16}/><div><strong>{t("Your locked decision")}: {choice(round.ownDecision.decision)}</strong><p dir="auto">{round.ownDecision.reason}</p><small>{date(round.ownDecision.submitted)}</small></div></div>}
       {!round.decisions&&!round.canSubmit&&round.status==='open'&&<p className="screening-notice">{t("The other decision remains concealed until both reviewers submit.")}</p>}
       {round.decisions&&<div className="screening-revealed"><h4>{t("Both submitted decisions")}</h4>{round.decisions.map((d:Obj)=><div key={d.reviewer} className="screening-reviewer-decision"><strong><bdi>{person(d.reviewer)}</bdi> · {choice(d.decision)}</strong><p dir="auto">{d.reason}</p><small>{date(d.submitted)}</small></div>)}</div>}
       {round.finalDecision&&<div className="screening-final"><Check size={20}/><div><h4>{t("Recorded outcome")}: {choice(round.finalDecision)}</h4><p dir="auto">{round.finalReason}</p><p className="screening-fine">{round.status==='resolved'?t("Resolved by the project owner. This is not an independent third-reviewer assessment."):t("Agreement between the two assigned reviewers. This records selection, not scientific validity.")}</p></div></div>}
       {round.canResolve&&<form className="screening-resolution" onSubmit={resolve}><h4>{t("Resolve the disagreement")}</h4><p>{t("Discuss the evidence and record why the final decision follows the protocol. Both original decisions are preserved.")}</p><fieldset disabled={!!busy}><label>{t("Final decision")}<select required value={draft.resolution} onChange={e=>updateDraft('resolution',e.target.value)}><option value="">{t("Choose")}</option><option value="include">{choice('include')}</option><option value="exclude">{choice('exclude')}</option></select></label><label>{t("Resolution reason")}<textarea dir="auto" required rows={4} maxLength={2000} value={draft.resolutionReason} onChange={e=>updateDraft('resolutionReason',e.target.value)}/></label><button className="primary" disabled={!draft.resolution||!draft.resolutionReason.trim()}>{t("Record owner resolution")}</button></fieldset></form>}
       <details className="screening-provenance"><summary>{t("Assignment provenance and corrections")}</summary><dl><div><dt>{t("Created")}</dt><dd>{date(round.created)}</dd></div><div><dt>{t("Snapshot fingerprint")}</dt><dd><code dir="ltr">{round.snapshotHash}</code></dd></div><div><dt>{t("Assigned accounts")}</dt><dd>{round.reviewerIds.map((id:string)=><p key={id}><bdi>{person(id)}</bdi></p>)}</dd></div></dl><p>{t("This assignment retains the evidence and criteria captured when it was created. Later changes do not rewrite the snapshot. A corrected assignment must be a new round with an explicit reason.")}</p>{round.canCancel&&<form onSubmit={cancelRound}><label>{t("Reason for cancelling this round")}<textarea dir="auto" required disabled={!!busy} rows={3} maxLength={2000} value={draft.cancelReason} onChange={e=>updateDraft('cancelReason',e.target.value)}/></label><button className="secondary" disabled={!!busy||!draft.cancelReason.trim()}>{t("Cancel round and preserve history")}</button></form>}</details>
      </article>}
     </>}
     {tab==='assign'&&owner&&<section className="screening-evidence-link">
      <h4>{t("Associate an original with its report")}</h4>
      <p>{t("To prepare full-text evidence: upload the original in Files, run Extract text (or PDF extraction) to record its full checksum, refresh here, link it to the correct report, then assign the review. Confirm that the original actually belongs to that report. Extraction limitations still require inspection of the original.")}</p>
      <label>{t("Uploaded original")}<select value={linkFileId} disabled={!!busy} onChange={e=>void chooseEvidenceFile(e.target.value)}><option value="">{t("Choose a completed file")}</option>{ownedFiles.filter(f=>!['uploading','completing','deleting'].includes(f.status)).map(f=><option dir="auto" key={f.id} value={f.id}>{f.name}{!f.sha256?' · '+t("Extract text first"):''}{f.source_id?' · '+(ownedSources.find(s=>s.id===f.source_id)?.title||t("Linked report")):''}</option>)}</select></label>
      {needsChecksum&&<p className="screening-notice">{t("This upload has no complete file checksum yet. In Files, run Extract text and inspect its result, then return and refresh saved records. Only successfully extracted supported files can be linked at present. A saved original alone does not make it ready for a full-text assignment.")}</p>}
      {linkFileId&&!association&&!error&&!needsChecksum&&<p role="status">{t("Checking the saved file association…")}</p>}
      {association&&<form onSubmit={saveEvidenceLink}><fieldset disabled={!!busy||association.locked}><label>{t("Report this original belongs to")}<select value={linkSourceId} onChange={e=>setLinkSourceId(e.target.value)}><option value="">{t("No linked report")}</option>{ownedSources.map(s=><option dir="auto" key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>{t("Reason for this association change")}<textarea required dir="auto" rows={3} maxLength={2000} value={linkReason} onChange={e=>setLinkReason(e.target.value)}/></label><button className="secondary" disabled={!linkReason.trim()||linkSourceId===(association.sourceId||'')}>{t("Save evidence association")}</button></fieldset>{association.locked&&<p className="screening-notice">{t("This original is retained as review evidence. Its association is locked to preserve the research record. Use a separate original for a different report.")}</p>}</form>}
     </section>}
     {tab==='assign'&&owner&&<section><h4>{t("Assign the same evidence to two people")}</h4><p>{t("A saved snapshot keeps the question, criteria and evidence consistent for both reviewers. Assign only after the protocol is ready.")}</p><form onSubmit={createRound}><fieldset disabled={!!busy||!team}><label>{t("Saved report")}<select required value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">{t("Choose a report")}</option>{ownedSources.map(s=><option dir="auto" key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>{t("Screening stage")}<select value={stage} onChange={e=>setStage(e.target.value)}><option value="title_abstract">{stageLabel('title_abstract')}</option><option value="full_text">{stageLabel('full_text')}</option></select></label><div className="screening-grid">{[[reviewerA,setReviewerA,t("First reviewer")],[reviewerB,setReviewerB,t("Second reviewer")]].map(([value,setValue,label],index)=><label key={index}>{String(label)}<select required value={value as string} onChange={e=>(setValue as (value:string)=>void)(e.target.value)}><option value="">{t("Choose an account")}</option>{people.map(p=><option dir="auto" key={p.userId} value={p.userId} disabled={index===0?p.userId===reviewerB:p.userId===reviewerA}>{p.displayName||p.email||p.userId}{p.userId===team?.owner.userId?' · '+t("Owner"):''}</option>)}</select></label>)}</div><label>{t("Assignment reason / round change")}<textarea dir="auto" required rows={3} maxLength={2000} value={createReason} onChange={e=>setCreateReason(e.target.value)}/></label><button className="primary" disabled={!sourceId||!reviewerA||!reviewerB||reviewerA===reviewerB||!createReason.trim()}>{busy==='create'?t("Saving assignment…"):t("Save independent assignment")}</button></fieldset></form>{!ownedSources.length&&<p className="screening-notice">{t("No saved references are available in this project. Add references in the main workspace, then refresh here.")}</p>}{!activeMembers.length&&<p className="screening-notice">{t("At least one other researcher must accept an invitation before a pair can be assigned.")}</p>}</section>}
     {tab==='team'&&owner&&team&&<section><h4>{t("Invite a specific researcher")}</h4><p>{t("The invitation is bound to the email used for ChatGPT sign-in. You share the link yourself; no email is sent automatically. Reviewers receive assigned evidence, not your whole private project.")}</p><form onSubmit={createInvitation}><fieldset disabled={!!busy}><label>{t("Reviewer’s ChatGPT account email")}<input type="email" dir="ltr" required autoComplete="off" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="primary" disabled={!email.trim()}>{t("Create invitation link")}</button></fieldset></form>{createdInvite&&<div className="screening-invitation"><strong>{t("Copy this link now")}</strong><p><bdi>{createdInvite.email}</bdi> · {t("Expires")} {date(createdInvite.expires)}</p><label>{t("Single-use invitation link")}<input dir="ltr" readOnly value={createdInvite.link} onFocus={e=>e.target.select()}/></label><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(createdInvite.link);setCopied(true)}catch{setError("Copy is unavailable. Select the link and copy it manually.")}}}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?t("Copied"):t("Copy invitation")}</button><p className="screening-fine">{t("This link is shown only in this session. A new link is needed if it is lost.")}</p></div>}
      <h4>{t("Researcher access")}</h4><div className="screening-team-row"><div><strong><bdi>{team.owner.displayName||team.owner.email}</bdi></strong><small>{t("Project owner")}</small></div></div>{team.members.map((m:Obj)=><div className="screening-team-row" key={m.userId}><div><strong><bdi>{m.displayName||m.email||m.userId}</bdi></strong><small><bdi>{m.email}</bdi> · {m.status==='active'?t("Active reviewer"):t("Access revoked")}</small></div>{m.status==='active'&&<button className="secondary" disabled={!!busy} onClick={()=>{if(!confirm(t("Revoke this reviewer’s access? Their existing contributions remain in the record.")))return;void mutate('revoke',async()=>{await api(prefix+'/members/'+encode(m.userId)+'/revoke','POST',{revision:m.revision});setTeam(await api(prefix+'/team'));setStatus({key:"Access revoked; existing contributions preserved."})})}}>{t("Revoke access")}</button>}</div>)}
      <h4>{t("Invitations")}</h4>{!team.invitations.length&&<p>{t("No invitations created.")}</p>}{team.invitations.map((i:Obj)=><div className="screening-team-row" key={i.id}><div><strong><bdi>{i.email}</bdi></strong><small>{i.status==='pending'?t("Pending"):i.status==='accepted'?t("Accepted"):i.status==='cancelled'?t("Cancelled"):i.status==='expired'?t("Expired"):i.status} · {t("Expires")} {date(i.expires)}</small></div>{i.status==='pending'&&<button className="secondary" disabled={!!busy} onClick={()=>void mutate('cancel-invite',async()=>{await api(prefix+'/invitations/'+encode(i.id)+'/cancel','POST',{revision:i.revision});if(createdInvite?.id===i.id)setCreatedInvite(null);setTeam(await api(prefix+'/team'));setStatus({key:"Invitation cancelled."})})}>{t("Cancel invitation")}</button>}</div>)}</section>}
     {tab==='export'&&owner&&<section><h4>{t("An inspectable record of selection")}</h4><p>{t("The archive includes assignment snapshots, permitted decision details, resolutions and events. Unrevealed decisions by another reviewer are withheld. It is not a complete backup while decisions are concealed, and importing it does not recreate live membership or verified decisions.")}</p><p>{t("The archive is downloaded in numbered pages. Keep all pages from one export together. If the record changes while downloading, restart the export to obtain matching pages.")}</p><div className="screening-actions"><button className="primary" disabled={!!busy||!!archiveProgress&&!archiveProgress.hasMore} onClick={exportPage}><Download size={16}/>{archiveProgress?t("Download next archive page"):t("Download first archive page")}</button>{archiveProgress&&<button className="secondary" disabled={!!busy} onClick={()=>{setArchiveProgress(null);setStatus(null);setError('')}}>{t("Restart archive export")}</button>}</div>{archiveProgress&&<div className="screening-notice" role="status"><p>{t("Downloaded page")} {formatNumber(archiveProgress.page)} / {formatNumber(archiveProgress.totalPages)}. {archiveProgress.hasMore?t("More pages remain."):t("All numbered pages downloaded.")} {archiveProgress.concealed>0&&t("Some peer decisions are concealed; this export is not a complete backup.")}</p></div>}<div className="screening-notice"><p>{t("These are report-level screening decisions, not unique-study counts or a complete PRISMA flow diagram. Agreement does not establish study quality or the validity of a scientific conclusion.")}</p></div></section>}
    </>}
   </>}
  </div>
 </div>;
}
