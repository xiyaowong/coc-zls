import { buildDiagnosticCollection, logChannel } from './extension';
import * as cp from 'child_process';
import * as vscode from 'coc.nvim';
import * as path_ from 'path';

export function zigBuild(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const textDocument = editor.document;
  if (textDocument.languageId !== 'zig') {
    return;
  }

  const config = vscode.workspace.getConfiguration('zig');
  const buildOption = config.get<string>('buildOption')!;
  const processArg: string[] = [buildOption];

  switch (buildOption) {
    case 'build':
      break;
    default:
      processArg.push(textDocument.uri);
      break;
  }

  const extraArgs = config.get<string[]>('buildArgs')!;
  extraArgs.forEach((element) => {
    processArg.push(element);
  });

  const cwd = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri || vscode.workspace.cwd;
  const buildPath = config.get<string>('zigPath') || 'zig';

  logChannel.appendLine(`Starting building the current workspace at ${cwd}`);

  cp.execFile(buildPath, processArg, { cwd }, (_err, _stdout, stderr) => {
    logChannel.appendLine(stderr);
    const diagnostics: { [id: string]: vscode.Diagnostic[] } = {};
    const regex = /(\S.*):(\d*):(\d*): ([^:]*): (.*)/g;

    buildDiagnosticCollection.clear();
    for (let match = regex.exec(stderr); match; match = regex.exec(stderr)) {
      let path = match[1].trim();
      try {
        if (!path.includes(cwd)) {
          path = path_.resolve(cwd, path);
        }
      } catch {}
      const line = parseInt(match[2]) - 1;
      const column = parseInt(match[3]) - 1;
      const type = match[4];
      const message = match[5];

      const severity =
        type.trim().toLowerCase() === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Information;

      const range = vscode.Range.create(line, column, line, Infinity);

      if (diagnostics[path] == null) diagnostics[path] = [];
      diagnostics[path].push(vscode.Diagnostic.create(range, message, severity));
    }

    for (const path in diagnostics) {
      const diagnostic = diagnostics[path];
      buildDiagnosticCollection.set(vscode.Uri.file(path).toString(), diagnostic);
    }
  });
}
