import { contextBridge, ipcRenderer } from 'electron'

// Minimal bridge for the omnibox suggestions view (trusted internal page).
contextBridge.exposeInMainWorld('sug', {
  onRender: (cb: (payload: unknown) => void) => {
    ipcRenderer.on('sug:render', (_e, payload) => cb(payload))
  },
  onSelect: (cb: (index: number) => void) => {
    ipcRenderer.on('sug:select', (_e, index: number) => cb(index))
  },
  click: (index: number) => ipcRenderer.send('sug:click', index)
})
