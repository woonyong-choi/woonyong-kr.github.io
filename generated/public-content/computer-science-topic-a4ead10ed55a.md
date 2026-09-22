---
layout: default
title: Hash Function
nav_order: 2
permalink: /wiki/computer-science-topic-a4ead10ed55a/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-a4ead10ed55a
projection_sha256: 8a68fde632fe721111635dcbf4a1909e80cfb01fece23ee74d4c984ecb6a4981
parent: Hash Table
content_status: ready
public_parent_id: Wiki/keywords/computer-science-topic-c3f2953a97c2
search_terms:
- Hash Function
- djb2
- Hash 값
- Bucket
grand_parent: 자료구조
ancestor: CS 기초
---

# Hash Function
{: .no_toc }

문자열 `cat`을 배열에 저장하려면 먼저 어느 칸을 사용할지 정해야 한다. 문자열을 일정한 크기의 값으로 바꾸는 Hash Function과, 그 값을 배열 범위 안의 Bucket 번호로 줄이는 계산이 이 역할을 나눠 맡는다. 입력한 키, 계산한 Hash 값, 최종 Bucket 번호를 구분해 보자.

## Hash 값과 배열 위치를 구분하기

문자의 코드 값을 더하는 간단한 함수를 생각해 보자. `cat`의 합은 99+97+116=312다. Bucket이 8개이면 `312 % 8`인 0번을 선택하고, 16개이면 `312 % 16`인 8번을 선택한다. 키와 Hash 값이 그대로여도 Bucket 수가 바뀌면 위치는 달라진다.

```run-python
def toy_hash(text):
    return sum(ord(character) for character in text)


for key in ("cat", "act", "dog"):
    value = toy_hash(key)
    print(f"{key}: hash={value}, 8개일 때={value % 8}, 16개일 때={value % 16}")
```

이 함수는 문자의 순서를 반영하지 않으므로 `cat`과 `act`가 같은 Hash 값을 만든다. 원리를 보기 위한 예시이며 실제 문자열을 고르게 분산하는 함수로 권장하는 코드는 아니다. 같은 Hash 값이 나오는 경우는 [충돌](/wiki/computer-science-topic-8d3fce7eee29/)에서 다룬다.

## 키를 읽는 비용과 일관성

같은 테이블 안에서 같은 키를 넣고 찾을 때는 같은 Hash 계산과 Bucket 선택 규칙을 사용해야 한다. 키의 동등성 검사와 Hash 계산도 일관돼야 한다. 같은 것으로 비교되는 키가 서로 다른 Hash 값을 만들면 저장한 위치를 제대로 찾을 수 없다.

문자열의 모든 바이트를 읽어 Hash를 계산한다면 문자열 길이만큼의 비용이 든다. Hash Table 조회를 평균 O(1)이라고 할 때는 보통 키 처리 비용을 상수로 볼 수 있다는 가정이 포함된다. 길이가 계속 늘어나는 입력을 다룬다면 이 비용도 계산해야 한다.

[Chaining](/wiki/computer-science-topic-16b53895ae32/)의 C 예제는 5381에서 시작해 `h = h * 33 + byte`를 반복하는 djb2 계열 계산을 사용한다. 기존 값에 곱한 뒤 다음 바이트를 더해 문자 순서가 결과에 영향을 주도록 한다. 마지막 나머지 연산은 계산된 값을 유한한 Bucket 범위로 줄이는 별도 단계다.

실제 런타임은 타입과 용도에 맞는 Hash 정책을 사용한다. 예를 들어 CPython의 문자열 Hash는 프로세스 간 같은 값이 나온다고 보장하지 않는다. 프로세스 밖에 저장할 식별자를 만들거나 보안을 위한 검증값을 만들 때는 일반 Hash Table용 Hash 값을 그대로 사용하지 않는다. [Python Hash 동작](https://docs.python.org/3/reference/datamodel.html#object.__hash__) · [CPython Dict 구현](https://docs.python.org/3/faq/design.html#how-are-dictionaries-implemented-in-cpython)
