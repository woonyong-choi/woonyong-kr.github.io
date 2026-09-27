---
layout: default
title: Clue Java 기술 결정
nav_order: 10
permalink: /wiki/k8s-clue-java-architecture-decision/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/java-architecture-decision
projection_sha256: eba99b760b85d1d4345158d37a73534fef5f6e715d6c3d1961bb5d69bee0d790
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue Java 기술 결정
{: .no_toc }

상태: **채택**

## 결정

Clue의 새 구현은 Java를 주 언어로 사용한다. 현재 기준은 Java 25 LTS이며 preview feature는 사용하지 않는다.

- CLI: Java + Picocli + GraalVM Native Image
- Hub: Java 기반 modular monolith
- Agent: 가벼운 Java 프로세스
- Domain: framework-independent pure Java
- Console: TypeScript/React 유지 가능
- Store: PostgreSQL + Flyway + jOOQ

Java 25는 2025년 9월 GA에 도달했고 다수 vendor가 LTS로 제공한다. GraalVM 25도 LTS Native Image를 제공한다.

참고:

- [OpenJDK 25](https://openjdk.org/projects/jdk/25/)
- [GraalVM Native Image](https://www.graalvm.org/jdk25/reference-manual/native-image/)
- [Picocli](https://picocli.info/)

## Java를 선택해도 좋은 이유

내가 Python에서 불편했던 부분은 접근 제어, interface 계약과 타입 강제다. Clue에는 보안 경계, 권한, protocol, rule contract와 상태 전이가 많다. 이 경계는 Java compiler로 검사한다.

- `public`, package-private, `protected`, `private`로 API 표면을 명확하게 제한
- interface와 sealed interface로 허용된 구현과 상태를 표현
- record로 immutable DTO와 Evidence value object 정의
- 강한 타입으로 cluster/resource identity 혼용 방지
- annotation processor와 compiler로 잘못된 wiring 조기 발견
- JUnit, Testcontainers, ArchUnit, Flyway, jOOQ 등 운영용 생태계
- C#·C++ 경험과 가까운 명시적인 구조

Python도 객체지향과 Protocol/ABC를 지원하지만 접근 제한은 관례에 가깝고 많은 오류가 runtime에 발견된다. 팀의 주 개발자가 그 방식 때문에 지속적으로 불편하다면 생산성과 설계 확신도 중요한 선택 기준이다.

## 감수할 비용

| 항목 | 위험 | 대응 |
|---|---|---|
| CLI 시작 속도와 JVM 설치 | 일반 JVM CLI는 첫 경험이 무거움 | GraalVM native executable 배포 |
| Agent memory | Go보다 높은 baseline 가능 | Spring 없이 최소 runtime, resource limit과 측정 |
| Native Image 호환성 | reflection, proxy, resource 설정 필요 | Picocli codegen, native test, 라이브러리 선별 |
| Java식 과설계 | interface·factory·layer가 불필요하게 증가 | interface는 외부 경계에만, vertical slice 우선 |
| 빌드 시간 | native build가 느림 | 일반 JVM test와 release native build 분리 |
| 기존 Python 코드 재사용 | 직접 import 불가 | 계약·fixture·행동을 이전하고 줄 단위 port는 금지 |

## Python, Java, Go 비교

| 기준 | Python | Java | Go |
|---|---|---|---|
| 빠른 실험 | 매우 좋음 | 보통 | 좋음 |
| 접근 제어·타입 모델 | 약함 | 매우 좋음 | 단순하지만 제한적 |
| 대규모 도메인 구조 | 가능 | 매우 좋음 | 가능 |
| 단일 CLI 바이너리 | 별도 packaging 필요 | Native Image 필요 | 기본적으로 매우 좋음 |
| Agent footprint | 보통 | JVM은 불리, native로 개선 | 매우 좋음 |
| AI 라이브러리 | 매우 좋음 | 충분함 | 보통 |
| 개발자 선호와 경험 | 현재 불편 | C#/C++ 경험과 가까움 | 새 스타일 학습 필요 |

Clue의 AI는 핵심 추론 엔진이 아니라 adapter이므로 Python 생태계의 이점이 결정적이지 않다. 반대로 Evidence, policy, remediation과 lifecycle을 안전하게 모델링하는 것이 핵심이므로 Java 선택이 합리적이다.

## 구현 규칙

### 모델링

```java
public record ResourceIdentity(
    ClusterId clusterId,
    String namespace,
    String kind,
    String name,
    String uid
) {}

public sealed interface Finding permits ConfirmedFinding, HypothesisFinding {}
```

- `String` 하나로 cluster ID, namespace, rule ID를 모두 표현하지 않고 작은 value type 사용
- Evidence와 Finding은 가능한 한 immutable
- 상태 전이는 method와 domain service를 통해서만 수행
- nullable 대신 명시적인 Optional 또는 결과 타입을 경계에서 사용

### 인터페이스

다음 경계에는 interface가 적합하다.

- Kubernetes evidence source
- Incident repository
- Analyzer
- SCM provider
- AI provider
- notification provider
- clock과 ID generator

단 하나의 내부 구현만 있고 교체·테스트 경계도 아닌 클래스에는 습관적으로 interface를 만들지 않는다.

### 패키지 접근

- 외부에 공개할 필요가 없는 구현은 package-private
- module API만 `public`
- 생성자를 무조건 public으로 열지 않고 factory를 통해 불변 조건 강제
- Java module 또는 ArchUnit rule로 domain의 framework 의존을 금지

## 선택한 스택

- Build: Maven multi-module
- CLI: Picocli
- Kubernetes: Fabric8 Kubernetes Client를 먼저 spike하고 Native Image 호환성 검증
- HTTP: Hub는 현재 지원되는 Spring Boot 또는 Quarkus를 작은 proof로 비교한 후 선택
- Persistence: PostgreSQL, Flyway, jOOQ
- Test: JUnit 5, AssertJ, Testcontainers, ArchUnit, WireMock
- Serialization: Jackson JSON, protocol compatibility test
- Observability: OpenTelemetry, Prometheus endpoint는 optional export
- Packaging: JAR/container for Hub, minimal container 또는 native for Agent, native binary for CLI

framework 선택은 첫 vertical slice에서 JVM image와 native image를 모두 만들어 memory, startup, reflection configuration을 측정한 뒤 확정한다. framework를 먼저 선택하고 domain을 거기에 맞추지 않는다.

## Go로 CLI를 분리할지

현재 결정은 **Java 한 언어로 먼저 시도**하는 것이다. Picocli와 Native Image로 설치 경험을 충족할 수 있기 때문이다.

다음 조건을 동시에 만족하지 못할 때만 별도 ADR로 Go CLI를 검토한다.

- 실행 파일 하나로 배포
- JVM 설치 불필요
- 허용한 startup과 memory budget 충족
- macOS/Linux 네 아키텍처 release 자동화
- Kubernetes client의 핵심 기능이 native에서 안정적으로 동작

처음부터 Java와 Go를 함께 도입하면 protocol, build, contribution 비용이 증가하므로 측정 전 분리는 하지 않는다.

## 결론

Java 전환에 찬성한다. 다만 기존 Python 시스템을 Java 문법으로 그대로 복사하지 않는다. Clue의 첫 Java 구현은 `clue diagnose` vertical slice로 시작하고, 언어 선택이 설치 경험을 해치지 않는다는 것을 Native Image와 Homebrew로 먼저 증명한다.
