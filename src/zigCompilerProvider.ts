'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'coc.nvim';
import * as path_ from 'path';
// This will be treeshaked to only the debounce function
import { throttle } from 'lodash-es';
import { workspace } from 'coc.nvim';

export default class ZigCompilerProvider implements vscode.CodeActionProvider {
  private buildDiagnostics!: vscode.DiagnosticCollection;
  private astDiagnostics!: vscode.DiagnosticCollection;
  private dirtyChange = new WeakMap<vscode.Uri, boolean>();

  public activate(subscriptions: vscode.Disposable[]) {
    subscriptions.push(this);
    this.buildDiagnostics = vscode.languages.createDiagnosticCollection('zig');
    this.astDiagnostics = vscode.languages.createDiagnosticCollection('zig');

    // vscode.workspace.onDidOpenTextDocument(this.doCompile, this, subscriptions);
    // vscode.workspace.onDidCloseTextDocument(
    //   (textDocument) => {
    //     this.diagnosticCollection.delete(textDocument.uri);
    //   },
    //   null,
    //   subscriptions
    // );

    // vscode.workspace.onDidSaveTextDocument(this.doCompile, this);
    vscode.workspace.onDidChangeTextDocument(this.maybeDoASTGenErrorCheck, this);
  }

  async maybeDoASTGenErrorCheck(change: vscode.DidChangeTextDocumentParams) {
    const document = vscode.workspace.getDocument(change.textDocument.uri);
    if (document.languageId !== 'zig') return;
    if (vscode.workspace.getConfiguration('zig').get<string>('astCheckProvider', 'zls') !== 'extension') {
      this.astDiagnostics.clear();
      return;
    }
    if (!(await document.buffer.valid)) {
      this.astDiagnostics.delete(document.uri);
    }

    this.doASTGenErrorCheck(change);

    if (!document.buffer.name) {
      const config = vscode.workspace.getConfiguration('zig');
      const uri = vscode.Uri.file(document.uri);
      if (
        config.get<boolean>('buildOnSave') &&
        this.dirtyChange.has(uri) &&
        this.dirtyChange.get(uri) !== document.dirty &&
        !document.dirty
      ) {
        this.doCompile(document);
      }

      this.dirtyChange.set(uri, document.dirty);
    }
  }

  public dispose(): void {
    this.buildDiagnostics.clear();
    this.astDiagnostics.clear();
    this.buildDiagnostics.dispose();
    this.astDiagnostics.dispose();
  }

  private _doASTGenErrorCheck(change: vscode.DidChangeTextDocumentParams) {
    const config = vscode.workspace.getConfiguration('zig');
    const textDocument = workspace.getDocument(change.bufnr);
    if (textDocument.languageId !== 'zig') {
      return;
    }
    const zig_path = config.get('zigPath') || 'zig';
    const cwd = vscode.workspace.getWorkspaceFolder(textDocument.uri)?.uri || workspace.cwd;

    const childProcess = cp.spawn(zig_path as string, ['ast-check'], { cwd });

    if (!childProcess.pid) {
      return;
    }

    let stderr = '';
    childProcess.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    childProcess.stdin.end(textDocument.getDocumentContent());

    childProcess.once('close', () => {
      this.doASTGenErrorCheck.cancel();
      this.astDiagnostics.delete(textDocument.uri);

      if (stderr.length == 0) return;
      const diagnostics: { [id: string]: vscode.Diagnostic[] } = {};
      const regex = /(\S.*):(\d*):(\d*): ([^:]*): (.*)/g;

      for (let match = regex.exec(stderr); match; match = regex.exec(stderr)) {
        const path = vscode.Uri.file(textDocument.uri).fsPath;

        const line = parseInt(match[2]) - 1;
        const column = parseInt(match[3]) - 1;
        const type = match[4];
        const message = match[5];

        const severity =
          type.trim().toLowerCase() === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Information;
        const range = vscode.Range.create(line, column, line, Infinity);

        if (diagnostics[path] == null) diagnostics[path] = [];
        diagnostics[path].push(vscode.Diagnostic.create(range, message, severity));
      }

      for (const path in diagnostics) {
        const diagnostic = diagnostics[path];
        this.astDiagnostics.set(textDocument.uri, diagnostic);
      }
    });
  }

  private async _doCompile(textDocument: vscode.TextDocument) {
    const config = vscode.workspace.getConfiguration('zig');

    const buildOption = config.get<string>('buildOption')!;
    const processArg: string[] = [buildOption];
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(textDocument.uri);
    if (!workspaceFolder && vscode.workspace.workspaceFolders.length) {
      workspaceFolder = vscode.workspace.workspaceFolders[0];
    }
    const cwd = workspaceFolder?.uri || workspace.cwd;

    switch (buildOption) {
      case 'build':
        const buildFilePath = config.get<string>('buildFilePath')!;
        processArg.push('--build-file');
        try {
          processArg.push(path.resolve(buildFilePath.replace('${workspaceFolder}', cwd)));
        } catch {}

        break;
      default:
        processArg.push(await workspace.getDocument(textDocument.uri).buffer.name);
        break;
    }

    const extraArgs = config.get<string[]>('buildArgs')!;
    extraArgs.forEach((element) => {
      processArg.push(element);
    });

    let decoded = '';
    const childProcess = cp.spawn('zig', processArg, { cwd });
    if (childProcess.pid) {
      childProcess.stderr.on('data', (data: Buffer) => {
        decoded += data;
      });
      childProcess.stdout.on('end', () => {
        this.doCompile.cancel();
        const diagnostics: { [id: string]: vscode.Diagnostic[] } = {};
        const regex = /(\S.*):(\d*):(\d*): ([^:]*): (.*)/g;

        this.buildDiagnostics.clear();
        for (let match = regex.exec(decoded); match; match = regex.exec(decoded)) {
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

          // De-dupe build errors with ast errors
          if (this.astDiagnostics.has(textDocument.uri)) {
            for (const diag of this.astDiagnostics.get(textDocument.uri) || []) {
              if (diag.range.start.line === line && diag.range.start.character === column) {
                continue;
              }
            }
          }

          const severity =
            type.trim().toLowerCase() === 'error'
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Information;
          const range = vscode.Range.create(line, column, line, Infinity);

          if (diagnostics[path] == null) diagnostics[path] = [];
          diagnostics[path].push(vscode.Diagnostic.create(range, message, severity));
        }

        for (const path in diagnostics) {
          const diagnostic = diagnostics[path];
          this.buildDiagnostics.set(vscode.Uri.file(path).fsPath, diagnostic);
        }
      });
    }
  }

  doASTGenErrorCheck = throttle(this._doASTGenErrorCheck, 16, {
    trailing: true,
  });
  doCompile = throttle(this._doCompile, 60);
  public provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Command[]> {
    return [];
  }
}
