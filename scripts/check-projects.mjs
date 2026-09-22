// 프로젝트 섹션의 로컬 검사. 네트워크와 Git 을 사용하지 않는다.
//
// 저장소가 소유하는 것은 _data/projects.yml(수기)과 sync-projects 가 만든
// generated/projects/*.md + config/projects-publication.json(생성물)이다.
// 이 검사는 셋이 서로 어긋나지 않는지, 그리고 헤더의 개념 링크가 실제로
// 배포되는 위키 문서를 가리키는지 확인한다.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseYaml, frontMatter, siteConfig } from './site-policy.mjs';
import { readPublicProjectionBundle } from './check-public-projection.mjs';

export const PROJECT_STATUS = ['planned', 'active', 'completed', 'archived'];
const SLUG = /^[a-z0-9][a-z0-9-]*$/u;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const REF = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PERIOD = /^\d{4}-\d{2}-\d{2} ~ (?:\d{4}-\d{2}-\d{2}|현재)$/u;
const WIKI_URL = /^\/wiki\/[a-z0-9][a-z0-9-]*\/$/u;
const CARD_IMAGE = /^\/assets\/projects\/[a-z0-9][a-z0-9-]*\.(?:webp|png|jpg|svg)$/u;
const FORBIDDEN = [
  [/\[\[[^\]]+\]\]/u, 'Obsidian 위키링크'],
  [/file:\/\//u, 'file:// URL'],
  [/\/Users\//u, '로컬 홈 경로'],
  [/<(?:script|iframe|form|object|embed)\b/iu, '실행 가능한 HTML'],
];

function require_(condition, message) {
  if (!condition) throw new Error(`projects: ${message}`);
}

/** _data/projects.yml 을 읽고 스키마를 검사한다. */
export async function readProjectData(root) {
  const source = await readFile(resolve(root, '_data/projects.yml'), 'utf8');
  const projects = parseYaml(`projects:\n${source.replace(/^/gmu, '  ')}`, '_data/projects.yml').projects;
  require_(Array.isArray(projects) && projects.length > 0, '_data/projects.yml 이 비어 있습니다');
  const slugs = new Set();
  for (const project of projects) {
    const at = `_data/projects.yml[${project?.slug ?? '?'}]`;
    require_(SLUG.test(project?.slug ?? ''), `${at}: slug 형식이 올바르지 않습니다`);
    require_(!slugs.has(project.slug), `${at}: slug 가 중복됩니다`);
    slugs.add(project.slug);
    for (const field of ['title', 'summary', 'period', 'role']) {
      require_(typeof project[field] === 'string' && project[field].trim(), `${at}: ${field} 가 비어 있습니다`);
    }
    require_(project.summary.length <= 90, `${at}: summary 는 90자 이하여야 합니다`);
    require_(PROJECT_STATUS.includes(project.status), `${at}: status 가 올바르지 않습니다`);
    require_(PERIOD.test(project.period), `${at}: period 는 "YYYY-MM-DD ~ YYYY-MM-DD" 형식입니다`);
    require_(REPO.test(project.repo ?? ''), `${at}: repo 는 owner/name 형식입니다`);
    require_(REF.test(project.ref ?? ''), `${at}: ref 는 40자리 커밋 SHA 여야 합니다 (브랜치 이름 불가)`);
    require_(Array.isArray(project.concepts) && project.concepts.length === 3,
      `${at}: concepts 는 정확히 3개여야 합니다`);
    for (const concept of project.concepts) {
      require_(typeof concept?.title === 'string' && concept.title.trim(), `${at}: 개념 제목이 비어 있습니다`);
      require_(WIKI_URL.test(concept?.url ?? ''), `${at}: 개념 URL 이 /wiki/<slug>/ 형식이 아닙니다: ${concept?.url}`);
    }
    if (project.card_image !== undefined) {
      require_(CARD_IMAGE.test(project.card_image), `${at}: card_image 경로가 올바르지 않습니다`);
      require_(existsSync(resolve(root, project.card_image.slice(1))), `${at}: card_image 파일이 없습니다`);
    }
    if (project.readme_path !== undefined) {
      require_(/^[A-Za-z0-9][A-Za-z0-9./_-]*\.md$/u.test(project.readme_path)
        && !project.readme_path.includes('..'), `${at}: readme_path 가 올바르지 않습니다`);
    }
  }
  return projects;
}

/** wiki_show_planned 를 반영해 실제로 배포되는 위키 permalink 집합을 만든다. */
export async function retainedWikiUrls(root) {
  const config = await siteConfig(root);
  const { documents } = await readPublicProjectionBundle(root);
  const byId = new Map(documents.map(document => [document.projection_id, document]));
  const retained = new Set(documents
    .filter(document => config.wiki_show_planned === true || document.content_status !== 'planned')
    .map(document => document.projection_id));
  for (const id of [...retained]) {
    let parent = byId.get(id).public_parent_id;
    while (parent && byId.has(parent) && !retained.has(parent)) {
      retained.add(parent);
      parent = byId.get(parent).public_parent_id;
    }
  }
  return new Set([...retained].map(id => byId.get(id).permalink));
}

export async function checkProjects(root) {
  const projects = await readProjectData(root);
  const manifestPath = resolve(root, 'config/projects-publication.json');
  require_(existsSync(manifestPath), 'config/projects-publication.json 이 없습니다 (npm run sync:projects)');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  require_(manifest.schema_version === 1, '매니페스트 schema_version 이 1 이 아닙니다');
  require_(Array.isArray(manifest.projects), '매니페스트 projects 가 배열이 아닙니다');
  require_(manifest.projects.length === projects.length,
    `매니페스트 항목 수가 다릅니다 (${manifest.projects.length} ≠ ${projects.length}) — npm run sync:projects`);
  const wikiUrls = await retainedWikiUrls(root);
  const entries = new Map(manifest.projects.map(entry => [entry.slug, entry]));
  let checkedConcepts = 0;
  for (const project of projects) {
    const at = `projects[${project.slug}]`;
    const entry = entries.get(project.slug);
    require_(entry, `${at}: 매니페스트에 없습니다 — npm run sync:projects`);
    require_(entry.repo === project.repo && entry.ref === project.ref,
      `${at}: 매니페스트의 repo/ref 가 _data 와 다릅니다 — npm run sync:projects`);
    require_(SHA256.test(entry.readme_sha256) && SHA256.test(entry.output_sha256),
      `${at}: 매니페스트 해시 형식이 올바르지 않습니다`);
    require_(entry.output_path === `generated/projects/${project.slug}.md`,
      `${at}: output_path 가 규칙과 다릅니다`);

    const file = resolve(root, entry.output_path);
    require_(existsSync(file), `${at}: ${entry.output_path} 가 없습니다 — npm run sync:projects`);
    const bytes = await readFile(file);
    require_(bytes.length === entry.output_bytes
      && createHash('sha256').update(bytes).digest('hex') === entry.output_sha256,
      `${at}: 생성물이 매니페스트와 다릅니다 (수동 편집했거나 동기화가 필요합니다)`);

    const text = bytes.toString('utf8');
    const front = frontMatter(text, entry.output_path);
    require_(front.layout === 'project' && front.nav_exclude === true
      && front.render_with_liquid === false,
      `${at}: 생성물 frontmatter 의 layout/nav_exclude/render_with_liquid 가 다릅니다`);
    require_(front.permalink === `/projects/${project.slug}/`, `${at}: permalink 가 다릅니다`);
    for (const field of ['title', 'summary', 'status', 'period', 'role', 'repo']) {
      require_(front[field] === project[field],
        `${at}: 생성물의 ${field} 가 _data 와 다릅니다 — npm run sync:projects`);
    }
    require_(front.repo_ref === project.ref, `${at}: 생성물의 repo_ref 가 다릅니다`);
    require_(Array.isArray(front.concepts) && front.concepts.length === 3,
      `${at}: 생성물의 concepts 가 3개가 아닙니다`);

    const body = text.slice(text.indexOf('\n---', 3) + 4);
    for (const [pattern, label] of FORBIDDEN) {
      require_(!pattern.test(body), `${at}: 본문에 ${label} 이 있습니다`);
    }
    for (const concept of project.concepts) {
      require_(wikiUrls.has(concept.url),
        `${at}: 개념 링크가 배포되는 위키 문서가 아닙니다: ${concept.url}`);
      checkedConcepts++;
    }
  }
  return { projects: projects.length, concepts: checkedConcepts, wikiPages: wikiUrls.size };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(await checkProjects(resolve(import.meta.dirname, '..')));
}
