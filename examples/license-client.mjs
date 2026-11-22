// License check client for apps that use the Lemon Squeezy License API.
// Node 18+ / Electron main process. No dependencies. MIT licence.
//
// Why: when Lemon Squeezy stops (March 31, 2027) every copy that hard-codes
// api.lemonsqueezy.com stops validating. Ship this pattern now:
//   1. the base URL comes from config, so a later release (or a remote
//      setting you control) can move license checks without new logic;
//   2. a grace period, so a network error or an outage never locks out a
//      paying user who validated recently.
//
// Usage:
//   import { LicenseClient } from './license-client.mjs';
//   const lc = new LicenseClient({ storePath: '/path/to/license.json' });
//   await lc.activate('KEY', 'My Laptop');   // once
//   const { valid, offline } = await lc.check(); // on every start

import { readFile, writeFile } from 'node:fs/promises';

export class LicenseClient {
  constructor({
    storePath,
    baseUrl = 'https://api.lemonsqueezy.com/v1/licenses', // change in one place
    graceDays = 14,
    timeoutMs = 8000,
    expectedProductId = null, // reject keys from other products in your store
  }) {
    this.storePath = storePath;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.graceMs = graceDays * 86400000;
    this.timeoutMs = timeoutMs;
    this.expectedProductId = expectedProductId;
  }

  async #post(action, fields) {
    const res = await fetch(`${this.baseUrl}/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    // 4xx with a JSON body is a real answer (invalid key etc.); 5xx is an outage.
    if (res.status >= 500) throw new Error(`license server ${res.status}`);
    return res.json();
  }

  #productOk(data) {
    return this.expectedProductId == null || data?.meta?.product_id === this.expectedProductId;
  }

  async #load() {
    try { return JSON.parse(await readFile(this.storePath, 'utf8')); } catch { return null; }
  }

  async #save(state) {
    await writeFile(this.storePath, JSON.stringify(state), { mode: 0o600 });
  }

  async activate(licenseKey, instanceName) {
    const data = await this.#post('activate', { license_key: licenseKey, instance_name: instanceName });
    if (!data.activated || !this.#productOk(data)) {
      return { ok: false, error: data.error || 'This key is not for this product.' };
    }
    // Keep instance.id: it is what validate/deactivate need, and what a
    // replacement server must import for existing activations to survive.
    await this.#save({ licenseKey, instanceId: data.instance.id, lastValidAt: Date.now() });
    return { ok: true };
  }

  async check() {
    const s = await this.#load();
    if (!s?.licenseKey) return { valid: false, offline: false };
    try {
      const data = await this.#post('validate', { license_key: s.licenseKey, instance_id: s.instanceId });
      const valid = Boolean(data.valid) && this.#productOk(data);
      await this.#save({ ...s, lastValidAt: valid ? Date.now() : 0 });
      return { valid, offline: false };
    } catch {
      // Network error, timeout or 5xx: trust a recent successful check.
      return { valid: Date.now() - (s.lastValidAt || 0) < this.graceMs, offline: true };
    }
  }

  async deactivate() {
    const s = await this.#load();
    if (!s?.licenseKey) return { ok: true };
    const data = await this.#post('deactivate', { license_key: s.licenseKey, instance_id: s.instanceId });
    if (data.deactivated) await this.#save({});
    return { ok: Boolean(data.deactivated) };
  }
}
