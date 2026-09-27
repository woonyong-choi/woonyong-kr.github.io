---
layout: default
title: Clue Java와 Python 비교
nav_order: 12
permalink: /wiki/k8s-clue-java-vs-python/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/java-vs-python
projection_sha256: ec202e917dabba8d1013a2383f1e47c3b2f9e28a86d45570127d709b8abe91fd
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue Java와 Python 비교
{: .no_toc }

## 먼저 바로잡을 점

Python에 객체지향이 없는 것은 아니다. class, 상속, 추상 클래스, protocol, property, dataclass와 다형성을 모두 지원한다. 차이는 `기능의 존재 여부`보다 `언어와 컴파일러가 경계를 얼마나 강제로 지켜 주는가`에 있다.

- Python: 개발자 관례와 정적 분석 도구를 신뢰하는 동적 언어
- Java: 컴파일러가 타입과 접근 경계를 강제하는 정적 언어

C#이나 C++의 명시적 경계에 익숙하다면 Python의 유연성이 편리함보다 불안함으로 느껴질 수 있다.

## 1. 접근 제어

### Python

```python
class IncidentService:
    def __init__(self, repository):
        self._repository = repository

    def diagnose(self, evidence):
        return self._evaluate(evidence)

    def _evaluate(self, evidence):
        return self._repository.find(evidence)
```

`_repository`와 `_evaluate()`는 내부용이라는 관례일 뿐 외부 코드가 접근할 수 있다.

```python
service._repository = FakeRepository()
service._evaluate(evidence)
```

`__name`은 완전한 private가 아니라 name mangling이다. `_ClassName__name` 형태로 접근할 수 있고, 상속 시 이름 충돌을 피하는 것이 주목적이다.

### Java

```java
public final class IncidentService {
    private final IncidentRepository repository;

    public IncidentService(IncidentRepository repository) {
        this.repository = repository;
    }

    public Finding diagnose(EvidenceBundle evidence) {
        return evaluate(evidence);
    }

    private Finding evaluate(EvidenceBundle evidence) {
        return repository.find(evidence);
    }
}
```

외부 코드가 `repository`나 `evaluate()`에 접근하면 컴파일되지 않는다.

Java 접근 수준:

| 수준 | 의미 |
|---|---|
| `public` | 모든 package에서 접근 가능 |
| `protected` | 같은 package와 subclass에서 접근 가능 |
| package-private | 접근 지정자를 쓰지 않으며 같은 package만 가능 |
| `private` | 선언한 class 내부만 가능 |

이 차이가 내가 Java를 선택한 직접적인 이유다. `private`는 코드 구조의 경계다. reflection이나 프로세스 권한을 막는 보안 sandbox는 아니다.

## 2. Interface와 구현 계약

### Python ABC

```python
from abc import ABC, abstractmethod

class Analyzer(ABC):
    @abstractmethod
    def analyze(self, evidence):
        raise NotImplementedError
```

ABC를 상속한 class가 method를 구현하지 않으면 인스턴스 생성 시 오류가 난다. 하지만 Python에서는 ABC를 상속하지 않은 객체도 같은 method만 가지고 있으면 사용할 수 있다.

### Python Protocol

```python
from typing import Protocol

class Analyzer(Protocol):
    def analyze(self, evidence: "EvidenceBundle") -> "Finding": ...
```

Protocol은 구조적 typing을 제공한다. mypy나 pyright를 실행하면 계약 위반을 찾을 수 있지만 Python 실행 자체가 항상 이를 강제하지는 않는다.

### Java interface

```java
public interface Analyzer {
    AnalyzerId id();
    Finding analyze(EvidenceBundle evidence);
}

public final class ImagePullAnalyzer implements Analyzer {
    @Override
    public AnalyzerId id() {
        return new AnalyzerId("CLUE-IMAGE-001");
    }

    @Override
    public Finding analyze(EvidenceBundle evidence) {
        // deterministic rule
    }
}
```

method signature가 다르거나 구현하지 않으면 build가 실패한다. Analyzer SDK처럼 외부 기여자가 구현할 안정된 계약에는 Java interface가 매우 잘 맞는다.

## 3. 타입 검사 시점

### Python

```python
def load_incident(incident_id: str) -> Incident:
    ...

load_incident(123)
```

type hint는 문서와 정적 분석 정보다. 별도의 mypy/pyright 검사를 강제하지 않으면 실행 시점까지 문제가 드러나지 않을 수 있다.

### Java

```java
Incident loadIncident(IncidentId incidentId) { ... }

loadIncident(123); // compile error
```

Clue에서는 `ClusterId`, `ResourceUid`, `IncidentId`, `RuleId`를 서로 바꿔 쓰면 안 된다. Java의 작은 value type을 사용하면 같은 문자열이라는 이유로 잘못 섞이는 실수를 컴파일 시점에 막을 수 있다.

```java
public record ClusterId(String value) {}
public record IncidentId(UUID value) {}
public record RuleId(String value) {}
```

## 4. 불변 데이터 모델

### Python dataclass

```python
@dataclass(frozen=True)
class ResourceIdentity:
    cluster_id: str
    namespace: str
    kind: str
    name: str
    uid: str
```

간결하고 충분히 좋은 표현이다. 다만 type hint의 강제 수준은 도구 설정에 달려 있다.

### Java record

```java
public record ResourceIdentity(
    ClusterId clusterId,
    Namespace namespace,
    ResourceKind kind,
    ResourceName name,
    ResourceUid uid
) {
    public ResourceIdentity {
        Objects.requireNonNull(clusterId);
        Objects.requireNonNull(uid);
    }
}
```

record는 field, constructor, accessor, equality와 hash code를 제공한다. compact constructor에서 불변 조건도 강제할 수 있어 Evidence identity에 적합하다.

## 5. 허용된 상태 표현

Clue의 Finding은 확정된 규칙 판단과 AI 가설을 구분해야 한다.

### Python

Union과 match를 사용할 수 있지만 exhaustiveness는 정적 분석 설정에 의존한다.

```python
Finding = ConfirmedFinding | HypothesisFinding
```

### Java

```java
public sealed interface Finding
    permits ConfirmedFinding, HypothesisFinding, InsufficientEvidence {}
```

sealed interface를 사용하면 허용된 구현을 제한할 수 있다. 새로운 상태를 추가했을 때 switch의 누락을 컴파일러가 찾도록 설계할 수 있다.

## 6. 상속과 조합

| 항목 | Python | Java |
|---|---|---|
| class 상속 | 다중 상속 가능 | class는 단일 상속 |
| interface 역할 | ABC, Protocol, duck typing | 여러 interface 구현 가능 |
| mixin | 자주 사용 | default method 또는 composition |
| method dispatch | runtime에 유연 | compile-time 계약이 강함 |
| meta programming | decorator, metaclass가 강력 | annotation과 processor 중심 |

Clue에는 깊은 class hierarchy보다 composition이 적합하다.

```text
EvidenceCollector + Normalizer + Analyzer + Renderer
```

Java로 옮긴다고 모든 개념을 abstract class와 factory로 만들 필요는 없다. 외부 경계에는 interface를 사용하고 내부 로직은 작은 final class와 record로 유지한다.

## 7. 오류 처리

### Python

- 모든 exception이 사실상 unchecked
- 빠르게 작성할 수 있지만 호출자가 어떤 실패를 처리해야 하는지 signature에서 약함
- dictionary 기반 오류가 쉽게 퍼질 수 있음

### Java

- checked exception과 unchecked exception이 모두 존재
- 모든 오류를 checked exception으로 만들면 코드가 무거워질 수 있음
- Clue domain에서는 exception 남용보다 명시적인 result type이 적합

```java
public sealed interface DiagnosisResult
    permits Diagnosed, InsufficientEvidence, AccessDenied, CollectionFailed {}
```

사용자 오류, 권한 부족, Evidence 부족과 시스템 장애를 서로 다른 결과로 표현할 수 있다.

## 8. 동시성과 장기 실행 프로세스

### Python

- I/O 작업에는 `asyncio`가 효과적
- async function과 library가 전체 call chain에 영향을 줌
- 전통적인 CPython에서는 GIL 때문에 CPU-bound thread 병렬화에 제약이 있어 multiprocessing이나 별도 worker를 사용하기도 함
- 개발 속도는 빠르지만 sync/async 구현이 섞이면 복잡해질 수 있음

### Java

- thread와 executor 생태계가 성숙
- virtual thread를 사용하면 Agent의 여러 watch 연결과 Hub의 I/O 요청을 비교적 직관적인 blocking 코드로 표현 가능
- CPU-bound Analyzer도 thread pool로 명시적으로 제한 가능
- JVM의 JIT는 오래 실행되는 Hub에서 높은 처리 성능을 낼 수 있음

Clue Hub와 Agent처럼 오래 실행되며 다수 cluster 연결을 처리하는 프로세스에는 Java의 동시성 모델이 잘 맞는다.

## 9. 실행 성능과 메모리

성능은 언어 이름보다 workload, library와 packaging 방식에 크게 좌우된다.

| 관점 | Python | Java JVM | Java Native Image |
|---|---|---|---|
| 시작 속도 | 대체로 빠름 | 상대적으로 느림 | 매우 빠름 |
| 장기 처리 성능 | 보통 | JIT 최적화로 좋음 | 빠르지만 JVM JIT와 특성이 다름 |
| 메모리 | interpreter와 dependency 영향 | 기본 JVM overhead가 큼 | 상대적으로 작음 |
| 배포 | interpreter/venv 또는 번들 필요 | JRE 또는 runtime image 필요 | 단일 실행 파일 가능 |
| reflection | 자유로움 | 자유로움 | build-time metadata 필요 |

CLI에서는 startup과 배포가 중요하므로 Java Native Image가 적합하다. Hub는 장기 실행되므로 일반 JVM container가 더 단순하고 성능상 유리할 수 있다. Agent는 JVM과 Native Image를 실제 측정해 선택한다.

## 10. 패키징과 설치

### Python 선택 시

```text
wheel + Python runtime
uv/pipx
PyInstaller/Nuitka standalone bundle
```

장점은 구현과 반복 속도다. 단점은 Python version, native dependency와 standalone packaging 검증 범위다.

### Java 선택 시

```text
Hub: executable JAR 또는 container image
Agent: JAR/container 또는 native image
CLI: GraalVM native executable
```

Homebrew는 release archive의 `clue` 바이너리와 SHA-256만 설치하면 된다. 사용자의 컴퓨터에 Java를 요구하지 않을 수 있다.

## 11. 프레임워크와 의존성

Python의 FastAPI, SQLAlchemy와 Pydantic은 빠른 API 개발에 강하다. Java의 Spring Boot, Quarkus, jOOQ, Flyway와 Testcontainers는 명시적인 장기 운영 구조에 강하다.

Clue에서는 다음 선택이 적합하다.

- domain: framework 없는 Java
- CLI: Picocli
- Kubernetes: Fabric8 client를 Native Image spike로 먼저 검증
- Hub API: 작은 Spring Boot/Quarkus 비교 구현 후 선택
- persistence: Flyway + jOOQ
- test: JUnit 5 + Testcontainers + ArchUnit

JPA entity를 domain model로 그대로 사용하지 않는다. DB lifecycle과 Incident domain lifecycle이 섞이면 접근 제어가 있어도 구조가 다시 흐려진다.

## 12. 개발 속도와 유지보수

### Python이 유리한 경우

- 아이디어를 며칠 안에 검증
- data science나 모델 학습이 핵심
- 작은 script와 내부 자동화
- 팀이 Python type checking과 packaging을 이미 표준화

### Java가 유리한 경우

- 수년간 유지할 서버와 Agent
- 여러 사람이 공유하는 명확한 public API
- 복잡한 상태 전이와 권한 경계
- compile-time refactoring 안정성이 중요
- 개발자가 Java/C#/C++의 명시적 모델에 더 생산적

Clue는 두 번째 조건에 더 가깝다.

## 13. Clue 구성요소별 판단

| 구성요소 | Python | Java 판단 |
|---|---|---|
| `clue diagnose` CLI | 빠르게 만들 수 있지만 standalone packaging 필요 | Picocli + Native Image가 성공하면 적합 |
| Clue Agent | 구현은 쉬우나 async/watch 구조와 packaging 관리 필요 | 장기 연결과 타입 계약에 유리, memory 측정 필요 |
| Clue Hub | FastAPI로 빠른 개발 가능 | domain, 권한, lifecycle이 커질수록 Java가 유리 |
| Analyzer SDK | Protocol/ABC로 가능 | compile-time interface와 artifact versioning이 유리 |
| AI adapter | Python 생태계가 우세 | HTTP/MCP adapter 중심이면 Java로 충분 |
| React Console | 언어 선택과 무관 | TypeScript 유지 |

## 14. 내가 Python에서 불편했던 점

`Python에 private가 없어서 불편하다`는 이유 하나만으로 모든 프로젝트를 Java로 바꿀 필요는 없다. 그러나 다음이 함께 나타난다면 전환 이유가 충분하다.

- 내부 API와 공개 API를 언어 수준에서 구분하고 싶음
- interface 구현 누락을 build에서 발견하고 싶음
- refactoring 때 호출부 전체를 compiler로 확인하고 싶음
- 문자열 중심 모델보다 강한 domain type을 원함
- C#·C++식 명시성을 사용할 때 사고가 더 편함
- 앞으로 Rule Pack SDK와 여러 모듈을 운영할 계획임

이 조건들은 Clue에 실제로 해당한다. 따라서 Java 선택은 단순 취향이 아니라 제품의 안전 계약과 개발자의 지속 가능한 생산성에 맞는 결정이다.

## 최종 권고

1. 새 Clue 구현은 Java로 시작한다.
2. 기존 Python 코드를 그대로 번역하지 않고 behavior fixture를 이전한다.
3. 첫 vertical slice는 `clue diagnose`와 ImagePullBackOff 하나다.
4. CLI는 Native Image로 만들어 Homebrew 설치 경험을 먼저 검증한다.
5. Hub는 JVM container, Agent는 측정 후 JVM/native를 선택한다.
6. interface는 port와 plugin 경계에만 사용하고 Java식 과설계를 피한다.
7. native Kubernetes client가 release 기준을 충족하지 못할 때만 Go CLI 분리를 다시 판단한다.

Clue는 Java로 구현한다. 접근 제어, interface 계약, Incident 상태, 보안 경계, Analyzer SDK와 장기 실행 process를 compile 시점에 검사한다.
