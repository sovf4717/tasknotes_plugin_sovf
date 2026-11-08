#!/usr/bin/env node
//
// Copies the built plugin artifacts into the Obsidian vault's .obsidian/plugins dir
// so the plugin is installed (or updated) in place. Modelled on tasknotes' copy-files.mjs.
//
// Destination resolution order:
//   1. OBSIDIAN_PLUGIN_PATH environment variable (single path) if set
//   2. .copy-files.local file (one path per line) if present
//   3. default: <vault>/.obsidian/plugins/tasknotes-plugin-sovf
//      where <vault> comes from the OBSIDIAN_VAULT_PATH env var (default below)
//

import { copyFile, mkdir, access, constants, readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_VAULT =
	process.env.OBSIDIAN_VAULT_PATH ||
	'C:\\Users\\sovf\\Documents\\Obsidian Vault';

// The plugin id (must match the folder name in .obsidian/plugins).
const PLUGIN_ID = 'tasknotes-plugin-sovf';

// Files produced by the build that must exist in the vault plugins folder.
const files = ['main.js', 'manifest.json', 'versions.json'];

// Default copy destination - the plugins folder of the default vault.
const defaultPaths = [
	join(DEFAULT_VAULT, '.obsidian', 'plugins', PLUGIN_ID),
];

const LOCAL_OVERRIDE_FILE = '.copy-files.local';
let copyPaths = defaultPaths;

const expandTilde = (p) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

if (process.env.OBSIDIAN_PLUGIN_PATH) {
	copyPaths = [process.env.OBSIDIAN_PLUGIN_PATH];
} else {
	try {
		const local = await readFile(LOCAL_OVERRIDE_FILE, 'utf8');
		const paths = local
			.split('\n')
			.map((p) => p.trim())
			.filter((p) => p && !p.startsWith('#'))
			.map(expandTilde);
		if (paths.length > 0) copyPaths = paths;
	} catch (_) {
		// no local override, use defaults
	}
}

async function copyToDestination(destPath) {
	const resolvedPath = resolve(destPath);
	await mkdir(resolvedPath, { recursive: true });

	const copyPromises = files.map(async (file) => {
		try {
			await access(file, constants.F_OK);
			const destFile = join(resolvedPath, file);
			await copyFile(file, destFile);
		} catch (err) {
			if (err && err.code === 'ENOENT') {
				try {
					await access(file, constants.F_OK);
				} catch {
					console.warn(`\u26a0\ufe0f  Warning: source file ${file} not found, skipping`);
					return;
				}
				console.warn(`\u26a0\ufe0f  Warning: destination path missing for ${file}. Attempting to create\u2026`);
				await mkdir(resolvedPath, { recursive: true });
				const destFileRetry = join(resolvedPath, file);
				await copyFile(file, destFileRetry);
			} else {
				throw new Error(`Failed to copy ${file}: ${err?.message || err}`);
			}
		}
	});

	await Promise.all(copyPromises);
	console.log(`\u2705 Files copied to: ${resolvedPath}`);
}

async function copyFiles() {
	try {
		for (const destPath of copyPaths) {
			await copyToDestination(destPath);
		}
		console.log(`\u2705 Copied ${files.length} files to ${copyPaths.length} destination(s)`);
	} catch (error) {
		console.error('\u274c Failed to copy files:', error.message);
		process.exit(1);
	}
}

copyFiles();