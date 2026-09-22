---
layout: project
title: "React 런타임"
permalink: /projects/lrn-react/
slug: "lrn-react"
summary: "Hook·VDOM·keyed diff·DOM patch를 직접 이어 붙인 작은 UI 런타임과 카드 앱."
status: "active"
period: "2026-03-26 ~ 2026-09-22"
role: "팀 과제 · 개인 확장"
repo: "woonyong-choi/lrn-react"
repo_url: "https://github.com/woonyong-choi/lrn-react"
repo_ref: "e07766d8c714998a4664f6d6ea69488d639dca8b"
readme_url: "https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/README.md"
concepts:
  - title: "컴포넌트 렌더링"
    url: "/wiki/frontend-topic-556b062c7529/"
  - title: "Hooks"
    url: "/wiki/frontend-hooks-5f0c93de5131/"
  - title: "Effect"
    url: "/wiki/frontend-effect-4cf810ca362a/"
nav_exclude: true
render_with_liquid: false
generated_by: scripts/sync-projects.mjs
---

<!-- 생성물입니다. 정본은 woonyong-choi/lrn-react 의 README.md 입니다. 수동 편집하지 마세요. -->

React 없이 Hook·VDOM·keyed diff·DOM patch를 직접 이어 붙여, 컴포넌트 상태 변경이 실제 DOM에 반영되는 과정을 눈으로 확인하려고 만든 작은 UI 런타임과 카드 검색·정렬·즐겨찾기 앱입니다.

![lrn-react 카드 앱과 우측 Render/Patch Inspector](https://raw.githubusercontent.com/woonyong-choi/lrn-react/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/demo.png)

## 버전업된 모습

**결과: 테스트 15/15 통과(그중 2개는 무작위 1만 건 이상을 도는 속성 테스트), core 라인 커버리지 93.0%, keyed diff 2000행 재정렬 최대 6.6배 단축** (`npm test`, `npm run coverage`, `npm run bench` — 수치 표는 [검증](#검증)).

팀 과제 시점의 런타임(`9ea2543`)은 Hook이 **루트 컴포넌트 전용**이었고 데모는 PokeAPI 원격 카탈로그에 의존했습니다. 이 저장소에서 함수 컴포넌트마다 독립된 Hook 상태를 갖게 하고, 로컬 카드 6장만으로 외부 API 없이 도는 기본 모드와 같은 tick의 상태 변경을 묶는 microtask batching을 더했습니다.

| 항목 | 팀 시기 (`9ea2543`) | 현재 | 재현 |
| --- | --- | --- | --- |
| Hook 범위 | 루트 전용 | 컴포넌트별 | `git show 9ea2543:src/core/runtime/hooks/useState.js \| head -3` |
| 기본 데이터 | 원격 PokeAPI | 로컬 카드 6장 (`?data=remote`로 원격) | [cardLibrary.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/app/data/cardLibrary.js) |
| 테스트 | 11개 파일 (예시만) | 5개 파일 15 테스트 (속성·실패 경로 포함) | `npm test` |
| core 커버리지 | 측정 안 함 | 93.0% (979줄 기준) | `npm run coverage` |
| 2000행 diff | 측정 안 함 | 변화 없음 2.3ms / 역순 20.9ms | `npm run bench` |
| 코드 변화 | — | 124 files, +2,180 / −17,285 | `git diff --shortstat 9ea2543..HEAD` |

**어려웠던 점.** 컴포넌트별 상태에서 가장 까다로운 것은 "같은 함수를 어디에 몇 번 썼는가"를 구분하는 일이었습니다. 부모 경로·key·함수 type으로 인스턴스를 식별해야 같은 자식이 다른 부모 아래에서 독립 상태를 가지고, 재정렬해도 상태와 DOM 노드가 따라가며, type이 바뀌면 상태가 초기화됩니다. commit 도중 발생한 상태 변경은 다음 microtask로 미루고 이미 제거된 인스턴스의 setter는 no-op으로 만들어야 했습니다. 이 동작들은 모두 [component-state.test.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/tests/component-state.test.js)가 고정합니다.

검증 방식도 바꿨습니다. 예시를 하나씩 늘리는 대신, 무작위 트리 쌍과 무작위 편집 시퀀스를 모델과 대조하는 **속성 테스트**로 diff·patch 계층과 컴포넌트 계약을 덮었습니다. 덕분에 "역순 재정렬에서 MOVE_CHILD는 항상 뒤에서 앞으로 당긴다" 같은 불변식을 말이 아니라 실행으로 증명합니다. 같은 불변식을 이용해 keyed diff에서 이미 확정된 앞부분을 다시 훑지 않도록 고쳐, 2000행 기준 흔한 편집이 제곱에서 선형으로 내려갔습니다. 설계 판단과 버린 대안, 남은 병목은 [docs/design.md](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md)에 있습니다.

## 구동모습

<picture>
  <source media="print" srcset="https://raw.githubusercontent.com/woonyong-choi/lrn-react/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/demo.png">
  <img src="https://raw.githubusercontent.com/woonyong-choi/lrn-react/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/demo.gif" alt="lrn-react 데모: Collection 검색·정렬·즐겨찾기 시 Render/Patch Inspector 카운터 증가" loading="lazy">
</picture>
`make demo` 후 `http://127.0.0.1:8766` 에서 Collection → 검색 `ar` → 정렬 Name → Save 2회 → Favorites only 순서로 조작한 화면입니다. Inspector 우측 패널의 Total renders 3→12, patch 누적 7→63은 이 조작 한 번을 브라우저에서 실측한 값입니다(GIF 촬영 커밋 `746eb2c` 기록). 파란 테두리는 앱이 patch된 DOM 노드에 표시하는 하이라이트입니다.

## 메인 기술

스택 나열이 아니라, 이 저장소가 직접 구현한 기법입니다. 왜 이 구조를 골랐고 무엇을 버렸는지는 [docs/design.md](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md)에 따로 적었습니다. 상태 변경 한 번이 화면에 닿기까지의 경로는 다음과 같습니다.

![렌더 파이프라인: 상태 변경 → Hook record → VDOM → keyed diff → DOM patch → effect](https://raw.githubusercontent.com/woonyong-choi/lrn-react/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/figure.png)

- **컴포넌트 인스턴스 식별 — 루트 하나만 Hook을 갖던 제약을 없앴다**
  부모 경로에 key(없으면 형제 index)와 컴포넌트 type id를 이어 붙인 문자열로 인스턴스를 이름 짓고, 렌더마다 새로 채운 Map을 commit에서 교체하면서 이번 렌더에 없는 경로의 effect를 정리합니다. `h()`가 만든 VNode 트리를 재귀로 펼치면서 함수 컴포넌트를 실제 element로 바꿉니다. [h.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/vnode/h.js) · [resolveComponentTree.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/runtime/resolveComponentTree.js) · [설계 근거](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md#1-인스턴스-정체성-부모-경로--key--컴포넌트-type)
  측정(무작위 편집 60회 x 30단계를 모델과 대조, `npm test`): Hook 범위 루트 전용 → 컴포넌트별, 계약을 증명하는 테스트 0건 → 1,800단계.

- **Hook 상태 슬롯 — 렌더마다 같은 칸을 다시 찾게 했다**
  호출 순서로 슬롯을 재사용하는 `useState`·`useEffect`·`useMemo`이고, 의존성 배열 비교와 "렌더 밖 호출"·"Hook 개수 변화" 방어를 포함합니다. [hooks/](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/runtime/hooks/) · [areHookDepsEqual.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/runtime/areHookDepsEqual.js)
  측정: 시간은 **측정하지 않음**. 대신 조건부 Hook·렌더 밖 호출·render 중 setState가 모두 예외로 끝나는지 고정합니다. 재현 `npm test` ([failure-modes.test.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/tests/failure-modes.test.js)).

- **keyed diff — 재정렬에서 DOM 노드를 다시 만들지 않게 했다**
  삭제 후 남은 목록(`working`)으로 "patch가 적용되는 순간의 DOM"을 흉내 내고, 앞쪽 위치는 이미 확정된다는 불변식을 이용해 `index`부터만 훑습니다. 그 덕분에 모든 이동이 뒤에서 앞으로 당기는 방향이라 적용은 `insertBefore` 한 줄입니다. [diffChildren.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/reconciler/diffChildren.js) · [설계 근거](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md#2-keyed-diff-적용-중-dom을-흉내-내는-working-목록)
  측정(2000행 `diff()`, 7회 중앙값, Node 26, `make bench`): 변화 없음 16.8ms → 2.3ms, 맨 앞 삽입 16.9ms → 2.7ms, 완전 역순 33.7ms → 20.9ms(제곱 잔존).

- **DOM patch — 계산 결과를 실제 DOM 조작으로 옮긴다**
  path로 대상 노드를 찾아 속성·이벤트·자식을 더하고 빼며, 같은 부모의 삭제는 뒤 인덱스부터 적용합니다. 어느 노드가 바뀌었는지는 콜백으로만 알리고, 하이라이트 표시는 앱 쪽에 둡니다. [patch.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/renderer-dom/patch.js) · [applyProps.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/renderer-dom/applyProps.js) · [patchHighlight.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/app/patchHighlight.js)
  측정(`npm run coverage`): 데모용 하이라이트를 걷어내며 132줄 → 100줄, 라인 커버리지 92.4% → 98.0%.

- **microtask batching과 effect 수명 — 같은 tick의 상태 변경을 한 번만 그린다**
  `createApp({batching: "microtask"})`는 같은 동기 구간의 setState를 하나의 update로 묶고, effect는 DOM 반영 뒤에 실행하며 unmount와 인스턴스 제거에서 cleanup을 호출합니다. [scheduleUpdate.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/runtime/scheduleUpdate.js) · [commitEffects.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/runtime/commitEffects.js)
  측정(`npm test`, 같은 tick에 setState 2회): render 2회 → 1회, 그리고 effect가 본 DOM이 중간 상태 없이 최종값 하나뿐임을 확인.

- **Inspector — 상태 변경이 화면에 얼마나 닿았는지 보여 준다**
  render 횟수와 patch 라벨을 패널에 띄우고, `data-*`와 이벤트 patch는 화면이 바뀐 것이 아니므로 표시 수치에서 제외합니다. [patchSummary.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/engine/patchSummary.js) · [inspect.js](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/core/engine/inspect.js)
  측정(`npm run measure`, 카드 앱 6단계): render 9회 / 표시 patch 72개. 이 기준이 세 파일에 복제돼 있던 것을 한 모듈로 모았습니다(중복 정의 3곳 → 1곳).

## 계획

- 완전 역순 재정렬의 제곱 복잡도 해소: 2000행 역순이 20.9ms로 유일하게 제곱으로 남아 있다. 최장 증가 부분 수열 방식으로 가면 O(n log n)이 되지만 "이동은 항상 뒤에서 앞으로"라는 불변식을 다시 정의해야 하므로, 실제 병목이 될 때 착수한다([근거](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md#2-keyed-diff-적용-중-dom을-흉내-내는-working-목록)).
- 실제 브라우저에서 시간(ms)까지 측정: `npm run bench`는 diff 계산만 재고 `npm run measure`는 최소 DOM에서 횟수만 잰다. 브라우저 하네스가 생기면 DOM 적용 시간까지 같은 표에 넣는다.
- 컴포넌트가 여러 VNode를 반환할 수 있게: Fragment 형태의 반환이 필요한 사례가 앱에서 나오면 단일 VNode 제약을 풀고 테스트를 추가한다.

## 링크

- [설계 기록](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md) — 인스턴스 정체성과 keyed diff에서 고른 것과 버린 것
- [컴포넌트 렌더링 Wiki](https://docs.woonyong.com/wiki/frontend-topic-556b062c7529/) — 이 런타임의 개념 정리
- [카드 앱 소스](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/src/app/App.js)
- 브라우저 검사 화면: `make demo` 실행 중 `http://127.0.0.1:8766/runtime-tests.html` (배포된 데모 URL은 없음)

## 담당

**크래프톤 정글 팀 과제(원본: [Jungle-12-303/week5-team1-react2](https://github.com/Jungle-12-303/week5-team1-react2))에서 시작했고, 종료 후 개인 저장소에서 계속 수정·학습·확장하고 있다.**

| 구분 | 내용 |
| --- | --- |
| 원본 저장소 | [Jungle-12-303/week5-team1-react2](https://github.com/Jungle-12-303/week5-team1-react2) (이전 이름 `virtual-dom-engine-demo`), 파생 기준 revision `9ea2543` |
| 기간 | 2026-03-26 ~ 2026-04-01 (커밋 기준) |
| 팀 구성 | GitHub contributors 기준 2명 |
| 팀 시기 본인 담당 | **아키텍처 다이어그램·설계 문서 작성과 카드 앱(`App.js`) 수정** — 커밋 기준 본인 3 / 팀원 30. 런타임 코어와 카드 앱의 나머지는 팀원 작성 |
| 개인 확장 | `b7cf9b9`(2026-09-08) ~ 최근, 개인 커밋 — 컴포넌트별 Hook, 오프라인 카드 앱, 검증을 컴포넌트·앱 계약 중심으로 축소, 실행 진입점(Makefile·`scripts/serve.py`), 측정 스크립트·CI·README 정리 |

개인 확장 범위 확인: `git log --author='choi woo-nyong' --oneline 9ea2543..HEAD`. 원본 과제·팀 코드와 개인 확장은 Git author와 diff로 구분하며 기존 저작권 표시는 소스에 유지합니다. W04·W05 단계의 설계와 실험은 [정리 전 이력](https://github.com/woonyong-choi/lrn-react/tree/daddae15f381efab57b017cd740a46b3dfae1c87)에 있습니다.

## 구동방법

Node.js 18 이상, npm, Python 3가 필요합니다.

```sh
make setup       # npm ci + 라이브러리 빌드
make demo        # http://127.0.0.1:8766 (Ctrl-C로 종료)
make test        # 테스트 + 빌드
make bench       # keyed diff 규모별 시간
npm run measure  # 상호작용별 render·patch 횟수
npm run coverage # src/core 라인 커버리지
```

기본 모드는 로컬 카드로 외부 API 없이 동작합니다. 원격 PokeAPI 데이터는 URL에 `?data=remote`를 붙일 때만 사용합니다.

## 스펙

| 항목 | 내용 |
| --- | --- |
| 런타임 | JavaScript(ES modules), Node.js ≥ 18 (확인한 환경: Node 22) |
| 의존성 | 런타임 외부 패키지 없음 (React 미사용). 정적 서버는 Python 3 표준 라이브러리 |
| 범위 밖 | React 전체 호환·동시 렌더링·SSR·JSX compiler·Fragment·에러 경계. render 중 setState 미지원, Hook 순서·개수 고정, key는 형제 사이에서 유일. 전체 목록은 [알려진 한계](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md#4-알려진-한계) |

## 검증

[![CI](https://github.com/woonyong-choi/lrn-react/actions/workflows/ci.yml/badge.svg)](https://github.com/woonyong-choi/lrn-react/actions/workflows/ci.yml)

- `npm test`: **15/15 통과**. 같은 파일을 Node와 브라우저(`runtime-tests.html`)에서 함께 돌립니다.

| 묶음 | 수 | 검증하는 것 |
| --- | ---: | --- |
| 컴포넌트 계약 | 5 | 상태 분리, key/type 교체, microtask batching, effect cleanup, 미키 형제 제거 |
| 속성(무작위) | 4 | 기본 1회 실행에서 무작위 트리 쌍 1,000건 + 무작위 편집 1,800단계. patch 적용 결과가 새로 그린 DOM과 같은지, `diff(v, v)`가 비는지, keyed 노드가 재생성되지 않는지, 이동이 항상 역방향인지, 상태·DOM·effect 수명이 모델과 같은지 |
| 실패 경로 | 4 | 조건부 Hook, render 중 setState, 렌더 밖 Hook, 형제 key 중복, unmount 후 재mount, 잘못된 patch path/type, 렌더 예외 후 DOM 보존과 복구 |
| 앱 통합 | 2 | 오프라인 검색·정렬·즐겨찾기·상세와 렌더 예산 고정, DOM 속성·이벤트 교체·제거 |

  속성 테스트는 seed를 받습니다. 실패하면 로그의 seed로 그대로 재현하고, 넓게 돌리려면 `SEED=99 CASES=4000 npm test`처럼 늘립니다.

- `npm run coverage`: **src/core 979줄 중 910줄, 93.0%**. V8 내장 커버리지를 의존성 없이 직접 환산하며, 한 번도 import되지 않은 모듈은 0%로 계산해 숫자를 부풀리지 않습니다.
- `npm run bench`: keyed diff 규모별 시간(아래 표).
- `npm run measure`: 카드 앱 상호작용별 횟수. 최소 테스트 DOM에서 실행하므로 시간은 재지 않으며, 2회 실행에서 동일한 값을 확인했습니다.

| 상호작용 | render | patch |
| --- | ---: | ---: |
| mount | 3 | 7 |
| 컬렉션 화면 이동 | 1 | 22 |
| 이름순 정렬 | 1 | 5 |
| 즐겨찾기 토글 | 1 | 4 |
| 검색 `char` | 1 | 6 |
| 상세 열기 | 2 | 28 |
| **합계** | **9** | **72** |

*재현: `npm run measure` ([scripts/measure.mjs](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/scripts/measure.mjs)). patch는 Inspector와 같은 기준(표시 patch)입니다.*

keyed diff 시간(2000행, 7회 중앙값, Node 22/26). 개선 전후는 같은 스크립트로 잰 [bench-before.json](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/bench-before.json)과 [bench.json](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/bench.json)입니다.

| 시나리오 | 개선 전 | 현재 | 배수 | 증가 양상 |
| --- | ---: | ---: | ---: | --- |
| 변화 없음 | 16.8 ms | 2.3 ms | 6.6x | 선형 |
| 맨 앞에 1개 삽입 | 16.9 ms | 2.7 ms | 6.3x | 선형 |
| 10% 블록 회전 | 18.1 ms | 2.8 ms | 6.5x | 선형 |
| 절반 삭제 | 5.0 ms | 1.3 ms | 3.8x | 선형 |
| 완전 역순 | 33.7 ms | 20.9 ms | 1.6x | **제곱(남은 병목)** |

*재현: `npm run bench` ([scripts/bench.mjs](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/scripts/bench.mjs)). `diff()` 계산만 재고 DOM 적용은 빼며, 왜 그렇게 나누는지와 역순이 남은 이유는 [docs/design.md](https://github.com/woonyong-choi/lrn-react/blob/e07766d8c714998a4664f6d6ea69488d639dca8b/docs/design.md#3-측정)에 있습니다.*

## 참고

- 원본: [Jungle-12-303/week5-team1-react2](https://github.com/Jungle-12-303/week5-team1-react2)
- [컴포넌트 렌더링 Wiki](https://docs.woonyong.com/wiki/frontend-topic-556b062c7529/)
- 정리 전 이력: [`daddae1`](https://github.com/woonyong-choi/lrn-react/tree/daddae15f381efab57b017cd740a46b3dfae1c87)
