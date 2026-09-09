// New-Home Permit Radar — county scraper
// Runs on a schedule (GitHub Actions). Opens the Mecklenburg County permit site,
// searches "Residential New Construction Permit" for the last N days, reads every
// result page, opens each permit for the builder/contact details, and writes
// site/data.json — which the web page reads.
//
// Nothing here needs to change day to day. If the county redesigns their site and
// this stops finding results, the selectors near the top of the functions are what
// would need updating.

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DAYS = parseInt(process.env.DAYS || "30", 10);   // how far back to pull
const MAX_PAGES = 80;                                   // safety cap
const OUT = fileURLToPath(new URL("../data.json", import.meta.url));
const SEARCH_URL =
  "https://aca-prod.accela.com/MECKLENBURG/Cap/CapHome.aspx?module=Building&TabName=Building";

function mmddyyyy(d) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scrape + enrich the CURRENTLY displayed results page, entirely in the browser
// (same-origin fetch of each permit's detail page). Returns an array of lead rows.
async function scrapeCurrentPage(page) {
  return await page.evaluate(async () => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const cx = (c, i) => { const x = i == null ? null : c[i]; return x ? clean(x.textContent) : ""; };
    const phoneRe = /(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;
    const emailRe = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
    function headName(blk) {
      let s = clean((blk || "").replace(/\n/g, " ")).replace(/^\*+/, "").trim();
      s = s.split(/\s\d{2,}/)[0];
      s = s.split(emailRe)[0];
      s = s.split(/Receive automatic|United States|Work Phone|Home Phone|Mobile Phone|Business|Building Contractor|General Contractor|\sT\/A\b/i)[0];
      return clean(s).replace(/[,;]$/, "");
    }
    function parseDetail(html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,style,noscript").forEach((e) => e.remove());
      const raw = doc.body ? (doc.body.innerText || doc.body.textContent || "").replace(/\r/g, "") : "";
      const text = clean(raw.replace(/\n/g, " "));
      const between = (start, ends) => {
        const i = raw.indexOf(start); if (i < 0) return "";
        let end = raw.length;
        for (const e of ends) { const j = raw.indexOf(e, i + start.length); if (j >= 0 && j < end) end = j; }
        return raw.slice(i + start.length, end);
      };
      const aB = between("Applicant:", ["Licensed Professional:", "Owner:", "Project Description:", "More Details"]);
      const lB = between("Licensed Professional:", ["Project Description:", "Owner:", "More Details"]);
      const oB = between("Owner:", ["More Details", "Record Info", "Fees", "Payments", "Project Description"]);
      const wL = between("Work Location", ["Record Details", "Record Info"]);
      const out = { applicant: headName(aB), phone: (aB.match(phoneRe) || text.match(phoneRe) || [""])[0],
        email: (aB.match(emailRe) || [""])[0], builder: headName(lB.replace(emailRe, " ")), lic: "",
        owner: headName(oB.split("*")[0]), waddr: "" };
      const pd = (out.phone || "").replace(/\D/g, "");
      if (pd && out.email.replace(/\D/g, "").indexOf(pd) === 0 && /^\d/.test(out.email))
        out.email = out.email.replace(/^\D*\d[\d\s.-]*?(?=[A-Za-z])/, "");
      const m = lB.match(/(Building Contractor|General Contractor|Contractor|Electrical|Plumbing|Mechanical)[^\d]*(\d{3,})/i);
      if (m) out.lic = m[2];
      if (!out.email) out.email = (lB.match(emailRe) || [""])[0];
      const wl = wL.split("\n").map(clean).filter((x) => x && x !== "*");
      if (wl.length) out.waddr = wl.slice(0, 2).join(", ");
      return out;
    }
    function table() {
      for (const t of $$("table")) {
        const h = $$("th", t).map((x) => clean(x.textContent).toLowerCase());
        if (h.indexOf("record number") >= 0) {
          if ($$("td a", t).some((a) => /^RES-NEW/i.test(clean(a.textContent)))) return t;
        }
      }
      return null;
    }
    const t = table();
    if (!t) return [];
    const map = {};
    $$("th", $$("tr", t)[0]).forEach((th, i) => { const k = clean(th.textContent).toLowerCase(); if (k) map[k] = i; });
    const base = [];
    for (const tr of $$("tr", t)) {
      const c = $$("td", tr); if (!c.length) continue;
      const rc = c[map["record number"]]; if (!rc) continue;
      const rec = clean(rc.textContent); if (!rec || !/^RES-NEW/i.test(rec)) continue;
      const link = rc.querySelector("a");
      const addr = cx(c, map["address"]);
      const zip = (addr.match(/\b(\d{5})\b/) || [])[1] || "";
      base.push({ rec, date: cx(c, map["date"]), addr, zip, desc: cx(c, map["description"]),
        status: cx(c, map["status"]), url: link ? link.href : "" });
    }
    const out = [];
    for (const b of base) {
      let d = {};
      if (b.url) { try { const r = await fetch(b.url, { credentials: "same-origin" }); d = parseDetail(await r.text()); } catch (e) {} }
      // normalise MM/DD/YYYY -> YYYY-MM-DD
      let iso = b.date;
      const mm = b.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (mm) iso = `${mm[3]}-${mm[1].padStart(2, "0")}-${mm[2].padStart(2, "0")}`;
      out.push({ rec: b.rec, date: iso, addr: b.addr, zip: b.zip, desc: b.desc,
        builder: d.builder || "", lic: d.lic || "", applicant: d.applicant || "", phone: d.phone || "",
        email: d.email || "", owner: d.owner || "", status: b.status, url: b.url });
      await new Promise((rs) => setTimeout(rs, 60));
    }
    return out;
  });
}

function firstRec(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    for (const t of document.querySelectorAll("table")) {
      const h = Array.from(t.querySelectorAll("th")).map((x) => clean(x.textContent).toLowerCase());
      if (h.indexOf("record number") >= 0) {
        const idx = h.indexOf("record number");
        for (const tr of t.querySelectorAll("tr")) {
          const c = tr.querySelectorAll("td");
          if (c.length && c[idx]) { const v = clean(c[idx].textContent); if (v) return v; }
        }
      }
    }
    return "";
  });
}

async function run() {
  const end = new Date();
  const start = new Date(); start.setDate(end.getDate() - DAYS);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  console.log(`Opening county site, pulling last ${DAYS} days (${mmddyyyy(start)} – ${mmddyyyy(end)})…`);
  await page.goto(SEARCH_URL, { waitUntil: "networkidle" });

  // Set the record type by value + the date window WITHOUT firing the dropdown's
  // auto-reload (this matches the flow that works by hand), then submit.
  await page.evaluate(({ s, e }) => {
    const t = document.querySelector('select[id*="ddlGSPermitType"]');
    if (t) {
      const opt = Array.from(t.options).find((o) => (o.textContent || "").trim() === "Residential New Construction Permit");
      if (opt) t.value = opt.value;
    }
    const sd = document.querySelector('input[id*="txtGSStartDate"]');
    const ed = document.querySelector('input[id*="txtGSEndDate"]');
    if (sd) sd.value = s;
    if (ed) ed.value = e;
  }, { s: mmddyyyy(start), e: mmddyyyy(end) });

  // Run the search (a full page postback)
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
    page.click('a[id*="btnNewSearch"]'),
  ]);
  // Wait until the results grid actually shows residential records
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("td a")).some((a) => /^RES-NEW/i.test((a.textContent || "").trim())),
    { timeout: 45000 }
  ).catch(() => {});
  await sleep(1000);

  const byRec = new Map();
  for (let p = 1; p <= MAX_PAGES; p++) {
    const rows = await scrapeCurrentPage(page);
    rows.forEach((r) => { if (!byRec.has(r.rec)) byRec.set(r.rec, r); });
    console.log(`  page ${p}: ${rows.length} residential rows (running total ${byRec.size})`);

    // Find an enabled "Next >" link
    const before = await firstRec(page);
    const next = page.locator('a', { hasText: /^\s*Next\s*>?\s*$/ }).first();
    if (!(await next.count()) || !(await next.isVisible())) break;
    await next.click().catch(() => {});
    // wait for the table's first record to change
    let changed = false;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      const now = await firstRec(page);
      if (now && now !== before) { changed = true; break; }
    }
    if (!changed) break;
  }

  const rows = Array.from(byRec.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const out = {
    meta: {
      updated: new Date().toISOString().slice(0, 10),
      count: rows.length,
      rangeDays: DAYS,
      source: "Mecklenburg County Accela — Permit & Inspections (Building), record type Residential New Construction Permit",
    },
    rows,
  };

  await browser.close();

  if (rows.length === 0) {
    console.error("No rows found — leaving existing data.json untouched so the site doesn't go blank.");
    process.exit(1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${rows.length} permits to ${OUT}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
