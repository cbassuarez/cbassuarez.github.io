//
//  repl-patch-codec.js
//  
//
//  Created by Sebastian Suarez-Solis on 5/9/26.
//


// REPL patch URL codec.
// Stores portable patch state in URL hashes like:
//
//   #patch=v1.d.<base64url-deflate-json>
//   #patch=v1.r.<base64url-raw-json>
//
// The codec is async because CompressionStream / DecompressionStream are async.
// Raw fallback exists for older browsers or local-file weirdness.

(function (root) {
  'use strict';

  const HASH_PREFIX = '#patch=v1.';
  const APP_ID = 'seb-repl';
  const MAX_WARN_CHARS = 12000;
  const MAX_HARD_CHARS = 48000;

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch (_) {
      return '';
    }
  }

  function normalizePayload(input) {
    const code = String((input && input.code) || '');
    const title = String((input && input.title) || '').trim();

    return {
      app: APP_ID,
      version: 1,
      title,
      code,
      createdAt: String((input && input.createdAt) || nowIso()),
    };
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    const chunk = 0x8000;

    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, slice);
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function base64UrlToBytes(encoded) {
    const safe = String(encoded || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const padded = safe + '='.repeat((4 - (safe.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  async function compressBytes(bytes) {
    if (typeof CompressionStream === 'undefined') return null;

    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new CompressionStream('deflate'));

    const compressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressed);
  }

  async function decompressBytes(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;

    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'));

    const decompressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(decompressed);
  }

  function currentBaseUrl() {
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  }

  function hashFromLocationLike(value) {
    const raw = String(value || '');

    if (raw.startsWith('#')) return raw;

    try {
      const url = new URL(raw, window.location.href);
      return url.hash || '';
    } catch (_) {
      return raw;
    }
  }

  async function encode(input) {
    const payload = normalizePayload(input);
    const json = JSON.stringify(payload);
    const jsonBytes = new TextEncoder().encode(json);

    try {
      const compressed = await compressBytes(jsonBytes);
      if (compressed && compressed.length < jsonBytes.length) {
        return `v1.d.${bytesToBase64Url(compressed)}`;
      }
    } catch (err) {
      console.warn('[repl] patch compression failed; using raw hash payload', err);
    }

    return `v1.r.${bytesToBase64Url(jsonBytes)}`;
  }

  async function decode(hashOrUrl) {
    const hash = hashFromLocationLike(hashOrUrl || window.location.hash);

    if (!hash || !hash.startsWith(HASH_PREFIX)) return null;

    const body = hash.slice(HASH_PREFIX.length);
    const dot = body.indexOf('.');
    if (dot < 0) return null;

    const mode = body.slice(0, dot);
    const encoded = body.slice(dot + 1);
    if (!encoded) return null;

    const bytes = base64UrlToBytes(encoded);
    let jsonBytes = null;

    if (mode === 'd') {
      jsonBytes = await decompressBytes(bytes);
      if (!jsonBytes) {
        throw new Error('compressed patch hash is not supported by this browser');
      }
    } else if (mode === 'r') {
      jsonBytes = bytes;
    } else {
      return null;
    }

    const text = new TextDecoder().decode(jsonBytes);
    const payload = JSON.parse(text);

    if (!payload || payload.version !== 1 || typeof payload.code !== 'string') {
      throw new Error('invalid REPL patch payload');
    }

    return {
      app: String(payload.app || APP_ID),
      version: 1,
      title: String(payload.title || ''),
      code: String(payload.code || ''),
      createdAt: String(payload.createdAt || ''),
    };
  }

  async function read() {
    try {
      return await decode(window.location.hash);
    } catch (err) {
      console.warn('[repl] could not decode patch hash:', err);
      return null;
    }
  }

  function urlForEncoded(encoded) {
    return `${currentBaseUrl()}#patch=${encoded}`;
  }

  async function urlFor(input) {
    const encoded = await encode(input);
    const url = urlForEncoded(encoded);

    return {
      url,
      encoded,
      length: url.length,
      warn: url.length > MAX_WARN_CHARS,
      tooLarge: url.length > MAX_HARD_CHARS,
    };
  }

  async function write(input, options) {
    const opts = options || {};
    const result = await urlFor(input);

    if (result.tooLarge) {
      const err = new Error(`patch link too large (${result.length} chars)`);
      err.result = result;
      throw err;
    }

    if (opts.push) {
      history.pushState(null, '', result.url);
    } else {
      history.replaceState(null, '', result.url);
    }

    return result;
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();

    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      ok = false;
    }

    document.body.removeChild(ta);
    return ok;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // fall through
      }
    }

    return fallbackCopy(text);
  }

  async function share(input) {
    const result = await urlFor(input);

    if (result.tooLarge) {
      const err = new Error(`patch link too large (${result.length} chars)`);
      err.result = result;
      throw err;
    }

    const copied = await copyText(result.url);

    return {
      ...result,
      copied,
    };
  }

  root.ReplPatchLinks = {
    HASH_PREFIX,
    MAX_WARN_CHARS,
    MAX_HARD_CHARS,
    encode,
    decode,
    read,
    write,
    share,
    urlFor,
  };
})(window);