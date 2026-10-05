# coc-zls

[zls](https://github.com/zigtools/zls) for coc.nvim.

## Install

```
:CocInstall coc-zls
```

## Usage

- zls runs as a language server: completions, hover, go-to-definition and diagnostics come from it.
- Just run coc's formatting commands. zls formats Zig code and coc applies the edits.
- Add `"zig"` to `coc.preferences.formatOnSaveFiletypes` to format on save.
- If zls is not found, a prebuilt binary is downloaded for the current platform.

## Settings

- `zls.path`: path to a zls binary, or a command name on PATH. When set, no download happens.
- `zls.checkUpdate`: check for a newer zls release after startup.

## Commands

`:CocCommand zls.reinstall` installs zls again.

## License

MIT
