import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  executable,
  ExtensionContext,
  LanguageClient,
  LanguageClientOptions,
  OutputChannel,
  ServerOptions,
  services,
  window,
  workspace,
  WorkspaceConfiguration,
} from 'coc.nvim';
import { chmodSync, existsSync, writeFileSync } from 'fs';
import mkdirp from 'mkdirp';
import path from 'path';

const downloadsRoot = 'https://zig.pm/zls/downloads';

enum InstallationName {
  i386_linux = 'i386-linux',
  i386_windows = 'i386-windows',
  x86_64_linux = 'x86_64-linux',
  x86_64_macos = 'x86_64-macos',
  x86_64_windows = 'x86_64-windows',
}

function getDefaultInstallationName(): InstallationName | null {
  const plat = process.platform;
  const arch = process.arch;
  if (arch === 'ia32') {
    if (plat === 'linux') return InstallationName.i386_linux;
    else if (plat === 'win32') return InstallationName.i386_windows;
  } else if (arch === 'x64') {
    if (plat === 'linux') return InstallationName.x86_64_linux;
    else if (plat === 'darwin') return InstallationName.x86_64_macos;
    else if (plat === 'win32') return InstallationName.x86_64_windows;
  }
  return null;
}

export class Zls {
  private ctx: ExtensionContext;
  private cfg!: WorkspaceConfiguration;
  private outputChannel!: OutputChannel;
  private client: LanguageClient | undefined;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.cfg = workspace.getConfiguration('zls');
    this.outputChannel = window.createOutputChannel('zls');
  }

  resolveBin(): [string, string[]] | undefined {
    let zlsPath: string;
    // custom
    zlsPath = this.cfg.get<string>('path')!;
    if (zlsPath && !executable(zlsPath)) {
      window.showErrorMessage(`${zlsPath} is not executable!`);
      return;
    } else {
      // installed
      const def = getDefaultInstallationName();
      if (!def) return;
      zlsPath = path.join(this.ctx.storagePath, `zls${def.endsWith('windows') ? '.exe' : ''}`);
      if (!existsSync(zlsPath)) return;
    }

    const debugLog = this.cfg.get<boolean>('debugLog')!;
    return [zlsPath, debugLog ? ['--debug-log'] : []];
  }

  async install() {
    const def = getDefaultInstallationName();
    if (!def) {
      window.showInformationMessage(
        `Your system isn't built by our CI!\nPlease follow the instructions [here](https://github.com/zigtools/zls#from-source) to get started!`
      );
      return;
    }

    const agent = process.env.https_proxy ? new HttpsProxyAgent(process.env.https_proxy as string) : null;
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.114 Safari/537.36 Edg/103.0.1264.62',
    };
    return window.withProgress(
      {
        title: 'Installing zls...',
      },
      async (progress) => {
        progress.report({ message: 'Downloading build runner...' });
        const buildRunner = await (
          await fetch(`${downloadsRoot}/${def}/bin/build_runner.zig`, {
            headers,
            timeout: 10e3,
            // @ts-ignore
            agent,
          })
        ).text();

        progress.report({ message: 'Downloading zls executable...' });
        const exe = await (
          await fetch(`${downloadsRoot}/${def}/bin/zls${def.endsWith('windows') ? '.exe' : ''}`, {
            headers,
            timeout: 10e3,
            // @ts-ignore
            agent,
          })
        ).buffer();

        progress.report({ message: 'Installing...' });
        const installDir = this.ctx.storagePath;
        if (!existsSync(installDir)) mkdirp.sync(installDir);

        const zlsBinPath = path.join(installDir, `zls${def.endsWith('windows') ? '.exe' : ''}`);

        writeFileSync(path.join(installDir, `build_runner.zig`), buildRunner);
        writeFileSync(zlsBinPath, exe, 'binary');
        chmodSync(zlsBinPath, 0o755);
      }
    );
  }

  createClient() {
    const bin = this.resolveBin();
    if (!bin) return;
    const [command, args] = bin;
    const serverOptions: ServerOptions = { command, args };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'zig' }],
      outputChannel: this.outputChannel,
      progressOnInitialization: true,
    };
    return new LanguageClient('zls', 'Zig Language Server', serverOptions, clientOptions);
  }

  async startServer() {
    if (this.client) {
      if (this.client.needsStart()) this.client.start();
    } else {
      const client = this.createClient();
      if (!client) return;
      this.ctx.subscriptions.push(services.registLanguageClient(client));
      await client.onReady();
      this.client = client;
    }
  }

  async stopClient() {
    if (this.client && this.client.needsStop()) await this.client.stop();
  }
}
