// ==UserScript==
// @name         Gladly SLA Tracker + Liveboard Monitor
// @namespace    gladly-sla-tracker
// @version      3.6.0
// @description  Command Center for Gladly: Email SLA, Open Email SLA, Agent Liveboard alerts and Airplane Mode in one docked panel, fed by hidden background frames. Same behaviour as the Gladly Command Center Chrome extension.
// @match        https://*.gladly.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_notification
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/jpalenceloph-collab/gladly-sla-tracker/main/Gladly-SLA-Tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/jpalenceloph-collab/gladly-sla-tracker/main/Gladly-SLA-Tracker.user.js
// @run-at       document-idle
// ==/UserScript==

// Ported from Gladly Command Center (Chrome extension) v3.6.0.
// The extension shows its dashboard in Chrome's side panel; a userscript can't, so the same
// dashboard is docked on the right edge of the Gladly page (launcher tab, ↔ to widen, ✕ to hide).

(function () {
  'use strict';
  /************************************************************
   * CONFIG
   ************************************************************/
  const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxKkXQU_4Pgq0ZpOmyhe_0ml8yzbAclImTAb5RO4Yqyt9SgnWBMBSkMZ4TG3Yj4ZcT2/exec';
  const SEND_SNAPSHOTS = true;
  const SEND_ALERTS = true;

  const GROUP = 'groups%5B0%5D=JqaiVa-7Rf-Vfi-U_Vhrhw';
  const VIEWS = {
    email: {
      label: 'Email', icon: '📧',
      path: '/search?ch%5B0%5D=EMAIL&ib%5B0%5D=JqaiVa-7Rf-Vfi-U_Vhrhw&st%5B0%5D=NEW&ts%5B0%5D=conversation&ts%5B1%5D=task',
      test: (p, q) => p.startsWith('/search') && !/st%5B0%5D=OPEN|st\[0\]=OPEN/i.test(q || ''),
      frame: { w: 1400, h: 2400 },
      staleMs: 5 * 60 * 1000,
    },
    emailopen: {
      label: 'Open Email', icon: '📬',
      path: '/search?ch%5B0%5D=EMAIL&ib%5B0%5D=JqaiVa-7Rf-Vfi-U_Vhrhw&st%5B0%5D=OPEN&ts%5B0%5D=conversation&ts%5B1%5D=task',
      test: (p, q) => p.startsWith('/search') && /st%5B0%5D=OPEN|st\[0\]=OPEN/i.test(q || ''),
      frame: { w: 1400, h: 2400 },
      staleMs: 5 * 60 * 1000,
    },
    agents: {
      label: 'Agents', icon: '🚨',
      path: '/liveboards/agents?' + GROUP + '&teams%5B0%5D=XjGcmewvS7yY30S6KC6q3w&teams%5B1%5D=sDN6IVQrTvyyBtfcpZIT_A',
      test: (p) => p.startsWith('/liveboards/agents'),
      frame: { w: 1600, h: 3200 },
      staleMs: 30 * 1000,
    },
    airplane: {
      label: 'Airplane', icon: '✈️',
      path: '/liveboards/floorboard?' + GROUP,
      test: (p) => p.startsWith('/liveboards/floorboard'),
      frame: { w: 1600, h: 3200 },
      staleMs: 30 * 1000,
    },
  };
  const ROLES = Object.keys(VIEWS);

  const WORKER_POLL_MS = 5000;        // agents / airplane read interval
  const EMAIL_RESCAN_MS = 90 * 1000;  // pause between full email scans
  const MAX_SCAN_PAGES = 200;
  const PAGE_ADVANCE_TIMEOUT_MS = 8000;
  const PAGE_ADVANCE_POLL_MS = 200;

  // Alert thresholds (unchanged from v2.8.5)
  const CHAT_TOO_LONG_MIN = 7;
  const CHAT_ALERT_THRESHOLD = 3;
  const TOGGLE_COUNT_THRESHOLD = 3;
  const TOGGLE_WINDOW_MS = 5 * 60 * 1000;
  const REPEAT_ALERT_COOLDOWN_MS = 5 * 1000;
  const SLA_HOURS = 12;
  const NOTIFY_THRESHOLD_MIN = 30;

  const MONITORED_AGENTS = new Set([
    "Aaron T.", "Abiatar N.", "Alex L.", "Anna D.", "Anthony M.", "Aris N", "Aurora L.", "Ayessa Dane D.",
    "Bea Gabrielle B.", "Belle E.", "Carl I.", "Carla M.", "Chelsea Mae T.", "Chezka G.", "Chezka Joy G.",
    "Christian Dave D.", "Christian T.", "Claytie N.", "Cristine O.", "Cyril T.", "Dane A.", "Danica A.",
    "Daniel C.", "Daniel S.", "Dominique T.", "Edwin D.", "Eiriyel Roy A.", "Emmanuel M.", "Fergie G",
    "Gerald T.", "Hadji Q.", "Hannah C", "Hanz G.", "Hasna H.", "Ilias D.", "Ivee B.", "Jaimee V.", "Jan Q.",
    "Jane O.", "Janine Joyce O.", "Jay C.", "Jaymie M.", "Jeal D.", "Jemuel E.", "Jennifer G", "Jenny P.",
    "Jerome F.", "Jessica B.", "Jessie C.", "Jiulian P.", "Joey L.", "John Ashley P.", "John Carlo N.",
    "John P.", "Jorge T.", "Joseph C.", "Joshua B.", "Jovan B.", "Juliet N.", "June Lee A.", "Justin Y.",
    "Kate B.", "Kazandra A.", "Ken P.", "Kenneth Kyle H.", "Kent D.", "Khyl N.", "Kristel Marivic S.",
    "Kyle G", "Kylle S.", "MA.Elena T.", "Margie Lyn B.", "Maria U.", "Marienne L.", "Mark C", "Mark T.",
    "Mary A.", "Mary Antoneth U.", "Mary S.", "Matt A.", "Mauie C", "Maybel B.", "Merie R.", "Nikki C.",
    "Niño Jay C.", "Norallyza C.", "Orligene B.", "Paul R.", "Paulo Z.", "Ralph B.", "Raynier M.",
    "Rhaine T.", "Rian Nicole R.", "Rianne A.", "Rishierl C.", "Rouen P.", "Shamaika S.", "Sharica C.",
    "Sherwin D.", "Sofia D.", "Ulycis G.", "Xyrine Nicole A.", "Zyreen P."
  ]);

  const BUCKETS = [
    { label: 'OVERDUE',   max: 0,                  color: '#fca5a5', bg: 'rgba(239,68,68,.20)',  lc: '#b91c1c', lbg: 'rgba(239,68,68,.12)' },
    { label: 'Due < 1h',  max: 3600000,            color: '#fdba74', bg: 'rgba(249,115,22,.18)', lc: '#c2410c', lbg: 'rgba(249,115,22,.12)' },
    { label: 'Due < 3h',  max: 3 * 3600000,        color: '#fcd34d', bg: 'rgba(245,158,11,.16)', lc: '#a16207', lbg: 'rgba(245,158,11,.16)' },
    { label: 'Due < 6h',  max: 6 * 3600000,        color: '#bef264', bg: 'rgba(132,204,22,.14)', lc: '#4d7c0f', lbg: 'rgba(132,204,22,.18)' },
    { label: 'Due later', max: Infinity,           color: '#86efac', bg: 'rgba(34,197,94,.15)',  lc: '#15803d', lbg: 'rgba(34,197,94,.14)' },
  ];

  /************************************************************
   * SHARED HELPERS
   ************************************************************/
  const isTop = window.top === window.self;
  // Userscript: the dashboard is drawn inside the top Gladly page (docked panel).
  const IS_VIEWER = false;

  function roleOfPath(p, q) {
    for (const r of ROLES) if (VIEWS[r].test(p, q)) return r;
    return null;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const feedKey = (r) => 'gcc_feed_' + r;
  function feedGet(role) {
    try { return JSON.parse(GM_getValue(feedKey(role), 'null')); } catch (e) { return null; }
  }
  function feedSet(role, obj) {
    GM_setValue(feedKey(role), JSON.stringify(Object.assign({ ts: Date.now() }, obj)));
  }

  function parseMinutes(text) {
    if (!text) return 0;
    text = text.trim();
    if (/^\d+(:\d+){1,2}$/.test(text)) {
      const p = text.split(':').map(Number);
      if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
      return p[0] + p[1] / 60;
    }
    const h = Number((text.match(/(\d+)h/) || [0, 0])[1]);
    const m = Number((text.match(/(\d+)m/) || [0, 0])[1]);
    const s = Number((text.match(/(\d+)s/) || [0, 0])[1]);
    return h * 60 + m + s / 60;
  }

  function bucketFor(ms) {
    for (const b of BUCKETS) if (ms < b.max) return b;
    return BUCKETS[BUCKETS.length - 1];
  }
  function fmtRemaining(ms) {
    const over = ms < 0, abs = Math.abs(ms);
    const h = Math.floor(abs / 3600000), m = Math.floor((abs % 3600000) / 60000);
    const t = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return over ? `-${t} (overdue)` : t;
  }
  function fmtSince(ts) {
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 60) return secs + 's';
    return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
  }

  /************************************************************
   * WORKER SIDE — runs inside every Gladly page/frame that shows
   * one of the three views, reads its DOM, publishes to shared
   * storage. The dashboard (top frame) loads each view in a hidden
   * iframe so all three are always being read.
   ************************************************************/
  // ---- liveboard / airplane readers ----
  function getAvailability(row) {
    const c = row.querySelector('.agentStatusCard-row-status');
    if (!c) return { email: false, phone: false, chat: false };
    return {
      email: !!c.querySelector('.agentStatusCard-row-status-email-available'),
      phone: !!c.querySelector('.agentStatusCard-row-status-voice-available'),
      chat: !!c.querySelector('.agentStatusCard-row-status-messaging-available'),
    };
  }
  function getCurrentActivities(row) {
    const out = [];
    const cont = row.querySelector('.agentStatusCard-row-current');
    if (!cont) return out;
    cont.querySelectorAll('.pillList-pill').forEach((pill) => {
      const svg = pill.querySelector('svg');
      if (!svg) return;
      const cls = (svg.className && svg.className.baseVal) || '';
      let channel = 'unknown';
      if (cls.includes('chatIcon')) channel = 'chat';
      else if (cls.includes('voiceIcon')) channel = 'phone';
      else if (cls.includes('emailIcon')) channel = 'email';
      const dur = pill.querySelector('.pillList-duration');
      const durationText = dur ? dur.innerText.trim() : '';
      out.push({ channel, durationText, minutes: parseMinutes(durationText) });
    });
    return out;
  }
  // Focus mode: a marker in the column to the LEFT of the agent's name.
  // Returns every "focus"-looking class/attribute with its state (on / off / neutral);
  // readAgentRows then decides, so a marker that is on EVERY row (decorative) is ignored.
  let focusInfo = [];
  function detectFocus(row, nameEl, reasonEl) {
    const BAD = /focus-?(visible|able|ring|within|trap|lock|outline)/i;
    const OFF = /(^|[-_\s])(unavailable|inactive|disabled|off|hidden|none|false)($|[-_\s])/i;
    const ON = /(^|[-_\s])(available|active|enabled|on|true)($|[-_\s])/i;
    const stateOf = (str) => (OFF.test(str) ? 'off' : ON.test(str) ? 'on' : 'neutral');
    const before = [];
    row.querySelectorAll('*').forEach((el) => {
      if (el === nameEl || el.contains(nameEl)) return;
      if (nameEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) before.push(el);
    });
    const cands = [];
    const seen = new Set();
    const add = (str) => {
      if (!str || !/focus/i.test(str) || BAD.test(str)) return;
      const t = str.trim().slice(0, 90);
      if (seen.has(t)) return;
      seen.add(t);
      cands.push({ t, state: stateOf(t) });
    };
    for (const el of before) {
      (el.getAttribute('class') || '').split(/\s+/).forEach(add);
      ['aria-label', 'title', 'alt', 'data-aid', 'data-testid', 'data-icon', 'href', 'xlink:href']
        .forEach((a) => add(el.getAttribute(a)));
      if (el.tagName && el.tagName.toLowerCase() === 'title') add(el.textContent);
      if (!el.children.length) add((el.textContent || '').trim());
    }
    const rf = !!(reasonEl && /focus/i.test(reasonEl.innerText || ''));
    // Gladly's own Focus column timer, e.g. "14m 29s" / "1h 2m" / "0m 5s" (leaf text left of the name)
    let ftext = '';
    const DUR = /^(\d+\s*h)?\s*(\d+\s*m)?\s*(\d+\s*s)?$/i;
    const OTHER = '.agentStatusCard-row-duration, .agentStatusCard-row-reason, .agentStatusCard-row-current, .agentStatusCard-row-status, .pillList-pill';
    const nameLeft = nameEl.getBoundingClientRect().left;
    const durEl = row.querySelector('.agentStatusCard-row-duration');
    const durTxt = durEl ? durEl.innerText.trim() : '';
    for (const el of before) {
      if (el.children.length) continue;
      if (el.closest(OTHER)) continue;
      const t = (el.textContent || '').trim();
      if (!t || !/\d/.test(t) || !DUR.test(t) || t === durTxt) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.left >= nameLeft) continue; // must be visually left of the name
      ftext = t; break;
    }
    const tops = before.filter((el) => !before.includes(el.parentElement));
    const left = tops.map((el) => el.outerHTML).join('\n').slice(0, 700);
    return { cands, rf, left, ftext };
  }
  // Locate the "Focus" column on the liveboard (header text "Focus" .. header text "Agent").
  function findFocusColumn() {
    let fh = null, ah = null;
    document.querySelectorAll('body *').forEach((el) => {
      if (el.children.length) return;
      const t = (el.textContent || '').trim().toLowerCase();
      if (/^focus$/.test(t) && !fh && !el.closest('.liveboardTable-row')) fh = el;
      else if (t === 'agent' && !ah && !el.closest('.liveboardTable-row')) ah = el;
    });
    if (!fh) return null;
    const a = fh.getBoundingClientRect();
    if (!a.width) return null;
    const left = a.left - 10;
    let right = a.right + 60;
    if (ah) { const b = ah.getBoundingClientRect(); if (b.width && b.left > a.left) right = b.left - 4; }
    return { left, right };
  }
  const FOCUS_DUR = /^(\d+\s*h)?\s*(\d+\s*m)?\s*(\d+\s*s)?$/i;
  function focusTimerInColumn(row, col) {
    let found = '';
    row.querySelectorAll('*').forEach((el) => {
      if (found || el.children.length) return;
      const t = (el.textContent || '').trim();
      if (!t || !/\d/.test(t) || !FOCUS_DUR.test(t)) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const cx = r.left + r.width / 2;
      if (cx >= col.left && cx <= col.right) found = t;
    });
    return found;
  }
  function readAgentRows() {
    const agents = [];
    const focusCol = findFocusColumn();
    document.querySelectorAll('.liveboardTable-row').forEach((row) => {
      const name = row.querySelector('.agentStatusCard-row-name');
      if (!name) return;
      const reason = row.querySelector('.agentStatusCard-row-reason');
      const duration = row.querySelector('.agentStatusCard-row-duration');
      const availability = getAvailability(row);
      const fo = detectFocus(row, name, reason);
      agents.push({
        agent: name.innerText.trim(),
        status: reason ? reason.innerText.trim() : '',
        statusDurationText: duration ? duration.innerText.trim() : '',
        bubbleCount: (availability.email ? 1 : 0) + (availability.phone ? 1 : 0) + (availability.chat ? 1 : 0),
        availability,
        current: getCurrentActivities(row),
        focus: false,
        _fc: fo.cands,
        _rf: fo.rf,
        _ft: focusCol ? focusTimerInColumn(row, focusCol) : fo.ftext,
        _col: !!focusCol,
        leftHtml: agents.length < 2 ? fo.left : undefined,
      });
    });
    // decide focus: explicit "on" marker, or a marker that only SOME rows have
    const total = agents.length;
    const freq = {}, st = {};
    agents.forEach((a) => (a._fc || []).forEach((c) => { freq[c.t] = (freq[c.t] || 0) + 1; st[c.t] = c.state; }));
    agents.forEach((a) => {
      let on = !!a._ft || !!a._rf, hint = a._ft ? (a._col ? 'column' : 'timer left of name') : (a._rf ? 'status' : '');
      (a._fc || []).forEach((c) => {
        if (true) return; // marker guessing removed: it flagged everyone when nobody was in focus
        if (c.state === 'on') { on = true; hint = c.t; }
        else if (c.state === 'neutral' && total >= 3 && freq[c.t] < 0.6 * total) { on = true; hint = c.t; }
      });
      a.focus = on; a.focusHint = hint; a.focusDurationText = on ? (a._ft || '') : '';
      delete a._fc; delete a._rf; delete a._ft; delete a._col;
    });
    focusInfo = Object.keys(freq).map((t) => ({ t, state: st[t], n: freq[t], total }));
    focusInfo.unshift({ t: focusCol ? ('Focus column found x=' + Math.round(focusCol.left) + '..' + Math.round(focusCol.right)) : 'Focus column header NOT found (using text left of name)', state: 'info', n: agents.filter((a) => a.focus).length, total });
    return agents;
  }
  function pageText() {
    const el = document.querySelector('main') || document.body;
    return (el.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 6000);
  }

  // ---- email readers ----
  const CARD_SEL = '.customerConversationItemCard';
  const SEL = {
    name: '[data-aid="customerConversationCard-customerInfo-profile-name"] span',
    email: '.customerConversationCard-customerInfo-profile-email span',
    topic: '.customerConversationCard-conversationInfo-title-topics',
    slaTime: '.customerConversationCard-conversationInfo-sla time',
    status: '.customerConversationCard-conversationInfo-status',
    subject: '.customerConversationCard-conversationInfo-itemContent span',
    paginationFirst: '.rc-pagination-item-1',
    paginationNext: '.rc-pagination-next',
  };
  function absoluteUrl(h) { try { return new URL(h, location.origin).toString(); } catch (e) { return h || ''; } }
  function parseCard(el) {
    const g = (s) => el.querySelector(s);
    const slaEl = g(SEL.slaTime);
    const due = slaEl ? slaEl.getAttribute('datetime') : null;
    const linkEl = el.closest('a[href]');
    const link = linkEl ? absoluteUrl(linkEl.getAttribute('href')) : '';
    const t = (s) => { const n = g(s); return n ? n.textContent.trim() : ''; };
    const c = {
      name: t(SEL.name) || '(unknown)', email: t(SEL.email), topic: t(SEL.topic),
      subject: t(SEL.subject), status: t(SEL.status), due, link,
    };
    c.id = link || `${c.email}|${c.subject}`;
    return c;
  }
  const collectCards = () => Array.from(document.querySelectorAll(CARD_SEL)).map(parseCard).filter((c) => c.due);
  const cardSig = () => collectCards().map((c) => c.id).join('|');

  function firstIsActive() {
    const f = document.querySelector(SEL.paginationFirst);
    return !!f && (f.classList.contains('rc-pagination-item-active') || f.getAttribute('aria-current') === 'page');
  }
  function clickFirstPage() {
    const f = document.querySelector(SEL.paginationFirst);
    if (!f) return false;
    if (firstIsActive()) return true;
    (f.querySelector('button, a') || f).click();
    return true;
  }
  function clickNext() {
    const el = document.querySelector(SEL.paginationNext);
    if (!el) return false;
    if (el.getAttribute('aria-disabled') === 'true' || el.classList.contains('rc-pagination-disabled')) return false;
    (el.querySelector('button, a') || el).click();
    return true;
  }
  function waitForNewCards(beforeSig) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (cardSig() !== beforeSig) return resolve(true);
        if (Date.now() - start > PAGE_ADVANCE_TIMEOUT_MS) return resolve(false);
        setTimeout(tick, PAGE_ADVANCE_POLL_MS);
      };
      tick();
    });
  }
  async function fullEmailScan() {
    const all = new Map();
    let pages = 0;
    const before = cardSig();
    if (clickFirstPage() && !firstIsActive()) await waitForNewCards(before);
    while (pages < MAX_SCAN_PAGES) {
      pages += 1;
      collectCards().forEach((c) => all.set(c.id, c));
      const sig = cardSig();
      if (!clickNext()) break;
      const changed = await waitForNewCards(sig);
      if (!changed) break; // page never advanced — avoid looping forever
    }
    return { cards: Array.from(all.values()), pages };
  }

  async function runWorker(role) {
    if (role === 'agents' || role === 'airplane') {
      const publish = () => {
        const rows = readAgentRows();
        feedSet(role, { rows, finfo: focusInfo, dbg: rows.slice(0, 2).map((r) => r.leftHtml).filter(Boolean), text: (role === 'airplane' || !rows.length) ? pageText() : '', src: isTop ? 'tab' : 'frame' });
      };
      publish();
      setInterval(publish, WORKER_POLL_MS);
      return;
    }
    if (role === 'email' || role === 'emailopen') {
      if (!isTop) {
        // hidden frame: scan every page, repeatedly
        for (;;) {
          const waitStart = Date.now();
          while (!document.querySelector(CARD_SEL) && Date.now() - waitStart < 20000) await sleep(500);
          try {
            const res = await fullEmailScan();
            feedSet(role, { cards: res.cards, pages: res.pages, complete: true, src: 'frame' });
          } catch (e) { console.error('[GCC] email scan failed', e); }
          await sleep(EMAIL_RESCAN_MS);
        }
      } else {
        // visible tab fallback: only publish the current page, and only
        // if no recent full scan exists (never overwrite a good scan).
        setInterval(() => {
          const cur = feedGet(role);
          if (cur && cur.complete && Date.now() - cur.ts < 3 * EMAIL_RESCAN_MS) return;
          feedSet(role, { cards: collectCards(), pages: 1, complete: false, src: 'tab' });
        }, WORKER_POLL_MS);
      }
    }
  }

  const myRole = roleOfPath(location.pathname, location.search);
  if (myRole) runWorker(myRole);

  // Iframes are workers only — no UI, no nested frames.
  if (!isTop) return;

  /************************************************************
   * DASHBOARD (top frame only)
   ************************************************************/
  let framesEnabled = GM_getValue('framesEnabled', true);
  let theme = GM_getValue('gcc_theme', 'dark');
  const BC = (b) => (theme === 'light' ? b.lc : b.color);
  const BB = (b) => (theme === 'light' ? b.lbg : b.bg);

  // Several Gladly tabs may be open: only one ("leader") builds the hidden
  // frames and posts to the webhook, so nothing is read/sent twice.
  const TAB_ID = Math.random().toString(36).slice(2);
  function amLeader() {
    if (IS_VIEWER) return false;
    const l = GM_getValue('gcc_leader', null);
    const now = Date.now();
    if (!l || now - l.ts > 10000 || l.id === TAB_ID) {
      GM_setValue('gcc_leader', { id: TAB_ID, ts: now });
      return true;
    }
    return false;
  }
  let currentTab = GM_getValue('tab', 'all');
  let collapsed = GM_getValue('collapsed', false);
  const bucketSets = { email: new Set(['OVERDUE', 'Due < 1h']), emailopen: new Set(['OVERDUE', 'Due < 1h']) };
  let notifyEnabled = GM_getValue('notifyEnabled', false);
  let notifiedIds = new Set(JSON.parse(GM_getValue('notifiedIds', '[]')));

  const feeds = { email: feedGet('email'), emailopen: feedGet('emailopen'), agents: feedGet('agents'), airplane: feedGet('airplane') };
  ROLES.forEach((r) => {
    if (typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener(feedKey(r), (n, o, val) => {
        try { feeds[r] = JSON.parse(val); } catch (e) { return; }
        if (r === 'agents') refreshAlerts();
        scheduleRender();
      });
    }
  });

  /* ---------- hidden frames ---------- */
  let framesHost = null;
  function buildFrames() {
    if (IS_VIEWER) return;
    if (framesHost) framesHost.remove();
    framesHost = null;
    if (!framesEnabled || !amLeader()) return;
    framesHost = document.createElement('div');
    framesHost.id = 'gcc-frames';
    // NOT display:none / visibility:hidden — hidden frames get zero layout
    // and Gladly's virtualized lists would render nothing. Park it off-screen.
    framesHost.style.cssText = 'position:fixed;left:-20000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;';
    ROLES.forEach((r) => {
      const f = document.createElement('iframe');
      f.dataset.role = r;
      f.src = location.origin + VIEWS[r].path;
      f.style.cssText = `position:absolute;left:0;top:0;width:${VIEWS[r].frame.w}px;height:${VIEWS[r].frame.h}px;border:0;`;
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      framesHost.appendChild(f);
    });
    document.body.appendChild(framesHost);
  }

  /* ---------- webhook ---------- */
  // Requests go through a small queue so the ~100 per-agent snapshots sent every few
  // seconds don't all hit Google at once.
  const HOOK_MAX_CONCURRENT = 4;
  const HOOK_MAX_QUEUE = 300;
  const hookQueue = [];
  let hookActive = 0;
  function hookPump() {
    while (hookActive < HOOK_MAX_CONCURRENT && hookQueue.length) {
      const payload = hookQueue.shift();
      hookActive++;
      const done = () => { hookActive--; hookPump(); };
      try {
        GM_xmlhttpRequest({
          method: 'POST', url: WEBHOOK_URL,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          data: JSON.stringify(payload),
          onload: done,
          onerror: (e) => { console.error('[GCC] webhook failed', e); done(); },
          ontimeout: done, onabort: done,
        });
      } catch (e) { console.error('[GCC] webhook failed', e); done(); }
    }
  }
  function sendWebhook(payload) {
    if (!WEBHOOK_URL || !amLeader()) return; // only one Gladly tab reports
    hookQueue.push(payload);
    while (hookQueue.length > HOOK_MAX_QUEUE) hookQueue.shift(); // drop oldest if Google can't keep up
    hookPump();
  }

  /* ---------- liveboard alert engine (ported from v2.8.5) ---------- */
  const FOCUS_ALERT_MIN = 10; // flag + webhook once an agent has been in focus mode this long
  const PANEL_TYPES = {
    focus:      { title: '🎯 Focus Mode',    accent: '#06b6d4' },
    nobubble:   { title: '🫧 No Bubbles',    accent: '#f97316' },
    underchats: { title: '📉 Under 3 Chats', accent: '#a855f7' },
    longchat:   { title: '💬 Long Chats',    accent: '#3b82f6' },
  };
  const activeAlerts = new Map();
  const agentHistory = new Map();
  const bubbleTimers = new Map();
  let lastAgentsTs = 0;

  const isMonitored = (n) => MONITORED_AGENTS.has(n);
  function setAlert(agent, type, detail) {
    const key = agent + '::' + type;
    if (!activeAlerts.has(key)) activeAlerts.set(key, { agent, type, detail, since: Date.now() });
    else activeAlerts.get(key).detail = detail;
  }
  const clearAlert = (agent, type) => activeAlerts.delete(agent + '::' + type);

  // Gladly tab (leader) evaluates alerts and publishes a snapshot; the side panel just displays it.
  let lastAlertSnap = '';
  function publishAlerts() {
    if (IS_VIEWER || !amLeader()) return;
    const snap = JSON.stringify(Array.from(activeAlerts.values()));
    if (snap !== lastAlertSnap) { lastAlertSnap = snap; GM_setValue('gcc_alerts', snap); }
  }
  function refreshAlerts() {
    if (amLeader()) { processAgents(); publishAlerts(); }
    else { loadAlerts(); } // another Gladly tab is the leader: mirror its alerts
  }
  function loadAlerts() {
    let arr = [];
    try { arr = JSON.parse(GM_getValue('gcc_alerts', '[]')) || []; } catch (e) { /* ignore */ }
    activeAlerts.clear();
    arr.forEach((a) => activeAlerts.set(a.agent + '::' + a.type, a));
  }
  GM_addValueChangeListener('gcc_alerts', (k, o, n, remote) => { if (remote) { loadAlerts(); scheduleRender(); } });

  function evaluate(agent) {
    if (!agentHistory.has(agent.agent)) agentHistory.set(agent.agent, { statusHistory: [], alerts: {} });
    const data = agentHistory.get(agent.agent);
    const now = Date.now();
    const canAlert = (r) => !data.alerts[r] || now - data.alerts[r] > REPEAT_ALERT_COOLDOWN_MS;
    const mark = (r) => { data.alerts[r] = now; };
    const alertHook = (reason) => {
      if (!SEND_ALERTS) return;
      sendWebhook({
        type: 'alert', agent: agent.agent, alertReason: reason, status: agent.status,
        current: agent.current, timestamp: new Date().toISOString(),
      });
    };

    // No bubbles
    if (agent.status === 'Work') {
      if (agent.bubbleCount === 0) {
        if (!bubbleTimers.has(agent.agent)) bubbleTimers.set(agent.agent, now);
        const started = bubbleTimers.get(agent.agent);
        if (now - started >= 10000) {
          if (isMonitored(agent.agent)) setAlert(agent.agent, 'nobubble', 'Offline ' + fmtSince(started));
          if (canAlert('nobubble')) mark('nobubble');
        }
      } else { bubbleTimers.delete(agent.agent); clearAlert(agent.agent, 'nobubble'); }
    } else { bubbleTimers.delete(agent.agent); clearAlert(agent.agent, 'nobubble'); }

    // Status toggling
    const last = data.statusHistory[data.statusHistory.length - 1];
    if (!last || last.status !== agent.status) data.statusHistory.push({ status: agent.status, time: now });
    data.statusHistory = data.statusHistory.filter((x) => now - x.time < TOGGLE_WINDOW_MS);
    if (data.statusHistory.length >= TOGGLE_COUNT_THRESHOLD && canAlert('toggle')) {
      alertHook('Status Toggling'); mark('toggle');
    }

    // Under-3 chats
    const chats = agent.current.filter((x) => x.channel === 'chat');
    if (chats.length > 0 && chats.length < CHAT_ALERT_THRESHOLD) {
      if (isMonitored(agent.agent)) {
        setAlert(agent.agent, 'underchats', chats.length + ' active chat' + (chats.length === 1 ? '' : 's'));
      }
      if (canAlert('underchats')) { alertHook(chats.length + ' Chats'); mark('underchats'); }
    } else clearAlert(agent.agent, 'underchats');

    // Long chats
    chats.forEach((chat) => {
      if (chat.minutes >= CHAT_TOO_LONG_MIN) {
        if (isMonitored(agent.agent)) setAlert(agent.agent, 'longchat', chat.durationText);
        if (canAlert('longchat')) { alertHook('Long Chat'); mark('longchat'); }
      }
    });
    if (!chats.some((x) => x.minutes >= CHAT_TOO_LONG_MIN)) clearAlert(agent.agent, 'longchat');

    // Focus mode timer (start times are kept in updateFocusMap)
    const fstart = (GM_getValue('gcc_focus', {}) || {})[agent.agent];
    if ((agent.focus || (fstart && focusMiss.has(agent.agent))) && fstart) {
      const fmins = (now - fstart) / 60000;
      if (isMonitored(agent.agent)) {
        setAlert(agent.agent, 'focus', 'Since ' + new Date(fstart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + (fmins >= FOCUS_ALERT_MIN ? ' ⚠' : ''));
        const fa = activeAlerts.get(agent.agent + '::focus');
        if (fa) fa.since = fstart;
      }
      if (fmins >= FOCUS_ALERT_MIN && data.alerts.focusLong !== fstart) {
        alertHook('Focus Mode ' + Math.floor(fmins) + 'm');
        data.alerts.focusLong = fstart;
      }
    } else clearAlert(agent.agent, 'focus');

    if (SEND_SNAPSHOTS) {
      sendWebhook({
        type: 'snapshot', agent: agent.agent, status: agent.status,
        focus: !!agent.focus, focusSince: fstart ? new Date(fstart).toISOString() : '',
        statusDurationText: agent.statusDurationText || '', bubbleCount: agent.bubbleCount,
        availability: agent.availability, current: agent.current, timestamp: new Date().toISOString(),
      });
    }
  }

  // agent -> timestamp when the agent entered focus mode (kept across reloads).
  // Start time is taken from the timer in Gladly's Focus column (so a refresh or a late
  // start of the board shows the real time, not 0s), and one read that misses the focus
  // marker (typical while the hidden frame is still rendering) no longer wipes the timer.
  const FOCUS_CLEAR_GRACE_MS = 30000; // agent must be seen NOT in focus this long before we reset
  const focusMiss = new Map();        // agent -> first time we saw them out of focus
  function updateFocusMap(rows) {
    const prev = GM_getValue('gcc_focus', {}) || {};
    const next = Object.assign({}, prev);
    const now = Date.now();
    rows.forEach((r) => {
      if (r.focus) {
        focusMiss.delete(r.agent);
        // Gladly's Focus column is the truth; without it we can only count from now (never the Status column)
        const dur = r.focusDurationText ? parseMinutes(r.focusDurationText) * 60000 : 0;
        const seeded = dur > 0 ? now - dur : now;
        if (!next[r.agent]) next[r.agent] = seeded;
        else if (dur > 0 && Math.abs(seeded - next[r.agent]) > 15000) next[r.agent] = seeded; // re-sync to Gladly
      } else if (next[r.agent]) {
        if (!focusMiss.has(r.agent)) focusMiss.set(r.agent, now);
        if (now - focusMiss.get(r.agent) >= FOCUS_CLEAR_GRACE_MS) { delete next[r.agent]; focusMiss.delete(r.agent); }
      }
    });
    Object.keys(next).forEach((k) => { if (now - next[k] > 12 * 3600000) delete next[k]; });
    if (JSON.stringify(next) !== JSON.stringify(prev)) GM_setValue('gcc_focus', next);
  }

  function processAgents() {
    const f = feeds.agents;
    if (!f || !f.rows || f.ts === lastAgentsTs) return;
    if (Date.now() - f.ts > VIEWS.agents.staleMs) return; // never alert on stale data
    lastAgentsTs = f.ts;
    updateFocusMap(f.rows);
    f.rows.forEach(evaluate);
  }

  /* ---------- notifications for SLA ---------- */
  function maybeNotify(cards, role) {
    if (IS_VIEWER || !notifyEnabled || !amLeader()) return;
    const now = Date.now();
    let changed = false;
    const nk = (c) => (role === 'emailopen' ? 'open|' : '') + c.id;
    cards.forEach((c) => {
      const ms = new Date(c.due).getTime() - now;
      if (ms / 60000 <= NOTIFY_THRESHOLD_MIN && !notifiedIds.has(nk(c))) {
        try {
          GM_notification({
            title: role === 'emailopen' ? 'Gladly SLA warning (Open)' : 'Gladly SLA warning',
            text: `${c.name || c.email}: "${c.subject}" due in ${fmtRemaining(ms)}`,
            timeout: 0,
          });
        } catch (e) { console.error('[GCC] notify failed', e); }
        notifiedIds.add(nk(c)); changed = true;
      }
    });
    if (changed) GM_setValue('notifiedIds', JSON.stringify(Array.from(notifiedIds)));
  }

  /* ---------- CSV ---------- */
  function downloadCsv(cards, role) {
    const now = Date.now();
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Name', 'Email', 'Subject', 'Topic', 'Status', 'Due (local)', 'Minutes remaining', 'Link'];
    const sorted = [...cards].sort((a, b) => new Date(a.due) - new Date(b.due));
    const lines = [head.map(q).join(',')].concat(sorted.map((c) => [
      c.name, c.email, c.subject, c.topic, c.status, new Date(c.due).toLocaleString(),
      Math.round((new Date(c.due).getTime() - now) / 60000), c.link || '',
    ].map(q).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `gladly-sla-${role === 'emailopen' ? 'open-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  /************************************************************
   * UI
   ************************************************************/
  function injectStyle() {
    const s = document.createElement('style');
    s.textContent = `
      #gcc-panel{--bg:#0b0f19;--card:#111827;--line:#1f2937;--txt:#e5e7eb;--mut:#94a3b8;--w015:rgba(255,255,255,.015);--w02:rgba(255,255,255,.02);--w025:rgba(255,255,255,.025);--w03:rgba(255,255,255,.03);--w05:rgba(255,255,255,.05);--w06:rgba(255,255,255,.06);--w07:rgba(255,255,255,.07);--w08:rgba(255,255,255,.08);--w1:rgba(255,255,255,.1);--w15:rgba(255,255,255,.15);--w0:rgba(255,255,255,0);--name:#f1f5f9;--pre:#cbd5e1;--prebg:rgba(0,0,0,.25);--grip:#475569;--empty:#64748b;--stick:#141c2e;--headA:#131b2e;--headB:#0d1220;--scroll:#334155;--link:#93c5fd;--okc:#4ade80;--badc:#f87171;--warntx:#fcd34d;--shadowc:rgba(0,0,0,.6); position:fixed;bottom:16px;right:16px;width:520px;max-height:90vh;display:flex;flex-direction:column; background:var(--bg);color:var(--txt);border:1px solid var(--line);border-radius:18px; box-shadow:0 24px 70px var(--shadowc),0 0 0 1px var(--w03); font:13px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; z-index:1000000;overflow:hidden;-webkit-font-smoothing:antialiased}
      #gcc-panel *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--scroll) transparent}
      #gcc-panel.gcc-wide{width:800px}
      #gcc-panel .gcc-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(180deg,var(--headA),var(--headB));border-top:1px solid var(--line);user-select:none;order:3}
      #gcc-panel .gcc-grip{cursor:move;color:var(--grip);padding:0 2px}
      #gcc-panel .gcc-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;letter-spacing:.2px;white-space:nowrap}
      #gcc-panel:not(.gcc-full) .gcc-brand .t{display:none}
      #gcc-panel .gcc-live{width:9px;height:9px;border-radius:50%;background:var(--empty);flex:none}
      #gcc-panel .gcc-live.on{background:#22c55e;animation:gccpulse 2s infinite}
      #gcc-panel .gcc-tabs{display:flex;gap:2px;padding:3px;background:var(--w05);border-radius:12px;margin-right:auto}
      #gcc-panel button{border:none;cursor:pointer;color:var(--txt);background:var(--w08);border-radius:10px;font-size:12px;font-weight:600;padding:6px 11px;transition:background .15s,transform .1s}
      #gcc-panel button:hover{background:var(--w15)}
      #gcc-panel button:active{transform:scale(.97)}
      #gcc-panel .gcc-tab{background:transparent;color:var(--mut);border-radius:9px}
      #gcc-panel .gcc-tab:hover{color:#fff;background:var(--w07)}
      #gcc-panel .gcc-tab.on{background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.45)}
      #gcc-panel .gcc-ico{width:30px;height:30px;padding:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:13px}
      #gcc-panel .gcc-body{order:1;overflow-y:auto;flex:1;min-height:0;padding:12px;display:flex;flex-direction:column;gap:12px}
      #gcc-panel.gcc-collapsed .gcc-body,#gcc-panel.gcc-collapsed .gcc-foot{display:none}
      #gcc-panel .gcc-sec{flex:none;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
      #gcc-panel .gcc-sec-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 14px;font-weight:800;font-size:13px; background:linear-gradient(180deg,var(--w05),var(--w0));border-bottom:1px solid var(--line)}
      #gcc-panel .gcc-sub{font-weight:600;font-size:11px;color:var(--mut);background:var(--w06);padding:3px 10px;border-radius:999px;white-space:nowrap}
      #gcc-panel .gcc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:12px 14px}
      #gcc-panel .gcc-chip{padding:5px 12px;border-radius:999px;font-weight:700;font-size:11.5px;cursor:pointer;border:1px solid var(--w08);user-select:none;transition:transform .1s,box-shadow .15s}
      #gcc-panel .gcc-chip:hover{transform:translateY(-1px)}
      #gcc-panel .gcc-chip.on{border-color:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 22%,transparent)}
      #gcc-panel table{width:100%;border-collapse:collapse}
      #gcc-panel td,#gcc-panel th{padding:9px 14px;border-bottom:1px solid var(--w06);vertical-align:top;text-align:left}
      #gcc-panel tr:last-child td{border-bottom:none}
      #gcc-panel tbody tr:hover td{background:var(--w03)}
      #gcc-panel td:first-child{box-shadow:inset 3px 0 0 var(--c,transparent)}
      #gcc-panel th{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);background:var(--w03)}
      #gcc-panel a.gcc-name,#gcc-panel .gcc-name{font-weight:700;color:var(--name);text-decoration:none}
      #gcc-panel a.gcc-name:hover{text-decoration:underline;color:var(--link)}
      #gcc-panel .gcc-subj{color:var(--mut);margin-top:1px}
      #gcc-panel .gcc-r{text-align:right;white-space:nowrap;font-weight:800;font-variant-numeric:tabular-nums}
      #gcc-panel .gcc-empty{padding:16px;text-align:center;color:var(--empty)}
      #gcc-panel .gcc-warn{margin:12px 14px;padding:10px 12px;border-radius:10px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:var(--warntx);font-size:12px}
      #gcc-panel .gcc-warn a{color:var(--warntx)}
      #gcc-panel .gcc-acc{display:flex;align-items:center;gap:8px;padding:9px 14px;font-weight:800;font-size:12px;border-top:1px solid var(--line);background:var(--w025)}
      #gcc-panel .gcc-acc::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--a);box-shadow:0 0 10px var(--a)}
      #gcc-panel .gcc-pre{white-space:pre-wrap;font:11px/1.45 ui-monospace,Consolas,monospace;padding:10px 14px;max-height:220px;overflow:auto;background:var(--prebg);color:var(--pre)}
      #gcc-panel .gcc-foot{order:2;display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;background:var(--headB);border-top:1px solid var(--line);font-size:11px}
      #gcc-panel .gcc-foot span{padding:3px 10px;border-radius:999px;background:var(--w05);font-weight:600}
      #gcc-panel .ok{color:var(--okc)}
      #gcc-panel .bad{color:var(--badc)}
      #gcc-panel .gcc-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--grip);margin-right:3px}
      #gcc-panel .gcc-dot.on{background:#22c55e}
      #gcc-panel .gcc-export{background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff}
      #gcc-panel .gcc-exp{padding:12px 14px;border-top:1px solid var(--line)}
      #gcc-panel .gcc-air{container-type:inline-size;padding:12px;display:flex;flex-direction:column;gap:10px}
      #gcc-panel .gcc-air-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      #gcc-panel .gcc-air-top .t{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:14px;border:1px solid var(--w07);border-left:4px solid var(--k); background:linear-gradient(135deg,var(--w07),var(--w02))}
      #gcc-panel .t-online{--k:#22c55e}
      #gcc-panel .t-working{--k:#3b82f6}
      #gcc-panel .t-away{--k:#f59e0b}
      #gcc-panel .gcc-air-top .n{font-weight:800;font-size:clamp(22px,6.2cqw,54px);line-height:1;letter-spacing:-.02em}
      #gcc-panel .gcc-air-top .l{font-size:clamp(10px,2.1cqw,18px);color:var(--mut);font-weight:600}
      #gcc-panel .gcc-air-row{display:grid;grid-template-columns:clamp(34px,8cqw,64px) repeat(4,minmax(0,1fr));align-items:center;gap:1.6cqw;padding:2.4cqw 2.6cqw;border-radius:16px; border:1px solid var(--w07);background:linear-gradient(135deg,var(--w06),var(--w015))}
      #gcc-panel .gcc-air-ico{width:clamp(34px,8cqw,64px);height:clamp(34px,8cqw,64px);display:grid;place-items:center;border-radius:50%;background:var(--w08);font-size:clamp(16px,4cqw,32px);line-height:1}
      #gcc-panel .gcc-air-m{text-align:right;min-width:0}
      #gcc-panel .gcc-air-v{font-weight:800;line-height:1.05;font-size:clamp(18px,5.2cqw,68px);letter-spacing:-.02em;white-space:nowrap;font-variant-numeric:tabular-nums}
      #gcc-panel .gcc-air-l{font-size:clamp(9px,1.9cqw,19px);color:var(--mut);line-height:1.2;margin-top:.6cqw;font-weight:600}
      #gcc-panel .gcc-air-bar{height:4px;border-radius:99px;background:var(--w1);margin-top:.9cqw;overflow:hidden}
      #gcc-panel .gcc-air-bar i{display:block;height:100%;border-radius:99px}
      #gcc-panel.gcc-full{top:0!important;left:0!important;right:0!important;bottom:0!important;width:auto!important;max-height:none!important;border-radius:0;border:none;z-index:2147483647;font-size:14px}
      #gcc-panel.gcc-full.gcc-collapsed{top:auto!important;bottom:0!important}
      #gcc-panel.gcc-full.gcc-collapsed .gcc-body{display:none!important}
      #gcc-panel.gcc-full .gcc-grip{display:none}
      #gcc-panel.gcc-full .gcc-body{padding:14px;gap:14px}
      #gcc-panel.gcc-full .gcc-pre{max-height:none}
      #gcc-panel.gcc-full[data-tab="all"] .gcc-body{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr);overflow:hidden}
      #gcc-panel.gcc-full[data-tab="all"] .gcc-sec{overflow-y:auto;min-height:0}
      #gcc-panel.gcc-full[data-tab="all"] .gcc-sec-h{position:sticky;top:0;z-index:2;background:var(--stick)}
      #gcc-panel.gcc-full:not([data-tab="all"]) .gcc-body>.gcc-sec{width:100%;max-width:1200px;margin:0 auto}
      #gcc-panel .gcc-upd{padding:8px 14px;text-align:right;font-size:11px;color:var(--mut);border-top:1px solid var(--line);background:var(--w025)}
      #gcc-panel.gcc-viewer{font-size:13px}
      #gcc-panel.gcc-viewer .gcc-head{order:0;border-top:none;border-bottom:1px solid var(--line);flex-wrap:wrap}
      #gcc-panel.gcc-viewer .gcc-brand .t,#gcc-panel.gcc-viewer .gcc-grip,#gcc-panel.gcc-viewer #gcc-wide,#gcc-panel.gcc-viewer #gcc-full,#gcc-panel.gcc-viewer #gcc-collapse{display:none!important}
      #gcc-panel.gcc-viewer .gcc-body{padding:8px;gap:10px}
      #gcc-panel.gcc-viewer[data-tab="all"] .gcc-body{display:flex;flex-direction:column;overflow-y:auto}
      #gcc-panel.gcc-viewer[data-tab="all"] .gcc-sec{overflow:visible;min-height:auto}
      #gcc-panel.gcc-viewer[data-tab="all"] .gcc-sec-h{position:static}
      #gcc-panel.gcc-viewer:not([data-tab="all"]) .gcc-body>.gcc-sec{max-width:none}
      #gcc-panel.gcc-dock{top:0;right:0;bottom:0;left:auto;width:560px;max-width:100vw;max-height:none;border-radius:0;border-width:0 0 0 1px;z-index:2147483000}
      #gcc-panel.gcc-dock[data-size="wide"]{width:min(980px,100vw)}
      #gcc-panel.gcc-dock[data-size="full"]{width:100vw;font-size:14px}
      #gcc-panel.gcc-dock.gcc-hidden{display:none}
      #gcc-panel.gcc-viewer.gcc-dock #gcc-wide,#gcc-panel.gcc-viewer.gcc-dock #gcc-collapse{display:inline-flex!important}
      #gcc-panel.gcc-dock[data-size="full"][data-tab="all"] .gcc-body{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr);overflow:hidden}
      #gcc-panel.gcc-dock[data-size="full"][data-tab="all"] .gcc-sec{overflow-y:auto;min-height:0}
      #gcc-panel.gcc-dock[data-size="full"][data-tab="all"] .gcc-sec-h{position:sticky}
      #gcc-launch{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483001;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;background:#0b0f19;color:#e5e7eb;border:1px solid #1f2937;border-right:none;border-radius:10px 0 0 10px;cursor:pointer;font:800 11px/1 ui-sans-serif,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);user-select:none}
      #gcc-launch:hover{background:#111827}
      #gcc-launch.gcc-launch-open{display:none}
      #gcc-launch .gcc-live{width:9px;height:9px;border-radius:50%;background:#64748b;flex:none}
      #gcc-launch .gcc-live.on{background:#22c55e}
      @keyframes gccpulse{70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
      #gcc-panel .gcc-live.on{box-shadow:0 0 0 0 rgba(34,197,94,.6)}
      #gcc-panel.gcc-light{--w015:rgba(15,23,42,.015);--w02:rgba(15,23,42,.02);--w025:rgba(15,23,42,.025);--w03:rgba(15,23,42,.03);--w05:rgba(15,23,42,.05);--w06:rgba(15,23,42,.06);--w07:rgba(15,23,42,.07);--w08:rgba(15,23,42,.08);--w1:rgba(15,23,42,.1);--w15:rgba(15,23,42,.15);--w0:rgba(15,23,42,0);--bg:#eef2f7;--card:#ffffff;--line:#e2e8f0;--txt:#0f172a;--mut:#64748b;--name:#0f172a;--pre:#334155;--prebg:rgba(15,23,42,.05);--grip:#94a3b8;--empty:#94a3b8;--stick:#f8fafc;--headA:#ffffff;--headB:#f8fafc;--scroll:#cbd5e1;--link:#2563eb;--okc:#15803d;--badc:#dc2626;--warntx:#92400e;--shadowc:rgba(15,23,42,.16);}
      #gcc-panel .gcc-dbg summary{padding:8px 14px;color:var(--mut);font-size:11px;cursor:pointer;border-top:1px solid var(--line)}
      #gcc-panel .gcc-tab.on{color:#fff}
    `;
    document.head.appendChild(s);
  }

  let panel = null, launcher = null;
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'gcc-panel';
    if (collapsed) panel.classList.add('gcc-collapsed');
    if (theme === 'light') panel.classList.add('gcc-light');
    panel.classList.add('gcc-viewer', 'gcc-dock');
    panel.classList.remove('gcc-collapsed');
    panel.dataset.size = GM_getValue('gcc_size', 'narrow');
    if (!GM_getValue('gcc_open', false)) panel.classList.add('gcc-hidden');
    panel.innerHTML = `
      <div class="gcc-head">
        <span class="gcc-grip" id="gcc-grip" title="Drag to move">⠿</span>
        <div class="gcc-brand"><span class="gcc-live" id="gcc-live"></span><span class="t">Command Center</span></div>
        <div class="gcc-tabs" id="gcc-tabs"></div>
        <button class="gcc-ico" id="gcc-notify" title="SLA notifications">${notifyEnabled ? '🔔' : '🔕'}</button>
        <button class="gcc-ico" id="gcc-wide" title="Narrow / wide / full width">↔</button>
        <button class="gcc-ico" id="gcc-reload" title="Reload background frames">🔄</button>
        <button class="gcc-ico" id="gcc-frames-toggle" title="Background frames on/off">${framesEnabled ? '⏸' : '▶'}</button>
        <button class="gcc-ico" id="gcc-theme" title="Light / dark mode">${theme === 'light' ? '🌙' : '☀️'}</button>
        <button class="gcc-ico" id="gcc-collapse" title="Hide panel">✕</button>
      </div>
      <div class="gcc-body" id="gcc-body"></div>
      <div class="gcc-foot" id="gcc-foot"></div>`;
    document.body.appendChild(panel);

    // launcher tab (always visible on the right edge)
    launcher = document.createElement('div');
    launcher.id = 'gcc-launch';
    launcher.title = 'Open / close Command Center';
    launcher.innerHTML = '<span class="gcc-live" id="gcc-live2"></span><span>CC</span>';
    document.body.appendChild(launcher);
    const setOpen = (open) => {
      GM_setValue('gcc_open', open);
      panel.classList.toggle('gcc-hidden', !open);
      launcher.classList.toggle('gcc-launch-open', open);
      if (open) render();
    };
    launcher.classList.toggle('gcc-launch-open', !panel.classList.contains('gcc-hidden'));
    launcher.addEventListener('click', () => setOpen(panel.classList.contains('gcc-hidden')));
    panel.querySelector('#gcc-collapse').addEventListener('click', () => setOpen(false));
    GM_addValueChangeListener('gcc_open', (k, o, n, remote) => { if (remote) { panel.classList.toggle('gcc-hidden', !n); launcher.classList.toggle('gcc-launch-open', !!n); } });
    panel.querySelector('#gcc-theme').addEventListener('click', (e) => {
      theme = theme === 'light' ? 'dark' : 'light';
      GM_setValue('gcc_theme', theme);
      panel.classList.toggle('gcc-light', theme === 'light');
      e.currentTarget.textContent = theme === 'light' ? '🌙' : '☀️';
      render();
    });
    panel.querySelector('#gcc-wide').addEventListener('click', () => {
      const order = ['narrow', 'wide', 'full'];
      const next = order[(order.indexOf(panel.dataset.size) + 1) % order.length];
      panel.dataset.size = next; GM_setValue('gcc_size', next);
    });
    panel.querySelector('#gcc-reload').addEventListener('click', () => { if (IS_VIEWER) GM_setValue('gcc_reload', Date.now()); else buildFrames(); });
    panel.querySelector('#gcc-frames-toggle').addEventListener('click', () => {
      framesEnabled = !framesEnabled; GM_setValue('framesEnabled', framesEnabled);
      panel.querySelector('#gcc-frames-toggle').textContent = framesEnabled ? '⏸' : '▶';
      buildFrames();
    });
    panel.querySelector('#gcc-notify').addEventListener('click', (e) => {
      notifyEnabled = !notifyEnabled; GM_setValue('notifyEnabled', notifyEnabled);
      e.currentTarget.textContent = notifyEnabled ? '🔔' : '🔕';
    });

    // delegated clicks inside the body
    panel.querySelector('#gcc-body').addEventListener('click', (e) => {
      const chip = e.target.closest('.gcc-chip');
      if (chip && chip.dataset.role && bucketSets[chip.dataset.role]) {
        const l = chip.dataset.label, set = bucketSets[chip.dataset.role];
        if (set.has(l)) set.delete(l); else set.add(l);
        render(); return;
      }
      const ex = e.target.closest('.gcc-export');
      if (ex) {
        const f = feeds[ex.dataset.role]; if (f && f.cards) downloadCsv(f.cards, ex.dataset.role);
      }
      const go = e.target.closest('[data-goto]');
      if (go) {
        e.preventDefault();
        window.open(location.origin + VIEWS[go.dataset.goto].path, '_blank');
      }
    });
  }

  function renderTabs() {
    const tabs = [['all', '⊞ All']].concat(ROLES.map((r) => [r, VIEWS[r].icon + ' ' + VIEWS[r].label]));
    const el = panel.querySelector('#gcc-tabs');
    el.innerHTML = tabs.map(([k, label]) => `<button class="gcc-tab${currentTab === k ? ' on' : ''}" data-tab="${k}">${label}</button>`).join('');
    el.querySelectorAll('.gcc-tab').forEach((b) => b.addEventListener('click', () => {
      currentTab = b.dataset.tab; GM_setValue('tab', currentTab);
      render();
    }));
  }

  function feedStatus(role) {
    const f = feeds[role];
    if (!f) return { state: 'none', text: 'no data yet' };
    const age = Date.now() - f.ts;
    return { state: age > VIEWS[role].staleMs ? 'stale' : 'live', text: fmtSince(f.ts) + ' ago' };
  }
  function noDataWarn(role) {
    const st = feedStatus(role);
    if (st.state === 'live') return '';
    const why = IS_VIEWER
      ? 'Keep a Gladly tab open in Chrome (any page) — it reads the data and feeds this panel.'
      : framesEnabled
      ? `Waiting for the hidden ${VIEWS[role].label} frame. If this persists Gladly may be blocking framing — open <a href="#" data-goto="${role}">this view in another tab</a> and keep it open (the script publishes from there).`
      : 'Background frames are paused (▶ in the header). Open the view in a tab or resume frames.';
    return `<div class="gcc-warn">${st.state === 'none' ? 'No data yet. ' : 'Data is stale (' + st.text + '). '}${why}</div>`;
  }

  /* ---- sections ---- */
  function sectionEmail(role) {
    role = role || 'email';
    const emailBuckets = bucketSets[role];
    const f = feeds[role];
    const cards = (f && f.cards) || [];
    const now = Date.now();
    const counts = BUCKETS.map((b) => ({ ...b, count: 0 }));
    cards.forEach((c) => { counts.find((x) => x.label === bucketFor(new Date(c.due) - now).label).count += 1; });
    const sel = cards
      .filter((c) => emailBuckets.size === 0 || emailBuckets.has(bucketFor(new Date(c.due) - now).label))
      .sort((a, b) => new Date(a.due) - new Date(b.due));
    const rows = sel.map((c) => {
      const ms = new Date(c.due) - now, b = bucketFor(ms);
      const nm = c.link ? `<a class="gcc-name" href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : `<span class="gcc-name">${esc(c.name)}</span>`;
      return `<tr style="--c:${BC(b)}"><td>${nm}<div class="gcc-subj">${esc(c.subject)}</div></td><td class="gcc-r" style="color:${BC(b)}">${fmtRemaining(ms)}</td></tr>`;
    }).join('');
    const scanInfo = f ? `${cards.length} emails · ${f.pages} page${f.pages === 1 ? '' : 's'}${f.complete ? '' : ' (current page only)'}` : '';
    return `
      <div class="gcc-sec">
        <div class="gcc-sec-h"><span>${role === 'emailopen' ? '📬 Open Email SLA' : '📧 Email SLA'} (${SLA_HOURS}h)</span><span class="gcc-sub">${esc(scanInfo)}</span></div>
        ${noDataWarn(role)}
        <div class="gcc-chips">${counts.map((b) => `<span class="gcc-chip${emailBuckets.has(b.label) ? ' on' : ''}" data-role="${role}" data-label="${esc(b.label)}" style="background:${BB(b)};color:${BC(b)}">${b.label}: ${b.count}</span>`).join('')}</div>
        ${sel.length ? `<table><tbody>${rows}</tbody></table>` : `<div class="gcc-empty">${cards.length ? 'No emails in the selected filter.' : 'No emails.'}</div>`}
        ${cards.length ? `<div class="gcc-exp"><button class="gcc-export" data-role="${role}">⬇ Export CSV</button></div>` : ''}
      </div>`;
  }

  function sectionAgents() {
    const f = feeds.agents;
    const n = f && f.rows ? f.rows.length : 0;
    const blocks = Object.keys(PANEL_TYPES).map((type) => {
      const rows = Array.from(activeAlerts.values()).filter((r) => r.type === type).sort((a, b) => a.since - b.since);
      const cfg = PANEL_TYPES[type];
      return `<div class="gcc-acc" style="--a:${cfg.accent}">${cfg.title} (${rows.length})</div>
        ${rows.length
          ? `<table><tbody>${rows.map((r) => {
              const hot = type === 'focus' && Date.now() - r.since >= FOCUS_ALERT_MIN * 60000;
              return `<tr><td>${esc(r.agent)}</td><td>${esc(r.detail)}</td><td class="gcc-r"${hot ? ' style="color:var(--badc)"' : ''}>${fmtSince(r.since)}</td></tr>`;
            }).join('')}</tbody></table>`
          : `<div class="gcc-empty">No active alerts</div>`}`;
    }).join('');
    return `
      <div class="gcc-sec">
        <div class="gcc-sec-h"><span>🚨 Agent Liveboard</span><span class="gcc-sub">${n} agents · ${f && f.rows ? f.rows.filter((r) => r.focus).length : 0} in focus</span></div>
        ${noDataWarn('agents')}
        ${blocks}
        ${n && f.dbg && f.dbg.length ? `<details class="gcc-dbg"><summary>Focus detection info</summary><div class="gcc-pre">Focus-like markers left of the name (state, agents with it):\n${esc((f.finfo || []).map((x) => ' • ' + x.t + '  [' + x.state + ', ' + x.n + '/' + x.total + ']').join('\n') || ' (none found)')}\n\nMarkup left of the first agents (send this if focus is wrong):\n\n${esc(f.dbg.join('\n\n'))}</div></details>` : ''}
      </div>`;
  }

  /* ---- Airplane Mode (floorboard): parsed from the page's text ---- */
  function parseFloorboard(text) {
    if (!text) return null;
    const grab = (re) => { const m = text.match(re); return m ? m[1] : null; };
    const top = {
      online: grab(/(\d+)\s*Agents?\s*Online/i),
      working: grab(/(\d+)\s*Agents?\s*Working/i),
      away: grab(/(\d+)\s*Agents?\s*Away/i),
    };
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const isVal = (x) => /^\d[\dhms%\s.:]*$/i.test(x);
    const groups = [];
    let cur = null;
    for (let i = 0; i < lines.length - 1; i++) {
      if (!isVal(lines[i]) || isVal(lines[i + 1])) continue;
      const value = lines[i], label = lines[i + 1];
      if (/^agents?\s+(online|working|away)/i.test(label)) { i++; continue; }
      if (/^new\s/i.test(label)) { cur = { name: label.replace(/^new\s+/i, ''), metrics: [] }; groups.push(cur); }
      if (cur) cur.metrics.push({ value, label });
      i++;
    }
    return groups.length ? { top, groups } : null;
  }
  function airColor(m) {
    const light = theme === 'light';
    const l = m.label.toLowerCase();
    const n = parseFloat(m.value);
    if (l.includes('within sla')) {
      return n >= 90 ? (light ? '#16a34a' : '#4ade80') : n >= 85 ? (light ? '#ca8a04' : '#facc15') : (light ? '#dc2626' : '#f87171');
    }
    if (l.startsWith('new')) return n > 0 ? (light ? '#d97706' : '#fbbf24') : 'var(--txt)';
    return 'var(--txt)';
  }
  function airIcon(name) {
    const n = name.toLowerCase();
    if (n.includes('call')) return '📞';
    if (n.includes('chat')) return '💬';
    if (n.includes('sms')) return '📱';
    if (n.includes('email')) return '✉️';
    return '•';
  }

  function sectionAirplane() {
    const f = feeds.airplane;
    const parsed = f ? parseFloorboard(f.text) : null;
    let inner;
    if (parsed) {
      const t = parsed.top;
      const topHtml = [['online', 'Agents Online'], ['working', 'Agents Working'], ['away', 'Agents Away']]
        .filter(([k]) => t[k] != null)
        .map(([k, l]) => `<div class="t t-${k}"><span class="n">${esc(t[k])}</span><span class="l">${l}</span></div>`).join('');
      const rows = parsed.groups.map((g) => `
        <div class="gcc-air-row">
          <div class="gcc-air-ico">${airIcon(g.name)}</div>
          ${g.metrics.slice(0, 4).map((m) => `
            <div class="gcc-air-m">
              <div class="gcc-air-v" style="color:${airColor(m)}">${esc(m.value)}</div>
              <div class="gcc-air-l">${esc(m.label)}</div>
              ${/within sla/i.test(m.label) && !isNaN(parseFloat(m.value)) ? `<div class="gcc-air-bar"><i style="width:${Math.max(0, Math.min(100, parseFloat(m.value)))}%;background:${airColor(m)}"></i></div>` : ''}
            </div>`).join('')}
        </div>`).join('');
      inner = `<div class="gcc-air">${topHtml ? `<div class="gcc-air-top">${topHtml}</div>` : ''}${rows}</div>`;
    } else if (f && f.rows && f.rows.length) {
      const byStatus = {};
      f.rows.forEach((r) => { byStatus[r.status || '—'] = (byStatus[r.status || '—'] || 0) + 1; });
      const chips = Object.keys(byStatus).sort().map((k) => `<span class="gcc-chip" style="background:rgba(99,102,241,.18);color:var(--txt);cursor:default">${esc(k)}: ${byStatus[k]}</span>`).join('');
      const dot = (on) => `<span class="gcc-dot${on ? ' on' : ''}"></span>`;
      const trs = f.rows.map((r) => `
        <tr><td><span class="gcc-name">${esc(r.agent)}</span></td>
        <td>${esc(r.status)}</td><td>${esc(r.statusDurationText)}</td>
        <td>${dot(r.availability.email)}${dot(r.availability.phone)}${dot(r.availability.chat)}</td>
        <td>${esc(r.current.map((c) => c.channel + ' ' + c.durationText).join(', '))}</td></tr>`).join('');
      inner = `<div class="gcc-chips">${chips}</div>
        <table><thead><tr><th>Agent</th><th>Status</th><th>For</th><th title="email · phone · chat">E P C</th><th>Current</th></tr></thead><tbody>${trs}</tbody></table>`;
    } else if (f && f.text) {
      inner = `<div class="gcc-warn">Couldn't recognise the floorboard layout, showing the page text instead.</div><div class="gcc-pre">${esc(f.text)}</div>`;
    } else inner = '';
    return `
      <div class="gcc-sec gcc-sec-air">
        <div class="gcc-sec-h"><span>✈️ Airplane Mode</span></div>
        ${noDataWarn('airplane')}
        ${inner}
        ${f ? `<div class="gcc-upd">updated ${fmtSince(f.ts)} ago</div>` : ''}
      </div>`;
  }

  let renderTimer = null;
  function notifyAll() {
    ['email', 'emailopen'].forEach((r) => { const f = feeds[r]; if (f && f.cards) maybeNotify(f.cards, r); });
  }
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 250); }

  function render() {
    if (!panel) { notifyAll(); return; }
    renderTabs();
    panel.dataset.tab = currentTab;
    const body = panel.querySelector('#gcc-body');
    const keepScroll = body.scrollTop;
    const keepSec = Array.from(body.querySelectorAll('.gcc-sec')).map((el) => el.scrollTop);
    const keepTab = body.dataset.renderedTab;
    const parts = [];
    if (currentTab === 'all') parts.push(sectionEmail('email'), sectionEmail('emailopen'), sectionAgents(), sectionAirplane());
    else if (currentTab === 'email') parts.push(sectionEmail('email'));
    else if (currentTab === 'emailopen') parts.push(sectionEmail('emailopen'));
    else if (currentTab === 'agents') parts.push(sectionAgents());
    else if (currentTab === 'airplane') parts.push(sectionAirplane());
    body.innerHTML = parts.join('');
    body.dataset.renderedTab = currentTab;
    body.scrollTop = keepScroll;
    if (keepTab === currentTab) {
      body.querySelectorAll('.gcc-sec').forEach((el, i) => { if (keepSec[i]) el.scrollTop = keepSec[i]; });
    }

    const lv = panel.querySelector('#gcc-live');
    const allLive = ROLES.every((r) => feedStatus(r).state === 'live');
    if (lv) lv.classList.toggle('on', allLive);
    const lv2 = document.getElementById('gcc-live2');
    if (lv2) lv2.classList.toggle('on', allLive);
    panel.querySelector('#gcc-foot').innerHTML = ROLES.map((r) => {
      const st = feedStatus(r);
      return `<span class="${st.state === 'live' ? 'ok' : 'bad'}">${VIEWS[r].icon} ${st.text}</span>`;
    }).join('');

    notifyAll();
  }

  /************************************************************
   * BOOT
   ************************************************************/
  injectStyle();
  buildPanel();
  GM_addValueChangeListener('notifyEnabled', (k, o, n, remote) => { if (remote) { notifyEnabled = !!n; const b = panel.querySelector('#gcc-notify'); if (b) b.textContent = notifyEnabled ? '🔔' : '🔕'; } });
  GM_addValueChangeListener('framesEnabled', (k, o, n, remote) => { if (remote) { framesEnabled = n !== false; buildFrames(); } });
  buildFrames();
  refreshAlerts();
  render();
  setInterval(() => { refreshAlerts(); render(); }, 5000);
  setInterval(() => {
    const lead = amLeader();
    if (lead && framesEnabled && !framesHost) buildFrames();
    else if ((!lead || !framesEnabled) && framesHost) { framesHost.remove(); framesHost = null; }
  }, 3000);
})();
