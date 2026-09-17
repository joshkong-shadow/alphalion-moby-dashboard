/* Browser-side decryption for enc/ blobs (AES-256-GCM, PBKDF2-SHA256, gzip inside). */
(function (g) {
  let key = null;

  async function deriveKey(pass, saltB64, iter) {
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter || 300000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }

  async function unlock(pass) {
    const saltMeta = await (await fetch('enc/salt.json', { cache: 'no-store' })).json();
    key = await deriveKey(pass, saltMeta.salt, saltMeta.iter);
    await fetchDecrypt('enc/meta.bin'); // throws on wrong passphrase (GCM auth failure)
    return true;
  }

  async function fetchDecrypt(path) {
    if (!key) throw new Error('locked');
    const buf = await (await fetch(path, { cache: 'no-store' })).arrayBuffer();
    const iv = new Uint8Array(buf, 0, 12);
    const plainGz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, new Uint8Array(buf, 12));
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([plainGz]).stream().pipeThrough(ds);
    return JSON.parse(await new Response(stream).text());
  }

  g.MobyCrypto = { unlock, fetchDecrypt, isUnlocked: () => !!key };
})(globalThis);
