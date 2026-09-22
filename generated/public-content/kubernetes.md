---
layout: default
title: Kubernetes
nav_order: 7
permalink: /wiki/kubernetes/
publication_state: publish
has_toc: true
projection_id: Wiki/platform-delivery-operations/kubernetes
projection_sha256: 0ebff0c2f7007e16b576c25f3c9d860f8aa8a075e67ca452119acd7582fab187
parent: DevOps
content_status: ready
public_parent_id: Wiki/platform-delivery-operations
---

# Kubernetes
{: .no_toc }

Kubernetes를 운영 환경에 배치할 때는 정상 동작뿐 아니라 장애와 수요 변화에 대응할 수 있는지도 살펴야 한다. 직접 구축할지, Managed Service에 일부 관리를 맡길지에 따라 책임 범위도 달라진다.

## 운영 환경에서 확인할 것

Control Plane과 Worker Node가 같은 장애로 함께 멈출 수 있는지부터 확인한다. API Server의 복제와 Load Balancing, Zone 분산, etcd 백업·복구, 인증서 갱신과 업그레이드가 검토 대상이다. Worker 용량은 평소 수요뿐 아니라 증가할 수 있는 부하와 클러스터 DNS 같은 의존 서비스도 고려한다.

접근 권한은 사람과 Workload의 신원을 구분해 설정한다. 인증으로 신원을 확인하고, RBAC 등으로 허용할 작업과 범위를 정한다. 자세한 접근 제어는 Kubernetes 보안으로 이어진다.

검토 결과는 구성도와 설정에 연결해야 한다.

| 검토할 내용 | 확인할 근거 |
|---|---|
| 장애가 퍼지는 범위와 복구·업그레이드 순서 | Cluster 구성, 장애·복구 점검 결과 |
| 사용자와 ServiceAccount의 권한 | RBAC 설정과 접근 감사 |
| Workload별 requests·limits와 Namespace quota | 리소스 정책, 사용량과 용량 계획 |

이는 운영 준비를 확인하는 기준이다. 구성도가 있다는 것만으로 장애 복구나 실제 운영이 검증되지는 않는다. 직접 구축하는 kubeadm 등의 방식과 Control Plane·Node 관리를 맡기는 방식도 이 책임 범위를 기준으로 비교할 수 있다. 세부 절차는 [Kubernetes 공식 운영 환경 안내](https://kubernetes.io/docs/setup/production-environment/)에서 확인한다.
