import {
  commands,
  ExtensionContext,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  services,
  window,
  workspace,
} from 'coc.nvim';

function registerCommand(command: string, impl: (...args: any[]) => void) {
  commands.registerCommand(`zls.${command}`, impl);
}

export async function activate(context: ExtensionContext): Promise<void> {
  const config = workspace.getConfiguration('zls');
  const serverPath = config.get<string>('serverPath', 'zls');
  const debugLog = config.get<boolean>('debugLog', false);

  if ((await workspace.nvim.call('executable', serverPath)) != 1) {
    window.showErrorMessage(`The ${serverPath} is not executable`);
    return;
  }

  const serverOptions: ServerOptions = {
    command: serverPath,
    args: debugLog ? ['--debug-log'] : [],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'zig' }],
  };

  const client = new LanguageClient('zls', 'Zig Language Server', serverOptions, clientOptions);
  context.subscriptions.push(services.registLanguageClient(client));

  // commands
  registerCommand('start', () => {
    if (client.needsStart()) client.start();
  });

  registerCommand('stop', async () => {
    if (client.needsStop()) await client.stop();
  });

  registerCommand('restart', async () => {
    if (client.needsStop()) await client.stop();
    if (client.needsStart()) client.start();
  });
}
