---
layout: default
title: Clue 구현 상태표
nav_order: 9
permalink: /wiki/k8s-clue-implementation-roadmap/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/implementation-roadmap
projection_sha256: dbcc9b24ed20ff3457b4ac116af37edd9d547b41db0a2be2486ee1fa41f0a6de
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 구현 상태표
{: .no_toc }

상세 작업은 [Python 선행 정리와 Java 포팅 계획](/wiki/k8s-clue-python-first-port-plan/)을 기준으로 한다.

## R0. Python Handoff

범위:

```text
k8s-clue P0-P6
Python Handoff Gate
python-handoff-v1
```

완료 조건:

- [ ] 설치 없는 `clue diagnose`
- [ ] P0 Analyzer fixture
- [ ] versioned JSON Schema
- [ ] canonical expected result
- [ ] read-only RBAC
- [ ] Secret 비수집
- [ ] Draft PR safety
- [ ] Recovery Check
- [ ] 불필요한 Python runtime 제거
- [ ] Handoff artifact와 checksum

## R1. Java CLI parity

범위:

```text
J0 Build foundation
J1 Protocol/domain
J2 Native diagnose CLI
J3 Remediation/recovery
```

완료 조건:

- [ ] Python fixture semantic parity
- [ ] Java 25 build
- [ ] Native CLI 네 architecture
- [ ] Homebrew Tap
- [ ] Kubernetes read-only E2E
- [ ] Draft PR parity
- [ ] Recovery parity

release:

```text
v0.1.0
```

## R2. 설치형 Clue

범위:

```text
J4 Agent
J5 Hub/Store
J6 Install lifecycle
```

완료 조건:

- [ ] Agent outbound HTTPS
- [ ] bounded spool
- [ ] Hub modular monolith
- [ ] PostgreSQL/Flyway/jOOQ
- [ ] internal/external PostgreSQL
- [ ] install/status/upgrade/uninstall
- [ ] duplicate Hub 거부
- [ ] backup/restore

release:

```text
v0.2.0
```

## R3. 멀티클러스터 Clue

범위:

```text
J7 Watch/Fleet/Console
```

완료 조건:

- [ ] local watch
- [ ] bounded SQLite history
- [ ] Fleet
- [ ] Agent transfer
- [ ] 사용자/역할
- [ ] Incident Console
- [ ] optional Prometheus
- [ ] multi-cluster isolation

release:

```text
v0.3.0
```

## R4. 확장 생태계

범위:

```text
J8 AI/Rule Pack
J9 Production hardening
```

완료 조건:

- [ ] MCP
- [ ] local AI
- [ ] external AI opt-in
- [ ] payload preview
- [ ] 가명화
- [ ] Analyzer SDK
- [ ] signed Rule Pack
- [ ] SBOM와 signed release
- [ ] load/soak/security test

release:

```text
v1.0.0 판단
```

## 현재 상태

```text
R0 진행 전
Java application code 없음
```
