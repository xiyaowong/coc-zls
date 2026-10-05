# coc-zls

[zls](https://github.com/zigtools/zls) for coc.nvim.

## Install

1. Install [zig.vim](https://github.com/ziglang/zig.vim)
2. Run `:CocInstall coc-zls` in Vim/Neovim.

## Usage

- zls runs as a language server: completions, hover, go-to-definition and diagnostics come from it.
- Just run coc's formatting commands. zls formats Zig code and coc applies the edits.
- Add `"zig"` to `coc.preferences.formatOnSaveFiletypes` to format on save.
- If zls is not found, a prebuilt binary is downloaded for the current platform.

## Settings

- `zls.path`: path to a zls binary, or a command name on PATH. When set, no download happens.
- `zls.checkUpdate`: check for a newer zls release after startup.
- `zls.logFile`: path to a zls log file.
- `zls.logLevel`: zls log level — `err`, `warn`, `info` (default), `debug`.
- `zls.disableLspLogs`: disable zls's `window/logMessage` output.
- `zls.format.enable`: let zls provide Zig formatting (default `true`).

## Commands

`:CocCommand zls.reinstall` installs zls again.
`:CocCommand zls.restart` restarts the language server.
`:CocCommand zls.stop` stops the language server; `zls.restart` can bring it back.

## Code Actions on save

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
