'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {workspaceMessages} from './workspace-messages';
import {workspaceExtraMessages} from './workspace-extra-messages';
import {researchMessages} from './research-messages';
import {reviewMessages} from './review-messages';
import {systemMessages} from './system-messages';
import {translateSystemMessage} from '../../lib/ui-localization.mjs';
import {LOCALE_KEY,resolveLocale,interpolate,formatLocaleNumber,formatLocaleDate,formatLocaleBytes} from '../../lib/locale.mjs';
export type Locale='en'|'ar';
type Params=Record<string,string|number>;
const catalog:Record<string,string>={...systemMessages,...researchMessages,...reviewMessages,...workspaceMessages,...workspaceExtraMessages};
let activeLocale:Locale='en';
export function localizeMessage(message:string,locale:Locale=activeLocale):string{return locale==='ar'?(catalog[message]||translateSystemMessage(message,locale)):message;}
export function translate(message:string,locale:Locale,params?:Params):string{return interpolate(localizeMessage(message,locale),params&&Object.fromEntries(Object.entries(params).map(([key,value])=>[key,typeof value==='number'?formatLocaleNumber(value,locale):value])));}
const labels:Record<string,string>={include:'Include',exclude:'Exclude',unknown:'Unreviewed',unreviewed:'Unreviewed',accepted:'Accepted',rejected:'Rejected',supports:'Supports',contradicts:'Contradicts',context:'Context',title_abstract:'Title and abstract',full_text:'Full text',analysis:'Analysis',awaiting_approval:'Awaiting approval',running:'Running',queued:'Queued',completed:'Completed',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted',imported:'Imported',stored:'Stored',extracted:'Text extracted',uploading:'Uploading',completing:'Completing upload',deleting:'Deletion pending',chat:'Research conversation',system:'Research activity',user:'You',assistant:'Evidarium',source:'Source',file:'Original file',note:'Note',claim:'Claim',manuscript:'Manuscript',conversation:'Conversation',web_describe_csv:'CSV statistics',web_meta_analysis:'Meta-analysis',web_extract_pdf:'PDF text extraction',web_extract_text:'Text extraction',describe_csv:'CSV statistics · Python',extract:'Document extraction',meta_analysis:'Meta-analysis · metafor',screen_rank:'Screening priorities',symbolic_regression:'Equation discovery',mechanism_graph:'Mechanistic claims',paperqa:'Document questions',openscholar:'Literature synthesis',biomni:'Biomedical research',python:'Custom Python',open:'Open',conflict:'Needs resolution',consensus:'Agreement recorded',resolved:'Resolution recorded',owner:'Owner',reviewer:'Reviewer',active:'Active',revoked:'Revoked',pending:'Pending',expired:'Expired',draft:'Draft',unchecked:'Unchecked',verified:'Verified',partial:'Partial',unavailable:'Unavailable',metadata_only:'Metadata only',exact_match:'Exact text match'};
Object.assign(labels,{
  "article.imported": "Article imported",
  "bibliography.imported": "References imported",
  "chat.completed": "Research conversation completed",
  "chat.started": "Research conversation started",
  "chat.tool": "Research tool used",
  "claim.recorded": "Claim recorded",
  "claim.reviewed": "Claim reviewed",
  "decision.submitted": "Independent decision submitted",
  "file.deleted": "Original file deleted",
  "file.report_associated": "Original linked to report",
  "file.stored": "Original file stored",
  "invitation.accepted": "Reviewer invitation accepted",
  "invitation.cancelled": "Reviewer invitation cancelled",
  "invitation.created": "Reviewer invitation created",
  "manuscript.created": "Manuscript created",
  "manuscript.deleted": "Manuscript deleted",
  "manuscript.imported": "Manuscript imported",
  "manuscript.saved": "Manuscript saved",
  "member.revoked": "Reviewer access revoked",
  "note.saved": "Note saved",
  "project.created": "Project created",
  "project.exported": "Project exported",
  "project.import.started": "Project import started",
  "project.imported": "Project imported",
  "protocol.updated": "Protocol updated",
  "review.saved": "Systematic review saved",
  "round.created": "Review round created",
  "round.resolved": "Review round resolved",
  "round.cancelled": "Review round cancelled",
  "screening.decision": "Screening decision recorded",
  "search.completed": "Literature search completed",
  "sources.added": "Sources added",
  "task.approved": "Task approved",
  "task.cancelled": "Task cancelled",
  "task.completed": "Task completed",
  "task.failed": "Task failed",
  "task.proposed": "Task proposed",
  "streaming": "Streaming response",
  "complete": "Complete",
  "tool": "Research activity"
}
);

type Context={locale:Locale;ar:boolean;setLocale:(locale:Locale)=>void;t:(message:string,params?:Params)=>string;pair:(en:string,ar:string)=>string;formatDate:(value:number|string,options?:Intl.DateTimeFormatOptions)=>string;formatNumber:(value:number,options?:Intl.NumberFormatOptions)=>string;formatBytes:(value:number)=>string;label:(code:string)=>string};
const LanguageContext=createContext<Context|null>(null);
export function LocaleProvider({children}:{children:React.ReactNode}){
 const [locale,setLanguage]=useState<Locale>('en'),[ready,setReady]=useState(false);
 useEffect(()=>{let stored:string|null=null;try{stored=localStorage.getItem(LOCALE_KEY)}catch{}const query=new URLSearchParams(location.search).get('lang');const next=resolveLocale({query,stored,browser:navigator.language}) as Locale;activeLocale=next;setLanguage(next);setReady(true);},[]);
 const setLocale=(next:Locale)=>{activeLocale=next;setLanguage(next);try{localStorage.setItem(LOCALE_KEY,next)}catch{}try{const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(history.state,'',url)}catch{}document.documentElement.lang=next;document.documentElement.dir=next==='ar'?'rtl':'ltr';};
 useEffect(()=>{if(!ready)return;activeLocale=locale;document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.title=locale==='ar'?'إفيداريوم — مساحة البحث':'Evidarium — Research workspace';try{localStorage.setItem(LOCALE_KEY,locale)}catch{}},[locale,ready]);
 const value=useMemo<Context>(()=>({locale,ar:locale==='ar',setLocale,t:(key,params)=>translate(key,locale,params),pair:(en,ar)=>locale==='ar'?ar:en,formatDate:(v,o)=>formatLocaleDate(v,locale,o),formatNumber:(n,o)=>formatLocaleNumber(n,locale,o),formatBytes:n=>formatLocaleBytes(n,locale),label:code=>translate(labels[code]||code.replaceAll('_',' '),locale)}),[locale]);
 if(!ready)return <div className="app-loading" aria-busy="true"><span className="brand-mark" aria-hidden="true">E</span><span className="loading-line"/></div>;
 return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLocale(){const value=useContext(LanguageContext);if(!value)throw new Error('LocaleProvider is required.');return value;}
export function LanguageSwitch(){const {locale,setLocale,t}=useLocale();return <div className="language-switch" role="group" aria-label={t('Interface language')}><button type="button" lang="en" aria-pressed={locale==='en'} onClick={()=>setLocale('en')}>English</button><button type="button" lang="ar" aria-pressed={locale==='ar'} onClick={()=>setLocale('ar')}>العربية</button></div>}
