#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIVE_FILE = path.join(ROOT, 'links.json');
const OUT_FILE = path.join(ROOT, 'index.html');

const SPORT_ORDER = ['bong-da', 'bong-chuyen', 'tennis', 'boxing', 'mma', 'muay', 'f1', 'motogp'];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  const dd = pad(d.getDate()), mm = pad(d.getMonth()+1), yy = d.getFullYear();
  const hh = pad(d.getHours()), mi = pad(d.getMinutes());
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function renderButton(key, sport) {
  const url = sport.url;
  const backups = (sport.backups || []).join(',');
  if (!url) {
    return `      <div class="btn dead" data-sport="${key}">
        <div class="icon">${sport.icon}</div>
        <div class="name">${escapeHtml(sport.name)}</div>
        <div class="sub">⚠️ Đang sửa link, gọi Huy</div>
      </div>`;
  }
  return `      <a class="btn" href="${escapeHtml(url)}" data-sport="${key}" data-backups="${escapeHtml(backups)}" target="_self" rel="noopener">
        <div class="icon">${sport.icon}</div>
        <div class="name">${escapeHtml(sport.name)}</div>
        <div class="sub">${escapeHtml(sport.sub || '')}</div>
      </a>`;
}

async function main() {
  const live = JSON.parse(await fs.readFile(LIVE_FILE, 'utf8'));
  const updatedAt = fmtTime(live.generatedAt);
  const buttons = SPORT_ORDER.map(k => renderButton(k, live.sports[k] || { name: k, icon: '?', sub: '' })).join('\n');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>TIVI CỦA BA</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%);color:#fff;min-height:100vh;padding:30px 20px;overflow-x:hidden}
  .header{text-align:center;margin-bottom:40px}
  .header h1{font-size:clamp(40px,5vw,72px);font-weight:800;background:linear-gradient(135deg,#ff6b35 0%,#f7931e 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:2px}
  .header p{font-size:clamp(18px,1.6vw,28px);color:#aaa;margin-top:12px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;max-width:1800px;margin:0 auto}
  @media (max-width:1200px){.grid{grid-template-columns:repeat(2,1fr)}}
  .btn{display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,.05);border:3px solid rgba(255,255,255,.1);border-radius:24px;padding:50px 20px;text-decoration:none;color:#fff;transition:all .25s ease;cursor:pointer;min-height:280px;backdrop-filter:blur(10px)}
  .btn:hover,.btn:focus{background:linear-gradient(135deg,#ff6b35 0%,#f7931e 100%);border-color:#ff6b35;transform:scale(1.04);box-shadow:0 20px 50px rgba(255,107,53,.4);outline:none}
  .btn.dead{background:rgba(255,80,80,.08);border-color:rgba(255,80,80,.3);cursor:not-allowed}
  .btn.dead:hover{transform:none;box-shadow:none}
  .btn .icon{font-size:clamp(70px,7vw,110px);margin-bottom:16px;line-height:1}
  .btn .name{font-size:clamp(28px,2.4vw,40px);font-weight:700;letter-spacing:1px}
  .btn .sub{font-size:clamp(16px,1.2vw,22px);color:#aaa;margin-top:10px;text-align:center}
  .btn:hover .sub,.btn:focus .sub{color:rgba(255,255,255,.9)}
  .footer{text-align:center;margin-top:50px;font-size:clamp(14px,1vw,18px);color:#555}
  .footer .update{color:#888}
</style>
</head>
<body>
  <div class="header">
    <h1>📺 TIVI CỦA BA</h1>
    <p>Bấm vào môn ba muốn coi</p>
  </div>

  <div class="grid">
${buttons}
  </div>

  <div class="footer">
    <p class="update">Cập nhật tự động: ${updatedAt}</p>
    <p>Có lỗi: gọi Huy</p>
  </div>

<script>
// Client-side fallback: if user clicks a link and it fails to load (page isn't reachable
// from inside LG WebOS browser), automatically try the next backup URL.
document.querySelectorAll('a.btn[data-backups]').forEach(a => {
  a.addEventListener('click', function(e) {
    const backups = (this.dataset.backups || '').split(',').filter(Boolean);
    if (backups.length === 0) return;
    // Save state so we can retry
    try {
      sessionStorage.setItem('lastSport', this.dataset.sport);
      sessionStorage.setItem('lastUrl', this.href);
      sessionStorage.setItem('backups', JSON.stringify(backups));
      sessionStorage.setItem('clickAt', String(Date.now()));
    } catch(_) {}
  });
});

// On hub page load, check if we returned because the previous click failed.
// Detection: if user came back to hub within 6 seconds with same referrer, primary was unreachable.
(function() {
  try {
    var clickAt = parseInt(sessionStorage.getItem('clickAt') || '0', 10);
    var lastUrl = sessionStorage.getItem('lastUrl');
    var backups = JSON.parse(sessionStorage.getItem('backups') || '[]');
    if (clickAt && lastUrl && backups.length > 0 && (Date.now() - clickAt) < 8000) {
      // Probably failed. Try next backup.
      var next = backups.shift();
      if (next) {
        sessionStorage.setItem('backups', JSON.stringify(backups));
        sessionStorage.setItem('lastUrl', next);
        sessionStorage.setItem('clickAt', String(Date.now()));
        // Visual feedback before redirect
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:36px;color:#fff;text-align:center;padding:20px">⏳ Link chính lỗi, đang chuyển sang link dự phòng...</div>';
        setTimeout(function(){ window.location.href = next; }, 800);
      }
    } else {
      // Reset state on fresh hub visit
      sessionStorage.removeItem('clickAt');
    }
  } catch(_) {}
})();
</script>
</body>
</html>
`;

  await fs.writeFile(OUT_FILE, html);
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
