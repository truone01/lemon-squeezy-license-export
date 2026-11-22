#!/usr/bin/env node
// Export every Lemon Squeezy license key and device activation (instance) to one CSV.
// Usage: LEMONSQUEEZY_API_KEY=... node ls-license-export.mjs > licenses.csv
// Node 18+, no dependencies. MIT licence. Not affiliated with Lemon Squeezy or Stripe.

const API = process.env.LS_API_BASE ?? 'https://api.lemonsqueezy.com/v1/'; // override only for testing
const KEY = process.env.LEMONSQUEEZY_API_KEY;
if (!KEY) {
  console.error('Set LEMONSQUEEZY_API_KEY (Lemon Squeezy: Settings -> API -> +). Delete the key when you are done.');
  process.exit(1);
}

const COLUMNS = ['license_key_id', 'license_key', 'status', 'activation_limit', 'activations', 'expires_at', 'created_at',
  'customer_name', 'customer_email', 'store_id', 'product_id', 'order_id', 'order_item_id',
  'instance_id', 'instance_name', 'instance_created_at'];

async function fetchAll(resource) {
  const items = [];
  for (let page = 1; ; page++) {
    const url = `${API}${resource}?page[number]=${page}&page[size]=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/vnd.api+json' } });
    if (res.status === 401) throw new Error('Lemon Squeezy rejected the API key.');
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); page--; continue; }
    if (!res.ok) throw new Error(`Lemon Squeezy returned HTTP ${res.status} for ${resource}.`);
    const body = await res.json();
    items.push(...(body.data ?? []));
    if (page >= (body.meta?.page?.lastPage ?? 1)) return items;
  }
}

// Stops spreadsheet apps from running values as formulas (CSV injection), then quotes the cell.
function cell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

try {
const instancesByKey = new Map();
for (const instance of await fetchAll('license-key-instances')) {
  const a = instance.attributes ?? {};
  const id = String(a.license_key_id ?? '');
  if (!instancesByKey.has(id)) instancesByKey.set(id, []);
  instancesByKey.get(id).push(a);
}

const lines = [COLUMNS.join(',')];
for (const licenseKey of await fetchAll('license-keys')) {
  const k = licenseKey.attributes ?? {};
  const base = [licenseKey.id, k.key, k.status, k.activation_limit, k.instances_count, k.expires_at, k.created_at,
    k.user_name, k.user_email, k.store_id, k.product_id, k.order_id, k.order_item_id];
  for (const i of instancesByKey.get(String(licenseKey.id)) ?? [{}]) {
    lines.push([...base, i.identifier, i.name, i.created_at].map(cell).join(','));
  }
}
process.stdout.write(lines.join('\n') + '\n');
console.error(`Exported ${lines.length - 1} rows.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
