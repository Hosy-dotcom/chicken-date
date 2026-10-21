import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/model.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {counts, escapeHtml, changeList, readList, validId, randomId} = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
test('empty list has finite zero progress; cart and pantry count once', () => {
  assert.equal(counts([]).percent,0);
  assert.deepEqual(counts([{status:'home'}, {status:'cart'}, {status:'needed'}]), {home:1,cart:1,ready:2,total:3,percent:2/3*100});
});
test('custom ingredient text is HTML escaped', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)"> & \'test\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;test&#39;');
});
test('every literal element reference has a matching HTML ID; judging-cat notification has only close', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url),'utf8');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url),'utf8');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
  for (const match of main.matchAll(/\$(?:<[^>]+>)?\('([^']+)'\)/g)) assert(ids.includes(match[1]), `Missing ${match[1]}`);
  const dialog = html.split('<dialog id="pantry-dialog"')[1].split('</dialog>')[0];
  assert.equal((dialog.match(/<button/g)||[]).length,1);
  assert(dialog.includes('method="dialog"'));
});
test('PWA manifest includes valid icon files and standalone scope', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url),'utf8'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  for (const icon of manifest.icons) assert(existsSync(new URL('../public' + icon.src, import.meta.url)));
});

const listId = 'a'.repeat(32);
const item = {id:'b'.repeat(32),name:'Salt',shop:'market',use:'Chicken',status:'needed',basic:true};
const empty = () => ({id:listId, revision:0, items:[]});
test('shared URL IDs have 128 random bits and reject incomplete links', () => {
  const ids = new Set(Array.from({length:100}, () => randomId()));
  assert.equal(ids.size,100);
  for (const id of ids) assert(validId(id));
  for (const id of ['', 'abc', '../list', 'A'.repeat(32), 'a'.repeat(31)]) assert(!validId(id));
});
test('add/edit/check/store switch/undo/delete preserve a consistent list', () => {
  let s = changeList(empty(),0,'add',item);
  s = changeList(s,1,'edit',{...item,name:'Sea salt'});
  s = changeList(s,2,'status',{id:item.id,status:'home'});
  assert.equal(counts(s.items).home,1);
  s = changeList(s,3,'status',{id:item.id,status:'cart'});
  assert.equal(counts(s.items).home,0);
  assert.equal(counts(s.items).cart,1);
  s = changeList(s,4,'status',{id:item.id,status:'needed'});
  s = changeList(s,5,'shop',{id:item.id,shop:'asia'});
  assert.equal(s.items[0].shop,'asia');
  s = changeList(s,6,'delete',{id:item.id});
  assert.equal(s.items.length,0);
});
test('concurrent stale changes fail and do not silently overwrite newer data', () => {
  const a = changeList(empty(),0,'add',item);
  const b = changeList(a,1,'edit',{...item,name:'Updated on phone A'});
  assert.throws(()=>changeList(b,1,'edit',{...item,name:'Stale phone B'}),/LIST_CONFLICT/);
  assert.equal(b.items[0].name,'Updated on phone A');
  assert.equal(a.items[0].name,'Salt');
});
test('reset clears pantry/cart and a stale phone cannot resurrect the old list', () => {
  const s = changeList(empty(),0,'seed',{items:[{...item,status:'home'}]});
  const cleared = changeList(s,1,'reset',{});
  assert.deepEqual(cleared.items,[]);
  assert.throws(()=>changeList(cleared,1,'status',{id:item.id,status:'cart'}),/LIST_CONFLICT/);
  assert.throws(()=>changeList(cleared,2,'status',{id:item.id,status:'cart'}),/removed/);
});
test('seed cannot duplicate a populated list; input limits and malformed snapshots are rejected', () => {
  const s = changeList(empty(),0,'seed',{items:[item]});
  assert.throws(()=>changeList(s,1,'seed',{items:[item]}),/empty list/);
  assert.throws(()=>changeList(s,1,'add',item),/invalid data/);
  assert.throws(()=>changeList(s,1,'edit',{...item,name:' '}),/invalid data/);
  assert.throws(()=>readList(listId,{revision:1,items:[{...item,status:'oops'}]}),/invalid data/);
  assert.throws(()=>readList(listId,{revision:-1,items:[]}),/invalid data/);
  assert.throws(()=>readList(listId,{revision:1,items:Array.from({length:201},()=>item)}),/invalid data/);
});
test('login controls and previous backend dependencies are removed', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert(!html.includes('email-form'));
  assert(!html.includes('otp-form'));
  assert(html.includes('copy-link'));
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies),['firebase']);
});
