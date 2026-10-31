import {all, first, json, uid, now, AppError} from './core.mjs';

// This module never grants access to the ordinary owner workspace. Reviewer reads
// use immutable, deliberately restricted snapshots and separate decision storage.
export const SCREENING_LIMITS = {members:20, invitations:25, invitationHistory:500, rounds:5000, snapshotBytes:1024*1024, projectSnapshotBytes:8*1024*1024, invitationHours:72, pageSize:25};
const fail=(message,status=400)=>{throw new AppError(message,status)};
const text=(value,max,label,required=true)=>{
 if(typeof value!=='string'||value.length>max||value.includes('\0')||(required&&!value.trim()))fail('Invalid '+label+'.');
 return value.trim();
};
const email=value=>{const result=text(value,254,'email').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))fail('Enter a valid recipient email.');return result;};
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
const verifySnapshot=async r=>{if(await hash(r.snapshot)!==r.snapshot_hash)fail('The saved evidence snapshot does not match its recorded checksum. No screening action or archive was completed. Preserve the record for investigation.',409);};
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
const choice=value=>{if(!['include','exclude'].includes(value))fail('Choose include or exclude.');return value;};
const revision=value=>{if(!Number.isSafeInteger(value)||value<0)fail('A saved revision is required.');return value;};
const safeProject=p=>({id:p.id,title:p.title});
const memberView=m=>({userId:m.user_id,email:m.email,displayName:m.display_name,status:m.status,revision:m.revision});
const decisionView=d=>d?({reviewer:d.reviewer,decision:d.decision,reason:d.reason,revision:d.revision,submitted:d.submitted}):null;
const invitationView=i=>({id:i.id,email:i.email,status:i.status==='pending'&&i.expires<=now()?'expired':i.status,revision:i.revision,expires:i.expires,created:i.created});

async function batch(db,statements){try{return await db.batch(statements)}catch(e){if(/UNIQUE constraint failed: screening_(rounds|members)/i.test(e.message))fail('Another request changed this screening record. Reload before retrying.',409);throw e;}}
function event(db,{project,roundId=null,action,actor,detail,time,table,id,token}){
 // id/table are supplied only by this module, never by request data.
 return db.prepare(`INSERT INTO screening_events(id,project,round_id,action,actor,detail,created) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE ${id.column}=? AND edit_token=?)`)
  .bind(uid(),project,roundId,action,actor,JSON.stringify(detail),time,id.value,token);
}
function assignmentPredicate(project,reviewer,generation){
 return {sql:'(?=(SELECT owner FROM projects WHERE id=?) OR EXISTS(SELECT 1 FROM screening_members WHERE project=? AND user_id=? AND status=\'active\' AND revision=?))',args:[reviewer,project,project,reviewer,generation]};
}
async function projectAccess(db,id,userId,{ownerOnly=false}={}){
 const p=await first(db,'SELECT id,owner,title,question,criteria FROM projects WHERE id=?',id);
 if(!p)fail('Screening project not found.',404);
 if(p.owner!==userId&&(ownerOnly||!await first(db,"SELECT 1 FROM screening_members WHERE project=? AND user_id=? AND status='active'",id,userId)))fail('Screening project not found.',404);
 return p;
}
async function activeGeneration(db,p,userId){
 if(userId===p.owner)return 0;
 const member=await first(db,"SELECT revision FROM screening_members WHERE project=? AND user_id=? AND status='active'",p.id,userId);
 if(!member)fail('Select two distinct active reviewers.',409);
 return member.revision;
}
async function roundAccess(db,p,id,userId){
 const r=await first(db,'SELECT * FROM screening_rounds WHERE id=? AND project=?',id,p.id);
 if(!r||!(p.owner===userId||r.reviewer_a===userId||r.reviewer_b===userId))fail('Screening round not found.',404);
 if(p.owner!==userId){const member=await first(db,"SELECT revision FROM screening_members WHERE project=? AND user_id=? AND status='active'",p.id,userId);const gen=r.reviewer_a===userId?r.generation_a:r.generation_b;if(!member||member.revision!==gen)fail('Screening assignment is no longer available.',404);}
 await verifySnapshot(r);
 return r;
}
async function decisionCache(db,p,roundIds=null){
 const ds=roundIds?await all(db,`SELECT * FROM screening_decisions WHERE round_id IN (${roundIds.map(()=>'?').join(',')}) ORDER BY reviewer`,...roundIds):await all(db,'SELECT d.* FROM screening_decisions d JOIN screening_rounds r ON r.id=d.round_id WHERE r.project=? ORDER BY d.reviewer',p.id);
 const decisions=new Map();for(const d of ds){if(!decisions.has(d.round_id))decisions.set(d.round_id,[]);decisions.get(d.round_id).push(d);}
 const generations=new Map((await all(db,"SELECT user_id,revision FROM screening_members WHERE project=? AND status='active'",p.id)).map(m=>[m.user_id,m.revision]));generations.set(p.owner,0);
 return {decisions,generations};
}
async function roundView(db,p,r,userId,cache=null,summary=false){
 if(!summary)await verifySnapshot(r);
 cache??=await decisionCache(db,p,[r.id]);
 const ds=cache.decisions.get(r.id)||[];
 const revealed=ds.length===2&&ds.every(d=>d.submitted!==null);
 const own=ds.find(d=>d.reviewer===userId),snapshot=JSON.parse(r.snapshot);
 const assigned=!!own&&cache.generations.get(r.reviewer_a)===r.generation_a&&cache.generations.get(r.reviewer_b)===r.generation_b;
 return {id:r.id,sourceId:r.source_id,stage:r.stage,round:r.round,status:r.status,revision:r.revision,created:r.created,updated:r.updated,snapshotHash:r.snapshot_hash,snapshot,
  reviewerIds:[r.reviewer_a,r.reviewer_b],ownDecision:decisionView(own),decisions:revealed?ds.map(decisionView):null,finalDecision:r.final_decision,finalReason:r.final_reason,resolvedBy:r.resolved_by,
  canSubmit:assigned&&r.status==='open'&&own?.submitted===null,canResolve:p.owner===userId&&r.status==='conflict',canCancel:p.owner===userId&&['open','conflict'].includes(r.status),
  notice:'Decisions refer to the saved criteria and evidence snapshot. This ledger is separate from legacy owner screening. Submitted decisions cannot be edited; corrections require a new round. Current-round choices are concealed until both submit; prior rounds or earlier research may already be known, so repeated rounds do not restore methodological blinding.'};
}

async function createInvitation(db,p,user,b){
 const recipient=email(b.email);if(recipient===email(user.email))fail('Invite a different researcher.');
 if(await first(db,"SELECT 1 FROM screening_members WHERE project=? AND email=? AND status='active'",p.id,recipient))fail('That researcher already has active access.',409);
 const token=secret(),tokenHash=await hash(token),id=uid(),time=now(),expires=time+SCREENING_LIMITS.invitationHours*3600000,writeToken=uid();
 const result=await batch(db,[db.prepare("INSERT INTO screening_invitations(id,project,email,token_hash,status,revision,expires,created_by,accepted_by,edit_token,created,updated) SELECT ?,?,?,?,'pending',1,?,?,NULL,?,?,? WHERE (SELECT COUNT(*) FROM screening_invitations WHERE project=? AND status='pending' AND expires>?)<? AND (SELECT COUNT(*) FROM screening_invitations WHERE project=?)<?")
  .bind(id,p.id,recipient,tokenHash,expires,user.userId,writeToken,time,time,p.id,time,SCREENING_LIMITS.invitations,p.id,SCREENING_LIMITS.invitationHistory),
  event(db,{project:p.id,action:'invitation.created',actor:user.userId,detail:{invitationId:id,email:recipient,expires},time,table:'screening_invitations',id:{column:'id',value:id},token:writeToken})]);
 if(result[0].meta?.changes!==1)fail('Invitation limit reached: 25 pending or 500 retained invitations per project.',409);
 return {id,email:recipient,expires,revision:1,token,notice:'This single-use invitation is bound to this email and expires in 72 hours. Copy it to the intended researcher yourself. No email was sent; the token is shown only now.'};
}
async function acceptInvitation(db,user,b){
 const token=text(b.token,64,'invitation token');if(!/^[a-f0-9]{64}$/.test(token))fail('Invitation is unavailable.',404);
 const tokenHash=await hash(token),recipient=email(user.email),time=now(),writeToken=uid();
 const inv=await first(db,'SELECT * FROM screening_invitations WHERE token_hash=?',tokenHash);
 if(!inv||inv.status!=='pending'||inv.expires<=time||inv.email!==recipient)fail('Invitation is unavailable for this account.',404);
 const p=await first(db,'SELECT id,title,owner FROM projects WHERE id=?',inv.project);if(!p||p.owner===user.userId)fail('The project owner cannot accept a reviewer invitation.',409);
 const count=SCREENING_LIMITS.members;
 const result=await batch(db,[
  db.prepare("UPDATE screening_invitations SET status='accepted',revision=revision+1,accepted_by=?,edit_token=?,updated=? WHERE id=? AND status='pending' AND email=? AND expires>? AND NOT EXISTS(SELECT 1 FROM screening_members WHERE project=? AND (user_id=? OR email=?) AND status='active') AND (EXISTS(SELECT 1 FROM screening_members WHERE project=? AND user_id=?) OR (SELECT COUNT(*) FROM screening_members WHERE project=?)<?)")
   .bind(user.userId,writeToken,time,inv.id,recipient,time,p.id,user.userId,recipient,p.id,user.userId,p.id,count),
  db.prepare("INSERT INTO screening_members(project,user_id,email,display_name,status,revision,edit_token,created,updated) SELECT project,?,?,?,'active',1,?,?,? FROM screening_invitations WHERE id=? AND edit_token=? AND accepted_by=? ON CONFLICT(project,user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,status='active',revision=screening_members.revision+1,edit_token=excluded.edit_token,updated=excluded.updated")
   .bind(user.userId,recipient,text(user.displayName||recipient,250,'display name'),writeToken,time,time,inv.id,writeToken,user.userId),
  event(db,{project:p.id,action:'invitation.accepted',actor:user.userId,detail:{invitationId:inv.id},time,table:'screening_invitations',id:{column:'id',value:inv.id},token:writeToken})]);
 if(result[0].meta?.changes!==1)fail('Invitation was consumed, revoked, or the project member limit was reached.',409);
 return {project:safeProject(p),role:'reviewer'};
}
async function revokeMember(db,p,user,b,target){
 if(target===p.owner)fail('The project owner cannot be revoked.');
 const expected=revision(b.revision),time=now(),token=uid();
 const result=await batch(db,[db.prepare("UPDATE screening_members SET status='revoked',revision=revision+1,edit_token=?,updated=? WHERE project=? AND user_id=? AND status='active' AND revision=?").bind(token,time,p.id,target,expected),
  db.prepare("UPDATE screening_invitations SET status='cancelled',revision=revision+1,updated=? WHERE project=? AND status='pending' AND email=(SELECT email FROM screening_members WHERE project=? AND user_id=? AND edit_token=?)").bind(time,p.id,p.id,target,token),
  db.prepare("INSERT INTO screening_events(id,project,round_id,action,actor,detail,created) SELECT ?,project,NULL,'member.revoked',?,?,? FROM screening_members WHERE project=? AND user_id=? AND edit_token=?")
   .bind(uid(),user.userId,JSON.stringify({userId:target,previousRevision:expected}),time,p.id,target,token)]);
 if(result[0].meta?.changes!==1)fail('Membership changed. Reload the team before retrying.',409);
 return {ok:true,notice:'Access was revoked. Historical decisions remain. Cancel incomplete affected rounds and create replacement rounds with active reviewers.'};
}

async function createRound(db,p,user,b){
 const sourceId=text(b.sourceId,100,'source ID'),stage=b.stage;if(!['title_abstract','full_text'].includes(stage))fail('Choose title/abstract or full-text screening.');
 const reason=text(b.reason,2000,'round reason');
 if(!Array.isArray(b.reviewerIds)||b.reviewerIds.length!==2||b.reviewerIds.some(v=>typeof v!=='string'||v.length>100)||b.reviewerIds[0]===b.reviewerIds[1])fail('Select two distinct active reviewers.');
 const [a,bid]=b.reviewerIds,[ga,gb]=await Promise.all([activeGeneration(db,p,a),activeGeneration(db,p,bid)]);
 const source=await first(db,'SELECT id,title,doi,url,authors,year,abstract,origin FROM sources WHERE id=? AND project=?',sourceId,p.id);if(!source)fail('Source not found in this project.',404);
 const fileRows=stage==='full_text'?await all(db,"SELECT id,name,mime,size,sha256,extracted FROM files WHERE project=? AND source_id=? AND status NOT IN ('uploading','completing','deleting') AND sha256 IS NOT NULL",p.id,sourceId):[];
 if(stage==='full_text'&&!fileRows.length)fail('Full-text screening requires a completed source-linked original file with a checksum.');
 const files=fileRows.map(f=>({id:f.id,name:f.name,mime:f.mime,size:f.size,sha256:f.sha256,text:f.extracted?JSON.parse(f.extracted):null}));
 const review=await first(db,'SELECT data FROM review_workspaces WHERE project=?',p.id),time=now();
 const snapshot={question:p.question,criteria:p.criteria,protocol:review?JSON.parse(review.data).protocol:null,source,files,createdAt:time};
 if(!snapshot.criteria.trim()&&!snapshot.protocol?.eligibility?.trim())fail('Save eligibility criteria in the project brief or review protocol before assigning independent screening.');
 const encoded=JSON.stringify(snapshot),snapshotBytes=new TextEncoder().encode(encoded).length;if(snapshotBytes>SCREENING_LIMITS.snapshotBytes)fail('Evidence snapshot exceeds 1 MiB of UTF-8 text. Use a smaller source-linked evidence file.');
 const digest=await hash(encoded),id=uid(),token=uid(),aa=assignmentPredicate(p.id,a,ga),ab=assignmentPredicate(p.id,bid,gb);
 const result=await batch(db,[db.prepare(`INSERT INTO screening_rounds(id,project,source_id,stage,round,active_key,snapshot,snapshot_hash,reviewer_a,reviewer_b,generation_a,generation_b,status,revision,final_decision,final_reason,resolved_by,edit_token,created,updated)
 SELECT ?,?,?,?,COALESCE((SELECT MAX(round)+1 FROM screening_rounds WHERE project=? AND source_id=? AND stage=?),1),?,?,?,?,?,?,?,'open',1,NULL,NULL,NULL,?,?,? WHERE ${aa.sql} AND ${ab.sql} AND (SELECT COUNT(*) FROM screening_rounds WHERE project=?)<? AND COALESCE((SELECT SUM(length(CAST(snapshot AS BLOB))) FROM screening_rounds WHERE project=?),0)+?<=?
 AND NOT EXISTS(SELECT 1 FROM json_each(?,'$.files') sf WHERE NOT EXISTS(SELECT 1 FROM files f WHERE f.id=json_extract(sf.value,'$.id') AND f.project=? AND f.source_id=? AND f.sha256=json_extract(sf.value,'$.sha256') AND f.size=json_extract(sf.value,'$.size') AND f.status NOT IN ('uploading','completing','deleting')))`)
  .bind(id,p.id,sourceId,stage,p.id,sourceId,stage,sourceId+':'+stage,encoded,digest,a,bid,ga,gb,token,time,time,...aa.args,...ab.args,p.id,SCREENING_LIMITS.rounds,p.id,snapshotBytes,SCREENING_LIMITS.projectSnapshotBytes,encoded,p.id,sourceId),
  db.prepare("INSERT INTO screening_decisions(round_id,reviewer,decision,reason,revision,edit_token,submitted) SELECT id,reviewer_a,NULL,'',0,'',NULL FROM screening_rounds WHERE id=? AND edit_token=?").bind(id,token),
  db.prepare("INSERT INTO screening_decisions(round_id,reviewer,decision,reason,revision,edit_token,submitted) SELECT id,reviewer_b,NULL,'',0,'',NULL FROM screening_rounds WHERE id=? AND edit_token=?").bind(id,token),
  event(db,{project:p.id,roundId:id,action:'round.created',actor:user.userId,detail:{reason,snapshotHash:digest,reviewerIds:[a,bid]},time,table:'screening_rounds',id:{column:'id',value:id},token})]);
 if(result[0].meta?.changes!==1)fail('Reviewer access or original evidence changed, or the project limit (5,000 rounds / 8 MiB UTF-8 snapshots) was reached.',409);
 return roundView(db,p,await first(db,'SELECT * FROM screening_rounds WHERE id=?',id),user.userId);
}
async function submitDecision(db,p,r,user,b){
 const decision=choice(b.decision),reason=text(b.reason??'',2000,'decision reason',decision==='exclude'),expected=revision(b.revision);
 if(expected!==0)fail('Submitted decisions are immutable. Ask the owner to create a correction round.',409);
 if(![r.reviewer_a,r.reviewer_b].includes(user.userId))fail('Only assigned reviewers can submit.',403);
 const activeA=assignmentPredicate(p.id,r.reviewer_a,r.generation_a),activeB=assignmentPredicate(p.id,r.reviewer_b,r.generation_b),time=now(),token=uid();
 const result=await batch(db,[
  db.prepare(`UPDATE screening_decisions SET decision=?,reason=?,revision=1,edit_token=?,submitted=? WHERE round_id=? AND reviewer=? AND revision=0 AND submitted IS NULL AND EXISTS(SELECT 1 FROM screening_rounds WHERE id=? AND status='open') AND ${activeA.sql} AND ${activeB.sql}`)
   .bind(decision,reason,token,time,r.id,user.userId,r.id,...activeA.args,...activeB.args),
  db.prepare(`UPDATE screening_rounds SET revision=revision+1,updated=?,edit_token=?,status=CASE WHEN (SELECT COUNT(*) FROM screening_decisions WHERE round_id=? AND submitted IS NOT NULL)=2 THEN CASE WHEN (SELECT COUNT(DISTINCT decision) FROM screening_decisions WHERE round_id=?)=1 THEN 'consensus' ELSE 'conflict' END ELSE 'open' END,
   final_decision=CASE WHEN (SELECT COUNT(*) FROM screening_decisions WHERE round_id=? AND submitted IS NOT NULL)=2 AND (SELECT COUNT(DISTINCT decision) FROM screening_decisions WHERE round_id=?)=1 THEN (SELECT MIN(decision) FROM screening_decisions WHERE round_id=?) ELSE NULL END,
   final_reason=CASE WHEN (SELECT COUNT(*) FROM screening_decisions WHERE round_id=? AND submitted IS NOT NULL)=2 AND (SELECT COUNT(DISTINCT decision) FROM screening_decisions WHERE round_id=?)=1 THEN 'Agreement between two independently submitted decisions; individual reasons are retained.' ELSE NULL END,
   active_key=CASE WHEN (SELECT COUNT(*) FROM screening_decisions WHERE round_id=? AND submitted IS NOT NULL)=2 AND (SELECT COUNT(DISTINCT decision) FROM screening_decisions WHERE round_id=?)=1 THEN NULL ELSE active_key END
   WHERE id=? AND EXISTS(SELECT 1 FROM screening_decisions WHERE round_id=? AND reviewer=? AND edit_token=?)`)
   .bind(time,token,r.id,r.id,r.id,r.id,r.id,r.id,r.id,r.id,r.id,r.id,r.id,user.userId,token),
  event(db,{project:p.id,roundId:r.id,action:'decision.submitted',actor:user.userId,detail:{decision,reason,revision:1,snapshotHash:r.snapshot_hash},time,table:'screening_rounds',id:{column:'id',value:r.id},token})]);
 if(result[0].meta?.changes!==1)fail('This decision was already submitted, the round changed, or reviewer access was revoked.',409);
 return roundView(db,p,await first(db,'SELECT * FROM screening_rounds WHERE id=?',r.id),user.userId);
}
async function finishRound(db,p,r,user,b,action){
 const expected=revision(b.revision),reason=text(b.reason,2000,'change reason'),decision=action==='resolve'?choice(b.decision):null,time=now(),token=uid();
 const state=action==='resolve'?'resolved':'cancelled',allowed=action==='resolve'?"status='conflict'":"status IN ('open','conflict')";
 const result=await batch(db,[db.prepare(`UPDATE screening_rounds SET status=?,revision=revision+1,final_decision=?,final_reason=?,resolved_by=?,edit_token=?,updated=?,active_key=NULL WHERE id=? AND project=? AND revision=? AND ${allowed}`)
  .bind(state,decision,reason,user.userId,token,time,r.id,p.id,expected),
  event(db,{project:p.id,roundId:r.id,action:'round.'+state,actor:user.userId,detail:{decision,reason,previousRevision:expected,snapshotHash:r.snapshot_hash},time,table:'screening_rounds',id:{column:'id',value:r.id},token})]);
 if(result[0].meta?.changes!==1)fail('The round changed or is already final. Reload before resolving or cancelling.',409);
 return roundView(db,p,await first(db,'SELECT * FROM screening_rounds WHERE id=?',r.id),user.userId);
}

export async function assertScreeningFileDeletable(db,fileId){
 const referenced=await first(db,"SELECT 1 FROM screening_rounds r,json_each(r.snapshot,'$.files') f WHERE json_extract(f.value,'$.id')=? LIMIT 1",fileId);
 if(referenced)fail('This original file is retained as evidence for independent screening. Export its screening history before planning a separate archival/deletion process.',409);
}
// Claim and round insertion both test each other's state in the same atomic SQL
// write. A read-only precheck cannot protect the original against this race.
export async function claimScreeningFileDeletion(db,fileId){
 const f=await first(db,'SELECT status FROM files WHERE id=?',fileId);
 if(!f)fail('File not found.',404);if(f.status==='deleting')fail('Another deletion is already in progress.',409);
 const result=await db.prepare("UPDATE files SET status='deleting' WHERE id=? AND status=? AND NOT EXISTS(SELECT 1 FROM screening_rounds r,json_each(r.snapshot,'$.files') sf WHERE json_extract(sf.value,'$.id')=?)").bind(fileId,f.status,fileId).run();
 if(result.meta?.changes!==1)fail('The file changed or is retained as independent-screening evidence. It was not deleted.',409);
 return {fileId,previousStatus:f.status};
}
export async function releaseScreeningFileDeletion(db,claim){
 await db.prepare("UPDATE files SET status=? WHERE id=? AND status='deleting'").bind(claim.previousStatus,claim.fileId).run();
}
export async function screeningArchive(db,project,userId,{offset=0,version=null}={}){
 if(!Number.isSafeInteger(offset)||offset<0||offset>SCREENING_LIMITS.rounds)fail('Invalid archive page offset.');
 if(version!==null&&(!Number.isSafeInteger(version)||version<0))fail('Invalid archive version.');
 if(offset>0&&version===null)fail('Continue an archive using its archiveVersion, or restart at page one.');
 const p=await projectAccess(db,project,userId,{ownerOnly:true}),pageSize=10;
 const current=await first(db,'SELECT COALESCE(MAX(rowid),0) n FROM screening_events WHERE project=?',p.id),archiveVersion=current.n;
 if(version!==null&&version!==archiveVersion)fail('Screening records changed during export. Restart at page one to keep the archive pages consistent.',409);
 const totalRounds=(await first(db,'SELECT COUNT(*) n FROM screening_rounds WHERE project=?',p.id)).n;
 const rows=await all(db,'SELECT * FROM screening_rounds WHERE project=? ORDER BY rowid LIMIT ? OFFSET ?',p.id,pageSize,offset),rounds=[],cache=rows.length?await decisionCache(db,p,rows.map(r=>r.id)):null;
 for(const r of rows)rounds.push(await roundView(db,p,r,userId,cache));
 const byId=new Map(rounds.map(r=>[r.id,r]));let concealed=0;
 const eventFilter=rows.length?'round_id IN ('+rows.map(()=>'?').join(',')+')':'0';
 const events=(await all(db,'SELECT id,round_id,action,actor,detail,created FROM screening_events WHERE project=? AND ('+eventFilter+(offset===0?' OR round_id IS NULL':'')+') ORDER BY rowid',p.id,...rows.map(r=>r.id))).map(e=>{
  if(e.action==='decision.submitted'&&!byId.get(e.round_id)?.decisions&&e.actor!==userId){concealed++;return {...e,detail:{concealed:true,notice:'Peer decision hidden until both reviewers submit.'}};}
  return {...e,detail:JSON.parse(e.detail)};
 });
 if((await first(db,'SELECT COALESCE(MAX(rowid),0) n FROM screening_events WHERE project=?',p.id)).n!==archiveVersion)fail('Screening changed while this page was being exported. Restart at page one.',409);
 const hasMore=offset+rows.length<totalRounds;
 return {schema:'evidarium.independent-screening-archive.v1',project:safeProject(p),exportedAt:new Date().toISOString(),archiveVersion,rounds,events,complete:offset===0&&!hasMore&&concealed===0,concealedDecisionEvents:concealed,
  pagination:{offset,pageSize,totalRounds,hasMore,nextOffset:hasMore?offset+rows.length:null},
  notice:'This is an archival PAGE of the independent ledger, separate from legacy owner screening. Download every page using the same archiveVersion; restart if records change. Team/invitation events appear only on page one. No access grants, invitation tokens or original files are included. Peer decisions remain concealed until both submit, including in cancelled rounds; concealedDecisionEvents counts omissions on this page. complete=true only for an unredacted single-page archive. These files are not a full project backup or a one-click import. Retain originals separately.'};
}

export async function handleIndependentScreening(req,ctx){
 const {db,bucket,user,local=false,readBody}=ctx,url=new URL(req.url),parts=url.pathname.replace(/^\/api\/screening\/?/,'').split('/').filter(Boolean),method=req.method;
 if(local)fail('Independent reviewers require distinct authenticated hosted accounts. The standalone local edition is single-user.',409);
 if(!user)fail('Sign in to access independent screening.',401);
 if(!db||!bucket)fail('Workspace storage is unavailable.',503);
 if(method!=='GET'&&method!=='HEAD'){const origin=req.headers.get('origin');if((origin&&origin!==url.origin)||req.headers.get('sec-fetch-site')==='cross-site')fail('Cross-origin writes are not allowed.',403);}
 const read=readBody||(()=>req.json());
 if(parts[0]==='shared'&&parts.length===1&&method==='GET'){
  const rows=await all(db,"SELECT DISTINCT p.id,p.title,CASE WHEN p.owner=? THEN 'owner' ELSE 'reviewer' END role FROM projects p LEFT JOIN screening_members m ON m.project=p.id AND m.user_id=? AND m.status='active' WHERE p.owner=? OR m.user_id IS NOT NULL ORDER BY p.updated DESC",user.userId,user.userId,user.userId);
  return json({projects:rows,local:false});
 }
 if(parts.join('/')==='invitations/accept'&&method==='POST')return json(await acceptInvitation(db,user,await read()));
 if(parts[0]!=='projects'||!parts[1])fail('Screening endpoint not found.',404);
 const project=parts[1],tail=parts.slice(2),ownerOnly=['team','invitations','members','export'].includes(tail[0])||method==='POST'&&tail[0]==='rounds';
 const p=await projectAccess(db,project,user.userId,{ownerOnly});
 if(tail[0]==='team'&&tail.length===1&&method==='GET')return json({project:{...safeProject(p),owner:p.owner},owner:{userId:user.userId,displayName:user.displayName||user.email||'Project owner',email:user.email||''},members:(await all(db,'SELECT * FROM screening_members WHERE project=? ORDER BY created,user_id',p.id)).map(memberView),invitations:(await all(db,'SELECT * FROM screening_invitations WHERE project=? ORDER BY created DESC',p.id)).map(invitationView)});
 if(tail[0]==='invitations'&&tail.length===1&&method==='POST')return json(await createInvitation(db,p,user,await read()),201);
 if(tail[0]==='invitations'&&tail[1]&&tail[2]==='cancel'&&tail.length===3&&method==='POST'){
  const b=await read(),expected=revision(b.revision),time=now(),token=uid(),result=await batch(db,[db.prepare("UPDATE screening_invitations SET status='cancelled',revision=revision+1,edit_token=?,updated=? WHERE id=? AND project=? AND revision=? AND status='pending'").bind(token,time,tail[1],p.id,expected),
   event(db,{project:p.id,action:'invitation.cancelled',actor:user.userId,detail:{invitationId:tail[1]},time,table:'screening_invitations',id:{column:'id',value:tail[1]},token})]);
  if(result[0].meta?.changes!==1)fail('Invitation changed. Reload before retrying.',409);return json({ok:true});
 }
 if(tail[0]==='members'&&tail[1]&&tail[2]==='revoke'&&tail.length===3&&method==='POST')return json(await revokeMember(db,p,user,await read(),tail[1]));
 if(tail[0]==='export'&&tail.length===1&&method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0),version=url.searchParams.has('version')?Number(url.searchParams.get('version')):null;
  return new Response(JSON.stringify(await screeningArchive(db,p.id,user.userId,{offset,version}),null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="evidarium-independent-screening-'+offset+'.json"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(tail[0]!=='rounds')fail('Screening endpoint not found.',404);
 if(tail.length===1&&method==='POST')return json(await createRound(db,p,user,await read()),201);
 if(tail.length===1&&method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>SCREENING_LIMITS.rounds)fail('Invalid screening page offset.');
  const membership= p.owner===user.userId?'':' AND ((reviewer_a=? AND generation_a=(SELECT revision FROM screening_members WHERE project=? AND user_id=? AND status=\'active\')) OR (reviewer_b=? AND generation_b=(SELECT revision FROM screening_members WHERE project=? AND user_id=? AND status=\'active\')))';
  const columns="id,project,source_id,stage,round,reviewer_a,reviewer_b,generation_a,generation_b,status,revision,final_decision,final_reason,resolved_by,created,updated,snapshot_hash,json_object('source',json_object('title',json_extract(snapshot,'$.source.title'))) AS snapshot";
  const rows=await all(db,'SELECT '+columns+' FROM screening_rounds WHERE project=?'+membership+' ORDER BY created DESC,rowid DESC LIMIT ? OFFSET ?',p.id,...(p.owner===user.userId?[]:[user.userId,p.id,user.userId,user.userId,p.id,user.userId]),SCREENING_LIMITS.pageSize+1,offset),page=rows.slice(0,SCREENING_LIMITS.pageSize),rounds=[];
  const cache=page.length?await decisionCache(db,p,page.map(r=>r.id)):null;
  for(const r of page)rounds.push({...await roundView(db,p,r,user.userId,cache,true),summary:true});
  return json({project:safeProject(p),isOwner:p.owner===user.userId,userId:user.userId,rounds,hasMore:rows.length>SCREENING_LIMITS.pageSize,nextOffset:rows.length>SCREENING_LIMITS.pageSize?offset+SCREENING_LIMITS.pageSize:null});
 }
 const r=await roundAccess(db,p,tail[1],user.userId);
 if(tail.length===2&&method==='GET')return json(await roundView(db,p,r,user.userId));
 if(tail[2]==='decision'&&tail.length===3&&method==='PUT')return json(await submitDecision(db,p,r,user,await read()));
 if(['resolve','cancel'].includes(tail[2])&&tail.length===3&&method==='POST')return json(await finishRound(db,p,r,user,await read(),tail[2]));
 if(tail[2]==='evidence'&&tail[3]&&tail.length===4&&method==='GET'){
  const file=JSON.parse(r.snapshot).files.find(f=>f.id===tail[3]);if(!file)fail('Evidence not assigned to this round.',404);
  const current=await first(db,'SELECT key,sha256,size,source_id FROM files WHERE id=? AND project=?',file.id,p.id);
  if(!current||current.source_id!==r.source_id||current.sha256!==file.sha256||current.size!==file.size)fail('Original evidence is missing or changed. The saved text snapshot remains available.',409);
  const original=await bucket.get(current.key);if(!original)fail('Original evidence is unavailable.',404);
  return new Response(original.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Evidence-SHA256':file.sha256}});
 }
 fail('Screening endpoint not found.',404);
}
