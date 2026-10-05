import { spawn } from 'node:child_process'
import { parseVersion } from './util'

const run = (command: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to run ${command}: ${error.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      const error = stderr.trim()
      reject(new Error(`${command} exited with code ${code}${error ? `: ${error}` : ''}`))
    })

    // A broken pipe is not interesting: the exit code is the authoritative result.
    child.stdin.on('error', () => undefined)
    child.stdin.end()
  })

export const getZlsVersion = async (command: string): Promise<number[] | undefined> => {
  try {
    return parseVersion(await run(command, ['--version']))
  } catch {
    return undefined
  }
}
