import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { parse } from 'parse5';
import { filesUnder, siteConfig } from './site-policy.mjs';
import { readPublicProjectionBundle, publicOutputPath } from './check-public-projection.mjs';

function decode(value) {
  let result = value;
  for (let i = 0; i < 5; i++) {
    let next;
    try { next = decodeURIComponent(result); } catch { break; }
    if (next === result) break;
    result = next;
  }
  return result.replace(/[\u0000-\u0020\u007f]/gu, '').replaceAll('\\', '/');
}

export function publicUrl(value, base) {
  const decoded = decode(value);
  let url;
  try { url = new URL(decoded, base); } catch { throw new Error('invalid rendered URL'); }
  const hostname = url.hostname.toLowerCase();
  const privateHost = /^(?:localhost|.*\.localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::1\]|\[f[cd])/u.test(hostname);
  const path = decode(url.pathname + url.search).toLowerCase();
  if (privateHost || !['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)
      || /(?:^|[/=?&#])(?:users|private|sources|catalog|\.obsidian|\.git|~)(?:[/=?&#]|$)/u.test(path)
      || /^\/home\//u.test(path) || /source_session_ids?/iu.test(path)) throw new Error('prohibited private or local rendered URL');
  return url;
}

export function inspectRenderedHtml(html, pageUrl, forbiddenNavigationPaths = new Set()) {
  const document = parse(html);
  const nodes = [];
  function walk(node) {
    nodes.push(node);
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  }
  walk(document);
  const baseHref = nodes.find(node => node.tagName === 'base')?.attrs?.find(attr => attr.name === 'href')?.value;
  const base = baseHref ? publicUrl(baseHref, pageUrl).href : pageUrl;
  const urls = [];
  for (const node of nodes) {
    for (const { name, value } of node.attrs ?? []) {
      if (['href', 'src', 'action', 'formaction', 'poster', 'data', 'cite', 'background'].includes(name)) {
        // Inline image data has no remote/local location. HTML data URLs are rejected.
        if (name === 'src' && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/iu.test(value)) continue;
        const url = publicUrl(value, base);
        if (name === 'href' && forbiddenNavigationPaths.has(url.pathname)
            && url.origin === new URL(pageUrl).origin) {
          for (let ancestor = node.parentNode; ancestor; ancestor = ancestor.parentNode) {
            if (ancestor.tagName === 'nav') throw new Error('Redirect alias in navigation');
          }
        }
        urls.push(url);
      } else if (name === 'srcset') {
        for (const candidate of value.split(',')) urls.push(publicUrl(candidate.trim().split(/\s+/u)[0], base));
      } else if (name === 'srcdoc') urls.push(...inspectRenderedHtml(value, base));
      else if (name === 'style') {
        for (const [, target] of value.matchAll(/url\(\s*["']?([^)'"\s]+)/giu)) urls.push(publicUrl(target, base));
      }
    }
    if (node.tagName === 'meta' && node.attrs?.some(a => a.name === 'http-equiv' && a.value.toLowerCase() === 'refresh')) {
      const content = node.attrs.find(a => a.name === 'content')?.value ?? '';
      const target = content.match(/url\s*=\s*(.*)/iu)?.[1]?.replace(/^["']|["']$/gu, '');
      if (target) urls.push(publicUrl(target, base));
    }
  }
  return urls;
}

export function inspectRenderedRedirect(html, targetUrl, pageUrl) {
  const elements = [];
  function walk(node) {
    if (node.tagName) elements.push(node);
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parse(html));
  const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
  const canonical = elements.filter(node => node.tagName === 'link' && attr(node, 'rel') === 'canonical');
  const refresh = elements.filter(node => node.tagName === 'meta' && attr(node, 'http-equiv') === 'refresh');
  const robots = elements.filter(node => node.tagName === 'meta' && attr(node, 'name') === 'robots');
  const anchors = elements.filter(node => node.tagName === 'a');
  if (canonical.length !== 1 || refresh.length !== 1 || anchors.length !== 1
      || robots.length !== 1 || attr(robots[0], 'content') !== 'noindex'
      || !/^0; url=/u.test(attr(refresh[0], 'content') ?? '')
      || elements.some(node => ['script', 'iframe', 'base', 'form'].includes(node.tagName))) {
    throw new Error('Invalid rendered redirect structure');
  }
  const urls = inspectRenderedHtml(html, pageUrl);
  if (urls.length !== 3 || urls.some(url => url.href !== targetUrl)) throw new Error('Rendered redirect destination differs from its canonical target');
}

export function checkFileList(actual, expected) {
  const extras = actual.filter(name => !expected.has(name));
  const missing = [...expected].filter(name => !actual.includes(name));
  if (extras.length || missing.length) throw new Error(`Deployment file boundary failed: unexpected [${extras.join(', ')}]; missing [${missing.join(', ')}]`);
}

export async function verifyResumeFiles(output, files) {
  if (!Array.isArray(files) || !files.some(file => file.path === 'resume/index.html')) {
    throw new Error('Resume publication must include its index');
  }
  const paths = new Set();
  for (const file of files) {
    if (!/^resume\/(?:index\.html|assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|css|woff2|jpg|png|svg|webp|ico)|pdf\/[a-z0-9-]+\.pdf)$/u.test(file.path)
        || paths.has(file.path) || !/^[a-f0-9]{64}$/u.test(file.sha256)
        || !Number.isSafeInteger(file.bytes) || file.bytes <= 0) {
      throw new Error('Invalid resume publication file');
    }
    paths.add(file.path);
  }
  for (const file of files) {
    const bytes = await readFile(resolve(output, file.path));
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error(`Resume publication bytes differ: ${file.path}`);
    }
  }
  return [...paths];
}

/**
 * 프로젝트 본문은 저장소 README 의 vendoring 산출물이다. 렌더된 HTML 이 아니라
 * 저장소 안의 생성 Markdown 을 매니페스트와 바이트 비교해, 수동 편집과
 * 동기화 누락을 배포 경계에서 잡는다.
 */
export async function verifyProjectPublication(root, manifest) {
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.projects) || manifest.projects.length === 0) {
    throw new Error('Invalid project publication manifest');
  }
  const slugs = new Set();
  const pages = [];
  const assets = [];
  for (const item of manifest.projects) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(item.slug ?? '') || slugs.has(item.slug)
        || !/^[a-f0-9]{40}$/u.test(item.ref ?? '')
        || !/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(item.repo ?? '')
        || !/^[a-f0-9]{64}$/u.test(item.readme_sha256 ?? '')
        || !/^[a-f0-9]{64}$/u.test(item.output_sha256 ?? '')
        || item.output_path !== `generated/projects/${item.slug}.md`
        || !Number.isSafeInteger(item.output_bytes) || item.output_bytes <= 0
        || !Number.isSafeInteger(item.readme_bytes) || item.readme_bytes <= 0) {
      throw new Error(`Invalid project publication entry: ${item.slug}`);
    }
    slugs.add(item.slug);
    const bytes = await readFile(resolve(root, item.output_path));
    if (bytes.length !== item.output_bytes
        || createHash('sha256').update(bytes).digest('hex') !== item.output_sha256) {
      throw new Error(`Project publication bytes differ: ${item.slug}`);
    }
    pages.push(`projects/${item.slug}/index.html`);
    if (item.card_image) {
      if (!/^\/assets\/projects\/[a-z0-9][a-z0-9-]*\.(?:webp|png|jpg|svg)$/u.test(item.card_image)) {
        throw new Error(`Invalid project card image: ${item.slug}`);
      }
      assets.push(item.card_image.slice(1));
    }
  }
  return { pages, assets };
}

export async function checkBuiltSite(root) {
  const output = resolve(root, '_site');
  const config = await siteConfig(root);
  const { documents, redirects } = await readPublicProjectionBundle(root);
  const byId = new Map(documents.map(doc => [doc.projection_id, doc]));
  const retained = new Set(documents.filter(doc => config.wiki_show_planned === true || doc.content_status !== 'planned').map(doc => doc.projection_id));
  for (const id of [...retained]) {
    const seen = new Set();
    let parent = byId.get(id).public_parent_id;
    while (parent && byId.has(parent)) {
      if (seen.has(parent)) throw new Error('Public parent cycle');
      seen.add(parent); retained.add(parent); parent = byId.get(parent).public_parent_id;
    }
  }
  const docs = documents.filter(doc => retained.has(doc.projection_id));
  const retainedUrls = new Set(docs.map(doc => doc.permalink));
  const visibleRedirects = redirects.filter(item => retainedUrls.has(item.redirect_target));
  const projectedUrl = permalink => new URL(`${(config.baseurl ?? '').replace(/\/$/u, '')}${permalink}`, config.url).href;
  const redirectPaths = new Set(redirects.map(item => new URL(projectedUrl(item.permalink)).pathname));
  const pages = ['index.html', '404.html', 'docs/ui-components/runnable-code-blocks/index.html', ...docs.map(doc => publicOutputPath(doc.permalink)), ...visibleRedirects.map(item => publicOutputPath(item.permalink))];
  const assets = [
    'assets/css/just-the-docs-default.css', 'assets/css/just-the-docs-head-nav.css', 'assets/css/just-the-docs-woon-dark.css',
    'assets/css/runnable-code-blocks.css', 'assets/css/runnable-code-blocks-host.css',
    'assets/css/wn-header-actions.css', 'assets/css/wn-docs-refinements.css',
    'assets/js/vendor/lunr.min.js', 'assets/js/just-the-docs.js', 'assets/js/search-data.json', 'favicon.ico',
    'assets/js/runnable/THIRD_PARTY_NOTICES.txt',
    'assets/js/diagrams/LICENSE.txt',
    'assets/js/diagrams/THIRD_PARTY_NOTICES.txt',
  ];
  const meta = JSON.parse(await readFile(resolve(root, '.jekyll-cache/runnable-meta.json'), 'utf8'));
  for (const path of Object.keys(meta.outputs)) assets.push(relative(root, resolve(root, path)));
  const diagramsMeta = JSON.parse(await readFile(resolve(root, '.jekyll-cache/diagrams-meta.json'), 'utf8'));
  for (const path of Object.keys(diagramsMeta.outputs)) assets.push(relative(root, resolve(root, path)));
  const resume = JSON.parse(await readFile(resolve(root, 'config/resume-publication.json'), 'utf8'));
  const resumeFiles = await verifyResumeFiles(output, resume.files);
  pages.push(...resumeFiles.filter(path => path.endsWith('.html')));
  assets.push(...resumeFiles.filter(path => !path.endsWith('.html')));
  const projectManifest = JSON.parse(await readFile(resolve(root, 'config/projects-publication.json'), 'utf8'));
  const projects = await verifyProjectPublication(root, projectManifest);
  pages.push('projects/index.html', ...projects.pages);
  assets.push('assets/css/wn-site-tabs.css', 'assets/css/wn-projects.css', ...projects.assets);
  const expected = new Set([...pages, ...assets, 'sitemap.xml', 'robots.txt', 'CNAME']);
  const actual = (await filesUnder(output)).map(file => relative(output, file)).filter(name => name !== 'build-info.json');
  checkFileList(actual, expected);
  let links = 0;
  const retiredUrls = new Set(JSON.parse(await readFile(resolve(root, 'tests/fixtures/retired-urls.json'), 'utf8')));
  const retired = path => retiredUrls.has(path) || (path.startsWith('/docs/') && !path.startsWith('/docs/ui-components/runnable-code-blocks/'));
  for (const page of pages) {
    const urls = inspectRenderedHtml(await readFile(resolve(output, page), 'utf8'), new URL(page, config.url).href, redirectPaths);
    for (const url of urls) if (url.origin === new URL(config.url).origin && retired(url.pathname)) throw new Error(`${page}: retired demo link`);
    links += urls.length;
  }
  for (const redirect of visibleRedirects) {
    inspectRenderedRedirect(await readFile(resolve(output, publicOutputPath(redirect.permalink)), 'utf8'), projectedUrl(redirect.redirect_target), projectedUrl(redirect.permalink));
  }
  const search = JSON.parse(await readFile(resolve(output, 'assets/js/search-data.json'), 'utf8'));
  for (const item of Object.values(search)) {
    const url = publicUrl(item.url, config.url);
    if (retired(url.pathname)) throw new Error('Retired demo in search index');
    if (redirectPaths.has(url.pathname)) throw new Error('Redirect alias in search index');
  }
  const sitemap = await readFile(resolve(output, 'sitemap.xml'), 'utf8');
  for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)) {
    if (retired(publicUrl(location, config.url).pathname)) throw new Error('Retired demo in sitemap');
    if (redirectPaths.has(publicUrl(location, config.url).pathname)) throw new Error('Redirect alias in sitemap');
  }
  const initial = new Set();
  function initialImports(path) {
    if (initial.has(path)) return;
    initial.add(path);
    for (const imported of meta.outputs[path].imports) if (imported.kind === 'import-statement') initialImports(imported.path);
  }
  initialImports('assets/js/runnable/loader.js');
  const loaderFiles = await Promise.all([...initial].map(path => readFile(resolve(output, path))));
  const loaderBytes = loaderFiles.reduce((sum, file) => sum + file.length, 0);
  const loaderGzipBytes = loaderFiles.reduce((sum, file) => sum + gzipSync(file).length, 0);
  if (loaderGzipBytes > 5120) throw new Error(`Loader exceeds 5 KiB gzip: ${loaderGzipBytes}`);
  // Reject accidental imports of Obsidian/public providers into the web graph.
  for (const input of Object.keys(meta.inputs)) {
    if (/src\/(?:main|provider-catalog|runner-composition)\.ts$|runners\/(?:wandbox|godbolt|paiza|onecompiler|piston|local-companion)-/u.test(input)) throw new Error(`Unexpected web runtime dependency: ${input}`);
  }
  const assetHashes = {};
  for (const asset of assets.sort()) assetHashes[asset] = createHash('sha256').update(await readFile(resolve(output, asset))).digest('hex');
  const gitSha = directory => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
  const build = { siteSha: gitSha(root), adapterSha: gitSha(resolve(root, 'vendor/runnable-code-blocks')), assets: assetHashes };
  await writeFile(resolve(output, 'build-info.json'), `${JSON.stringify(build, null, 2)}\n`);
  return { pages: pages.length, files: expected.size + 1, renderedUrls: links, loaderBytes, loaderGzipBytes };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(await checkBuiltSite(resolve(import.meta.dirname, '..')));
}
