import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import * as coc from 'coc.nvim'
import { stopClient } from './index'
import {
  ensureDirectory,
  errorMessage,
  executableName,
  fileExists,
  getConfiguration,
  getOptionalString,
} from './util'
import { getZlsVersion } from './zls'

const DOWNLOADS_ROOT = 'https://zig.pm/zls/downloads'
const TAGS_API = 'https://api.github.com/repos/zigtools/zls/tags'
const USER_AGENT = 'coc-zls'
const REQUEST_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'application/vnd.github+json',
}
const REQUEST_TIMEOUT = 30_000
const DOWNLOAD_TIMEOUT = 300_000

const TARGETS = new Set([
  'x86-linux',
  'x86-windows',
  'x86_64-linux',
  'x86_64-macos',
  'x86_64-windows',
  'aarch64-macos',
  'aarch64-linux',
])

/** Maps the running machine to a zls prebuilt-binary target, `undefined` when none is published. */
const downloadTarget = (): string | undefined => {
  const width = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch === 'ia32' ? 'x86' : ''
  const suffix = os.platform() === 'win32' ? 'windows' : os.platform() === 'linux' ? 'linux' : os.platform() === 'darwin' ? 'macos' : ''
  const target = `${width}-${suffix}`
  return TARGETS.has(target) ? target : undefined
}

const installZls = async (storageDirectory: string): Promise<string> =>
  coc.window.withProgress({ title: 'Installing zls', cancellable: true }, async (progress, token) => {
    const target = downloadTarget()
    if (!target) {
      throw new Error(`No prebuilt zls binary for ${os.platform()}-${process.arch}`)
    }

    await stopClient()
    await ensureDirectory(storageDirectory)
    const binary = executableName()
    const installed = path.join(storageDirectory, binary)

    progress.report({ message: `Downloading ${target}...` })
    await coc.download(`${DOWNLOADS_ROOT}/${target}/bin/${binary}`, {
      dest: storageDirectory,
      timeout: DOWNLOAD_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
      onProgress: percent => progress.report({ message: `Downloading zls (${percent}%)` }),
    }, token)

    if (token.isCancellationRequested) {
      throw new Error('Canceled')
    }

    if (!(await fileExists(installed))) {
      throw new Error(`The downloaded archive did not contain ${binary}`)
    }
    await fs.promises.chmod(installed, 0o755).catch(() => undefined)

    progress.report({ message: 'Verifying...' })
    if (!(await getZlsVersion(installed))) {
      await fs.promises.rm(installed, { force: true }).catch(() => undefined)
      throw new Error('The downloaded binary could not be executed')
    }
    return installed
  })

export const reinstallZls = async (storageDirectory: string): Promise<string | undefined> => {
  try {
    const installed = await installZls(storageDirectory)
    coc.window.showInformationMessage(`zls installed at ${installed}`)
    return installed
  } catch (error) {
    if (errorMessage(error) !== 'Canceled') {
      coc.window.showErrorMessage(`Failed to install zls: ${errorMessage(error)}`)
    }
    return undefined
  }
}

const parseVersion = (value: string): number[] | undefined => {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(value)
  return match ? [+match[1], +match[2], +match[3]] : undefined
}

const isNewer = (older: number[], newer: number[]): boolean => {
  for (let index = 0; index < 3; index++) {
    if (older[index] !== newer[index]) {
      return older[index] < newer[index]
    }
  }
  return false
}

const latestTagVersion = async (): Promise<number[] | undefined> => {
  const tags = await coc.fetch(TAGS_API, { headers: REQUEST_HEADERS, timeout: REQUEST_TIMEOUT }) as unknown as Array<
    { name: string }
  >
  let latest: number[] | undefined
  for (const tag of tags) {
    const version = parseVersion(tag.name)
    if (version && (!latest || isNewer(latest, version))) {
      latest = version
    }
  }
  return latest
}

const promptForUpdate = async (storageDirectory: string): Promise<void> => {
  const choice = await coc.window.showInformationMessage(
    'A newer zls is available to install.',
    'Install',
    'Later',
  )
  if (choice === 'Install') {
    await reinstallZls(storageDirectory)
  }
}

const checkForUpdate = async (storageDirectory: string, currentVersion: string): Promise<void> => {
  if (!getConfiguration().get<boolean>('checkUpdate', true)) {
    return
  }

  const current = parseVersion(currentVersion)
  if (!current) {
    return
  }

  let latest: number[] | undefined
  try {
    latest = await latestTagVersion()
  } catch (error) {
    // Being offline must not prevent using the binary that is already installed.
    console.warn(`coc-zls: could not check for zls updates: ${errorMessage(error)}`)
    return
  }

  if (latest && isNewer(current, latest)) {
    void promptForUpdate(storageDirectory)
  }
}

export const ensureZlsExists = async (storageDirectory: string): Promise<string | undefined> => {
  const configured = getOptionalString('path')
  if (configured) {
    return configured
  }

  const installed = path.join(storageDirectory, executableName())
  if (await fileExists(installed)) {
    const version = await getZlsVersion(installed)
    if (version) {
      void checkForUpdate(storageDirectory, version)
      return installed
    }
    coc.window.showWarningMessage('The installed zls binary could not be executed, installing it again...')
  }

  return reinstallZls(storageDirectory)
}
