---
layout: default
title: Clue 설치와 수명주기
nav_order: 6
permalink: /wiki/k8s-clue-installation-lifecycle/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/installation-lifecycle
projection_sha256: d3f4c7ba9becf266f772dcb7c12ef07f68b856eb3110d38f5a382fbef7e403f8
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 설치와 수명주기
{: .no_toc }

## CLI 설치

초기에는 자체 Homebrew Tap을 사용한다.

```bash
brew install woonyong-choi/tap/clue
```

프로젝트가 안정화되고 Homebrew 요구 조건을 충족하면 다음 설치 경험을 목표로 한다.

```bash
brew install clue
```

GitHub Release 산출물:

```text
clue_Darwin_arm64.tar.gz
clue_Darwin_x86_64.tar.gz
clue_Linux_arm64.tar.gz
clue_Linux_x86_64.tar.gz
checksums.txt
checksums.txt.sig
sbom.spdx.json
```

CLI는 `clue` 바이너리 하나로 설치한다. 제품명과 실행 파일명은 모두 `Clue`/`clue` 계약을 따른다.

## 설치 수준

### CLI only

```bash
clue diagnose
```

클러스터에 생성되는 리소스가 없다.

### Hub 설치

```bash
clue install
```

기본 설치 결과:

- Clue Hub
- Clue Console
- 내장 PostgreSQL StatefulSet
- 현재 클러스터의 Clue Agent
- Service, Secret, read-only RBAC
- 설치 identity

내장 PostgreSQL은 소규모·평가 환경의 기본값이다. production은 외부 managed PostgreSQL 또는 운영자가 관리하는 PostgreSQL을 선택할 수 있다.

```bash
clue install --database external --database-url-secret clue-db
```

Prometheus는 필수가 아니다. 연결되어 있다면 장기 시계열을 보강하는 optional provider로 사용한다.

## 다시 연 CLI의 연결

CLI 프로세스가 종료되어도 Hub는 클러스터 안에서 계속 실행된다. 다시 실행한 CLI는 다음 순서로 연결 정보를 찾는다.

1. 로컬 profile 확인
2. 현재 kubeconfig context에서 Clue installation identity 탐색
3. 저장된 Hub endpoint와 인증서 fingerprint 검증
4. 인증 토큰이 없거나 만료되었으면 다시 로그인

```bash
clue context list
clue context use production
clue status
```

클러스터의 installation identity에는 공개 endpoint, 설치 ID, Hub 인증서 fingerprint와 버전만 둔다. 사용자 token이나 DB credential은 기록하지 않는다.

## 같은 클러스터의 중복 Hub

`clue install`은 cluster-scoped installation identity를 사전 확인한다. 활성 Hub가 발견되면 기본적으로 설치를 거부하고 기존 설치 정보를 보여준다.

```text
Clue Hub already exists
Installation: clue-prod-01
Namespace: clue-system
Endpoint: https://clue.example.com

Use `clue login` or `clue hub migrate`.
```

Helm을 직접 사용해 검사를 우회하는 경우도 admission/pre-install validation과 singleton identity로 감지한다. 단순 namespace label만으로 판정하지 않는다.

## Agent가 Hub를 찾는 방법

Agent는 네트워크 broadcast로 Hub를 자동 탐색하지 않는다. 설치 시 Hub URL, installation ID, CA/fingerprint와 일회성 enrollment token을 명시적으로 받는다.

```bash
clue fleet join --context staging --hub prod-hub
```

Agent는 한 Hub에만 active enrollment를 가진다. 다른 Hub에 연결하려면 다음 절차가 필요하다.

```bash
clue agent transfer --cluster staging --to new-hub
```

이 명령은 이전 Hub의 소유권 해제, 새 credential 발급, 연결 확인을 하나의 기록 가능한 작업으로 수행한다.

## Hub 이동과 데이터베이스

Hub 이동은 endpoint만 바꾸는 작업이 아니다. PostgreSQL의 Incident, 사용자, 감사, enrollment 정보도 함께 이동해야 한다.

지원할 두 가지 방식:

1. 외부 PostgreSQL 유지: 새 Hub가 같은 DB를 사용하고 짧은 write freeze 후 cutover
2. 내장 PostgreSQL 이동: backup, checksum 검증, restore, migration dry-run, Agent trust 회전, cutover

```bash
clue hub migrate plan --to-context new-management
clue hub migrate execute --backup-location s3://...
clue hub migrate verify
```

첫 공개 버전에서는 자동 이동보다 검증 가능한 backup/restore 문서를 먼저 제공한다. 부분적으로 성공한 migration을 성공으로 표시하지 않는다.

## 업그레이드와 제거

```bash
brew upgrade clue
clue upgrade --plan
clue upgrade
clue uninstall --keep-data
clue uninstall --purge
brew uninstall clue
```

- Homebrew 설치는 `brew upgrade`가 소유하며 CLI 자체 자동 업데이트를 하지 않는다.
- `--keep-data`는 PostgreSQL PVC와 backup 정보를 유지한다.
- `--purge`는 삭제할 Kubernetes 리소스와 데이터 범위를 먼저 출력하고 확인을 받는다.
- CRD처럼 공유 가능성이 있는 리소스는 마지막 설치인지 확인한 후 삭제한다.
