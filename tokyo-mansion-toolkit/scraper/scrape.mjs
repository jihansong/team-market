#!/usr/bin/env node
/**
 * tokyo-condo-scraper / scrape.mjs
 *
 * Playwright-based extractor for SUUMO / HOMES 中古マンション detail pages.
 *
 * USAGE
 *   node scrape.mjs [urls.txt] [--concurrency=1] [--headful] [--force]
 *                   [--proxy=http://user:pass@host:port] [--out=./out]
 *                   [--min-delay=1000] [--max-delay=3000]
 *
 * NOTE
 *   Both SUUMO and HOMES aggressively IP-filter; from non-JP residential IPs
 *   you will most likely receive HTTP 403 or a CAPTCHA wall. Run from a
 *   Japanese consumer ISP or a residential proxy. See README.md.
 */

import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    urlsFile: './urls.txt',
    concurrency: 1,
    headful: false,
    force: false,
    proxy: null,
    out: './out',
    minDelay: 1000,
    maxDelay: 3000,
  };
  const positional = [];
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      switch (k) {
        case 'concurrency':
          args.concurrency = Math.min(2, Math.max(1, parseInt(v ?? '1', 10) || 1));
          break;
        case 'headful':
          args.headful = true;
          break;
        case 'force':
          args.force = true;
          break;
        case 'proxy':
          args.proxy = v ?? null;
          break;
        case 'out':
          args.out = v ?? './out';
          break;
        case 'min-delay':
          args.minDelay = parseInt(v, 10) || 1000;
          break;
        case 'max-delay':
          args.maxDelay = parseInt(v, 10) || 3000;
          break;
        default:
          console.warn(`[warn] unknown flag: --${k}`);
      }
    } else {
      positional.push(a);
    }
  }
  if (positional[0]) args.urlsFile = positional[0];
  return args;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo, hi) => sleep(lo + Math.floor(Math.random() * Math.max(1, hi - lo)));

function toInt(s) {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function toFloat(s) {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** "8,500万円" -> 8500 (in 万円) ; "1億2,000万円" -> 12000 */
function parsePriceMan(raw) {
  if (!raw) return null;
  const t = String(raw).replace(/\s/g, '');
  let total = 0;
  const oku = t.match(/(\d+(?:\.\d+)?)億/);
  const man = t.match(/(\d+(?:,\d+)?(?:\.\d+)?)万/);
  if (oku) total += Math.round(parseFloat(oku[1]) * 10000);
  if (man) total += Math.round(parseFloat(man[1].replace(/,/g, '')));
  if (!oku && !man) {
    // Fallback: bare number assumed to be 万円
    const n = toInt(t);
    if (n != null) total = n;
  }
  return total || null;
}

/** "11階/34階建" -> {unit_floor: 11, total_floors: 34} */
function parseFloorPair(raw) {
  if (!raw) return { unit_floor: null, total_floors: null };
  const t = String(raw);
  const unit = t.match(/(\d+)\s*階(?!\s*建)/);
  const total = t.match(/(\d+)\s*階\s*建/);
  return {
    unit_floor: unit ? parseInt(unit[1], 10) : null,
    total_floors: total ? parseInt(total[1], 10) : null,
  };
}

/** "1981年3月" / "1981/03" / "1981年3月築" -> "1981-03" */
function parseBuiltYM(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{4})\D+(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
}

/** "東京メトロ千代田線/赤坂駅 徒歩5分" -> {line, station, walk_min} */
function parseRoute(raw) {
  if (!raw) return null;
  const t = String(raw).replace(/\s+/g, ' ').trim();
  const walk = t.match(/徒歩\s*(\d+)\s*分/);
  // Try "<line>/<station>駅" or "<line> <station>駅"
  let line = null;
  let station = null;
  const m = t.match(/^(.+?線)\s*[\/\s]\s*(.+?駅)/);
  if (m) {
    line = m[1].trim();
    station = m[2].replace(/駅$/, '').trim();
  } else {
    const m2 = t.match(/(.+?駅)/);
    if (m2) station = m2[1].replace(/駅$/, '').trim();
  }
  return {
    line,
    station,
    walk_min: walk ? parseInt(walk[1], 10) : null,
  };
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9一-龥ぁ-んァ-ンー]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Site registry
// ---------------------------------------------------------------------------
//
// Adding a new site:
//   1. Push an entry into SITES with { id, match, waitFor, parse }.
//   2. `match(hostname)` returns true if this site handles the URL.
//   3. `waitFor(page)` blocks until the detail content is rendered.
//   4. `parse(page)` returns the structured JSON for the listing.
//
// Selectors below are best-effort and reflect publicly observable structure of
// SUUMO / HOMES detail pages. They WILL drift; mark TODOs where unverifiable.

const SITES = [];

// ---------- SUUMO ----------------------------------------------------------

SITES.push({
  id: 'suumo',
  match: (host) => /(^|\.)suumo\.jp$/i.test(host),
  waitFor: async (page) => {
    // Detail tables on SUUMO 中古マンション use `.l-tbl_arrange` or
    // legacy `.property_view_table` / `#mainContents` wrappers.
    await page.waitForSelector(
      '#mainContents, .property_view_table, table.l-tbl_arrange, .section_h1, .mainpanel',
      { timeout: 30000 },
    );
  },
  parse: async (page) => {
    return await page.evaluate(() => {
      const text = (el) =>
        (el?.textContent || '')
          .replace(/ /g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      // --- Building name -------------------------------------------------
      const name =
        text(document.querySelector('h1.section_h1-header-title')) ||
        text(document.querySelector('h1#mainContents h1')) ||
        text(document.querySelector('h1')) ||
        null;

      // --- Generic key/value harvester over all detail tables -----------
      const kv = {};
      const tables = document.querySelectorAll(
        'table.l-tbl_arrange, .property_view_table, table.mt5, table.mt10, table.data_table',
      );
      tables.forEach((tbl) => {
        tbl.querySelectorAll('tr').forEach((tr) => {
          const ths = tr.querySelectorAll('th');
          const tds = tr.querySelectorAll('td');
          // Pairs may alternate th/td/th/td in the same row.
          const cells = tr.querySelectorAll('th, td');
          for (let i = 0; i < cells.length - 1; i++) {
            if (cells[i].tagName === 'TH' && cells[i + 1].tagName === 'TD') {
              const k = text(cells[i]);
              const v = text(cells[i + 1]);
              if (k && v && !(k in kv)) kv[k] = v;
            }
          }
          // Fallback: first th -> joined tds
          if (ths.length === 1 && tds.length >= 1) {
            const k = text(ths[0]);
            const v = [...tds].map(text).filter(Boolean).join(' / ');
            if (k && v && !(k in kv)) kv[k] = v;
          }
        });
      });

      // --- Images --------------------------------------------------------
      // SUUMO renders a slideshow; thumbnails carry caption text in <img alt>
      // or in sibling caption nodes.
      const imgs = [];
      document.querySelectorAll('img').forEach((img) => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src');
        if (!src) return;
        if (!/^https?:/.test(src)) return;
        if (/spacer|loading|blank|sprite/i.test(src)) return;
        const alt = img.getAttribute('alt') || '';
        const cap =
          img.closest('li,figure,div')?.querySelector('.caption, .text')?.textContent || '';
        imgs.push({ src, alt: (alt + ' ' + cap).trim() });
      });

      return { name, kv, imgs };
    });
  },
});

// ---------- HOMES ----------------------------------------------------------

SITES.push({
  id: 'homes',
  match: (host) => /(^|\.)homes\.co\.jp$/i.test(host),
  waitFor: async (page) => {
    await page.waitForSelector(
      '#contents, .mod-detailTableA, .bukken-detail-table, .mod-buildingDetail, h1',
      { timeout: 30000 },
    );
  },
  parse: async (page) => {
    return await page.evaluate(() => {
      const text = (el) =>
        (el?.textContent || '')
          .replace(/ /g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      // --- Building name -------------------------------------------------
      const name =
        text(document.querySelector('h1.bukkenName')) ||
        text(document.querySelector('h1.heading')) ||
        text(document.querySelector('h1')) ||
        null;

      // --- Key/value harvest --------------------------------------------
      const kv = {};
      const tables = document.querySelectorAll(
        '.mod-detailTableA, .bukken-detail-table, table.detailTable, table.spec, dl.detailMod',
      );
      tables.forEach((tbl) => {
        // Tables (th/td)
        tbl.querySelectorAll('tr').forEach((tr) => {
          const cells = tr.querySelectorAll('th, td');
          for (let i = 0; i < cells.length - 1; i++) {
            if (cells[i].tagName === 'TH' && cells[i + 1].tagName === 'TD') {
              const k = text(cells[i]);
              const v = text(cells[i + 1]);
              if (k && v && !(k in kv)) kv[k] = v;
            }
          }
        });
        // Definition lists (dt/dd)
        const dts = tbl.querySelectorAll('dt');
        dts.forEach((dt) => {
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName === 'DD') {
            const k = text(dt);
            const v = text(dd);
            if (k && v && !(k in kv)) kv[k] = v;
          }
        });
      });

      // --- Images --------------------------------------------------------
      const imgs = [];
      document.querySelectorAll('img').forEach((img) => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src');
        if (!src) return;
        if (!/^https?:/.test(src)) return;
        if (/spacer|loading|blank|sprite|icon/i.test(src)) return;
        const alt = img.getAttribute('alt') || '';
        const cap =
          img.closest('li,figure,div')?.querySelector('.caption, .text, figcaption')
            ?.textContent || '';
        imgs.push({ src, alt: (alt + ' ' + cap).trim() });
      });

      return { name, kv, imgs };
    });
  },
});

function siteFor(url) {
  const u = new URL(url);
  return SITES.find((s) => s.match(u.hostname)) || null;
}

// ---------------------------------------------------------------------------
// Field normalization (shared across sites)
// ---------------------------------------------------------------------------
//
// Both SUUMO and HOMES use Japanese row labels with slightly different naming.
// We map a generous set of synonyms onto a single canonical schema.

const LABELS = {
  building_name: ['物件名', 'マンション名', '建物名'],
  address: ['住所', '所在地'],
  price: ['価格', '販売価格'],
  area: ['専有面積', '専有面積（壁芯）', '専有面積(壁芯)', '面積'],
  layout: ['間取り', '間取'],
  balcony: ['バルコニー面積', 'バルコニー'],
  direction: ['主要採光面', '向き', '方位', 'バルコニー方向'],
  built: ['築年月', '完成時期', '築年月日', '竣工'],
  structure: ['構造', '建物構造', '構造・規模'],
  total_units: ['総戸数', '総戸'],
  floor_pair: ['階建', '階数', '所在階/階数', '所在階/構造・階建', '構造・階建', '階建/階'],
  unit_floor: ['所在階'],
  room_number: ['部屋番号', '号室'],
  routes: ['交通', '最寄駅', '駅'],
  mgmt_fee: ['管理費', '管理費等'],
  repair_reserve: ['修繕積立金', '積立金'],
  parking: ['駐車場', '駐車場区分'],
  rent: ['賃料', '想定賃料', '想定家賃'],
  builder: ['施工会社', '施工', '施工業者'],
  mgmt_company: ['管理会社', '管理'],
  developer: ['分譲会社', '売主', '事業主', '販売会社'],
  status: ['現況', '現状', '居住状況'],
  handover: ['引渡', '引渡し', '引渡時期', '入居', '入居時期'],
  deal_type: ['取引態様', '取引形態'],
};

function pick(kv, keys) {
  for (const k of keys) if (k in kv) return kv[k];
  // Loose contains-match fallback
  const kvKeys = Object.keys(kv);
  for (const k of keys) {
    const hit = kvKeys.find((kk) => kk.includes(k));
    if (hit) return kv[hit];
  }
  return null;
}

function parseParking(raw) {
  if (!raw) return { parking_jpy: null, parking_status: null, raw: null };
  const t = String(raw);
  let status = null;
  if (/空有|空きあり|空車あり/.test(t)) status = '空有';
  else if (/空無|空きなし|満車/.test(t)) status = '空無';
  else if (/無/.test(t)) status = '無';
  else if (/有/.test(t)) status = '有';
  const fee = t.match(/([\d,]+)\s*円/);
  return {
    parking_jpy: fee ? parseInt(fee[1].replace(/,/g, ''), 10) : null,
    parking_status: status,
    raw: t,
  };
}

function parseRoutes(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[、,\n]|\s\/\s/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseRoute)
    .filter((r) => r && (r.station || r.line));
}

function normalize(kv, sourceId, sourceUrl, name) {
  const priceRaw = pick(kv, LABELS.price);
  const areaRaw = pick(kv, LABELS.area);
  const balRaw = pick(kv, LABELS.balcony);
  const builtRaw = pick(kv, LABELS.built);
  const floorRaw = pick(kv, LABELS.floor_pair) || pick(kv, LABELS.unit_floor);
  const { unit_floor, total_floors } = parseFloorPair(floorRaw);
  const parking = parseParking(pick(kv, LABELS.parking));

  return {
    source: sourceId,
    source_url: sourceUrl,
    building_name: pick(kv, LABELS.building_name) || name || null,
    address: pick(kv, LABELS.address) || null,
    price_jpy_man: parsePriceMan(priceRaw),
    price_raw: priceRaw,
    area_m2: toFloat(areaRaw),
    area_raw: areaRaw,
    layout: pick(kv, LABELS.layout) || null,
    balcony_m2: toFloat(balRaw),
    direction: pick(kv, LABELS.direction) || null,
    built_yearmonth: parseBuiltYM(builtRaw),
    built_raw: builtRaw,
    structure: pick(kv, LABELS.structure) || null,
    total_units: toInt(pick(kv, LABELS.total_units)),
    total_floors,
    unit_floor: unit_floor ?? toInt(pick(kv, LABELS.unit_floor)),
    floor_raw: floorRaw,
    room_number: pick(kv, LABELS.room_number) || null,
    routes: parseRoutes(pick(kv, LABELS.routes)),
    mgmt_fee_jpy: toInt(pick(kv, LABELS.mgmt_fee)),
    repair_reserve_jpy: toInt(pick(kv, LABELS.repair_reserve)),
    parking_jpy: parking.parking_jpy,
    parking_status: parking.parking_status,
    parking_raw: parking.raw,
    rent_jpy: toInt(pick(kv, LABELS.rent)),
    builder: pick(kv, LABELS.builder) || null,
    mgmt_company: pick(kv, LABELS.mgmt_company) || null,
    developer: pick(kv, LABELS.developer) || null,
    status: pick(kv, LABELS.status) || null,
    handover: pick(kv, LABELS.handover) || null,
    deal_type: pick(kv, LABELS.deal_type) || null,
    _raw_kv: kv,
  };
}

// ---------------------------------------------------------------------------
// Image classification + download
// ---------------------------------------------------------------------------

function classifyImage(altText) {
  const a = (altText || '').toLowerCase();
  // Floor plan
  if (/間取|madori|floor\s*plan|floorplan|平面図/i.test(altText) || /madori/.test(a))
    return 'floorplan';
  // Exterior
  if (/外観|gaikan|exterior|エントランス|建物|外/i.test(altText)) return 'exterior';
  // Interior
  if (
    /室内|リビング|ダイニング|キッチン|洋室|和室|寝室|浴室|バス|トイレ|洗面|玄関|収納|interior|living|kitchen|room/i.test(
      altText,
    )
  )
    return 'interior';
  return null;
}

async function downloadImage(context, url, destPath) {
  // Use the browser context so cookies / referer are sent.
  const res = await context.request.get(url, { timeout: 30000 });
  if (!res.ok()) throw new Error(`image ${url} -> HTTP ${res.status()}`);
  const buf = await res.body();
  await fs.writeFile(destPath, buf);
}

function extFromUrl(u) {
  const m = u.match(/\.(jpe?g|png|gif|webp)(\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

// ---------------------------------------------------------------------------
// Page mechanics
// ---------------------------------------------------------------------------

async function autoScroll(page) {
  // Lazy-loaded images: scroll the page to the bottom in steps to trigger them.
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = 600;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        y += step;
        if (y >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
}

// ---------------------------------------------------------------------------
// Per-URL worker
// ---------------------------------------------------------------------------

async function scrapeOne(browser, url, opts) {
  const site = siteFor(url);
  if (!site) throw new Error(`No site handler for ${url}`);

  const slug = `${site.id}-${slugify(new URL(url).pathname)}`;
  const dir = path.join(opts.out, slug);
  const jsonPath = path.join(dir, 'property.json');

  if (!opts.force && (await exists(jsonPath))) {
    console.log(`[skip] ${slug} (property.json exists; use --force to overwrite)`);
    const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    return { slug, data, skipped: true };
  }

  await ensureDir(dir);

  const context = await browser.newContext({
    userAgent: UA,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'ja,en;q=0.8',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });

  const page = await context.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!resp) throw new Error('no response');
    if (resp.status() >= 400)
      throw new Error(`HTTP ${resp.status()} (IP filter / CAPTCHA likely; run from JP IP)`);

    await site.waitFor(page);
    await autoScroll(page);

    const raw = await site.parse(page);
    const norm = normalize(raw.kv, site.id, url, raw.name);

    // --- Image downloads ---------------------------------------------------
    const counts = { exterior: 0, interior: 0, floorplan: 0 };
    const images = [];
    // De-dup by src
    const seen = new Set();
    for (const img of raw.imgs) {
      if (seen.has(img.src)) continue;
      seen.add(img.src);
      const kind = classifyImage(img.alt);
      if (!kind) continue;
      counts[kind] += 1;
      const idx = String(counts[kind]).padStart(2, '0');
      const fname = `${kind}_${idx}.${extFromUrl(img.src)}`;
      const dest = path.join(dir, fname);
      try {
        await downloadImage(context, img.src, dest);
        images.push({ kind, alt: img.alt, src: img.src, file: fname });
      } catch (e) {
        console.warn(`[warn] image fail ${img.src}: ${e.message}`);
      }
    }
    norm.images = images;

    await fs.writeFile(jsonPath, JSON.stringify(norm, null, 2), 'utf8');
    console.log(`[ok]   ${slug}  (${images.length} imgs)`);

    return { slug, data: norm, skipped: false };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// URL list loader
// ---------------------------------------------------------------------------

async function loadUrls(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

async function runPool(items, n, worker) {
  const queue = items.slice();
  const inflight = new Set();
  const results = [];
  while (queue.length || inflight.size) {
    while (inflight.size < n && queue.length) {
      const item = queue.shift();
      const p = (async () => worker(item))()
        .then((r) => results.push({ ok: true, item, value: r }))
        .catch((e) => results.push({ ok: false, item, error: e }))
        .finally(() => inflight.delete(p));
      inflight.add(p);
    }
    if (inflight.size) await Promise.race(inflight);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);
  await ensureDir(opts.out);

  const urls = await loadUrls(opts.urlsFile);
  if (urls.length === 0) {
    console.error(`No URLs found in ${opts.urlsFile}`);
    process.exit(2);
  }
  console.log(
    `[info] ${urls.length} URL(s), concurrency=${opts.concurrency}, out=${opts.out}`,
  );

  const launchOpts = { headless: !opts.headful };
  if (opts.proxy) launchOpts.proxy = { server: opts.proxy };

  const browser = await chromium.launch(launchOpts);

  const errorsLog = path.join(opts.out, 'errors.log');
  const indexPath = path.join(opts.out, 'index.json');
  const allRecords = [];

  try {
    const results = await runPool(urls, opts.concurrency, async (url) => {
      try {
        const r = await scrapeOne(browser, url, opts);
        allRecords.push({ url, slug: r.slug, ok: true, skipped: r.skipped });
        return r;
      } catch (e) {
        const line = `[${new Date().toISOString()}] ${url}\n  ${e.stack || e.message}\n`;
        await fs.appendFile(errorsLog, line);
        console.error(`[err]  ${url}: ${e.message}`);
        allRecords.push({ url, ok: false, error: String(e.message) });
        throw e;
      } finally {
        await jitter(opts.minDelay, opts.maxDelay);
      }
    });

    // Aggregate index
    const index = [];
    for (const r of results) {
      if (r.ok && r.value?.data) {
        index.push({
          slug: r.value.slug,
          source: r.value.data.source,
          source_url: r.value.data.source_url,
          building_name: r.value.data.building_name,
          price_jpy_man: r.value.data.price_jpy_man,
          area_m2: r.value.data.area_m2,
          layout: r.value.data.layout,
          address: r.value.data.address,
          skipped: r.value.skipped,
        });
      }
    }
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
    console.log(`[done] index -> ${indexPath}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

const __file = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__file)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
