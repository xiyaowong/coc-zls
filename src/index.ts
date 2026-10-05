import * as coc from 'coc.nvim'
import { CLIENT_ID, createZlsClient } from './client'
import { ensureZlsExists, reinstallZls } from './installer'

let client: coc.LanguageClient | undefined
let registration: coc.Disposable | undefined

export const stopClient = async (): Promise<void> => {
  const current = client
  const currentRegistration = registration
  client = undefined
  registration = undefined

  // `services.registerLanguageClient` disposes the client, which stops the server.
  currentRegistration?.dispose()
  if (current?.needsStop()) {
    await current.stop().catch(() => undefined)
  }
}

const startClient = async (storagePath: string): Promise<void> => {
  await stopClient()

  const command = await ensureZlsExists(storagePath)
  if (!command) {
    return
  }

  client = createZlsClient(command)
  registration = coc.services.registerLanguageClient(client)
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
      if (change.affectsConfiguration('zls')) {
        await startClient(context.storagePath)
      }
    }),
  )

  await startClient(context.storagePath)
}

export function deactivate(): void {
  void stopClient()
}
