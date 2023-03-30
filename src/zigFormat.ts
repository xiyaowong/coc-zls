import * as vscode from 'coc.nvim';
import { TextEdit, OutputChannel } from 'coc.nvim';
import { execCmd } from './zigUtil';

export class ZigFormatProvider implements vscode.DocumentFormattingEditProvider {
  private _channel: OutputChannel;

  constructor(logChannel: OutputChannel) {
    this._channel = logChannel;
  }

  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options?: vscode.FormattingOptions,
    _token?: vscode.CancellationToken
  ): Promise<TextEdit[]> {
    const logger = this._channel;
    const name = await vscode.workspace.getDocument(document.uri).buffer.name;
    return zigFormat(document)
      .then(({ stdout }) => {
        logger.clear();
        const lastLineId = document.lineCount - 1;
        const wholeDocument = vscode.Range.create(
          0,
          0,
          lastLineId,
          vscode.workspace.getDocument(document.uri).getline(lastLineId).length
        );
        return [TextEdit.replace(wholeDocument, stdout)];
      })
      .catch((reason) => {
        const config = vscode.workspace.getConfiguration('zig');

        logger.clear();
        logger.appendLine(reason.toString().replace('<stdin>', name));
        if (config.get<boolean>('revealOutputChannelOnFormattingError')) {
          logger.show(true);
        }
        return [];
      });
  }
}

// Same as full document formatter for now
export class ZigRangeFormatProvider implements vscode.DocumentRangeFormattingEditProvider {
  private _channel: OutputChannel;
  constructor(logChannel: OutputChannel) {
    this._channel = logChannel;
  }

  async provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    _range: vscode.Range,
    _options?: vscode.FormattingOptions,
    _token?: vscode.CancellationToken
  ): Promise<TextEdit[]> {
    const logger = this._channel;
    const name = await vscode.workspace.getDocument(document.uri).buffer.name;
    return zigFormat(document)
      .then(({ stdout }) => {
        logger.clear();
        const lastLineId = document.lineCount - 1;
        const wholeDocument = vscode.Range.create(
          0,
          0,
          lastLineId,
          vscode.workspace.getDocument(document.uri).getline(lastLineId).length
        );
        return [TextEdit.replace(wholeDocument, stdout)];
      })
      .catch((reason) => {
        const config = vscode.workspace.getConfiguration('zig');

        logger.clear();
        logger.appendLine(reason.toString().replace('<stdin>', name));
        if (config.get<boolean>('revealOutputChannelOnFormattingError')) {
          logger.show(true);
        }
        return [];
      });
  }
}

function zigFormat(document: vscode.TextDocument) {
  const config = vscode.workspace.getConfiguration('zig');
  const zigPath = config.get<string>('zigPath') || 'zig';

  const options = {
    cmdArguments: ['fmt', '--stdin'],
    notFoundText:
      'Could not find zig. Please add zig to your PATH or specify a custom path to the zig binary in your settings.',
  };
  const format = execCmd(zigPath, options);

  format.stdin.write(document.getText());
  format.stdin.end();

  return format;
}
