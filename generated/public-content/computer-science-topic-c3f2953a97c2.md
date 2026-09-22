---
layout: default
title: Hash Table
nav_order: 6
permalink: /wiki/computer-science-topic-c3f2953a97c2/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-c3f2953a97c2
projection_sha256: cedaa33695184adb1fc64434b48a76689b67bd3e05f4b035dd9a9c68cf5c176a
parent: 자료구조
content_status: ready
public_parent_id: Wiki/computer-science/data-structures
search_terms:
- Hash Table
- 부하율
- 재해싱
- 분할 상환
grand_parent: CS 기초
---

# Hash Table
{: .no_toc }

이름으로 전화번호를 찾거나 사용자 ID로 계정을 읽을 때는, 원하는 키와 일치하는 항목 하나를 찾아야 한다. Hash Table은 전체 자료를 훑는 대신 그 키가 들어갈 자리를 계산해 조회 범위를 좁힌다. 계산한 위치에서 실제 키를 대조하는 것이 이 구조의 출발점이다.

## 키에서 Bucket으로

정렬되지 않은 전화번호부에서는 이름을 앞에서부터 비교해야 한다. 정렬된 자료라면 이진 탐색으로 범위를 줄일 수 있다. Hash Table은 다른 방법을 사용한다. 키를 Hash 값으로 바꾸고 그 값으로 Bucket을 고른다. Bucket은 항목을 저장하거나 저장된 항목을 찾아가는 배열의 칸이다.

Hash 값이 같거나 같은 Bucket을 골랐다고 해서 키까지 같은 것은 아니다. 해당 위치에 저장한 실제 키를 비교해야 한다. 여러 키가 같은 자리를 가리키면 그 항목을 함께 저장하고 찾아갈 방법도 필요하다.

- [Hash Function](/wiki/computer-science-topic-a4ead10ed55a/)은 키에서 Hash 값을 계산하고 Bucket을 선택하는 과정을 설명한다.
- [충돌](/wiki/computer-science-topic-8d3fce7eee29/)에서는 서로 다른 키가 같은 위치로 모이는 경우를 구분한다.
- [Chaining](/wiki/computer-science-topic-16b53895ae32/)은 Bucket 밖의 Node를 연결해 저장한다.
- [개방 주소법](/wiki/computer-science-topic-beb55415c2d3/)은 배열 안에서 다른 위치를 찾아 저장한다.

## 평균 O(1)의 조건

키의 Hash 계산과 비교 비용을 상수로 보고, 키가 Bucket에 고르게 분산되며, 항목 수에 맞춰 공간을 관리한다면 기본 삽입·조회·삭제는 평균 O(1)을 기대할 수 있다. “항상 한 번 비교한다”는 뜻은 아니다. 충돌이 많거나 긴 문자열을 Hash하고 비교해야 한다면 비용이 달라진다. 최악에는 여러 항목을 차례로 확인해야 한다.

Python의 `dict`·`set`, Java의 `HashMap`, C++의 `unordered_map`은 Hash 기반 자료구조의 예다. 다만 각 언어의 저장 방식, 순서 보장, 크기 조절 정책까지 같지는 않다. 예를 들어 Python `dict`는 삽입 순서를 보존하고 Java `HashMap`은 순서를 보장하지 않는다. 삽입 순서가 보존된다고 키가 크기순으로 정렬되는 것도 아니다. [Python Dict](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict) · [Java HashMap](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/HashMap.html)

## 부하율과 재해싱

항목 수를 n, Bucket 수를 m이라고 할 때 부하율은 α = n/m이다. Chaining에서는 한 Bucket에 여러 Node를 연결하므로 α가 1을 넘을 수 있다. 개방 주소법은 배열 내부의 빈자리를 사용하므로 배열이 가득 차기 전에 공간을 늘리거나 삽입 실패를 처리해야 한다.

부하율이 커지면 보통 충돌과 탐색 길이도 늘어난다. 이를 줄이기 위해 더 큰 배열을 만들고 항목의 위치를 다시 정하는 작업을 재해싱이라고 한다. `Hash 값 % Bucket 수`로 위치를 정했다면 Bucket 수가 바뀔 때 나머지도 달라질 수 있다. 따라서 기존 배열을 같은 위치에 복사하는 것만으로 끝나지 않는다.

어느 부하율에서 확장할지는 구현이 정한다. Java `HashMap`의 기본값 0.75를 모든 Chaining 구현의 규칙으로 적용해서는 안 된다. 개방 주소법의 기준도 탐사 방식과 구현에 따라 다르다. 공간을 넉넉히 두면 충돌은 줄일 수 있지만 메모리 사용과 배열을 훑는 비용은 커질 수 있다. [HashMap의 크기와 부하율](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/HashMap.html)

한 번의 재해싱은 항목을 옮겨야 하므로 O(n) 비용이 든다. 하지만 배열을 일정 배수로 늘리면 이전에 옮긴 항목 수는 1+2+4+…처럼 증가한다. 균등한 분산과 상수 비용의 Hash 계산을 가정하면, 이 이동 비용을 여러 삽입에 나눠 부담한 삽입 비용은 평균적으로 O(1)이 된다. 이것이 분할 상환 분석이다. 특정 삽입 한 번의 긴 지연까지 없어지는 것은 아니다.

## 조회의 목적에 맞춰 선택하기

키 하나가 존재하는지 확인하거나 값을 빠르게 읽고 갱신할 때 Hash Table이 유용하다. 캐시, 중복 판별, 등장 횟수 세기가 그 예다. Python에서 이 차이는 [기본 문법](/wiki/programming-languages-runtime-topic-ced5bd855b7b/)의 Set과 Dict 예제로 확인할 수 있다.

반대로 특정 구간의 키를 순서대로 읽어야 한다면 Hash 배치만으로는 충분하지 않다. 정렬 구조를 별도로 두거나 Tree 기반 구조를 고려해야 한다. 데이터베이스의 Hash Index와 [인덱스](/wiki/indexes/)도 조회 조건에 따라 선택이 달라진다.

외부 입력을 키로 받는 서비스에서는 의도적으로 충돌하는 입력도 고려한다. 특정 Bucket에 키를 몰아 처리 비용을 늘리는 공격이 가능하기 때문이다. 무작위 시드나 충돌 완화 구조는 구현별 방어 수단이며, 임의의 간단한 Hash Function을 사용했다고 같은 보호가 생기지는 않는다.
