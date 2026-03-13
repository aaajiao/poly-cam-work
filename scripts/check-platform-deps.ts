import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

type LinuxLibc = 'gnu' | 'musl'

const PLATFORM_PACKAGE_MAP: Record<string, string[]> = {
  'darwin-arm64': ['@rollup/rollup-darwin-arm64'],
  'darwin-x64': ['@rollup/rollup-darwin-x64'],
  'linux-arm64-gnu': ['@rollup/rollup-linux-arm64-gnu'],
  'linux-arm64-musl': ['@rollup/rollup-linux-arm64-musl'],
  'linux-x64-gnu': ['@rollup/rollup-linux-x64-gnu'],
  'linux-x64-musl': ['@rollup/rollup-linux-x64-musl'],
  'win32-arm64': ['@rollup/rollup-win32-arm64-msvc'],
  'win32-ia32': ['@rollup/rollup-win32-ia32-msvc'],
  'win32-x64': ['@rollup/rollup-win32-x64-msvc'],
}

function detectLinuxLibc(): LinuxLibc {
  const report = process.report?.getReport?.()
  const glibcVersionRuntime = report?.header?.glibcVersionRuntime
  return glibcVersionRuntime ? 'gnu' : 'musl'
}

function getExpectedRollupPackages() {
  const baseKey = `${process.platform}-${process.arch}`
  if (process.platform === 'linux') {
    const libc = detectLinuxLibc()
    return PLATFORM_PACKAGE_MAP[`${baseKey}-${libc}`] ?? []
  }

  return PLATFORM_PACKAGE_MAP[baseKey] ?? []
}

function getInstalledRollupPackages(projectRoot: string) {
  const rollupDir = path.resolve(projectRoot, 'node_modules', '@rollup')
  if (!existsSync(rollupDir)) {
    return []
  }

  return readdirSync(rollupDir)
    .filter((entry) => entry.startsWith('rollup-'))
    .map((entry) => `@rollup/${entry}`)
    .sort()
}

function describeRuntime() {
  if (process.platform !== 'linux') {
    return `${process.platform}-${process.arch}`
  }

  return `${process.platform}-${process.arch}-${detectLinuxLibc()}`
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function main() {
  const projectRoot = process.cwd()
  const nodeModulesDir = path.resolve(projectRoot, 'node_modules')

  if (!existsSync(nodeModulesDir)) {
    fail(
      [
        '[check-platform-deps] Dependencies are not installed.',
        'Run `bun install` on this machine before starting the app.',
      ].join('\n'),
    )
  }

  const expectedPackages = getExpectedRollupPackages()
  if (expectedPackages.length === 0) {
    console.warn(
      `[check-platform-deps] No native Rollup expectation is defined for ${describeRuntime()}. Skipping check.`,
    )
    return
  }

  const installedPackages = getInstalledRollupPackages(projectRoot)
  const matchedPackage = expectedPackages.find((packageName) =>
    installedPackages.includes(packageName),
  )

  if (matchedPackage) {
    console.log(`[check-platform-deps] OK: ${matchedPackage}`)
    return
  }

  const installedLabel =
    installedPackages.length > 0 ? installedPackages.join(', ') : '(none found)'

  fail(
    [
      '[check-platform-deps] Native Rollup package does not match this machine.',
      `Current runtime: ${describeRuntime()}`,
      `Expected: ${expectedPackages.join(', ')}`,
      `Installed: ${installedLabel}`,
      'Run `bun install` on this machine before running dev/build/test.',
      'If `node_modules` was copied from another OS and the mismatch persists, delete `node_modules` and run `bun install` again.',
    ].join('\n'),
  )
}

main()
