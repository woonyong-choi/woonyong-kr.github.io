---
layout: default
title: 개방 주소법
nav_order: 5
permalink: /wiki/computer-science-topic-beb55415c2d3/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-beb55415c2d3
projection_sha256: aa41bbde0fa9124328a61f003319419ae518f6d604f1fcb51e01b3e0ad74dc63
parent: Hash Table
content_status: ready
public_parent_id: Wiki/keywords/computer-science-topic-c3f2953a97c2
search_terms:
- 개방 주소법
- Open Addressing
- 선형 탐사
- Tombstone
grand_parent: 자료구조
ancestor: CS 기초
---

# 개방 주소법
{: .no_toc }

정수 키 1을 저장한 자리에 키 9도 들어가려 한다면, 배열의 다른 빈칸에 9를 둘 수 있다. 이때 어디로 이동했는지 나중에 다시 찾아갈 규칙도 필요하다. 개방 주소법은 충돌한 항목을 배열 안의 다른 위치에 저장하고, 삽입과 조회에 같은 탐사 순서를 사용한다.

## 한 칸씩 옮겨 가는 선형 탐사

Bucket이 8개이고 정수 키의 시작 위치를 `key % 8`로 정한다고 하자. 1과 9는 모두 1번 위치에서 시작한다. 1이 먼저 들어갔다면 9는 다음 위치인 2번을 확인한다. 배열 끝을 만나면 나머지 연산으로 0번부터 이어서 찾는다.

조회도 같은 순서를 따른다. 9를 찾을 때 1번 위치의 키가 다르면 2번으로 이동한다. 한 번도 사용하지 않은 빈칸에 도착하면 그 뒤에는 찾는 키가 없다고 판단할 수 있다. 단, 삭제된 칸은 처음부터 비었던 칸과 구분해야 한다.

## 삭제된 자리를 그냥 비우면 안 되는 이유

1번 위치에서 키 1을 지운 뒤 그 칸을 일반 빈칸으로 바꾸면, 9를 조회할 때 1번에서 탐색을 멈춰 버린다. 실제로 9는 2번에 있는데 찾지 못하는 것이다. 삭제 표시인 Tombstone을 남기면 그 위치를 지나 다음 칸도 확인할 수 있다.

아래 예제는 `EMPTY`와 `DELETED`를 서로 다른 객체로 구분한다. 저장할 때 삭제된 자리를 기억해 두되, 같은 키가 뒤쪽에 이미 있는지 계속 확인한다. 바로 삭제된 자리에 넣어 버리면 기존 키의 값을 갱신하는 대신 같은 키를 두 군데에 저장할 수 있기 때문이다.

```run-python
EMPTY = object()
DELETED = object()
slots = [EMPTY] * 8


def put(key, value):
    first_deleted = None
    for step in range(len(slots)):
        index = (key + step) % len(slots)
        item = slots[index]
        if item is DELETED:
            if first_deleted is None:
                first_deleted = index
        elif item is EMPTY:
            target = first_deleted if first_deleted is not None else index
            slots[target] = (key, value)
            return
        elif item[0] == key:
            slots[index] = (key, value)
            return
    if first_deleted is not None:
        slots[first_deleted] = (key, value)
        return
    raise OverflowError("가득 찬 Hash Table")


def locate(key):
    for step in range(len(slots)):
        index = (key + step) % len(slots)
        item = slots[index]
        if item is EMPTY:
            return None
        if item is not DELETED and item[0] == key:
            return index
    return None


put(1, "first")
put(9, "second")
print("처음 위치:", locate(1), locate(9))
slots[locate(1)] = DELETED
print("앞 항목 삭제 후 9의 위치:", locate(9))
put(9, "updated")
put(17, "third")
print("삭제 자리 재사용:", locate(17))
print("9의 값:", slots[locate(9)][1])
print("없는 키:", locate(25))
```

처음 위치는 1과 2다. 키 1을 삭제해도 9는 2번에서 찾는다. `put(9, "updated")`는 기존 항목을 갱신하고, 새 키 17은 삭제 표시가 있던 1번을 재사용한다. 키 25는 존재하지 않으므로 `None`이 나온다.

테이블이 가득 찼을 때도 반복이 끝나도록 최대 배열 길이만큼만 탐사한다. 재사용할 삭제 자리도 없으면 `OverflowError`를 발생시킨다. 이 예제의 키는 정수이며, 크기 확장·동시 접근·영구 저장은 다루지 않는다.

## 공간과 탐색 길이의 절충

선형 탐사는 항목이 배열에 가까이 모여 저장되므로 Pointer로 외부 Node를 따라가는 [Chaining](/wiki/computer-science-topic-16b53895ae32/)과 다른 메모리 접근 특성이 있다. 다만 충돌한 항목이 연속된 구간을 만들면 그 주변으로 들어오는 키도 밀려서 긴 군집을 형성할 수 있다.

빈자리가 줄어들거나 삭제 표시가 많이 쌓이면 탐색이 길어진다. 크기를 늘리거나 항목을 다시 배치해 삭제 표시를 정리하는 정책이 필요하다. 따라서 사용 중인 항목 수뿐 아니라 처음부터 빈칸으로 남은 위치가 얼마나 있는지도 영향을 준다. 크기를 조절하는 시점은 구현마다 다르다.

선형 탐사 외에도 탐사 간격을 바꾸는 방식이 있다. 어느 방식을 선택하든 삽입과 조회의 경로가 같아야 하고, 선택한 배열 크기에서 필요한 위치를 방문할 수 있어야 한다. Hash Function의 분포, 부하율, 탐사 규칙을 함께 보고 성능을 판단한다.
