---
layout: default
title: Clue 상세 정리와 Java 인수 연결
nav_order: 14
permalink: /wiki/k8s-clue-refactor-handoff-map/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/refactor-handoff-map
projection_sha256: b9643c6b4e0d58fb58effe36641b842686cc95fb147eda4f3234668485d3434d
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 상세 정리와 Java 인수 연결
{: .no_toc }

## 기준 문서

Python의 실제 작업과 완료 판정은 `k8s-clue/docs/PYTHON-REFACTOR-TASKS.md`를 기준으로 한다.

Clue Java 구현은 Python 코드를 옮기는 작업이 아니다. Python 정리 과정에서 확정한 Schema, fixture, expected result, reason code와 안전 계약을 Java에서 다시 만족시키는 작업이다.

## 인수 금지 조건

- Python direct diagnose 경로가 worker를 거치면 인수하지 않는다.
- enabled Analyzer에 negative fixture가 없으면 인수하지 않는다.
- Evidence에 Secret 값이 들어갈 가능성이 남아 있으면 인수하지 않는다.
- Remediation에 Kubernetes 직접 수정 또는 자동 merge 경로가 남아 있으면 인수하지 않는다.
- Recovery Check가 DB row 없이 재현되지 않으면 인수하지 않는다.
- expected result가 timestamp·UUID 때문에 매번 바뀌면 인수하지 않는다.
- Handoff Pack checksum을 재현하지 못하면 인수하지 않는다.

## Python 작업 ID와 Java 대상

| Python 작업 | Python 산출물 | Java 대상 | Java 시작 조건 |
|---|---|---|---|
| `BAS-001`~`BAS-014` | 기존 동작·test·route·service·rule 기준선 | 포팅 비교 자료 | 기준선 누락 0개 |
| `ARC-001`~`ARC-012` | port, canonical JSON, reason code, field mapping | `clue-domain`, `clue-application` | framework 비의존 계약 확정 |
| `CLI-001`~`CLI-016` | 명령·option·exit code·출력 snapshot | `clue-cli` | command contract 고정 |
| `K8S-001`~`K8S-030` | kubeconfig adapter 계약·raw fixture·RBAC | `clue-kubernetes` | Secret/write 요청 test 통과 |
| `EVD-001`~`EVD-020` | Evidence Schema·normalizer·sanitizer | `clue-domain:evidence` | canonical artifact 재현 |
| `ANA-001`~`ANA-030` | Rule Pack·Finding Schema·golden corpus | `clue-analyzer` | enabled rule fixture 완결 |
| `INC-001`~`INC-012` | Incident Schema·renderer expected result | `clue-domain:incident`, `clue-cli` | DB 없이 incident 생성 |
| `REM-001`~`REM-030` | Remediation Schema·authority·patch·Draft PR 계약 | `clue-remediation`, `clue-scm-github` | preview/dry-run/Draft 강제 |
| `REC-001`~`REC-018` | Recovery Schema·time/identity fixture | `clue-recovery` | baseline과 새 window만으로 재현 |
| `DEL-001`~`DEL-026` | 비제품 runtime 제거 결과 | Java로 이식하지 않을 목록 | legacy import 0개 |
| `TST-001`~`TST-025` | unit/contract/golden/E2E 분류 | Java test suite | test 주장별 대응 ID 존재 |
| `CI-001`~`CI-014` | 재현 명령과 release gate | Gradle/CI gate | clean clone 재현 |
| `HOF-001`~`HOF-015` | `python-handoff-v1` | 전체 Java 인수 입력 | checksum 검증 완료 |

## Java module별 입력

### `clue-domain`

인수:

- Evidence Bundle Schema
- Finding Schema
- Incident Schema
- Remediation Plan Schema
- Recovery Check Schema
- reason code registry
- resource identity 규칙
- canonical JSON 규칙

인수하지 않음:

- Pydantic model
- SQLAlchemy entity
- FastAPI response model
- event body class
- DB table 이름

완료:

- Jackson 직렬화 결과가 Python expected JSON과 semantic diff 0
- domain package에서 Spring, Kubernetes, PostgreSQL import 0
- clock과 ID 생성기가 interface로 주입됨

### `clue-kubernetes`

인수:

- kubeconfig 인증 fixture
- raw Kubernetes fixture
- normalized Evidence expected result
- resource/verb allowlist
- Secret·write·subresource 금지 test
- collection limit와 partial result 규칙

완료:

- Python fixture를 Java에서도 그대로 읽음
- 같은 fixture에서 같은 canonical Evidence 생성
- API recorder에서 금지 요청 0개

### `clue-analyzer`

인수:

- enabled Rule Pack
- experimental Rule Pack 목록
- positive/negative/insufficient/malformed/version fixture
- false-positive corpus
- score·tie-break 규칙

완료:

- Python expected Finding과 Rule ID, cause, confidence class, evidence reference set 일치
- 규칙 등록 순서가 달라도 결과 동일
- 근거 부족 시 확정 원인 생성 0개

### `clue-remediation`

인수:

- GitOpsAuthority artifact
- manifest identity와 Kustomize source fixture
- field allowlist
- before/after/inverse patch
- base advance fixture
- Draft PR result fixture

완료:

- preview가 기본 동작
- 모호한 source, 다른 base, 다른 scalar에서 fail-closed
- Kubernetes mutating client method 없음
- GitHub merge method 없음

### `clue-recovery`

인수:

- baseline/new window fixture
- stale·duplicate·gap·UID mismatch fixture
- optional Alertmanager/Prometheus fixture
- result reason code

완료:

- PostgreSQL 없이 동일 판정
- fixed clock으로 안정 구간 재현
- baseline 불완전 시 resolved 반환 0개

## Java 구현 시작 gate

- [ ] `k8s-clue`의 상세 계획 최종 완료 기준이 모두 통과했다.
- [ ] `make handoff`와 `make handoff-verify`가 clean clone에서 통과한다.
- [ ] `python-handoff-v1` manifest와 checksum이 고정됐다.
- [ ] Java module별 인수 파일 목록이 manifest에 있다.
- [ ] Python test ID와 Java 예정 test ID mapping이 있다.
- [ ] enabled/experimental rule 구분이 있다.
- [ ] Java에 이식하지 않을 runtime 목록이 확정됐다.

## Java 단계별 종료 gate

### J1. Domain

- Schema semantic parity
- reason code parity
- canonical JSON parity
- framework import boundary 통과

### J2. Diagnose

- kubeconfig context 선택 parity
- Evidence normalization parity
- Analyzer golden parity
- Secret/write 금지 test 통과

### J3. Remediation

- authority parity
- patch allowlist parity
- base advance parity
- Draft PR parity

### J4. Recovery

- stale·duplicate·gap parity
- resource identity parity
- stability window parity
- result reason code parity

### J5. 제품 확장

Python Handoff 범위를 모두 통과한 뒤 Hub, Agent, Store, Console, Fleet를 구현한다. Python의 worker, NATS subject, SQLAlchemy entity, Alembic migration과 React component는 제품 확장의 설계 입력으로 사용하지 않는다.
