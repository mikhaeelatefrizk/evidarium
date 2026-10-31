import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveLocale,interpolate,formatLocaleDate,formatLocaleBytes,formatLocaleNumber,pluralCategory,LOCALE_KEY} from '../lib/locale.mjs';
import {translateSystemMessage,systemMessages} from '../lib/ui-localization.mjs';

test('explicit language choice wins, persists independently of browser language, and invalid values are ignored',()=>{
  assert.equal(LOCALE_KEY,'evidarium.locale');
  assert.equal(resolveLocale({query:'en',stored:'ar',browser:'ar-EG'}),'en');
  assert.equal(resolveLocale({stored:'ar',browser:'en-GB'}),'ar');
  assert.equal(resolveLocale({query:'fr',stored:'en',browser:'ar-EG'}),'en');
  assert.equal(resolveLocale({query:'<script>',stored:'EN',browser:'ar-SA'}),'ar');
  assert.equal(resolveLocale({stored:'not-a-locale',browser:'de-DE'}),'en');
  assert.equal(resolveLocale(),'en');
});

test('interpolation preserves research text and unknown placeholders without executing content',()=>{
  const title='Trial A — تجربة ألف <script>alert(1)</script> {count}';
  assert.equal(interpolate('المشروع: {title} · {count} · {missing}',{title,count:2}),`المشروع: ${title} · 2 · {missing}`);
  assert.equal(interpolate('{toString}',{}),'{toString}');
});

test('Arabic formatting uses the selected locale and accounts for all six plural categories',()=>{
  assert.deepEqual([0,1,2,3,11,100].map(n=>pluralCategory(n,'ar')),['zero','one','two','few','many','other']);
  assert.equal(pluralCategory(2,'en'),'other');
  assert.match(formatLocaleBytes(1024,'ar'),/ك\.بايت/);
  assert.equal(formatLocaleBytes(1024,'en'),'1 KiB');
  assert.equal(formatLocaleNumber(12345.5,'ar'),'12,345.5');
  assert.match(formatLocaleDate('2026-10-31T12:00:00Z','ar',{month:'long',timeZone:'UTC'}),/أكتوبر/);
  assert.equal(formatLocaleDate('not a date','ar'),'—');
});

test('translation of an integrity failure retains its meaning and English remains byte-for-byte unchanged',()=>{
  const failure='The original bytes no longer match their recorded checksum. No extraction was saved.';
  assert.equal(translateSystemMessage(failure,'en'),failure);
  const ar=translateSystemMessage(failure,'ar');
  assert.match(ar,/بصمة التحقق/);
  assert.match(ar,/لم يُحفظ أي استخراج/);
  assert.match(translateSystemMessage('The selected file differs from the interrupted upload. No new parts were sent.','ar'),/لم تُرسل أجزاء جديدة/);
  assert.match(translateSystemMessage('Peer decision hidden until both reviewers submit.','ar'),/حتى يقدم المراجعان/);
});

test('bounded dynamic messages preserve numbers and only translate known application field names',()=>{
  assert.equal(translateSystemMessage('Uploading · 42%','ar'),'جارٍ الرفع · 42%');
  assert.equal(translateSystemMessage('Invalid source title. Nothing was imported.','ar'),'عنوان المصدر غير صالح. لم يُستورد أي شيء.');
  assert.match(translateSystemMessage('CSV record 4 has 3 fields; expected 2. Nothing was silently dropped.','ar'),/4.*3.*2/);
  assert.equal(translateSystemMessage('Invalid Trial B. Nothing was imported.','ar'),'Invalid Trial B. Nothing was imported.');
  assert.equal(translateSystemMessage('Invalid constructor.','ar'),'Invalid constructor.');
  assert.equal(translateSystemMessage('Unknown provider detail 43','ar'),'Unknown provider detail 43');
  assert.equal(translateSystemMessage('The trial reported 42 participants.','ar'),'The trial reported 42 participants.');
});

test('network and malformed-response failures are understandable without exposing a response body',()=>{
  assert.match(translateSystemMessage('Failed to fetch','ar'),/تعذر الاتصال/);
  assert.match(translateSystemMessage('The server returned an unreadable response. Please retry.','ar'),/أعد المحاولة/);
  assert.match(translateSystemMessage('The selected file is not valid project JSON.','ar'),/ليس ملف JSON صالحاً/);
  assert.match(translateSystemMessage('Expected property name or \'}\' in JSON at position 1 (line 1 column 2)','ar'),/الموضع 1.*السطر 1.*العمود 2/);
  const raw='Unexpected token \'<\', "<html>private" is not valid JSON';
  const translated=translateSystemMessage(raw,'ar');
  assert.match(translated,/رمز غير متوقع/);assert.ok(!translated.includes('private'));
  assert.equal(translateSystemMessage(raw,'en'),raw);
});

test('tool notifications translate only the fixed frame and preserve the research query',()=>{
  const completed='web_extract_text completed. Review the result and input fingerprint in Activity.';
  assert.equal(translateSystemMessage(completed,'ar'),'اكتمل استخراج النص. راجع النتيجة وبصمة ملف الإدخال في سجل النشاط.');
  assert.equal(translateSystemMessage(completed,'en'),completed);
  const unknown='unrecognised_engine completed. Review the result and input fingerprint in Activity.';
  assert.equal(translateSystemMessage(unknown,'ar'),unknown);
  const query='العلاج A AND "no effect"';
  const translated=translateSystemMessage(`Crossref returned 3 records for “${query}”. Review them in the evidence panel; add the records you want to track.`,'ar');
  assert.ok(translated.includes(query));
  assert.match(translated,/\u2068.*\u2069/);
  assert.match(translateSystemMessage('web_extract_text failed: Upload checksum mismatch.. No completed result was recorded.','ar'),/لم تُسجّل نتيجة مكتملة/);
});

test('evidence locations can be localized for display without changing the stored locator',()=>{
  const segment={location:'JATS table row 12',text:'The mean was 4.'};
  const before=JSON.stringify(segment);
  assert.equal(translateSystemMessage(segment.location,'ar'),'JATS صف جدول 12');
  assert.equal(JSON.stringify(segment),before);
  assert.equal(translateSystemMessage('page 7','ar'),'الصفحة 7');
  assert.equal(translateSystemMessage('sheet Trial A','ar'),'الورقة \u2068Trial A\u2069');
});

test('catalogue translations retain placeholders and contain meaningful Arabic',()=>{
  const placeholders=text=>[...text.matchAll(/\{([a-zA-Z_][\w]*)\}/g)].map(x=>x[1]).sort();
  for(const [en,ar] of Object.entries(systemMessages)){
    assert.match(ar,/\p{Script=Arabic}/u,`Arabic missing: ${en}`);
    assert.deepEqual(placeholders(ar),placeholders(en),`Placeholder mismatch: ${en}`);
  }
});

test('static application errors retain Arabic coverage when backend validation changes',()=>{
  // Read code only: no TypeScript/dev dependency or execution of local services in this test.
  // Dynamic messages have separate behavioral tests above.
  let count=0;
  const decode=raw=>raw.slice(1,-1).replace(/\\(['"\\nrt])/g,(_,c)=>({n:'\n',r:'\r',t:'\t'}[c]??c));
  for(const folder of ['lib','companion']){
    const base=new URL(`../${folder}/`,import.meta.url);
    for(const name of fs.readdirSync(base).filter(name=>name.endsWith('.mjs'))){
      const source=fs.readFileSync(new URL(name,base),'utf8');
      const calls=source.matchAll(/(?:\bfail|\bnew AppError|\bnew Error)\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*[,)]/g);
      for(const [,raw] of calls){const message=decode(raw);if(!message)continue;count++;assert.notEqual(translateSystemMessage(message,'ar'),message,`${folder}/${name}: ${message}`);}
    }
  }
  assert.ok(count>150,'Expected a substantial inventory of real backend validation paths');
});

test('both complete guides have matching sections, links and language-specific navigation',()=>{
  const en=fs.readFileSync(new URL('../public/guide.html',import.meta.url),'utf8');
  const ar=fs.readFileSync(new URL('../public/guide-ar.html',import.meta.url),'utf8');
  assert.match(en,/<html lang="en" dir="ltr">/);
  assert.match(ar,/<html lang="ar" dir="rtl">/);
  const ids=html=>[...html.matchAll(/<section id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids(en),ids(ar));assert.equal(ids(en).length,10);
  const links=html=>[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replace(/lang=(en|ar)/,'lang=LOCALE').replace(/\/guide(?:-ar)?\.html/,'/guide-LOCALE.html')).sort();
  assert.deepEqual(links(en),links(ar));
  for(const html of [en,ar]){
    const anchors=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
    for(const [,target] of html.matchAll(/href="#([^"]+)"/g))assert.ok(anchors.has(target),`Missing guide anchor: ${target}`);
    assert.match(html,/0\.8/);
    assert.match(html,/5,000/);assert.match(html,/300,000/);assert.match(html,/72/);
  }
  // English page contains Arabic only in the intentional language switch.
  assert.equal((en.match(/\p{Script=Arabic}+/gu)||[]).join(''),'العربية');
  assert.match(ar,/حسابين حقيقيين/);assert.match(en,/two real accounts/);
});
