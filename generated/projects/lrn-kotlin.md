---
layout: project
title: "Kotlin 학습"
permalink: /projects/lrn-kotlin/
slug: "lrn-kotlin"
summary: "Kotlin in Action의 헷갈리는 동작을 실행 결과와 테스트로 확인하는 학습 저장소."
status: "active"
period: "2026-08-29 ~ 2026-09-22"
role: "개인"
repo: "woonyong-choi/lrn-kotlin"
repo_url: "https://github.com/woonyong-choi/lrn-kotlin"
repo_ref: "214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c"
readme_url: "https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/README.md"
concepts:
  - title: "프로그래밍 언어"
    url: "/wiki/programming-languages-runtime-topic-91f4e521b7e6/"
  - title: "JVM"
    url: "/wiki/jvm/"
  - title: "GC"
    url: "/wiki/programming-languages-runtime-gc-5ef97fb71b3e/"
nav_exclude: true
render_with_liquid: false
generated_by: scripts/sync-projects.mjs
---

<!-- 생성물입니다. 정본은 woonyong-choi/lrn-kotlin 의 README.md 입니다. 수동 편집하지 마세요. -->

*Kotlin in Action, Second Edition*을 읽다가 `equals`/`hashCode` 계약에서 멈춰서, **그 계약이
`HashMap`이 성립하기 위한 전제조건임을 참조 구현과의 대조로 증명하고, 깨졌을 때 JDK 내부
어디서 실패하는지를 재현 가능한 모델로 보이는** 저장소입니다. Chapter 2와 5의 문법 확인 코드도
같이 있지만, 깊게 판 것은 Chapter 4입니다.

설계 결정과 버린 대안, 알려진 한계는 [docs/design.md](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/design.md)에 있습니다.

## 버전업된 모습

**결과: 테스트 53개 통과 · line coverage 93.5% · 실행 태스크 7개 모두 성공**
(`./gradlew test`, `./gradlew bench` — 재현은 [검증](#검증)).

"책 예제를 실행하고 테스트로 고정한" 저장소에서 출발했습니다. 문제는 고정한 것이 전부
**Kotlin이 이미 보장하는 동작**이었고, 테스트 29개가 모두 손으로 고른 입력 하나씩만
단언했다는 점입니다. 그래서 주장을 하나로 좁히고, 그 주장만 증거로 뒷받침했습니다.

| 항목 | before | after |
| --- | ---: | ---: |
| 테스트 | 29 | 53 |
| line coverage | 44.3% | 93.5% |
| branch coverage | 48.6% | 79.4% |
| 참조 구현 대조 | 0 | 300 시퀀스 x 60 연산 x 2 키 타입 |
| 성능 측정 | 0 | `./gradlew bench` + [결과 파일](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/bench/results.md) |
| 실패 모드 테스트 | 0 | 5 |
| 설계 문서 | 없음 | [docs/design.md](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/design.md) |

**어려웠던 점.** 세운 가설이 틀렸던 것입니다. "같은 값인데 hash가 다른 키가 유실되는 이유는
다른 버킷에 떨어지기 때문이고, 운 좋게 같은 버킷이면 버그가 숨는다"고 보고 그대로 테스트를
썼는데 실패했습니다. `HashMap`은 `spread(hashCode())`를 각 노드에 캐시해 두고 `equals`를
부르기 **전에** 비교합니다. 같은 버킷은 아무것도 사 주지 않고, 조회에서 `equals`는 한 번도
호출되지 않습니다(`CountingKey`로 세어서 확인). 덕분에 결론이 더 강해졌습니다 —
`spread`는 involution이라 전단사이므로, **깨진 `hashCode`는 간헐적이 아니라 무조건 실패합니다.**
틀린 가설을 지우지 않고 [docs/design.md 4절](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/design.md)에 기록으로 남겼습니다.

## 구동모습

배포된 URL이 없는 로컬 실행 전용 저장소라 터미널 출력이 구동 화면입니다.
`./gradlew runEqualityAndHashing`의 실제 출력 일부입니다.

```text
Kotlin 2.4.10; JDK 21.0.8+9-LTS
Contract: equal objects must have equal hashes; equal hashes need not mean equal objects.
Invalid-key results below are observations of this JVM, not portable guarantees.
equals only (identity hashes can collide)
  == true; === false
  hashCode: 1175962212 / 1421795058
  contains(probe)=false; get(probe)=null
  add(probe)=true; set.size=2
controlled violation
  == true; === false
  hashCode: 1 / 2
  contains(probe)=false; get(probe)=null
```

`./gradlew bench`의 실제 결과입니다(10,000개 키, 조회 1회당 ns, 잘 분포된 hash 대비).

```text
well distributed   ........................................ 86.2 ns    1.0x
16 buckets         ##...................................... 3053.1 ns  35.4x
single bucket      ######################################## 57547.1 ns 667.3x
single bucket +    ........................................ 186.0 ns   2.2x
  Comparable
```

## 메인 기술

### 1. `equals`/`hashCode` 계약을 참조 구현 대조로 증명

`Map`의 명세는 `equals`만으로 쓰여 있으므로 자명한 참조 구현(쌍의 리스트를 선형 탐색)이 있고,
`HashMap`은 그것의 최적화입니다. 계약을 "지킬 규칙"이 아니라 **최적화의 건전성 전제**로 놓아서
양방향으로 반증 가능하게 만들었습니다.
측정: 무작위 연산 시퀀스(put/get/remove/containsKey) 대조. **before 고정 예시 6개 →
after 300 시퀀스 x 60 연산 x 2 키 타입 전부 일치, 계약 위반 키는 반드시 발산하고
delta debugging으로 줄인 최소 반례는 2연산.** 재현 `./gradlew test --tests '*HashContractPropertyTest'`
[HashContractPropertyTest.kt](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/src/test/kotlin/learning/kotlininaction/chapter04/equality/HashContractPropertyTest.kt)

### 2. JDK bucket 산술을 재구현해 반증 가능한 모델로

`spread`, power-of-two 마스킹, load factor 성장을 JDK 호출 없이 다시 구현하고, 모델이
관찰 가능한 것 — 실제 `HashSet`의 순회 순서 — 을 예측하게 했습니다. 감싸기만 하면 모델은
정의상 맞고, 맞는 모델은 아무것도 증명하지 못합니다.
측정: 무작위 키 집합에 대한 순회 순서 예측 일치율. **before 모델 없음(측정하지 않음) →
after 500개 집합(resize 전)과 5개 크기(resize 후) 전부 예측 일치, 조회 시 `equals` 호출 0회 확인.**
재현 `./gradlew test --tests '*HashBucketTest'`
[HashBucket.kt](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/src/main/kotlin/learning/kotlininaction/chapter04/equality/HashBucket.kt)

### 3. 계약을 지켜도 느려지는 경우를 측정

계약 위반은 틀린 답을 주지만, 분포가 나쁜 hash는 **맞는 답을 느리게** 줍니다 — 테스트가 전부
통과하는 채로. `hashCode` 분포만 바꾼 키 4종으로 조회 비용을 쟀습니다.
측정: 10,000개 키, 조회 20,000회를 15회 반복한 중앙값(워밍업 6회), 잘 분포된 hash 대비.
**before 측정하지 않음 → after 서로 다른 hash 16개 35.4배, 상수 `hashCode` 667.3배,
상수 `hashCode` + `Comparable` 2.2배.** 재현 `./gradlew bench`
[결과 파일](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/bench/results.md) · [HashBenchmark.kt](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/src/main/kotlin/learning/kotlininaction/chapter04/equality/HashBenchmark.kt)

### 4. treeify 경계에서 `Comparable`의 역할을 숫자로 확인

상수 `hashCode`가 667배인데 같은 hash에 `Comparable`만 더하면 2.2배입니다. 한 버킷이 8개
이상이면 red-black tree가 되지만, **그 트리를 log 시간에 탐색하려면 키가 진짜 순서를 줘야**
합니다. 없으면 tie-break가 삽입 순서만 정해서 양쪽 서브트리를 다 걷습니다.
측정: 3번과 동일 조건, 키 개수 1,000과 10,000 비교. **before 추측(측정하지 않음) →
after 비-`Comparable`은 2262→57547ns로 선형 증가, `Comparable`은 137→186ns로 로그 증가.**
재현 `./gradlew bench`

### 5. 계약 옆의 실패 모드

계약 자체가 아니라 그 주변에서 하루를 잃게 만드는 것들을 테스트로 고정했습니다. 순회 중
구조 변경(`ConcurrentModificationException`)과 안전한 `Iterator.remove`, 구조 변경이 아닌
`Entry.setValue`, null 키(`HashMap`은 하나 허용 / `TreeMap`은 거부), 던지는 `hashCode`,
그리고 `HashMap`이 잃는 키를 `TreeMap`은 찾는 대조입니다.
측정: 실패 경로 테스트 개수. **before 0 → after 5.** 재현 `./gradlew test --tests '*HashFailureModeTest'`
[HashFailureModeTest.kt](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/src/test/kotlin/learning/kotlininaction/chapter04/equality/HashFailureModeTest.kt)

### 6. Chapter 2·5: 예시 단언을 불변식으로

핵심 주장은 아니지만 같은 기준을 적용했습니다. `mix`와 `mixWithoutSubject`는 한 규칙의 독립
구현이므로 49개 순서쌍 전부에서 대조하고, `IntProgression.last`는 무작위 (start, end, step)에
대한 불변식으로 단언합니다. Chapter 5는 `main` 안의 `check()`를 테스트로 꺼냈습니다.
측정: 테스트 수와 coverage. **before Chapter 2 23개(예시 단언)·Chapter 5 0개, line 44.3% →
after Chapter 2 21개(불변식·통합 1개)·Chapter 5 7개, line 93.5%.** 재현 `./gradlew test`

## 계획

- resize 자체의 비용은 아직 재지 않았습니다. 조회만 측정했고, 삽입의 amortized 비용과
  tail latency가 다음 대상입니다.
- treeify/untreeify 임계값(8과 6, 테이블 64)을 문서로만 알고 관찰로 확인하지 않았습니다.
  `HashBucket`을 확장해 예측하게 만들 수 있습니다.
- `ConcurrentHashMap`과의 대조. 계약은 같은데 실패 모드가 다르고, 현재 "동시성을 다루지
  않는다"는 한계를 정면으로 다루는 유일한 방법입니다.

## 링크

- [Kotlin Wiki](https://docs.woonyong.com/wiki/kotlin/) — 개념·출처·학습 순서 (레포는 실행 코드·검사, Wiki는 개념)
- [설계 기록](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/design.md) · [벤치마크 결과](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/bench/results.md)
- [실행 소스](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/src/main/kotlin/learning/kotlininaction/) · [검사](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/src/test/kotlin/learning/kotlininaction/)
- 배포된 데모 URL은 없습니다(로컬 실행 전용).

## 담당

**전체 (개인).** 팀 과제에서 시작한 프로젝트가 아닙니다. 개인 커밋 범위는 `a3c3490`(2026-08-29)
~ 최근이며 `git log --author='woonyong.kr@gmail.com' --oneline`으로 확인합니다.

## 구동방법

[JDK 21](https://adoptium.net/temurin/releases/?version=21)이 필요합니다. 포함된 Gradle
wrapper가 처음 실행할 때 Gradle과 의존성을 내려받습니다.

```sh
git clone https://github.com/woonyong-choi/lrn-kotlin.git && cd lrn-kotlin
./gradlew test                 # 53개 테스트 + coverage 리포트
./gradlew runEqualityAndHashing  # 핵심 주장의 실행 데모
./gradlew bench                # 조회 비용 측정, docs/bench/results.md 갱신
```

나머지 실행 태스크입니다.

```sh
./gradlew tasks --group application   # 실행 가능한 태스크 목록
./gradlew runChapter02Review   # 함수·변수, property, Color·Expr, loop·range·collection, exception
./gradlew run                  # enum과 여러 형태의 when
./gradlew runLabelFlow runRangeProgression runCaptureAndCalls
```

예제를 고쳤다면 해당 테스트만 지정할 수 있습니다.

```sh
./gradlew test --tests '*HashContractPropertyTest'
```

## 스펙

| 항목 | 내용 |
| --- | --- |
| 언어 | Kotlin JVM 2.4.10 (JVM toolchain 21) |
| 런타임·빌드 | JDK 21, Gradle 9.5.0 (wrapper 포함) |
| 라이브러리 | `kotlin("test")` + JUnit Platform, coverage는 JaCoCo. 런타임 의존성 없음 |
| 범위 | Chapter 4의 동등성·hash를 중심으로 깊게. Chapter 2와 Chapter 5의 캡처·SAM·inline은 문법 확인. 책 전체 구현은 아님 |
| 한계 | OpenJDK 21 관찰이며 명세가 아님. 벤치마크는 JMH가 아니라 실행 간 절대값이 최대 2배 변동. 동시성 미포함 ([docs/design.md 6절](https://github.com/woonyong-choi/lrn-kotlin/blob/214fd8d4684d78ae57f1aeea7a7a7bd03e41f93c/docs/design.md)) |

## 검증

[![CI](https://github.com/woonyong-choi/lrn-kotlin/actions/workflows/ci.yml/badge.svg)](https://github.com/woonyong-choi/lrn-kotlin/actions/workflows/ci.yml)

| 테스트 클래스 | 테스트 수 | 검증하는 것 |
| --- | ---: | --- |
| `HashBucketTest` | 10 | bucket 산술 모델이 실제 `HashSet` 순회 순서를 예측 |
| `CaptureAndCallsTest` | 7 | lambda 캡처·공유·inline·receiver (언어 보장만) |
| `RangeProgressionTest` | 6 | range 경계와 `IntProgression.last` 불변식 |
| `HashFailureModeTest` | 5 | 순회 중 변경, null 키, 던지는 `hashCode`, `TreeMap` 대조 |
| `EqualityAndHashingTest` | 5 | 계약 준수·위반·충돌·mutable key |
| `ColorLearningTest` | 5 | `when`의 형태들, 49개 순서쌍 교차 대조 |
| `Chapter02ReviewTest` | 5 | property, smart cast, `in`, 예외 흐름 |
| `HashContractPropertyTest` | 3 | 참조 구현 대조(충분성·필요성·최소 반례) |
| `LabelFlowTest` | 3 | `break@`·`return@`·`this@`의 대상 |
| `EqualityDemoIntegrationTest` | 2 | 핵심 데모 실행 (통합) |
| `Chapter02ReviewIntegrationTest` | 2 | 리뷰 태스크 실행 (통합) |
| **합계** | **53** | **실패 0** |

coverage: line 93.5% (314/336), branch 79.4% (100/126). 벤치마크 하니스는 측정 도구이므로
리포트에서 제외했습니다.

*재현: `./gradlew test` → `build/test-results/test/*.xml`,
`build/reports/jacoco/test/html/index.html`. 실행 태스크 7개(`run`, `runChapter02Review`,
`runLabelFlow`, `runRangeProgression`, `runEqualityAndHashing`, `runCaptureAndCalls`, `bench`)는
모두 종료 코드 0입니다.*

## 참고

- [책 공식 예제](https://github.com/Kotlin/kotlin-in-action-2e) · *Kotlin in Action, Second Edition*
- [OpenJDK 21 `HashMap` 소스](https://github.com/openjdk/jdk21u/blob/master/src/java.base/share/classes/java/util/HashMap.java) — `spread`와 `getNode`의 실제 구현
- [Kotlin equality](https://kotlinlang.org/docs/equality.html) · [range](https://kotlinlang.org/docs/ranges.html) · [return과 label](https://kotlinlang.org/docs/returns.html)
- [Kotlin Wiki](https://docs.woonyong.com/wiki/kotlin/)
