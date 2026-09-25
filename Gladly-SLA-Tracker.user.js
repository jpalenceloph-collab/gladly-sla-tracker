// ==UserScript==
// @name         Gladly SLA Tracker + Liveboard Monitor
// @namespace    gladly-sla-tracker
// @version      2.8.1
// @description  ...
// @match        https://*.gladly.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/jpalenceloph-collab/gladly-sla-tracker/edit/main/Gladly-SLA-Tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/jpalenceloph-collab/gladly-sla-tracker/edit/main/Gladly-SLA-Tracker.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /************************************************************
   * SHARED CONFIG
   ************************************************************/
  const LIVEBOARD_URL = 'https://metropolis.us-1.gladly.com/liveboards/agents?groups%5B0%5D=JqaiVa-7Rf-Vfi-U_Vhrhw';
  const LIVEBOARD_LABEL = 'Liveboard Agent';

  // Additional fixed pages (jump-to views + quick-switch targets)
  const AIRPLANE_MODE_URL = 'https://metropolis.us-1.gladly.com/liveboards/floorboard?groups%5B0%5D=JqaiVa-7Rf-Vfi-U_Vhrhw';
  const AGENT_LIVEBOARD_URL = 'https://metropolis.us-1.gladly.com/liveboards/agents?groups%5B0%5D=JqaiVa-7Rf-Vfi-U_Vhrhw&teams%5B0%5D=XjGcmewvS7yY30S6KC6q3w&teams%5B1%5D=sDN6IVQrTvyyBtfcpZIT_A';
  const NEW_EMAIL_COUNT_URL = 'https://metropolis.us-1.gladly.com/search?ch%5B0%5D=EMAIL&ib%5B0%5D=JqaiVa-7Rf-Vfi-U_Vhrhw&st%5B0%5D=NEW&ts%5B0%5D=conversation&ts%5B1%5D=task';

  /************************************************************
   * MODULE 1: LIVEBOARD AGENT MONITOR
   * (alert panel cluster — hidden by default, toggled from the
   * side "Liveboard" bubble)
   ************************************************************/
  function initLiveboardMonitor() {
    const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxKkXQU_4Pgq0ZpOmyhe_0ml8yzbAclImTAb5RO4Yqyt9SgnWBMBSkMZ4TG3Yj4ZcT2/exec';

    const CHAT_TOO_LONG_MIN = 7;
    const CHAT_ALERT_THRESHOLD = 3;
    const TOGGLE_COUNT_THRESHOLD = 3;
    const TOGGLE_WINDOW_MS = 5 * 60 * 1000;

    const POLL_INTERVAL_MS = 5000;
    const REPEAT_ALERT_COOLDOWN_MS = 5 * 1000;

    const SEND_SNAPSHOTS = true;
    const SEND_ALERTS = true;

const MONITORED_AGENTS = new Set([
  "Aaron T.",
  "Abiatar N.",
  "Alex L.",
  "Anna D.",
  "Anthony M.",
  "Aris N",
  "Aurora L.",
  "Ayessa Dane D.",
  "Bea Gabrielle B.",
  "Belle E.",
  "Carl I.",
  "Carla M.",
  "Chelsea Mae T.",
  "Chezka G.",
  "Chezka Joy G.",
  "Christian Dave D.",
  "Christian T.",
  "Claytie N.",
  "Cristine O.",
  "Cyril T.",
  "Dane A.",
  "Danica A.",
  "Daniel C.",
  "Daniel S.",
  "Dominique T.",
  "Edwin D.",
  "Eiriyel Roy A.",
  "Emmanuel M.",
  "Fergie G",
  "Gerald T.",
  "Hadji Q.",
  "Hannah C",
  "Hanz G.",
  "Hasna H.",
  "Ilias D.",
  "Ivee B.",
  "Jaimee V.",
  "Jan Q.",
  "Jane O.",
  "Janine Joyce O.",
  "Jay C.",
  "Jaymie M.",
  "Jeal D.",
  "Jemuel E.",
  "Jennifer G",
  "Jenny P.",
  "Jerome F.",
  "Jessica B.",
  "Jessie C.",
  "Jiulian P.",
  "Joey L.",
  "John Ashley P.",
  "John Carlo N.",
  "John P.",
  "Jorge T.",
  "Joseph C.",
  "Joshua B.",
  "Jovan B.",
  "Juliet N.",
  "June Lee A.",
  "Justin Y.",
  "Kate B.",
  "Kazandra A.",
  "Ken P.",
  "Kenneth Kyle H.",
  "Kent D.",
  "Khyl N.",
  "Kristel Marivic S.",
  "Kyle G",
  "Kylle S.",
  "MA.Elena T.",
  "Margie Lyn B.",
  "Maria U.",
  "Marienne L.",
  "Mark C",
  "Mark T.",
  "Mary A.",
  "Mary Antoneth U.",
  "Mary S.",
  "Matt A.",
  "Mauie C",
  "Maybel B.",
  "Merie R.",
  "Nikki C.",
  "Niño Jay C.",
  "Norallyza C.",
  "Orligene B.",
  "Paul R.",
  "Paulo Z.",
  "Ralph B.",
  "Raynier M.",
  "Rhaine T.",
  "Rian Nicole R.",
  "Rianne A.",
  "Rishierl C.",
  "Rouen P.",
  "Shamaika S.",
  "Sharica C.",
  "Sherwin D.",
  "Sofia D.",
  "Ulycis G.",
  "Xyrine Nicole A.",
  "Zyreen P."
]);

    function isMonitoredAgent(name) {
      return MONITORED_AGENTS.has(name);
    }

    const activeAlerts = new Map();
    const panelUserState = new Map();

    const PANEL_TYPES = {
      nobubble:   { title: '🫧 No Bubbles',    accent: '#f97316' },
      underchats: { title: '📉 Under 3 Chats', accent: '#a855f7' },
      longchat:   { title: '💬 Long Chats',    accent: '#3b82f6' }
    };

    // Whether the alert-panel cluster is visible. Hidden by default —
    // the SLA Tracker is the main panel; this is opened via the side
    // "Liveboard" bubble.
    let alertPanelsVisible = GM_getValue('alertPanelsVisible', false);

    function applyPanelsVisibility() {
      const wrap = document.getElementById('gladly-panels-wrapper');
      if (!wrap) return;
      wrap.style.display = alertPanelsVisible ? '' : 'none';
      if (alertPanelsVisible) positionPanelsWrapper();
    }

    function toggleAlertPanels() {
      alertPanelsVisible = !alertPanelsVisible;
      GM_setValue('alertPanelsVisible', alertPanelsVisible);
      applyPanelsVisibility();
      return alertPanelsVisible;
    }

    function setAlertPanelsVisible(visible) {
      if (alertPanelsVisible === visible) return;
      alertPanelsVisible = visible;
      GM_setValue('alertPanelsVisible', alertPanelsVisible);
      applyPanelsVisibility();
    }

    function injectPanelStyles() {
      if (document.getElementById('gladly-panel-styles')) return;

      const style = document.createElement('style');
      style.id = 'gladly-panel-styles';
      style.textContent = `
        #gladly-panels-wrapper {
          position: fixed;
          top: 16px;
          right: 20px;
          z-index: 999998;
          background: transparent;
        }
        #gladly-panels-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .gladly-panel {
          width: 280px;
          height: 280px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          font-family: -apple-system, "Segoe UI", Arial, sans-serif;
          color: #fff;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
        .gladly-panel.gladly-panel-collapsed {
          height: auto;
        }
        .gladly-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 9px 14px;
          background: #1e293b;
          cursor: pointer;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          user-select: none;
          flex-shrink: 0;
        }
        .gladly-panel-body {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
        .gladly-panel table {
          width: 100%;
          border-collapse: collapse;
        }
        .gladly-panel th {
          position: sticky;
          top: 0;
          background: #111c33;
          text-align: left;
          padding: 6px 10px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          opacity: 0.7;
        }
        .gladly-panel td {
          padding: 7px 10px;
          font-size: 12.5px;
          border-bottom: 1px solid #1e293b;
        }
        .gladly-panel-empty {
          padding: 14px;
          text-align: center;
          font-size: 12px;
          opacity: 0.5;
        }
      `;
      document.head.appendChild(style);
    }

    // Anchor element (the "🚨" shortcut button) that the panel cluster
    // docks below. Set via setAnchorElement() once the quick-switch button
    // exists. The wrapper is fixed-position and NOT draggable — it always
    // repositions itself under the anchor.
    let anchorEl = null;

    function positionPanelsWrapper() {
      const wrap = document.getElementById('gladly-panels-wrapper');
      if (!wrap || !anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const wrapWidth = wrap.offsetWidth || 280;
      const margin = 8;
      let left = rect.left + rect.width / 2 - wrapWidth / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - wrapWidth - margin));
      wrap.style.top = (rect.bottom + 8) + 'px';
      wrap.style.left = left + 'px';
      wrap.style.right = 'auto';
    }

    function setAnchorElement(el) {
      anchorEl = el;
      positionPanelsWrapper();
    }

    window.addEventListener('resize', () => {
      if (alertPanelsVisible) positionPanelsWrapper();
    });

    function ensurePanelsWrapper() {
      let wrap = document.getElementById('gladly-panels-wrapper');
      if (wrap) return wrap.querySelector('#gladly-panels-row');

      injectPanelStyles();

      wrap = document.createElement('div');
      wrap.id = 'gladly-panels-wrapper';

      const row = document.createElement('div');
      row.id = 'gladly-panels-row';

      wrap.appendChild(row);
      document.body.appendChild(wrap);

      positionPanelsWrapper();
      applyPanelsVisibility();

      return row;
    }

    function applyCollapseState(panel, collapsed) {
      const body = panel.querySelector('.gladly-panel-body');
      body.style.display = collapsed ? 'none' : '';
      panel.classList.toggle('gladly-panel-collapsed', collapsed);
      panel.querySelector('.gladly-panel-toggle').innerText = collapsed ? '▸' : '▾';
    }

    function ensurePanel(type) {
      const row = ensurePanelsWrapper();

      let panel = document.getElementById('gladly-panel-' + type);
      if (panel) return panel;

      const cfg = PANEL_TYPES[type];

      panel = document.createElement('div');
      panel.className = 'gladly-panel';
      panel.id = 'gladly-panel-' + type;
      panel.innerHTML = `
        <div class="gladly-panel-header" style="border-left: 4px solid ${cfg.accent}">
          <span>${cfg.title} (<span class="gladly-panel-count">0</span>)</span>
          <span class="gladly-panel-toggle">▾</span>
        </div>
        <div class="gladly-panel-body">
          <table>
            <thead><tr><th>Agent</th><th>Detail</th><th>Since</th></tr></thead>
            <tbody></tbody>
          </table>
          <div class="gladly-panel-empty">No active alerts</div>
        </div>
      `;

      row.appendChild(panel);

      const header = panel.querySelector('.gladly-panel-header');

      header.addEventListener('click', () => {
        const body = panel.querySelector('.gladly-panel-body');
        const collapsingNow = body.style.display !== 'none';
        panelUserState.set(type, collapsingNow);
        applyCollapseState(panel, collapsingNow);
      });

      return panel;
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.innerText = str;
      return div.innerHTML;
    }

    function formatSince(ts) {
      const secs = Math.floor((Date.now() - ts) / 1000);
      if (secs < 60) return secs + 's';
      const mins = Math.floor(secs / 60);
      return mins + 'm ' + (secs % 60) + 's';
    }

    function setAlert(agentName, type, detail) {
      const key = agentName + '::' + type;

      if (!activeAlerts.has(key)) {
        activeAlerts.set(key, { agent: agentName, type, detail, since: Date.now() });
      } else {
        activeAlerts.get(key).detail = detail;
      }

      renderPanel(type);
    }

    function clearAlert(agentName, type) {
      const key = agentName + '::' + type;

      if (activeAlerts.has(key)) {
        activeAlerts.delete(key);
      }

      renderPanel(type);
    }

    function renderPanel(type) {
      const panel = ensurePanel(type);
      const tbody = panel.querySelector('tbody');
      const empty = panel.querySelector('.gladly-panel-empty');
      const countEl = panel.querySelector('.gladly-panel-count');

      const rows = Array.from(activeAlerts.values())
        .filter(r => r.type === type)
        .sort((a, b) => a.since - b.since);

      countEl.innerText = rows.length;

      if (rows.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = '';
      } else {
        empty.style.display = 'none';
        tbody.innerHTML = rows.map(r => `
          <tr>
            <td>${escapeHtml(r.agent)}</td>
            <td>${escapeHtml(r.detail)}</td>
            <td>${formatSince(r.since)}</td>
          </tr>
        `).join('');
      }

      const collapsed = panelUserState.has(type)
        ? panelUserState.get(type)
        : rows.length === 0;

      applyCollapseState(panel, collapsed);
    }

    const agentHistory = new Map();
    const bubbleTimers = new Map();

    function log(...args) {
      console.log("[Gladly Monitor]", ...args);
    }

    function parseMinutes(text) {
      if (!text) return 0;
      text = text.trim();

      if (/^\d+(:\d+){1,2}$/.test(text)) {
        const parts = text.split(':').map(Number);
        if (parts.length === 3) {
          const [h, m, s] = parts;
          return h * 60 + m + s / 60;
        }
        const [m, s] = parts;
        return m + s / 60;
      }

      const h = Number((text.match(/(\d+)h/) || [0, 0])[1]);
      const m = Number((text.match(/(\d+)m/) || [0, 0])[1]);
      const s = Number((text.match(/(\d+)s/) || [0, 0])[1]);

      return h * 60 + m + s / 60;
    }

    function getBubbleCount(row) {
      const status = row.querySelector(".agentStatusCard-row-status");
      if (!status) return 0;

      let count = 0;

      if (status.querySelector(".agentStatusCard-row-status-email-available"))
        count++;

      if (status.querySelector(".agentStatusCard-row-status-voice-available"))
        count++;

      if (status.querySelector(".agentStatusCard-row-status-messaging-available"))
        count++;

      return count;
    }

    function sendWebhook(payload) {
      if (!WEBHOOK_URL) return;

      console.log("[Gladly Monitor] Sending:", payload);

      GM_xmlhttpRequest({
        method: "POST",
        url: WEBHOOK_URL,
        headers: {
          "Content-Type": "application/json"
        },
        data: JSON.stringify(payload),
        onload: function (response) {
          console.log(
            "[Gladly Monitor] Success:",
            response.status,
            response.responseText
          );
        },
        onerror: function (error) {
          console.error(
            "[Gladly Monitor] Failed:",
            error
          );
        }
      });
    }

    function getAvailability(row) {
      const container = row.querySelector(".agentStatusCard-row-status");

      if (!container) {
        return {
          email: false,
          phone: false,
          chat: false
        };
      }

      return {
        email: !!container.querySelector(".agentStatusCard-row-status-email-available"),
        phone: !!container.querySelector(".agentStatusCard-row-status-voice-available"),
        chat: !!container.querySelector(".agentStatusCard-row-status-messaging-available")
      };
    }

    function getCurrentActivities(row) {
      const current = [];

      const currentContainer = row.querySelector(".agentStatusCard-row-current");
      if (!currentContainer)
        return current;

      currentContainer.querySelectorAll(".pillList-pill").forEach(pill => {
        const svg = pill.querySelector("svg");
        if (!svg)
          return;

        const cls = svg.className.baseVal || "";

        let channel = "unknown";

        if (cls.includes("chatIcon"))
          channel = "chat";
        else if (cls.includes("voiceIcon"))
          channel = "phone";
        else if (cls.includes("emailIcon"))
          channel = "email";

        const dur = pill.querySelector(".pillList-duration");
        const durationText = dur ? dur.innerText.trim() : "";

        current.push({
          channel,
          durationText,
          minutes: parseMinutes(durationText)
        });
      });

      return current;
    }

    function readVisibleRows() {
      const rows = document.querySelectorAll(".liveboardTable-row");
      log("Total Agents Found:", rows.length);

      const agents = [];

      rows.forEach(row => {
        const name = row.querySelector(".agentStatusCard-row-name");
        if (!name)
          return;

        const reason = row.querySelector(".agentStatusCard-row-reason");
        const duration = row.querySelector(".agentStatusCard-row-duration");

        const bubbleCount = getBubbleCount(row);

        const current = getCurrentActivities(row);
        const availability = getAvailability(row);

        agents.push({
          agent: name.innerText.trim(),
          status: reason ? reason.innerText.trim() : "",
          statusDurationText: duration ? duration.innerText.trim() : "",
          bubbleCount,
          availability,
          current
        });
      });

      return agents;
    }

    function evaluate(agent) {
      if (!agentHistory.has(agent.agent)) {
        agentHistory.set(agent.agent, {
          statusHistory: [],
          alerts: {}
        });
      }

      const data = agentHistory.get(agent.agent);
      const now = Date.now();

      const canAlert = reason => {
        if (!data.alerts[reason]) return true;
        return now - data.alerts[reason] > REPEAT_ALERT_COOLDOWN_MS;
      };

      const mark = reason => {
        data.alerts[reason] = now;
      };

      if (agent.status === "Work") {
        if (agent.bubbleCount === 0) {
          if (!bubbleTimers.has(agent.agent)) {
            bubbleTimers.set(agent.agent, now);
          }

          const started = bubbleTimers.get(agent.agent);

          if (now - started >= 10000) {
            if (isMonitoredAgent(agent.agent)) {
              setAlert(
                agent.agent,
                "nobubble",
                "Offline " + formatSince(started)
              );
            }

            if (canAlert("nobubble")) {
              mark("nobubble");
            }
          }
        } else {
          bubbleTimers.delete(agent.agent);
          clearAlert(agent.agent, "nobubble");
        }
      } else {
        bubbleTimers.delete(agent.agent);
        clearAlert(agent.agent, "nobubble");
      }

      const last = data.statusHistory[data.statusHistory.length - 1];

      if (!last || last.status !== agent.status) {
        data.statusHistory.push({
          status: agent.status,
          time: now
        });
      }

      data.statusHistory = data.statusHistory.filter(
        x => now - x.time < TOGGLE_WINDOW_MS
      );

      if (data.statusHistory.length >= TOGGLE_COUNT_THRESHOLD && canAlert("toggle")) {
        if (SEND_ALERTS) {
          sendWebhook({
            type: "alert",
            agent: agent.agent,
            alertReason: "Status Toggling",
            status: agent.status,
            current: agent.current,
            timestamp: new Date().toISOString()
          });
        }

        mark("toggle");
      }

      const chats = agent.current.filter(x => x.channel === "chat");

      if (chats.length > 0 && chats.length < CHAT_ALERT_THRESHOLD) {
        if (isMonitoredAgent(agent.agent)) {
          setAlert(
            agent.agent,
            "underchats",
            chats.length + " active chat" + (chats.length === 1 ? "" : "s")
          );
        }

        if (canAlert("underchats")) {
          if (SEND_ALERTS) {
            sendWebhook({
              type: "alert",
              agent: agent.agent,
              alertReason: chats.length + " Chats",
              status: agent.status,
              current: agent.current,
              timestamp: new Date().toISOString()
            });
          }

          mark("underchats");
        }
      } else {
        clearAlert(agent.agent, "underchats");
      }

      agent.current
        .filter(x => x.channel === "chat")
        .forEach(chat => {
          if (chat.minutes >= CHAT_TOO_LONG_MIN) {
            if (isMonitoredAgent(agent.agent)) {
              setAlert(
                agent.agent,
                "longchat",
                chat.durationText
              );
            }

            if (canAlert("longchat")) {
              if (SEND_ALERTS) {
                sendWebhook({
                  type: "alert",
                  agent: agent.agent,
                  alertReason: "Long Chat",
                  status: agent.status,
                  current: agent.current,
                  timestamp: new Date().toISOString()
                });
              }

              mark("longchat");
            }
          }
        });

      if (!agent.current.some(x => x.channel === "chat" && x.minutes >= CHAT_TOO_LONG_MIN)) {
        clearAlert(agent.agent, "longchat");
      }

      if (SEND_SNAPSHOTS) {
        sendWebhook({
          type: "snapshot",
          agent: agent.agent,
          status: agent.status,
          statusDurationText: agent.statusDurationText || "",
          bubbleCount: agent.bubbleCount,
          availability: agent.availability,
          current: agent.current,
          timestamp: new Date().toISOString()
        });
      }
    }

    async function tick() {
      const rows = readVisibleRows();
      rows.forEach(evaluate);
      Object.keys(PANEL_TYPES).forEach(renderPanel);
    }

    ensurePanel("nobubble");
    ensurePanel("underchats");
    ensurePanel("longchat");
    applyPanelsVisibility();

    tick();
    setInterval(tick, POLL_INTERVAL_MS);

    return {
      toggleAlertPanels,
      isAlertPanelsVisible: () => alertPanelsVisible,
      showAlerts: () => setAlertPanelsVisible(true),
      hideAlerts: () => setAlertPanelsVisible(false),
      setAnchorElement,
      repositionPanel: () => { if (alertPanelsVisible) positionPanelsWrapper(); },
    };
  }

  /************************************************************
   * MODULE 2: SLA TRACKER (main panel)
   ************************************************************/
  function initSlaTracker() {
    const SLA_HOURS = 12;
    const BUCKETS = [
      { label: 'OVERDUE',      max: 0,              color: '#7f1d1d', bg: '#fee2e2' },
      { label: 'Due < 1h',     max: 60 * 60 * 1000, color: '#b91c1c', bg: '#fee2e2' },
      { label: 'Due < 3h',     max: 3 * 60 * 60 * 1000, color: '#b45309', bg: '#ffedd5' },
      { label: 'Due < 6h',     max: 6 * 60 * 60 * 1000, color: '#a16207', bg: '#fef9c3' },
      { label: 'Due later',    max: Infinity,       color: '#166534', bg: '#dcfce7' },
    ];
    const NOTIFY_THRESHOLD_MIN = 30;
    const POLL_MS = 15000;
    const DEBOUNCE_MS = 600;

    const PAGE_ADVANCE_TIMEOUT_MS = 8000;
    const PAGE_ADVANCE_POLL_MS = 200;
    const MAX_SCAN_PAGES = 200;

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

    // "Liveboard Agent" is the default jump-to view — always first.
    const DEFAULT_VIEWS = [
      {
        label: LIVEBOARD_LABEL,
        path: LIVEBOARD_URL,
      },
      {
        label: 'Airplane Mode',
        path: AIRPLANE_MODE_URL,
      },
      {
        label: 'The Agent Liveboard',
        path: AGENT_LIVEBOARD_URL,
      },
      {
        label: 'New Email (Count)',
        path: NEW_EMAIL_COUNT_URL,
      },
    ];

    let notifyEnabled = GM_getValue('notifyEnabled', false);
    let notifiedIds = new Set(JSON.parse(GM_getValue('notifiedIds', '[]')));
    let panelCollapsed = GM_getValue('panelCollapsed', false);
    // Whether the whole panel is hidden (used by the quick-switch button,
    // distinct from panelCollapsed which just tucks the body under the header).
    let panelHidden = GM_getValue('panelHidden', false);
    let savedViews = safeParseViews(GM_getValue('savedViews', JSON.stringify(DEFAULT_VIEWS)));
    let renderTimer = null;
    let isScanningAllPages = false;
    // Set by a click while a scan is running, so the running scan's own
    // loop is the only thing that ever flips isScanningAllPages back to
    // false. Previously a second click just set isScanningAllPages=false
    // directly, which meant a third click landing before the first scan's
    // loop had actually exited would read isScanningAllPages as false and
    // kick off a brand-new overlapping scan loop — two loops then raced
    // over the same scanAggregate map, clicking "next" out of turn and
    // reporting mismatched counts. Routing every click through this flag
    // means only the original loop can ever clear isScanningAllPages.
    let stopRequested = false;
    // Whether a scan has produced (or is producing) aggregate results worth
    // showing. Once true, clicking the scan button again just toggles
    // aggVisible instead of starting another scan.
    let aggHasData = false;
    // Whether the filtered/scanned view is the one currently shown, in
    // place of the normal current-page breakdown (sla-summary + sla-body).
    let aggVisible = false;
    let scanAggregate = new Map();

    // Bucket chips ("OVERDUE", "Due < 1h", ...) are clickable filters.
    // mainSelectedBuckets narrows the normal per-page card list; empty
    // means "show everything" (unchanged from the old behavior).
    // aggSelectedBuckets narrows the scanned quick-view list; it starts
    // pre-seeded with the buckets that quick view always used to show.
    let mainSelectedBuckets = new Set();
    let aggSelectedBuckets = new Set(['OVERDUE', 'Due < 1h']);
    // So a chip click can re-render the agg view without needing to know
    // the scan's current pageCount/done state itself.
    let lastAggPageCount = 0;
    let lastAggDone = false;
    let panelRef = null;
    let toolbarRef = null;

    // The SLA panel is no longer independently draggable — it stays
    // centered under, and anchored to, the 📊 button in the top toolbar.
    // panelAnchorEl is set via setPanelAnchorElement() once that button
    // exists; toolbarDragCallback fires on every mousemove while the
    // toolbar itself is being dragged, so the panel follows it live.
    let panelAnchorEl = null;
    let toolbarDragCallback = null;

    function positionPanel() {
      if (!panelRef || !panelAnchorEl) return;
      const rect = panelAnchorEl.getBoundingClientRect();
      const panelWidth = panelRef.offsetWidth || 360;
      const margin = 8;
      let left = rect.left + rect.width / 2 - panelWidth / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
      panelRef.style.left = `${left}px`;
      panelRef.style.right = 'auto';
      panelRef.style.top = `${rect.bottom + 8}px`;
    }

    function setPanelAnchorElement(el) {
      panelAnchorEl = el;
      positionPanel();
    }

    window.addEventListener('resize', () => {
      if (panelRef && !panelHidden) positionPanel();
    });

    function safeParseViews(raw) {
      try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : DEFAULT_VIEWS;
      } catch (e) {
        return DEFAULT_VIEWS;
      }
    }

    function bucketFor(msRemaining) {
      for (const b of BUCKETS) {
        if (msRemaining < b.max) return b;
      }
      return BUCKETS[BUCKETS.length - 1];
    }

    function fmtRemaining(ms) {
      const overdue = ms < 0;
      const abs = Math.abs(ms);
      const h = Math.floor(abs / 3600000);
      const m = Math.floor((abs % 3600000) / 60000);
      const txt = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return overdue ? `-${txt} (overdue)` : txt;
    }

    function navigateSpa(path) {
      try {
        const url = new URL(path, location.origin).toString();
        history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        return true;
      } catch (e) {
        console.error('[SLA Tracker] navigateSpa failed', e);
        return false;
      }
    }

    function absoluteUrl(href) {
      try {
        return new URL(href, location.origin).toString();
      } catch (e) {
        return href || '';
      }
    }

    function parseCard(el) {
      const get = (sel) => el.querySelector(sel);
      const nameEl = get(SEL.name);
      const emailEl = get(SEL.email);
      const topicEl = get(SEL.topic);
      const slaEl = get(SEL.slaTime);
      const statusEl = get(SEL.status);
      const subjectEl = get(SEL.subject);
      const linkEl = el.closest('a[href]');

      const dueIso = slaEl ? slaEl.getAttribute('datetime') : null;
      const dueDate = dueIso ? new Date(dueIso) : null;
      const link = linkEl ? absoluteUrl(linkEl.getAttribute('href')) : '';

      const data = {
        name: nameEl ? nameEl.textContent.trim() : '(unknown)',
        email: emailEl ? emailEl.textContent.trim() : '',
        topic: topicEl ? topicEl.textContent.trim() : '',
        subject: subjectEl ? subjectEl.textContent.trim() : '',
        status: statusEl ? statusEl.textContent.trim() : '',
        dueDate,
        link,
      };
      data.id = link || `${data.email || ''}|${data.subject || ''}`;
      return data;
    }

    function collectCards() {
      return Array.from(document.querySelectorAll(CARD_SEL))
        .map(parseCard)
        .filter((c) => c.dueDate);
    }

    function cardSignature() {
      return collectCards().map((c) => c.id).join('|');
    }

    function clickFirstPage() {
      const first = document.querySelector(SEL.paginationFirst);
      if (!first) return false;

      // If page 1 is already active, there is nothing to do.
      if (first.classList.contains('rc-pagination-item-active') ||
          first.getAttribute('aria-current') === 'page') {
        return true;
      }

      const clickable = first.querySelector('button, a') || first;
      clickable.click();
      return true;
    }

    function clickNext() {
      const el = document.querySelector(SEL.paginationNext);
      if (!el) return false;
      const disabled = el.getAttribute('aria-disabled') === 'true' || el.classList.contains('rc-pagination-disabled');
      if (disabled) return false;
      const clickable = el.querySelector('button, a') || el;
      clickable.click();
      return true;
    }

    function waitForNewCards(beforeSig) {
      return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          if (cardSignature() !== beforeSig) return resolve();
          if (Date.now() - start > PAGE_ADVANCE_TIMEOUT_MS) return resolve();
          setTimeout(tick, PAGE_ADVANCE_POLL_MS);
        };
        tick();
      });
    }

    // Single entry point for the 🔍/⏹ button. Three distinct situations,
    // never more than one action taken per click:
    //  - a scan is running        -> ask it to stop (don't start another)
    //  - a scan already ran       -> just toggle the filtered view on/off
    //  - nothing scanned yet      -> start a scan
    function handleScanButtonClick(panel) {
      if (isScanningAllPages) {
        stopRequested = true;
        return;
      }
      if (aggHasData) {
        aggVisible = !aggVisible;
        updateScanButton(panel);
        applyBreakdownVisibility(panel);
        return;
      }
      scanAllPages(panel);
    }

    function updateScanButton(panel) {
      const btn = panel.querySelector('#sla-scan-all');
      const rescanBtn = panel.querySelector('#sla-rescan');
      if (!btn) return;
      if (isScanningAllPages) {
        btn.textContent = '⏹';
        btn.title = 'Stop scan';
        btn.classList.add('sla-icon-active');
        if (rescanBtn) rescanBtn.style.display = 'none';
        return;
      }
      btn.textContent = '🔍';
      if (aggHasData) {
        btn.classList.toggle('sla-icon-active', aggVisible);
        btn.title = aggVisible
          ? 'Showing scanned results — click to view the current page instead'
          : 'Click to show the scanned results again';
        if (rescanBtn) rescanBtn.style.display = '';
      } else {
        btn.classList.remove('sla-icon-active');
        btn.title = 'Click through every page and total up volume + due dates';
        if (rescanBtn) rescanBtn.style.display = 'none';
      }
    }

    // While scanning, or while showing a completed scan's results, the
    // normal current-page-only breakdown is just noise — hide it and let
    // #sla-agg (the filtered/aggregate view) be the only thing shown.
    function applyBreakdownVisibility(panel) {
      const showAgg = isScanningAllPages || aggVisible;
      const summaryEl = panel.querySelector('#sla-summary');
      const bodyEl = panel.querySelector('#sla-body');
      if (summaryEl) summaryEl.style.display = showAgg ? 'none' : '';
      if (bodyEl) bodyEl.style.display = showAgg ? 'none' : '';
    }

    async function scanAllPages(panel) {
      isScanningAllPages = true;
      stopRequested = false;
      aggHasData = true;
      aggVisible = true;
      scanAggregate = new Map();
      updateScanButton(panel);
      applyBreakdownVisibility(panel);

      let pageCount = 0;
      try {
        // Always restart a fresh scan from page 1.
        // This is especially important for 🔄 Rescan: if the previous scan
        // ended on the last page, scanning again from the current page would
        // only collect that page instead of the entire queue.
        const beforeFirstPageSig = cardSignature();
        const firstPageClicked = clickFirstPage();

        if (firstPageClicked) {
          // If page 1 was already active, waitForNewCards() would unnecessarily
          // wait for the timeout because the cards have not changed.
          const firstPageEl = document.querySelector(SEL.paginationFirst);
          const firstPageIsActive = firstPageEl &&
            (firstPageEl.classList.contains('rc-pagination-item-active') ||
             firstPageEl.getAttribute('aria-current') === 'page');

          if (!firstPageIsActive) {
            await waitForNewCards(beforeFirstPageSig);
          }
        }

        while (!stopRequested && pageCount < MAX_SCAN_PAGES) {
          pageCount += 1;
          collectCards().forEach((c) => scanAggregate.set(c.id, c));
          renderAggSummary(panel, pageCount, false);

          const beforeSig = cardSignature();
          const advanced = clickNext();
          if (!advanced) break;
          await waitForNewCards(beforeSig);
        }
      } finally {
        isScanningAllPages = false;
        stopRequested = false;
        // Stopped before a single page actually got scanned — nothing to
        // show, so leave the button in its untouched idle state.
        if (pageCount === 0) {
          aggHasData = false;
          aggVisible = false;
        }
        updateScanButton(panel);
        renderAggSummary(panel, pageCount, true);
        applyBreakdownVisibility(panel);
      }
    }

    function renderAggSummary(panel, pageCount, done) {
      lastAggPageCount = pageCount;
      lastAggDone = done;

      const aggEl = panel.querySelector('#sla-agg');
      if (!aggEl) return;
      const cards = Array.from(scanAggregate.values());
      if (cards.length === 0 && pageCount === 0) {
        aggEl.style.display = 'none';
        aggEl.innerHTML = '';
        return;
      }
      aggEl.style.display = 'block';

      const now = Date.now();
      const counts = BUCKETS.map((b) => ({ ...b, count: 0 }));
      let earliest = null;
      cards.forEach((c) => {
        const ms = c.dueDate.getTime() - now;
        const b = bucketFor(ms);
        counts.find((x) => x.label === b.label).count += 1;
        if (!earliest || c.dueDate < earliest) earliest = c.dueDate;
      });

      const statusLine = done
        ? `Scanned ${pageCount} page${pageCount === 1 ? '' : 's'} · done`
        : `Scanning… page ${pageCount}`;

      // Quick view: whichever buckets the chips above are toggled to,
      // pulled from every page scanned so far (not just the page currently
      // loaded), sorted like an Excel ascending sort — most urgent bucket
      // first, then soonest due-date within it.
      const filterLabelsText = aggSelectedBuckets.size ? Array.from(aggSelectedBuckets).join(' + ') : null;
      const filteredCards = aggSelectedBuckets.size
        ? sortByPriority(cards.filter((c) => aggSelectedBuckets.has(bucketFor(c.dueDate.getTime() - now).label)), now)
        : [];

      const quickViewRows = filteredCards.map((c) => {
        const ms = c.dueDate.getTime() - now;
        const b = bucketFor(ms);
        const nameHtml = c.link
          ? `<a class="sla-name" href="${escapeHtml(c.link)}">${escapeHtml(c.name)}</a>`
          : `<div class="sla-name">${escapeHtml(c.name)}</div>`;
        return `
          <tr>
            <td>
              ${nameHtml}
              <div class="sla-subject">${escapeHtml(c.subject)}</div>
            </td>
            <td class="sla-remain" style="color:${b.color};">${fmtRemaining(ms)}</td>
          </tr>`;
      }).join('');

      const quickViewHtml = `
        <div class="sla-agg-quickview">
          <div class="sla-agg-quickview-header">🔍 ${filterLabelsText ? `${escapeHtml(filterLabelsText)} — ${filteredCards.length}` : 'Click a pill above to filter'}</div>
          ${filterLabelsText
            ? (filteredCards.length
              ? `<div class="sla-agg-quickview-list"><table><tbody>${quickViewRows}</tbody></table></div>`
              : `<div class="sla-agg-quickview-empty">No emails in the selected filter.</div>`)
            : ''}
        </div>`;

      aggEl.innerHTML = `
        <div class="sla-agg-header">
          <b>All pages: ${cards.length} email${cards.length === 1 ? '' : 's'}</b>
          <span class="sla-agg-status">${escapeHtml(statusLine)}</span>
        </div>
        <div class="sla-summary">
          ${chipsHtml(counts, aggSelectedBuckets)}
        </div>
        ${earliest ? `<div class="sla-agg-earliest">Earliest due: ${earliest.toLocaleString()}</div>` : ''}
        ${quickViewHtml}
        ${done && cards.length ? `<button id="sla-agg-export">Export all-pages CSV</button>` : ''}
      `;

      if (done && cards.length) {
        aggEl.querySelector('#sla-agg-export').addEventListener('click', () => downloadCsv(cards));
      }
    }

    function maybeNotify(cards) {
      if (!notifyEnabled || typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      const now = Date.now();
      let changed = false;
      cards.forEach((c) => {
        const msLeft = c.dueDate.getTime() - now;
        const minsLeft = msLeft / 60000;
        if (minsLeft <= NOTIFY_THRESHOLD_MIN && !notifiedIds.has(c.id)) {
          new Notification('Gladly SLA warning', {
            body: `${c.name || c.email}: "${c.subject}" due in ${fmtRemaining(msLeft)}`,
          });
          notifiedIds.add(c.id);
          changed = true;
        }
      });
      if (changed) GM_setValue('notifiedIds', JSON.stringify(Array.from(notifiedIds)));
    }

    function sortByPriority(cards, now) {
      return [...cards].sort((a, b) => {
        const bucketA = BUCKETS.indexOf(bucketFor(a.dueDate.getTime() - now));
        const bucketB = BUCKETS.indexOf(bucketFor(b.dueDate.getTime() - now));
        if (bucketA !== bucketB) return bucketA - bucketB;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
    }

    function toCsv(cards) {
      const now = Date.now();
      const header = ['Name', 'Email', 'Subject', 'Topic', 'Status', 'Due (local)', 'Minutes remaining', 'Conversation Link'];
      const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const rowFor = (c) => [
        c.name, c.email, c.subject, c.topic, c.status,
        c.dueDate.toLocaleString(),
        Math.round((c.dueDate.getTime() - now) / 60000),
        c.link || '',
      ].map(esc).join(',');

      const sorted = sortByPriority(cards, now);
      const groups = BUCKETS
        .map((b) => ({ bucket: b, cards: sorted.filter((c) => bucketFor(c.dueDate.getTime() - now) === b) }))
        .filter((g) => g.cards.length > 0);

      return groups
        .map((g) => [
          esc(`${g.bucket.label} (${g.cards.length})`),
          header.map(esc).join(','),
          ...g.cards.map(rowFor),
        ].join('\n'))
        .join('\n\n');
    }

    function downloadCsv(cards) {
      const csv = toCsv(cards);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `gladly-sla-snapshot-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[ch]));
    }

    // Bucket chips double as filter toggles. `selected` is the Set the
    // chip's own click handler reads/writes; clicking a chip adds/removes
    // its label from that set and re-renders.
    function chipsHtml(counts, selected) {
      return counts.map((b) => {
        const active = selected.has(b.label);
        return `<span class="sla-chip${active ? ' sla-chip-active' : ''}" data-label="${escapeHtml(b.label)}" style="background:${b.bg};color:${b.color};">${b.label}: ${b.count}</span>`;
      }).join('');
    }

    function toggleMainBucket(label, panel) {
      if (!label) return;
      if (mainSelectedBuckets.has(label)) mainSelectedBuckets.delete(label);
      else mainSelectedBuckets.add(label);
      render(panel);
    }

    function toggleAggBucket(label, panel) {
      if (!label) return;
      if (aggSelectedBuckets.has(label)) aggSelectedBuckets.delete(label);
      else aggSelectedBuckets.add(label);
      renderAggSummary(panel, lastAggPageCount, lastAggDone);
    }

    function injectStyle() {
      const css = `
        #gladly-sla-panel {
          position: fixed; top: 70px; right: 16px; width: 360px; max-height: 80vh;
          background: #fff; border: 1px solid #d1d5db; border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18); font-family: -apple-system, Segoe UI, Arial, sans-serif;
          font-size: 12px; z-index: 999999; overflow: hidden; display: flex; flex-direction: column;
        }
        #gladly-sla-panel.collapsed .sla-body { display: none; }
        #gladly-sla-panel .sla-head {
          display: flex; align-items: center; justify-content: space-between;
          background: #111827; color: #fff; padding: 8px 10px; user-select: none;
        }
        #gladly-sla-panel .sla-head b { font-size: 13px; }
        #gladly-sla-panel .sla-head .sla-controls { display: flex; gap: 6px; align-items: center; }
        #gladly-sla-panel button {
          border: none; border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;
          background: #374151; color: #fff;
        }
        #gladly-sla-panel button:hover { background: #4b5563; }
        #gladly-sla-panel .sla-icon-btn {
          width: 26px; height: 26px; padding: 0; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 13px; line-height: 1;
        }
        #gladly-sla-panel .sla-icon-btn.sla-icon-active { background: #2563eb; }
        #gladly-sla-panel .sla-summary {
          display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 10px; border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        #gladly-sla-panel .sla-agg {
          border-bottom: 1px solid #e5e7eb; background: #eff6ff;
        }
        #gladly-sla-panel .sla-agg .sla-summary { border-bottom: none; background: transparent; }
        #gladly-sla-panel .sla-agg-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 10px 0 10px;
        }
        #gladly-sla-panel .sla-agg-status { color: #2563eb; font-weight: 600; font-size: 11px; }
        #gladly-sla-panel .sla-agg-earliest { padding: 0 10px 8px 10px; color: #4b5563; }
        #gladly-sla-panel .sla-agg #sla-agg-export { margin: 0 10px 8px 10px; }
        #gladly-sla-panel .sla-agg-quickview {
          margin: 0 10px 8px 10px; border: 1px solid #fecaca; border-radius: 8px;
          background: #fff1f2; overflow: hidden;
        }
        #gladly-sla-panel .sla-agg-quickview-header {
          padding: 6px 10px; font-weight: 700; font-size: 11px; color: #991b1b;
          background: #fee2e2; text-transform: uppercase; letter-spacing: .3px;
        }
        #gladly-sla-panel .sla-agg-quickview-list { max-height: 220px; overflow-y: auto; }
        #gladly-sla-panel .sla-agg-quickview-empty { padding: 10px; text-align: center; color: #9ca3af; font-size: 12px; }
        #gladly-sla-panel .sla-agg-quickview table { width: 100%; border-collapse: collapse; }
        #gladly-sla-panel .sla-agg-quickview td { padding: 6px 10px; border-bottom: 1px solid #fecdd3; font-size: 12px; vertical-align: top; }
        #gladly-sla-panel .sla-agg-quickview tr:last-child td { border-bottom: none; }
        #gladly-sla-panel .sla-chip {
          padding: 3px 7px; border-radius: 999px; font-weight: 600; font-size: 11px;
          cursor: pointer; user-select: none; border: 2px solid transparent;
          transition: filter .1s, border-color .1s;
        }
        #gladly-sla-panel .sla-chip:hover { filter: brightness(0.93); }
        #gladly-sla-panel .sla-chip-active { border-color: currentColor; }
        #gladly-sla-panel .sla-body { overflow-y: auto; flex: 1; min-height: 0; }
        #gladly-sla-panel table { width: 100%; border-collapse: collapse; }
        #gladly-sla-panel td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        #gladly-sla-panel .sla-name { font-weight: 600; color: #111827; text-decoration: none; display: inline-block; }
        #gladly-sla-panel a.sla-name:hover { text-decoration: underline; }
        #gladly-sla-panel .sla-subject { color: #4b5563; }
        #gladly-sla-panel .sla-remain { font-weight: 700; white-space: nowrap; text-align: right; }
        #gladly-sla-panel .sla-empty { padding: 16px; text-align: center; color: #9ca3af; }
        #gladly-sla-panel .sla-foot {
          display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid #e5e7eb; background: #f9fafb;
        }
      `;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }

    function injectToolbarStyle() {
      if (document.getElementById('gladly-jump-toolbar-styles')) return;
      const css = `
        #gladly-jump-toolbar {
          position: fixed; top: 16px; right: 16px; z-index: 1000002;
          display: flex; align-items: center; gap: 6px;
          background: #111827; border: 1px solid #374151; border-radius: 999px;
          padding: 4px 10px 4px 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          font-family: -apple-system, Segoe UI, Arial, sans-serif;
        }
        #gladly-jump-toolbar .gjt-handle {
          cursor: move; color: #6b7280; font-size: 13px; padding: 0 2px;
          user-select: none; line-height: 1;
        }
        #gladly-jump-toolbar .gjt-icons { display: flex; gap: 4px; }
        #gladly-jump-toolbar .gjt-icons button {
          width: 28px; height: 28px; border-radius: 50%; border: none; cursor: pointer;
          background: transparent; color: #9ca3af; font-size: 14px; padding: 0;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s, color .15s;
        }
        #gladly-jump-toolbar .gjt-icons button:hover { background: #1f2937; color: #fff; }
        #gladly-jump-toolbar .gjt-icons button.gqs-active { background: #2563eb; color: #fff; }
        #gladly-jump-toolbar select#sla-views {
          background: #1f2937; color: #fff; border: 1px solid #374151; border-radius: 999px;
          padding: 4px 10px; font-size: 11px; max-width: 160px; cursor: pointer;
        }
      `;
      const style = document.createElement('style');
      style.id = 'gladly-jump-toolbar-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    // Standalone toolbar, appended directly to <body> — deliberately NOT a
    // child of #gladly-sla-panel, so it stays put (and draggable as its own
    // unit) regardless of whether the SLA panel is collapsed/hidden/moved.
    // initQuickSwitch() docks its two icon buttons into #gjt-icons so the
    // quick-switch pill and the jump-to-view dropdown move together.
    function buildJumpToolbar() {
      injectToolbarStyle();
      const bar = document.createElement('div');
      bar.id = 'gladly-jump-toolbar';
      bar.innerHTML = `
        <span class="gjt-handle" id="gjt-drag-handle" title="Drag to move">⠿</span>
        <span class="gjt-icons" id="gjt-icons"></span>
        <select id="sla-views" title="Jump to a saved filtered view without reloading the page"></select>
      `;
      document.body.appendChild(bar);

      populateViewsSelect(bar);
      bar.querySelector('#sla-views').addEventListener('change', (e) => {
        const val = e.target.value;
        e.target.value = '';

        if (!val) return;

        if (val === '__save__') {
          saveCurrentView();
          return;
        }

        const view = savedViews.find((v) => v.label === val);
        if (view) jumpToView(view);
      });

      makeDraggable(bar, bar.querySelector('#gjt-drag-handle'), () => {
        if (toolbarDragCallback) toolbarDragCallback();
      });

      // The panels are anchored under this toolbar's icon buttons, so any
      // change to the toolbar's own size (icons added later, the saved-view
      // select changing width, etc.) has to re-trigger positioning too —
      // not just an explicit drag or a window resize — or the anchored
      // panels silently drift out from under their icon.
      if (window.ResizeObserver) {
        new ResizeObserver(() => {
          if (toolbarDragCallback) toolbarDragCallback();
        }).observe(bar);
      }

      toolbarRef = bar;
      return bar;
    }

    function setOnToolbarDrag(cb) {
      toolbarDragCallback = cb;
    }

    function buildPanel() {
      const panel = document.createElement('div');
      panel.id = 'gladly-sla-panel';
      if (panelCollapsed) panel.classList.add('collapsed');
      panel.innerHTML = `
        <div class="sla-head">
          <b>SLA Tracker (${SLA_HOURS}h)</b>
          <div class="sla-controls">
            <button id="sla-notify-toggle" class="sla-icon-btn${notifyEnabled ? ' sla-icon-active' : ''}" title="${notifyEnabled ? 'Notifications on — click to mute' : 'Notifications off — click to enable'}">${notifyEnabled ? '🔔' : '🔕'}</button>
            <button id="sla-scan-all" class="sla-icon-btn" title="Click through every page and total up volume + due dates">🔍</button>
            <button id="sla-rescan" class="sla-icon-btn" title="Scan again" style="display:none;">🔄</button>
            <button id="sla-collapse" class="sla-icon-btn" title="${panelCollapsed ? 'Expand panel' : 'Collapse panel'}">${panelCollapsed ? '▸' : '▾'}</button>
          </div>
        </div>
        <div class="sla-agg" id="sla-agg" style="display:none;"></div>
        <div class="sla-summary" id="sla-summary"></div>
        <div class="sla-body" id="sla-body"></div>
        <div class="sla-foot">
          <span style="color:#6b7280;">Tracks cards currently loaded on the board</span>
        </div>
      `;
      document.body.appendChild(panel);

      panel.querySelector('#sla-collapse').addEventListener('click', () => {
        panelCollapsed = !panelCollapsed;
        panel.classList.toggle('collapsed', panelCollapsed);
        const btn = panel.querySelector('#sla-collapse');
        btn.textContent = panelCollapsed ? '▸' : '▾';
        btn.title = panelCollapsed ? 'Expand panel' : 'Collapse panel';
        GM_setValue('panelCollapsed', panelCollapsed);
      });

      panel.querySelector('#sla-notify-toggle').addEventListener('click', async () => {
        if (!notifyEnabled && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          await Notification.requestPermission();
        }
        notifyEnabled = !notifyEnabled;
        GM_setValue('notifyEnabled', notifyEnabled);
        const btn = panel.querySelector('#sla-notify-toggle');
        btn.textContent = notifyEnabled ? '🔔' : '🔕';
        btn.title = notifyEnabled ? 'Notifications on — click to mute' : 'Notifications off — click to enable';
        btn.classList.toggle('sla-icon-active', notifyEnabled);
      });

      panel.querySelector('#sla-scan-all').addEventListener('click', () => {
        handleScanButtonClick(panel);
      });

      panel.querySelector('#sla-rescan').addEventListener('click', () => {
        if (isScanningAllPages) return;
        scanAllPages(panel);
      });

      // #sla-summary and #sla-agg are static containers whose innerHTML gets
      // replaced on every render — delegate here once rather than rebinding
      // a listener on every re-render.
      panel.querySelector('#sla-summary').addEventListener('click', (e) => {
        const chip = e.target.closest('.sla-chip');
        if (chip) toggleMainBucket(chip.dataset.label, panel);
      });
      panel.querySelector('#sla-agg').addEventListener('click', (e) => {
        const chip = e.target.closest('.sla-chip');
        if (chip) toggleAggBucket(chip.dataset.label, panel);
      });

      return panel;
    }

    function populateViewsSelect(root) {
      const select = root.querySelector('#sla-views');
      const options = [
        `<option value="">Jump to view…</option>`,
        ...savedViews.map((v) => `<option value="${escapeHtml(v.label)}">${escapeHtml(v.label)}</option>`),
        `<option value="__save__">+ Save current view…</option>`,
      ];
      select.innerHTML = options.join('');
    }

    function makeDraggable(panel, handle, onMove) {
      let sx, sy, sTop, sRight, dragging = false;
      handle.addEventListener('mousedown', (e) => {
        dragging = true;
        sx = e.clientX; sy = e.clientY;
        const rect = panel.getBoundingClientRect();
        sTop = rect.top;
        sRight = window.innerWidth - rect.right;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panel.style.top = `${sTop + (e.clientY - sy)}px`;
        panel.style.right = `${sRight - (e.clientX - sx)}px`;
        panel.style.left = 'auto';
        if (onMove) onMove();
      });
      document.addEventListener('mouseup', () => { dragging = false; });
    }

    function render(panel) {
      const cards = collectCards();
      const now = Date.now();
      cards.sort((a, b) => a.dueDate - b.dueDate);

      const counts = BUCKETS.map((b) => ({ ...b, count: 0 }));
      cards.forEach((c) => {
        const ms = c.dueDate.getTime() - now;
        const b = bucketFor(ms);
        const entry = counts.find((x) => x.label === b.label);
        entry.count += 1;
      });
      const summaryEl = panel.querySelector('#sla-summary');
      summaryEl.innerHTML = chipsHtml(counts, mainSelectedBuckets);

      const filteredCards = mainSelectedBuckets.size
        ? cards.filter((c) => mainSelectedBuckets.has(bucketFor(c.dueDate.getTime() - now).label))
        : cards;

      const bodyEl = panel.querySelector('#sla-body');
      if (filteredCards.length === 0) {
        bodyEl.innerHTML = `<div class="sla-empty">${mainSelectedBuckets.size ? 'No emails match the selected filter.' : 'No SLA due-dates found on this board.'}</div>`;
      } else {
        const rows = filteredCards.map((c) => {
          const ms = c.dueDate.getTime() - now;
          const b = bucketFor(ms);
          const nameHtml = c.link
            ? `<a class="sla-name" href="${escapeHtml(c.link)}">${escapeHtml(c.name)}</a>`
            : `<div class="sla-name">${escapeHtml(c.name)}</div>`;
          return `
            <tr>
              <td>
                ${nameHtml}
                <div class="sla-subject">${escapeHtml(c.subject)}</div>
              </td>
              <td class="sla-remain" style="color:${b.color};">${fmtRemaining(ms)}</td>
            </tr>`;
        }).join('');
        bodyEl.innerHTML = `<table><tbody>${rows}</tbody></table>`;
      }

      maybeNotify(cards);

      if (!panelHidden) positionPanel();
    }

    function scheduleRender(panel) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => render(panel), DEBOUNCE_MS);
    }

    // ---- exposed control API (used by the side bubbles) ----
    function toggleTrackerPanel() {
      if (!panelRef) return panelCollapsed;
      panelCollapsed = !panelCollapsed;
      panelRef.classList.toggle('collapsed', panelCollapsed);
      panelRef.querySelector('#sla-collapse').textContent = panelCollapsed ? '▸' : '▾';
      GM_setValue('panelCollapsed', panelCollapsed);
      return panelCollapsed;
    }

    function applyPanelHidden() {
      if (panelRef) panelRef.style.display = panelHidden ? 'none' : '';
    }

    function showTracker() {
      panelHidden = false;
      GM_setValue('panelHidden', panelHidden);
      applyPanelHidden();
      positionPanel();
    }

    function hideTracker() {
      panelHidden = true;
      GM_setValue('panelHidden', panelHidden);
      applyPanelHidden();
    }

    function jumpToView(view) {
      if (!view) return;
      const ok = navigateSpa(view.path);
      setTimeout(() => { if (panelRef) render(panelRef); }, 500);
      if (!ok) alert('Could not navigate to that view automatically. Try selecting it again, or reload from the board root first.');
    }

    function openViewInNewTab(view) {
      if (!view) return;
      window.open(absoluteUrl(view.path), '_blank');
    }

    function saveCurrentView() {
      const defaultLabel = document.title ? document.title.slice(0, 40) : 'New view';
      const label = window.prompt('Name this saved view:', defaultLabel);
      if (label) {
        savedViews.push({ label, path: location.pathname + location.search });
        GM_setValue('savedViews', JSON.stringify(savedViews));
        if (toolbarRef) populateViewsSelect(toolbarRef);
      }
      return savedViews;
    }

    function init() {
      injectStyle();
      panelRef = buildPanel();
      buildJumpToolbar();
      render(panelRef);
      applyPanelHidden();

      const observer = new MutationObserver(() => scheduleRender(panelRef));
      observer.observe(document.body, { childList: true, subtree: true });

      setInterval(() => render(panelRef), POLL_MS);
    }

    init();

    return {
      toggleTrackerPanel,
      jumpToView,
      openViewInNewTab,
      saveCurrentView,
      getSavedViews: () => savedViews,
      isCollapsed: () => panelCollapsed,
      showTracker,
      hideTracker,
      isTrackerVisible: () => !panelHidden,
      getToolbarIconsEl: () => (toolbarRef ? toolbarRef.querySelector('#gjt-icons') : null),
      getToolbarEl: () => toolbarRef,
      setPanelAnchorElement,
      setOnToolbarDrag,
      repositionPanel: positionPanel,
    };
  }

  /************************************************************
   * MODULE 4: QUICK SWITCH
   * A small pinned pill (top-right) with two icon buttons —
   * SLA Tracker / Live Alerts — so only one panel is on screen
   * at a time instead of both cluttering the page. Clicking the
   * active icon again hides it too, for a fully clear screen.
   ************************************************************/
  function initQuickSwitch(monitorApi, trackerApi) {
    // The icons dock inside the SLA tracker's jump-toolbar (#gjt-icons) so
    // the tracker/alerts switch and the jump-to-view dropdown live in one
    // pill and drag around together. Falls back to a standalone pill if,
    // for some reason, the toolbar isn't available.
    const iconsHost = trackerApi.getToolbarIconsEl && trackerApi.getToolbarIconsEl();

    const trackerBtn = document.createElement('button');
    trackerBtn.textContent = '📊';

    const alertsBtn = document.createElement('button');
    alertsBtn.textContent = '🚨';

    if (iconsHost) {
      iconsHost.appendChild(trackerBtn);
      iconsHost.appendChild(alertsBtn);
    } else {
      const css = `
        #gladly-quick-switch {
          position: fixed; top: 16px; right: 16px; z-index: 1000001;
          display: flex; gap: 4px; background: #111827; border: 1px solid #374151;
          border-radius: 999px; padding: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          font-family: -apple-system, Segoe UI, Arial, sans-serif;
        }
        #gladly-quick-switch button {
          width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
          background: transparent; color: #9ca3af; font-size: 15px; padding: 0;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s, color .15s;
        }
        #gladly-quick-switch button:hover { background: #1f2937; color: #fff; }
        #gladly-quick-switch button.gqs-active { background: #2563eb; color: #fff; }
      `;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);

      const wrap = document.createElement('div');
      wrap.id = 'gladly-quick-switch';
      wrap.appendChild(trackerBtn);
      wrap.appendChild(alertsBtn);
      document.body.appendChild(wrap);
    }

    // Anchor each panel under the toolbar pill as a whole (centered on its
    // full width), rather than under one small icon inside it. The toolbar
    // also contains the "Jump to view" dropdown, which is wide and sits to
    // the right of the icons — centering under just the icon made the panel
    // look shifted left relative to the pill the user actually sees.
    // Only one panel is ever visible at a time, so both can share this
    // anchor. Since the toolbar is the only thing you can drag, wire its
    // drag movement to reposition both anchored panels live so they follow.
    const toolbarEl = (trackerApi.getToolbarEl && trackerApi.getToolbarEl()) || null;
    if (monitorApi.setAnchorElement) monitorApi.setAnchorElement(toolbarEl || alertsBtn);
    if (trackerApi.setPanelAnchorElement) trackerApi.setPanelAnchorElement(toolbarEl || trackerBtn);
    if (trackerApi.setOnToolbarDrag) {
      trackerApi.setOnToolbarDrag(() => {
        if (monitorApi.repositionPanel) monitorApi.repositionPanel();
        if (trackerApi.repositionPanel) trackerApi.repositionPanel();
      });
    }

    function refresh() {
      const trackerOn = trackerApi.isTrackerVisible();
      const alertsOn = monitorApi.isAlertPanelsVisible();
      trackerBtn.classList.toggle('gqs-active', trackerOn);
      alertsBtn.classList.toggle('gqs-active', alertsOn);
      trackerBtn.title = trackerOn ? 'Hide SLA Tracker' : 'Show SLA Tracker (hides alerts)';
      alertsBtn.title = alertsOn ? 'Hide Live Alerts' : 'Show Live Alerts (hides tracker)';
    }

    trackerBtn.addEventListener('click', () => {
      if (trackerApi.isTrackerVisible()) {
        trackerApi.hideTracker();
      } else {
        trackerApi.showTracker();
        monitorApi.hideAlerts();
        // SLA cards only exist on a conversation-list page, so jump there —
        // switching the panel without switching the page doesn't work.
        trackerApi.jumpToView({ label: 'New Email (Count)', path: NEW_EMAIL_COUNT_URL });
      }
      refresh();
    });

    alertsBtn.addEventListener('click', () => {
      if (monitorApi.isAlertPanelsVisible()) {
        monitorApi.hideAlerts();
      } else {
        monitorApi.showAlerts();
        trackerApi.hideTracker();
        // The liveboard monitor only reads data while the agent liveboard
        // page is actually loaded, so jump there too.
        trackerApi.jumpToView({ label: 'The Agent Liveboard', path: AGENT_LIVEBOARD_URL });
      }
      refresh();
    });

    refresh();
  }

  /************************************************************
   * BOOT
   ************************************************************/
  function boot() {
    const monitorApi = initLiveboardMonitor();
    const trackerApi = initSlaTracker();
    initQuickSwitch(monitorApi, trackerApi);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
