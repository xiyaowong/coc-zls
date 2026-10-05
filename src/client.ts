import * as coc from 'coc.nvim'
import { getConfiguration, getOptionalString } from './util'

export const CLIENT_ID = 'zls'

const DOCUMENT_SELECTOR: coc.DocumentSelector = ['zig']

const serverArguments = (): string[] => {
  const config = getConfiguration()
  const args: string[] = []

  const logFile = getOptionalString('logFile')
  if (logFile) {
    args.push('--log-file', logFile)
  }

  const logLevel = config.get<string>('logLevel', 'info')
  if (logLevel !== 'info') {
    args.push('--log-level', logLevel)
  }

  if (config.get<boolean>('disableLspLogs', false)) {
    args.push('--disable-lsp-logs')
  }

  return args
}

export const createZlsClient = (command: string): coc.LanguageClient => {
  const clientOptions: coc.LanguageClientOptions = {
    documentSelector: DOCUMENT_SELECTOR,
    outputChannelName: 'zls',
    formatterPriority: 999,
  }
  if (!getConfiguration().get<boolean>('format.enable', true)) {
    clientOptions.disabledFeatures = ['documentFormatting', 'documentRangeFormatting', 'documentOnTypeFormatting']
  }

  return new coc.LanguageClient(
    CLIENT_ID,
    'Zig Language Server',
    { command, args: serverArguments() },
    clientOptions,
  )
}

let active: { client: coc.LanguageClient, registration: coc.Disposable } | undefined

export const setActiveClient = (client: coc.LanguageClient, registration: coc.Disposable): void => {
  active = { client, registration }
}

export const stopClient = async (): Promise<void> => {
  const current = active
  active = undefined

  // `services.registerLanguageClient` disposes the client, which stops the server.
  current?.registration.dispose()
  if (current?.client.needsStop()) {
    await current.client.stop().catch(() => undefined)
  }
}
