export type Shop = 'asia' | 'market';
export type ItemStatus = 'needed' | 'home' | 'cart';
export interface Item {
  id: string;
  name: string;
  shop: Shop;
  use: string;
  status: ItemStatus;
  basic: boolean;
}
export interface Snapshot { id: string; revision: number; items: Item[] }
export type Action = 'add' | 'edit' | 'status' | 'shop' | 'delete' | 'reset' | 'seed';

export const validId = (id: string) => /^[a-f0-9]{32}$/.test(id);
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
function isItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const i = value as Item;
  return typeof i.id === 'string' && validId(i.id)
    && typeof i.name === 'string' && i.name.trim().length > 0 && i.name.length <= 100
    && typeof i.use === 'string' && i.use.length <= 200
    && ['asia', 'market'].includes(i.shop)
    && ['needed', 'home', 'cart'].includes(i.status) && typeof i.basic === 'boolean';
}
export function readList(id: string, value: unknown): Snapshot {
  const data = value as Partial<Snapshot> | null;
  if (!data || !Number.isSafeInteger(data.revision) || data.revision! < 0 || !Array.isArray(data.items)
    || data.items.length > 200 || !data.items.every(isItem)
    || new Set(data.items.map(item => item.id)).size !== data.items.length) {
    throw new Error('This list contains invalid data. Check its document in Firebase before editing.');
  }
  return {id, revision: data.revision!, items: data.items};
}

// Runs inside a Firestore transaction. It never mutates an earlier snapshot.
export function changeList(current: Snapshot, expected: number, action: Action, payload: Record<string, unknown>): Snapshot {
  if (current.revision !== expected) throw new Error('LIST_CONFLICT');
  let items = current.items.map(item => ({...item}));
  const item = items.find(item => item.id === payload.id);
  if (action === 'reset') items = [];
  else if (action === 'seed') {
    if (items.length) throw new Error('Load chicken ingredients only into an empty list.');
    items = payload.items as Item[];
  } else if (action === 'add') {
    items.push({id: payload.id, name: payload.name, shop: payload.shop, use: payload.use, basic: payload.basic, status: 'needed'} as Item);
  } else {
    if (!item) throw new Error('This ingredient was removed. Close the editor and check the latest list.');
    if (action === 'delete') items = items.filter(entry => entry.id !== item.id);
    else if (action === 'edit') Object.assign(item, {name: payload.name, shop: payload.shop, use: payload.use, basic: payload.basic});
    else if (action === 'status') item.status = payload.status as ItemStatus;
    else if (action === 'shop') item.shop = payload.shop as Shop;
    else throw new Error('Unknown list action.');
  }
  return readList(current.id, {revision: current.revision + 1, items});
}

// User-provided names and notes must never become executable HTML.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]!));
}
export function counts(items: Item[]) {
  const home = items.filter(item => item.status === 'home').length;
  const cart = items.filter(item => item.status === 'cart').length;
  return {home, cart, ready: home + cart, total: items.length, percent: items.length ? (home + cart) / items.length * 100 : 0};
}
