---
layout: default
title: K8s Clue
nav_order: 2
permalink: /wiki/k8s-clue/
publication_state: publish
has_toc: false
projection_id: Wiki/projects/k8s-clue
projection_sha256: 665fe07432673130c41f855de14eb783692af20a06859d1dc9aead0476bd14fa
parent: Projects
content_status: ready
public_parent_id: Wiki/projects
---

# K8s Clue
{: .no_toc }

Clue는 Kubernetes 장애 증거를 수집하고, 판단 근거와 함께 원인을 설명하고, 안전한 수정안을 제안한 뒤 실제 회복까지 검증하는 도구다. 이 절의 문서 14편은 그 **목표 설계**이며, 실제로 동작하는 구현체와는 범위가 다르다.

## 구현체와 목표 설계를 구분한다

두 가지를 섞어 읽으면 안 된다.

| 구분 | 구현체 | 이 절의 설계 문서 |
| --- | --- | --- |
| 무엇인가 | 5인 팀이 2026-08에 만들고 이후 개인이 정리한 서비스 | 그 경험을 바탕으로 쓴 제품 목표 설계 |
| 언어·스택 | Python · FastAPI · PostgreSQL · Helm | Java 25 · Native CLI를 목표로 검토 (문서 10 · 12 · 13) |
| 배포 형태 | 관리 클러스터에 올리는 서비스와 콘솔 | 설치형 CLI와 Hub |
| 저장소 | `woonyong-choi/k8s-clue` | 코드 없음. 문서만 있다 |
| 검증 수치 | 구현체에서 실행한 값이 따로 있다 | 전부 미완료 체크박스다. 달성한 수치가 아니다 |

이 문서들에 나오는 `clue diagnose` 같은 명령은 **계획된 인터페이스**다. 현재 실행할 수 있는 것은 구현체 저장소의 Make 타깃이다. 문서 9의 상태표 항목이 전부 빈 체크박스인 것은 누락이 아니라 아직 착수하지 않았다는 뜻이다.

## 명칭 대응

구현체와 설계 문서는 같은 역할을 다른 이름으로 부른다. 문서 14편은 아래 오른쪽 열을 전제로 쓰여 있다.

| 역할 | 구현체에서 부르는 이름 | 설계 문서에서 부르는 이름 |
| --- | --- | --- |
| 제품과 CLI 명령 | — (서비스로만 존재) | Clue / `clue` |
| 중앙 제어 계층 | API 게이트웨이 · 워커 | Clue Hub |
| 클러스터 수집 프로세스 | 대상 클러스터 에이전트 | Clue Agent |
| 웹 UI | 콘솔 | Clue Console |
| PostgreSQL 데이터 계층 | PostgreSQL | Clue Store |
| 여러 클러스터의 논리적 묶음 | — | Fleet |
| 장애 판단 모듈 | 규칙 카탈로그 · 판정 워커 | Analyzer |
| 배포 가능한 판단 묶음 | — | Rule Pack |
| 한 시점의 불변 진단 자료 | 정규화한 증거 | Evidence Bundle |
| 장애 단위 | 장애 | Incident |
| 안전한 수정 제안 | Draft PR 제안 | Remediation Plan |
| 변경 후 회복 판정 | 배포 후 검증 | Recovery Check |

`Management`라는 제품명은 쓰지 않는다. 관리 계층 전체를 가리킬 때만 일반 명사로 쓰고, 실행 인스턴스는 `Hub`라고 부른다.

## 두 쪽에서 같은 원칙

구현체와 설계가 갈라지지 않는 지점이 하나 있다. **자동화의 권한을 어디서 차단할 것인가**다.

- 증거 수집은 읽기 전용이다. 에이전트는 명령 채널을 갖지 않는다.
- 수정은 Draft PR로만 제안하고, 반영 여부는 사람이 판단한다.
- Secret 값은 가명화 대상이 아니라 애초에 수집하지 않는다.
- 자동 merge와 자동 rollback은 설계에서 제외한다.

문서 4와 5가 이 원칙을 설계 쪽에서 다시 진술한다.

## 읽는 순서

처음 본다면 1 → 3 → 9 순으로 읽는다. 무엇을 풀려는지, 어떤 구조로 풀려는지, 어디까지 왔는지가 그 셋에 있다.

## 묶어 보기

- **제품 정의와 사용자 경험** — 1, 2
- **구조와 동작** — 3, 4
- **운영 경계(보안·설치·AI·생태계)** — 5, 6, 7, 8
- **구현과 Java 포팅 판단** — 9, 10, 11, 12, 13, 14
