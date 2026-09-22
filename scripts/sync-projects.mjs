// 저장소 README 를 고정 커밋에서 사이트로 vendoring 한다.
//
// 이 저장소에서 네트워크 또는 Git 을 읽는 유일한 스크립트이며 어떤 검증
// 파이프라인에도 연결하지 않는다. 빌드와 검증은 이 스크립트가 커밋해 둔
// generated/projects/*.md 와 config/projects-publication.json 만 읽는다.
//
//   node scripts/sync-projects.mjs                       로컬 clone(기본 ~/workspace/lrn)
//   node scripts/sync-projects.mjs --repo-root <dir>     로컬 clone 위치 지정
//   node scripts/sync-projects.mjs --remote              raw.githubusercontent 에서 받기
//   node scripts/sync-projects.mjs --slug <slug>         한 건만 갱신
//   node scripts/sync-projects.mjs --dry-run             기록하지 않고 차이만 출력
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseYaml } from './site-policy.mjs';
import { readProjectData, PROJECT_STATUS } from './check-projects.mjs';

const README_LIMIT = 512 * 1024;
const PRIVATE_HOST = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\d+\.\d+\.\d+\.\d+)/u;
const FORBIDDEN_BODY = [
  [/file:\/\//u, 'file:// URL'],
  [/\/Users\//u, '로컬 홈 경로'],
  [/(?:^|\s)~\//mu, '로컬 홈 경로'],
  [/<(?:script|iframe|form|object|embed)\b/iu, '실행 가능한 HTML'],
  [/\[\[[^\]]+\]\]/u, 'Obsidian 위키링크'],
];

/** 코드 펜스를 건드리지 않도록 본문을 (코드여부, 조각)으로 가른다. */
export function* markdownParts(body) {
  const fence = /(?<=^|\n)( {0,3})(`{3,}|~{3,})([^\n]*)(?:\n|$)/gu;
  let offset = 0;
  let open = null;
  for (const match of body.matchAll(fence)) {
    if (match.index < offset) continue;
    if (open === null) {
      if (match[2][0] === '`' && match[3].includes('`')) continue;
      open = { start: match.index, marker: match[2] };
      continue;
    }
    if (match[2][0] !== open.marker[0] || match[2].length < open.marker.length) continue;
    yield [false, body.slice(offset, open.start)];
    yield [true, body.slice(open.start, match.index + match[0].length)];
    offset = match.index + match[0].length;
    open = null;
  }
  if (open !== null) {
    yield [false, body.slice(offset, open.start)];
    yield [true, body.slice(open.start)];
    return;
  }
  yield [false, body.slice(offset)];
}

/** 선두 H1 을 떼어낸다. 제목은 frontmatter 가 소유한다. */
export function stripLeadingHeading(body) {
  const match = body.match(/^﻿?\s*#[ \t]+[^\n]*\n?/u);
  return match ? body.slice(match[0].length).replace(/^\n+/u, '') : body.replace(/^﻿/u, '');
}

/** 저장소 상대 링크를 고정 커밋의 GitHub 절대 URL 로 바꾼다. */
export function absolutizeLinks(prose, repo, ref) {
  const blob = `https://github.com/${repo}/blob/${ref}/`;
  const raw = `https://raw.githubusercontent.com/${repo}/${ref}/`;
  return prose.replace(/(!?)\[((?:[^\][]|\[[^\]]*\])*)\]\(([^()\s]+)(\s+"[^"]*")?\)/gu,
    (whole, bang, label, target, title) => {
      if (/^(?:https?:|mailto:|tel:|#|\/\/)/u.test(target)) return whole;
      if (target.startsWith('/')) return whole;
      const clean = target.replace(/^\.\//u, '');
      if (clean.startsWith('../')) {
        throw new Error(`저장소 밖을 가리키는 상대 링크: ${target}`);
      }
      const [path, fragment = ''] = clean.split(/(?=#)/u);
      const url = `${bang ? raw : blob}${posix.normalize(path)}${bang ? '' : fragment}`;
      return `${bang}[${label}](${url}${title ?? ''})`;
    });
}

/** 파싱되지 않거나 사설 호스트를 가리키면 링크로 내보내지 않는다. */
function unsafeHost(url) {
  try {
    return PRIVATE_HOST.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

/**
 * 사설·비정상 호스트 URL 을 인라인 코드로 감싼다. check-built-site 의
 * publicUrl() 이 localhost 와 파싱 불가 URL 을 거부하므로, 정보를 지우지
 * 않으면서 링크가 아니게 만든다.
 */
export function neutralizePrivateHosts(prose) {
  let out = prose.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gu,
    (whole, label, url) => (unsafeHost(url) ? `${label} \`${url}\`` : whole));
  out = out.replace(/<(https?:\/\/[^>\s]+)>/gu,
    (whole, url) => (unsafeHost(url) ? `\`${url}\`` : whole));
  // 인라인 코드 안의 URL 은 이미 링크가 아니므로 건드리지 않는다.
  return out.split(/(`+[^`]*`+)/u).map((piece, index) => (index % 2 === 1 ? piece
    : piece.replace(/(^|[^`\w/])(https?:\/\/[^\s`)<>\]]+)/gu, (whole, lead, url) => {
      let target = url;
      let tail = '';
      const trailing = target.match(/[.,;:)\]]+$/u);
      if (trailing) { tail = trailing[0]; target = target.slice(0, -tail.length); }
      if (!unsafeHost(target)) return whole;
      return `${lead}\`${target}\`${tail}`;
    }))).join('');
}

const STATIC_SUFFIXES = ['.png', '.webp', '.jpg', '.svg'];

/**
 * 인쇄에 쓸 정적 그림을 고른다. 같은 이름의 정적 파일을 먼저 보고, 없으면
 * 같은 폴더의 figure.* 를 본다. 저장소에 실제로 있는 경로만 돌려준다.
 */
export function printableStill(gifPath, hasPath) {
  const base = gifPath.replace(/\.gif$/iu, '');
  const folder = gifPath.includes('/') ? `${gifPath.slice(0, gifPath.lastIndexOf('/'))}/figure` : 'figure';
  for (const candidate of [base, folder]) {
    for (const suffix of STATIC_SUFFIXES) {
      if (hasPath(`${candidate}${suffix}`)) return `${candidate}${suffix}`;
    }
  }
  return null;
}

/**
 * 움직이는 GIF 는 인쇄에서 첫 프레임만 남아 읽히지 않는다. 정적 대체본이
 * 저장소에 있으면 <picture> 로 감싸 인쇄 때만 바꿔 넣는다.
 */
export function swapPrintableGifs(prose, { repo, ref }, hasPath) {
  const raw = `https://raw.githubusercontent.com/${repo}/${ref}/`;
  return prose.replace(/^!\[([^\]]*)\]\((\S+\.gif)\)\s*$/gimu, (whole, alt, url) => {
    if (!url.startsWith(raw)) return whole;
    const still = printableStill(url.slice(raw.length), hasPath);
    if (!still) return whole;
    return `<picture>\n`
      + `  <source media="print" srcset="${raw}${still}">\n`
      + `  <img src="${url}" alt="${alt}" loading="lazy">\n`
      + `</picture>`;
  });
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

/** 추출한 조각을 한 줄 텍스트로 정리한다. 링크·강조·각주·이모지를 걷어낸다. */
export function plainText(value, limit = 240) {
  const text = value
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/`([^`]*)`/gu, '$1')
    .replace(/\[\^[^\]]*\]/gu, '')
    .replace(/\*{1,3}/gu, '')
    .replace(/(^|\s)__(\S(?:.*?\S)?)__(?=\s|$)/gu, '$1$2')
    .replace(EMOJI, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** 본문을 '## 제목' 단위로 가른다. 코드 펜스 안의 # 은 제목이 아니다. */
export function readmeSections(body) {
  const sections = new Map();
  let current = null;
  const lines = [];
  for (const [isCode, part] of markdownParts(body)) {
    for (const line of part.split('\n')) lines.push([isCode, line]);
  }
  const intro = [];
  for (const [isCode, line] of lines) {
    const heading = isCode ? null : line.match(/^##\s+(.+?)\s*$/u);
    if (heading) {
      current = plainText(heading[1], 60);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    (current === null ? intro : sections.get(current)).push(line);
  }
  return { intro: intro.join('\n'), sections };
}

/**
 * 카드·페이지 헤더가 보여줄 대표 그림을 README 에서 뽑는다. 뽑지 못하면
 * 경고로만 남긴다. 정본은 언제나 README 다.
 */
export function extractProjectDetail(body, { repo, ref }, warn = () => {}) {
  const { intro } = readmeSections(body);
  const detail = {};

  const image = intro.match(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/u)
    ?? body.match(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/u)
    ?? body.match(/<img src="(?<url>https:\/\/[^"]+)" alt="(?<alt>[^"]*)"/u);
  if (image) {
    detail.image = image.groups?.url ?? image[2];
    detail.image_alt = plainText(image.groups?.alt ?? image[1] ?? '', 120) || undefined;
  } else warn('대표 그림을 찾지 못했습니다');

  return detail;
}

export function transformReadme(readme, { repo, ref }, hasPath = () => false) {
  const parts = [];
  for (const [isCode, part] of markdownParts(stripLeadingHeading(readme))) {
    if (isCode) { parts.push(part); continue; }
    const linked = neutralizePrivateHosts(absolutizeLinks(part, repo, ref));
    parts.push(swapPrintableGifs(linked, { repo, ref }, hasPath));
  }
  const body = `${parts.join('').trim()}\n`;
  for (const [pattern, label] of FORBIDDEN_BODY) {
    const hit = body.match(pattern);
    if (hit) throw new Error(`README 본문에 ${label} 이 있습니다: ${hit[0].slice(0, 60)}`);
  }
  return body;
}

function yamlString(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function renderProjectPage(project, body) {
  const { slug, repo, ref } = project;
  const readmePath = project.readme_path ?? 'README.md';
  const front = [
    'layout: project',
    `title: ${yamlString(project.title)}`,
    `permalink: /projects/${slug}/`,
    `slug: ${yamlString(slug)}`,
    `summary: ${yamlString(project.summary)}`,
    `status: ${yamlString(project.status)}`,
    `period: ${yamlString(project.period)}`,
    `role: ${yamlString(project.role)}`,
    `repo: ${yamlString(repo)}`,
    `repo_url: ${yamlString(`https://github.com/${repo}`)}`,
    `repo_ref: ${yamlString(ref)}`,
    `readme_url: ${yamlString(`https://github.com/${repo}/blob/${ref}/${readmePath}`)}`,
    'concepts:',
    ...project.concepts.flatMap(concept => [
      `  - title: ${yamlString(concept.title)}`,
      `    url: ${yamlString(concept.url)}`,
    ]),
    ...(project.card_image ? [`card_image: ${yamlString(project.card_image)}`,
      `card_image_alt: ${yamlString(project.card_image_alt ?? project.title)}`] : []),
    'nav_exclude: true',
    'render_with_liquid: false',
    'generated_by: scripts/sync-projects.mjs',
  ];
  return `---\n${front.join('\n')}\n---\n\n`
    + `<!-- 생성물입니다. 정본은 ${repo} 의 ${readmePath} 입니다. 수동 편집하지 마세요. -->\n\n`
    + body;
}

/** 고정 커밋의 저장소 파일 목록. 원격 모드에서는 조회하지 않는다. */
function repoPaths(project, options) {
  if (options.remote) return new Set();
  const directory = resolve(options.repoRoot, project.repo.split('/')[1]);
  const listing = execFileSync('git', ['ls-tree', '-r', '--name-only', project.ref],
    { cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return new Set(listing.split('\n').filter(Boolean));
}

const GENERATED_START = '  # --- sync:projects 생성 구간 시작 (README 에서 추출합니다. 직접 수정하지 마세요)';
const GENERATED_END = '  # --- sync:projects 생성 구간 끝';

function yamlBlock(detail) {
  const lines = [GENERATED_START, '  extract:'];
  if (detail.image) {
    lines.push(`    image: ${yamlString(detail.image)}`);
    if (detail.image_alt) lines.push(`    image_alt: ${yamlString(detail.image_alt)}`);
  }
  lines.push(GENERATED_END);
  return `${lines.join('\n')}\n`;
}

/**
 * _data/projects.yml 의 손으로 쓴 부분은 바이트 그대로 두고, 프로젝트마다
 * 생성 구간만 바꿔 넣는다. YAML 을 통째로 다시 찍지 않으므로 주석과 순서가
 * 보존된다.
 */
export function writeGeneratedBlocks(source, details) {
  const blocks = source.split(/^(?=- slug: )/gmu);
  return blocks.map(block => {
    const slug = block.match(/^- slug:\s*(\S+)/u)?.[1];
    if (!slug || !details.has(slug)) return block;
    const start = block.indexOf(GENERATED_START);
    let head = start === -1 ? block : block.slice(0, start);
    if (start !== -1) {
      const endIndex = block.indexOf(GENERATED_END, start);
      const tail = endIndex === -1 ? '' : block.slice(endIndex + GENERATED_END.length).replace(/^\n/u, '');
      head += tail.replace(/^[^\n]*\n?/u, match => (match.trim() ? match : ''));
    }
    const trailing = head.match(/\n*$/u)[0];
    return `${head.replace(/\n*$/u, '\n')}${yamlBlock(details.get(slug))}${trailing.length > 1 ? '\n' : ''}`;
  }).join('');
}

async function loadReadme(project, options) {
  const readmePath = project.readme_path ?? 'README.md';
  if (options.remote) {
    const url = `https://raw.githubusercontent.com/${project.repo}/${project.ref}/${readmePath}`;
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok) throw new Error(`README 를 받지 못했습니다 (${response.status}): ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const directory = resolve(options.repoRoot, project.repo.split('/')[1]);
  if (!existsSync(resolve(directory, '.git'))) {
    throw new Error(`로컬 clone 이 없습니다: ${directory} (--remote 로 원격에서 받을 수 있습니다)`);
  }
  return execFileSync('git', ['show', `${project.ref}:${readmePath}`],
    { cwd: directory, maxBuffer: README_LIMIT * 4 });
}

/** 로컬 clone 의 현재 HEAD 로 _data/projects.yml 의 ref 를 갱신한다. */
export async function pinHeads(root, options) {
  const dataPath = resolve(root, '_data/projects.yml');
  const source = await readFile(dataPath, 'utf8');
  const updated = source.split(/^(?=- slug: )/gmu).map(block => {
    const repo = block.match(/^\s{2}repo:\s*(\S+)$/mu)?.[1];
    if (!repo) return block;
    const directory = resolve(options.repoRoot, repo.split('/')[1]);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/u.test(head)) throw new Error(`HEAD 를 읽지 못했습니다: ${repo}`);
    return block.replace(/^\s{2}ref:\s*[a-f0-9]{40}$/mu, `  ref: ${head}`);
  }).join('');
  if (updated !== source) await writeFile(dataPath, updated);
  return updated !== source;
}

export async function syncProjects(root, options = {}) {
  if (options.pinHead && !options.remote) await pinHeads(root, options);
  const projects = await readProjectData(root);
  const manifestPath = resolve(root, 'config/projects-publication.json');
  const previous = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8')).projects ?? [] : [];
  const kept = new Map(previous.map(item => [item.slug, item]));
  const entries = [];
  const changes = [];
  const warnings = [];
  const details = new Map();
  await mkdir(resolve(root, 'generated/projects'), { recursive: true });
  for (const project of projects) {
    if (options.slug && project.slug !== options.slug) {
      const carried = kept.get(project.slug);
      if (!carried) throw new Error(`--slug 이외 항목의 기존 매니페스트가 없습니다: ${project.slug}`);
      entries.push(carried);
      continue;
    }
    if (!PROJECT_STATUS.includes(project.status)) {
      throw new Error(`알 수 없는 status: ${project.slug} → ${project.status}`);
    }
    const readme = await loadReadme(project, options);
    if (readme.length === 0 || readme.length > README_LIMIT) {
      throw new Error(`README 크기가 허용 범위를 벗어났습니다: ${project.slug} (${readme.length} bytes)`);
    }
    const paths = repoPaths(project, options);
    const body = transformReadme(readme.toString('utf8'), project, path => paths.has(path));
    details.set(project.slug, extractProjectDetail(body, project,
      reason => warnings.push(`${project.slug}: ${reason}`)));
    const page = Buffer.from(renderProjectPage(project, body));
    const output = `generated/projects/${project.slug}.md`;
    const entry = {
      slug: project.slug,
      repo: project.repo,
      ref: project.ref,
      readme_path: project.readme_path ?? 'README.md',
      readme_bytes: readme.length,
      readme_sha256: createHash('sha256').update(readme).digest('hex'),
      output_path: output,
      output_bytes: page.length,
      output_sha256: createHash('sha256').update(page).digest('hex'),
      ...(project.card_image ? { card_image: project.card_image } : {}),
    };
    const before = kept.get(project.slug);
    if (!before || before.output_sha256 !== entry.output_sha256) {
      changes.push(`${before ? 'update' : 'add'} ${project.slug}`);
    }
    if (!options.dryRun) await writeFile(resolve(root, output), page);
    entries.push(entry);
  }
  const manifest = { schema_version: 1, projects: entries };
  if (!options.dryRun) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (details.size) {
      const dataPath = resolve(root, '_data/projects.yml');
      const source = await readFile(dataPath, 'utf8');
      await writeFile(dataPath, writeGeneratedBlocks(source, details));
    }
  }
  for (const warning of warnings) console.warn(`경고 ${warning}`);
  return { projects: entries.length, changes, warnings };
}

function parseArguments(argv) {
  const options = { repoRoot: resolve(homedir(), 'workspace/lrn'), remote: false, dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--remote') options.remote = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--repo-root') options.repoRoot = resolve(argv[++index] ?? '');
    else if (flag === '--pin-head') options.pinHead = true;
    else if (flag === '--slug') options.slug = argv[++index];
    else throw new Error(`알 수 없는 인자: ${flag}`);
  }
  return options;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(import.meta.dirname, '..');
  const result = await syncProjects(root, parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

export { parseYaml };
