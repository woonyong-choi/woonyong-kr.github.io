---
layout: default
title: Clue 기존 구현 이전 원칙
nav_order: 11
permalink: /wiki/k8s-clue-reference-migration/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/reference-migration
projection_sha256: f0f609c05df7ebf07ea7dc8d036bdc0ac7a62617112d55e455b6fc15502053c8
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 기존 구현 이전 원칙
{: .no_toc }

이 문서는 이전 원칙을 설명한다. 실제 실행 순서, Python Handoff Gate와 Java 단계 ID는 [Python 선행·Java 포팅 계획](/wiki/k8s-clue-python-first-port-plan/)을 기준으로 한다.

## 현재 검증된 자산

기존 `k8s-clue`는 Python 3.13, PostgreSQL/Alembic, NATS, Kubernetes/Helm과 TypeScript frontend로 작성된 학습 프로젝트다.

확인된 대표 자산:

- read-only Kubernetes Agent의 Pod·Event Evidence 수집
- Correlation ID를 통한 사건 연결
- 결정론적 rule 기반 RCA
- Incident와 PR 멱등성
- Deployment와 제한된 scalar field patch allowlist
- GitHub Draft PR과 base SHA 재확인
- 직접 cluster mutation과 자동 merge 차단
- 배포 후 새 Evidence window를 이용한 Recovery Check
- ImagePullBackOff Golden Path
- backend 203개 테스트, frontend test/build와 Helm lint 수준의 검증 — 이 문서를 쓴 시점의 수치다. 이후 정리본에서 pytest 205건이 되었다.

이 자산은 버리지 않는다. 다만 Python 구현 자체보다 계약, fixture, 실패 조건과 테스트 시나리오를 보존한다.

## 그대로 가져오지 않을 부분

- 첫 배포부터 15개 프로세스로 나뉜 runtime
- 제품 가치가 입증되기 전 필수 NATS 의존성
- 과거 기능을 위한 비실행 migration과 schema 부담
- 일회성 진단에도 Hub, Agent, DB 설치를 요구하는 흐름
- 범용 dashboard와 제품 핵심에서 벗어난 기능
- Python module 경계를 Java package에 1:1로 복제하는 방식

## 이전 원칙

1. line-by-line rewrite를 하지 않는다.
2. 기존 입력과 기대 출력을 language-neutral golden fixture로 만든다.
3. 한 장애 vertical slice를 CLI에서 끝까지 완성한다.
4. 새 Java 결과와 기존 Python 결과를 같은 fixture로 비교한다.
5. safety contract가 통과한 뒤 다음 Analyzer를 옮긴다.
6. DB migration history 전체가 아니라 새 제품에 필요한 최소 schema에서 시작한다.

## 첫 이전 단위

```text
ImagePullBackOff fixture
→ Java Evidence normalizer
→ CLUE-IMAGE-001 Analyzer
→ Finding renderer
→ Remediation Plan
→ Recovery Check fixture
```

이 단위가 CLI에서 Hub 없이 동작하면 Java 아키텍처와 Native Image 가능성을 동시에 검증할 수 있다.

## 계약 fixture 형식

```text
fixtures/
└── image-pull-backoff/
    ├── pod.json
    ├── deployment.json
    ├── events.json
    ├── expected-evidence.json
    ├── expected-finding.json
    └── expected-remediation.json
```

fixture에는 실제 Secret, 내부 registry와 사용자 정보가 없어야 한다. schema version과 Kubernetes version을 명시한다.

## 이전 단계

### 1. Python 저장소에서 행동 동결

- Python Golden Path 테스트 결과 저장
- supported/unsupported 입력 목록 작성
- reason code와 failure mode 확정

### 2. Python 저장소 정리 완료와 Handoff Pack

- 설치 없는 `clue diagnose` vertical slice
- 불필요한 frontend, gateway, worker/event runtime과 DB 계층 제거
- versioned schema, golden fixture와 expected result 생성
- read-only RBAC와 안전한 수정 계약 고정

### 3. Java domain

- ResourceIdentity, EvidenceBundle, Finding, Incident, RemediationPlan 정의
- JSON schema compatibility test
- framework 없는 Analyzer 실행

### 4. Java CLI 연결

- kubeconfig와 Kubernetes read
- normalization과 Analyzer
- text/json 출력
- native image

### 5. Java 안전한 변경

- Git repository adapter
- pinned base와 Draft PR
- 기존 safety fixture 재현

### 6. Java Hub/Agent

- 새 PostgreSQL schema
- Agent ingestion
- Incident lifecycle과 Recovery Check

## 저장소 관계

- `k8s-clue`는 학습 기록과 기존 설계의 근거로 유지한다.
- `Clue`는 새 제품 구현과 문서의 기준 저장소가 된다.
- 기존 저장소의 commit history를 새 저장소에 억지로 섞지 않는다.
- 가져온 코드가 있다면 원래 라이선스와 NOTICE를 유지한다.
- 기능 parity가 확인되기 전 `k8s-clue`를 삭제하거나 archive하지 않는다.
