import { commands, ExtensionContext, window } from 'coc.nvim';
import { Zls } from './zls';

function registerCommand(command: string, impl: (...args: any[]) => void) {
  commands.registerCommand(`zls.${command}`, impl);
}

let zls: Zls | undefined;

export async function activate(context: ExtensionContext) {
  zls = new Zls(context);

  registerCommand('install', async () => {
    await zls?.stopClient();
    await zls?.install();
    await zls?.startServer();
  });

  if (!zls.resolveBin()) {
    const ok = await window.showPrompt('Install zls?');
    if (ok) {
      await zls.install();
    } else {
      window.showInformationMessage("You can set 'zls.path' or run command 'zls.install':)");
      return;
    }
  }

  await zls.startServer();

  registerCommand('start', async () => {
    await zls?.startServer();
  });

  registerCommand('stop', async () => {
    await zls?.stopClient();
  });

  registerCommand('restart', async () => {
    await zls?.stopClient();
    await zls?.startServer();
  });
}

export function deactivate() {
  zls?.stopClient();
}
