# coc-zls

[Zig Language Server](https://github.com/zigtools/zls) (zls) for [coc.nvim](https://github.com/neoclide/coc.nvim).

Completions, hover, go-to-definition, diagnostics and formatting for Zig code. When no binary is configured, a prebuilt zls is downloaded on first use.

## Requirements

- [coc.nvim](https://github.com/neoclide/coc.nvim) 0.0.80 or newer
- [zig.vim](https://github.com/ziglang/zig.vim), for `.zig` filetype detection and syntax highlighting

## Install

```vim
:CocInstall coc-zls
```

## Usage

zls starts automatically when a Zig file is opened.

Formatting is handled by zls: run coc's format action, or add `"zig"` to `coc.preferences.formatOnSaveFiletypes` to format on save.

When `zls.path` is unset and no binary is installed yet, a prebuilt zls is downloaded for the current platform and kept in the extension's storage directory. Prebuilt binaries are published for x86_64/aarch64/x86 Linux, x86_64/aarch64 macOS and x86_64/x86 Windows; on any other platform, set `zls.path` to a zls you built yourself.

## Settings

Set these in `coc-settings.json` (`:CocConfig`).

| Setting | Default | Description |
| --- | --- | --- |
| `zls.path` | `null` | Path to a zls binary, or a command name on `PATH`. When set, no download happens. |
| `zls.checkUpdate` | `true` | Check for a newer zls release. Checks run at most once a day. |
| `zls.logFile` | `null` | Path to a zls log file. Passed to zls as `--log-file`. |
| `zls.logLevel` | `"info"` | zls log level: `err`, `warn`, `info` or `debug`. Passed as `--log-level`. |
| `zls.disableLspLogs` | `false` | Disable zls's LSP `window/logMessage` output. Passed as `--disable-lsp-logs`. |
| `zls.format.enable` | `true` | Let zls provide Zig formatting. When `false`, coc does not use zls as a formatter. |

## Commands

- `:CocCommand zls.reinstall` — install zls again.
- `:CocCommand zls.restart` — restart the language server.
- `:CocCommand zls.stop` — stop the language server; `zls.restart` starts it again.

## Code actions on save

Run zls code actions on save with coc's `BufWritePre` autocmds.

`source.fixAll` — Neovim (`init.lua`):

```lua
vim.api.nvim_create_autocmd('BufWritePre', {
  pattern = { "*.zig", "*.zon" },
  command = "call CocActionAsync('fixAll')"
})
```

Vim (`init.vim` / `.vimrc`):

```vim
autocmd BufWritePre *.zig,*.zon call CocActionAsync('fixAll')
```

`source.organizeImports` — Neovim (`init.lua`):

```lua
vim.api.nvim_create_autocmd('BufWritePre', {
  pattern = { "*.zig", "*.zon" },
  command = "call CocActionAsync('organizeImport')"
})
```

Vim (`init.vim` / `.vimrc`):

```vim
autocmd BufWritePre *.zig,*.zon call CocActionAsync('organizeImport')
```

## License

MIT
