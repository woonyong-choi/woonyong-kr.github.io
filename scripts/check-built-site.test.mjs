import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspectRenderedHtml, inspectRenderedRedirect, checkFileList, verifyResumeFiles } from './check-built-site.mjs';
import { parseYaml } from './site-policy.mjs';

const base = 'https://docs.example.com/wiki/example/';
const render = markdown => execFileSync('bundle', ['exec', 'ruby', '-rjekyll', '-e', 'config=Jekyll.configuration({"quiet"=>true}); puts Jekyll::Converters::Markdown.new(config).convert(STDIN.read)'], { input: markdown, encoding: 'utf8' });

test('Jekyll and the boundary parser agree on compiler-shaped YAML', () => {
  const yaml = 'title: "No"\nnav_order: 12\nhas_toc: false\nparent: "한국어: 문서"\npermalink: /wiki/example/\n';
  const jekyll = execFileSync('bundle', ['exec', 'ruby', '-rjekyll', '-rjson', '-e', 'puts SafeYAML.load(STDIN.read).to_json'], { input: yaml, encoding: 'utf8' });
  assert.deepEqual(parseYaml(yaml, 'fixture'), JSON.parse(jekyll));
});

for (const [name, yaml] of [
  ['multiple YAML documents', 'title: first\n---\ntitle: second'],
  ['explicit tags', 'title: !!str text'],
  ['merge keys', 'defaults: &defaults {title: example}\n<<: *defaults'],
]) test(`rejects ${name}`, () => assert.throws(() => parseYaml(yaml, name)));

test('rendered Markdown reference links, HTML entities, relative URLs and srcset cannot bypass the boundary', () => {
  const fixture = readFileSync(new URL('../tests/fixtures/public-boundary.md', import.meta.url), 'utf8');
  const html = render(fixture);
  assert.throws(() => inspectRenderedHtml(html, base), /prohibited/u);
  for (const source of [
    '[link][ref]\n\n[ref]: /%70rivate/note/',
    '<a href="/&#112;rivate/note/">link</a>',
    '<a href="../%252e%252e/private/note/">link</a>',
    '<img srcset="/public.png 1x, /%55sers/person/secret.png 2x">',
    '<a href="file&#58;///tmp/note">local</a>',
    '<a href="http://2130706433/secret">loopback</a>',
    '<base href="/private/"><a href="note">link</a>',
  ]) assert.throws(() => inspectRenderedHtml(render(source), base), /prohibited/u, source);
  assert.doesNotThrow(() => inspectRenderedHtml(render('[public](/wiki/home/)\n\n<a href="https://example.com/reference">reference</a>'), base));
});

test('Jekyll preserves fenced Python nested-list literals as code', () => {
  const html = render('```run-python\nassert solve([[0]]) == 0\n```');
  assert.match(html, /<code[^>]*>[\s\S]*?\[\[0\]\][\s\S]*?<\/code>/u);
  assert.doesNotThrow(() => inspectRenderedHtml(html, base));
});

test('unexpected deploy files and missing approved pages fail independently', () => {
  assert.throws(() => checkFileList(['index.html', 'private.html'], new Set(['index.html'])), /unexpected \[private.html\]/u);
  assert.throws(() => checkFileList([], new Set(['index.html'])), /missing \[index.html\]/u);
});

test('resume publication keeps its exact file scope and rejects changed build bytes', async () => {
  const output = await mkdtemp(join(tmpdir(), 'resume-publication-'));
  const bytes = Buffer.from('<main>Resume</main>');
  const index = { path: 'resume/index.html', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  try {
    await mkdir(join(output, 'resume'));
    await writeFile(join(output, index.path), bytes);
    assert.deepEqual(await verifyResumeFiles(output, [index]), [index.path]);
    for (const files of [[], [index, index], [index, { ...index, path: 'private/source.md' }], [index, { ...index, path: 'resume/assets/../source.js' }]]) {
      await assert.rejects(verifyResumeFiles(output, files));
    }
    await writeFile(join(output, index.path), 'changed');
    await assert.rejects(verifyResumeFiles(output, [index]), /bytes differ/u);
    await rm(join(output, index.path));
    await assert.rejects(verifyResumeFiles(output, [index]), /ENOENT/u);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('redirect canonical, immediate refresh and fallback share one target', () => {
  const target = 'https://docs.example.com/preview/wiki/example/';
  const html = `<html><head><meta name="robots" content="noindex"><link rel="canonical" href="${target}"><meta http-equiv="refresh" content="0; url=/preview/wiki/example/"></head><body><a href="/preview/wiki/example/">Open</a></body></html>`;
  assert.doesNotThrow(() => inspectRenderedRedirect(html, target, base));
  assert.throws(() => inspectRenderedRedirect(html.replace('0; url=', '5; url='), target, base), /structure/u);
  assert.throws(() => inspectRenderedRedirect(html.replace('href="/preview/wiki/example/"', 'href="/wiki/other/"'), target, base), /destination/u);
  assert.throws(() => inspectRenderedRedirect(html.replace('</body>', '<script>location="/other/"</script></body>'), target, base), /structure/u);
  assert.throws(() => inspectRenderedHtml('<nav><a href="/wiki/old/">Old</a></nav>', base, new Set(['/wiki/old/'])), /navigation/u);
  assert.doesNotThrow(() => inspectRenderedHtml('<main><a href="/wiki/old/">Historical link</a></main>', base, new Set(['/wiki/old/'])));
});
