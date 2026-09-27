---
layout: default
title: Clue 제품 정의
nav_order: 1
permalink: /wiki/k8s-clue-product-definition/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/product-definition
projection_sha256: 093df0cfa91fcf3ffda5e820ec87d38caa1160e990110b431f979cf820654d53
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 제품 정의
{: .no_toc }

## 해결하려는 문제

Kubernetes 장애가 발생하면 사용자는 Pod 상태, Event, Deployment, 로그, 모니터링 지표와 Git 변경 이력을 서로 다른 도구에서 찾아야 한다. 현재 상태를 보는 것만으로는 원인을 설명하기 어렵고, 수정한 뒤 정말 회복했는지도 별도로 확인해야 한다.

Clue는 다음 흐름을 하나의 Incident로 연결한다.

```text
장애 징후
→ 증거 수집
→ 규칙 기반 원인 후보와 근거
→ 안전성 검사를 통과한 수정안
→ 사용자의 승인 또는 Draft PR
→ 변경 후 새 증거로 회복 확인
```

## 주요 사용자

1. 로컬·개발 클러스터를 다루는 개발자
2. 전담 SRE가 없는 소규모 팀
3. 여러 클러스터의 장애를 같은 기준으로 보고 싶은 플랫폼 팀
4. 장애 원인과 수정 근거를 감사 가능한 형태로 남겨야 하는 운영자

대형 프로덕션도 사용할 수 있게 설계하지만, 첫 사용자가 거대한 엔터프라이즈일 것이라고 가정하지 않는다. 첫 가치는 개발자가 현재 kubeconfig만으로 1분 안에 얻어야 한다.

## 사용자가 설치하는 이유

- `kubectl describe` 결과를 직접 조합하지 않아도 된다.
- 모든 결론에 Rule ID와 실제 Evidence가 붙는다.
- AI API 키가 없어도 결정론적 진단이 동작한다.
- 클러스터에 아무것도 설치하지 않고 첫 진단을 실행할 수 있다.
- 수정이 필요한 경우 클러스터를 몰래 바꾸지 않고 diff, dry-run 또는 Draft PR로 제안한다.
- 수정 이후 같은 대상이 회복했는지 자동으로 다시 확인할 수 있다.
- 필요할 때만 Agent와 Hub를 설치해 지속 이력과 멀티클러스터 기능으로 확장한다.

## K8sGPT 등 설명형 도구와의 차이

Clue의 중심은 LLM 답변이 아니라 `증거 → 판정 → 제한된 수정 → 회복 검증`의 연결이다.

| 관점 | Clue의 원칙 |
|---|---|
| 원인 설명 | Rule ID, 관측 시각, 리소스 identity와 원본 Evidence를 함께 제시 |
| AI | 선택 사항이며 규칙의 결론을 임의로 바꾸지 못함 |
| 수정 | 허용 목록, dry-run, diff, Draft PR과 명시적 승인 |
| 검증 | 변경 전 기준선과 변경 후의 새 Evidence를 비교 |
| 멀티클러스터 | Incident와 정책을 Fleet 단위로 통합 |
| 개인정보 | Secret 값은 수집하지 않고 외부 AI 전송은 기본 비활성화 |

## 제품 원칙

1. 첫 실행에 회원가입, Agent, Prometheus가 필요하지 않아야 한다.
2. 모르는 것은 `insufficient_evidence`로 말하고 추측을 사실처럼 제시하지 않는다.
3. 클러스터 직접 수정은 기본적으로 하지 않는다.
4. AI가 없어도 핵심 기능이 동작해야 한다.
5. Hub나 Agent 장애가 사용자 워크로드에 영향을 주어서는 안 된다.
6. 설치와 제거의 결과를 사용자가 예측할 수 있어야 한다.
7. 고급 기능을 위해 기본 사용 경험을 복잡하게 만들지 않는다.

## 초기 비목표

- 모든 Kubernetes 장애의 자동 복구
- 범용 모니터링·APM·로그 저장 플랫폼 대체
- Prometheus나 Grafana의 재구현
- 웹 터미널과 원격 명령 실행
- LLM이 자유롭게 생성한 YAML의 자동 적용
- 자동 merge 또는 무승인 프로덕션 변경
- 첫 버전부터 수십 개의 독립 마이크로서비스 운영
