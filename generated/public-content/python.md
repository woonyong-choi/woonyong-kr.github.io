---
layout: default
title: Python
nav_order: 4
permalink: /wiki/python/
publication_state: publish
has_toc: true
projection_id: Wiki/programming-languages-runtime/python
projection_sha256: f23102b6559631f049ad2869eebd46988163afeda0f2accb213aca44e37d83a5
parent: 프로그래밍 언어
content_status: ready
public_parent_id: Wiki/keywords/programming-languages-runtime-topic-91f4e521b7e6
grand_parent: Programming
---

# Python
{: .no_toc }

Python에서는 이름이 객체를 가리킨다. 객체의 값과 그 객체에 연결된 이름을 구분하면, 함수 호출 뒤 어떤 변경이 남는지와 객체가 언제 회수될 수 있는지를 함께 이해할 수 있다.

## 이름, 값과 객체의 동일성

`b = a`는 보통 객체를 복제하는 표현이 아니다. 두 이름이 같은 객체를 가리킨다. `b`에 다른 값을 대입하면 바뀌는 것은 그 이름의 연결이다. `is`는 같은 객체인지 비교하고 `id()`는 동일성을 나타내는 정수를 돌려준다. CPython에서는 주소를 사용하지만 이를 모든 Python 구현의 물리 주소라고 가정하지 않는다. 객체가 사라진 뒤 같은 ID가 다시 쓰일 수도 있다.

숫자·문자열·Tuple은 Immutable이고 List·Dict·Set은 Mutable이다. Tuple 안에 List가 들어 있으면 그 List의 내용은 바뀔 수 있다. Tuple이 고정하는 것은 담긴 객체들의 연결이며, 안의 객체까지 모두 불변으로 만드는 것은 아니다. 사용자 정의 객체의 변경 가능성은 그 타입의 설계에 따라 살펴야 한다. [Python 객체의 동일성과 변경 가능성](https://docs.python.org/3/reference/datamodel.html#objects-values-and-types)

이 구분을 함수 호출에 적용한 예제는 [함수](/wiki/programming-languages-runtime-topic-42b4dbf4dfb9/)에서, 새 Container를 만드는 복사의 범위는 [기본 문법의 복사](/wiki/programming-languages-runtime-topic-ced5bd855b7b/#복사본에서-무엇을-바꿨는가)에서 다룬다.

## CPython에서 참조와 순환을 살펴본다

CPython은 참조 수 관리에 순환 참조 탐지를 더한다. `gc.disable()`은 자동 순환 수집을 멈추는 기능이며 참조 수 관리를 끄는 것은 아니다. `gc.collect()`는 명시적으로 수집을 요청한다. 반환하는 전체 객체 수가 방금 만든 객체 수와 정확히 같으리라고 가정하지 않는다. [gc 인터페이스](https://docs.python.org/3/library/gc.html)

다음 예제는 별칭을 추가·삭제할 때의 참조 수 변화와 바깥에서 끊어진 순환을 비교한다. 자동 순환 수집을 잠깐 멈추고 명시적 수집을 요청하며, 마지막에는 원래 설정을 복구한다. Weak Reference는 관찰할 객체를 살아 있게 붙잡지 않는다.

```run-python
import gc
import sys
import weakref


class Node:
    def __init__(self):
        self.ref = None


item = Node()
before = sys.getrefcount(item)
alias = item
added = sys.getrefcount(item) - before
del alias
restored = sys.getrefcount(item) == before
assert added == 1 and restored
print("reference added:", added, "restored:", restored)
del item

was_enabled = gc.isenabled()
gc.disable()
try:
    a, b = Node(), Node()
    a.ref, b.ref = b, a
    watch_a, watch_b = weakref.ref(a), weakref.ref(b)
    del a, b
    retained = watch_a() is not None and watch_b() is not None
    assert retained
    gc.collect()
    cleared = watch_a() is None and watch_b() is None
    assert cleared
    print("cycle before collection:", retained)
    print("cycle after collection cleared:", cleared)
finally:
    if was_enabled:
        gc.enable()
```

CPython 3.13.13에서 위 변화와 순환 회수를 확인했다. `sys.getrefcount()` 자체의 임시 참조와 Immortal 객체 등 구현상의 조건 때문에 임의 객체의 출력값을 정확한 소유자 수로 해석하지 않는다. 예제는 새로 만든 보통 객체의 변화를 비교한다. [getrefcount의 한계](https://docs.python.org/3/library/sys.html#sys.getrefcount)

수집 세대와 임계값도 버전·빌드의 설정이다. 현재 값은 `gc.get_threshold()`로 확인하고 해당 버전의 문서와 함께 읽는다. 정해진 할당 횟수가 곧 동일한 실행 시점이나 정지 시간을 뜻하지는 않는다. Python 언어 전체가 참조가 사라진 즉시 객체를 회수한다고 보장하지 않으므로, 파일 등은 [Context Manager](/wiki/programming-languages-runtime-topic-0322526b0594/)와 명시적인 종료로 관리한다.
