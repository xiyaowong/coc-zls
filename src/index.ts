import * as coc from 'coc.nvim'
import { CLIENT_ID, createZlsClient, setActiveClient, stopClient } from './client'
import { ensureZlsExists, reinstallZls } from './installer'

const RESTART_CONFIGURATION_KEYS = [
  'zls.path',
  'zls.logFile',
  'zls.logLevel',
  'zls.disableLspLogs',
  'zls.format.enable',
]

const startClient = async (storagePath: string): Promise<void> => {
  await stopClient()

  const command = await ensureZlsExists(storagePath)
  if (!command) {
    return
  }

  const client = createZlsClient(command)
  setActiveClient(client, coc.services.registerLanguageClient(client))
  // Registered services start lazily when a matching document is opened, which already happened
  // before this extension activates, so start it explicitly.
  await coc.services.getService(CLIENT_ID)?.start()
}

export async function activate(context: coc.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    coc.commands.registerCommand('zls.reinstall', async () => {
      await stopClient()
      if (await reinstallZls(context.storagePath)) {
        await startClient(context.storagePath)
      }
    }),
    coc.commands.registerCommand('zls.restart', async () => {
      await startClient(context.storagePath)
    }),
    coc.commands.registerCommand('zls.stop', async () => {
      await stopClient()
    }),
    coc.workspace.onDidChangeConfiguration(async (change) => {
      if (RESTART_CONFIGURATION_KEYS.some(key => change.affectsConfiguration(key))) {
        await startClient(context.storagePath)
      }
    }),
  )

  await startClient(context.storagePath)
}

export function deactivate(): void {
  void stopClient()
}
