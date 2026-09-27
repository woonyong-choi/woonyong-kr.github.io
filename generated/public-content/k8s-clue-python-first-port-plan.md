---
layout: default
title: Clue Python 선행 정리와 Java 포팅 계획
nav_order: 13
permalink: /wiki/k8s-clue-python-first-port-plan/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/python-first-port-plan
projection_sha256: d3d42abad70de57410ef3de4b6633b5713812e948645c5d64213ea17dc81a1ae
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue Python 선행 정리와 Java 포팅 계획
{: .no_toc }

코드 감사에 따른 세부 작업 ID와 Java module별 인수 관계는 [Python 상세 정리·Java 인수 연결](/wiki/k8s-clue-refactor-handoff-map/)을 기준으로 한다.

## 결정

- `k8s-clue`를 먼저 정리한다.
- Python Handoff Pack이 완성되기 전 Java application code를 작성하지 않는다.
- Java는 Python의 행동 계약만 포팅한다.
- Python의 runtime 구조는 포팅하지 않는다.
- Java CLI는 단일 native executable로 배포한다.
- Hub는 modular monolith로 시작한다.
- Agent는 read-only outbound process로 만든다.
- Store는 PostgreSQL을 사용한다.
- Console은 Incident 중심으로 만든다.
- AI는 optional adapter로 둔다.

## 저장소 역할

### k8s-clue

```text
Python 행동 참조 구현
Golden fixture 생성
Expected result 생성
안전 계약 고정
불필요한 runtime 제거
Handoff Pack 발행
```

### Clue

```text
Java 제품 구현
Native CLI
Agent
Hub
PostgreSQL Store
Console
Fleet
Rule Pack SDK
AI adapter
```

## 문서 기준

| 항목 | 기준 |
|---|---|
| Python 작업 순서 | `k8s-clue/docs/PYTHON-FIRST-PLAN.md` |
| Java 작업 순서 | 이 문서 |
| 제품 범위 | `docs/01-product-definition.md` |
| CLI | `docs/02-user-experience-and-commands.md` |
| 구조 | `docs/03-target-architecture.md` |
| 진단·수정 | `docs/04-diagnosis-and-remediation.md` |
| 보안 | `docs/05-data-security-and-trust.md` |
| 설치 | `docs/06-installation-and-lifecycle.md` |
| AI | `docs/07-ai-and-privacy.md` |
| 생태계 | `docs/08-open-source-ecosystem.md` |
| Java 결정 | `docs/10-java-architecture-decision.md` |
| 언어 비교 | `docs/12-java-vs-python.md` |

## 시작 조건

Java 작업 시작 전 확인:

- [ ] Python P0-P6 완료
- [ ] Python Handoff Gate 통과
- [ ] `python-handoff-v1` tag 발행
- [ ] Handoff artifact checksum 검증
- [ ] schema version 목록 확정
- [ ] Rule ID/version 목록 확정
- [ ] Kubernetes 지원 version 목록 확정
- [ ] license와 NOTICE 확인

조건 미충족 시 Java 저장소에서 허용하는 작업:

```text
문서 수정
빌드 spike
Native Image spike
Kubernetes client 호환성 spike
framework 비교 spike
```

조건 미충족 시 금지:

```text
domain model 확정
protocol 확정
Hub 구현
Agent 구현
DB schema 구현
Python 기능 동시 재구현
```

## 전체 순서

```text
Python
P0 baseline
P1 naming + CLI
P2 install-free diagnose
P3 domain + schema
P4 runtime removal
P5 analyzer/remediation/recovery
P6 Handoff Pack
Handoff Gate

Java
J0 build foundation
J1 protocol/domain
J2 native diagnose CLI
J3 remediation/recovery
J4 Agent
J5 Hub/Store
J6 install lifecycle
J7 watch/Fleet/Console
J8 AI/Rule Pack
J9 production hardening
```

## Handoff Pack 수신

목표 위치:

```text
compatibility/
└── python-handoff-v1/
    ├── manifest.json
    ├── schemas/
    ├── fixtures/
    ├── expected-results/
    ├── rules/
    ├── rbac/
    ├── reason-codes.json
    ├── compatibility-matrix.md
    ├── provenance.md
    └── checksums.txt
```

수신 검사:

- [ ] checksum 일치
- [ ] manifest commit과 tag 일치
- [ ] 모든 schema가 JSON Schema validator 통과
- [ ] fixture에 Secret 값 없음
- [ ] fixture에 사내 domain, email, account ID 없음
- [ ] expected result 수와 fixture 수 일치
- [ ] Rule ID 중복 없음
- [ ] Rule version 누락 없음
- [ ] reason code 중복 없음
- [ ] RBAC에 mutation verb 없음
- [ ] provenance와 NOTICE 존재

수신 명령 목표:

```bash
./mvnw -pl clue-compatibility verify
```

## 포팅 대상

### protocol

- Evidence Bundle
- Finding
- Incident
- Incident occurrence
- Remediation Plan
- Draft PR Result
- Recovery Check
- Agent envelope
- reason code
- schema version
- Rule ID/version

### domain rule

- resource identity
- Evidence immutability
- Incident deduplication
- Analyzer deterministic result
- insufficient evidence
- patch allowlist
- base SHA recheck
- Draft PR only
- recovery baseline
- post-change Evidence window

### test

- Golden fixture
- negative fixture
- insufficient fixture
- malformed input fixture
- stale base fixture
- ambiguous target fixture
- stale recovery window fixture
- duplicate occurrence fixture

## 포팅 제외

### runtime

- 15개 Python service/worker
- NATS subject와 event routing
- service discovery
- outbox relay 전용 process
- dead-letter monitor 전용 process
- FastAPI gateway
- Python session/admin flow
- Agent lease worker 구조

### persistence

- SQLAlchemy entity
- repository 구현
- Alembic revision
- 기존 table 이름
- migration 호환용 schema
- dashboard projection schema
- command execution schema

### UI와 설치

- 기존 React component 구조
- 기존 route 구조
- Python control-plane chart
- Python bootstrap script
- 기존 container process layout

포팅 제외 항목을 다시 추가할 조건:

1. 현재 제품 요구사항 존재
2. 단일 process로 처리할 수 없는 측정 결과 존재
3. 별도 ADR 승인
4. 운영·테스트 책임 정의

## Java project 구조

```text
clue/
├── pom.xml
├── mvnw
├── .mvn/
├── clue-bom/
├── clue-domain/
├── clue-protocol/
├── clue-analyzer-api/
├── clue-analyzers-core/
├── clue-application/
├── clue-kubernetes/
├── clue-scm-api/
├── clue-scm-github/
├── clue-persistence-api/
├── clue-persistence-postgres/
├── clue-cli/
├── clue-agent/
├── clue-hub/
├── clue-ai-api/
├── clue-ai-local/
├── clue-mcp/
├── clue-console/
├── clue-compatibility/
├── deploy/
├── compatibility/
└── docs/
```

초기 생성 모듈:

```text
clue-bom
clue-domain
clue-protocol
clue-analyzer-api
clue-analyzers-core
clue-application
clue-kubernetes
clue-cli
clue-compatibility
```

나중에 생성:

```text
clue-agent
clue-hub
clue-persistence-*
clue-scm-*
clue-ai-*
clue-mcp
clue-console
```

## package 규칙

기본 package:

```text
io.github.woonyongkr.k8sclue
```

소유 domain을 확보하면 새 ADR 없이 즉시 바꾸지 않는다. public artifact를 발행하기 전에 group ID를 최종 확정한다.

package 예시:

```text
io.github.woonyongkr.k8sclue.domain.evidence
io.github.woonyongkr.k8sclue.domain.analysis
io.github.woonyongkr.k8sclue.domain.incident
io.github.woonyongkr.k8sclue.domain.remediation
io.github.woonyongkr.k8sclue.domain.recovery
io.github.woonyongkr.k8sclue.application
io.github.woonyongkr.k8sclue.adapter.kubernetes
io.github.woonyongkr.k8sclue.adapter.github
```

## module dependency 규칙

```text
domain
↑
application
↑
adapters
↑
entrypoints
```

금지:

- domain → Spring
- domain → Jackson annotation
- domain → jOOQ
- domain → Fabric8
- domain → filesystem
- domain → environment variable
- domain → system clock
- protocol → persistence
- Analyzer API → Hub

ArchUnit 검사:

- [ ] domain package의 framework import 0
- [ ] adapter 간 직접 참조 0
- [ ] internal package 외부 접근 0
- [ ] cycle 0

## Java type 변환

| JSON 계약 | Java 표현 |
|---|---|
| ID | record value type |
| timestamp | `Instant` |
| duration | `Duration` |
| closed result set | sealed interface |
| stable code | enum 또는 validated record |
| optional field | nullable boundary + explicit mapper 또는 Optional return |
| resource quantity | normalized value object |
| JSON extension | versioned extension map |

필수 value type:

```text
ClusterId
FleetId
NamespaceName
ResourceUid
ResourceName
IncidentId
EvidenceId
AnalyzerId
RuleId
RuleVersion
CorrelationId
RepositoryId
GitCommitSha
```

String 직접 사용 금지 범위:

- cluster identity
- resource UID
- Incident ID
- Rule ID
- commit SHA
- Evidence ID

## 결과 모델

```text
DiagnosisResult
├── Diagnosed
├── NoFinding
├── InsufficientEvidence
├── AccessDenied
├── CollectionFailed
└── InvalidInput
```

```text
Finding
├── ConfirmedFinding
└── HypothesisFinding
```

AI result는 `ConfirmedFinding`을 만들지 못한다.

## J0. Build foundation

### 버전

- Java 25 LTS
- Maven Wrapper
- preview feature 사용 금지
- reproducible build

### test

- JUnit 5
- AssertJ
- ArchUnit
- Testcontainers
- WireMock 또는 MockWebServer
- JSON Schema validator

### build profile

```text
default: JVM unit/contract test
integration: container/Kubernetes test
native: GraalVM Native Image
release: all architecture artifact
```

### CI matrix

| OS | Architecture | JVM test | Native build |
|---|---|---:|---:|
| Linux | x86_64 | yes | yes |
| Linux | arm64 | yes | yes |
| macOS | arm64 | yes | yes |
| macOS | x86_64 | yes | yes |

### 완료 조건

- [ ] `./mvnw verify`
- [ ] dependency lock 또는 BOM 확정
- [ ] SBOM 생성
- [ ] license report 생성
- [ ] `clue version` JVM 실행
- [ ] native hello artifact 생성

## J1. Protocol과 domain

### 작업

- [ ] Handoff schema Java mapper
- [ ] ResourceIdentity
- [ ] EvidenceBundle
- [ ] Finding sealed hierarchy
- [ ] Incident identity
- [ ] RemediationPlan
- [ ] RecoveryCheck
- [ ] reason code
- [ ] schema version policy
- [ ] canonical JSON writer

### compatibility

- required field 누락 거부
- unknown required semantic 거부
- unknown optional field 보존 또는 무시 정책 고정
- enum unknown 처리 정책 고정
- schema major/minor 규칙 고정
- timestamp UTC 변환
- quantity normalization

### 완료 조건

- [ ] 모든 Handoff JSON read
- [ ] write 후 semantic equivalence
- [ ] Python expected result 생성
- [ ] invalid fixture 거부 결과 일치

## J2. Native diagnose CLI

### command

```bash
clue version
clue diagnose
clue diagnose --context dev
clue diagnose --namespace payments
clue diagnose deployment/card-api
clue diagnose --all-contexts
clue diagnose --output json
clue rules list
```

### 기술

- Picocli
- Fabric8 Kubernetes Client 우선 spike
- GraalVM Native Image
- stdout/stderr 분리
- stable exit code
- shell completion

### Native Image 검사

- reflection config
- resource config
- proxy config
- TLS
- kubeconfig exec credential plugin
- cloud auth plugin
- macOS keychain 접근 없음
- CA certificate
- HTTP proxy

### budget

초기 측정값을 기록한 뒤 release budget 확정:

```text
startup
RSS
binary size
first Kubernetes API latency
full diagnose latency
```

### parity

각 fixture에서 비교:

- cause
- Rule ID
- Rule version
- confidence class
- Evidence reference set
- reason code
- exit code
- JSON schema

설명 문장 전체 일치는 비교하지 않는다.

### 완료 조건

- [ ] P0 fixture parity
- [ ] kind E2E parity
- [ ] Secret API 호출 0
- [ ] mutation API 호출 0
- [ ] 네 architecture artifact
- [ ] JVM 설치 없이 실행
- [ ] Homebrew Tap 설치

## J3. Remediation과 Recovery

### 모듈

```text
clue-scm-api
clue-scm-github
clue-domain/remediation
clue-domain/recovery
```

### Remediation

- repository identity
- branch
- manifest path
- base SHA
- source digest
- before/after scalar
- inverse patch
- dry-run
- Draft PR

### 금지

- Kubernetes apply
- automatic merge
- direct base branch commit
- Secret 생성
- RBAC 확대
- arbitrary YAML 생성

### Recovery

- baseline
- start time
- new Evidence only
- same resource UID
- stable window
- stale/duplicate rejection

### 완료 조건

- [ ] Python safety fixture parity
- [ ] stale base fail closed
- [ ] ambiguous target fail closed
- [ ] unsafe field fail closed
- [ ] non-Draft PR fail closed
- [ ] merge API 없음
- [ ] Recovery fixture parity

J3 완료 시 Python 행동 포팅 완료로 표시한다.

## J4. Agent

### 역할

- Kubernetes read-only watch/list/get
- Evidence normalization
- delta batch
- outbound HTTPS
- bounded encrypted spool
- reconnect
- credential rotation
- health status

### 금지

- inbound command execution
- shell
- exec
- attach
- port-forward
- mutation
- Secret read
- node filesystem
- container runtime socket

### Agent identity

- Agent ID
- cluster UID
- Hub installation ID
- certificate/fingerprint
- enrollment generation
- last rotation

### spool

- 최대 byte
- 최대 age
- drop policy
- checksum
- retry count
- coverage gap

### 완료 조건

- [ ] Hub 중단 중 workload 영향 0
- [ ] bounded disk
- [ ] duplicate delivery idempotent
- [ ] resourceVersion 만료 복구
- [ ] network partition test
- [ ] credential rotation test
- [ ] read-only manifest test

## J5. Hub와 Store

### Hub module

```text
identity
fleet
agent-enrollment
evidence-ingestion
incident
analysis
remediation
recovery
audit
retention
notification
api
```

하나의 deployable process로 시작한다.

### Store

- PostgreSQL
- Flyway baseline
- jOOQ
- transactional outbox
- partition/retention
- backup/restore

### DB 기본 원칙

- domain object와 jOOQ record 분리
- JSONB는 extension/evidence payload에 제한
- identity와 lifecycle은 typed column
- migration backward step 문서화
- destructive migration 사전 검사
- UTC timestamp
- tenant/fleet key 포함

### 완료 조건

- [ ] internal PostgreSQL mode
- [ ] external PostgreSQL mode
- [ ] migration dry-run
- [ ] backup/restore
- [ ] Incident ingestion idempotency
- [ ] retention purge
- [ ] audit event
- [ ] Hub restart recovery

## J6. 설치와 수명주기

### CLI

```bash
clue install --dry-run
clue install
clue status
clue login
clue upgrade --plan
clue upgrade
clue uninstall --keep-data
clue uninstall --purge
```

### 설치 구성

- Hub
- Console
- Agent
- PostgreSQL 또는 external DB secret reference
- Service
- read-only RBAC
- installation identity

### 중복 Hub

- cluster-scoped installation identity
- install preflight
- active installation 발견 시 거부
- endpoint와 fingerprint 출력
- 기존 Hub login 안내
- migration 명령 분리

### 완료 조건

- [ ] duplicate install 거부
- [ ] CLI 재실행 후 Hub discovery
- [ ] uninstall resource 목록 출력
- [ ] keep-data/purge 분리
- [ ] CRD 공유 여부 검사
- [ ] upgrade rollback 문서

## J7. Watch, Fleet, Console

### watch

- foreground process
- bounded memory
- optional SQLite
- 24시간 또는 byte limit
- restart recovery
- coverage gap

### Fleet

- cluster membership
- Agent transfer
- credential rotation
- user/role
- Rule Pack assignment
- Incident query

### Console route

```text
/incidents
/incidents/{id}
/clusters
/agents
/settings/retention
/settings/privacy
```

범용 Kubernetes dashboard route는 만들지 않는다.

### 완료 조건

- [ ] 24시간 watch soak
- [ ] memory/disk limit
- [ ] multi-cluster isolation
- [ ] Agent transfer
- [ ] Incident view
- [ ] Evidence/Rule/Remediation/Recovery 표시

## J8. AI와 Rule Pack

### AI

- disabled
- Ollama
- LM Studio
- llama.cpp
- OpenAI-compatible endpoint
- remote API opt-in
- MCP
- external command experimental

### 개인정보

- payload preview
- pseudonymization
- Secret 수집 없음
- provider별 전송 기록
- 자동 fallback 없음

### Rule Pack

- YAML/JSON rule
- Java Analyzer SPI
- signature
- checksum
- required RBAC
- fixture
- compatibility range

### 완료 조건

- [ ] AI disabled core test
- [ ] local AI test
- [ ] external payload approval
- [ ] malicious Rule Pack timeout
- [ ] permission preview
- [ ] version compatibility

## J9. Production hardening

### 보안

- threat model
- dependency scan
- container scan
- SBOM
- signed release
- secret scanning
- penetration test 범위
- vulnerability disclosure

### 운영

- SLO
- load test
- soak test
- backup restore rehearsal
- Hub migration rehearsal
- Agent upgrade skew
- Kubernetes version matrix
- PostgreSQL version matrix

### release

- Homebrew Tap
- GitHub Release
- container image
- Helm chart
- checksum
- signature
- provenance
- changelog

## Python/Java parity 검사

### 입력

```text
같은 Handoff fixture
같은 schema version
같은 Rule version
고정 Clock
고정 ID generator
```

### strict 비교

- schema version
- resource identity
- Rule ID/version
- cause
- confidence class
- Evidence reference
- reason code
- remediation level
- recovery result

### 비교 제외

- 설명 문장 어순
- whitespace
- JSON key order
- runtime log
- 내부 class/module 이름

### 차이 처리

1. semantic diff 생성
2. Python contract 오류인지 Java 구현 오류인지 분류
3. contract 오류면 Python fixture 먼저 수정
4. Handoff patch version 발행
5. Java 반영
6. compatibility note 기록

Java 결과만 변경하지 않는다.

## Handoff version 규칙

```text
python-handoff-v1.0.0
```

| 변경 | version |
|---|---|
| fixture 추가 | minor |
| optional field 추가 | minor |
| expected explanation 변경 | patch |
| required field 변경 | major |
| enum 의미 변경 | major |
| Rule cause 변경 | major 또는 명시적 rule version 변경 |

## commit 순서

```text
1. Maven foundation
2. Handoff import
3. protocol
4. domain
5. compatibility runner
6. Kubernetes adapter
7. CLI JVM
8. CLI native
9. P0 Analyzer parity
10. remediation parity
11. recovery parity
12. Agent
13. Hub
14. PostgreSQL
15. install lifecycle
16. watch
17. Fleet
18. Console
19. AI/MCP
20. Rule Pack
21. production hardening
```

한 commit에서 하지 않는 조합:

- module 이동과 behavior 변경
- schema 변경과 DB migration
- native 설정과 Analyzer 로직 변경
- porting parity와 신규 기능
- 대규모 dependency update와 release

## 최종 gate

```bash
./mvnw verify
./mvnw -pl clue-compatibility verify
./mvnw -Pnative -pl clue-cli verify
./mvnw -Pintegration verify
```

별도 gate:

```text
architecture
schema compatibility
Python parity
Kubernetes read-only
Secret non-collection
Draft PR safety
Recovery correctness
Native artifact
container/Helm
SBOM/signature
```

## 완료 기준

### Java 포팅 완료

- [ ] J0-J3 완료
- [ ] Python fixture parity
- [ ] Native CLI release
- [ ] Homebrew 설치

### 설치형 Clue 완료

- [ ] J4-J6 완료
- [ ] Agent
- [ ] Hub
- [ ] PostgreSQL
- [ ] install/status/uninstall

### 멀티클러스터 Clue 완료

- [ ] J7 완료
- [ ] watch
- [ ] Fleet
- [ ] Console

### 생태계 기반 완료

- [ ] J8-J9 완료
- [ ] AI adapter
- [ ] MCP
- [ ] Rule Pack SDK
- [ ] signed release
- [ ] 운영 검증

`k8s-clue` archive 검토 시점:

```text
J3 parity release 완료 후
```
