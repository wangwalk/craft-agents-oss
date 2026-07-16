import { BrowserWindow, WebContentsView, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import { mainLog } from './logger'
import type { WindowManager } from './window-manager'
import {
  OPENCONNECTOR_CONSOLE_IPC,
  type OpenConnectorConsoleShowRequest,
  type OpenConnectorConsoleViewBounds,
  type OpenConnectorConsoleViewResult,
} from '../shared/types'
import {
  classifyOpenConnectorPopup,
  isSameOpenConnectorOrigin,
  normalizeOpenConnectorConsoleBounds,
  resolveOpenConnectorConsoleUrl,
} from './openconnector-console-policy'

const CONSOLE_PARTITION = 'persist:openconnector-console'

interface ConsoleViewEntry {
  parent: BrowserWindow
  view: WebContentsView
  origin: string
  attached: boolean
  loaded: boolean
}

export class OpenConnectorConsoleViewManager {
  private readonly entries = new Map<number, ConsoleViewEntry>()
  private registered = false

  constructor(private readonly windowManager: WindowManager) {}

  registerIpc(): void {
    if (this.registered) return
    this.registered = true

    ipcMain.handle(OPENCONNECTOR_CONSOLE_IPC.SHOW, async (event, request: OpenConnectorConsoleShowRequest) => {
      return this.show(event.sender.id, request)
    })
    ipcMain.handle(OPENCONNECTOR_CONSOLE_IPC.UPDATE_BOUNDS, (event, bounds: OpenConnectorConsoleViewBounds) => {
      return this.updateBounds(event.sender.id, bounds)
    })
    ipcMain.handle(OPENCONNECTOR_CONSOLE_IPC.HIDE, (event) => this.hide(event.sender.id))
    ipcMain.handle(OPENCONNECTOR_CONSOLE_IPC.DESTROY, (event) => this.destroy(event.sender.id))
  }

  dispose(): void {
    if (this.registered) {
      for (const channel of Object.values(OPENCONNECTOR_CONSOLE_IPC)) {
        ipcMain.removeHandler(channel)
      }
      this.registered = false
    }

    for (const senderId of [...this.entries.keys()]) {
      this.destroyEntry(senderId)
    }
  }

  private async show(senderId: number, request: OpenConnectorConsoleShowRequest): Promise<OpenConnectorConsoleViewResult> {
    const resolvedUrl = resolveOpenConnectorConsoleUrl(request?.url)
    if (!resolvedUrl) return failure('OpenConnector console URL must be HTTPS or loopback HTTP')

    const bounds = normalizeOpenConnectorConsoleBounds(request?.bounds)
    if (!bounds) return failure('OpenConnector console bounds are invalid')

    const parent = this.windowManager.getWindowByWebContentsId(senderId)
    if (!parent || parent.isDestroyed()) return failure('Parent Craft window is unavailable')

    let entry = this.entries.get(senderId)
    if (entry && (entry.parent !== parent || entry.origin !== resolvedUrl.origin)) {
      this.destroyEntry(senderId)
      entry = undefined
    }

    if (!entry) {
      entry = this.createEntry(senderId, parent, resolvedUrl.origin)
    }

    if (!entry.loaded) {
      try {
        await entry.view.webContents.loadURL(resolvedUrl.url)
        entry.loaded = true
      } catch (error) {
        mainLog.warn('[openconnector-console] failed to load official console', {
          origin: resolvedUrl.origin,
          error: error instanceof Error ? error.message : String(error),
        })
        return failure('Unable to load the official OpenConnector console')
      }
    }

    this.attach(entry)
    entry.view.setBounds(bounds)
    entry.view.setVisible(true)
    return { success: true }
  }

  private updateBounds(senderId: number, value: OpenConnectorConsoleViewBounds): OpenConnectorConsoleViewResult {
    const entry = this.entries.get(senderId)
    if (!entry || !entry.attached) return failure('OpenConnector console is not visible')
    const bounds = normalizeOpenConnectorConsoleBounds(value)
    if (!bounds) return failure('OpenConnector console bounds are invalid')
    entry.view.setBounds(bounds)
    return { success: true }
  }

  private hide(senderId: number): OpenConnectorConsoleViewResult {
    const entry = this.entries.get(senderId)
    if (!entry) return { success: true }
    this.detach(entry)
    return { success: true }
  }

  private destroy(senderId: number): OpenConnectorConsoleViewResult {
    this.destroyEntry(senderId)
    return { success: true }
  }

  private createEntry(senderId: number, parent: BrowserWindow, origin: string): ConsoleViewEntry {
    const view = new WebContentsView({
      webPreferences: {
        partition: CONSOLE_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    })
    view.setBackgroundColor('#00000000')

    const entry: ConsoleViewEntry = {
      parent,
      view,
      origin,
      attached: false,
      loaded: false,
    }
    this.entries.set(senderId, entry)

    view.webContents.session.setPermissionCheckHandler(() => false)
    view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    this.configureNavigation(entry)
    parent.once('closed', () => this.destroyEntry(senderId))
    return entry
  }

  private configureNavigation(entry: ConsoleViewEntry): void {
    const { view, origin } = entry
    const guardNavigation = (event: Electron.Event, url: string) => {
      if (isSameOpenConnectorOrigin(url, origin)) return
      event.preventDefault()
      if (classifyOpenConnectorPopup(url, '') === 'external') {
        void shell.openExternal(url).catch((error) => {
          mainLog.warn('[openconnector-console] failed to open external navigation', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }
    }

    view.webContents.on('will-navigate', guardNavigation)
    view.webContents.on('will-redirect', guardNavigation)
    view.webContents.setWindowOpenHandler((details) => {
      const disposition = classifyOpenConnectorPopup(details.url, details.frameName)
      if (disposition === 'oauth-popup') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 720,
            autoHideMenuBar: true,
            webPreferences: {
              partition: CONSOLE_PARTITION,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              webSecurity: true,
            },
          },
        }
      }

      if (disposition === 'external') {
        void shell.openExternal(details.url).catch((error) => {
          mainLog.warn('[openconnector-console] failed to open external link', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }
      return { action: 'deny' }
    })

    view.webContents.on('did-create-window', (child) => this.secureChildWindow(child.webContents))
  }

  private secureChildWindow(contents: WebContents): void {
    contents.setWindowOpenHandler((details) => {
      if (classifyOpenConnectorPopup(details.url, '') === 'external') {
        void shell.openExternal(details.url)
      }
      return { action: 'deny' }
    })
  }

  private attach(entry: ConsoleViewEntry): void {
    if (entry.attached || entry.parent.isDestroyed()) return
    entry.parent.contentView.addChildView(entry.view)
    entry.attached = true
  }

  private detach(entry: ConsoleViewEntry): void {
    if (!entry.attached) return
    if (!entry.parent.isDestroyed()) {
      try {
        entry.parent.contentView.removeChildView(entry.view)
      } catch {
        // Parent teardown may already have detached native child views.
      }
    }
    entry.view.setVisible(false)
    entry.attached = false
  }

  private destroyEntry(senderId: number): void {
    const entry = this.entries.get(senderId)
    if (!entry) return
    this.entries.delete(senderId)
    this.detach(entry)
    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close()
    }
  }
}

function failure(error: string): OpenConnectorConsoleViewResult {
  return { success: false, error }
}
