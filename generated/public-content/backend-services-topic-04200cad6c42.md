---
layout: default
title: Refactoring
nav_order: 10
permalink: /wiki/backend-services-topic-04200cad6c42/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-topic-04200cad6c42
projection_sha256: b5d188bf54f67dfc5e03f4d07d498b97001a29207e0217ff53da48f9f1894f59
parent: 소프트웨어 설계
content_status: ready
public_parent_id: Wiki/backend-services/software-design
search_terms:
- 리팩터링
grand_parent: Programming
---

# Refactoring
{: .no_toc }

Refactoring은 외부에서 관찰하는 동작을 유지하면서 코드의 내부 구조를 바꾸는 작업이다. 목적은 다음 변경을 더 쉽게 만드는 것이다. 기능 추가나 버그 수정과 함께 필요할 수 있지만, 어떤 단계에서 동작을 보존했고 어떤 단계에서 요구사항을 바꿨는지는 구분한다. [Martin Fowler의 Refactoring 설명](https://refactoring.com/)

## 보존할 동작부터 정한다

반환값만 같으면 충분한지 먼저 확인한다. 예외의 종류와 메시지, 출력 순서, 입력 객체의 변경, 파일·DB 쓰기 같은 부수 효과도 사용자가 관찰할 수 있다. 공개 API나 Serialization 형식, 외부 Protocol을 바꾸는 작업이라면 호출자와 호환성 범위도 확인해야 한다.

현재 동작을 테스트로 확인한 뒤 작은 변환 하나를 적용하고 다시 검사한다. 마지막에는 관련 테스트와 diff를 함께 본다. 기존 테스트가 이미 실패한다면 그 원인을 변경으로 생긴 실패와 구분해야 한다. 요구 동작이 불명확하거나 위험한 경로의 검증 수단이 없다면 먼저 그 부분을 확인한다. 다른 사람이 수정한 같은 코드도 변경 의도를 파악한 뒤 다룬다.

다음 예제는 유효한 입력을 정수 초 값의 List로 한정한다. 표시 문자열을 만드는 함수에서 합계 계산을 분리한다. 별도의 성능 개선이나 잘못된 입력 처리 변경은 포함하지 않는다.

```run-python
def report_before(seconds):
    total = 0
    for value in seconds:
        total += value
    return f"count={len(seconds)}, total={total}s"

def total_seconds(seconds):
    total = 0
    for value in seconds:
        total += value
    return total

def report_after(seconds):
    return f"count={len(seconds)}, total={total_seconds(seconds)}s"

cases = [
    ([], "count=0, total=0s"),
    ([0], "count=1, total=0s"),
    ([10, 20, 10], "count=3, total=40s"),
]
for seconds, expected in cases:
    snapshot = seconds.copy()
    before = report_before(seconds)
    after = report_after(seconds)
    assert before == after == expected
    assert seconds == snapshot
    print(after)
```

빈 입력과 0, 중복 값을 포함한 입력에서 문자열과 입력 보존을 확인한다. 몇 가지 테스트가 모든 입력의 동등성을 증명하지는 않는다. 이 변환에서는 기존 합산 순서와 출력 형식을 유지했는지도 diff로 확인할 수 있다. 함수로 분리한 계산에 이름을 붙일 가치가 없다면 원래의 짧은 함수를 유지해도 된다.

## Code Smell을 변경 이유와 연결한다

Smell은 조사할 위치를 가리키는 신호다. 짧게 만들거나 Class를 늘리는 것 자체를 목표로 삼지 않는다.

| 신호 | 확인할 문제 | 가능한 변화와 반례 |
|---|---|---|
| Mysterious Name | 역할·단위·범위를 읽을 수 있는가? | 이름을 바꾸되, 문맥이 분명한 짧은 index까지 길게 만들지는 않는다. |
| Duplicated Code | 같은 규칙이 같은 이유로 함께 바뀌는가? | 같은 지식을 합친다. 모양만 같은 서로 다른 규칙은 따로 둘 수 있다. |
| Long Function | 책임과 추상화 수준이 여러 번 바뀌는가? | 의미 있는 계산을 분리한다. 선형 흐름을 잘게 나누면 오히려 읽기 어려울 수 있다. |
| Long Parameter List | 함께 움직이는 값과 불변조건이 있는가? | Parameter Object를 검토한다. 필요한 의존성을 명시한 인자까지 숨기지 않는다. |
| Mutable·Global Data | 누가 언제 바꾸는지 추적되는가? | 변경 범위를 줄인다. 격리된 Buffer처럼 가변 상태가 적합한 경우도 있다. |
| Divergent·Shotgun Change | 변경 이유와 수정 위치가 어긋나는가? | 책임을 옮기거나 나눈다. 작고 안정적인 모듈을 추측만으로 분할하지 않는다. |
| Feature Envy | 다른 객체의 데이터를 지나치게 알아야 하는가? | 동작을 데이터 가까이 옮긴다. 여러 객체를 조정하는 책임인지도 살핀다. |
| Repeated Switches | 같은 종류의 분기를 여러 곳에서 수정하는가? | 다형성을 검토한다. 한 번뿐인 단순 분기에는 과할 수 있다. |
| Message Chains | 호출자가 내부 연결 구조에 의존하는가? | 경계를 감추는 메서드를 검토한다. 의도된 Fluent API와 구분한다. |

## 값과 변경 책임을 함께 옮긴다

다시 계산할 수 있는 파생값을 중복 저장하면 서로 다른 값으로 어긋날 수 있다. 계산 비용과 일관성 요구를 비교해 조회 시 계산할지 결정한다. 통화·기간·주소처럼 함께 지켜야 할 규칙이 있으면 Value Object의 후보가 된다. 같은 실체의 최신 상태를 여러 곳에서 공유해야 한다면 Entity의 식별성과 참조가 필요할 수 있다. 항상 함께 전달되는 값은 Parameter Object로 묶을 수 있지만 단지 인자 개수를 줄이기 위한 묶음은 목적이 약하다.

Python의 `dataclass(frozen=True)`는 필드 재대입을 제한해도 필드가 가리키는 List까지 불변으로 만들지는 않는다. 동적 import나 문자열로 찾는 속성은 이름 변경 도구가 모두 추적하지 못할 수 있어 실행 경로를 확인한다. Java에서는 record나 캡슐화한 Collection을 쓰더라도 내부 가변 객체와 Reflection·Annotation·직렬화·Binary Compatibility를 따로 살핀다. Kotlin의 `val`, `data class`, `sealed class`와 `when`도 용도에 맞춰 사용하며 read-only `List`를 깊은 불변 객체와 혼동하지 않는다. [Python의 frozen 인스턴스](https://docs.python.org/3/library/dataclasses.html#frozen-instances), [Kotlin Collection의 인터페이스](https://kotlinlang.org/docs/collections-overview.html)

리뷰에는 보존한 동작, 변경이 필요했던 위치와 이유, 선택한 작은 변환, 테스트·diff 결과를 남긴다. 검증하지 못한 경계가 있으면 확인한 부분과 구별해 적는다.
