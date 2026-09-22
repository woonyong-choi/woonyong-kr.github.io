import { strict as assert } from 'node:assert';
import test from 'node:test';
import { resolve } from 'node:path';
import { checkProjects, readProjectData, retainedWikiUrls } from './check-projects.mjs';
import {
  absolutizeLinks, markdownParts, neutralizePrivateHosts, stripLeadingHeading, transformReadme,
} from './sync-projects.mjs';
import { verifyProjectPublication } from './check-built-site.mjs';

const root = resolve(import.meta.dirname, '..');
const repo = 'owner/name';
const ref = 'a'.repeat(40);

test('선두 H1 만 떼어내고 이후 heading 은 남긴다', () => {
  assert.equal(stripLeadingHeading('# 제목\n\n본문\n\n# 다른 제목\n'), '본문\n\n# 다른 제목\n');
  assert.equal(stripLeadingHeading('본문만 있다\n'), '본문만 있다\n');
});

test('상대 링크만 고정 커밋 URL 로 바꾼다', () => {
  const out = absolutizeLinks('[a](src/x.c) [b](./docs/y.md#절) ![c](docs/d.gif) [d](https://e.com) [e](#anchor) [f](/wiki/z/)', repo, ref);
  assert.match(out, /\[a\]\(https:\/\/github\.com\/owner\/name\/blob\/a{40}\/src\/x\.c\)/u);
  assert.match(out, /\[b\]\(https:\/\/github\.com\/owner\/name\/blob\/a{40}\/docs\/y\.md#절\)/u);
  assert.match(out, /!\[c\]\(https:\/\/raw\.githubusercontent\.com\/owner\/name\/a{40}\/docs\/d\.gif\)/u);
  assert.match(out, /\[d\]\(https:\/\/e\.com\)/u);
  assert.match(out, /\[e\]\(#anchor\)/u);
  assert.match(out, /\[f\]\(\/wiki\/z\/\)/u);
});

test('저장소 밖을 가리키는 상대 링크는 거부한다', () => {
  assert.throws(() => absolutizeLinks('[a](../other/x.md)', repo, ref), /저장소 밖/u);
});

test('코드 펜스 안은 변환하지 않는다', () => {
  const body = '[a](src/x.c)\n\n```sh\n[b](src/y.c)\n```\n\n[c](src/z.c)\n';
  const out = transformReadme(`# T\n\n${body}`, { repo, ref });
  assert.match(out, /\[a\]\(https:\/\/github\.com/u);
  assert.match(out, /\[b\]\(src\/y\.c\)/u);
  assert.match(out, /\[c\]\(https:\/\/github\.com/u);
});

test('사설 호스트와 파싱 불가 URL 을 인라인 코드로 바꾼다', () => {
  assert.equal(neutralizePrivateHosts('열기 http://127.0.0.1:8765 에서'), '열기 `http://127.0.0.1:8765` 에서');
  assert.equal(neutralizePrivateHosts('<http://localhost:3000/x>'), '`http://localhost:3000/x`');
  assert.equal(neutralizePrivateHosts('[데모](http://localhost:3000)'), '데모 `http://localhost:3000`');
  assert.equal(neutralizePrivateHosts('`GET http://host:port/p`'), '`GET http://host:port/p`');
  assert.equal(neutralizePrivateHosts('공개 https://docs.woonyong.com/x/ 는 그대로'), '공개 https://docs.woonyong.com/x/ 는 그대로');
});

test('금지 패턴이 있는 README 는 거부한다', () => {
  assert.throws(() => transformReadme('# T\n\n[[위키링크]]\n', { repo, ref }), /위키링크/u);
  assert.throws(() => transformReadme('# T\n\n<script>alert(1)</script>\n', { repo, ref }), /HTML/u);
  assert.throws(() => transformReadme('# T\n\n/Users/someone/x\n', { repo, ref }), /로컬 홈 경로/u);
});

test('markdownParts 는 닫히지 않은 펜스를 코드로 남긴다', () => {
  const parts = [...markdownParts('a\n\n```\nb\n')];
  assert.equal(parts.at(-1)[0], true);
});

test('_data/projects.yml 이 스키마를 지킨다', async () => {
  const projects = await readProjectData(root);
  assert.ok(projects.length >= 1);
  for (const project of projects) assert.equal(project.concepts.length, 3);
});

test('개념 링크가 실제로 배포되는 위키 문서다', async () => {
  const [projects, urls] = await Promise.all([readProjectData(root), retainedWikiUrls(root)]);
  for (const project of projects) {
    for (const concept of project.concepts) {
      assert.ok(urls.has(concept.url), `${project.slug}: ${concept.url}`);
    }
  }
});

test('생성물과 매니페스트가 일치한다', async () => {
  const result = await checkProjects(root);
  assert.equal(result.concepts, result.projects * 3);
});

test('배포 경계 검사가 잘못된 매니페스트를 거부한다', async () => {
  await assert.rejects(() => verifyProjectPublication(root, { schema_version: 1, projects: [] }), /Invalid project publication manifest/u);
  await assert.rejects(() => verifyProjectPublication(root, {
    schema_version: 1,
    projects: [{ slug: 'x', repo: 'o/n', ref: 'main', readme_sha256: 'a'.repeat(64), output_sha256: 'a'.repeat(64), output_path: 'generated/projects/x.md', output_bytes: 1, readme_bytes: 1 }],
  }), /Invalid project publication entry/u);
});
