---
layout: default
title: 자료구조
nav_order: 2
permalink: /wiki/data-structures/
publication_state: publish
has_toc: false
projection_id: Wiki/computer-science/data-structures
projection_sha256: 081ef9f34d4397312e6b35fab1e8d9f1aada6f07cc92d0b15bb4703dc483f940
parent: CS 기초
content_status: ready
public_parent_id: Wiki/computer-science
---

# 자료구조
{: .no_toc }

같은 값도 어떻게 저장하고 찾아가는지에 따라 연산 비용이 달라진다. 여기서는 주로 하려는 연산에 따라 자료구조를 찾아본다. 무엇을 자주 읽고, 어디에 넣고 빼며, 어떤 관계를 따라가야 하는지부터 살펴본다.

## 위치와 연결로 접근하기

Array는 인덱스로 위치를 계산하고, Linked List는 노드의 연결을 따라간다. 중간 원소를 넣거나 지울 때도 이동할 데이터와 바꿀 연결이 다르다. 접근 비용뿐 아니라 위치를 찾는 비용과 메모리 배치도 함께 비교한다.

- [Array](/wiki/computer-science-topic-06d25b0021e7/)
- [Linked List](/wiki/computer-science-topic-2f43235867e4/)

## 순서와 우선순위로 꺼내기

Stack과 Queue는 저장된 값 중 어느 것을 먼저 꺼낼지 정한다. Stack과 Queue는 Array나 Linked List로 구현할 수 있으므로, 접근 규칙과 저장 방식은 구분해서 본다. 입력 순서보다 우선순위가 중요할 때는 Heap으로 이어진다.

- [Stack](/wiki/computer-science-topic-39fd55620efd/)
- [Queue](/wiki/computer-science-topic-fd1595b77add/)
- Heap

## 키와 관계로 찾기

키로 값을 찾는 Hash Table, 접두사로 문자열을 찾는 Trie, 계층과 연결을 다루는 Tree·Graph, 같은 집합인지 확인하는 서로소 집합으로 이어진다.

- [Hash Table](/wiki/computer-science-topic-c3f2953a97c2/)
- Trie
- [Tree](/wiki/computer-science-topic-a06ebc760118/)
- [Graph](/wiki/computer-science-topic-1a8e559de264/)
- 서로소 집합
