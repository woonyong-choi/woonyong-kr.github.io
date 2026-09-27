---
layout: default
title: Clue 사용자 경험과 명령어
nav_order: 2
permalink: /wiki/k8s-clue-user-experience/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/user-experience
projection_sha256: b9ba562ace83e120b07083182dae13d5758994a0b8740d7750c0795b6ce3cb9b
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 사용자 경험과 명령어
{: .no_toc }

## 세 가지 사용 수준

### 1. 일회성 진단: `clue diagnose`

사용자 PC의 CLI가 kubeconfig로 Kubernetes API를 읽고 결과를 출력한 뒤 종료한다.

```bash
clue diagnose
clue diagnose --context dev-cluster
clue diagnose --namespace payments
clue diagnose deployment/card-api
clue diagnose --all-contexts
```

필요한 것:

- Clue CLI
- kubeconfig와 조회 권한
- 접근 가능한 Kubernetes API

필요하지 않은 것:

- 회원가입
- 클러스터 내 Agent
- Hub와 PostgreSQL
- Prometheus
- 외부 AI API 키

일회성 진단이 과거 전체를 아는 것은 아니다. 현재 리소스 상태, Kubernetes Event, container 종료 상태, restart count, rollout 상태처럼 Kubernetes가 이미 보존하는 최근 증거를 읽어 지금 드러난 장애를 판단한다. 따라서 이미 사라진 짧은 장애나 장기 추세는 알 수 없다고 명확히 표시한다.

기본 출력 구조:

```text
Incident: deployment/payments-api is unavailable
Cause: IMAGE_TAG_NOT_FOUND
Confidence: high (deterministic rule)

Evidence
- Pod is in ImagePullBackOff
- Event: manifest unknown for image payments:1.8.5
- Deployment rollout has 0/3 available replicas

Suggested action
- Verify image tag 1.8.5 in the registry
- Proposed GitOps diff: 1.8.5 -> 1.8.4

Clue did not modify the cluster.
```

### 2. 로컬 지속 감시: `clue watch`

사용자 PC에서 foreground 프로세스로 실행한다. 종료하면 감시도 끝난다.

```bash
clue watch --context dev-cluster
clue watch --namespace payments --notify desktop
```

메모리를 무한히 사용하지 않는다. 최근 상태는 크기와 기간이 제한된 버퍼로 유지하고, 맥락과 재시작 복구가 필요하면 로컬 SQLite에 bounded history를 저장한다.

권장 기본값:

- 최근 24시간 또는 100MB 중 먼저 도달한 한도
- 오래된 raw snapshot은 삭제하고 Incident 요약은 더 오래 유지
- 동일 리소스의 변화가 없으면 새 snapshot을 저장하지 않음
- 사용자가 `--ephemeral`을 지정하면 디스크 없이 메모리만 사용

`watch`는 개인 개발 환경과 단기 디버깅을 위한 기능이다. 24시간 팀 운영, 여러 사용자, 장기 이력에는 Hub와 Agent를 사용한다.

### 3. 지속 운영과 멀티클러스터: `clue fleet`

Hub, PostgreSQL, Console을 설치하고 각 클러스터의 Agent가 Hub로 outbound 연결한다.

```bash
clue install
clue fleet join --context staging
clue fleet join --context production
clue fleet status
clue incident list --fleet default
```

이 수준에서 제공하는 기능:

- 여러 클러스터의 지속적인 Evidence와 Incident 이력
- 웹 Console
- 사용자와 역할 기반 권한
- 알림과 감사 로그
- 팀 공통 Analyzer와 Rule Pack
- 선택적 Prometheus 연동
- Remediation Plan과 Recovery Check 이력

## CLI의 공통 규칙

- 읽기 작업은 바로 실행하되 대상 context와 namespace를 항상 출력한다.
- 변경 가능성이 있는 명령은 계획을 먼저 보여주고 확인을 받는다.
- `--dry-run`을 모든 설치·변경 명령에서 지원한다.
- 자동화 환경을 위해 `--output json`, 안정적인 exit code와 `--no-interactive`를 지원한다.
- 사람이 읽는 출력에도 Rule ID와 Evidence reference를 포함한다.
- 현재 context가 모호하면 임의 선택하지 않고 선택을 요청한다.

## 로컬 연결 정보

CLI는 `$HOME/.config/clue/config.yaml`에 다음 정보만 저장한다.

- 사용자가 선택한 kubeconfig context
- Hub endpoint와 인증 profile 이름
- Hub 인증서 fingerprint
- 기본 Fleet와 출력 설정

실제 토큰은 운영체제 Keychain/credential store를 우선 사용한다. 설정 파일에 평문 Secret을 저장하지 않는다.
