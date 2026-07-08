import { BrowserWindow, app, session, type Session, type WebContents } from 'electron'
import { join } from 'path'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore } from 'electron-chrome-web-store'
import { partitionFor } from './accounts'

/**
 * How the extension system reaches back into Glide's tab model. Implemented by
 * AccountManager; wired in index.ts (avoids a circular construction).
 */
export interface ExtensionTabDelegate {
  /** Open a URL as a new tab of the account; returns the tab's wc + window. */
  openExtensionTab(accountId: string, url: string): [WebContents, BrowserWindow] | undefined
  /** An extension asked to focus this tab (chrome.tabs.update {active}). */
  selectExtensionTab(wc: WebContents): void
  /** An extension asked to close this tab (chrome.tabs.remove). */
  closeExtensionTab(wc: WebContents): void
}

/**
 * Chrome-extension support, one isolated extension environment per account
 * partition (like Chrome profiles). Installs come from the Chrome Web Store
 * visited inside a Glide tab; installed extensions persist under
 * userData/Extensions/<accountId> and reload at startup.
 */
export class ExtensionManager {
  private readonly instances = new Map<string, ElectronChromeExtensions>()
  private delegate?: ExtensionTabDelegate

  /** Serve crx:// (extension icons for the toolbar UI). Call once at startup. */
  static handleCRXProtocol(): void {
    ElectronChromeExtensions.handleCRXProtocol(session.defaultSession)
  }

  setDelegate(delegate: ExtensionTabDelegate): void {
    this.delegate = delegate
  }

  /** Create the per-account extension environment (called from addMeta). */
  attach(ses: Session, accountId: string): void {
    if (this.instances.has(accountId)) return

    const extensions = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: ses,
      createTab: async (details) => {
        const created = this.delegate?.openExtensionTab(accountId, details.url ?? 'about:blank')
        if (!created) throw new Error('no window available to open a tab in')
        return created
      },
      selectTab: (wc) => this.delegate?.selectExtensionTab(wc),
      removeTab: (wc) => this.delegate?.closeExtensionTab(wc),
      createWindow: async (details) => {
        const win = new BrowserWindow({
          width: details.width ?? 900,
          height: details.height ?? 700,
          webPreferences: {
            partition: partitionFor(accountId),
            contextIsolation: true,
            nodeIntegration: false
          }
        })
        const url = Array.isArray(details.url) ? details.url[0] : details.url
        if (url) void win.loadURL(url)
        return win
      }
    })
    this.instances.set(accountId, extensions)

    // Chrome Web Store installs + persistence + auto-update for this profile.
    void installChromeWebStore({
      session: ses,
      extensionsPath: join(app.getPath('userData'), 'Extensions', accountId)
    })
  }

  /** Register a freshly created tab view with the account's extension system. */
  addTab(accountId: string, wc: WebContents, win: BrowserWindow): void {
    this.instances.get(accountId)?.addTab(wc, win)
  }

  /** Tell the extension system which tab is now active/visible. */
  selectTab(accountId: string, wc: WebContents): void {
    this.instances.get(accountId)?.selectTab(wc)
  }
}

