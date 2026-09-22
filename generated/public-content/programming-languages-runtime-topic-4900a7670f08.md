---
layout: default
title: 경쟁 상태
nav_order: 4
permalink: /wiki/programming-languages-runtime-topic-4900a7670f08/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-topic-4900a7670f08
projection_sha256: b995a42959ff8f27de11bdfc530ef5273cf5de8e224d37678d7a8c7c0dbe63d5
parent: 동시성
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/concurrency
search_terms:
- Race Condition
- Data Race
- Lost Update
- Check Then Act
- Happens Before
- Undefined Behavior
grand_parent: Programming
---

# 경쟁 상태
{: .no_toc }

경쟁 상태는 여러 작업의 실행 순서에 따라 프로그램이 지켜야 할 조건이 깨지는 상황이다. 같은 값을 함께 쓰는지뿐 아니라, 어떤 판단과 갱신이 하나의 단위로 보호되어야 하는지 살펴봐야 한다.

## 읽은 값으로 갱신하기까지

공유 Counter가 0일 때 A와 B가 각각 값을 읽고 1을 더해 저장한다고 하자. A가 0을 읽은 뒤 B도 0을 읽으면, 둘 다 1을 저장할 수 있다. 두 번 증가시켰는데 최종 값은 1이 된다. 이를 Lost Update라고 부른다.

아래 예제는 Thread를 실제로 경쟁시키지 않고 읽기와 쓰기 순서를 직접 나열한다. 실행 환경이나 Python의 GIL에 결과를 맡기지 않고, 어느 단계에서 정보가 사라지는지 확인하기 위한 모델이다.

```run-python
def run(schedule):
    shared = 0
    registers = {}
    trace = []
    for thread, operation in schedule:
        if operation == "read":
            registers[thread] = shared
        elif operation == "write":
            shared = registers[thread] + 1
        else:
            raise ValueError(operation)
        trace.append(f"{thread}.{operation}:{shared}")
    return shared, " -> ".join(trace)


interleaved = [("A", "read"), ("B", "read"), ("A", "write"), ("B", "write")]
serialized = [("A", "read"), ("A", "write"), ("B", "read"), ("B", "write")]
for name, schedule in [("interleaved", interleaved), ("serialized", serialized)]:
    value, trace = run(schedule)
    print(f"{name}: {value}")
    print(trace)

stock = 1
a_may_buy = stock > 0  # An individually atomic read does not reserve the item.
b_may_buy = stock > 0
if a_may_buy:
    stock -= 1
if b_may_buy:
    stock -= 1
print("separate check and update: stock=", stock, sep="")
```

실행 결과:

```text
interleaved: 1
A.read:0 -> B.read:0 -> A.write:1 -> B.write:1
serialized: 2
A.read:0 -> A.write:1 -> B.read:1 -> B.write:2
separate check and update: stock=-1
```

첫 실행은 두 Thread가 같은 옛 값을 읽는다. 두 번째 실행은 A의 읽기·갱신을 끝낸 뒤 B가 시작하므로 결과가 2다. 순서를 바꿔 보면 “쓰기를 한 번에 한다”는 조건만으로는 읽기에서 시작한 전체 갱신을 보호하지 못한다는 것을 알 수 있다.

마지막 재고 예제에서는 A와 B가 각각 `stock > 0`을 확인한 뒤 감소시킨다. 각 읽기와 감소가 따로 원자적이어도, 확인과 소비 사이를 다른 작업이 지나갈 수 있으면 재고가 음수가 된다. 이 경우에는 조건 확인과 상태 변경을 함께 보호하거나, 실패를 재검사하는 원자적 갱신 프로토콜이 필요하다.

## Data Race와 논리적인 경쟁을 구분하기

C에서 일반 변수의 `counter++`를 여러 Thread가 동기화 없이 수행하는 경우를 “결과가 1이나 2 중 하나다”로 설명하면 충분하지 않다. [C11 초안 N1570의 §5.1.2.4](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)는 서로 다른 Thread의 충돌하는 접근 중 적어도 하나가 비원자적이고, 서로 Happens-before 관계로 정렬되지 않은 Data Race를 Undefined Behavior로 규정한다.

앞의 읽기·쓰기 모델은 Lost Update를 설명할 뿐, Data Race가 있는 C 프로그램이 낼 수 있는 결과를 제한하지 않는다. `counter++`가 반드시 세 개의 기계어 명령으로 번역된다는 보장도 없다. Compiler와 Target에 따라 하나의 메모리 Read-Modify-Write 명령이 될 수 있지만, 그것만으로 Thread 사이의 원자성과 동기화가 보장되는 것은 아니다.

반대로 개별 접근이 모두 원자적이라 Data Race가 없더라도, 앞의 재고처럼 여러 연산에 걸친 논리적 경쟁은 남을 수 있다. 따라서 Race Condition과 언어 메모리 모델의 Data Race를 같은 뜻으로만 사용하지 않는다.

## 무엇을 함께 보호해야 하는가

[Mutex](/wiki/computer-systems-network-topic-6295090885b6/)는 읽기·판단·갱신의 범위를 묶을 수 있다. 같은 불변식에 참여하는 모든 접근이 동일한 규칙을 따라야 한다. `volatile`은 이를 대신하지 않으며, 원자 연산 하나도 여러 자료구조 사이의 불변식을 자동으로 지켜 주지 않는다.

PintOS처럼 단일 CPU에서 Interrupt와 일반 Thread가 같은 List를 다룰 때는 짧고 잠들지 않는 구간의 Interrupt 비활성화가 보호 수단이 될 수 있다. 다만 Interrupt를 꺼도 명시적인 Block이나 Yield까지 금지되지는 않는다. SMP에서 다른 CPU의 접근을 막는 데도 이것만으로는 부족하다. 실행 문맥과 대기 가능성은 [동기화](/wiki/computer-systems-network-topic-cd8cd4ad9254/)에서 함께 구분한다.

Spinlock, 원자적 Counter, 소유권을 한 Thread로 제한하는 설계는 각각 다른 범위를 보호한다. RCU 역시 읽기 경로와 객체 수명을 다루는 프로토콜이지 모든 쓰기 경쟁을 없애는 범용 대체물이 아니다. 보호할 조건을 먼저 정하고, 자료구조와 실행 문맥에 맞는 방식을 선택한다.

## 재현되지 않는다고 사라진 것은 아니다

잘못된 실행 순서가 드물면 반복 실행에서도 문제가 보이지 않을 수 있다. 로그를 넣거나 Debugger로 멈추는 행동 자체가 순서를 바꿀 수도 있다. 정상 출력 몇 번을 안전성의 증명으로 삼지 않는다.

먼저 공유 상태를 읽는 위치와 바꾸는 위치를 찾고, 그 사이에 다른 작업이 끼어들어도 불변식이 유지되는지 확인한다. 가능한 순서를 작은 모델로 만들어 경계를 시험한 뒤, 실제 환경의 동기화 규칙과 실행 증거를 별도로 확인한다. 위 예제의 결정적인 출력은 이 모델의 실행 결과이며 실제 Kernel이나 다중 CPU에서 오류를 재현한 기록은 아니다.
