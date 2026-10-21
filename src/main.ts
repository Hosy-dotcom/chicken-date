import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, runTransaction, getDocFromServer, type DocumentReference, type Unsubscribe } from 'firebase/firestore';
import { ingredientRows } from './ingredients';
import { counts, escapeHtml as esc, changeList, readList, randomId, validId, type Action, type Item, type Snapshot } from './model';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};
let snapshot: Snapshot | null = null;
let listRef: DocumentReference | null = null;
let unsubscribe: Unsubscribe | undefined;
let busy = false;
let loaded = false;
let pantryChecked = false;
let editorId: string | null = null;
let editorRevision = 0;
const pantryDialog = $<HTMLDialogElement>('pantry-dialog');
const editor = $<HTMLDialogElement>('item-dialog');
const status = (text: string, error = false) => {
  $('sync-status').textContent = text;
  $('sync-status').classList.toggle('error', error);
};
function setEnabled() {
  const disabled = !snapshot || !loaded || busy || !navigator.onLine;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-shared], #pantry-items input, #pantry-items button, .shop-row button, .cart-chip button').forEach(el => el.disabled = disabled);
  $<HTMLButtonElement>('editor-close').disabled = busy;
  $('seed-list').hidden = !snapshot || snapshot.items.length > 0;
}

function render() {
  const items = snapshot?.items ?? [];
  const count = counts(items);
  const active = document.activeElement as HTMLElement | null;
  const focusId = active?.dataset.home ?? active?.dataset.buy ?? active?.dataset.undo ?? active?.dataset.edit ?? active?.dataset.move;
  const focusKind = ['home', 'buy', 'undo', 'edit', 'move'].find(kind => active?.hasAttribute(`data-${kind}`));
  $('pantry-items').innerHTML = items.map(item => `<div class="pantry-entry"><label class="pantry-item"><input type="checkbox" data-home="${item.id}" ${item.status === 'home' ? 'checked' : ''}><span>${esc(item.name)}</span></label><button class="edit-item" data-edit="${item.id}" aria-label="Edit ${esc(item.name)}" title="Edit item">✎</button></div>`).join('');
  $('home-count').textContent = `${count.home} at home`;
  for (const shop of ['asia', 'market']) {
    const remaining = items.filter(item => item.shop === shop && item.status === 'needed');
    $(shop + '-count').textContent = `${remaining.length} to get`;
    $(shop + '-items').innerHTML = remaining.length ? remaining.map(item => `<div class="shop-row"><button class="buy-item" data-buy="${item.id}" aria-label="Add ${esc(item.name)} to basket"><span>${esc(item.name)}<small>${esc(item.use)}</small></span></button><button class="move-item" data-move="${item.id}" title="Move to ${shop === 'asia' ? 'the supermarket' : 'Go Asia'}" aria-label="Move ${esc(item.name)} to ${shop === 'asia' ? 'the supermarket' : 'Go Asia'}">⇄</button></div>`).join('') : `<p class="empty">${items.length ? 'All sorted here. On to the good stuff ♡' : 'Your next shopping adventure starts here.'}</p>`;
  }
  $('cart-count').textContent = `${count.cart} packed`;
  $('cart-items').innerHTML = count.cart ? items.filter(item => item.status === 'cart').map(item => `<span class="cart-chip">✓ ${esc(item.name)}<button data-undo="${item.id}" aria-label="Return ${esc(item.name)} to shopping list" title="Return to shopping list">×</button></span>`).join('') : '<p class="empty">An empty basket, a very promising evening.</p>';
  $('progress-fill').style.width = `${count.percent}%`;
  $('progress-text').textContent = !count.total ? 'Add an item or load the chicken ingredients to begin.' : count.ready === count.total ? 'Everything’s ready. Next stop: our chicken date! ♡' : `${count.ready} of ${count.total} ingredients sorted · ${count.total - count.ready} little things left`;
  $('pantry-joke').textContent = pantryChecked ? 'Pantry checked. Our shopping quest is ready! ♡' : 'A quick cupboard check before our little adventure.';
  setEnabled();
  if (focusId && focusKind && !editor.open && !pantryDialog.open) {
    const target = document.querySelector<HTMLElement>(`[data-${focusKind}="${focusId}"]`) ?? document.querySelector<HTMLElement>(`[data-home="${focusId}"]`);
    target?.focus({preventScroll: true});
  }
}

function receive(value: unknown) {
  if (!listRef) return;
  const next = readList(listRef.id, value ?? {revision: 0, items: []});
  if (!snapshot || next.revision >= snapshot.revision) snapshot = next;
  render();
}
function listen() {
  if (!listRef) return;
  unsubscribe?.();
  loaded = false;
  setEnabled();
  $('reconnect').hidden = true;
  status('Opening our list…');
  unsubscribe = onSnapshot(listRef, {includeMetadataChanges: true}, document => {
    // Do not present local/unconfirmed writes as saved on the other phone.
    if (document.metadata.hasPendingWrites) return;
    try {
      loaded = !document.metadata.fromCache;
      receive(document.exists() ? document.data() : null);
      if (!busy) status(loaded ? 'Live · shared between the two of us ♡' : 'Connecting… saved changes will appear when we’re back online.');
    } catch (error) {
      loaded = false; setEnabled();
      status(error instanceof Error ? error.message : 'Could not read the list.', true);
    }
  }, error => {
    loaded = false; setEnabled();
    $('reconnect').hidden = false;
    status(`Could not connect (${error.code}). Check the Firebase settings and rules, then reconnect.`, true);
  });
}
async function refresh() {
  if (!listRef) return;
  const document = await getDocFromServer(listRef);
  loaded = true;
  receive(document.exists() ? document.data() : null);
}
async function mutate(action: Action, payload: Record<string, unknown> = {}, revision = snapshot?.revision): Promise<boolean> {
  if (!listRef || !snapshot || !loaded || busy || !navigator.onLine || revision === undefined) return false;
  busy = true; setEnabled();
  status('Saving for both of us…');
  // Generate IDs once, outside the transaction callback (Firestore may retry it).
  if (action === 'add') payload = {...payload, id: randomId()};
  if (action === 'seed') payload = {...payload, items: (payload.items as object[]).map(item => ({...item, id: randomId()}))};
  try {
    const ref = listRef;
    const next = await runTransaction(ref.firestore, async transaction => {
      const document = await transaction.get(ref);
      const current = readList(ref.id, document.exists() ? document.data() : {revision: 0, items: []});
      const result = changeList(current, revision, action, payload);
      transaction.set(ref, {revision: result.revision, items: result.items});
      return result;
    });
    receive(next);
    status('Saved · shared with your date ♡');
    return true;
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Could not save. Check your connection and try again.';
    if (message === 'LIST_CONFLICT') {
      try { await refresh(); } catch { loaded = false; }
      message = 'Your date just changed the list. Review the latest version, then try again.';
      if (editor.open && snapshot) editorRevision = snapshot.revision;
    } else message = `Could not confirm the change. ${message}`;
    status(message, true);
    if (editor.open) $('editor-error').textContent = message;
    return false;
  } finally {
    busy = false; setEnabled();
  }
}

function openEditor(item?: Item) {
  if (!snapshot || busy) return;
  editorId = item?.id ?? null;
  editorRevision = snapshot.revision;
  $('item-dialog-title').textContent = item ? 'Edit ingredient' : 'Add ingredient';
  $<HTMLInputElement>('item-name').value = item?.name ?? '';
  $<HTMLInputElement>('item-use').value = item?.use ?? '';
  $<HTMLSelectElement>('item-shop').value = item?.shop ?? 'market';
  $<HTMLInputElement>('item-basic').checked = item?.basic ?? false;
  $('delete-item').hidden = !item;
  $('editor-error').textContent = '';
  editor.showModal();
}
function showPantryReminder() {
  const basics = snapshot?.items.filter(item => item.basic && item.status === 'needed') ?? [];
  pantryChecked = true;
  render();
  if (!basics.length) {
    $('pantry-joke').textContent = 'All the basics sorted? Okay, date material. ♡';
    return;
  }
  $('pantry-dialog-message').textContent = `No ${basics.map(item => item.name.toLowerCase()).join(', ')}? R u jokin’?! >_< Fine, it’s on the list. ♡`;
  pantryDialog.showModal();
}
pantryDialog.addEventListener('close', () => $('check-pantry').focus());
editor.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
editor.addEventListener('close', () => $('add-item').focus());
$('editor-close').addEventListener('click', () => { if (!busy) editor.close(); });
$('item-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {id: editorId, name: $<HTMLInputElement>('item-name').value.trim(), use: $<HTMLInputElement>('item-use').value.trim(), shop: $<HTMLSelectElement>('item-shop').value, basic: $<HTMLInputElement>('item-basic').checked};
  if (!payload.name) { $('editor-error').textContent = 'Give this ingredient a name.'; return; }
  if (await mutate(editorId ? 'edit' : 'add', payload, editorRevision)) editor.close();
});
$('delete-item').addEventListener('click', async () => {
  if (editorId && confirm('Delete this ingredient for both of us?') && await mutate('delete', {id: editorId}, editorRevision)) editor.close();
});
document.addEventListener('change', async event => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.home) return;
  const id = event.target.dataset.home;
  const checked = event.target.checked;
  // Revert until server confirmation so failed writes never look saved.
  event.target.checked = snapshot?.items.find(item => item.id === id)?.status === 'home';
  await mutate('status', {id, status: checked ? 'home' : 'needed'});
});
document.addEventListener('click', async event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const {buy, undo, move, edit} = button.dataset;
  if (buy || undo) await mutate('status', {id: buy || undo, status: buy ? 'cart' : 'needed'});
  else if (move) {
    const item = snapshot?.items.find(item => item.id === move);
    if (item) await mutate('shop', {id: move, shop: item.shop === 'asia' ? 'market' : 'asia'});
  } else if (edit) openEditor(snapshot?.items.find(item => item.id === edit));
  else if (button.id === 'add-item') openEditor();
  else if (button.id === 'check-pantry') showPantryReminder();
  else if (button.id === 'reset' && confirm('Clear ALL ingredients, pantry choices and inventory for BOTH people? This cannot be undone.')) {
    if (await mutate('reset')) { pantryChecked = false; render(); }
  } else if (button.id === 'seed-list') await mutate('seed', {items: recipeItems()});

});
function recipeItems() {
  return ingredientRows.map(([id, name, shop, use]) => ({name, shop, use, basic: ['salt','pepper','oil','sugar','egg'].includes(id), status: 'needed'}));
}

$('copy-link').addEventListener('click', async () => {
  const link = new URL(location.href);
  link.hash = '';
  const input = $<HTMLInputElement>('shared-url');
  input.value = link.href;
  try { await navigator.clipboard.writeText(link.href); status('Link copied! Send this exact link to your date ♡'); }
  catch { input.hidden = false; input.focus(); input.select(); status('Copy the link shown here and send it to your date.'); }
});
$('reconnect').addEventListener('click', listen);
window.addEventListener('offline', () => { loaded = false; setEnabled(); status('Offline. Saved items are safe; editing resumes when you reconnect.', true); });
window.addEventListener('online', listen);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && navigator.onLine && listRef) void refresh().catch(() => { status('Reconnecting to the list…'); });
});
render();
try {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
  if (Object.values(config).some(value => !value || value.startsWith('YOUR_'))) {
    throw new Error('One-time setup needed: add your three Firebase settings. See SETUP.md.');
  }
  const url = new URL(location.href);
  let id = url.searchParams.get('list');
  if (id !== null && !validId(id)) throw new Error('This shared link is incomplete. Ask your date to copy and send the full link again.');
  if (!id) {
    try { const remembered = localStorage.getItem('chicken-shared-list'); if (remembered && validId(remembered)) id = remembered; } catch { /* The URL still preserves the list without browser storage. */ }
    id ??= randomId();
    url.searchParams.set('list', id);
    history.replaceState(null, '', url);
  }
  try { localStorage.setItem('chicken-shared-list', id); } catch { /* Keep/bookmark the full URL. */ }
  listRef = doc(getFirestore(initializeApp(config)), 'shoppingLists', id);
  listen();
} catch (error) {
  $<HTMLButtonElement>('copy-link').disabled = true;
  status(error instanceof Error ? error.message : 'Check your Firebase setup.', true);
}
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { $('install-note').textContent = 'You can still use this website in your browser.'; }); });
}

