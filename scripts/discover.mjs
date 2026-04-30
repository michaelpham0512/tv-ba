#!/usr/bin/env node
// Discovery: when ALL candidates for a sport are dead, search engines for new live mirrors
// and append to candidates.json so future check-links runs can pick them.
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANDIDATES_FILE = path.join(ROOT, 'candidates.json');
const LIVE_FILE = path.join(ROOT, 'links.json');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SEARCH_QUERIES = {
  'bong-da': ['cakhia tv link mới nhất', 'socolive tv trực tiếp bóng đá link mới', 'xoilac tv link mới'],
  'bong-chuyen': ['volleyball live stream free', 'bóng chuyền VNL trực tiếp link'],
  'tennis': ['tennis live stream free', 'ATP live stream'],
  'boxing': ['boxing live stream free', 'methstreams boxing'],
  'mma': ['ufc live stream free', 'methstreams ufc'],
  'muay': ['ONE championship live stream', 'muay thai live stream free'],
  'f1': ['f1 live stream free', 'streameast f1'],
  'motogp': ['motogp live stream free', 'streameast motogp'],
};

async function ddgSearch(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA }});
    clearTimeout(t);
    if (!res.ok) return [];
    const html = await res.text();
    const links = new Set();
    const re = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      try { links.add(decodeURIComponent(m[1])); } catch {}
    }
    const re2 = /<a[^>]+class="[^"]*result__url[^"]*"[^>]*>([^<]+)<\/a>/g;
    while ((m = re2.exec(html)) !== null) {
      const u = m[1].trim();
      if (u.startsWith('http')) links.add(u);
      else if (u.includes('.')) links.add('https://' + u);
    }
    return [...links];
  } catch (e) {
    console.error('ddg fail', query, e.message);
    return [];
  }
}

function rootDomain(u) {
  try { return new URL(u).hostname; } catch { return null; }
}

async function main() {
  const candidates = JSON.parse(await fs.readFile(CANDIDATES_FILE, 'utf8'));
  let live = {};
  try { live = JSON.parse(await fs.readFile(LIVE_FILE, 'utf8')); } catch {}

  let added = 0;
  for (const [key, sport] of Object.entries(candidates.sports)) {
    const liveStatus = live.sports?.[key];
    const allDead = !liveStatus || liveStatus.status === 'ALL_DEAD' || !liveStatus.url;
    if (!allDead) continue;

    console.log(`\n[${key}] ALL DEAD — discovering...`);
    const queries = SEARCH_QUERIES[key] || [];
    const existing = new Set(sport.candidates.map(rootDomain).filter(Boolean));
    const found = new Set();
    for (const q of queries) {
      const results = await ddgSearch(q);
      for (const r of results) {
        const dom = rootDomain(r);
        if (!dom) continue;
        if (existing.has(dom)) continue;
        if (dom.includes('youtube.com') || dom.includes('facebook.com') || dom.includes('wikipedia.org')) continue;
        found.add(r);
        if (found.size >= 5) break;
      }
      if (found.size >= 5) break;
    }
    const newOnes = [...found];
    if (newOnes.length) {
      console.log(`  + adding ${newOnes.length}: ${newOnes.join(', ')}`);
      sport.candidates.push(...newOnes);
      added += newOnes.length;
    } else {
      console.log('  no new candidates found');
    }
  }

  if (added > 0) {
    candidates._lastDiscovery = new Date().toISOString();
    await fs.writeFile(CANDIDATES_FILE, JSON.stringify(candidates, null, 2));
    console.log(`\nDiscovered ${added} new candidate(s). candidates.json updated.`);
  } else {
    console.log('\nNo discovery needed.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
