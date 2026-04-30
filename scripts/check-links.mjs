#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANDIDATES_FILE = path.join(ROOT, 'candidates.json');
const LIVE_FILE = path.join(ROOT, 'links.json');
const HEALTH_FILE = path.join(ROOT, 'health.md');

const TIMEOUT_MS = 15000;
const UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146 TV Safari/537.36';

const PARKED_SIGNS = [
  'domain for sale', 'this domain is for sale', 'parked free',
  'godaddy', 'sedoparking', 'buy this domain',
  'namecheap.com/domains/registration', 'click here to buy',
  'website coming soon', 'under construction',
];

async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
    });
    const body = res.ok ? await res.text() : '';
    return { status: res.status, finalUrl: res.url, body, ok: res.ok };
  } catch (e) {
    return { status: 0, finalUrl: url, body: '', ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function isParkedDomain(body) {
  const lower = body.toLowerCase().slice(0, 50000);
  return PARKED_SIGNS.some(sign => lower.includes(sign));
}

function hasFingerprint(body, fingerprints) {
  if (!fingerprints || fingerprints.length === 0) return true;
  const lower = body.toLowerCase();
  return fingerprints.some(fp => lower.includes(fp.toLowerCase()));
}

function looksLikeStreamSite(body) {
  const lower = body.toLowerCase();
  const streamSigns = ['video', 'stream', 'live', 'm3u8', 'hls', 'player', 'iframe', 'broadcast'];
  return streamSigns.some(s => lower.includes(s));
}

async function checkUrl(url, fingerprints) {
  const r = await fetchWithTimeout(url);
  if (!r.ok) return { url, live: false, reason: `HTTP ${r.status}${r.error ? ' ' + r.error : ''}` };
  if (r.body.length < 2000) return { url, live: false, reason: `body too small (${r.body.length}b)` };
  if (isParkedDomain(r.body)) return { url, live: false, reason: 'parked/for-sale page' };
  if (!looksLikeStreamSite(r.body)) return { url, live: false, reason: 'no stream markers' };
  const fpOk = hasFingerprint(r.body, fingerprints);
  return {
    url,
    finalUrl: r.finalUrl,
    live: true,
    fingerprintMatch: fpOk,
    bodySize: r.body.length,
  };
}

async function pickBest(sportKey, sport) {
  console.log(`\n[${sportKey}] checking ${sport.candidates.length} candidates...`);
  const results = [];
  for (const url of sport.candidates) {
    const r = await checkUrl(url, sport.fingerprints);
    results.push(r);
    const flag = r.live ? (r.fingerprintMatch ? '✓' : '~') : '✗';
    console.log(`  ${flag} ${r.url}${r.live ? '' : ' — ' + r.reason}`);
    if (r.live && r.fingerprintMatch) break;
  }
  const liveWithFp = results.find(r => r.live && r.fingerprintMatch);
  const liveAny = results.find(r => r.live);
  const winner = liveWithFp || liveAny || null;
  return { sportKey, winner, results };
}

async function main() {
  const candidates = JSON.parse(await fs.readFile(CANDIDATES_FILE, 'utf8'));
  const sports = candidates.sports;
  let prevLive = {};
  try { prevLive = JSON.parse(await fs.readFile(LIVE_FILE, 'utf8')); } catch {}

  const out = {
    generatedAt: new Date().toISOString(),
    sports: {},
  };
  const log = [`# Health Log — ${new Date().toISOString()}`, ''];
  let changes = 0;

  for (const [key, sport] of Object.entries(sports)) {
    const { winner, results } = await pickBest(key, sport);
    const prev = prevLive.sports?.[key]?.url;

    if (winner) {
      out.sports[key] = {
        name: sport.name,
        icon: sport.icon,
        sub: sport.sub,
        url: winner.url,
        finalUrl: winner.finalUrl,
        fingerprintMatch: winner.fingerprintMatch,
        backups: results.filter(r => r.live && r.url !== winner.url).map(r => r.url).slice(0, 3),
      };
      if (prev !== winner.url) { changes++; log.push(`- **${sport.name}**: ${prev || '(none)'} → ${winner.url}`); }
    } else {
      out.sports[key] = {
        name: sport.name,
        icon: sport.icon,
        sub: sport.sub,
        url: null,
        backups: [],
        status: 'ALL_DEAD',
      };
      changes++;
      log.push(`- ⚠️ **${sport.name}**: ALL CANDIDATES DEAD`);
    }
  }

  if (changes === 0) log.push('No changes (all primaries still live).');
  log.push('', '## Detail per sport', '');
  for (const [key, sport] of Object.entries(out.sports)) {
    log.push(`### ${sport.icon} ${sport.name}`);
    log.push(`- Primary: ${sport.url || '⚠️ NONE'}`);
    if (sport.backups?.length) log.push(`- Backups: ${sport.backups.join(', ')}`);
    log.push('');
  }

  await fs.writeFile(LIVE_FILE, JSON.stringify(out, null, 2));
  await fs.writeFile(HEALTH_FILE, log.join('\n'));
  console.log(`\nDone. ${changes} change(s). Wrote links.json + health.md`);
}

main().catch(e => { console.error(e); process.exit(1); });
