---
layout: default
title: Clue 데이터·보안·신뢰
nav_order: 5
permalink: /wiki/k8s-clue-data-security-trust/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/data-security-trust
projection_sha256: 6d23e5cb3ad4f3dd8fb5bc7d1d99d83909e3e0b17320bacbaa8351e4ff52a01a
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 데이터·보안·신뢰
{: .no_toc }

## 공개해야 하는 운영 계약

Clue는 설치 전에 다음 내용을 문서와 CLI에서 확인할 수 있어야 한다.

1. Agent가 읽는 Kubernetes 리소스 목록
2. Secret 값을 읽지 않는 정책
3. 클러스터를 직접 수정하지 않는 정책
4. Agent가 Hub로 보내는 데이터
5. 데이터 보존 기간과 삭제 방식
6. 네트워크가 끊겼을 때의 동작
7. Hub 장애가 사용자 워크로드에 영향을 주지 않는 구조
8. 모든 원인 판단의 Rule ID와 Evidence
9. 모든 수정의 dry-run과 Draft PR 원칙
10. 설치·제거 명령과 제거되는 데이터

## Kubernetes 조회 범위

초기 Agent RBAC allowlist:

- Pods
- Deployments, ReplicaSets, StatefulSets, DaemonSets
- Jobs, CronJobs
- Nodes의 condition과 allocatable metadata
- Events
- Services와 EndpointSlices
- PersistentVolumeClaims, PersistentVolumes, StorageClasses의 비밀이 아닌 metadata
- HPAs
- Ingresses
- Namespaces, ResourceQuotas, LimitRanges

허용 verb는 기본적으로 `get`, `list`, `watch`뿐이다.

금지 대상:

- Secret 값과 ServiceAccount token
- `exec`, `attach`, `port-forward`, `proxy`
- create, update, patch, delete
- 노드 filesystem과 container runtime socket
- 사용자가 명시하지 않은 애플리케이션 로그의 무제한 수집

Secret 존재 여부가 필요하더라도 Secret 조회 권한을 기본 부여하지 않는다. Pod Event와 API가 노출하는 안전한 상태로 판단하고, 정보가 부족하면 추가 확인 방법만 사용자에게 안내한다.

## Agent가 전송하는 데이터

- allowlisted 리소스 상태 필드
- 정규화한 Kubernetes Event
- resource identity와 owner 관계
- Analyzer 실행에 필요한 설정 일부
- Agent health, version, 마지막 수집 시각

전송하지 않는 데이터:

- Secret data
- kubeconfig credential
- ServiceAccount token
- 환경변수의 실제 민감 값
- 애플리케이션 요청·응답 body
- 사용자가 활성화하지 않은 로그

## 보존 정책

초기 기본값 제안:

| 데이터 | 기본 보존 |
|---|---|
| raw Evidence | 7일 |
| 정규화 Evidence | 30일 |
| Incident와 판단 근거 | 180일 |
| 감사 로그 | 365일 |
| 로컬 watch history | 24시간 또는 100MB |

모든 값은 관리자가 줄일 수 있어야 한다. 삭제 요청은 tombstone만 남기지 않고 실제 partition/batch purge까지 완료 상태를 보여준다.

## 네트워크 단절

- Agent는 사용자 workload 요청 경로에 들어가지 않는다.
- Hub가 끊겨도 Kubernetes workload에는 아무 조치도 하지 않는다.
- Agent는 크기가 제한된 encrypted spool에 전송 대기 데이터를 기록한다.
- 한도 초과 시 오래된 raw snapshot부터 버리고 drop count와 시간 범위를 기록한다.
- 재연결하면 idempotency key와 observed-at 순서로 재전송한다.
- 데이터 공백은 숨기지 않고 Console에 coverage gap으로 표시한다.

## 신뢰 확보 방법

- 설치 전 `clue permissions explain`으로 RBAC를 사람이 읽을 수 있게 출력
- `clue install --dry-run`으로 생성할 리소스와 외부 endpoint 표시
- reproducible release, SHA-256, 서명과 SBOM 제공
- release artifact와 container image를 같은 source revision에 연결
- telemetry 기본 비활성화 또는 명시적 opt-in
- Rule Pack의 source, version, checksum과 실행 결과 공개
- security policy, threat model, vulnerability reporting 채널 제공
- 권한 확대가 필요한 Analyzer는 별도 동의와 별도 ServiceAccount 사용

## 멀티테넌시와 권한

- Cluster, Fleet, Incident, Remediation 권한을 분리
- 조회 권한과 Draft PR 생성 권한을 분리
- Agent enrollment token은 단기·일회성으로 사용
- 장기 통신은 Agent별 identity와 회전 가능한 credential 사용
- 모든 승인과 정책 변경을 audit event로 기록
