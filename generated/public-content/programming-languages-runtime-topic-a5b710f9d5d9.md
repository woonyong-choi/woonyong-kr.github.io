---
layout: default
title: Runtime
nav_order: 8
permalink: /wiki/programming-languages-runtime-topic-a5b710f9d5d9/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-topic-a5b710f9d5d9
projection_sha256: c11e1377dafb0d1ad37dd73acdaccaecc8312bb2f576e018685e1fa9a95b3b48
parent: Programming
content_status: ready
public_parent_id: Wiki/programming-languages-runtime
search_terms:
- 런타임
---

# Runtime
{: .no_toc }

Runtime은 프로그램 실행에 필요한 기능을 제공한다. 객체를 만들고 회수하는 방식도 그 일부다. 같은 언어라도 구현과 설정에 따라 메모리 관리 방식과 회수 시점이 달라질 수 있다.

## 참조가 남아 있다는 것과 쓸 일이 있다는 것

Tracing GC는 프로그램이 접근할 수 있는 출발점인 Root에서 객체의 참조를 따라간다. Stack·Register·전역 상태 등에 있는 참조가 출발점이 될 수 있으며, 정확한 Root와 참조 종류는 Runtime이 정한다. 순환 참조가 있더라도 Root에서 도달할 수 없다면 회수 후보가 된다.

다음은 객체 관계를 Dict로 표현한 작은 추적 모델이다. A에서 B로 이어지는 경로와 C·D의 순환을 비교한다. 실제 Runtime의 메모리를 회수하는 코드는 아니다.

```run-python
objects = {"A": ["B"], "B": [], "C": ["D"], "D": ["C"]}
roots = ["A"]
reachable = set()
pending = roots.copy()
while pending:
    name = pending.pop()
    if name not in reachable:
        reachable.add(name)
        pending.extend(objects[name])

unreachable = set(objects) - reachable
assert reachable == {"A", "B"} and unreachable == {"C", "D"}
print("reachable:", sorted(reachable))
print("unreachable:", sorted(unreachable))
```

반대로 쓸 일이 끝난 객체를 전역 Cache나 List에서 계속 참조하면 GC는 그 업무상 의도를 알 수 없다. 참조 경로가 남아 있어 회수되지 않는 논리적 누수다. TTL·용량 제한·구독 해제처럼 객체가 더는 필요 없어진 시점에 참조를 끊는 정책이 필요하다.

## 회수 판단을 맡기는 방법

Reference Counting은 객체를 가리키는 참조 수의 변화를 추적한다. 일반적인 방식에서는 참조가 0이 될 때 회수할 수 있지만, 바깥에서 끊어진 순환만으로는 각 참조 수가 0이 되지 않는다. CPython은 참조 수와 순환 탐지를 함께 사용한다. 실제 관찰은 [Python의 객체 회수](/wiki/python/#cpython에서-참조와-순환을-살펴본다)에서 비교한다.

Mark and Sweep은 Root에서 도달한 객체를 표시하고, 표시되지 않은 객체를 회수하는 방식이다. 기본적인 정지형 모델은 추적 중 참조가 바뀌지 않도록 애플리케이션을 멈춘다. Concurrent Collector는 일부 작업을 애플리케이션과 함께 수행하므로 모든 GC가 같은 범위의 Stop-the-World를 요구하지는 않는다. [JVM의 GC](/wiki/programming-languages-runtime-gc-5ef97fb71b3e/)는 수집 방식과 세대, 정지 시간을 구분해 다룬다.

## 객체 회수와 자원 정리는 구분한다

GC가 있어도 파일·Socket·Lock 같은 자원의 사용 완료를 회수 시점에만 맡겨서는 안 된다. 객체가 도달 불가능해지는 시점과 실제 회수, OS에 메모리를 돌려주는 시점도 같지 않을 수 있다. [Python 데이터 모델의 회수와 명시적 파일 종료](https://docs.python.org/3/reference/datamodel.html#objects-values-and-types)

C의 수동 관리에서는 할당·해제의 소유자를 정해 Use After Free와 이중 해제, 누수를 방지한다. 수동 관리에도 할당자의 검색·동기화와 참조 추적 비용이 있으므로 “런타임 비용이 없다”라고 비교하지 않는다. C++의 RAII와 Rust의 소유권·`drop`은 자원 수명을 언어와 타입으로 관리하는 방식이다. Rust의 정적 검사 뒤에도 실제 해제 코드는 실행된다. [Rust의 소유권과 drop](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html)

PintOS의 명시적 정리는 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에서 따라갈 수 있다. 현재 코드는 VM의 SPT·Page Table뿐 아니라 실행 파일, fd Table과 자식 상태도 각각 정리한다. `file_close()`와 `palloc_free_page()`처럼 대상에 맞는 반환 경로를 사용하며, 서로 다른 자원을 모두 `free()` 하나로 처리하지 않는다.

할당 위치의 차이는 [Stack과 Heap](/wiki/computer-systems-network-topic-3521ee6344f1/)에서, C의 할당·해제 책임은 [메모리 관리](/wiki/programming-languages-runtime-topic-a1c0b9893bd1/)에서 이어진다. [동적 메모리 할당](/wiki/computer-systems-network-topic-d160fea60072/)은 단편화와 가용 Block을 찾는 묵시적·명시적 List를 다룬다.
