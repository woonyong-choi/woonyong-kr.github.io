---
layout: default
title: 함수
nav_order: 3
permalink: /wiki/programming-languages-runtime-topic-42b4dbf4dfb9/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/programming-languages-runtime-topic-42b4dbf4dfb9
projection_sha256: 124c593a55e38552d5f6cfb2d9d0b1b330f301cfbb41bd585c76723661e2759e
parent: Python
content_status: ready
public_parent_id: Wiki/programming-languages-runtime/python
grand_parent: 프로그래밍 언어
ancestor: Programming
---

# 함수
{: .no_toc }

함수의 매개변수는 호출할 때 전달된 객체에 연결되는 지역 이름이다. 정수를 받든 List를 받든 이 규칙은 같다. 함수 안에서 이름을 다시 연결하는 일과 공유한 객체를 바꾸는 일이 서로 다른 결과를 만든다.

## 재대입은 이름을 바꾸고 변이는 객체를 바꾼다

`x = 10`은 이름 `x`를 정수 객체에 연결한다. `items.append(99)`는 `items`가 가리키는 List를 바꾼다. 이 List를 호출자도 보고 있다면 변경을 함께 보게 된다. 반면 `items = [99]`는 함수 안의 이름만 다른 List에 연결한다.

공식 FAQ는 이 전달 방식을 대입으로 설명한다. Call by Sharing이나 객체 참조 전달이라는 이름을 쓰더라도 호출자의 변수 자체를 매개변수의 별칭으로 만드는 방식과 구별해야 한다. [Python 함수 인자 전달](https://docs.python.org/3/faq/programming.html#how-do-i-write-a-function-with-output-parameters-call-by-reference)

다음 예제는 재대입 두 가지와 List 변이를 나란히 실행한다. 주소 숫자를 고정하지 않고 `id()`로 재대입 전후의 동일성을 비교한다.

```run-python
def replace_number(number):
    number = 100
    return number


def append_item(items):
    items.append(99)


def replace_list(items):
    items = [7, 8]
    return items


number = 42
values = [1, 2, 3]
initial_id = id(values)
returned_number = replace_number(number)
append_item(values)
returned_list = replace_list(values)
assert number == 42 and returned_number == 100
assert values == [1, 2, 3, 99] and id(values) == initial_id
assert returned_list == [7, 8] and returned_list is not values
print("caller number:", number, "returned:", returned_number)
print("caller list:", values)
print("returned list:", returned_list)
print("same caller list:", id(values) == initial_id)
```

첫 함수가 돌려준 100을 호출자의 `number`에 대입하지 않았으므로 42가 남는다. List에는 `append()`의 변경이 남고, 새로 반환한 `[7, 8]`은 별도의 객체다. 원하는 결과를 호출자에게 전달할 때는 반환값으로 돌려주고 대입하는 방법이 분명하다.

## 연산이 하는 일을 확인한다

`+=`도 타입에 따라 다르다. List의 `+=`는 보통 같은 List를 확장하고, 정수의 `+=`는 계산한 결과에 이름을 다시 연결한다. 단순히 대입 기호가 들어 있다는 이유로 변이가 없다고 판단하지 않는다. 기본 객체의 변경 가능성과 공유 범위는 [Python](/wiki/python/)에서 이어진다.

C에서도 포인터 인자는 포인터 값으로 전달된다. `*ptr`로 가리키는 객체를 바꾸는 것과 포인터 매개변수 자체에 다른 주소를 대입하는 것은 다르다. 이를 C에 별도의 Call by Reference 인자 전달 문법이 있다는 뜻으로 설명하지 않는다. [Pointer](/wiki/programming-languages-runtime-topic-ef71fd296666/)의 주소·대상 구분과 비교할 수 있다.

Python의 `global`·`nonlocal`은 이름의 범위를 지정하는 별도 규칙이며, 매개변수 전달 방식을 바꾸는 기능이 아니다. 함수 호출 뒤의 변경을 판단할 때는 같은 객체를 보는지, 수행한 연산이 변이인지, 반환값을 어디에 대입했는지를 차례로 확인한다.
