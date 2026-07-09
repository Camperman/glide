import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { AppRailLayout } from '../shared/types'

export interface MenuHandlers {
  newWindow: () => void
  newIncognito: () => void
  openPreferences: () => void
  setDefaultBrowser: () => void
  switchToIndex: (index: number) => void
  newTab: () => void
  closeTab: () => void
  reopenTab: () => void
  nextTab: () => void
  prevTab: () => void
  focusAddress: () => void
  find: () => void
  bookmarkPage: () => void
  openPalette: () => void
  showHistory: () => void
  print: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  setLayout: (layout: AppRailLayout) => void
  layout: AppRailLayout
  bookmarksBar: boolean
  toggleBookmarksBar: () => void
  importBookmarks: () => void
}

/**
 * Install the application menu. Besides standard roles (so Cmd-C/V/etc. keep
 * working in the web views), it adds Cmd-1 … Cmd-9 to switch accounts, Cmd +/-/0
 * to zoom the active page, and an App Layout toggle (left rail vs top row).
 * Rebuild it (call again) when the layout changes so the radio check updates.
 */
export function buildAppMenu(handlers: MenuHandlers): void {
  const accountItems: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: `Switch to Account ${i + 1}`,
    accelerator: `CommandOrControl+${i + 1}`,
    click: () => handlers.switchToIndex(i)
  }))

  // Custom app menu: same as the stock appMenu role, plus Preferences… (Cmd-,).
  const appMenu: MenuItemConstructorOptions = {
    role: 'appMenu',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      {
        label: 'Preferences…',
        accelerator: 'Command+,',
        click: () => handlers.openPreferences()
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [appMenu] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CommandOrControl+T',
          click: () => handlers.newTab()
        },
        {
          label: 'New Window',
          accelerator: 'CommandOrControl+N',
          click: () => handlers.newWindow()
        },
        {
          label: 'New Incognito Session',
          accelerator: 'CommandOrControl+Shift+N',
          click: () => handlers.newIncognito()
        },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CommandOrControl+Shift+T',
          click: () => handlers.reopenTab()
        },
        { type: 'separator' },
        {
          label: 'Open Location…',
          accelerator: 'CommandOrControl+L',
          click: () => handlers.focusAddress()
        },
        {
          label: 'Quick Switcher…',
          accelerator: 'CommandOrControl+K',
          click: () => handlers.openPalette()
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CommandOrControl+W',
          click: () => handlers.closeTab()
        },
        { type: 'separator' },
        {
          label: 'Print…',
          accelerator: 'CommandOrControl+P',
          click: () => handlers.print()
        },
        { type: 'separator' },
        {
          label: 'Set as Default Browser…',
          click: () => handlers.setDefaultBrowser()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CommandOrControl+F',
          click: () => handlers.find()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CommandOrControl+=', click: handlers.zoomIn },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: handlers.zoomOut },
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: handlers.zoomReset },
        { type: 'separator' },
        {
          label: 'App Layout',
          submenu: [
            {
              label: 'Left Rail',
              type: 'radio',
              checked: handlers.layout === 'left',
              click: () => handlers.setLayout('left')
            },
            {
              label: 'Top Right',
              type: 'radio',
              checked: handlers.layout === 'top',
              click: () => handlers.setLayout('top')
            }
          ]
        }
      ]
    },
    {
      label: 'Bookmarks',
      submenu: [
        {
          label: 'Bookmark This Page',
          accelerator: 'CommandOrControl+D',
          click: () => handlers.bookmarkPage()
        },
        { type: 'separator' },
        {
          label: 'Show Bookmarks Bar',
          type: 'checkbox',
          checked: handlers.bookmarksBar,
          accelerator: 'CommandOrControl+Shift+B',
          click: () => handlers.toggleBookmarksBar()
        },
        { type: 'separator' },
        { label: 'Import from Chrome…', click: () => handlers.importBookmarks() }
      ]
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Show History',
          accelerator: 'CommandOrControl+Y',
          click: () => handlers.showHistory()
        }
      ]
    },
    {
      label: 'Tab',
      submenu: [
        {
          label: 'Show Next Tab',
          accelerator: 'CommandOrControl+Shift+]',
          click: () => handlers.nextTab()
        },
        {
          label: 'Show Previous Tab',
          accelerator: 'CommandOrControl+Shift+[',
          click: () => handlers.prevTab()
        },
        // Chrome-style Ctrl-Tab aliases; hidden so the menu stays tidy.
        {
          label: 'Next Tab',
          accelerator: 'Control+Tab',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => handlers.nextTab()
        },
        {
          label: 'Previous Tab',
          accelerator: 'Control+Shift+Tab',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => handlers.prevTab()
        }
      ]
    },
    { label: 'Accounts', submenu: accountItems },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        // Cmd-W belongs to Close Tab; the window closes with Cmd-Shift-W.
        { label: 'Close Window', accelerator: 'CommandOrControl+Shift+W', role: 'close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
