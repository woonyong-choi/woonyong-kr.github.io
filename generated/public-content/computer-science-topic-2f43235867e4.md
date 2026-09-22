---
layout: default
title: Linked List
nav_order: 3
permalink: /wiki/computer-science-topic-2f43235867e4/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-2f43235867e4
projection_sha256: 7f4a637e3c6ed0c62d6f028c96f39eb2ab5526618276774d9cd25854e4f2b028
parent: 자료구조
content_status: ready
public_parent_id: Wiki/computer-science/data-structures
search_terms:
- Linked List
- 연결 리스트
- tail
- 삽입
- 삭제
grand_parent: CS 기초
---

# Linked List
{: .no_toc }

세 번째 원소를 찾으려는데 첫 원소의 주소만 알고 있다면 어떻게 해야 할까. Linked List에서는 첫 노드가 가진 `next`를 읽고, 다음 노드에서 다시 `next`를 읽는다. 원소의 순서는 주소의 크기나 메모리 배치가 아니라 **노드들이 저장한 연결**로 정해진다.

각 노드를 다음 위치를 적어 둔 쪽지라고 생각하면 된다. 쪽지를 메모리의 연속한 칸에 놓을 필요는 없다. 다만 실제로 서로 멀리 떨어져 있어야 하는 것도 아니다. 연결을 어떻게 저장했는지가 자료구조를 결정한다.

## 위치를 찾는 비용과 바꾸는 비용

Linked List의 중간 삽입이 O(1)이라는 설명에는 전제가 있다. **연결을 바꿀 위치를 이미 알고 있어야 한다.** 먼저 “값이 50인 노드”나 “50번째 노드”를 찾아야 한다면 그 탐색 비용이 따로 든다.

Singly Linked List는 다음 노드의 주소를 저장한다. 어떤 노드 뒤에 삽입하거나 그 다음 노드를 제거하려면 해당 앞 노드를 알고 있으면 된다. 삭제할 노드만 알고 있고 앞 노드를 모르면 일반적으로 앞에서부터 찾아야 한다. Doubly Linked List는 `prev`도 저장하므로 유효한 내부 노드를 알 때 앞뒤 연결을 바로 고칠 수 있다.

| 연산 | Array 또는 Dynamic Array | Linked List |
|---|---|---|
| 인덱스 i로 접근 | O(1) | 앞에서 찾으면 O(n) |
| 끝에 삽입 | 여유 용량이 있으면 O(1), 확장 시 O(n) | 마지막 노드를 보관하면 O(1), 처음부터 찾으면 O(n) |
| 순서를 유지하며 중간 삽입 | 뒤 원소 이동으로 O(n) | 앞 노드 또는 삽입 경계를 알면 O(1) |
| 순서를 유지하며 중간 삭제 | 뒤 원소 이동으로 O(n) | Singly는 앞 노드, Doubly는 삭제할 노드를 알면 O(1) |
| 부가 공간 | Dynamic Array의 미사용 용량과 길이·용량 정보 | 노드별 연결 포인터, 동적 할당 시 메타데이터와 메모리 정렬을 위한 여유 공간 |

표의 연결 변경 비용에는 노드를 찾거나 새 저장 공간을 할당하는 비용이 포함되지 않는다. 원소 수를 별도 필드에 보관하지 않는 List에서 길이를 세는 일도 O(n)이다.

Array의 일정한 간격과 Linked List의 연결 순회는 [Array](/wiki/computer-science-topic-06d25b0021e7/)에서 메모리 배치와 함께 비교할 수 있다. 순회를 많이 한다면 노드가 흩어진 배치에서 Cache Miss가 늘어날 가능성도 고려해야 한다. 이는 배치와 하드웨어에 따른 차이이며 시간 복잡도만으로 몇 배 빠른지 정해지는 것은 아니다.

## 한 방향 연결과 양방향 연결

- [Singly Linked List](/wiki/computer-science-topic-e00dfaa7306e/)는 `next`를 따라 원하는 위치로 가는 C 예제로 접근 비용을 확인한다.
- [Doubly Linked List](/wiki/computer-science-topic-2d043afd0f9f/)는 앞뒤 연결과 경계 노드를 다루고, PintOS의 `struct list`가 이를 어떻게 사용하는지 살펴본다.

Array와 Linked List가 원소를 저장하고 연결하는 방식이라면 [Stack](/wiki/computer-science-topic-39fd55620efd/)과 [Queue](/wiki/computer-science-topic-fd1595b77add/)는 넣고 빼는 순서에 관한 규칙이다. List의 맨 앞에서만 넣고 빼면 Stack으로, 뒤에 넣고 앞에서 빼면 Queue로 사용할 수 있다. 규칙과 구현을 구분하면 “Queue는 반드시 Linked List여야 한다”는 오해를 피할 수 있다.
