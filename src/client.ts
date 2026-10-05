import * as coc from 'coc.nvim'

export const CLIENT_ID = 'zls'

const DOCUMENT_SELECTOR: coc.DocumentSelector = ['zig']

export const createZlsClient = (command: string): coc.LanguageClient =>
  new coc.LanguageClient(
    CLIENT_ID,
    'Zig Language Server',
    { command, args: [] },
    {
      documentSelector: DOCUMENT_SELECTOR,
      outputChannelName: 'zls',
      // zls owns Zig formatting: let it win over any editor-side formatter so coc applies its edits.
      formatterPriority: 999,
    },
  )
