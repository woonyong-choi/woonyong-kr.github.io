---
layout: default
title: GC
nav_order: 5
permalink: /wiki/programming-languages-runtime-gc-5ef97fb71b3e/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-gc-5ef97fb71b3e
projection_sha256: 22aa1bee431edb30e0d6a40bbb37982f1c0be3b946e2c62957eaa7aef652a0c2
parent: JVM
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/jvm
grand_parent: Runtime
ancestor: Programming
---

# GC
{: .no_toc }

JVM의 GC는 더 이상 도달할 수 없는 객체의 공간을 재사용할 수 있도록 회수한다. 도달 가능성의 의미와 논리적 누수는 [Runtime](/wiki/programming-languages-runtime-topic-a5b710f9d5d9/)에서 먼저 확인할 수 있다. 여기서는 HotSpot의 수집 방식과 세대, 측정할 지표를 구분한다.

## 세대는 객체 수명에 대한 관찰을 이용한다

여러 애플리케이션에서는 생성된 지 얼마 안 된 객체가 짧은 시간 안에 필요 없어지는 경향이 있다. 세대별 수집은 이 관찰을 이용해 Young과 Old를 다르게 관리한다. 모든 프로그램이 같은 수명 분포를 갖는 것은 아니다.

예를 들어 Serial Collector의 Young은 Eden과 두 Survivor 영역으로 설명한다. 살아남은 객체를 복사하고, 나이와 공간 조건에 따라 Old로 승격한다. “정해진 횟수만 지나면 언제나 같은 위치로 간다”는 고정 규칙으로 읽지 않는다. 이 배치를 G1·ZGC를 포함한 모든 Collector의 물리 구조로 일반화해서도 안 된다. [JDK 25의 세대별 수집과 Serial 배치](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-collector-implementation.html)

## 병렬 수집과 동시 수집은 다르다

Parallel Collector는 여러 GC Thread로 수집 작업을 나눈다. Concurrent Collector는 일부 수집 작업을 애플리케이션 실행과 겹쳐 수행한다. GC Thread가 여러 개라는 사실만으로 애플리케이션의 정지가 사라지지는 않는다.

HotSpot에는 Serial·Parallel·G1·ZGC 등 서로 다른 선택지가 있다. 같은 크기의 Heap에서도 살아 있는 객체의 양과 할당 속도, 참조 변경, CPU·메모리 여유에 따라 결과가 달라진다. 하나의 Mark and Sweep 모델만으로 모든 Collector의 정지 시간을 설명하거나 Heap 크기만으로 지연을 계산하지 않는다. [JDK 25의 Collector 비교](https://docs.oracle.com/en/java/javase/25/gctuning/available-collectors.html)

## 이름보다 실제 응답과 회수 상태를 본다

Collector를 비교할 때는 처리량, 응답 지연과 GC 정지, 사용 메모리를 함께 본다. GC에 걸린 시간의 평균만 낮아도 드물게 긴 정지가 있으면 서비스 요구를 만족하지 못할 수 있다. 반대로 정지를 줄이려고 늘린 동시 작업이 CPU와 메모리를 더 사용할 수 있다.

애플리케이션과 JDK 버전, 선택한 Collector·옵션을 고정하고 부하와 GC 로그를 연결한다. 참조가 남은 Cache를 계속 키우는 문제는 Collector를 바꾸는 것만으로 해결되지 않는다. [HotSpot의 GC 관리 범위](https://docs.oracle.com/en/java/javase/25/gctuning/introduction-garbage-collection-tuning.html)
