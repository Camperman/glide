import { Menu, type MenuItemConstructorOptions } from 'electron'

export interface MenuHandlers {
  switchToIndex: (index: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
}

/**
 * Install the application menu. Besides standard roles (so Cmd-C/V/etc. keep
 * working in the web views), it adds Cmd-1 … Cmd-9 to switch accounts and
 * Cmd +/-/0 to zoom the active page. Menu accelerators fire while any
 * window/view in the app is focused — including when a page (tab) has focus,
 * which is why zoom is wired here rather than in the renderer.
 */
export function buildAppMenu(handlers: MenuHandlers): void {
  const accountItems: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: `Switch to Account ${i + 1}`,
    accelerator: `CommandOrControl+${i + 1}`,
    click: () => handlers.switchToIndex(i)
  }))

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' } as MenuItemConstructorOptions]
      : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CommandOrControl+=', click: handlers.zoomIn },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: handlers.zoomOut },
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: handlers.zoomReset }
      ]
    },
    { label: 'Accounts', submenu: accountItems },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
