import { Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * Install the application menu. Besides standard roles (so Cmd-C/V/etc. keep
 * working in the account web views), it adds Cmd-1 … Cmd-9 accelerators that
 * switch to the Nth account. Menu accelerators fire while any window/view in
 * the app is focused, which `before-input-event` on the renderer cannot do
 * once an account view has focus.
 */
export function buildAppMenu(switchToIndex: (index: number) => void): void {
  const accountItems: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: `Switch to Account ${i + 1}`,
    accelerator: `CommandOrControl+${i + 1}`,
    click: () => switchToIndex(i)
  }))

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' } as MenuItemConstructorOptions]
      : []),
    { role: 'editMenu' },
    { label: 'Accounts', submenu: accountItems },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
