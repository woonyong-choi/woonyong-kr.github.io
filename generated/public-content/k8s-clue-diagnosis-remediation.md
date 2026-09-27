---
layout: default
title: Clue 진단과 안전한 수정
nav_order: 4
permalink: /wiki/k8s-clue-diagnosis-remediation/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/diagnosis-remediation
projection_sha256: 975169076cb060917bce59821d659da0404edb81dfdfd03d7d52be624c845155
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 진단과 안전한 수정
{: .no_toc }

## Evidence Bundle

Evidence Bundle은 특정 시점과 대상에 대한 불변 입력이다.

필수 필드:

- Evidence ID와 schema version
- cluster identity와 kube context
- namespace, kind, name, UID
- 수집 시각과 Kubernetes resourceVersion
- 정규화된 상태와 관련 Event
- 수집기 버전과 사용한 권한 범위
- 민감정보 제거 결과

원본 전체 객체를 무조건 저장하지 않는다. Analyzer에 필요한 allowlisted field만 정규화하고, raw 보존이 필요한 경우에도 크기·기간·권한을 제한한다.

## Analyzer

Analyzer는 Evidence를 입력받아 Finding을 반환한다.

```text
Analyzer ID: CLUE-IMAGE-001
Version: 1.0.0
Input: Pod status + Kubernetes Event + owner Deployment
Output: cause, severity, confidence, evidence refs, suggested checks
```

판단 우선순위:

1. 정확한 Kubernetes 상태와 reason code
2. versioned deterministic rule
3. 여러 Evidence 간 상관관계
4. 선택적인 AI 설명

AI는 Analyzer가 찾지 못한 원인을 사실로 확정하지 못한다. 새로운 가능성은 `hypothesis`로 별도 표시한다.

## 초기 지원 Analyzer

| 우선순위 | 장애 | 대표 Evidence |
|---|---|---|
| P0 | ImagePullBackOff / ErrImagePull | container state, registry Event, image reference |
| P0 | CrashLoopBackOff | restart count, last termination, exit code, probe Event |
| P0 | Pending / scheduling 실패 | PodScheduled condition, scheduler Event, node constraints |
| P0 | OOMKilled | last termination reason, memory request/limit, restart trend |
| P0 | Deployment rollout 정체 | generation, observedGeneration, replica status, condition |
| P0 | readiness/liveness probe 실패 | probe configuration과 Event, endpoint 상태 |
| P1 | PVC Pending / mount 실패 | PVC condition, StorageClass reference, volume Event |
| P1 | Service endpoint 없음 | selector와 workload label, EndpointSlice |
| P1 | Job/CronJob 실패 | Job condition, failed Pod, schedule status |
| P1 | HPA 확장 불가 | HPA condition과 metric availability |
| P2 | DNS·NetworkPolicy·Ingress 문제 | 관련 리소스와 선택적 능동 검사 |

## Incident 생성과 중복 억제

Incident identity는 단순 메시지 문자열이 아니라 다음 조합으로 만든다.

```text
cluster UID + namespace + workload UID + analyzer ID + symptom identity
```

동일한 장애가 반복 수집되어도 기존 열린 Incident에 occurrence를 추가한다. 리소스 UID가 바뀌거나 회복 후 다시 발생하면 새 lifecycle로 처리한다.

## Remediation Plan

Remediation Plan은 실행 명령이 아니라 검토 가능한 변경 계약이다.

- 왜 이 변경이 필요한지
- 어떤 Evidence와 Rule이 근거인지
- 수정 대상 repository, branch, manifest path
- 변경 전 값과 제안 값
- 예상 영향과 위험
- dry-run 결과
- 원복 방법
- 변경 후 확인할 Recovery Check

## 수정 권한 수준

| 수준 | 동작 |
|---|---|
| Explain | 설명만 제공 |
| Suggest | 명령 또는 manifest diff 제안 |
| Draft PR | 고정된 base SHA를 기준으로 Git Draft PR 생성 |
| Apply | 초기 버전에서는 제공하지 않음 |

초기 자동화는 Deployment의 제한된 scalar field처럼 안전 계약을 코드와 테스트로 증명한 경우에만 Draft PR까지 허용한다. Secret 생성, RBAC 확대, NetworkPolicy 완화는 자동 제안 대상에서 제외한다.

## Recovery Check

변경 성공은 PR 생성이나 배포 완료가 아니다. Clue는 배포 이후 새 Evidence window에서 다음을 확인한다.

- 같은 resource identity인가
- 장애 reason이 사라졌는가
- desired/available replica가 회복했는가
- 일정 안정 구간 동안 재발하지 않았는가
- 새로운 부작용 신호가 생기지 않았는가

변경 전 snapshot을 변경 후 snapshot으로 재사용하지 않는다. Recovery Check 시작 시점 이후에 관측한 새 Evidence만 인정한다.
