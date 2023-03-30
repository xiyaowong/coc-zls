import { workspace, ExtensionContext, window } from 'coc.nvim';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as vscode from 'coc.nvim';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'coc.nvim';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import which from 'which';
import mkdirp from 'mkdirp';
import * as child_process from 'child_process';
import camelCase from 'camelcase';

const headers = { 'User-Agent': 'VSCode' };
function getAgent() {
  return process.env.https_proxy ? new HttpsProxyAgent(process.env.https_proxy as string) : undefined;
}

export let outputChannel: vscode.OutputChannel;
export let client: LanguageClient | null = null;

export const downloadsRoot = 'https://zig.pm/zls/downloads';

/* eslint-disable @typescript-eslint/naming-convention */
export enum InstallationName {
  x86_linux = 'x86-linux',
  x86_windows = 'x86-windows',
  x86_64_linux = 'x86_64-linux',
  x86_64_macos = 'x86_64-macos',
  x86_64_windows = 'x86_64-windows',
  arm_64_macos = 'aarch64-macos',
  arm_64_linux = 'aarch64-linux',
}
/* eslint-enable @typescript-eslint/naming-convention */

export function getDefaultInstallationName(): InstallationName | null {
  // NOTE: Not using a JS switch because they're very clunky :(

  const plat = process.platform;
  const arch = process.arch;
  if (arch === 'ia32') {
    if (plat === 'linux') return InstallationName.x86_linux;
    else if (plat === 'win32') return InstallationName.x86_windows;
  } else if (arch === 'x64') {
    if (plat === 'linux') return InstallationName.x86_64_linux;
    else if (plat === 'darwin') return InstallationName.x86_64_macos;
    else if (plat === 'win32') return InstallationName.x86_64_windows;
  } else if (arch === 'arm64') {
    if (plat === 'darwin') return InstallationName.arm_64_macos;
    if (plat === 'linux') return InstallationName.arm_64_linux;
  }

  return null;
}

export async function installExecutable(context: ExtensionContext): Promise<string | null> {
  const def = getDefaultInstallationName();
  if (!def) {
    window.showInformationMessage(
      `Your system isn"t built by our CI!\nPlease follow the instructions [here](https://github.com/zigtools/zls#from-source) to get started!`
    );
    return null;
  }
  return window.withProgress(
    {
      title: 'Installing zls...',
    },
    async (progress) => {
      progress.report({ message: 'Downloading zls executable...' });
      const exe = await (
        await fetch(`${downloadsRoot}/${def}/bin/zls${def.endsWith('windows') ? '.exe' : ''}`, {
          // timeout: 10e3,
          agent: getAgent(),
          headers,
        })
      ).buffer();

      progress.report({ message: 'Installing...' });
      const installDir = path.join(context.storagePath, 'zls_install');
      if (!fs.existsSync(installDir)) mkdirp.sync(installDir);

      const zlsBinPath = path.join(installDir, `zls${def.endsWith('windows') ? '.exe' : ''}`);
      const zlsBinTempPath = zlsBinPath + '.tmp';

      // Create a new executable file.
      // Do not update the existing file in place, to avoid code-signing crashes on macOS.
      // https://developer.apple.com/documentation/security/updating_mac_software
      fs.writeFileSync(zlsBinTempPath, exe, 'binary');
      fs.chmodSync(zlsBinTempPath, 0o755);
      fs.renameSync(zlsBinTempPath, zlsBinPath);

      const config = workspace.getConfiguration('zig.zls');
      config.update('path', zlsBinPath, true);

      return zlsBinPath;
    }
  );
}

export async function checkUpdateMaybe(context: ExtensionContext) {
  const configuration = workspace.getConfiguration('zig.zls');
  const checkForUpdate = configuration.get<boolean>('checkForUpdate', true);
  if (checkForUpdate) {
    try {
      await checkUpdate(context, true);
    } catch (err: any) {
      outputChannel.appendLine(`Failed to check for update. Reason: ${err.message}`);
    }
  }
}

export async function startClient(context: ExtensionContext) {
  const configuration = workspace.getConfiguration('zig.zls');
  const debugLog = configuration.get<boolean>('debugLog', false);

  const zlsPath = await getZLSPath(context);

  if (!zlsPath) {
    promptAfterFailure(context);
    return null;
  }

  const serverOptions: ServerOptions = {
    command: zlsPath,
    args: debugLog ? ['--enable-debug-log'] : [],
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    disabledFeatures:
      workspace.getConfiguration('zig').get<string>('formattingProvider', 'zls') !== 'zls'
        ? ['textDocument/formatting']
        : [],
    documentSelector: [{ scheme: 'file', language: 'zig' }],
    progressOnInitialization: true,
    outputChannel,
    middleware: {
      workspace: {
        configuration: async (params, token, next) => {
          let indexOfAstCheck = '';

          for (const [index, param] of Object.entries(params.items)) {
            if (param.section === 'zls.zig_exe_path') {
              param.section = `zig.zigPath`;
            } else if (param.section === 'zls.enable_ast_check_diagnostics') {
              indexOfAstCheck = index;
            } else {
              param.section = `zig.zls.${camelCase(param.section!.slice(4))}`;
            }
          }

          const result = await next(params, token);

          if (indexOfAstCheck !== null) {
            result[indexOfAstCheck] =
              workspace.getConfiguration('zig').get<string>('astCheckProvider', 'zls') === 'zls';
          }

          return result;
        },
      },
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient('zls', 'Zig Language Server', serverOptions, clientOptions);

  try {
    client.start();
    await client.onReady();
  } catch (reason: any) {
    window.showWarningMessage(`Failed to run Zig Language Server (ZLS): ${reason}`);
    client = null;
  }
}

export async function stopClient(): Promise<void> {
  if (client) client.stop();
  client = null;
}

export async function promptAfterFailure(context: ExtensionContext): Promise<string | null> {
  const configuration = workspace.getConfiguration('zig.zls');
  const response = await window.showWarningMessage(
    "Couldn't find Zig Language Server (ZLS) executable",
    'Install ZLS',
    'Specify Path'
  );

  if (response === 'Install ZLS') {
    return await installExecutable(context);
  } else if (response === 'Specify Path') {
    const uri = await window.requestInput('Input path of Zig Language Server (ZLS) executable');
    if (uri) {
      configuration.update('path', uri, true);
      return uri;
    }
  }

  return null;
}

// returns the file system path to the zls executable
export async function getZLSPath(_context: ExtensionContext): Promise<string | null> {
  const configuration = workspace.getConfiguration('zig.zls');
  let zlsPath = configuration.get<string | null>('path', null);

  // Allow passing the ${workspaceFolder} predefined variable
  // See https://code.visualstudio.com/docs/editor/variables-reference#_predefined-variables
  if (zlsPath && zlsPath.includes('${workspaceFolder}')) {
    // We choose the first workspaceFolder since it is ambiguous which one to use in this context
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
      // older versions of Node (which VSCode uses) may not have String.prototype.replaceAll
      zlsPath = zlsPath.replace(/\$\{workspaceFolder\}/gm, workspace.workspaceFolders[0].uri);
    }
  }

  if (!zlsPath) {
    zlsPath = which.sync('zls', { nothrow: true });
  } else if (zlsPath.startsWith('~')) {
    zlsPath = path.join(os.homedir(), zlsPath.substring(1));
  } else if (!path.isAbsolute(zlsPath)) {
    zlsPath = which.sync(zlsPath, { nothrow: true });
  }

  let message: string | null = null;

  const zlsPathExists = zlsPath !== null && fs.existsSync(zlsPath);
  if (zlsPath && zlsPathExists) {
    try {
      fs.accessSync(zlsPath, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
      message = `\`zls.path\` ${zlsPath} is not an executable`;
    }
    const stat = fs.statSync(zlsPath);
    if (!stat.isFile()) {
      message = `\`zls.path\` ${zlsPath} is not a file`;
    }
  }

  if (message === null) {
    if (!zlsPath) {
      return null;
    } else if (!zlsPathExists) {
      message = `Couldn't find Zig Language Server (ZLS) executable at "${zlsPath.replace(/"/gm, '\\"')}"`;
    }
  }

  if (message) {
    await window.showErrorMessage(message);
    return null;
  }

  return zlsPath;
}

export async function checkUpdate(context: ExtensionContext, autoInstallPrebuild: boolean): Promise<void> {
  const configuration = workspace.getConfiguration('zig.zls');

  const zlsPath = await getZLSPath(context);
  if (!zlsPath) return;

  if (!(await isUpdateAvailable(zlsPath))) return;

  const isPrebuild = await isZLSPrebuildBinary(context);

  if (autoInstallPrebuild && isPrebuild) {
    await installExecutable(context);
  } else {
    const message = `There is a new update available for ZLS. ${
      !isPrebuild ? 'It would replace your installation with a prebuilt binary.' : ''
    }`;
    const response = await window.showInformationMessage(message, 'Install update', 'Never ask again');

    if (response === 'Install update') {
      await installExecutable(context);
    } else if (response === 'Never ask again') {
      configuration.update('checkForUpdate', false, true);
    }
  }
}

// checks whether zls has been installed with `installExecutable`
export async function isZLSPrebuildBinary(context: ExtensionContext): Promise<boolean> {
  const configuration = workspace.getConfiguration('zig.zls');
  const zlsPath = configuration.get<string | null>('path', null);
  if (!zlsPath) return false;

  const zlsBinPath = path.join(context.storagePath, 'zls_install', 'zls');
  return zlsPath.startsWith(zlsBinPath);
}

// checks whether there is newer version on master
export async function isUpdateAvailable(zlsPath: string): Promise<boolean | null> {
  // get current version
  const buffer = child_process.execFileSync(zlsPath, ['--version']);
  const version = parseVersion(buffer.toString('utf8'));
  if (!version) return null;

  // compare version triple if commit id is available
  if (version.commitHeight === null || version.commitHash === null) {
    // get latest tagged version
    const tagsResponse = await fetch('https://api.github.com/repos/zigtools/zls/tags', { agent: getAgent() });
    const data = await tagsResponse.json();
    const latestVersion = parseVersion(data[0].name);
    if (!latestVersion) return null;

    if (latestVersion.major < version.major) return false;
    if (latestVersion.major > version.major) return true;
    if (latestVersion.minor < version.minor) return false;
    if (latestVersion.minor > version.minor) return true;
    if (latestVersion.patch < version.patch) return false;
    if (latestVersion.patch > version.patch) return true;
    return false;
  }

  const response = await fetch('https://api.github.com/repos/zigtools/zls/commits/master', {
    headers,
    timeout: 5e3,
    agent: getAgent(),
  });
  const data = await response.json();
  const masterHash: string = data.sha;

  const isMaster = masterHash.startsWith(version.commitHash);

  return !isMaster;
}

export interface Version {
  major: number;
  minor: number;
  patch: number;
  commitHeight: number | null;
  commitHash: string | null;
}

export function parseVersion(str: string): Version | null {
  const matches = /(\d+)\.(\d+)\.(\d+)(-dev\.(\d+)\+([0-9a-fA-F]+))?/.exec(str);
  //                  0   . 10   .  0  -dev .218   +d0732db
  //                                  (         optional          )?

  if (!matches) return null;
  if (matches.length !== 4 && matches.length !== 7) return null;

  return {
    major: parseInt(matches[1]),
    minor: parseInt(matches[2]),
    patch: parseInt(matches[3]),
    commitHeight: matches.length === 7 ? parseInt(matches[5]) : null,
    commitHash: matches.length === 7 ? matches[6] : null,
  };
}

export async function openConfig(context: ExtensionContext): Promise<void> {
  const zlsPath = await getZLSPath(context);
  if (!zlsPath) return;

  const buffer = child_process.execFileSync(zlsPath, ['--show-config-path']);
  const path: string = buffer.toString('utf8').trimEnd();
  await workspace.openTextDocument(vscode.Uri.file(path));
}

function isEnabled(): boolean {
  return workspace.getConfiguration('zig.zls').get<boolean>('enabled', true);
}

const zlsDisabledMessage = "zls is not enabled; if you'd like to enable it, please set 'zig.zls.enabled' to true.";
export async function activate(context: ExtensionContext) {
  outputChannel = window.createOutputChannel('Zig Language Server');

  vscode.commands.registerCommand('zig.zls.install', async () => {
    if (!isEnabled()) {
      window.showErrorMessage(zlsDisabledMessage);
      return;
    }

    await stopClient();
    await installExecutable(context);
  });

  vscode.commands.registerCommand('zig.zls.stop', async () => {
    if (!isEnabled()) {
      window.showErrorMessage(zlsDisabledMessage);
      return;
    }

    await stopClient();
  });

  vscode.commands.registerCommand('zig.zls.startRestart', async () => {
    if (!isEnabled()) {
      window.showErrorMessage(zlsDisabledMessage);
      return;
    }

    await stopClient();
    await checkUpdateMaybe(context);
    await startClient(context);
  });

  vscode.commands.registerCommand('zig.zls.openconfig', async () => {
    if (!isEnabled()) {
      window.showErrorMessage(zlsDisabledMessage);
      return;
    }

    await openConfig(context);
  });

  vscode.commands.registerCommand('zig.zls.update', async () => {
    if (!isEnabled()) {
      window.showErrorMessage(zlsDisabledMessage);
      return;
    }

    await stopClient();
    await checkUpdate(context, false);
    await startClient(context);
  });

  if (!isEnabled()) return;

  const configuration = workspace.getConfiguration('zig.zls');
  if (!configuration.get<string | null>('path', null)) {
    const response = await window.showInformationMessage(
      'We recommend enabling ZLS (the Zig Language Server) for a better editing experience. Would you like to enable it? You can always change this later by modifying `zig.zls.enabled` in your settings.',
      'Enable',
      'Disable'
    );

    if (response === 'Enable') {
      await installExecutable(context);
    } else if (response === 'Disable') {
      configuration.update('enabled', false, true);
      return;
    }
  }

  await checkUpdateMaybe(context);
  await startClient(context);
}

export async function deactivate() {
  await stopClient();
}
