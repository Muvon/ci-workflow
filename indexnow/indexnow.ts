/**
 * IndexNow submission for Muvon websites — run by .github/workflows/indexnow.yml
 * after the site is built. Only new or changed pages are re-submitted: the state
 * file keeps a hash of each page's text content.
 *
 *   INDEXNOW_HOST=getvext.app INDEXNOW_KEY=<key> bun indexnow.ts   # dry-run
 *   INDEXNOW_SUBMIT=true INDEXNOW_HOST=… INDEXNOW_KEY=… bun indexnow.ts
 *
 * Pages come from the prerendered build/ directory, or, when INDEXNOW_BASE is set,
 * from sitemap.xml of a server running the build (SSR sites have no HTML in build/).
 * INDEXNOW_STATE overrides the state file path (CI keeps it on the `indexnow` branch).
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const HOST = requireEnv('INDEXNOW_HOST');
// The key is public: the site serves it at /<KEY>.txt as ownership proof.
const KEY = requireEnv('INDEXNOW_KEY');
const BASE = process.env.INDEXNOW_BASE?.replace(/\/+$/, '') || null;
const STATE_FILE = process.env.INDEXNOW_STATE || 'indexnow-state.json';
const DRY_RUN = process.env.INDEXNOW_SUBMIT !== 'true';
const BUILD_DIR = 'build';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_SIZE = 10_000;

// Build files that are not pages: assets, feeds, sitemaps
const SKIP_RE = /\.(css|js|json|xml|txt|ico|png|jpg|jpeg|svg|webp|woff2?|ttf|map|rss)$/i;

interface State {
	version: 1;
	host: string;
	lastSubmittedAt: string | null;
	urls: Record<string, { hash: string; submittedAt: string }>;
}

interface Page {
	url: string;
	hash: string;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

// Title, meta description, visible text and image alt text — without scripts,
// styles and attributes, so a rebuild with new bundle hashes or inlined CSS
// produces the same hash.
function extractTextContent(html: string): string {
	const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
	const desc =
		html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? '';
	const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
	const text = body
		.replace(/<script\b[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[\s\S]*?<\/style>/gi, '')
		.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*\/?>/gi, ' $1 ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return `T:${title.trim()}\nD:${desc.trim()}\nB:${text}`;
}

function hashPage(html: string): string {
	return (
		'sha256:' + createHash('sha256').update(extractTextContent(html)).digest('hex').slice(0, 32)
	);
}

async function listHtmlFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
		.map((entry) => join(entry.parentPath, entry.name));
}

//   index.html → /,  blog/index.html → /blog,  blog/my-post.html → /blog/my-post
function urlPathFromFile(rel: string): string {
	const path = '/' + rel.replace(/\\/g, '/');
	if (path.endsWith('/index.html')) return path.slice(0, -'/index.html'.length) || '/';
	return path.slice(0, -'.html'.length);
}

async function discoverFromBuild(): Promise<Page[]> {
	const pages: Page[] = [];
	for (const htmlPath of await listHtmlFiles(BUILD_DIR)) {
		const rel = relative(BUILD_DIR, htmlPath);
		// SvelteKit internals (_app/) and other underscore-prefixed output
		if (rel.startsWith('_')) continue;
		const urlPath = urlPathFromFile(rel);
		if (SKIP_RE.test(urlPath) || urlPath.includes('__error') || urlPath === '/404') continue;
		pages.push({
			url: `https://${HOST}${urlPath}`,
			hash: hashPage(await readFile(htmlPath, 'utf8'))
		});
	}
	return pages;
}

async function fetchText(base: string, path: string): Promise<string> {
	const res = await fetch(base + path);
	if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
	return res.text();
}

// Sitemap URLs are public (https://HOST/...); their pages are read from the local server.
async function discoverFromServer(base: string): Promise<Page[]> {
	const sitemap = await fetchText(base, '/sitemap.xml');
	const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	if (urls.length === 0) throw new Error('sitemap.xml has no <loc> entries');
	const pages: Page[] = [];
	for (const url of urls) {
		const { host, pathname } = new URL(url);
		if (host !== HOST) throw new Error(`sitemap URL ${url} is not on ${HOST}`);
		pages.push({ url, hash: hashPage(await fetchText(base, pathname)) });
	}
	return pages;
}

async function submit(urlList: string[]): Promise<void> {
	for (let i = 0; i < urlList.length; i += BATCH_SIZE) {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json; charset=utf-8' },
			body: JSON.stringify({
				host: HOST,
				key: KEY,
				keyLocation: `https://${HOST}/${KEY}.txt`,
				urlList: urlList.slice(i, i + BATCH_SIZE)
			})
		});
		if (res.status !== 200 && res.status !== 202) {
			throw new Error(`submission failed — HTTP ${res.status}: ${await res.text()}`);
		}
	}
}

function buildNextState(pages: Page[], submitted: Set<string>, previous: State | null): State {
	const now = new Date().toISOString();
	return {
		version: 1,
		host: HOST,
		lastSubmittedAt: submitted.size > 0 ? now : (previous?.lastSubmittedAt ?? null),
		urls: Object.fromEntries(
			pages.map((page) => [
				page.url,
				{
					hash: page.hash,
					submittedAt: submitted.has(page.url)
						? now
						: (previous?.urls[page.url]?.submittedAt ?? now)
				}
			])
		)
	};
}

const previous: State | null = existsSync(STATE_FILE)
	? JSON.parse(await readFile(STATE_FILE, 'utf8'))
	: null;
const pages = BASE ? await discoverFromServer(BASE) : await discoverFromBuild();
pages.sort((a, b) => a.url.localeCompare(b.url));
const toSubmit = pages.filter((page) => previous?.urls[page.url]?.hash !== page.hash);
console.log(`[indexnow] ${pages.length} pages, ${toSubmit.length} new or changed.`);

const urlList = toSubmit.map((page) => page.url);
if (DRY_RUN) {
	for (const url of urlList) console.log(`  ${url}`);
	console.log('[indexnow] Dry run — set INDEXNOW_SUBMIT=true to submit.');
} else {
	if (urlList.length > 0) await submit(urlList);
	const next = buildNextState(pages, new Set(urlList), previous);
	await writeFile(STATE_FILE, JSON.stringify(next, null, '\t') + '\n', 'utf8');
	console.log(`[indexnow] Submitted ${urlList.length} URL(s). State saved to ${STATE_FILE}.`);
}
