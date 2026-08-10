#!/usr/bin/env node
// Generic launcher shipped inside every @muvon/* npm package. Downloads the
// matching binary from the GitHub release on first run, caches it under
// ~/.cache/muvon, then execs it with the caller's args.
//
// No build-time substitution: name/version come from the package.json next to
// this file, and the GitHub repo is derived from the scoped package name.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { execFileSync } = require('child_process')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const { name, version } = require('./package.json')

const TARGETS = {
	'darwin-arm64': 'aarch64-apple-darwin',
	'darwin-x64': 'x86_64-apple-darwin',
	'linux-arm64': 'aarch64-unknown-linux-musl',
	'linux-x64': 'x86_64-unknown-linux-musl',
	'win32-arm64': 'aarch64-pc-windows-msvc',
	'win32-x64': 'x86_64-pc-windows-msvc',
}

const bin = name.split('/')[1]
const repo = `muvon/${bin}`
const isWindows = process.platform === 'win32'
const dir = path.join(os.homedir(), '.cache', 'muvon', bin, version)
const exe = path.join(dir, isWindows ? `${bin}.exe` : bin)

async function install() {
	const target = TARGETS[`${process.platform}-${process.arch}`]
	if (!target) {
		throw new Error(`unsupported platform ${process.platform}-${process.arch}`)
	}

	const ext = isWindows ? 'zip' : 'tar.gz'
	const url = `https://github.com/${repo}/releases/download/${version}/${bin}-${version}-${target}.${ext}`
	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`download failed (${res.status}): ${url}`)
	}

	// Unpack into a pid-scoped directory and rename into place: concurrent runs
	// (MCP clients spawn several servers at once) must never see a partial binary.
	const tmp = `${dir}.${process.pid}`
	fs.rmSync(tmp, { recursive: true, force: true })
	fs.mkdirSync(tmp, { recursive: true })
	const archive = path.join(tmp, `archive.${ext}`)
	await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(archive))
	// bsdtar reads zip too, and ships with Windows 10 1803+.
	execFileSync('tar', ['-xf', archive, '-C', tmp], { stdio: 'inherit' })
	fs.rmSync(archive)
	fs.chmodSync(path.join(tmp, path.basename(exe)), 0o755)

	fs.mkdirSync(path.dirname(dir), { recursive: true })
	try {
		fs.renameSync(tmp, dir)
	} catch (err) {
		// Another process won the race; its copy is equivalent.
		if (!fs.existsSync(exe)) throw err
		fs.rmSync(tmp, { recursive: true, force: true })
	}
}

async function main() {
	if (!fs.existsSync(exe)) {
		// stderr only — stdout is the MCP stdio transport.
		process.stderr.write(`${bin}: downloading ${version}...\n`)
		await install()
	}
	const run = spawnSync(exe, process.argv.slice(2), { stdio: 'inherit' })
	if (run.error) throw run.error
	process.exit(run.status === null ? 1 : run.status)
}

main().catch((err) => {
	process.stderr.write(`${bin}: ${err.message}\n`)
	process.exit(1)
})
