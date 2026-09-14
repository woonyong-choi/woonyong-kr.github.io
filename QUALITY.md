# WN Docs 품질 개선 검증 기록

2026-09-08. 테마·실행기 개선과 별도 승인된 Wiki 생성물 갱신을 통합한다.
내용은 Vault producer에서 생성했고 사이트에서 생성 Markdown을 직접 보정하지 않았다.

## 2026-09-14 첫 접속의 HTML 선언 노출 수정

공개 사이트의 느린 첫 접속에서 `<!doctype html>` 글자와 Home 링크가 먼저 보였다.
`index.md`의 Markdown 변환이 문서 선언을 본문으로 이스케이프한 것이 원인이다.
진입 파일을 `index.html`로 바꾸고 외부 자산 없이 OS 테마를 따르는 이동 안내를 넣었다.
기존 `/wiki/home/` 자동 이동과 JavaScript 없는 이동, 수동 링크는 유지한다.

이동 완료 뒤에는 사라지는 결함이므로 루트 응답을 브라우저 DOMParser로 별도 파싱한다.
수정 전에는 doctype 검사에 실패했고 수정 후 Chromium·Firefox·WebKit의 관련 검사 21개가 통과했다.
로컬 느린 접속의 중간 프레임, 375px 화면, 테마 전환과 콘솔 오류 부재도 직접 확인했다.

## 2026-09-10 사이트 공통 실행 정책 연결

사이트의 언어별 실행기 선택과 서버 주소 복구를 공통 `createPrivateWebRunnerRegistry`로 옮겼다.
호스트는 현재 endpoint만 제공하고, 공통 소스가 브라우저 실행과 개인 컴파일러를 선택한다.
사이트용 source pin은 `fbe0145107f3dae12ce02a83c24727e2190070e4`이며, plugin 0.7.7 release의
`af346fe853f5a940fb1e5a0a648ccf63c228a80f`와 구분한다. 일반 plugin의 provider 기본 정책은 바꾸지 않았다.

기존 web bundle 금지 검사는 유지했다. 실제 빌드 graph에 공개 provider와 localhost companion 구현이
포함되지 않으며 초기 loader는 2,809 bytes, gzip 1,550 bytes다. 타입·production build·최종 파일 검사를
통과했고, 관련 브라우저 검사 17개를 Chromium·Firefox·WebKit에서 확인했다. 기존 lazy mount,
React·TypeScript 지연 로딩, 주소 수정·offline 복구, 429, 같은 ID 취소와 Worker 중단·Canvas 검사를 재사용했다.
주소가 잘못돼도 브라우저 예제가 실행되는지와 외부 POST가 없는지를 기존 복구 검사에 추가했다.
별도 취소 검사는 서버 정리가 확인되지 않을 때 완료로 표시하지 않고 소스를 다시 보내지 않는 경계를 보호한다.
개인 서버 응답은 이 통합 검사에서 로컬 fixture로 제공하며 실제 서버 정리 성공으로 확대하지 않는다.

## 2026-09-10 재현 기반 후속 점검

아래 수정은 2026-09-10 정식 릴리스로 공개했다. 공개 파일을 다시 내려받아 검증본과 SHA-256을 대조했다. Community 심사나 Google 실제 계정 동기화 성공을 뜻하지 않는다.

| 대상 | 확인한 원인과 수정 | 검증 범위 |
| --- | --- | --- |
| Runnable 설정 | SecretComponent는 비밀 값이 아니라 비밀 이름을 선택한다. 이름만 저장하고 기존 고정 이름의 읽기 호환성을 유지했다. | 설정·plugin·companion 관련 16개 검사, check/build. 실제 Obsidian에서 로컬 연결 상태 복구 |
| Kotlin companion | 이미지에 포함된 coroutines JAR이 compile/runtime classpath에 빠져 있었다. 추가 다운로드 없이 기존 JAR을 연결했다. | 실제 Docker를 포함한 11개 검사. 같은 Obsidian 예제가 unresolved kotlinx 실패에서 4.31초 Success로 전환 |
| Linked Graph | 검색 명령이 실제 검색창의 부모가 아닌 외부 컨테이너를 열었다. 렌더링과 검색 모두 공개 contentEl을 사용하며 자식 배열 위치 의존을 제거했다. | 수정 전 검색 명령 검사 실패, 수정 후 check/48개 검사. 실제 명령으로 검색창 표시·입력 포커스 확인 |
| Calendar 인증 | 연결 해제 뒤 늦은 인증·갱신 응답이 토큰을 다시 저장했다. 연결 세대가 바뀐 응답을 폐기한다. | 12개 인증 검사. 실제 Google 계정 인증·동기화는 이 검사에 포함되지 않음 |
| Calendar 색인 | 초기화·비활성화 이전의 읽기 결과가 일정을 되살렸다. 파일별 누적 버전 대신 현재 읽기 요청만 보관하고 완료·초기화·삭제 때 제거한다. | 23개 색인 검사, check/build/Knip. 수정본의 실제 월간 화면 확인 |
| 사이트 문서 렌더링 | Merge Sort C 초기화 구문의 이중 중괄호를 Liquid 변수로 오인해 CI 빌드가 실패했다. 공개 Markdown 본문만 Liquid 평가를 끄고 HTML redirect와 layout의 템플릿 처리는 유지한다. | 실패 run 34455891415의 배포는 건너뛰었다. 수정 4b008c9의 run 34456621298 배포 성공, 브라우저 82개 통과, 공개 예제 3개 출력 hash·역사 주소 8개 확인 |

세 플러그인의 Knip 결과는 미사용 항목 0이었다. Runnable·Calendar 전체 의존성 audit와 Graph 제품 의존성 audit도 보고된 취약점 0이었다. 이 결과를 모든 동작의 무결함으로 확대하지 않는다. 이전 설정 migration과 사용하는 CodeMirror legacy-modes는 호환성·구문 강조 경로가 있어 유지했다. 사이트는 공통 실행기 submodule을 사용하며, 호스트 색상 토큰과 연결 설정만 분리한다. 확인된 공유 코드 중복이 없으므로 새 공통 프레임워크를 추가하지 않았다.

## 2026-09-10 정식 릴리스 확인

| 제품 | 공개 버전 | 최종 CI / 릴리스 작업 | 공개 파일 대조 |
| --- | --- | --- | --- |
| Runnable | [0.7.4](https://github.com/woonyong-kr/obsidian-runnable-code-blocks/releases/tag/0.7.4) | [34459821737](https://github.com/woonyong-kr/obsidian-runnable-code-blocks/actions/runs/34459821737) / [34460078795](https://github.com/woonyong-kr/obsidian-runnable-code-blocks/actions/runs/34460078795) | plugin 3개와 별도 companion 1개 모두 일치 |
| Graph | [1.6.11](https://github.com/woonyong-kr/obsidian-linked-graph-navigator/releases/tag/1.6.11) | [34460445045](https://github.com/woonyong-kr/obsidian-linked-graph-navigator/actions/runs/34460445045) / [34460563283](https://github.com/woonyong-kr/obsidian-linked-graph-navigator/actions/runs/34460563283) | 3개 모두 일치 |
| Calendar | [3.6.3](https://github.com/woonyong-kr/obsidian-link-calendar-navigator/releases/tag/3.6.3) | [34460724788](https://github.com/woonyong-kr/obsidian-link-calendar-navigator/actions/runs/34460724788) / [34460842717](https://github.com/woonyong-kr/obsidian-link-calendar-navigator/actions/runs/34460842717) | 3개 모두 일치 |

Runnable CI는 unit 180개와 browser 26개를 통과했다. CI의 Docker 조건부 검사 1개는 생략되며 별도 로컬 Docker/profile 11개 통과 근거를 사용한다. Graph는 Node 20/22/24에서 검사·제품 의존성 audit를 통과했고, Calendar는 plugin 123개와 OAuth worker·visual·build 검사를 통과했다. 실제 앱에서 이미 확인한 동일 main.js와 styles.css를 재사용했으며 patch manifest만 버전에 맞췄다. 기존 캡처의 촬영 버전·날짜는 새 촬영으로 바꾸지 않았다.

공개 main.js SHA-256: Runnable `b18587a467e419fe10ddde6708b54b31ae399f266eaa3adca956310d1745a772`, Graph `39a385878dd644563bfc3568270649c835caf27b69d1519870e1fcee71583305`, Calendar `cec15512b9dc517650304259cb4e7fcd47baf443195dd0ab32ecf7a748a2db56`. Companion은 `eb90564f236c1e9ef571979bb4661e44cd85fe83c05d2831e02c2420840acc35`다.

Graph 릴리스에는 GitHub 화면에서 실행할 수 있는 workflow_dispatch를 추가했다. 기존 태그 경로를 유지하며 manifest 버전 일치, main 브랜치, 해당 커밋의 성공한 CI와 명시적 release target을 요구한다. 로컬 Git 인증을 새로 발급하지 않고 공식 workflow 권한으로 공개했다.

## 후속 공개 코드 리터럴 검사 수정

DP 예제의 Python `[[0]]`가 소스 검사에서 Obsidian 링크로 오인됐다. 생성 예제는 수정하지 않고, wikilink 검사에서만 compiler와 같은 top-level backtick/tilde fence를 구분했다. fence 밖 링크와 코드 안의 로컬 경로·비공개 링크·session ID 차단은 유지한다. 중첩 리스트·서로 다른 fence 길이·닫히지 않은 fence·잘못된 info string·개인정보 경계를 회귀 검사하고 Jekyll이 같은 리터럴을 code로 보존하는지도 검사한다.

capability timeout 브라우저 검사는 복구 UI가 표시됐는데도 요청 전 lazy editor 로딩까지 합산해 4,556ms로 실패했다(run 34466898642, 허용 4,500ms). 시작점을 첫 실제 capability 요청으로 옮기고 UI 4,000ms·전체 4,500ms 상한과 Check again 복구 검증은 유지했다. 실패 배포는 건너뛰어 직전 공개본을 보존했다.

## 검증 범위와 비교 조건

- 실행기 기준 revision: `4e9268d` → `3d5c849`. 공통 구현 `5b740e7`의 `npm run verify`와
  [원격 CI](https://github.com/woonyong-kr/obsidian-runnable-code-blocks/actions/runs/34159250664)가 통과했다.
  최종 revision은 취소 테스트의 완료 관찰만 강화한 별도 commit이며 격리된 원본에서 typecheck·147개 테스트를 다시 통과했다.
  [최종 commit CI](https://github.com/woonyong-kr/obsidian-runnable-code-blocks/actions/runs/34162244451)도 전체 verify를 통과했다.
- 사이트 기준 revision: `1c42064`. 공개 projection은 별도 Wiki 작업에서 167개 → 1,337개로 갱신됐다.
  따라서 전체 HTML 전송량을 테마 최적화의 전후 수치로 비교하지 않는다.
- 같은 역할의 자산을 Node `gzipSync` 기본값으로 비교한다. 초기 실행 비용은
  Run을 누르지 않은 일반 문서에서 측정하며, 모든 정적 import 조각을 포함한다.

| 항목 | 변경 전 | 변경 후 |
| --- | ---: | ---: |
| 초기 실행기 JS 원본 bytes | 997,282 | 2,751 |
| 초기 실행기 JS gzip bytes | 307,401 | 1,519 |
| 전체 색상 stylesheet | 3 | 2 |
| 기본 light stylesheet bytes | 135,039 | 134,984 |
| custom dark stylesheet bytes | 140,800 | 140,743 |
| 별도 중복 light stylesheet bytes | 135,042 | 0 |

초기 실행기 전송량은 gzip 기준 약 99.5% 감소했다. 작은 upstream navigation 보조 CSS와
사이트별 보조 CSS는 유지한다. 실행기 본체, React, TypeScript, 개인 서버 요청은 일반 문서에서 0건이다.
화면 밖 block은 편집기를 만들지 않으며 React·Sucrase는 해당 실행 전에는 요청하지 않는다.
실행기 전체를 사용하면 필요한 chunk를 내려받으므로 모든 코드 실행의 총 전송량이 99.5% 줄었다는 의미는 아니다.

## 테스트 유지·교체·삭제 판단

| 대상 | 조치와 실제로 보호하는 동작 |
| --- | --- |
| stylesheet ID/HTML 문자열로 테마 성공 판정 | 삭제. 실제 OS 테마, 첫 화면, module 지연·차단, 수동 선택, 페이지 재진입, no-JS 검사로 교체 |
| HTML provider 하나로 실행 순서 판정 | private-first/remote-first의 두 provider 선택 순서와 실제 POST 한 번을 검증하도록 교체 |
| 언어/provider 개수·내부 배열 순서 고정 | 대표 공개 fence 호환성과 실제 registry/provider 선택 계약으로 교체 |
| CSS 최대 높이 문자열 assertion | 중복 assertion 삭제. 실제 102/103줄 편집기 스크롤 경계 브라우저 검사를 유지 |
| TypeScript 소스 정규식으로 언어 추출 | runtime 없는 `language-catalog` 진입점을 build tool에서 읽어 fence 예제 누락을 검사 |
| wikilink만 확인한 공개 경계 테스트 | 중복 YAML key, 타입, alias/merge/tag, 다중 문서, 파일 종류, symlink, 중복 URL/ID, 렌더링 URL별 실패 사례로 분리 |
| 정해진 microtask 횟수/임의 sleep | UI 상태·preview-ready·요청 실패 이벤트 등 관찰 가능한 완료를 기다리도록 교체 |
| 취소·중복 실행·sandbox·출력 제한 | 유지. late result, HTTP body 취소, preview 중단/재시작과 연결 |
| 두 저장소에서 같은 runner mock 반복 | 공통 원본이 runner·Obsidian·provider 계약을 담당하고 사이트는 실제 Jekyll 산출물과 웹 연결을 담당 |

공통 원본: Node/Vitest 147개, Chromium E2E 9개. Coverage는
statements 80.81%, branches 76.19%, functions 81.67%, lines 84.72%이며 기존 threshold를 낮추지 않았다.
사이트 검사는 Node/Jekyll 경계·integration, Wiki visibility Ruby 검사와 Chromium/Firefox/WebKit의 실제 문서를 사용한다.
통합 commit `c204ee4`의 로컬·원격 `npm run verify`: Node/Jekyll 25개, Ruby 4개, 브라우저 32개 모두 통과했다.
운영 확인에서 발견한 검색 focusout 회귀를 추가한 뒤 실제 빌드·공개 산출물 검사와 브라우저 35개를 통과했다.
최종 산출물 1,340개 HTML·1,361개 파일과 2,610개 내부 링크 및 제목 앵커를 검사했다.
테스트 개수 자체를 품질 목표로 삼지 않는다.

## 재현으로 확인한 회귀

- 변경 전 HTTP helper는 header 수신 뒤 timeout을 해제했다. 멈춘 body, header 이후 취소,
  1MiB 초과 응답 재현 3개가 실패했고 body 소비까지 책임지는 helper로 수정 후 통과했다.
- 전체 22초 deadline 초과 뒤 재시도와 429 Retry-After metadata 누락을 실패 테스트로 확인했다.
  전송 실패는 같은 request ID로 최대 한 번만 재시도하며 취소·timeout·429는 자동 실행하지 않는다.
- 격리된 임시 checkout에서 늦은 결과를 막는 상태 guard를 제거했다. 기존 취소 테스트가 잘못 통과하는 것을 확인한 뒤,
  실제 실행 Promise의 완료를 기다리도록 강화했다. 같은 mutation에서 cancelled가 success로 바뀌어 테스트가 실패하고,
  원본 guard를 복원하면 통과한다. 다른 작업의 진행 중인 변경은 이 검증과 commit에 포함하지 않았다.
- quoted 중복 승인 key, 예상 밖 파일과 중복 permalink 등의 기존 validator 실패 사례를 확인했다.
  YAML schema와 최종 산출물 allowlist로 거부한다. `projection_sha256`는 파일 해시로 재계산하지 않는다.
- light 보조 버튼 4.37:1, 실행 환경 표시 4.46:1, 선택된 코드 줄의 문자열 4.34:1을 실제 렌더에서 발견해
  foreground/background를 함께 조정했다. 검사하는 본문·버튼·편집기 token은 4.5:1 이상이다.
- 모바일 no-JS 화면의 GitHub 링크 누락을 실제 브라우저에서 발견해 보완했다.
- 현재 문서 조상은 펼쳐져 있는데 aria-expanded=false인 upstream 동작을 3브라우저에서 재현했다.
  초기 navigation 동작 후 속성을 동기화하고 실제 키보드 접기·펼치기를 검사한다.
- Wiki 영어 표제의 한국어 별칭은 검색 metadata로 보존한다. 기본 Latin trimmer가 한글과 C++/C# 기호를
  제거하는 실패를 실제 검색에서 확인하고 공식 Lunr 확장 지점에서 Unicode 문자·숫자와 언어 기호를 보존한다.
- 실제 배포 화면에서 검색창의 focusout 대상이 null일 때 upstream이 예외를 내고 검색을 닫지 못하는 결함을 발견했다.
  실제 `blur()` 후 닫기·다시 열기와 pageerror 검사가 수정 전 3브라우저에서 모두 실패했다. Jekyll hook이 gem의
  검색 코드에 작은 null guard를 적용하도록 했다. upstream 전체 파일을 복사하지 않으며, 해당 구문이 바뀌면
  빌드를 실패시켜 호환성 수정을 다시 검토하게 한다.
- 브라우저는 실패한 module import를 현재 문서에 캐시한다. 최초 다운로드 실패 때는 원래 코드를 보존하고
  작동하는 새로고침 복구를 제공한다. 서버 offline/잘못된 endpoint 복구는 새로고침 없이 편집 내용을 유지한다.

## 공개 경계와 정리

로컬 canonical producer 비교: 1,337개, missing 0 / extra 0 / bytes changed 0.
`wiki_show_planned:false`의 실제 Jekyll integration은 HTML·navigation·검색·sitemap을 함께 검증한다.
기본 true 설정은 공개 승인된 전체 키워드를 보여 준다. 공개 상태를 우회하는 설정은 아니다.

43개 데모와 upstream CHANGELOG/MIGRATION의 종료 URL은
[retired-urls.json](tests/fixtures/retired-urls.json)에 있다. 이 주소는 404이며 홈으로 redirect하지 않는다.
showcase는 `/docs/ui-components/runnable-code-blocks/`를 유지하고 검색에서 찾을 수 있다.
Wiki 상위 navigation은 Home과 9개 분류를 유지한다.

데모 이미지 2개, 중복 light entry와 취약한 정적 테마 검사도 제거했다.
LICENSE, lockfiles, footer override, sandbox·접근성 보호와 사용하는 legacy-modes는 유지했다.
README의 생성 bundle `git add` 명령을 제거했다.

## 추가 개선: 실제 실행 종료와 개인 파비콘

이 추가 작업은 Wiki 본문·Vault·생성 Markdown을 수정하지 않았다. 사이트 `136b7e6`에서
별도 worktree로 테마/실행기만 변경했다. 위쪽의 기존 검증 수치는 앞선 개선 시점의 기록이다.

- 실행기 `454e268799ca10fc527e7ef9a9c02540214e3d5f`의
  [원격 verify](https://github.com/woonyong-kr/obsidian-runnable-code-blocks/actions/runs/34207869072)가 통과했다.
  Node/Vitest 158개, Chromium E2E 16개, 별도 Chromium/Firefox/WebKit 핵심 실행 검사 21개를 통과했다.
  사이트 연결 검사에서 찾은 inline HTML handler 회귀를 후속 `31ee753`에서 보완했고,
  최종 원본의 로컬 `npm run verify`와
  [후속 원격 CI](https://github.com/woonyong-kr/obsidian-runnable-code-blocks/actions/runs/34209605335)는
  Node/Vitest 158개와 Chromium E2E 17개를 통과했다.
  Coverage는 statements 81.65%, branches 74.43%, functions 84.75%, lines 86.31%다.
  기존 threshold는 유지하며 별도 iframe bundle entry만 Node coverage에서 제외하고 실제 브라우저에서 검증한다.
- 취소 요청은 기존 UUID로 `POST /v1/cancel`을 보내며 source를 다시 전송하지 않는다.
  컨테이너 생성 중 취소, 취소 후 늦은 POST, IP 변경 후 취소, 제거 실패, 늦은 취소 응답을 검사한다.
  Docker 컨테이너의 강제 제거가 끝난 뒤에만 서버가 `cancelled`를 응답한다.
- 운영 서버에서 실제 무한 반복 Python PID를 관찰한 뒤 취소를 요청했다.
  534ms 후 취소 확인, 컨테이너 소멸, 원래 요청 409, 같은 UUID 재사용 거부와 새 실행 성공을 확인했다.
  요청 ID와 운영 환경 경로를 포함하는 상세 receipt는 로컬에만 보관한다.
- React 무한 반복의 기존 iframe 정지 실패를 실제 브라우저에서 먼저 재현했다.
  사용자 JavaScript를 Worker로 이동해 Stop으로 실제 Worker close를 확인하며,
  응답이 없는 Worker는 2초 watchdog이 종료한다. 동기 루프, 끝없는 Promise microtask,
  native 정규식 반복을 각각 검사한다. 문서·테마 제어는 응답을 유지한다.
- 실제 사이트의 `onclick` 예제가 Worker DOM의 attribute selector에서 대상 요소를 찾지 못하는
  실패를 3브라우저에서 발견했다. 충돌을 피하는 class로 연결을 바꾸고, 클릭·누름 이벤트 및
  `this`가 같은 요소를 가리키는지 실패→통과 재현으로 고정했다.
- 작성자 script는 iframe 안에서 실행 가능한 script가 아니라 inert JSON으로 전달한다.
  DOM 메시지의 크기·빈도·노드 수와 허용 opcode를 제한하고 executable element/attribute를 거부한다.
  기존 sandbox, 네트워크 제한, 출력 상한과 React state/portal 및 TypeScript DOM 이벤트를 검증했다.
- 실행기 HTML 문자열에 `unsafe-inline`을 요구하던 검사와 React 내부 module 이름 검사는 제거하고
  실행 결과·실제 Worker 종료·재시작 검증으로 교체했다. 사이트는 실제 Jekyll 산출물에서
  취소 RPC 연결과 preview 종료/복구를 확인한다. 공통 mock 시나리오는 원본 테스트가 담당한다.
- 사용자 지정에 따라 보라색 JTD 글자 파비콘을 녹색 DOC로 교체했다.
  폰트에 의존하지 않는 vector 원본은 `tools/favicon.svg`, 탭 아이콘은 16/24/32/64px ICO다.
  기존 asset SHA revision을 파비콘 URL에도 적용하며 외부 이미지 요청은 추가하지 않는다.
- 추가한 Worker DOM의 Apache-2.0 고지문은 배포 자산
  `assets/js/runnable/THIRD_PARTY_NOTICES.txt`에 포함하고 최종 파일 allowlist/해시 검사에 연결한다.

같은 fixture/build 조건의 실행기 초기 import 합계는 2,751 → 2,681 bytes,
gzip은 1,519 → 1,482 bytes다. 새 preview Worker chunk는 84,310 bytes / gzip 23,110 bytes이며
HTML/Web/React 실행 때만 요청한다. 일반 문서는 이 chunk를 요청하지 않는다.
실행기 본체는 gzip 194,356 → 195,626 bytes다. CPU 종료를 위한 코드 비용은 실행 시에 지불한다.

## Canvas와 Kotlin 종료 진단 후속 개선

- 실행기 `b1c4989fa966919edd148b56022c64dac2ea7249`에서 native OffscreenCanvas의
  2D·WebGL·WebGL2를 Worker 안에서 실행한다. 실제 shader 출력·readback·크기 변경·입력·
  증분 그리기·Worker 종료와 재시작을 Chromium/Firefox/WebKit 15개 검사로 확인했다.
  이 신규 기능 검사는 수정 전 revision에서 4개 모두 실패했다.
- 화면에는 bounded ImageBitmap만 전송하고 generic DOM method executor는 열지 않았다.
  canvas 최대 8개·한 변 2048px·개별 1 megapixel·전체 4 megapixel, 최대 30fps 및
  canvas별 전송 중 이미지 1개를 제한한다. frame의 크기 제한만 완화한 임시 mutation에서는
  비정상 전송 보호 검사가 실제 실패했고 원상 복구 후 최종 검증했다.
- Kotlin 정상 예제가 CPU를 제한한 실제 Docker에서 15초 후 `exitCode: 137` 및 빈 stdout/stderr로
  끝나는 현상을 재현했다. 같은 조건의 수정본은 `exitCode: 124`, `failureReason: timeout`,
  컴파일을 포함한 15초 제한 설명을 반환한다. 기존 최초 1회는 stderr/exitCode 기록이 없어
  원인을 소급 확정하지 않는다. 수정 후 일반 조건의 실제 Kotlin 4회는 모두 정상 출력했다
  (4.44–5.07초). 확인된 Docker OOM과 진단 없는 비정상 종료도 별도로 분류한다.
- 취소 테스트는 실제 child process가 1초 내 시작한다는 가정을 제거하고 시작·제거 이벤트를
  기다린다. 기존 취소·중복 실행·sandbox·출력 제한 검사는 유지했다. timeout·OOM·동일 ID
  결과 재사용·선택적 metadata 검사를 추가했고 기준을 낮추지 않았다.
- 원본의 최종 `npm run verify`는 168개 Node/Vitest, 22개 Chromium E2E를 통과했다.
  coverage는 statements 82%, branches 74.92%, functions 85.15%, lines 86.62%다.
  Worker Canvas entry는 frame entry와 같이 실제 브라우저에서 실행되므로 Node coverage에서 제외한다.
  사이트는 production bundle의 Canvas/WebGL 연결을 별도로 검증한다.
- 같은 사이트 빌드 조건에서 초기 탐색 코드 합계는 2,681 → 2,809 bytes,
  gzip 1,482 → 1,549 bytes다. 실행할 때만 받는 preview chunk는
  84,310 → 88,201 bytes / gzip 23,110 → 24,661 bytes이고,
  실행기 본체 gzip은 195,626 → 195,674 bytes다. 일반 문서의 실행기 본체 요청은 추가하지 않는다.
- 이번 후속 변경은 위키 본문·Vault·생성 Markdown을 수정하지 않는다.
  콘텐츠 담당 작업의 `b1bbe65`를 보존하며, 그 작업의 Mermaid 검증과 함께 사이트 `npm run verify`를 실행한다.

## 초기 실행 가능 여부와 CI 렌더링 환경

- 후속 실행기 `4c1f8f24c9ebf7331d5faaa39eb1fcb0278c24d2`는 선택적 local-runner의
  capabilities 조회를 단일 Docker image 목록·동시 요청 공유·2초 cache로 변경했다.
  설치된 repository와 pinned digest가 모두 일치할 때만 제공하며 실패는 cache하지 않는다.
  실제 6개 동시 요청의 조회 시간은 3.25초 → 0.49초였고 client의 2.5초 deadline은 유지한다.
  최종 원본 verify는 170개 Node/Vitest와 22개 Chromium E2E를 통과했다.
  변경은 서버와 테스트에 한정되어 browser/plugin bundle hash는 앞선 revision과 동일하다.
- 실제 Worker close 관찰에서 생성 후 약 2.34초에 watchdog 안내가 도착하고,
  Chromium의 target detachment는 생성 후 약 3.98초에 도착했다. 2초 watchdog과
  4초 이내 안내 assertion은 유지하고 별도 close 관찰만 6초로 보완했다.
- Ubuntu CI의 Firefox trace는 `WEBGL_EXHAUSTED_DRIVERS`를 기록했다.
  사이트 검사는 preview와 독립된 native Worker의 WebGL 지원을 먼저 조회한다.
  Canvas 2D는 항상 실제 픽셀을 검사하고, native WebGL이 있으면 실제 WebGL 픽셀도 검사한다.
  native context가 없으면 명확한 안내와 2D 표시·중단 가능 상태를 검증한다.
  macOS의 세 브라우저에서는 native WebGL 지원과 실제 shader 출력을 별도로 확인했다.
  브라우저 제한 때문에 WebGL 검사를 통째로 삭제하거나 무조건 건너뛰지 않는다.
- showcase의 오래된 HTTP/CPU 취소 불가 설명을 현재 동작으로 고쳤다. Wiki 본문은 수정하지 않았다.
- 공통 UI revision `9745b806bb14108a9f4245a3e04fe8ac9f10bbe7`은 같은 실행기와
  공통 SVG 버튼·접근성 이름·상하 여백 개선을 포함한다. 원본의 170개 Node/Vitest와
  22개 Chromium E2E를 다시 통과했고 360px·1280px에서 실제 복사와 toolbar 여백을 확인했다.
  사이트 전용 UI 복사본은 추가하지 않는다. WebGL을 비활성화한 Chromium에서도
  앞선 사이트 검사의 2D 출력·지원 안내·중단 경로가 통과했다.

## Kotlin 컴파일 시작 비용과 최종 UI

- Kotlin 개선 revision은 `6b503ecfcadfa4d2e11da1b9f6bd6cb5aa8f53da`다.
  Obsidian host CSS가 실행 버튼의 색상을 덮는 문제도 공통 selector에서 보완했다.
  사이트별 버튼 구현은 추가하지 않았다.
- 운영 확인 중 부하가 있는 호스트에서 간단한 Kotlin 코드도 15초를 넘기는 사례를 다시 기록했다.
  같은 코드·1 CPU·512 MiB·15초 조건으로 기존/수정 방식을 번갈아 세 번 비교했다.
  `kotlinc`에만 `-J-XX:TieredStopAtLevel=1`을 적용한 중앙값은 13.36초 → 9.37초였다.
  사용자 프로그램의 JVM 기본 설정은 유지하며 시간·자원 제한을 늘리지 않는다.
- 실제 Docker에서 컬렉션 출력·사용자 JVM 기본값·컴파일 오류·15초 timeout·정상 회복을 확인했다.
  마지막 회복은 7.57초에 정상 출력했고 전체 원본 verify 170개 Node/Vitest·22개 Chromium E2E도 통과했다.
  호스트 부하나 큰 코드로 deadline에 도달하는 경우는 여전히 명시적인 timeout으로 종료한다.
- 코드 변경 전에 운영 실패와 교차 비교를 기록했다. JVM flag 문자열을 그대로 기대값으로 복제하는
  단위 테스트는 추가하지 않았고 실제 컴파일 결과와 사용자 JVM 인자를 확인했다.
- 콘텐츠 담당 작업의 `f95b350`까지 보존하며, Wiki 본문을 직접 수정하지 않았다.

최종 사이트 adapter는 `4f933fdbf2cd7542bbba1c15291521c5778e94e1`이다.
서버의 비동기 요청 실패를 처리하고 다음 요청을 받을 수 있게 하는 공통 경계를 포함한다.
또한 Obsidian의 24px 접기 여백이 중첩된 실행 편집기에 들어와 활성 줄 배경을 끊는 문제를
`.rcb` 범위 안에서 수정했다. 실제 host CSS를 넣은 회귀 검사는 수정 전에 실패했고,
수정 후 줄번호와 코드의 배경·높이·경계가 이어지며 코드 안쪽 8px 여백을 확인했다.
별도 실행의 원본 verify는 173개 Node/Vitest와 24개 Chromium E2E를 통과했다.
운영 서버 CLI의 hash는 UI 변경 전후 동일하며 추가 서버 재시작은 필요하지 않다.

Run과 Stop은 하나의 버튼에서 전환되고, preview watchdog이 Worker를 종료해도 Run으로 복귀한다.
복사 성공 아이콘은 1.5초 후 원래 아이콘으로 돌아온다. 원본 편집 동작은 선택적인 host callback을
사용하므로 정본 편집을 제공하지 않는 웹 문서에는 표시하지 않는다. 편집기에 focus가 있을 때만
활성 줄을 강조하고, host의 중복 테두리·스크롤바 여백과 더 이상 도달하지 않는 disabled CSS를 정리했다.
원본의 실제 복사·자동 종료 후 재실행·host hover/focus 검사를 유지·확장했고 기준은 낮추지 않았다.

사이트 CI `34224050915`의 Firefox 실패는 Worker 종료 실패가 아니었다. trace에서 종료를 기다리는
5초 timer가 preview 버튼 준비 전 시작됐고, 중첩 iframe의 자동 scroll이 버튼을 sticky header 뒤로
옮겨 Stop 호출 전에 timer가 만료됐다. 6초 후 버튼을 공개하는 독립 fixture로 기존 검사의 실패를
재현했다. 수정 검사는 실제 pointer hit testing과 보이는 위치를 확인한 뒤 Run/Stop을 조작하고,
미리 연결한 close listener로 Stop 이후 5초 경계만 검사한다. 임의 sleep·force click·재시도는 사용하지
않는다. fractional CSS pixel 비교에만 1px 이내 반올림 오차를 허용한다. 수정본은 Chromium·Firefox·
WebKit에서 모두 통과했다. 기존 취소·재실행 시나리오를 교체했으며 보호 검사를 삭제하지 않았다.

최종 콘텐츠 기준은 담당 작업의 `d8e24017e118e136ddef4129e9772f2b3a4402cb`다.
앞선 `1a195b1`의 Socket·데이터 표현과 별도로 14개 네트워크/PintOS 문서를 담당 작업이
정규 producer로 반영했다. 공개 문서는 1,341개다. 담당 작업은 84개 브라우저/화면 크기 조합과
전체 링크 검사를 통과했고, 마지막 Web Server 도식 줄바꿈도 source에서 수정하고 재검증했다.
이번 검증이 끝날 때까지 canonical compiler와 공개 projection을 함께 동결했다.
사이트에서 생성물을 수동 보정하지 않았다.

## 429 대기 후 복구 경계

사이트 CI `34228254821`에서는 앞선 무한 반복 종료 검사는 통과했지만, Firefox의 429 검사에서
1초 대기 뒤에도 Check again이 비활성화된 실패를 잡았다. timer가 deadline보다 1ms 일찍
호출되면 기존 구현은 비활성 상태를 유지한 채 다음 timer를 예약하지 않는 결함을 단위 검사로
재현했다. 기존 코드에서 실패했고 수정 후 통과했다. CI trace에는 timer 호출 시각 자체가 없어
그 실행의 직접 원인을 소급 확정하지는 않으며, 재현한 결함과 구분한다.

대기 계산은 monotonic clock으로 통일하고 이른 timer 호출에서는 남은 시간만 다시 예약한다.
deadline 전에 버튼을 활성화하지 않고, deadline 이후에는 사용자 재확인을 허용한다.
시스템 시각을 60초 뒤로 조정해도 1초의 상대 대기가 끝나는 회귀 검사도 추가했다.
검사 timeout이나 retry 횟수는 늘리지 않았으며, 자동 code 실행·상시 polling도 추가하지 않는다.
dispose는 예정된 timer를 취소하고 callback의 lifecycle guard를 유지한다. 서버 CLI는 변경하지 않는다.
최종 원본의 로컬·CI verify는 173개 Node/Vitest와 24개 Chromium E2E를 통과했다.
실제 Jekyll 빌드의 429 복구·동일 요청 ID 취소도 세 브라우저에서 각각 세 번, 총 9회 통과했다.

부하가 있는 로컬 검증에서 cache용 가짜 Docker의 Node VM 시작이 2초 제한을 넘겨 두 검사가
실패했으며 단독 실행에서는 통과했다. inventory/cache 검사는 가벼운 shell 실행 fixture로 분리해
실제 executable 경계를 유지한다. 실패 cache 검사는 임의의 rejection을 허용하지 않고 의도한
Docker unavailable 오류를 확인한다. 운영의 2초 조회 deadline과 컨테이너 취소·timeout 검사는 유지한다.

## 전달과 남는 한계

로컬·CI의 사이트 최종 명령은 `npm run verify`다. PR은 검증만 하고 검증된 main 산출물만 배포한다.
배포 권한은 deploy job에 한정한다. adapter 원격 commit을 먼저 확인한 뒤 사이트 pointer를 전달한다.
`build-info.json`은 공개 site SHA·adapter SHA·자산 해시만 포함한다. 배포 후 이 정보를 실제 자산과 대조한다.

아래 두 한계는 추가 개선으로 해소했다. 개인 서버는 요청 ID로 실제 Docker 작업을 취소하고,
interactive preview의 사용자 코드는 종료 가능한 Worker에서 실행한다. 서버가 오프라인이거나
이전 버전이라 취소를 확인할 수 없을 때에는 UI가 종료를 확인했다고 표시하지 않는다.
Canvas 2D·WebGL·WebGL2는 후속 개선으로 Worker의 native OffscreenCanvas에서 실행한다.
Worker DOM은 완전한 browser DOM이 아니므로 임의의 동기식 layout/browser API는 지원 범위에 따른다.
개인 서버 offline은 브라우저 실행·본문·검색·테마의 장애와 구분한다.
Obsidian 정식 release·설치, 실행 인프라 교체, 상시 monitoring은 수행하지 않았다.
실패한 운영 반영은 직전 검증된 site/adapter 조합으로 revert하며 history를 재작성하지 않는다.
