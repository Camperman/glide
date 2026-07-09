"use strict";
const electron = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const os = require("os");
const electronChromeExtensions = require("electron-chrome-extensions");
const electronChromeWebStore = require("electron-chrome-web-store");
const electronUpdater = require("electron-updater");
const CHROME_DIR = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
function countLinks(nodes) {
  let n = 0;
  for (const node of nodes) {
    if (node.type === "url") n++;
    else if (node.children) n += countLinks(node.children);
  }
  return n;
}
function listChromeProfiles() {
  if (!fs.existsSync(CHROME_DIR)) return [];
  const names = {};
  try {
    const localState = JSON.parse(fs.readFileSync(path.join(CHROME_DIR, "Local State"), "utf8"));
    const cache = localState?.profile?.info_cache ?? {};
    for (const key of Object.keys(cache)) names[key] = cache[key]?.name ?? key;
  } catch {
  }
  const profiles = [];
  for (const entry of fs.readdirSync(CHROME_DIR)) {
    const bookmarksPath = path.join(CHROME_DIR, entry, "Bookmarks");
    if (!fs.existsSync(bookmarksPath)) continue;
    let count = 0;
    try {
      const data = JSON.parse(fs.readFileSync(bookmarksPath, "utf8"));
      count = countLinks(data?.roots?.bookmark_bar?.children ?? []);
    } catch {
    }
    profiles.push({ dir: entry, name: names[entry] ?? entry, count });
  }
  return profiles.sort((a, b) => b.count - a.count);
}
function convert(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.type === "url" && node.url) {
      out.push({ type: "link", id: crypto.randomUUID(), title: node.name || node.url, url: node.url });
    } else if (node.type === "folder") {
      out.push({
        type: "folder",
        id: crypto.randomUUID(),
        title: node.name || "Folder",
        children: convert(node.children ?? [])
      });
    }
  }
  return out;
}
function readChromeBookmarkBar(dir) {
  const data = JSON.parse(fs.readFileSync(path.join(CHROME_DIR, dir, "Bookmarks"), "utf8"));
  return convert(data?.roots?.bookmark_bar?.children ?? []);
}
const SIDEBAR_WIDTH = 64;
const APP_RAIL_WIDTH = 84;
const TITLE_BAR_HEIGHT = 38;
const TOP_BAR_HEIGHT = 44;
const BOOKMARKS_BAR_HEIGHT = 36;
const FIND_BAR_HEIGHT = 36;
const CONTENT_INSET = 8;
const CONTENT_RADIUS = 10;
const NEW_TAB_URL = "https://www.google.com";
const DISCARD_IDLE_MS = 30 * 60 * 1e3;
const DISCARD_SWEEP_MS = 5 * 60 * 1e3;
function defaultShortcuts() {
  return [
    { label: "Mail", url: "https://mail.google.com" },
    { label: "Calendar", url: "https://calendar.google.com" },
    { label: "Drive", url: "https://drive.google.com" },
    { label: "Docs", url: "https://docs.google.com" },
    { label: "Sheets", url: "https://sheets.google.com" },
    { label: "Meet", url: "https://meet.google.com" },
    { label: "Contacts", url: "https://contacts.google.com" },
    { label: "Passwords", url: "https://passwords.google.com" }
  ].map((s) => ({ id: crypto.randomUUID(), ...s }));
}
const GRANTED_PERMISSIONS = /* @__PURE__ */ new Set([
  "notifications",
  "media",
  "mediaKeySystem",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
  "pointerLock"
]);
const SENSITIVE_PERMISSIONS = /* @__PURE__ */ new Set(["media", "clipboard-read"]);
const TRUSTED_MEDIA_SUFFIXES = [".google.com", ".googleusercontent.com", ".youtube.com"];
function isTrustedMediaOrigin(url) {
  try {
    const host = new URL(url).hostname;
    return TRUSTED_MEDIA_SUFFIXES.some((s) => host.endsWith(s) || host === s.slice(1));
  } catch {
    return false;
  }
}
const SAFE_EXTERNAL_SCHEMES = /* @__PURE__ */ new Set([
  "mailto",
  "tel",
  "sms",
  "facetime",
  "facetime-audio",
  "zoommtg",
  "msteams",
  "slack",
  "spotify"
]);
function openExternalSafe(url) {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (match && SAFE_EXTERNAL_SCHEMES.has(match[1].toLowerCase())) {
    void electron.shell.openExternal(url).catch(() => {
    });
  }
}
const NOTIFICATION_CLICK_SENTINEL = "__FLIT_NOTIFICATION_CLICK__";
const NOTIFICATION_HOOK_SCRIPT = `(() => {
  if (window.__flitNotifHook) return
  window.__flitNotifHook = true
  const Native = window.Notification
  if (!Native) return
  const Wrapped = function (title, options) {
    const n = new Native(title, options)
    try {
      n.addEventListener('click', () => console.log('${NOTIFICATION_CLICK_SENTINEL}'))
    } catch {}
    return n
  }
  Wrapped.prototype = Native.prototype
  try {
    Object.defineProperty(Wrapped, 'permission', { get: () => Native.permission })
    Wrapped.requestPermission = Native.requestPermission.bind(Native)
    Object.defineProperty(Wrapped, 'maxActions', { get: () => Native.maxActions })
  } catch {}
  window.Notification = Wrapped
})()`;
const AVATAR_SCRIPT = `(() => {
  const sels = [
    'a[aria-label*="Google Account"] img',
    'a[href^="https://accounts.google.com/SignOutOptions"] img',
    'img.gbii', 'img.gb_P'
  ]
  for (const s of sels) {
    const el = document.querySelector(s)
    if (el && el.src && el.src.indexOf('http') === 0) return el.src
  }
  return null
})()`;
function partitionFor(id) {
  if (id.startsWith("incognito-")) return id;
  return `persist:account-${id}`;
}
function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
const SEARCH_URLS = {
  google: "https://www.google.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q="
};
function resolveQuery(input, engine = "google") {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  const looksLikeUrl2 = !/\s/.test(trimmed) && (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(trimmed) || /^[^\s/.]+\.[^\s/.]+/.test(trimmed));
  if (looksLikeUrl2) return `https://${trimmed}`;
  return SEARCH_URLS[engine] + encodeURIComponent(trimmed);
}
function parseUnread(title) {
  const match = title.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
function isExternalProtocol(url) {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (!match) return false;
  const scheme = match[1].toLowerCase();
  return !["http", "https", "about", "blob", "data", "file", "chrome", "devtools", "filesystem"].includes(
    scheme
  );
}
const KNOWN_BROWSERS = [
  { label: "Safari", app: "Safari" },
  { label: "Google Chrome", app: "Google Chrome" },
  { label: "Google Chrome Canary", app: "Google Chrome Canary" },
  { label: "Microsoft Edge", app: "Microsoft Edge" },
  { label: "Firefox", app: "Firefox" },
  { label: "Brave Browser", app: "Brave Browser" },
  { label: "Arc", app: "Arc" },
  { label: "Opera", app: "Opera" },
  { label: "Vivaldi", app: "Vivaldi" }
];
let installedBrowsersCache;
function installedBrowsers() {
  if (installedBrowsersCache) return installedBrowsersCache;
  const roots = ["/Applications", `${os.homedir()}/Applications`];
  installedBrowsersCache = KNOWN_BROWSERS.filter(
    (b) => roots.some((root) => fs.existsSync(`${root}/${b.app}.app`))
  );
  return installedBrowsersCache;
}
function openInBrowser(app2, url) {
  if (!/^https?:\/\//i.test(url)) return;
  child_process.execFile("open", ["-a", app2, url], () => {
  });
}
function findLink(nodes, id) {
  for (const node of nodes) {
    if (node.type === "link" && node.id === id) return node;
    if (node.type === "folder") {
      const nested = findLink(node.children, id);
      if (nested) return nested;
    }
  }
  return void 0;
}
function findLinkByUrl(nodes, url) {
  for (const node of nodes) {
    if (node.type === "link" && node.url === url) return node;
    if (node.type === "folder") {
      const nested = findLinkByUrl(node.children, url);
      if (nested) return nested;
    }
  }
  return void 0;
}
function removeNode(nodes, id) {
  return nodes.filter((n) => n.id !== id).map((n) => n.type === "folder" ? { ...n, children: removeNode(n.children, id) } : n);
}
function findFolder(nodes, id) {
  for (const node of nodes) {
    if (node.type === "folder") {
      if (node.id === id) return node;
      const nested = findFolder(node.children, id);
      if (nested) return nested;
    }
  }
  return void 0;
}
class AccountManager {
  constructor(onState, downloads, extensions, history) {
    this.downloads = downloads;
    this.extensions = extensions;
    this.history = history;
    this.onState = onState;
    const timer = setInterval(() => this.discardIdle(), DISCARD_SWEEP_MS);
    timer.unref?.();
  }
  onState;
  accounts = /* @__PURE__ */ new Map();
  order = [];
  windows = /* @__PURE__ */ new Map();
  zoomFactor = 1;
  railLayout = "left";
  bookmarksBar = false;
  newTabUrl = NEW_TAB_URL;
  searchEngine = "google";
  // ---- metadata loading -------------------------------------------------
  loadMetadata(configs) {
    for (const config of configs) this.addMeta(config);
  }
  addMeta(config) {
    const ses = electron.session.fromPartition(partitionFor(config.id));
    this.downloads?.attach(ses, config.id);
    if (!config.ephemeral) this.extensions?.attach(ses, config.id);
    const allowed = (permission, requestingUrl) => {
      if (permission === "notifications" && this.accounts.get(config.id)?.muted) return false;
      if (SENSITIVE_PERMISSIONS.has(permission) && !isTrustedMediaOrigin(requestingUrl)) {
        return false;
      }
      return GRANTED_PERMISSIONS.has(permission);
    };
    ses.setPermissionRequestHandler(
      (wc, permission, callback, details) => callback(allowed(permission, details.requestingUrl ?? wc?.getURL() ?? ""))
    );
    ses.setPermissionCheckHandler(
      (_wc, permission, requestingOrigin) => allowed(permission, requestingOrigin)
    );
    ses.setDisplayMediaRequestHandler(
      (_request, callback) => {
        electron.desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => callback(sources.length ? { video: sources[0] } : {})).catch(() => callback({}));
      },
      { useSystemPicker: true }
    );
    const meta = {
      id: config.id,
      label: config.label,
      color: config.color,
      homeUrl: config.homeUrl,
      lastUrl: config.lastUrl ?? config.homeUrl,
      shortcuts: config.shortcuts && config.shortcuts.length > 0 ? config.shortcuts : defaultShortcuts(),
      bookmarks: config.bookmarks ?? [],
      avatarUrl: config.avatarUrl,
      muted: config.muted,
      savedTabs: config.tabs,
      ephemeral: config.ephemeral
    };
    this.accounts.set(meta.id, meta);
    if (!this.order.includes(meta.id)) this.order.push(meta.id);
    return meta;
  }
  // ---- window lifecycle -------------------------------------------------
  /** Register a new BrowserWindow: build its views and wire its handlers. */
  registerWindow(win, defaultActiveId) {
    const eager = this.windows.size === 0;
    const ws = {
      win,
      overlayOpen: false,
      findOpen: false,
      recentlyClosed: [],
      perAccount: /* @__PURE__ */ new Map()
    };
    this.windows.set(win.id, ws);
    win.on("resize", () => this.layout(ws));
    win.on("closed", () => this.unregisterWindow(win.id));
    if (eager) {
      for (const id of this.order) this.ensureLoaded(ws, id);
    }
    const initial = defaultActiveId && this.accounts.has(defaultActiveId) ? defaultActiveId : this.order[0];
    if (initial) this.setActive(win, initial);
  }
  unregisterWindow(winId) {
    const ws = this.windows.get(winId);
    if (!ws) return;
    if (this.allWindows()[0] === ws) {
      for (const [accountId, wa] of ws.perAccount) {
        const meta = this.accounts.get(accountId);
        if (meta && wa.tabs.length > 0) {
          meta.savedTabs = wa.tabs.filter((t) => /^https?:\/\//i.test(t.currentUrl)).map((t) => ({
            url: t.currentUrl,
            originShortcutId: t.originShortcutId,
            active: t.id === wa.activeTabId || void 0
          }));
        }
      }
    }
    for (const wa of ws.perAccount.values()) {
      for (const tab of wa.tabs) if (tab.view) this.destroyView(ws, tab.view);
    }
    this.windows.delete(winId);
  }
  wsFor(win) {
    return this.windows.get(win.id);
  }
  allWindows() {
    return [...this.windows.values()];
  }
  // ---- per-window tab/view management -----------------------------------
  accountState(ws, accountId) {
    let wa = ws.perAccount.get(accountId);
    if (!wa) {
      wa = { tabs: [], activeTabId: void 0, unreadByApp: {} };
      ws.perAccount.set(accountId, wa);
    }
    return wa;
  }
  /** Ensure this window has the account's tabs loaded: the tab set saved at
   *  last quit when available (only the active one gets a live view — the
   *  rest materialize on first activation), else a single last-URL tab. */
  ensureLoaded(ws, accountId) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    const wa = this.accountState(ws, accountId);
    if (wa.tabs.length > 0) return;
    const saved = meta.savedTabs?.filter((t) => /^https?:\/\//i.test(t.url));
    if (saved && saved.length > 0) {
      for (const s of saved) {
        wa.tabs.push({
          id: crypto.randomUUID(),
          currentUrl: s.url,
          title: hostOf(s.url),
          originShortcutId: s.originShortcutId,
          lastActive: Date.now()
        });
      }
      const activeIndex = Math.max(
        0,
        saved.findIndex((s) => s.active)
      );
      const active = wa.tabs[activeIndex];
      wa.activeTabId = active.id;
      this.createView(ws, accountId, active);
      return;
    }
    const restoreUrl = meta.lastUrl || meta.homeUrl;
    const origin = meta.shortcuts.find((s) => hostOf(s.url) === hostOf(restoreUrl))?.id;
    const tab = this.openTab(ws, accountId, restoreUrl, origin);
    wa.activeTabId = tab.id;
  }
  openTab(ws, accountId, url, originShortcutId) {
    const tab = {
      id: crypto.randomUUID(),
      currentUrl: url,
      title: "",
      originShortcutId,
      lastActive: Date.now()
    };
    this.createView(ws, accountId, tab);
    this.accountState(ws, accountId).tabs.push(tab);
    return tab;
  }
  /** Build (or rebuild, after a discard) the live view for a tab record. */
  createView(ws, accountId, tab) {
    const part = partitionFor(accountId);
    const view = new electron.WebContentsView({
      webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false }
    });
    view.setBackgroundColor("#ffffff");
    view.setBorderRadius(CONTENT_RADIUS);
    const wc = view.webContents;
    tab.view = view;
    this.extensions?.addTab(accountId, wc, ws.win);
    const isActiveTab = () => ws.activeAccountId === accountId && this.accountState(ws, accountId).activeTabId === tab.id;
    wc.on("did-finish-load", () => {
      wc.setZoomFactor(this.zoomFactor);
      void wc.executeJavaScript(NOTIFICATION_HOOK_SCRIPT, true).catch(() => {
      });
      this.extractAvatar(accountId, wc);
      setTimeout(() => this.extractAvatar(accountId, wc), 2e3);
    });
    wc.on("audio-state-changed", (event) => {
      tab.audible = event.audible;
      this.emitTabs(ws, accountId);
      this.emitApps(ws, accountId);
    });
    wc.on("update-target-url", (_e, url) => {
      if (isActiveTab() && !ws.win.isDestroyed()) {
        ws.win.webContents.send("nav:target-url", url);
      }
    });
    if (tab.muted) wc.setAudioMuted(true);
    wc.on("render-process-gone", (_e, details) => {
      if (details.reason === "clean-exit" || details.reason === "killed") return;
      const now = Date.now();
      tab.crashTimes = (tab.crashTimes ?? []).filter((t) => now - t < 6e4);
      if (tab.crashTimes.length >= 2) return;
      tab.crashTimes.push(now);
      if (!wc.isDestroyed()) wc.reload();
    });
    wc.on("found-in-page", (_e, result) => {
      if (isActiveTab() && !ws.win.isDestroyed()) {
        ws.win.webContents.send("find:result", {
          matches: result.matches,
          activeMatchOrdinal: result.activeMatchOrdinal
        });
      }
    });
    wc.on("console-message", (_e, _level, message) => {
      if (message !== NOTIFICATION_CLICK_SENTINEL) return;
      this.accountState(ws, accountId).activeTabId = tab.id;
      this.setActiveWs(ws, accountId);
      if (ws.win.isDestroyed()) return;
      if (ws.win.isMinimized()) ws.win.restore();
      ws.win.show();
      ws.win.focus();
    });
    const onNav = () => {
      tab.currentUrl = wc.getURL();
      const meta = this.accounts.get(accountId);
      if (meta) meta.lastUrl = tab.currentUrl;
      if (!meta?.ephemeral) this.history?.record(accountId, tab.currentUrl, wc.getTitle());
      this.onState?.();
      if (isActiveTab()) this.emitNav(ws);
    };
    wc.on("did-navigate", onNav);
    wc.on("did-navigate-in-page", (_e, _u, isMainFrame) => {
      if (isMainFrame) onNav();
    });
    wc.on("page-title-updated", (_e, title) => {
      tab.title = title;
      if (!this.accounts.get(accountId)?.ephemeral) {
        this.history?.title(accountId, tab.currentUrl, title);
      }
      const wa = this.accountState(ws, accountId);
      if (tab.originShortcutId) {
        const count = parseUnread(title);
        if (wa.unreadByApp[tab.originShortcutId] !== count) {
          wa.unreadByApp[tab.originShortcutId] = count;
          this.emitUnread(ws, accountId);
          if (ws.activeAccountId === accountId) this.emitApps(ws, accountId);
        }
      }
      if (ws.activeAccountId === accountId) this.emitTabs(ws, accountId);
      if (isActiveTab()) this.emitNav(ws);
    });
    wc.on("page-favicon-updated", (_e, favicons) => {
      const icon = favicons[0];
      if (!icon || icon === tab.favicon) return;
      tab.favicon = icon;
      if (tab.originShortcutId) {
        const meta = this.accounts.get(accountId);
        const shortcut = meta?.shortcuts.find((s) => s.id === tab.originShortcutId);
        if (shortcut && shortcut.favicon !== icon) {
          shortcut.favicon = icon;
          this.onState?.();
          this.broadcastShortcuts(accountId);
        }
      }
      if (ws.activeAccountId === accountId) {
        this.emitTabs(ws, accountId);
        this.emitApps(ws, accountId);
      }
    });
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (isExternalProtocol(url)) {
        openExternalSafe(url);
        return { action: "deny" };
      }
      if (disposition === "foreground-tab" || disposition === "background-tab") {
        this.openLinkTab(ws, accountId, url, disposition === "background-tab");
        return { action: "deny" };
      }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false }
        }
      };
    });
    wc.on("context-menu", (_e, params) => {
      const items = [];
      const link = params.linkURL;
      if (link) {
        items.push(
          { label: "Open Link in New Tab", click: () => this.openLinkTab(ws, accountId, link, false) },
          { label: "Open Link in New Window", click: () => this.openLinkInNewWindow(accountId, link) }
        );
        const browsers = installedBrowsers();
        if (browsers.length > 0) {
          items.push({
            label: "Open Link in Browser",
            submenu: browsers.map((b) => ({
              label: b.label,
              click: () => openInBrowser(b.app, link)
            }))
          });
        }
        items.push(
          { label: "Copy Link", click: () => electron.clipboard.writeText(link) },
          { type: "separator" }
        );
      }
      if (params.mediaType === "image" && params.srcURL) {
        items.push(
          {
            label: "Open Image in New Tab",
            click: () => this.openLinkTab(ws, accountId, params.srcURL, false)
          },
          { label: "Save Image", click: () => wc.downloadURL(params.srcURL) },
          { label: "Copy Image", click: () => wc.copyImageAt(params.x, params.y) },
          { type: "separator" }
        );
      }
      if (params.misspelledWord) {
        for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
          items.push({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) });
        }
        items.push(
          {
            label: "Add to Dictionary",
            click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
          },
          { type: "separator" }
        );
      }
      if (params.isEditable) {
        items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" });
      } else if (params.selectionText) {
        const selection = params.selectionText.trim();
        const shown = selection.length > 30 ? `${selection.slice(0, 30)}…` : selection;
        items.push({ role: "copy" }, {
          label: `Search for “${shown}”`,
          click: () => this.openLinkTab(ws, accountId, resolveQuery(selection, this.searchEngine), false)
        });
      }
      if (items.length === 0) {
        items.push(
          {
            label: "Back",
            enabled: wc.navigationHistory.canGoBack(),
            click: () => wc.navigationHistory.goBack()
          },
          { label: "Reload", click: () => wc.reload() }
        );
      }
      electron.Menu.buildFromTemplate(items).popup({ window: ws.win });
    });
    wc.on("did-create-window", (child) => {
      let sawAuth = false;
      const check = (_e, navUrl) => {
        if (navUrl.includes("accounts.google.com")) sawAuth = true;
      };
      child.webContents.on("did-navigate", check);
      child.webContents.on("did-navigate-in-page", check);
      child.on("closed", () => {
        if (sawAuth && !wc.isDestroyed()) wc.reload();
      });
    });
    wc.on("will-navigate", (e, url) => {
      if (isExternalProtocol(url)) {
        e.preventDefault();
        openExternalSafe(url);
      }
    });
    view.setVisible(false);
    ws.win.contentView.addChildView(view);
    void wc.loadURL(tab.currentUrl);
  }
  /** Ensure the active tab has a live view (rebuild if discarded) and mark used. */
  materializeActive(ws) {
    if (!ws.activeAccountId) return;
    const wa = ws.perAccount.get(ws.activeAccountId);
    if (!wa?.activeTabId) return;
    const tab = wa.tabs.find((t) => t.id === wa.activeTabId);
    if (!tab) return;
    if (!tab.view) this.createView(ws, ws.activeAccountId, tab);
    tab.lastActive = Date.now();
  }
  /** Unload background views idle longer than the threshold to reclaim memory. */
  discardIdle() {
    const now = Date.now();
    for (const ws of this.allWindows()) {
      const visibleTabId = ws.activeAccountId ? ws.perAccount.get(ws.activeAccountId)?.activeTabId : void 0;
      for (const [accountId, wa] of ws.perAccount) {
        for (const tab of wa.tabs) {
          const visible = accountId === ws.activeAccountId && tab.id === visibleTabId;
          if (visible) {
            tab.lastActive = now;
            continue;
          }
          if (tab.view && now - tab.lastActive > DISCARD_IDLE_MS) {
            this.destroyView(ws, tab.view);
            tab.view = void 0;
          }
        }
      }
    }
  }
  /** Browsing-related preferences pushed from the prefs manager. */
  setBrowsingPrefs(prefs2) {
    this.newTabUrl = normalizeUrl(prefs2.newTabUrl) || NEW_TAB_URL;
    this.searchEngine = prefs2.searchEngine;
  }
  newTab(win, accountId) {
    const ws = this.wsFor(win);
    if (!ws) return;
    const tab = this.openTab(ws, accountId, this.newTabUrl);
    this.accountState(ws, accountId).activeTabId = tab.id;
    this.afterTabChange(ws, accountId);
  }
  /** Open a clicked link as a tab (foreground unless it's a background-tab open). */
  openLinkTab(ws, accountId, url, background) {
    const tab = this.openTab(ws, accountId, url);
    if (!background) this.accountState(ws, accountId).activeTabId = tab.id;
    this.afterTabChange(ws, accountId);
  }
  /** Open a link in its own bare window (right-click → Open in New Window). */
  openLinkInNewWindow(accountId, url) {
    const win = new electron.BrowserWindow({
      width: 1e3,
      height: 760,
      webPreferences: {
        partition: partitionFor(accountId),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    void win.loadURL(url);
  }
  activateTab(win, accountId, tabId) {
    const ws = this.wsFor(win);
    if (!ws) return;
    const wa = this.accountState(ws, accountId);
    if (!wa.tabs.some((t) => t.id === tabId)) return;
    wa.activeTabId = tabId;
    this.afterTabChange(ws, accountId);
  }
  reorderTabs(win, accountId, tabIds) {
    const ws = this.wsFor(win);
    if (!ws) return;
    const wa = this.accountState(ws, accountId);
    const byId = new Map(wa.tabs.map((t) => [t.id, t]));
    const next = [];
    for (const id of tabIds) {
      const tab = byId.get(id);
      if (tab) next.push(tab);
    }
    for (const tab of wa.tabs) if (!tabIds.includes(tab.id)) next.push(tab);
    if (next.length !== wa.tabs.length) return;
    wa.tabs = next;
    this.emitTabs(ws, accountId);
  }
  closeTab(win, accountId, tabId) {
    const ws = this.wsFor(win);
    if (!ws) return;
    const wa = this.accountState(ws, accountId);
    const index = wa.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;
    const closing = wa.tabs[index];
    ws.recentlyClosed.push({
      accountId,
      url: closing.currentUrl,
      originShortcutId: closing.originShortcutId
    });
    if (ws.recentlyClosed.length > 25) ws.recentlyClosed.shift();
    const view = closing.view;
    if (view) this.destroyView(ws, view);
    wa.tabs.splice(index, 1);
    if (wa.activeTabId === tabId) {
      const neighbour = wa.tabs[index] ?? wa.tabs[index - 1];
      wa.activeTabId = neighbour?.id;
    }
    this.afterTabChange(ws, accountId);
  }
  openShortcut(win, accountId, shortcutId) {
    const ws = this.wsFor(win);
    const meta = this.accounts.get(accountId);
    if (!ws || !meta) return;
    const shortcut = meta.shortcuts.find((s) => s.id === shortcutId);
    if (!shortcut) return;
    const wa = this.accountState(ws, accountId);
    const existing = wa.tabs.find((t) => t.originShortcutId === shortcutId);
    if (existing) {
      wa.activeTabId = existing.id;
    } else {
      const tab = this.openTab(ws, accountId, shortcut.url, shortcutId);
      wa.activeTabId = tab.id;
    }
    this.afterTabChange(ws, accountId);
  }
  // ---- menu-driven tab operations (act on the focused window) -----------
  newTabInActive(win) {
    const ws = this.wsFor(win);
    if (ws?.activeAccountId) this.newTab(win, ws.activeAccountId);
  }
  /** Cmd-W: close the active tab. The account keeps its last tab (accounts
   *  are workspaces, not disposable windows) — closing the only tab no-ops. */
  closeActiveTab(win) {
    const ws = this.wsFor(win);
    if (!ws?.activeAccountId) return;
    const wa = ws.perAccount.get(ws.activeAccountId);
    if (!wa?.activeTabId || wa.tabs.length <= 1) return;
    this.closeTab(win, ws.activeAccountId, wa.activeTabId);
  }
  reopenClosedTab(win) {
    const ws = this.wsFor(win);
    if (!ws) return;
    let closed;
    while (closed = ws.recentlyClosed.pop()) {
      if (this.accounts.has(closed.accountId)) break;
    }
    if (!closed) return;
    const tab = this.openTab(ws, closed.accountId, closed.url, closed.originShortcutId);
    this.accountState(ws, closed.accountId).activeTabId = tab.id;
    this.setActiveWs(ws, closed.accountId);
    this.afterTabChange(ws, closed.accountId);
  }
  /** Ctrl-Tab / Cmd-Shift-]: cycle through the active account's tabs. */
  cycleTab(win, delta) {
    const ws = this.wsFor(win);
    if (!ws?.activeAccountId) return;
    const wa = ws.perAccount.get(ws.activeAccountId);
    if (!wa || wa.tabs.length < 2) return;
    const index = wa.tabs.findIndex((t) => t.id === wa.activeTabId);
    const next = wa.tabs[(index + delta + wa.tabs.length) % wa.tabs.length];
    this.activateTab(win, ws.activeAccountId, next.id);
  }
  printActive(win) {
    this.activeWc(win)?.print();
  }
  // ---- find in page ------------------------------------------------------
  /** Cmd-F: reserve a chrome row for the find bar and tell the renderer. */
  openFind(win) {
    const ws = this.wsFor(win);
    if (!ws || ws.findOpen) {
      if (ws && !ws.win.isDestroyed()) ws.win.webContents.send("find:open");
      return;
    }
    ws.findOpen = true;
    this.layout(ws);
    if (!ws.win.isDestroyed()) ws.win.webContents.send("find:open");
  }
  findInPage(win, text, next, forward) {
    const wc = this.activeWc(win);
    if (!wc) return;
    if (!text) {
      wc.stopFindInPage("clearSelection");
      return;
    }
    wc.findInPage(text, { findNext: next, forward });
  }
  closeFind(win) {
    const ws = this.wsFor(win);
    if (!ws || !ws.findOpen) return;
    ws.findOpen = false;
    this.activeWc(win)?.stopFindInPage("clearSelection");
    this.layout(ws);
    this.activeWc(win)?.focus();
    if (!ws.win.isDestroyed()) ws.win.webContents.send("find:close");
  }
  /** Open a link sent to Flit by macOS (default-browser open-url). Lands as a
   *  foreground tab in the focused window's active account. */
  openUrlInActiveAccount(url) {
    if (!/^https?:\/\//i.test(url)) return;
    const ws = this.allWindows().find((w) => !w.win.isDestroyed() && w.win.isFocused()) ?? this.allWindows()[0];
    if (!ws) return;
    const accountId = ws.activeAccountId ?? this.order[0];
    if (!accountId) return;
    const tab = this.openTab(ws, accountId, url);
    this.accountState(ws, accountId).activeTabId = tab.id;
    this.setActiveWs(ws, accountId);
    this.afterTabChange(ws, accountId);
    if (ws.win.isMinimized()) ws.win.restore();
    ws.win.show();
    ws.win.focus();
  }
  // ---- ExtensionTabDelegate (chrome.tabs.* reaching into our tab model) --
  /** Find which window/account/tab a WebContents belongs to. */
  findTab(wc) {
    for (const ws of this.allWindows()) {
      for (const [accountId, wa] of ws.perAccount) {
        const tab = wa.tabs.find((t) => t.view?.webContents === wc);
        if (tab) return { ws, accountId, tab };
      }
    }
    return void 0;
  }
  openExtensionTab(accountId, url) {
    const ws = this.allWindows().find((w) => !w.win.isDestroyed() && w.win.isFocused()) ?? this.allWindows()[0];
    if (!ws || !this.accounts.has(accountId)) return void 0;
    const tab = this.openTab(ws, accountId, url);
    this.accountState(ws, accountId).activeTabId = tab.id;
    this.setActiveWs(ws, accountId);
    this.afterTabChange(ws, accountId);
    return tab.view ? [tab.view.webContents, ws.win] : void 0;
  }
  selectExtensionTab(wc) {
    const found = this.findTab(wc);
    if (!found) return;
    this.accountState(found.ws, found.accountId).activeTabId = found.tab.id;
    this.setActiveWs(found.ws, found.accountId);
    this.afterTabChange(found.ws, found.accountId);
  }
  closeExtensionTab(wc) {
    const found = this.findTab(wc);
    if (found) this.closeTab(found.ws.win, found.accountId, found.tab.id);
  }
  afterTabChange(ws, accountId) {
    if (ws.activeAccountId === accountId) {
      this.refreshVisibility(ws);
      this.layout(ws);
      this.emitNav(ws);
      this.emitApps(ws, accountId);
    }
    this.emitTabs(ws, accountId);
    this.onState?.();
  }
  destroyView(ws, view) {
    try {
      ws.win.contentView.removeChildView(view);
    } catch {
    }
    try {
      ;
      view.webContents.destroy?.();
    } catch {
    }
  }
  // ---- account metadata mutations (broadcast to all windows) ------------
  addAccount(input) {
    const id = crypto.randomUUID();
    this.addMeta({
      id,
      label: input.label.trim() || "Account",
      color: input.color || "#888888",
      homeUrl: normalizeUrl(input.homeUrl) || "https://mail.google.com"
    });
    for (const ws of this.allWindows()) {
      this.ensureLoaded(ws, id);
      this.setActiveWs(ws, id);
    }
    this.broadcastUpdated();
    this.onState?.();
    return id;
  }
  /** Cmd-Shift-N: an ephemeral "Incognito" session in the sidebar. Memory-only
   *  partition, no history, no extensions, never persisted — gone on quit or
   *  right-click → Remove. */
  createIncognito(win) {
    const id = `incognito-${crypto.randomUUID()}`;
    this.addMeta({
      id,
      label: "Incognito",
      color: "#5f6368",
      homeUrl: "https://www.google.com",
      ephemeral: true
    });
    for (const ws of this.allWindows()) this.ensureLoaded(ws, id);
    this.setActive(win, id);
    this.broadcastUpdated();
  }
  updateAccount(id, patch) {
    const meta = this.accounts.get(id);
    if (!meta) return;
    if (patch.label !== void 0) meta.label = patch.label.trim() || meta.label;
    if (patch.color !== void 0) meta.color = patch.color;
    if (patch.muted !== void 0) meta.muted = patch.muted;
    this.broadcastUpdated();
    this.onState?.();
  }
  async removeAccount(id) {
    if (!this.accounts.has(id)) return;
    this.history?.removeAccount(id);
    for (const ws of this.allWindows()) {
      const wa = ws.perAccount.get(id);
      if (wa) {
        for (const tab of wa.tabs) if (tab.view) this.destroyView(ws, tab.view);
        ws.perAccount.delete(id);
      }
      if (ws.activeAccountId === id) {
        ws.activeAccountId = void 0;
        const next = this.order.find((x) => x !== id);
        if (next) this.setActiveWs(ws, next);
      }
    }
    this.accounts.delete(id);
    this.order = this.order.filter((x) => x !== id);
    try {
      await electron.session.fromPartition(partitionFor(id)).clearStorageData();
    } catch {
    }
    this.broadcastUpdated();
    this.onState?.();
  }
  // ---- active account (per window) --------------------------------------
  setActive(win, id) {
    const ws = this.wsFor(win);
    if (!ws) return;
    this.setActiveWs(ws, id);
  }
  setActiveWs(ws, id) {
    if (!this.accounts.has(id)) return;
    if (ws.findOpen && ws.activeAccountId !== id) this.closeFind(ws.win);
    this.ensureLoaded(ws, id);
    ws.activeAccountId = id;
    this.refreshVisibility(ws);
    this.layout(ws);
    if (!ws.win.isDestroyed()) ws.win.webContents.send("accounts:active-changed", id);
    this.emitNav(ws);
    this.emitTabs(ws, id);
    this.emitApps(ws, id);
    this.onState?.();
  }
  getActiveId(win) {
    return this.wsFor(win)?.activeAccountId;
  }
  setActiveByIndex(win, index) {
    const id = this.order[index];
    if (id) this.setActive(win, id);
  }
  setOverlayOpen(win, open) {
    const ws = this.wsFor(win);
    if (!ws) return;
    ws.overlayOpen = open;
    this.refreshVisibility(ws);
  }
  // ---- settings (global, applied to all windows) ------------------------
  getZoom() {
    return this.zoomFactor;
  }
  setZoom(factor) {
    this.zoomFactor = Math.round(Math.min(3, Math.max(0.3, factor)) * 100) / 100;
    for (const ws of this.allWindows()) {
      for (const wa of ws.perAccount.values()) {
        for (const tab of wa.tabs) tab.view?.webContents.setZoomFactor(this.zoomFactor);
      }
    }
    this.onState?.();
  }
  zoomIn() {
    this.setZoom(this.zoomFactor + 0.1);
  }
  zoomOut() {
    this.setZoom(this.zoomFactor - 0.1);
  }
  zoomReset() {
    this.setZoom(1);
  }
  getLayout() {
    return this.railLayout;
  }
  setLayout(layout) {
    this.railLayout = layout;
    for (const ws of this.allWindows()) {
      this.layout(ws);
      if (!ws.win.isDestroyed()) ws.win.webContents.send("layout:changed", layout);
    }
    this.onState?.();
  }
  getBookmarksBarVisible() {
    return this.bookmarksBar;
  }
  setBookmarksBarVisible(visible) {
    this.bookmarksBar = visible;
    for (const ws of this.allWindows()) {
      this.layout(ws);
      if (!ws.win.isDestroyed()) ws.win.webContents.send("bookmarks:visible", visible);
    }
    this.onState?.();
  }
  // ---- bookmarks (metadata; folders open per-window) --------------------
  getBookmarks(accountId) {
    return this.accounts.get(accountId)?.bookmarks ?? [];
  }
  openBookmark(win, accountId, url) {
    const ws = this.wsFor(win);
    if (!ws) return;
    const tab = this.openTab(ws, accountId, url);
    this.accountState(ws, accountId).activeTabId = tab.id;
    this.afterTabChange(ws, accountId);
  }
  openBookmarkFolder(win, accountId, folderId) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    const folder = findFolder(meta.bookmarks, folderId);
    if (!folder) return;
    electron.Menu.buildFromTemplate(this.bookmarkMenu(win, accountId, folder.children)).popup({ window: win });
  }
  /** Popup menu for bookmark-bar items that don't fit (the "More" » button). */
  openBookmarksOverflow(win, accountId, ids) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    const nodes = meta.bookmarks.filter((n) => ids.includes(n.id));
    if (nodes.length === 0) return;
    electron.Menu.buildFromTemplate(this.bookmarkMenu(win, accountId, nodes)).popup({ window: win });
  }
  bookmarkMenu(win, accountId, nodes) {
    if (nodes.length === 0) return [{ label: "(empty)", enabled: false }];
    return nodes.map(
      (node) => node.type === "folder" ? { label: node.title || "Folder", submenu: this.bookmarkMenu(win, accountId, node.children) } : { label: node.title || node.url, click: () => this.openBookmark(win, accountId, node.url) }
    );
  }
  /** Cmd-D: add the active page to this account's bookmarks bar (deduped). */
  bookmarkActivePage(win) {
    const ws = this.wsFor(win);
    const wc = this.activeWc(win);
    if (!ws?.activeAccountId || !wc) return;
    const meta = this.accounts.get(ws.activeAccountId);
    if (!meta) return;
    const url = wc.getURL();
    if (!/^https?:\/\//i.test(url)) return;
    if (findLinkByUrl(meta.bookmarks, url)) return;
    meta.bookmarks.push({
      type: "link",
      id: crypto.randomUUID(),
      title: wc.getTitle() || hostOf(url),
      url
    });
    this.broadcastBookmarks(ws.activeAccountId);
    this.onState?.();
  }
  updateBookmark(accountId, bookmarkId, patch) {
    const meta = this.accounts.get(accountId);
    const link = meta && findLink(meta.bookmarks, bookmarkId);
    if (!link) return;
    if (patch.title !== void 0) link.title = patch.title.trim() || link.title;
    if (patch.url !== void 0) link.url = normalizeUrl(patch.url) || link.url;
    this.broadcastBookmarks(accountId);
    this.onState?.();
  }
  removeBookmark(accountId, bookmarkId) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    meta.bookmarks = removeNode(meta.bookmarks, bookmarkId);
    this.broadcastBookmarks(accountId);
    this.onState?.();
  }
  /** Right-click on a bookmarks-bar link → Edit / Remove. */
  popupBookmarkMenu(win, accountId, bookmarkId) {
    const meta = this.accounts.get(accountId);
    if (!meta || !findLink(meta.bookmarks, bookmarkId)) return;
    electron.Menu.buildFromTemplate([
      {
        label: "Edit",
        click: () => win.webContents.send("menu:edit-bookmark", { accountId, bookmarkId })
      },
      { type: "separator" },
      { label: "Remove", click: () => this.removeBookmark(accountId, bookmarkId) }
    ]).popup({ window: win });
  }
  getChromeProfiles() {
    try {
      return listChromeProfiles();
    } catch {
      return [];
    }
  }
  importChromeBookmarks(accountId, chromeDir) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    try {
      meta.bookmarks = readChromeBookmarkBar(chromeDir);
    } catch {
      return;
    }
    this.broadcastBookmarks(accountId);
    this.onState?.();
  }
  // ---- navigation (per window, acts on active tab) ----------------------
  activeTab(ws) {
    if (!ws.activeAccountId) return void 0;
    const wa = ws.perAccount.get(ws.activeAccountId);
    if (!wa?.activeTabId) return void 0;
    return wa.tabs.find((t) => t.id === wa.activeTabId);
  }
  activeWc(win) {
    const ws = this.wsFor(win);
    return ws ? this.activeTab(ws)?.view?.webContents : void 0;
  }
  goBack(win) {
    const wc = this.activeWc(win);
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }
  goForward(win) {
    const wc = this.activeWc(win);
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }
  reload(win) {
    this.activeWc(win)?.reload();
  }
  navigate(win, input) {
    const target = resolveQuery(input, this.searchEngine);
    if (target) void this.activeWc(win)?.loadURL(target);
  }
  getActiveNavState(win) {
    const ws = this.wsFor(win);
    if (!ws || !ws.activeAccountId) return null;
    const tab = this.activeTab(ws);
    if (!tab || !tab.view) return null;
    const wc = tab.view.webContents;
    return {
      accountId: ws.activeAccountId,
      tabId: tab.id,
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      title: wc.getTitle()
    };
  }
  // ---- per-window state queries (for renderer fetch on mount) -----------
  getTabs(win, accountId) {
    const ws = this.wsFor(win);
    if (!ws) return [];
    const wa = ws.perAccount.get(accountId);
    if (!wa) return [];
    return wa.tabs.filter((t) => !t.originShortcutId).map((t) => ({
      id: t.id,
      title: t.title || hostOf(t.currentUrl) || "New tab",
      active: t.id === wa.activeTabId,
      favicon: t.favicon,
      shortcutId: t.originShortcutId,
      audible: t.audible,
      muted: t.muted
    }));
  }
  toggleTabMute(win, accountId, tabId) {
    const ws = this.wsFor(win);
    const tab = ws?.perAccount.get(accountId)?.tabs.find((t) => t.id === tabId);
    if (!ws || !tab) return;
    tab.muted = !tab.muted;
    tab.view?.webContents.setAudioMuted(tab.muted);
    this.emitTabs(ws, accountId);
  }
  getApps(win, accountId) {
    const meta = this.accounts.get(accountId);
    const ws = this.wsFor(win);
    if (!meta || !ws) return { apps: [] };
    const wa = ws.perAccount.get(accountId);
    const activeTab = wa?.tabs.find((t) => t.id === wa.activeTabId);
    const apps = meta.shortcuts.map((s) => ({
      id: s.id,
      label: s.label,
      favicon: s.favicon,
      unread: wa?.unreadByApp[s.id] ?? 0,
      audible: wa?.tabs.some((t) => t.originShortcutId === s.id && t.audible && !t.muted)
    }));
    return { apps, activeShortcutId: activeTab?.originShortcutId };
  }
  summaries() {
    return this.order.map((id) => {
      const meta = this.accounts.get(id);
      return {
        id: meta.id,
        label: meta.label,
        color: meta.color,
        avatarUrl: meta.avatarUrl,
        muted: meta.muted,
        ephemeral: meta.ephemeral
      };
    });
  }
  unreadAll(win) {
    const ws = this.wsFor(win);
    const out = {};
    for (const id of this.order) out[id] = ws ? this.totalUnread(ws, id) : 0;
    return out;
  }
  totalUnread(ws, accountId) {
    const wa = ws.perAccount.get(accountId);
    if (!wa) return 0;
    return Object.values(wa.unreadByApp).reduce((a, b) => a + b, 0);
  }
  // ---- shortcuts (metadata; broadcast) ----------------------------------
  shortcutsFor(id) {
    return this.accounts.get(id)?.shortcuts ?? [];
  }
  addShortcut(id, input) {
    const meta = this.accounts.get(id);
    if (!meta) return;
    meta.shortcuts.push({
      id: crypto.randomUUID(),
      label: input.label.trim() || "Shortcut",
      url: normalizeUrl(input.url) || input.url
    });
    this.broadcastShortcuts(id);
    this.broadcastApps(id);
    this.onState?.();
  }
  updateShortcut(id, shortcutId, patch) {
    const shortcut = this.accounts.get(id)?.shortcuts.find((s) => s.id === shortcutId);
    if (!shortcut) return;
    if (patch.label !== void 0) shortcut.label = patch.label.trim() || shortcut.label;
    if (patch.url !== void 0) shortcut.url = normalizeUrl(patch.url) || shortcut.url;
    this.broadcastShortcuts(id);
    this.broadcastApps(id);
    this.onState?.();
  }
  reorderShortcuts(accountId, shortcutIds) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    const byId = new Map(meta.shortcuts.map((s) => [s.id, s]));
    const next = [];
    for (const id of shortcutIds) {
      const shortcut = byId.get(id);
      if (shortcut) next.push(shortcut);
    }
    for (const shortcut of meta.shortcuts) {
      if (!shortcutIds.includes(shortcut.id)) next.push(shortcut);
    }
    if (next.length !== meta.shortcuts.length) return;
    meta.shortcuts = next;
    this.broadcastShortcuts(accountId);
    this.broadcastApps(accountId);
    this.onState?.();
  }
  removeShortcut(id, shortcutId) {
    const meta = this.accounts.get(id);
    if (!meta) return;
    meta.shortcuts = meta.shortcuts.filter((s) => s.id !== shortcutId);
    for (const ws of this.allWindows()) {
      const wa = ws.perAccount.get(id);
      if (wa) delete wa.unreadByApp[shortcutId];
    }
    this.broadcastShortcuts(id);
    this.broadcastApps(id);
    for (const ws of this.allWindows()) this.emitUnread(ws, id);
    this.onState?.();
  }
  // ---- context menus (per window) ---------------------------------------
  popupAccountMenu(win, accountId) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    electron.Menu.buildFromTemplate([
      { label: "Edit", click: () => win.webContents.send("menu:edit-account", accountId) },
      {
        label: "Mute Notifications",
        type: "checkbox",
        checked: Boolean(meta.muted),
        click: () => this.updateAccount(accountId, { muted: !meta.muted })
      },
      { type: "separator" },
      { label: "Remove", click: () => void this.removeAccount(accountId) }
    ]).popup({ window: win });
  }
  /** Right-click on a tab in the strip. */
  popupTabMenu(win, accountId, tabId) {
    const ws = this.wsFor(win);
    const wa = ws?.perAccount.get(accountId);
    const tab = wa?.tabs.find((t) => t.id === tabId);
    if (!ws || !wa || !tab) return;
    electron.Menu.buildFromTemplate([
      {
        label: "Pin to Apps",
        enabled: /^https?:\/\//i.test(tab.currentUrl),
        click: () => this.pinTabAsApp(win, accountId, tabId)
      },
      {
        label: "Duplicate Tab",
        click: () => {
          const dup = this.openTab(ws, accountId, tab.currentUrl);
          wa.activeTabId = dup.id;
          this.afterTabChange(ws, accountId);
        }
      },
      { type: "separator" },
      { label: "Close Tab", click: () => this.closeTab(win, accountId, tabId) }
    ]).popup({ window: win });
  }
  /** Turn a loose tab into a pinned app: creates a shortcut from the tab's
   *  page and merges the tab into the rail (it leaves the tab strip and
   *  becomes the app's tab, already loaded). */
  pinTabAsApp(win, accountId, tabId) {
    const ws = this.wsFor(win);
    const meta = this.accounts.get(accountId);
    const wa = ws?.perAccount.get(accountId);
    const tab = wa?.tabs.find((t) => t.id === tabId);
    if (!ws || !meta || !wa || !tab || !/^https?:\/\//i.test(tab.currentUrl)) return;
    const shortcut = {
      id: crypto.randomUUID(),
      label: (tab.title || hostOf(tab.currentUrl)).slice(0, 40),
      url: tab.currentUrl,
      favicon: tab.favicon
    };
    meta.shortcuts.push(shortcut);
    tab.originShortcutId = shortcut.id;
    this.broadcastShortcuts(accountId);
    this.broadcastApps(accountId);
    this.emitTabs(ws, accountId);
    this.onState?.();
  }
  // ---- account/app cycling (menu accelerators) ---------------------------
  /** Cmd-Opt-Down/Up: next/previous account in sidebar order. */
  cycleAccount(win, delta) {
    const ws = this.wsFor(win);
    if (!ws || this.order.length < 2) return;
    const index = Math.max(0, this.order.indexOf(ws.activeAccountId ?? ""));
    const next = this.order[(index + delta + this.order.length) % this.order.length];
    this.setActive(win, next);
  }
  /** Cmd-Opt-Right/Left: next/previous pinned app in the active account. */
  cycleApp(win, delta) {
    const ws = this.wsFor(win);
    if (!ws?.activeAccountId) return;
    const meta = this.accounts.get(ws.activeAccountId);
    if (!meta || meta.shortcuts.length === 0) return;
    const wa = ws.perAccount.get(ws.activeAccountId);
    const activeTab = wa?.tabs.find((t) => t.id === wa.activeTabId);
    const index = meta.shortcuts.findIndex((s) => s.id === activeTab?.originShortcutId);
    const count = meta.shortcuts.length;
    const nextIndex = index === -1 ? delta === 1 ? 0 : count - 1 : (index + delta + count) % count;
    this.openShortcut(win, ws.activeAccountId, meta.shortcuts[nextIndex].id);
  }
  popupShortcutMenu(win, accountId, shortcutId) {
    const ws = this.wsFor(win);
    const openTab = ws?.perAccount.get(accountId)?.tabs.find((t) => t.originShortcutId === shortcutId);
    electron.Menu.buildFromTemplate([
      {
        label: "Edit",
        click: () => win.webContents.send("menu:edit-shortcut", { accountId, shortcutId })
      },
      {
        label: "Close",
        enabled: Boolean(openTab),
        click: () => openTab && this.closeTab(win, accountId, openTab.id)
      },
      { type: "separator" },
      { label: "Remove", click: () => this.removeShortcut(accountId, shortcutId) }
    ]).popup({ window: win });
  }
  // ---- avatar (metadata; broadcast) -------------------------------------
  extractAvatar(accountId, wc) {
    wc.executeJavaScript(AVATAR_SCRIPT, true).then((url) => {
      const meta = this.accounts.get(accountId);
      if (meta && typeof url === "string" && url && url !== meta.avatarUrl) {
        meta.avatarUrl = url;
        this.broadcastUpdated();
        this.onState?.();
      }
    }).catch(() => {
    });
  }
  // ---- persistence ------------------------------------------------------
  partitions() {
    const out = {};
    for (const id of this.order) out[id] = partitionFor(id);
    return out;
  }
  snapshotAccounts() {
    const primary = this.allWindows()[0];
    return this.order.filter((id) => !this.accounts.get(id)?.ephemeral).map((id, index) => {
      const meta = this.accounts.get(id);
      const wa = primary?.perAccount.get(id);
      const tabs = wa && wa.tabs.length > 0 ? wa.tabs.filter((t) => /^https?:\/\//i.test(t.currentUrl)).map((t) => ({
        url: t.currentUrl,
        originShortcutId: t.originShortcutId,
        active: t.id === wa.activeTabId || void 0
      })) : meta.savedTabs;
      return {
        id: meta.id,
        label: meta.label,
        color: meta.color,
        homeUrl: meta.homeUrl,
        lastUrl: meta.lastUrl,
        order: index,
        shortcuts: meta.shortcuts,
        avatarUrl: meta.avatarUrl,
        bookmarks: meta.bookmarks,
        muted: meta.muted,
        tabs
      };
    });
  }
  /** Active account of the first window, persisted as the default for relaunch. */
  defaultActiveId() {
    return this.allWindows()[0]?.activeAccountId ?? this.order[0];
  }
  // ---- layout / visibility (per window) ---------------------------------
  contentLeft() {
    return SIDEBAR_WIDTH + (this.railLayout === "left" ? APP_RAIL_WIDTH : 0);
  }
  topChrome(ws) {
    return TITLE_BAR_HEIGHT + TOP_BAR_HEIGHT + (this.bookmarksBar ? BOOKMARKS_BAR_HEIGHT : 0) + (ws.findOpen ? FIND_BAR_HEIGHT : 0);
  }
  refreshVisibility(ws) {
    this.materializeActive(ws);
    for (const [accountId, wa] of ws.perAccount) {
      for (const tab of wa.tabs) {
        if (!tab.view) continue;
        const visible = accountId === ws.activeAccountId && tab.id === wa.activeTabId && !ws.overlayOpen;
        tab.view.setVisible(visible);
        if (visible) this.extensions?.selectTab(accountId, tab.view.webContents);
      }
    }
  }
  layout(ws) {
    if (ws.win.isDestroyed()) return;
    const [width, height] = ws.win.getContentSize();
    const tab = this.activeTab(ws);
    if (!tab || !tab.view) return;
    const left = this.contentLeft();
    const top = this.topChrome(ws);
    const i = CONTENT_INSET;
    tab.view.setBounds({
      x: left + i,
      y: top + i,
      width: Math.max(0, width - left - i * 2),
      height: Math.max(0, height - top - i * 2)
    });
  }
  // ---- emit to a single window's renderer -------------------------------
  emitNav(ws) {
    if (!ws.win.isDestroyed()) ws.win.webContents.send("nav:state", this.getActiveNavState(ws.win));
  }
  emitTabs(ws, accountId) {
    if (!ws.win.isDestroyed()) {
      ws.win.webContents.send("tabs:state", {
        accountId,
        tabs: this.getTabs(ws.win, accountId)
      });
    }
  }
  emitApps(ws, accountId) {
    if (ws.win.isDestroyed()) return;
    const { apps, activeShortcutId } = this.getApps(ws.win, accountId);
    ws.win.webContents.send("apps:state", { accountId, apps, activeShortcutId });
  }
  emitUnread(ws, accountId) {
    if (!ws.win.isDestroyed()) {
      ws.win.webContents.send("accounts:unread", { id: accountId, count: this.totalUnread(ws, accountId) });
    }
    this.updateDockBadge();
  }
  /** Total unread across all accounts (primary window) → dock icon badge. */
  updateDockBadge() {
    const primary = this.allWindows()[0];
    if (!primary) return;
    let total = 0;
    for (const id of this.order) total += this.totalUnread(primary, id);
    electron.app.setBadgeCount(total);
  }
  // ---- broadcast metadata changes to every window -----------------------
  broadcastUpdated() {
    const summaries = this.summaries();
    for (const ws of this.allWindows()) {
      if (!ws.win.isDestroyed()) ws.win.webContents.send("accounts:updated", summaries);
    }
  }
  broadcastShortcuts(accountId) {
    const shortcuts = this.shortcutsFor(accountId);
    for (const ws of this.allWindows()) {
      if (!ws.win.isDestroyed()) {
        ws.win.webContents.send("shortcuts:updated", { accountId, shortcuts });
      }
    }
  }
  broadcastApps(accountId) {
    for (const ws of this.allWindows()) this.emitApps(ws, accountId);
  }
  broadcastBookmarks(accountId) {
    const meta = this.accounts.get(accountId);
    if (!meta) return;
    for (const ws of this.allWindows()) {
      if (!ws.win.isDestroyed()) {
        ws.win.webContents.send("bookmarks:state", { accountId, bookmarks: meta.bookmarks });
      }
    }
  }
}
const MAX_FINISHED = 50;
const SAVE_DEBOUNCE_MS$1 = 1e3;
function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let candidate = path.join(dir, filename);
  for (let n = 1; fs.existsSync(candidate); n++) {
    candidate = path.join(dir, `${stem} (${n})${ext}`);
  }
  return candidate;
}
class DownloadManager {
  items = /* @__PURE__ */ new Map();
  downloads = [];
  directory = "";
  askWhereToSave = false;
  saveTimer;
  path() {
    return path.join(electron.app.getPath("userData"), "flit-downloads.json");
  }
  /** Restore finished downloads from the last run (per-user file). */
  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.path(), "utf8"));
      if (parsed?.version === 1 && Array.isArray(parsed.downloads)) {
        this.downloads = parsed.downloads.map(
          (d) => d.state === "progressing" || d.state === "paused" ? { ...d, state: "interrupted" } : d
        );
      }
    } catch {
    }
  }
  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(this.path(), JSON.stringify({ version: 1, downloads: this.downloads }), "utf8");
      } catch {
      }
    }, SAVE_DEBOUNCE_MS$1);
    this.saveTimer.unref?.();
  }
  /** Preferences pushed from the prefs manager. */
  configure(prefs2) {
    this.directory = prefs2.downloadsDir;
    this.askWhereToSave = prefs2.askWhereToSave;
  }
  /** Wire a session's downloads (called once per account partition). */
  attach(ses, accountId) {
    ses.on("will-download", (_event, item) => this.track(item, accountId));
  }
  track(item, accountId) {
    let savePath = "";
    if (this.askWhereToSave) {
      item.setSaveDialogOptions({ defaultPath: item.getFilename() });
    } else {
      savePath = uniquePath(this.directory || electron.app.getPath("downloads"), item.getFilename());
      item.setSavePath(savePath);
    }
    const info = {
      id: crypto.randomUUID(),
      filename: savePath ? path.basename(savePath) : item.getFilename(),
      path: savePath,
      accountId,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: "progressing",
      startedAt: Date.now()
    };
    this.items.set(info.id, item);
    this.downloads.unshift(info);
    item.on("updated", (_e, state2) => {
      if (!info.path && item.getSavePath()) {
        info.path = item.getSavePath();
        info.filename = path.basename(info.path);
      }
      info.receivedBytes = item.getReceivedBytes();
      info.totalBytes = item.getTotalBytes();
      info.state = state2 === "interrupted" ? "interrupted" : item.isPaused() ? "paused" : "progressing";
      this.emit();
    });
    item.once("done", (_e, state2) => {
      if (!info.path && item.getSavePath()) {
        info.path = item.getSavePath();
        info.filename = path.basename(info.path);
      }
      info.receivedBytes = item.getReceivedBytes();
      info.state = state2 === "completed" ? "completed" : state2 === "cancelled" ? "cancelled" : "interrupted";
      this.items.delete(info.id);
      this.trimFinished();
      this.emit();
      if (info.state === "completed") electron.app.dock?.bounce("informational");
    });
    this.emit();
  }
  trimFinished() {
    const finished = this.downloads.filter((d) => d.state !== "progressing" && d.state !== "paused");
    for (const extra of finished.slice(MAX_FINISHED)) {
      this.downloads = this.downloads.filter((d) => d.id !== extra.id);
    }
  }
  /** Push the list to every window and update the dock progress bar. */
  emit() {
    this.scheduleSave();
    const active = this.downloads.filter((d) => d.state === "progressing" || d.state === "paused");
    const total = active.reduce((sum, d) => sum + d.totalBytes, 0);
    const received = active.reduce((sum, d) => sum + d.receivedBytes, 0);
    const progress = active.length === 0 ? -1 : total > 0 ? received / total : 2;
    for (const win of electron.BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.setProgressBar(progress);
      win.webContents.send("downloads:state", this.downloads);
    }
  }
  list() {
    return this.downloads;
  }
  open(id) {
    const info = this.downloads.find((d) => d.id === id);
    if (info?.state === "completed") void electron.shell.openPath(info.path);
  }
  show(id) {
    const info = this.downloads.find((d) => d.id === id);
    if (info && fs.existsSync(info.path)) electron.shell.showItemInFolder(info.path);
  }
  cancel(id) {
    this.items.get(id)?.cancel();
  }
  /** Drop finished/cancelled/interrupted entries; active ones stay. */
  clear() {
    this.downloads = this.downloads.filter(
      (d) => d.state === "progressing" || d.state === "paused"
    );
    this.emit();
  }
}
class ExtensionManager {
  instances = /* @__PURE__ */ new Map();
  delegate;
  /** Serve crx:// (extension icons for the toolbar UI). Call once at startup. */
  static handleCRXProtocol() {
    electronChromeExtensions.ElectronChromeExtensions.handleCRXProtocol(electron.session.defaultSession);
  }
  setDelegate(delegate) {
    this.delegate = delegate;
  }
  /** Create the per-account extension environment (called from addMeta). */
  attach(ses, accountId) {
    if (this.instances.has(accountId)) return;
    const extensions = new electronChromeExtensions.ElectronChromeExtensions({
      license: "GPL-3.0",
      session: ses,
      createTab: async (details) => {
        const created = this.delegate?.openExtensionTab(accountId, details.url ?? "about:blank");
        if (!created) throw new Error("no window available to open a tab in");
        return created;
      },
      selectTab: (wc) => this.delegate?.selectExtensionTab(wc),
      removeTab: (wc) => this.delegate?.closeExtensionTab(wc),
      createWindow: async (details) => {
        const win = new electron.BrowserWindow({
          width: details.width ?? 900,
          height: details.height ?? 700,
          webPreferences: {
            partition: partitionFor(accountId),
            contextIsolation: true,
            nodeIntegration: false
          }
        });
        const url = Array.isArray(details.url) ? details.url[0] : details.url;
        if (url) void win.loadURL(url);
        return win;
      }
    });
    this.instances.set(accountId, extensions);
    void electronChromeWebStore.installChromeWebStore({
      session: ses,
      extensionsPath: path.join(electron.app.getPath("userData"), "Extensions", accountId)
    });
  }
  /** Extensions installed in an account's partition (for Preferences). */
  list(accountId) {
    const ses = electron.session.fromPartition(partitionFor(accountId));
    return ses.extensions.getAllExtensions().map((e) => ({ id: e.id, name: e.name, version: e.version })).sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Uninstall an extension from one account's partition. */
  async uninstall(accountId, extensionId) {
    const ses = electron.session.fromPartition(partitionFor(accountId));
    await electronChromeWebStore.uninstallExtension(extensionId, {
      session: ses,
      extensionsPath: path.join(electron.app.getPath("userData"), "Extensions", accountId)
    });
  }
  /** Register a freshly created tab view with the account's extension system. */
  addTab(accountId, wc, win) {
    this.instances.get(accountId)?.addTab(wc, win);
  }
  /** Tell the extension system which tab is now active/visible. */
  selectTab(accountId, wc) {
    this.instances.get(accountId)?.selectTab(wc);
  }
}
const MAX_PER_ACCOUNT = 3e3;
const SAVE_DEBOUNCE_MS = 2e3;
class HistoryManager {
  data = { version: 1, entries: {} };
  saveTimer;
  path() {
    return path.join(electron.app.getPath("userData"), "flit-history.json");
  }
  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.path(), "utf8"));
      if (parsed?.version === 1 && parsed.entries) this.data = parsed;
    } catch {
    }
  }
  /** Record a main-frame navigation (http/https only). */
  record(accountId, url, title) {
    if (!/^https?:\/\//i.test(url)) return;
    const list = this.data.entries[accountId] ??= [];
    const existing = list.find((e) => e.url === url);
    if (existing) {
      existing.visits += 1;
      existing.lastVisit = Date.now();
      if (title) existing.title = title;
    } else {
      list.push({ url, title, visits: 1, lastVisit: Date.now() });
      if (list.length > MAX_PER_ACCOUNT) {
        list.sort((a, b) => b.lastVisit - a.lastVisit);
        list.length = MAX_PER_ACCOUNT;
      }
    }
    this.scheduleSave();
  }
  /** Late title update for a URL already recorded. */
  title(accountId, url, title) {
    const entry = this.data.entries[accountId]?.find((e) => e.url === url);
    if (entry && title) {
      entry.title = title;
      this.scheduleSave();
    }
  }
  removeAccount(accountId) {
    delete this.data.entries[accountId];
    this.scheduleSave();
  }
  /** Top matches for the omnibox: substring match on URL/title, ranked by
   *  frecency (visits weighted by recency), host-prefix matches boosted. */
  query(accountId, text, limit) {
    const needle = text.trim().toLowerCase();
    if (!needle) return [];
    const now = Date.now();
    const scored = [];
    for (const entry of this.data.entries[accountId] ?? []) {
      const url = entry.url.toLowerCase();
      const title = entry.title.toLowerCase();
      const host = url.replace(/^https?:\/\/(www\.)?/, "");
      let match = 0;
      if (host.startsWith(needle)) match = 3;
      else if (title.includes(needle)) match = 2;
      else if (url.includes(needle)) match = 1;
      if (!match) continue;
      const ageDays = (now - entry.lastVisit) / 864e5;
      const recency = ageDays < 1 ? 3 : ageDays < 7 ? 2 : ageDays < 30 ? 1 : 0.5;
      scored.push({ entry, score: match * 10 + Math.min(entry.visits, 20) * recency });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.entry);
  }
  /** Browse view (Cmd-Y): recent-first, optionally filtered. */
  list(accountId, query, limit) {
    if (query.trim()) return this.query(accountId, query, limit);
    return [...this.data.entries[accountId] ?? []].sort((a, b) => b.lastVisit - a.lastVisit).slice(0, limit);
  }
  /** Clear all history for one account (Cmd-Y page's Clear button). */
  clear(accountId) {
    delete this.data.entries[accountId];
    this.scheduleSave();
  }
  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_DEBOUNCE_MS);
    this.saveTimer.unref?.();
  }
  save() {
    try {
      fs.writeFileSync(this.path(), JSON.stringify(this.data), "utf8");
    } catch {
    }
  }
}
const THEMES = [
  {
    id: "graphite",
    label: "Graphite",
    dark: { bg: "#202124", accent: "#4c8bf5" },
    light: { bg: "#f3f4f6", accent: "#3d7bec" }
  },
  {
    id: "midnight",
    label: "Midnight",
    dark: { bg: "#10141f", accent: "#8b9cf9" },
    light: { bg: "#eef1f9", accent: "#4f63e7" }
  },
  {
    id: "forest",
    label: "Forest",
    dark: { bg: "#141b16", accent: "#5fbf82" },
    light: { bg: "#eef4ef", accent: "#2e8b57" }
  },
  {
    id: "ember",
    label: "Ember",
    dark: { bg: "#1e1613", accent: "#f0954f" },
    light: { bg: "#f7f1ea", accent: "#d97a35" }
  },
  {
    id: "orchid",
    label: "Orchid",
    dark: { bg: "#1a1420", accent: "#c689e8" },
    light: { bg: "#f5f0f8", accent: "#9a4fd0" }
  },
  {
    id: "ocean",
    label: "Ocean",
    dark: { bg: "#0f1c1e", accent: "#35c2b4" },
    light: { bg: "#ecf4f4", accent: "#0e9488" }
  }
];
const DEFAULT_THEME_ID = "graphite";
function themeById(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
const ROW_HEIGHT = 34;
const PANEL_PAD = 6;
const MAX_ROWS = 6;
const SEARCH_LABEL = {
  google: "Google",
  duckduckgo: "DuckDuckGo",
  bing: "Bing"
};
const SUGGEST_URLS = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${q}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?type=list&q=${q}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?query=${q}`
};
function looksLikeUrl(text) {
  return !/\s/.test(text) && (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^[^\s/.]+\.[^\s/.]+/.test(text));
}
async function fetchCompletions(engine, text) {
  const build = SUGGEST_URLS[engine];
  if (!build) return [];
  try {
    const res = await electron.net.fetch(build(encodeURIComponent(text)), {
      signal: AbortSignal.timeout(800)
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter((s) => typeof s === "string");
    }
  } catch {
  }
  return [];
}
function flattenBookmarks(nodes, out) {
  for (const node of nodes) {
    if (node.type === "link") out.push({ title: node.title, url: node.url });
    else flattenBookmarks(node.children, out);
  }
}
class OmniboxManager {
  constructor(accounts2, history, prefs2) {
    this.accounts = accounts2;
    this.history = history;
    this.prefs = prefs2;
    electron.ipcMain.on("sug:click", (event, index) => {
      for (const [winId, ow] of this.windows) {
        if (ow.view.webContents.id !== event.sender.id) continue;
        const win = electron.BrowserWindow.fromId(winId);
        const suggestion = ow.suggestions[index];
        if (win && suggestion) {
          this.hide(win);
          this.accounts.navigate(win, suggestion.fill);
        }
        return;
      }
    });
  }
  windows = /* @__PURE__ */ new Map();
  forWindow(win) {
    let ow = this.windows.get(win.id);
    if (ow) return ow;
    const view = new electron.WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "../preload/suggestions.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    view.setBorderRadius(10);
    const url = process.env["ELECTRON_RENDERER_URL"];
    const ready = url ? view.webContents.loadURL(`${url}/suggestions.html`) : view.webContents.loadFile(path.join(__dirname, "../renderer/suggestions.html"));
    ow = {
      view,
      ready: ready.catch(() => {
      }),
      suggestions: [],
      selected: -1,
      visible: false,
      token: 0
    };
    this.windows.set(win.id, ow);
    win.on("closed", () => this.windows.delete(win.id));
    win.on("resize", () => this.hide(win));
    return ow;
  }
  /** New omnibox text: recompute suggestions and (re)position the dropdown. */
  async update(win, text, rect) {
    const trimmed = text.trim();
    if (!trimmed) {
      this.hide(win);
      return;
    }
    const ow = this.forWindow(win);
    const token = ++ow.token;
    const suggestions = await this.compute(win, trimmed);
    if (token !== ow.token) return;
    ow.suggestions = suggestions;
    ow.selected = -1;
    if (suggestions.length === 0) {
      this.hide(win);
      return;
    }
    await ow.ready;
    const state2 = this.prefs.state();
    const theme = themeById(state2.prefs.themeId)[state2.dark ? "dark" : "light"];
    ow.view.webContents.send("sug:render", {
      suggestions,
      selected: ow.selected,
      dark: state2.dark,
      accent: theme.accent
    });
    const height = Math.min(suggestions.length, MAX_ROWS) * ROW_HEIGHT + PANEL_PAD * 2;
    ow.view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y + rect.height + 6),
      width: Math.round(rect.width),
      height
    });
    if (!ow.visible) {
      ow.visible = true;
      ow.view.setVisible(true);
    }
    win.contentView.addChildView(ow.view);
  }
  /** Arrow-key selection; returns the text to fill into the address field. */
  navigate(win, delta) {
    const ow = this.windows.get(win.id);
    if (!ow || !ow.visible || ow.suggestions.length === 0) return void 0;
    const count = ow.suggestions.length;
    ow.selected = (ow.selected + delta + count + 1) % (count + 1);
    const index = ow.selected === count ? -1 : ow.selected;
    ow.view.webContents.send("sug:select", index);
    return index === -1 ? void 0 : ow.suggestions[index].fill;
  }
  hide(win) {
    const ow = this.windows.get(win.id);
    if (!ow || !ow.visible) return;
    ow.visible = false;
    ow.selected = -1;
    ow.view.setVisible(false);
  }
  async compute(win, text) {
    const accountId = this.accounts.getActiveId(win);
    if (!accountId) return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const engine = this.prefs.state().prefs.searchEngine;
    const completionsPromise = looksLikeUrl(text) ? Promise.resolve([]) : fetchCompletions(engine, text);
    for (const entry of this.history.query(accountId, text, 3)) {
      out.push({
        kind: "history",
        title: entry.title || entry.url,
        url: entry.url,
        fill: entry.url
      });
      seen.add(entry.url);
    }
    const links = [];
    flattenBookmarks(this.accounts.getBookmarks(accountId), links);
    const needle = text.toLowerCase();
    for (const link of links) {
      if (out.length >= 4) break;
      if (seen.has(link.url)) continue;
      if (link.title.toLowerCase().includes(needle) || link.url.toLowerCase().includes(needle)) {
        out.push({ kind: "bookmark", title: link.title, url: link.url, fill: link.url });
        seen.add(link.url);
      }
    }
    for (const phrase of await completionsPromise) {
      if (out.length >= MAX_ROWS - 1) break;
      if (phrase.toLowerCase() === text.toLowerCase()) continue;
      out.push({ kind: "search", title: phrase, url: "", fill: phrase });
    }
    out.push({
      kind: "search",
      title: `Search ${SEARCH_LABEL[engine] ?? "the web"} for “${text}”`,
      url: "",
      fill: text
    });
    return out.slice(0, MAX_ROWS);
  }
}
const DEFAULT_PREFS = {
  appearance: "system",
  themeId: DEFAULT_THEME_ID,
  launchAtLogin: false,
  newTabUrl: "https://www.google.com",
  searchEngine: "google",
  downloadsDir: "",
  askWhereToSave: false,
  accountAccent: true
};
class PrefsManager {
  prefs;
  onChange;
  constructor(saved) {
    this.prefs = { ...DEFAULT_PREFS, ...saved };
  }
  /** Register the side-effect hook and apply initial state. */
  start(onChange) {
    this.onChange = onChange;
    electron.nativeTheme.on("updated", () => {
      this.applyWindowBackground();
      this.broadcast();
    });
    this.apply();
  }
  get() {
    return { ...this.prefs, launchAtLogin: electron.app.getLoginItemSettings().openAtLogin };
  }
  /** Prefs + resolved appearance, as sent to renderers. */
  state() {
    return { prefs: this.get(), dark: electron.nativeTheme.shouldUseDarkColors };
  }
  set(patch) {
    if (patch.launchAtLogin !== void 0) {
      electron.app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin });
    }
    this.prefs = { ...this.prefs, ...patch };
    this.apply();
  }
  /** Persisted snapshot (login item excluded — macOS owns it). */
  snapshot() {
    const { launchAtLogin: _ignored, ...rest } = this.prefs;
    return rest;
  }
  /** Window background for the current theme (avoids white flash at launch). */
  windowBackground() {
    const colors = themeById(this.prefs.themeId);
    return electron.nativeTheme.shouldUseDarkColors ? colors.dark.bg : colors.light.bg;
  }
  apply() {
    electron.nativeTheme.themeSource = this.prefs.appearance;
    this.applyWindowBackground();
    this.onChange?.(this.get());
    this.broadcast();
  }
  broadcast() {
    const state2 = this.state();
    for (const win of electron.BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("prefs:changed", state2);
    }
  }
  applyWindowBackground() {
    const bg = this.windowBackground();
    for (const win of electron.BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.setBackgroundColor(bg);
    }
  }
}
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1e3;
function startAutoUpdate() {
  if (!electron.app.isPackaged) return;
  electronUpdater.autoUpdater.autoDownload = true;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
  electronUpdater.autoUpdater.on("error", () => {
  });
  let prompted = false;
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    if (prompted) return;
    prompted = true;
    void electron.dialog.showMessageBox({
      type: "info",
      message: `Flit ${info.version} is ready to install`,
      detail: "The update was downloaded in the background.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) electronUpdater.autoUpdater.quitAndInstall();
    });
  });
  const check = () => {
    electronUpdater.autoUpdater.checkForUpdates().catch(() => {
    });
  };
  setTimeout(check, 15e3);
  const timer = setInterval(check, CHECK_INTERVAL_MS);
  timer.unref?.();
}
function registerIpc(accounts2, onNewWindow, downloads, prefs2, extensions, omnibox, history, firstRun2) {
  const winOf = (event) => electron.BrowserWindow.fromWebContents(event.sender);
  electron.ipcMain.handle("window:new", () => onNewWindow());
  electron.ipcMain.handle("accounts:active", (e) => {
    const win = winOf(e);
    return win ? accounts2.getActiveId(win) : void 0;
  });
  electron.ipcMain.handle("accounts:switch", (e, id) => {
    const win = winOf(e);
    if (win) accounts2.setActive(win, id);
  });
  electron.ipcMain.handle("accounts:unread-all", (e) => {
    const win = winOf(e);
    return win ? accounts2.unreadAll(win) : {};
  });
  electron.ipcMain.handle("nav:back", (e) => {
    const win = winOf(e);
    if (win) accounts2.goBack(win);
  });
  electron.ipcMain.handle("nav:forward", (e) => {
    const win = winOf(e);
    if (win) accounts2.goForward(win);
  });
  electron.ipcMain.handle("nav:reload", (e) => {
    const win = winOf(e);
    if (win) accounts2.reload(win);
  });
  electron.ipcMain.handle("nav:go", (e, url) => {
    const win = winOf(e);
    if (win) accounts2.navigate(win, url);
  });
  electron.ipcMain.handle("nav:state", (e) => {
    const win = winOf(e);
    return win ? accounts2.getActiveNavState(win) : null;
  });
  electron.ipcMain.handle("apps:list", (e, accountId) => {
    const win = winOf(e);
    return win ? accounts2.getApps(win, accountId) : { apps: [] };
  });
  electron.ipcMain.handle("tabs:list", (e, accountId) => {
    const win = winOf(e);
    return win ? accounts2.getTabs(win, accountId) : [];
  });
  electron.ipcMain.handle("tabs:open-shortcut", (e, accountId, shortcutId) => {
    const win = winOf(e);
    if (win) accounts2.openShortcut(win, accountId, shortcutId);
  });
  electron.ipcMain.handle("tabs:new", (e, accountId) => {
    const win = winOf(e);
    if (win) accounts2.newTab(win, accountId);
  });
  electron.ipcMain.handle("tabs:activate", (e, accountId, tabId) => {
    const win = winOf(e);
    if (win) accounts2.activateTab(win, accountId, tabId);
  });
  electron.ipcMain.handle("tabs:close", (e, accountId, tabId) => {
    const win = winOf(e);
    if (win) accounts2.closeTab(win, accountId, tabId);
  });
  electron.ipcMain.handle("tabs:reorder", (e, accountId, tabIds) => {
    const win = winOf(e);
    if (win) accounts2.reorderTabs(win, accountId, tabIds);
  });
  electron.ipcMain.handle("tabs:toggle-mute", (e, accountId, tabId) => {
    const win = winOf(e);
    if (win) accounts2.toggleTabMute(win, accountId, tabId);
  });
  electron.ipcMain.handle("bookmarks:open", (e, accountId, url) => {
    const win = winOf(e);
    if (win) accounts2.openBookmark(win, accountId, url);
  });
  electron.ipcMain.handle("bookmarks:open-folder", (e, accountId, folderId) => {
    const win = winOf(e);
    if (win) accounts2.openBookmarkFolder(win, accountId, folderId);
  });
  electron.ipcMain.handle("bookmarks:open-overflow", (e, accountId, ids) => {
    const win = winOf(e);
    if (win) accounts2.openBookmarksOverflow(win, accountId, ids);
  });
  electron.ipcMain.handle("menu:tab", (e, accountId, tabId) => {
    const win = winOf(e);
    if (win) accounts2.popupTabMenu(win, accountId, tabId);
  });
  electron.ipcMain.handle("menu:bookmark", (e, accountId, bookmarkId) => {
    const win = winOf(e);
    if (win) accounts2.popupBookmarkMenu(win, accountId, bookmarkId);
  });
  electron.ipcMain.handle(
    "bookmarks:update",
    (_e, accountId, bookmarkId, patch) => accounts2.updateBookmark(accountId, bookmarkId, patch)
  );
  electron.ipcMain.handle("menu:account", (e, accountId) => {
    const win = winOf(e);
    if (win) accounts2.popupAccountMenu(win, accountId);
  });
  electron.ipcMain.handle("menu:shortcut", (e, accountId, shortcutId) => {
    const win = winOf(e);
    if (win) accounts2.popupShortcutMenu(win, accountId, shortcutId);
  });
  electron.ipcMain.handle("chrome:overlay", (e, open) => {
    const win = winOf(e);
    if (win) accounts2.setOverlayOpen(win, open);
  });
  electron.ipcMain.handle("find:query", (e, text, next, forward) => {
    const win = winOf(e);
    if (win) accounts2.findInPage(win, text, next, forward);
  });
  electron.ipcMain.handle("find:stop", (e) => {
    const win = winOf(e);
    if (win) accounts2.closeFind(win);
  });
  electron.ipcMain.handle(
    "omnibox:input",
    (e, text, rect) => {
      const win = winOf(e);
      if (win) void omnibox.update(win, text, rect);
    }
  );
  electron.ipcMain.handle("omnibox:nav", (e, delta) => {
    const win = winOf(e);
    return win ? omnibox.navigate(win, delta) : void 0;
  });
  electron.ipcMain.handle("omnibox:hide", (e) => {
    const win = winOf(e);
    if (win) omnibox.hide(win);
  });
  electron.ipcMain.handle("accounts:list", () => accounts2.summaries());
  electron.ipcMain.handle("accounts:add", (_e, input) => {
    accounts2.addAccount(input);
  });
  electron.ipcMain.handle(
    "accounts:update",
    (_e, id, patch) => accounts2.updateAccount(id, patch)
  );
  electron.ipcMain.handle("accounts:remove", (_e, id) => accounts2.removeAccount(id));
  electron.ipcMain.handle("shortcuts:list", (_e, accountId) => accounts2.shortcutsFor(accountId));
  electron.ipcMain.handle(
    "shortcuts:add",
    (_e, accountId, input) => accounts2.addShortcut(accountId, input)
  );
  electron.ipcMain.handle(
    "shortcuts:update",
    (_e, accountId, shortcutId, patch) => accounts2.updateShortcut(accountId, shortcutId, patch)
  );
  electron.ipcMain.handle(
    "shortcuts:remove",
    (_e, accountId, shortcutId) => accounts2.removeShortcut(accountId, shortcutId)
  );
  electron.ipcMain.handle(
    "apps:reorder",
    (_e, accountId, shortcutIds) => accounts2.reorderShortcuts(accountId, shortcutIds)
  );
  electron.ipcMain.handle("layout:get", () => accounts2.getLayout());
  electron.ipcMain.handle("bookmarks:list", (_e, accountId) => accounts2.getBookmarks(accountId));
  electron.ipcMain.handle("bookmarks:bar-visible", () => accounts2.getBookmarksBarVisible());
  electron.ipcMain.handle("bookmarks:chrome-profiles", () => accounts2.getChromeProfiles());
  electron.ipcMain.handle(
    "bookmarks:import",
    (_e, accountId, chromeDir) => accounts2.importChromeBookmarks(accountId, chromeDir)
  );
  electron.ipcMain.handle("downloads:list", () => downloads.list());
  electron.ipcMain.handle("downloads:open", (_e, id) => downloads.open(id));
  electron.ipcMain.handle("downloads:show", (_e, id) => downloads.show(id));
  electron.ipcMain.handle("downloads:cancel", (_e, id) => downloads.cancel(id));
  electron.ipcMain.handle("downloads:clear", () => downloads.clear());
  electron.ipcMain.handle("app:first-run", () => firstRun2.get());
  electron.ipcMain.handle("app:first-run-done", () => firstRun2.clear());
  electron.ipcMain.handle("prefs:get", () => prefs2.state());
  electron.ipcMain.handle("prefs:set", (_e, patch) => prefs2.set(patch));
  electron.ipcMain.handle("prefs:choose-downloads-dir", async (e) => {
    const win = winOf(e);
    if (!win) return "";
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      defaultPath: prefs2.get().downloadsDir || electron.app.getPath("downloads")
    });
    return result.canceled ? "" : result.filePaths[0] ?? "";
  });
  electron.ipcMain.handle("prefs:is-default-browser", () => electron.app.isDefaultProtocolClient("http"));
  electron.ipcMain.handle("prefs:make-default-browser", () => {
    electron.app.setAsDefaultProtocolClient("http");
    electron.app.setAsDefaultProtocolClient("https");
  });
  electron.ipcMain.handle(
    "history:list",
    (_e, accountId, query) => history.list(accountId, query, 200)
  );
  electron.ipcMain.handle("history:clear", (_e, accountId) => history.clear(accountId));
  electron.ipcMain.handle("extensions:list", (_e, accountId) => extensions.list(accountId));
  electron.ipcMain.handle(
    "extensions:uninstall",
    (_e, accountId, extensionId) => extensions.uninstall(accountId, extensionId)
  );
  electron.ipcMain.handle("__test:partitions", () => accounts2.partitions());
  electron.ipcMain.handle(
    "__test:set-cookie",
    (_e, arg) => electron.session.fromPartition(arg.partition).cookies.set({
      url: arg.url,
      name: arg.name,
      value: arg.value
    })
  );
  electron.ipcMain.handle("__test:get-cookies", async (_e, arg) => {
    const cookies = await electron.session.fromPartition(arg.partition).cookies.get({ url: arg.url });
    return cookies.map((c) => ({ name: c.name, value: c.value }));
  });
}
function buildAppMenu(handlers) {
  const accountItems = Array.from({ length: 9 }, (_, i) => ({
    label: `Switch to Account ${i + 1}`,
    accelerator: `CommandOrControl+${i + 1}`,
    click: () => handlers.switchToIndex(i)
  }));
  const appMenu = {
    role: "appMenu",
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Preferences…",
        accelerator: "Command+,",
        click: () => handlers.openPreferences()
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" }
    ]
  };
  const template = [
    ...process.platform === "darwin" ? [appMenu] : [],
    {
      label: "File",
      submenu: [
        {
          label: "New Tab",
          accelerator: "CommandOrControl+T",
          click: () => handlers.newTab()
        },
        {
          label: "New Window",
          accelerator: "CommandOrControl+N",
          click: () => handlers.newWindow()
        },
        {
          label: "New Incognito Session",
          accelerator: "CommandOrControl+Shift+N",
          click: () => handlers.newIncognito()
        },
        {
          label: "Reopen Closed Tab",
          accelerator: "CommandOrControl+Shift+T",
          click: () => handlers.reopenTab()
        },
        { type: "separator" },
        {
          label: "Open Location…",
          accelerator: "CommandOrControl+L",
          click: () => handlers.focusAddress()
        },
        {
          label: "Quick Switcher…",
          accelerator: "CommandOrControl+K",
          click: () => handlers.openPalette()
        },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: "CommandOrControl+W",
          click: () => handlers.closeTab()
        },
        { type: "separator" },
        {
          label: "Print…",
          accelerator: "CommandOrControl+P",
          click: () => handlers.print()
        },
        { type: "separator" },
        {
          label: "Set as Default Browser…",
          click: () => handlers.setDefaultBrowser()
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find…",
          accelerator: "CommandOrControl+F",
          click: () => handlers.find()
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "Zoom In", accelerator: "CommandOrControl+=", click: handlers.zoomIn },
        { label: "Zoom Out", accelerator: "CommandOrControl+-", click: handlers.zoomOut },
        { label: "Actual Size", accelerator: "CommandOrControl+0", click: handlers.zoomReset },
        { type: "separator" },
        {
          label: "App Layout",
          submenu: [
            {
              label: "Left Rail",
              type: "radio",
              checked: handlers.layout === "left",
              click: () => handlers.setLayout("left")
            },
            {
              label: "Top Right",
              type: "radio",
              checked: handlers.layout === "top",
              click: () => handlers.setLayout("top")
            }
          ]
        }
      ]
    },
    {
      label: "Bookmarks",
      submenu: [
        {
          label: "Bookmark This Page",
          accelerator: "CommandOrControl+D",
          click: () => handlers.bookmarkPage()
        },
        { type: "separator" },
        {
          label: "Show Bookmarks Bar",
          type: "checkbox",
          checked: handlers.bookmarksBar,
          accelerator: "CommandOrControl+Shift+B",
          click: () => handlers.toggleBookmarksBar()
        },
        { type: "separator" },
        { label: "Import from Chrome…", click: () => handlers.importBookmarks() }
      ]
    },
    {
      label: "History",
      submenu: [
        {
          label: "Show History",
          accelerator: "CommandOrControl+Y",
          click: () => handlers.showHistory()
        }
      ]
    },
    {
      label: "Tab",
      submenu: [
        {
          label: "Show Next Tab",
          accelerator: "CommandOrControl+Shift+]",
          click: () => handlers.nextTab()
        },
        {
          label: "Show Previous Tab",
          accelerator: "CommandOrControl+Shift+[",
          click: () => handlers.prevTab()
        },
        // Chrome-style Ctrl-Tab aliases; hidden so the menu stays tidy.
        {
          label: "Next Tab",
          accelerator: "Control+Tab",
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => handlers.nextTab()
        },
        {
          label: "Previous Tab",
          accelerator: "Control+Shift+Tab",
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => handlers.prevTab()
        }
      ]
    },
    {
      label: "Accounts",
      submenu: [
        ...accountItems,
        { type: "separator" },
        {
          label: "Next Account",
          accelerator: "Alt+Command+Down",
          click: () => handlers.nextAccount()
        },
        {
          label: "Previous Account",
          accelerator: "Alt+Command+Up",
          click: () => handlers.prevAccount()
        },
        { type: "separator" },
        {
          label: "Next App",
          accelerator: "Alt+Command+Right",
          click: () => handlers.nextApp()
        },
        {
          label: "Previous App",
          accelerator: "Alt+Command+Left",
          click: () => handlers.prevApp()
        }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        // Cmd-W belongs to Close Tab; the window closes with Cmd-Shift-W.
        { label: "Close Window", accelerator: "CommandOrControl+Shift+W", role: "close" },
        { type: "separator" },
        { role: "front" }
      ]
    }
  ];
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
const SHARED_DIR = process.env.FLIT_SHARED_DIR || "/Users/Shared/Flit";
const DEFAULT_ACCOUNTS = [
  { id: "personal", label: "Personal", color: "#4c8bf5", homeUrl: "https://mail.google.com", order: 0 }
];
function defaultState() {
  return { version: 1, accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })), firstRun: true };
}
function migrateLegacyShared() {
  if (process.env.FLIT_SHARED_DIR) return;
  try {
    const oldFile = path.join("/Users/Shared/Glide", "glide-state.json");
    const newFile = path.join(SHARED_DIR, "flit-state.json");
    if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
      ensureSharedDir();
      fs.writeFileSync(newFile, fs.readFileSync(oldFile, "utf8"), "utf8");
      try {
        fs.chmodSync(newFile, 438);
      } catch {
      }
    }
  } catch {
  }
}
let sharedModeCache;
function sharedMode() {
  if (sharedModeCache === void 0) {
    migrateLegacyShared();
    sharedModeCache = Boolean(process.env.FLIT_SHARED_DIR) || fs.existsSync(path.join(SHARED_DIR, "flit-state.json"));
  }
  return sharedModeCache;
}
function statePath() {
  return sharedMode() ? path.join(SHARED_DIR, "flit-state.json") : perUserStatePath();
}
function perUserStatePath() {
  return path.join(electron.app.getPath("userData"), "flit-state.json");
}
function ensureSharedDir() {
  try {
    if (!fs.existsSync(SHARED_DIR)) {
      fs.mkdirSync(SHARED_DIR, { recursive: true });
      fs.chmodSync(SHARED_DIR, 511);
    }
  } catch {
  }
}
function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
      return defaultState();
    }
    return parsed;
  } catch {
    return defaultState();
  }
}
function saveState(state2) {
  try {
    if (sharedMode()) {
      ensureSharedDir();
      fs.writeFileSync(statePath(), JSON.stringify(state2, null, 2), "utf8");
      try {
        fs.chmodSync(statePath(), 438);
      } catch {
      }
    } else {
      fs.writeFileSync(statePath(), JSON.stringify(state2, null, 2), "utf8");
    }
  } catch {
  }
}
electron.app.setName("Flit");
function migrateFromGlide() {
  if (process.env.FLIT_USER_DATA_DIR) return;
  try {
    const appData = electron.app.getPath("appData");
    const oldDir = path.join(appData, "Glide");
    const newDir = path.join(appData, "Flit");
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) fs.renameSync(oldDir, newDir);
    const renames = [
      ["glide-state.json", "flit-state.json"],
      ["glide-history.json", "flit-history.json"],
      ["glide-downloads.json", "flit-downloads.json"]
    ];
    for (const [oldName, newName] of renames) {
      const oldPath = path.join(newDir, oldName);
      const newPath = path.join(newDir, newName);
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
    }
  } catch {
  }
}
migrateFromGlide();
if (process.env.FLIT_USER_DATA_DIR) {
  electron.app.setPath("userData", process.env.FLIT_USER_DATA_DIR);
}
let accounts;
let prefs;
let historyRef;
let firstRun = false;
let state = { version: 1, accounts: [] };
let persistTimer;
function buildState() {
  const focused = electron.BrowserWindow.getFocusedWindow() ?? electron.BrowserWindow.getAllWindows()[0];
  const bounds = focused && !focused.isDestroyed() ? focused.getBounds() : void 0;
  return {
    version: 1,
    accounts: accounts ? accounts.snapshotAccounts() : state.accounts,
    activeAccountId: accounts?.defaultActiveId() ?? state.activeAccountId,
    window: bounds ? { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y } : state.window,
    zoomFactor: accounts?.getZoom() ?? state.zoomFactor,
    layout: accounts?.getLayout() ?? state.layout,
    bookmarksBar: accounts?.getBookmarksBarVisible() ?? state.bookmarksBar,
    seededPasswordsApp: state.seededPasswordsApp,
    prefs: prefs?.snapshot() ?? state.prefs,
    firstRun: firstRun || void 0
  };
}
function seedPasswordsApp() {
  if (state.seededPasswordsApp) return;
  for (const account of state.accounts) {
    if (account.shortcuts && !account.shortcuts.some((s) => s.url.includes("passwords.google.com"))) {
      account.shortcuts.push({
        id: crypto.randomUUID(),
        label: "Passwords",
        url: "https://passwords.google.com"
      });
    }
  }
  state.seededPasswordsApp = true;
  saveState(state);
}
function installMenu() {
  const focused = () => electron.BrowserWindow.getFocusedWindow();
  buildAppMenu({
    newWindow: () => createWindow(),
    newIncognito: () => {
      const win = focused();
      if (win) accounts?.createIncognito(win);
    },
    openPreferences: () => focused()?.webContents.send("menu:preferences"),
    newTab: () => {
      const win = focused();
      if (win) accounts?.newTabInActive(win);
    },
    closeTab: () => {
      const win = focused();
      if (win) accounts?.closeActiveTab(win);
    },
    reopenTab: () => {
      const win = focused();
      if (win) accounts?.reopenClosedTab(win);
    },
    nextTab: () => {
      const win = focused();
      if (win) accounts?.cycleTab(win, 1);
    },
    prevTab: () => {
      const win = focused();
      if (win) accounts?.cycleTab(win, -1);
    },
    nextAccount: () => {
      const win = focused();
      if (win) accounts?.cycleAccount(win, 1);
    },
    prevAccount: () => {
      const win = focused();
      if (win) accounts?.cycleAccount(win, -1);
    },
    nextApp: () => {
      const win = focused();
      if (win) accounts?.cycleApp(win, 1);
    },
    prevApp: () => {
      const win = focused();
      if (win) accounts?.cycleApp(win, -1);
    },
    focusAddress: () => focused()?.webContents.send("menu:focus-address"),
    find: () => {
      const win = focused();
      if (win) accounts?.openFind(win);
    },
    bookmarkPage: () => {
      const win = focused();
      if (win) accounts?.bookmarkActivePage(win);
    },
    showHistory: () => focused()?.webContents.send("menu:history"),
    openPalette: () => focused()?.webContents.send("menu:palette"),
    print: () => {
      const win = focused();
      if (win) accounts?.printActive(win);
    },
    // macOS shows its own "use Flit as your default browser?" confirmation.
    setDefaultBrowser: () => {
      electron.app.setAsDefaultProtocolClient("http");
      electron.app.setAsDefaultProtocolClient("https");
    },
    switchToIndex: (index) => {
      const win = electron.BrowserWindow.getFocusedWindow();
      if (win) accounts?.setActiveByIndex(win, index);
    },
    zoomIn: () => accounts?.zoomIn(),
    zoomOut: () => accounts?.zoomOut(),
    zoomReset: () => accounts?.zoomReset(),
    layout: accounts?.getLayout() ?? "left",
    setLayout: (layout) => {
      accounts?.setLayout(layout);
      installMenu();
    },
    bookmarksBar: accounts?.getBookmarksBarVisible() ?? false,
    toggleBookmarksBar: () => {
      accounts?.setBookmarksBarVisible(!accounts.getBookmarksBarVisible());
      installMenu();
    },
    importBookmarks: () => electron.BrowserWindow.getFocusedWindow()?.webContents.send("menu:import-bookmarks")
  });
}
function persistNow() {
  state = buildState();
  saveState(state);
}
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}
function createWindow() {
  const isFirst = electron.BrowserWindow.getAllWindows().length === 0;
  const win = new electron.BrowserWindow({
    width: state.window?.width ?? 1280,
    height: state.window?.height ?? 800,
    // Only the first window restores the saved position; extra windows cascade.
    x: isFirst ? state.window?.x : void 0,
    y: isFirst ? state.window?.y : void 0,
    title: "Flit",
    show: false,
    backgroundColor: prefs?.windowBackground() ?? "#202124",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 8 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.on("ready-to-show", () => win.show());
  win.on("resize", schedulePersist);
  win.on("move", schedulePersist);
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  win.webContents.once("did-finish-load", () => {
    accounts?.registerWindow(win, state.activeAccountId);
    for (const url of pendingUrls.splice(0)) accounts?.openUrlInActiveAccount(url);
  });
}
const gotInstanceLock = electron.app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  electron.app.quit();
}
electron.app.on("second-instance", () => {
  if (accounts) createWindow();
});
const pendingUrls = [];
electron.app.on("open-url", (event, url) => {
  event.preventDefault();
  if (accounts && electron.BrowserWindow.getAllWindows().length > 0) {
    accounts.openUrlInActiveAccount(url);
  } else {
    pendingUrls.push(url);
  }
});
electron.app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (e, url) => {
    if (isExternalProtocol(url)) {
      e.preventDefault();
      openExternalSafe(url);
    }
  });
});
electron.app.whenReady().then(() => {
  if (!gotInstanceLock) return;
  state = loadState();
  firstRun = state.firstRun === true;
  seedPasswordsApp();
  const downloads = new DownloadManager();
  downloads.load();
  ExtensionManager.handleCRXProtocol();
  const extensions = new ExtensionManager();
  const history = new HistoryManager();
  history.load();
  historyRef = history;
  accounts = new AccountManager(schedulePersist, downloads, extensions, history);
  extensions.setDelegate(accounts);
  prefs = new PrefsManager(state.prefs);
  prefs.start((p) => {
    accounts?.setBrowsingPrefs(p);
    downloads.configure(p);
    schedulePersist();
  });
  const omnibox = new OmniboxManager(accounts, history, prefs);
  registerIpc(accounts, createWindow, downloads, prefs, extensions, omnibox, history, {
    get: () => firstRun,
    clear: () => {
      firstRun = false;
      persistNow();
    }
  });
  const configs = [...state.accounts].sort((a, b) => a.order - b.order).map((a) => ({
    id: a.id,
    label: a.label,
    color: a.color,
    homeUrl: a.homeUrl,
    lastUrl: a.lastUrl,
    shortcuts: a.shortcuts,
    avatarUrl: a.avatarUrl,
    bookmarks: a.bookmarks,
    muted: a.muted,
    tabs: a.tabs
  }));
  accounts.loadMetadata(configs);
  if (state.zoomFactor) accounts.setZoom(state.zoomFactor);
  if (state.layout) accounts.setLayout(state.layout);
  if (state.bookmarksBar) accounts.setBookmarksBarVisible(true);
  installMenu();
  createWindow();
  startAutoUpdate();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("before-quit", persistNow);
electron.app.on("before-quit", () => historyRef?.save());
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
