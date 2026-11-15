// Video upscaling for EasyCut (Windows app).
// AI: Real-ESRGAN ncnn-vulkan (free, runs on any Vulkan GPU, e.g. GTX 1650).
// Quick / fallback: FFmpeg Lanczos + light denoise + contrast-adaptive sharpening.
// Both tools are downloaded once, on first use, into the app's user folder.
const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const EXE = process.platform === 'win32' ? '.exe' : '';
const SOURCES = {
  ffmpeg: [
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
  ],
  esrgan: ['https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip'],
};
let current = null, cancelled = false;

const toolsDir = () => path.join(app.getPath('userData'), 'tools');
function findFile(dir, name, depth = 4) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return p;
      if (e.isDirectory() && depth > 0) { const r = findFile(p, name, depth - 1); if (r) return r; }
    }
  } catch (e) {}
  return null;
}
function onPath(name) {
  try { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' }); const p = (r.stdout || '').split(/\r?\n/)[0].trim(); return p && fs.existsSync(p) ? p : null; } catch (e) { return null; }
}
function tool(name) {
  const env = process.env['EASYCUT_' + name.toUpperCase().replace(/-/g, '_')];
  if (env && fs.existsSync(env)) return env;
  return findFile(toolsDir(), name + EXE) || (name !== 'realesrgan-ncnn-vulkan' ? onPath(name) : null);
}

async function download(urls, dest, report) {
  let last;
  for (const url of urls) {
    try {
      const res = await net.fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = +res.headers.get('content-length') || 0;
      const out = fs.createWriteStream(dest); let got = 0, t0 = 0;
      const reader = res.body.getReader();
      for (;;) {
        if (cancelled) { reader.cancel().catch(() => {}); out.destroy(); throw new Error('cancelled'); }
        const { done, value } = await reader.read(); if (done) break;
        got += value.length; if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
        if (Date.now() - t0 > 250) { t0 = Date.now(); report(total ? got / total * 100 : 0, `${(got / 1048576).toFixed(0)}${total ? ' / ' + (total / 1048576).toFixed(0) : ''} MB`); }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      return;
    } catch (e) { last = e; if (e.message === 'cancelled') throw e; }
  }
  throw new Error('Download failed: ' + (last ? last.message : 'no source'));
}
function extract(zip, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let r = spawnSync('tar', ['-xf', zip, '-C', dir], { windowsHide: true });
  if (r.status !== 0 && process.platform === 'win32') r = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dir}'`], { windowsHide: true });
  if (r.status !== 0 && process.platform !== 'win32') r = spawnSync('unzip', ['-o', '-q', zip, '-d', dir]);
  if (r.status !== 0) throw new Error('Could not unpack ' + path.basename(zip));
}
async function ensure(kind, label, send) {
  const name = kind === 'ffmpeg' ? 'ffmpeg' : 'realesrgan-ncnn-vulkan';
  let p = tool(name); if (p) return p;
  const zip = path.join(os.tmpdir(), `easycut-${kind}-${Date.now()}.zip`);
  await download(SOURCES[kind], zip, (pct, msg) => send('setup', pct, `Downloading ${label} (one time) · ${msg}`));
  send('setup', 100, `Unpacking ${label}…`);
  extract(zip, path.join(toolsDir(), kind)); fsp.rm(zip, { force: true }).catch(() => {});
  p = tool(name); if (!p) throw new Error(label + ' was downloaded but not found');
  return p;
}

function run(exe, args, { cwd, onData } = {}) {
  return new Promise((resolve, reject) => {
    const ch = spawn(exe, args, { cwd, windowsHide: true }); current = ch; let err = '';
    const feed = (d) => { const s = d.toString(); err = (err + s).slice(-4000); if (onData) onData(s); };
    ch.stdout.on('data', feed); ch.stderr.on('data', feed);
    ch.on('error', (e) => { current = null; reject(e); });
    ch.on('close', (code) => { current = null; if (cancelled) reject(new Error('cancelled')); else if (code === 0) resolve(err); else reject(new Error(err.trim().split(/\r?\n/).slice(-3).join(' ') || 'exit ' + code)); });
  });
}
async function probe(ffmpeg, input) {
  // "ffmpeg -i file" with no output prints the stream info and exits
  const full = await new Promise((r) => { const ch = spawn(ffmpeg, ['-hide_banner', '-i', input], { windowsHide: true }); let s = ''; ch.stderr.on('data', (d) => (s += d)); ch.on('close', () => r(s)); ch.on('error', () => r('')); });
  const v = full.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/), d = full.match(/Duration: (\d+):(\d+):([\d.]+)/), f = full.match(/([\d.]+) fps/) || full.match(/([\d.]+) tbr/);
  if (!v) throw new Error('No video found in this file');
  const vline = (full.match(/Stream #.*Video:.*/) || [''])[0];
  return { hdr: /arib-std-b67|smpte2084/.test(vline), hevc: /hevc|h265/i.test(vline), w: +v[1], h: +v[2], dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, fps: f ? +f[1] : 30, audio: /Stream #.*Audio:/.test(full) };
}
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
function timeOf(s) { const m = s.match(/time=(\d+):(\d+):([\d.]+)/g); if (!m) return null; const x = m[m.length - 1].match(/(\d+):(\d+):([\d.]+)/); return +x[1] * 3600 + +x[2] * 60 + +x[3]; }

async function upscale(opts, sendRaw) {
  cancelled = false;
  const send = (stage, pct, msg) => sendRaw({ stage, pct: Math.max(0, Math.min(100, pct || 0)), msg });
  const mode = opts.mode || 'anime', target = +opts.height || 2160;
  const ffmpeg = await ensure('ffmpeg', 'video tools (FFmpeg)', send);
  let input = opts.input;
  if (!input && opts.data) { input = path.join(os.tmpdir(), `easycut-up-src-${Date.now()}${path.extname(opts.name || '.mp4') || '.mp4'}`); await fsp.writeFile(input, Buffer.from(opts.data)); }
  if (!input || !fs.existsSync(input)) throw new Error('Video file not found');
  const info = await probe(ffmpeg, input);
  const portrait = info.h > info.w, short = Math.min(info.w, info.h);
  const f = target / short, outW = even(info.w * f), outH = even(info.h * f);
  const base = path.basename(input, path.extname(input)).replace(/-up\d+p$/, '');
  const dir = opts.outDir || path.join(app.getPath('videos'), 'EasyCut');
  await fsp.mkdir(dir, { recursive: true });
  const label = target >= 2160 ? '4K' : target >= 1440 ? '2K' : target + 'p';
  const output = path.join(dir, `${base}-${label}-${Date.now().toString(36)}.mp4`);
  const enc = ['-c:v', 'libx264', '-preset', target >= 2160 ? 'medium' : 'slow', '-crf', target >= 2160 ? '17' : '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  const aud = info.audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an'];
  const total = info.dur || 1;
  let method = 'standard', note = '';

  async function standard() {
    send('upscale', 0, 'Upscaling (standard)…');
    await run(ffmpeg, ['-y', '-hide_banner', '-i', input, '-vf', `hqdn3d=1.5:1.5:3:3,scale=${outW}:${outH}:flags=lanczos,cas=0.45`, ...enc, ...aud, output],
      { onData: (s) => { const t = timeOf(s); if (t != null) send('upscale', t / total * 100, `Upscaling (standard) · ${Math.round(t)} / ${Math.round(total)} s`); } });
  }

  if (mode === 'quick') await standard();
  else {
    let esr = null;
    try { esr = await ensure('esrgan', 'AI upscaler (Real-ESRGAN)', send); } catch (e) { if (e.message === 'cancelled') throw e; note = 'AI upscaler could not be downloaded: ' + e.message; }
    if (esr) {
      const work = path.join(os.tmpdir(), 'easycut-up-' + Date.now()), fin = path.join(work, 'in'), fout = path.join(work, 'out');
      await fsp.mkdir(fin, { recursive: true }); await fsp.mkdir(fout, { recursive: true });
      try {
        const fps = Math.min(120, info.fps || 30);
        send('frames', 0, 'Reading frames…');
        await run(ffmpeg, ['-y', '-hide_banner', '-i', input, '-vf', `fps=${fps}`, '-q:v', '1', path.join(fin, '%08d.png')],
          { onData: (s) => { const t = timeOf(s); if (t != null) send('frames', t / total * 100, `Reading frames · ${Math.round(t)} / ${Math.round(total)} s`); } });
        const n = fs.readdirSync(fin).length; if (!n) throw new Error('no frames');
        const model = mode === 'real' ? 'realesrgan-x4plus' : 'realesr-animevideov3';
        const scale = mode === 'real' ? 4 : Math.min(4, Math.max(2, Math.ceil(f - 0.01)));
        send('ai', 0, `AI upscaling ${n} frames…`);
        const t0 = Date.now();
        const timer = setInterval(() => { let k = 0; try { k = fs.readdirSync(fout).length; } catch (e) {} const el = (Date.now() - t0) / 1000, left = k ? el / k * (n - k) : 0; send('ai', k / n * 100, `AI upscaling · frame ${k} / ${n}${k > 2 ? ` · about ${left > 90 ? Math.round(left / 60) + ' min' : Math.round(left) + ' s'} left` : ''}`); }, 700);
        try { await run(esr, ['-i', fin, '-o', fout, '-n', model, '-s', String(scale), '-m', path.join(path.dirname(esr), 'models'), '-f', 'png'], { cwd: path.dirname(esr) }); }
        finally { clearInterval(timer); }
        const m = fs.readdirSync(fout).length; if (m < n) throw new Error(`AI made ${m} of ${n} frames`);
        send('encode', 0, 'Saving the video…');
        await run(ffmpeg, ['-y', '-hide_banner', '-framerate', String(fps), '-i', path.join(fout, '%08d.png'), '-i', input, '-map', '0:v', '-map', '1:a?', '-vf', `scale=${outW}:${outH}:flags=lanczos,cas=0.2`, ...enc, ...aud, '-shortest', output],
          { onData: (s) => { const t = timeOf(s); if (t != null) send('encode', t / total * 100, `Saving the video · ${Math.round(t)} / ${Math.round(total)} s`); } });
        method = 'ai';
      } catch (e) {
        if (e.message === 'cancelled') throw e;
        note = /vulkan|vkcreate|gpu|device/i.test(e.message) ? 'Your graphics card could not run the AI upscaler (Vulkan), so a standard upscale was used.' : 'AI upscale failed (' + e.message.slice(0, 160) + '), so a standard upscale was used.';
      } finally { fsp.rm(work, { recursive: true, force: true }).catch(() => {}); }
    }
    if (method !== 'ai') await standard();
  }
  if (opts.data) fsp.rm(input, { force: true }).catch(() => {});
  send('done', 100, 'Done');
  return { ok: true, path: output, method, note, width: outW, height: outH, from: `${info.w}×${info.h}` };
}

// Edit-friendly copy: H.264, a keyframe every half second (fast cuts and seeking), max 1080p and 30 fps,
// iPhone HDR (HLG / Dolby Vision) converted to normal colors.
async function optimize(opts, sendRaw) {
  cancelled = false;
  const send = (stage, pct, msg) => sendRaw({ stage, pct: Math.max(0, Math.min(100, pct || 0)), msg });
  const ffmpeg = await ensure('ffmpeg', 'video tools (FFmpeg)', send);
  let input = opts.input;
  if (!input && opts.data) { input = path.join(os.tmpdir(), `easycut-opt-src-${Date.now()}${path.extname(opts.name || '.mp4') || '.mp4'}`); await fsp.writeFile(input, Buffer.from(opts.data)); }
  if (!input || !fs.existsSync(input)) throw new Error('Video file not found');
  const info = await probe(ffmpeg, input), short = Math.min(info.w, info.h), k = short > 1080 ? 1080 / short : 1;
  const outW = even(info.w * k), outH = even(info.h * k), fps = Math.min(30, Math.round(info.fps) || 30);
  const dir = path.join(app.getPath('userData'), 'optimized'); await fsp.mkdir(dir, { recursive: true });
  const output = path.join(dir, path.basename(input, path.extname(input)) + '-edit-' + Date.now().toString(36) + '.mp4');
  const tone = info.hdr ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,' : '';
  const total = info.dur || 1;
  const args = (vf) => ['-y', '-hide_banner', '-i', input, '-vf', vf, '-r', String(fps), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', String(Math.max(8, Math.round(fps / 2))), '-bf', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...(info.audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), output];
  const prog = { onData: (s2) => { const t = timeOf(s2); if (t != null) send('optimize', t / total * 100, `Optimizing · ${Math.round(t)} / ${Math.round(total)} s`); } };
  send('optimize', 0, 'Optimizing…');
  try { await run(ffmpeg, args(`${tone}scale=${outW}:${outH}:flags=bicubic,format=yuv420p`), prog); }
  catch (e) { if (e.message === 'cancelled' || !tone) throw e; await run(ffmpeg, args(`scale=${outW}:${outH}:flags=bicubic,format=yuv420p`), prog); }
  if (opts.data) fsp.rm(input, { force: true }).catch(() => {});
  send('done', 100, 'Done');
  return { ok: true, path: output, width: outW, height: outH, from: `${info.w}×${info.h}`, fps, hdr: info.hdr, hevc: info.hevc };
}

function register(ipcMain, getWin) {
  ipcMain.handle('opt-run', async (e, opts) => {
    try { return await optimize(opts, (p) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('up-progress', p); }); }
    catch (err) { return { ok: false, cancelled: err.message === 'cancelled', error: err.message }; }
  });
  ipcMain.handle('up-status', () => ({ ffmpeg: !!tool('ffmpeg'), ai: !!tool('realesrgan-ncnn-vulkan') }));
  ipcMain.handle('up-run', async (e, opts) => {
    try { return await upscale(opts, (p) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('up-progress', p); }); }
    catch (err) { return { ok: false, cancelled: err.message === 'cancelled', error: err.message }; }
  });
  ipcMain.handle('up-cancel', () => { cancelled = true; if (current) try { current.kill(); } catch (e) {} return true; });
}
module.exports = { register, upscale, optimize };
