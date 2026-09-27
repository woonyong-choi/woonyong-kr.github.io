---
layout: default
title: Clue 오픈소스 생태계
nav_order: 8
permalink: /wiki/k8s-clue-open-source-ecosystem/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/open-source-ecosystem
projection_sha256: 766d5f12f8458d6baeefc549dc694a0def4235aa9466114c3809771006531224
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue 오픈소스 생태계
{: .no_toc }

## 생태계의 중심

Clue의 확장 단위는 무제한 코드를 Hub 안에서 실행하는 plugin이 아니라, 버전과 권한이 명시된 Analyzer와 Rule Pack이다.

Rule Pack에 포함할 수 있는 것:

- Analyzer metadata와 입력 schema
- deterministic rule
- 필요한 Kubernetes resource scope
- Evidence 정규화 규칙
- Finding과 문서 링크
- Remediation template
- golden fixture와 기대 결과

## 사용자 정의 Analyzer

초기 확장 수준:

1. YAML/JSON rule DSL
2. Java Analyzer SPI
3. 외부 프로세스 또는 WASM sandbox는 생태계가 성장한 뒤 검토

Rule Pack 설치 전 Clue가 보여줄 내용:

- publisher와 source repository
- version과 checksum/signature
- 필요한 resource와 RBAC
- 외부 네트워크 사용 여부
- 실행 가능한 remediation 수준
- test fixture 통과 결과

```bash
clue rule search image-pull
clue rule inspect community/eks-pack
clue rule install community/eks-pack --dry-run
clue rule test ./my-pack
```

## 개발자가 기여하기 쉬운 구조

- JSON Schema와 예제 제공
- `clue rule init` scaffolding
- 실제 cluster 없이 fixture로 검증 가능한 test harness
- 잘못된 rule이 Hub 전체를 중단하지 않도록 timeout과 resource limit
- Analyzer compatibility matrix
- docs와 code owner가 분명한 작은 issue
- 기여자가 자신의 Rule Pack 사용량과 실패 사례를 볼 수 있는 공개 catalog

## 신뢰 가능한 catalog

Rule Pack 등급:

- `official`: Clue maintainers가 source와 fixture를 검토
- `verified`: 서명과 자동 호환성 테스트 통과
- `community`: 누구나 게시 가능, 권한과 위험을 명확히 표시

인기만으로 추천하지 않는다. 최근 유지보수, supported Clue/Kubernetes version, false-positive report와 필요한 권한을 함께 보여준다.

## 오픈소스 공개 시 증명해야 할 가치

1. 설치 후 1분 안에 의미 있는 진단 결과
2. 공개된 재현 장애 fixture에서 기존 수동 절차보다 적은 단계
3. false positive와 `insufficient_evidence` 비율
4. 각 판단이 어떤 Evidence로 재현되는지
5. Draft PR이 허용 범위를 넘지 않는다는 안전 테스트
6. 수정 후 Recovery Check의 정확성
7. Agent와 Hub의 CPU, memory, network overhead

스타 수보다 먼저 공개해야 할 자료:

- 10~20개의 재현 가능한 Incident 시나리오
- Golden Evidence Bundle
- Analyzer precision regression test
- 위협 모델과 데이터 흐름도
- 제거 및 데이터 삭제 검증
- release checksum, signature와 SBOM

## 커뮤니티 메시지

제품 설명은 다음 문장을 일관되게 사용한다.

> Clue collects Kubernetes incident evidence, explains the cause, proposes a safe fix, and verifies recovery.

`AI가 Kubernetes를 고친다`고 홍보하지 않는다. AI는 선택적인 설명 계층이고 Clue의 신뢰는 Evidence, rule, policy와 verification에서 나온다.
