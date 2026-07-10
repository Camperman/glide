import { BrowserWindow, WebContentsView, nativeTheme, screen } from 'electron'

const BUBBLE_HEIGHT = 24
const BUBBLE_PAD = 20 // horizontal text padding inside the bubble
const EDGE_INSET = 8 // matches CONTENT_INSET (the content card gutter)

// Static, script-free document; main sets text/theme via executeJavaScript.
const BUBBLE_DOC =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;overflow:hidden;user-select:none;cursor:default}
      body{display:flex;align-items:center;height:100vh;
        font:12px -apple-system,BlinkMacSystemFont,sans-serif}
      body[data-theme="dark"]{background:#202124;color:#e8eaed}
      body[data-theme="light"]{background:#f1f3f4;color:#202124}
      #t{padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    </style><body><span id="t"></span></body>`
  )

interface BubbleWindow {
  view: WebContentsView
  ready: Promise<unknown>
  token: number
}

/**
 * Chrome's bottom-left hovered-link readout. DOM can't paint over the native
 * account views (same constraint as the omnibox dropdown), so the bubble is
 * its own tiny trusted WebContentsView floated over the page's bottom-left
 * corner — and, like Chrome, it dodges to the bottom-right when the cursor
 * is already in that corner (otherwise it would flicker under the pointer).
 */
export class StatusBubble {
  private readonly windows = new Map<number, BubbleWindow>()

  private forWindow(win: BrowserWindow): BubbleWindow {
    let bw = this.windows.get(win.id)
    if (bw) return bw
    const view = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    })
    view.setBorderRadius(8)
    view.setVisible(false)
    bw = { view, ready: view.webContents.loadURL(BUBBLE_DOC).catch(() => {}), token: 0 }
    this.windows.set(win.id, bw)
    win.on('closed', () => this.windows.delete(win.id))
    win.on('resize', () => this.hide(win))
    return bw
  }

  /** Show `url` at the content's bottom-left (`contentLeft` = chrome columns
   *  to the left of the page). */
  show(win: BrowserWindow, url: string, contentLeft: number): void {
    const bw = this.forWindow(win)
    const token = ++bw.token
    const dark = nativeTheme.shouldUseDarkColors
    void bw.ready
      .then(() =>
        bw.view.webContents.executeJavaScript(
          `(() => {
            document.body.dataset.theme = ${JSON.stringify(dark ? 'dark' : 'light')};
            const t = document.getElementById('t');
            t.textContent = ${JSON.stringify(url)};
            return Math.ceil(t.scrollWidth);
          })()`,
          true
        )
      )
      .then((textWidth: number) => {
        if (token !== bw.token || win.isDestroyed()) return
        const [winW, winH] = win.getContentSize()
        const width = Math.min(textWidth + BUBBLE_PAD, Math.floor(winW * 0.5))
        let x = contentLeft + EDGE_INSET
        const y = winH - EDGE_INSET - BUBBLE_HEIGHT

        // Cursor dodge: if the pointer is already in the bottom-left corner,
        // show the bubble bottom-right instead.
        const pt = screen.getCursorScreenPoint()
        const wb = win.getContentBounds()
        const cx = pt.x - wb.x
        const cy = pt.y - wb.y
        if (cx < x + width + 32 && cy > y - 32) {
          x = winW - EDGE_INSET - width
        }

        bw.view.setBounds({ x, y, width, height: BUBBLE_HEIGHT })
        win.contentView.addChildView(bw.view) // re-append → stays above page views
        bw.view.setVisible(true)
      })
      .catch(() => {})
  }

  hide(win: BrowserWindow): void {
    const bw = this.windows.get(win.id)
    if (!bw) return
    bw.token++
    bw.view.setVisible(false)
  }
}
