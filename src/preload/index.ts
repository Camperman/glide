import { contextBridge } from 'electron'

// Minimal, typed bridge exposed to the renderer. Grows as later phases add
// IPC for switching accounts, navigation, account management, etc.
const api = {
  version: '0.0.0'
}

contextBridge.exposeInMainWorld('glide', api)

export type GlideApi = typeof api
