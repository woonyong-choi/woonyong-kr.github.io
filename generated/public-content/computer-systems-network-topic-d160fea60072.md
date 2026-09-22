---
layout: default
title: 메모리 관리
nav_order: 6
permalink: /wiki/computer-systems-network-topic-d160fea60072/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-d160fea60072
projection_sha256: c1f211d3878c231a478568cad80a0d8d28ff53f07366f396fdcad65bf7a7264e
parent: OS
content_status: ready
public_parent_id: Wiki/computer-systems-network/os
search_terms:
- palloc
- malloc
- mem_sbrk
- Buddy Allocator
- Slab Cache
- Arena
- 공간 이용률
grand_parent: Systems
ancestor: CS 기초
---

# 메모리 관리
{: .no_toc }

OS의 메모리 관리는 프로그램이 사용할 주소를 정하고, 실제 공간을 배정하며, 필요하지 않은 공간을 회수하는 일로 이어진다. [주소 공간](/wiki/computer-systems-network-topic-3521ee6344f1/)은 프로그램이 어떤 주소를 사용할 수 있는지 설명하고, 가상 메모리는 그 주소와 물리 메모리의 관계를 다룬다.

이때 ‘메모리가 남는다’는 사실만으로 모든 요청을 처리할 수 있는 것은 아니다. 먼저 어느 단위로 공간을 나누고 어떤 연속성을 요구하는지 살펴보면, 할당 실패와 공간 낭비를 구체적으로 설명할 수 있다.

## 메모리 할당과 단편화

메모리가 남아 있는데도 할당이 실패할 수 있다. 남은 공간이 요청한 모양으로 이어져 있지 않기 때문이다. 반대로 할당에는 성공했지만, 받은 블록이 요청보다 커서 일부 공간을 쓰지 못할 수도 있다. 내부 단편화와 외부 단편화는 이 두 상황을 구분한다.

| 구분 | 남은 공간의 위치 | 예 |
| --- | --- | --- |
| 내부 단편화 | 이미 할당한 블록 안 | 17바이트 요청에 32바이트를 배정해 15바이트가 남음 |
| 외부 단편화 | 사용 중인 블록 사이 | 빈 페이지가 총 4개여도 연속 3페이지를 찾지 못함 |

단편화가 어느 계층에서 발생하는지 함께 말해야 한다. 응용 프로그램의 Heap 블록, Kernel의 객체 할당, 물리 페이지의 연속성은 서로 다른 조건을 가진다. 사용 시간이 길다는 이유만으로 단편화가 언제나 나빠지는 것도 아니다. 요청 크기와 할당·해제 순서가 결과를 바꾼다.

### 크기를 올림할 때 남는 공간

[PintOS `5afaa6d`의 `malloc.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/malloc.c)는 Kernel 내부에서 사용하는 할당기다. `descs[10]` 배열 가운데 크기별 빈 블록 목록을 관리하는 Descriptor 일곱 개를 초기화한다. 블록 크기는 `16, 32, 64, 128, 256, 512, 1024`바이트다. 루프 조건이 `block_size < PGSIZE / 2`이므로 2048바이트 Descriptor는 없다. 응용 프로그램의 C 라이브러리가 제공하는 `malloc()`과는 별개의 구현이다.

요청을 담을 수 있는 가장 작은 Descriptor를 고르므로 17바이트 요청은 32바이트 블록을 받는다. 남은 15바이트는 배정한 블록의 약 46.9%다. 이를 모든 블록의 ‘최악은 블록 크기에서 1을 뺀 값’으로 설명하면 크기 구간을 놓친다. 이 구현에서 32바이트 블록을 선택하는 요청은 17~32바이트이므로 최대 차이는 15바이트다. 최소 블록인 16바이트는 1~16바이트 요청에 사용된다.

페이지 단위 올림도 같은 방식으로 계산할 수 있다. 4097바이트의 데이터를 4096바이트 페이지 두 개에 담으면 `8192 - 4097 = 4095`바이트가 남는다. 다음 모델은 Descriptor의 올림과 페이지 올림을 계산한다. 실제 `malloc()` 호출이나 Arena의 관리 비용까지 측정하는 예제는 아니다.

```run-python
classes = [16, 32, 64, 128, 256, 512, 1024]
for requested in [1, 16, 17, 1024, 1025]:
    assert requested > 0
    block = next((size for size in classes if size >= requested), None)
    if block is None:
        print(requested, '바이트: Descriptor 대신 큰 할당 경로')
    else:
        unused = block - requested
        print(requested, '바이트 →', block, '바이트 블록, 남음:', unused,
              '배정 크기 대비:', f'{unused / block:.1%}')

requested = 4097
page_size = 4096
pages = (requested + page_size - 1) // page_size
unused = pages * page_size - requested
print('페이지 올림:', pages, '페이지, 남음:', unused, '바이트')
assert pages == 2 and unused == 4095
```

이 할당기는 여러 블록을 담는 메모리 영역을 Arena라고 부른다. 작은 블록의 Arena는 한 페이지에서 관리 정보인 `sizeof(struct arena)`를 제외한 영역을 블록으로 나누며, 나눗셈의 나머지 공간도 생길 수 있다. Descriptor보다 큰 요청은 `size + sizeof(struct arena)`를 페이지 수로 올림해 `palloc_get_multiple()`에 전달한다. 따라서 **큰 malloc의 실제 페이지 수**와 위 예제의 **데이터만 페이지로 올림한 수**는 구분해야 한다. 구현은 1024바이트를 넘는 요청부터 큰 할당 경로로 들어가므로, 파일 앞부분의 ‘2 kB보다 큰 블록’이라는 주석만으로 경계를 정하면 안 된다. 크기 0 요청은 이 선택 전에 `NULL`로 처리하며 위 모델은 양의 크기만 비교한다.

### 빈 공간이 이어져 있어야 할 때

PintOS의 [`palloc_get_multiple()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/palloc.c)은 선택한 Pool의 Bitmap에서 요청한 수만큼 연속된 빈 비트를 찾는다. `PAL_USER`가 있으면 사용자 페이지용 User Pool을, 없으면 Kernel Pool을 선택한다. 빈 페이지를 모두 합하면 충분하더라도 하나의 연속 구간으로 찾지 못하면 실패한다. `PAL_ASSERT`가 있으면 실패 시 Kernel Panic을 일으키고, 없으면 `NULL`을 반환한다.

아래 모델에서 `1`은 사용 중인 페이지, `0`은 빈 페이지다. 세 페이지 요청이 실패한 뒤, 사이에 있던 한 페이지를 해제하면 빈 구간이 이어지면서 같은 요청이 성공한다. 이는 주소 범위의 계산이며 실제 PintOS Pool이나 Lock을 실행하지 않는다.

```run-python
def first_run(used, count):
    assert count > 0
    for start in range(len(used) - count + 1):
        if not any(used[start:start + count]):
            return start
    return None

used = [1, 0, 1, 0, 0, 1, 1, 1, 1, 0]
print('Bitmap:', used, '빈 페이지:', used.count(0))
print('연속 3페이지 시작점:', first_run(used, 3))
assert used.count(0) == 4 and first_run(used, 3) is None
used[2] = 0
start = first_run(used, 3)
print('2번 페이지 해제 후:', used)
print('연속 3페이지 시작점:', start)
assert start == 1
```

`palloc_get_page()`는 한 페이지만 요청하므로 빈 페이지가 하나라도 있으면 이 연속성 조건 때문에 실패하지는 않는다. 다만 빈 페이지 자체가 없으면 실패할 수 있다. 큰 `malloc()`은 여러 물리 페이지를 한꺼번에 요구할 수 있으므로 외부 단편화의 영향을 받는다.

### 가상 주소의 연속성과 물리 주소의 연속성

[Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서는 가상 주소에서 연속된 페이지들을 서로 떨어진 물리 Frame에 Mapping할 수 있다. 이 경우 연속된 가상 주소 10페이지를 얻기 위해 반드시 연속된 물리 Frame 10개를 확보할 필요는 없다. 하지만 그 성질이 `palloc_get_multiple()`처럼 물리적 연속성을 직접 요구하는 모든 할당 문제를 없애지는 않는다. 마지막 페이지에 남는 내부 단편화도 여전히 존재한다.

Linux에서도 할당 목적에 맞는 API를 고른다. `vmalloc()` 계열은 큰 가상 연속 영역을 제공하지만 물리적 연속성을 보장하지 않는다. 같은 종류의 객체를 반복해서 할당할 때는 Slab Cache를 만들고 `kmem_cache_alloc()`으로 객체를 얻을 수 있다. 이러한 분류는 단편화를 완전히 없앤다는 보장이 아니라, 관리 단위와 요구 조건이 다르다는 뜻이다. [Linux 메모리 할당 안내](https://docs.kernel.org/core-api/memory-allocation.html)

Linux의 Buddy Allocator는 2의 거듭제곱 크기인 페이지 묶음을 관리한다. 더 큰 빈 묶음을 나누어 요청을 처리하고, 해제할 때 조건이 맞는 Buddy와 병합해 큰 묶음을 다시 만들 수 있다. 작은 객체를 다루는 Slab Cache와 물리 페이지 묶음을 다루는 Buddy를 같은 단위의 할당기로 보면 안 된다. [Linux 페이지 묶음의 분할과 병합](https://docs.kernel.org/mm/physical_memory.html)

### Malloc Lab에서 공간 이용률을 읽는 법

Malloc Lab은 `mem_sbrk()`로 얻은 제한된 Heap 안에서 블록과 관리 정보를 다루도록 구성한다. 빈 블록마다 관리용 노드를 시스템 `malloc()`으로 따로 만들면 실제 비용이 측정 대상 Heap 밖으로 빠진다. 빈 블록의 Payload 일부를 Free List의 `prev`·`next` 링크로 재사용하는 이유다. List의 첫 원소나 Tree Root를 가리키는 포인터와 블록마다 외부 노드를 만드는 선택은 같지 않다. 허용되는 전역 배열의 범위는 해당 과제 규칙을 확인한다.

[`24c2cc8`의 `mdriver.c`](https://github.com/woonyong-kr/lrn-malloc/blob/24c2cc836b519985e3163b2acdf6d409543e4410/malloc-lab/mdriver.c)는 Trace를 재생하면서 동시에 사용 중인 요청 바이트의 최댓값을 구하고, 마지막 `mem_heapsize()`로 나누어 공간 이용률을 계산한다. 이 비율에는 내부·외부 단편화뿐 아니라 Heap 안의 관리 정보와 확보해 둔 공간도 영향을 준다. 따라서 이용률 하나를 내부 단편화율로 해석하면 안 된다.

Trace의 `a id bytes`, `r id bytes`, `f id`는 할당·재할당·해제를 뜻한다. 예를 들어 `a 0 512 → a 1 128 → r 0 640 → f 1 → f 0`에서는 두 블록을 만든 뒤 첫 블록을 키운다. 늘릴 공간이 바로 옆에 있는지, 옮겨야 한다면 기존 내용을 어떻게 보존하는지, 해제 뒤 인접 빈 블록을 병합하는지를 순서대로 살필 수 있다. [Malloc Lab의 Trace 형식](https://github.com/woonyong-kr/lrn-malloc/blob/24c2cc836b519985e3163b2acdf6d409543e4410/malloc-lab/README.md)

빠른 탐색과 높은 공간 이용률은 별도로 측정해야 한다. AVL Tree를 썼다는 이유만으로 단순 Free List보다 전체 성능이 좋다고 결론낼 수 없다. 같은 Trace와 실행 조건에서 정렬·범위·겹침·재할당 데이터 보존을 먼저 확인하고, 이용률과 처리량을 비교해야 한다.

## 블록 경계와 빈 공간의 색인을 나눠 생각한다

할당기는 블록이 어디서 끝나는지 알아야 하고, 새 요청을 담을 빈 블록도 찾아야 한다. 이 두 문제는 같은 자료구조로 해결할 필요가 없다. Header와 Footer로 경계를 유지하면서 탐색만 List나 Tree로 바꿀 수 있다. Implicit Free List, Explicit Free List, Segregated Free List는 이러한 설계 선택을 비교하는 출발점이다.

### Header와 Footer로 앞뒤 블록을 찾는다

간단한 Boundary Tag 모형에서는 블록마다 크기와 할당 여부를 Header에 기록하고 Footer에도 같은 정보를 둔다. 크기는 Payload뿐 아니라 Header·Footer·Padding을 포함한다. 블록 크기가 8의 배수라면 하위 3비트가 비므로, 최하위 비트를 할당 표시에 쓸 수 있다. `32 | 1`은 `0x21`이고, `0x21 & ~0x7`은 크기 32를 돌려준다.

Header와 Footer가 각각 4바이트이고 정렬이 8바이트인 모형에서, 1바이트 요청의 최소 블록을 16바이트로 정했다면 `4 + 1 + 7 + 4 = 16`이다. Padding을 3바이트로 두면 합이 12여서 이 조건을 만족하지 않는다. 실제 최소 크기는 해제된 블록에 넣을 관리 필드까지 담을 수 있어야 한다.

Payload 시작 주소를 bp, 블록 크기를 size라 하면 다음처럼 계산한다.

| 찾을 위치 | 계산 | Malloc Lab 매크로 |
| --- | --- | --- |
| 현재 Header | `bp - 4` | `HDRP(bp)` |
| 현재 Footer | `bp + size - 8` | `FTRP(bp)` |
| 다음 블록의 Payload | `bp + size` | `NEXT_BLKP(bp)` |
| 이전 블록의 Footer | `bp - 8` | 이전 크기를 읽는 위치 |
| 이전 블록의 Payload | `bp - 이전 블록 크기` | `PREV_BLKP(bp)` |

`PACK(size, alloc)`은 크기와 상태 비트를 결합하고, `GET`·`PUT`은 주소에서 4바이트 값을 읽거나 쓴다. `GET_SIZE`와 `GET_ALLOC`은 각각 크기와 최하위 할당 비트를 꺼낸다. 이 이름들은 해당 구현의 매크로이며 C 표준 라이브러리 함수가 아니다.

크기가 양수인 Prologue를 할당 상태로 두면 처음 블록의 앞쪽 병합을 막을 수 있다. 크기 0·할당 상태인 Epilogue Header는 순회의 종료점이다. Heap을 늘릴 때는 기존 Epilogue 위치를 새 블록의 Header로 사용하고 끝에 새 Epilogue를 둔다. 이 구성은 모든 할당기가 Footer를 반드시 사용한다는 뜻은 아니다. 앞 블록의 상태를 다른 비트로 관리하거나 할당 블록의 Footer를 생략하는 설계도 있다.

### 탐색 순서와 병합 시점은 별도로 정한다

Implicit Free List는 블록 크기만큼 이동하며 할당 블록까지 함께 지난다. First Fit은 충분히 큰 첫 빈 블록, Next Fit은 이전 탐색 위치에서 이어서 찾은 블록, Best Fit은 후보 중 요청을 수용하는 가장 작은 블록을 선택한다. 정렬하지 않은 목록의 Best Fit은 최악의 경우 전체 후보를 확인하지만, 정확히 같은 크기를 발견하면 더 작은 적합 후보가 없으므로 일찍 끝낼 수 있다. 크기로 정렬한 Tree라면 탐색 경로도 달라진다.

전체 블록이 N개인 Implicit 탐색의 최악 비용은 O(N)이다. First Fit이 항상 모든 블록을 읽는다는 뜻은 아니다. Next Fit이 언제나 빠르거나 Best Fit이 항상 가장 높은 공간 이용률을 얻는 것도 아니다. 분할한 나머지 조각과 이후 요청 순서가 결과에 영향을 준다.

Next Fit이 기억한 탐색 시작점도 병합 뒤 유효한 블록 경계에 있어야 한다. 시작점이 합쳐진 블록 내부에 남으면 그 앞의 바이트를 Header로 오인해 크기와 다음 주소를 잘못 읽을 수 있다. 과거 `83538b1`의 `coalesce()`는 Rover인 `last_fitp`가 합쳐진 블록 내부에 있으면 새 블록의 시작점으로 옮긴다. [Next Fit의 병합 후 시작점 보정](https://github.com/woonyong-kr/lrn-malloc/blob/83538b1970d1f96b61e71cdc7c00f09c0ba7aff3/malloc-lab/mm_implicit.c#L39)

해제할 때 인접한 빈 블록을 즉시 합치는 Immediate Coalescing에서는 양옆의 상태를 확인한다. 둘 다 사용 중이면 그대로 두고, 한쪽만 비었으면 그쪽과 합치며, 양쪽이 비었으면 세 블록을 합친다. Boundary Tag가 있으면 이웃의 경계 확인 자체는 O(1)이다. 별도 List나 Tree에서 이웃을 제거하고 다시 등록하는 비용까지 항상 O(1)인 것은 아니다. 병합을 나중으로 미루는 방식도 있지만, 여기서는 즉시 병합을 비교한다.

다음 예제는 작은 bytearray에 실제 Header·Footer 값을 쓰고 네 가지 병합을 확인한다. 주소는 배열 안의 offset이며, 최소 블록 16바이트인 설명용 모형이다. 아래에서 다룰 현재 Malloc Lab 구현의 최소 블록 40바이트와 구분한다.

```run-python
from struct import pack_into, unpack_from

def merge_case(previous_used, next_used):
    heap = bytearray(112)
    def put(offset, word):
        pack_into('<I', heap, offset, word)
    def get(offset):
        return unpack_from('<I', heap, offset)[0]
    def block(bp, size, used):
        word = size | int(used)
        put(bp-4, word)
        put(bp+size-8, word)
    put(4, 8 | 1)
    put(8, 8 | 1)
    block(16, 32, previous_used)
    block(48, 16, False)
    block(64, 48, next_used)
    put(108, 1)

    bp = 48
    size = get(bp-4) & ~7
    previous_size = get(bp-8) & ~7
    following = bp + size
    start = bp
    if not get(bp-8) & 1:
        start -= previous_size
        size += previous_size
    if not get(following-4) & 1:
        size += get(following-4) & ~7
    block(start, size, False)
    assert get(start-4) == get(start+size-8) == size
    walk, current = [], 16
    while get(current-4) & ~7:
        word = get(current-4)
        walk.append((current, word & ~7, '사용' if word & 1 else '빈 블록'))
        current += word & ~7
    assert current-4 == 108
    return start, size, walk

for flags, expected in [((True, True), (48, 16)),
                        ((True, False), (48, 64)),
                        ((False, True), (16, 48)),
                        ((False, False), (16, 96))]:
    start, size, walk = merge_case(*flags)
    print('이전·다음 사용 여부:', flags, '→ 병합:', (start, size))
    print('순회:', walk)
    assert (start, size) == expected
```

### 빈 Payload를 Explicit Free List의 노드로 쓴다

Explicit Free List는 빈 블록의 Payload에 `prev`·`next`를 둔다. 블록이 할당되면 그 위치를 사용자 데이터로 다시 사용한다. 나중에 해제될 때도 링크를 담을 수 있어야 하므로, 작은 요청에 반환할 블록도 최소 관리 크기를 충족해야 한다.

Header·Footer가 각각 4바이트이고 포인터가 각각 8바이트라면 최소한 `4+8+8+4=24`바이트가 필요하다. 8바이트 정렬에서는 24가 가능하고, 16바이트 정렬이면 32로 올림한다. 같은 설명 안에 16바이트 Free Block을 그려 놓으면 두 포인터를 담을 수 없다. 포인터 크기·정렬·Metadata 배치를 먼저 정해야 한다.

빈 블록 수를 M이라 하면 단순 List의 탐색은 최악 O(M)이다. N=1000, M=10에서 전체를 순회하는 검사 횟수의 비는 100이지만, 실제 실행 시간이 정확히 100배 빨라지는 것은 아니다. 캐시 접근, 삽입·제거와 병합 비용도 함께 든다.

List의 앞뒤와 Heap에서 물리적으로 인접한 블록은 다르다. LIFO 삽입은 Head에 O(1)로 넣지만 주소 순서를 유지하지 않는다. 주소 순서 List는 삽입 위치 탐색이 필요하며, List에서 이웃이라는 사실만으로 두 블록의 주소 범위가 바로 붙어 있다고 결론낼 수도 없다. 사이에 할당 블록이 있는지 블록 경계로 확인해야 한다.

원문의 64비트 모형에서 `FREE_PREV(bp)`는 bp, `FREE_NEXT(bp)`는 bp+8에 있는 포인터를 읽는다. `SET_FREE_PREV`·`SET_FREE_NEXT`는 그 위치를 갱신한다. 앞뒤 연결 필드를 정확히 아는 이중 List의 단일 원소 제거와, 주소순 삽입 위치를 찾는 탐색은 서로 다른 비용이다.

다음 모형은 실제 포인터 대신 offset을 링크 값으로 사용한다. 가운데·Head·마지막 원소를 제거할 때 앞뒤 링크가 어떻게 바뀌는지 확인한다.

```run-python
links, head = {}, None

def insert(offset):
    global head
    assert offset not in links
    links[offset] = [None, head]
    if head is not None:
        links[head][0] = offset
    head = offset

def remove(offset):
    global head
    previous, following = links.pop(offset)
    if previous is None:
        head = following
    else:
        links[previous][1] = following
    if following is not None:
        links[following][0] = previous

def order():
    result, previous, current = [], None, head
    while current is not None:
        assert current not in result and links[current][0] == previous
        result.append(current)
        previous, current = current, links[current][1]
    assert set(result) == set(links)
    return result

for offset in [16, 64, 112]:
    insert(offset)
print('주소 순서:', sorted(links))
print('LIFO 순서:', order())
for offset in [64, 112, 16]:
    remove(offset)
    print(offset, '제거 후:', order())
assert head is None and not links
```

할당할 때는 선택한 블록을 색인에서 먼저 제거하고, 분할한 나머지를 다시 등록한다. 병합할 때도 기존 빈 이웃을 제거한 뒤 경계 크기를 바꾸고 합친 블록 하나를 등록한다. 크기를 먼저 바꾸면 이전 크기로 관리하던 색인에서 찾지 못하거나 같은 공간이 두 번 등록될 수 있다.

### 같은 경계 위에 Tree 색인을 얹을 수 있다

[`lrn-malloc`의 `mm.c`](https://github.com/woonyong-kr/lrn-malloc/blob/25624686459182a69e9ca9a9a650d8f753828756/malloc-lab/mm.c)는 Header·Footer를 유지하면서 빈 블록을 AVL Tree로 관리한다. Payload의 offset 0·8·16·24에 각각 `LEFT`, `RIGHT`, `SUB_MAX`, `SAME_NEXT`를 둔다. 이 64비트 배치의 필드 32바이트에 경계 8바이트를 더하므로 `MIN_BLOCK_SIZE`는 40이다. Balance Factor는 Header의 1~2번 비트에 들어가며, 크기를 읽을 때 이 비트도 제외한다. 따라서 이 구현에서 Header와 Footer의 전체 비트가 언제나 동일하다고 가정하면 안 된다.

Tree의 키는 블록 크기이고, 같은 크기 블록은 대표 노드의 `SAME_NEXT`에 연결한다. `SUB_MAX`는 서브트리 최대 크기다. `tree_best_fit()`은 부족한 서브트리를 제외하고, 현재 크기가 충분하면 왼쪽에서 더 작은 적합 블록을 찾으며, 부족하면 오른쪽으로 간다. AVL 균형이 유지된다면 탐색은 서로 다른 크기 개수 K에 대한 O(log K) 경로다.

이는 모든 할당·해제 연산이 O(log M)이라는 뜻은 아니다. 현재 `tree_delete()`는 같은 크기의 비대표 블록을 제거할 때 `SAME_NEXT`를 순회한다. 해당 체인이 길면 그 길이에 비례하는 비용이 생긴다. `rotate_left()`·`rotate_right()`와 Balance Factor 갱신은 크기 대표 노드의 균형을 관리한다. 좋은 공간 이용률이나 처리량은 Tree라는 이름만으로 보장되지 않는다.

현재 `lrn-malloc`의 `mm_realloc()`은 요청 크기를 정렬하고 최소 블록 크기를 반영한 뒤, 축소·제자리 확장·이동을 나누어 처리한다. 뒤의 빈 블록과 합칠 때는 그 블록을 AVL 색인에서 먼저 제거하고, 분할한 나머지를 다시 등록한다. 새 할당이 실패하면 기존 블록을 유지하며, 이동할 때는 내용을 복사한 뒤 이전 블록을 해제한다. 이 구현에서 `ptr == NULL`은 할당 경로로, `size == 0`은 해제 후 `NULL` 반환으로 처리한다. 정상 빌드 여부와 각 경로의 정렬·비중첩·데이터 보존 여부는 별도로 확인해야 한다. [재할당 경로](https://github.com/woonyong-kr/lrn-malloc/blob/25624686459182a69e9ca9a9a650d8f753828756/malloc-lab/mm.c#L505)

이 흐름을 읽기 쉽게 정리하려면 요청 크기 계산, 처리 경로 선택, 실제 블록 조작을 나누는 방법을 생각할 수 있다. `coalesce()`의 양옆 할당 여부는 네 가지 조합으로 표현할 수 있지만, `realloc()`에는 축소 가능 여부와 인접 공간의 크기, 새 할당의 성공 여부가 함께 들어간다. 공통 크기 계산과 축소·확장·복사를 작은 함수로 나누고 종료 조건을 먼저 처리하면 각 경로가 드러난다. 이는 코드 구조를 개선할 때의 선택이며, 현재 구현이 이미 그렇게 분리됐다는 설명은 아니다.

## 크기별 목록과 페이지 묶음

### 고정 크기 저장과 Segregated Fits를 구분한다

Segregated Free List는 크기별로 빈 블록을 나눠 탐색 범위를 줄인다. 다만 클래스에 정확히 같은 크기만 넣는지, 여러 크기의 범위를 넣는지에 따라 선택 방식이 달라진다.

| 구성 | 100바이트 요청을 다루는 예 | 남은 공간의 처리 |
| --- | --- | --- |
| 고정 크기 저장 | 128바이트 클래스의 블록을 받음 | 받은 블록 안에 여유가 남음 |
| 크기 범위별 Segregated Fits | 64~127 범위에서 100 이상인 블록을 찾거나 더 큰 클래스로 이동 | 분할 가능한 나머지를 맞는 목록에 등록 |

표는 크기 분류만 비교하며 Header·정렬에 필요한 추가 크기는 생략했다. 100바이트를 받는다는 이유로 `128~255` 범위 목록만 사용하면 같은 범위의 104·112바이트 블록 등 다른 적합 후보를 놓칠 수 있다. 고정 클래스의 올림과 범위 클래스의 탐색을 섞지 않아야 한다.

16부터 4096까지 양 끝을 포함한 거듭제곱 고정 클래스는 `log₂(4096/16)+1=9`개다. 세밀한 클래스는 올림 비용을 줄일 여지가 있지만 목록 수와 분류 비용을 늘린다. 범위 클래스 안의 여러 블록을 순회하거나 더 큰 목록을 찾는 과정까지 O(1)이라고 단정할 수는 없다.

PintOS의 작은 `malloc()`은 앞에서 본 7개 Descriptor마다 Explicit Free List와 Lock을 둔다. 준비된 목록에서 블록 하나를 꺼내는 경로는 빈 블록 수와 무관하지만, 목록이 비었다면 페이지 확보와 Arena 초기화, 여러 블록의 등록이 추가된다. `struct desc`의 `block_size`, `blocks_per_arena`, `free_list`, `lock`이 이 과정을 나눠 맡는다.

작은 블록을 받으면 Arena의 `free_cnt`를 줄이고, 해제하면 같은 Descriptor 목록에 돌려주며 늘린다. 모든 블록이 비면 해당 Arena의 블록들을 목록에서 모두 제거한 후 페이지를 반환한다. `block_to_arena()`는 블록 주소를 페이지 경계로 내리고 Arena의 `desc`에서 크기 클래스를 찾는다. 큰 요청은 `desc == NULL`인 별도 Arena와 연속 페이지 수를 사용하므로 작은 블록의 경로에 그대로 넣지 않는다. Arena의 `magic`은 `ARENA_MAGIC`으로 초기화하며, `block_to_arena()`와 `arena_to_block()`은 이를 검사해 관리 정보의 손상을 찾는다. 이 검사가 모든 잘못된 포인터나 이중 해제를 안전하게 처리해 준다는 뜻은 아니다. [PintOS의 Arena 확보와 회수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/malloc.c)

고정 크기 블록 둘을 즉시 합쳐 다른 크기로 쓰지 않더라도 Arena 전체를 반환할 수 있다. 일부 살아 있는 블록 때문에 페이지를 계속 보유하는 비용과, 물리 페이지가 흩어져 생기는 외부 단편화는 구분해야 한다.

glibc 2.42의 `malloc`에는 small·large bin뿐 아니라 fastbin, unsorted bin, 스레드별 tcache가 있다. Fastbin은 최근 해제한 작은 블록을 단방향 LIFO로 보관하고 병합을 늦춘다. 일반 병합 경로에서는 작은 결과를 smallbin에 바로 넣고 큰 결과를 unsorted bin에 두는 분기도 있다. 따라서 ‘모든 해제 블록이 먼저 unsorted bin을 거친다’거나 ‘크기별 bin 네 종류가 전부다’라는 설명은 이 버전의 코드와 맞지 않는다. Top Chunk와 mmap으로 얻은 영역도 별도 경로다. 단순 Implicit List가 정해진 순서대로 발전한 최종 형태로 보기보다, 재사용·병합·동기화 비용을 함께 조정한 구현으로 읽는 편이 정확하다. [glibc 2.42 malloc 구현](https://github.com/bminor/glibc/blob/glibc-2.42/malloc/malloc.c)

### Buddy는 같은 부모의 두 절반만 합친다

Buddy Allocator는 같은 큰 영역을 반으로 나누며 필요한 크기를 만든다. 같은 크기라는 조건만으로 병합할 수는 없다. 같은 부모에서 나뉜 두 절반이어야 하고, 같은 Order의 빈 블록으로 남아 있어야 한다.

크기가 2의 거듭제곱인 기준 영역 안에서, 크기 S인 블록의 offset은 S의 배수여야 한다. 이 offset을 사용하면 Buddy는 `offset XOR S`다. 실제 주소는 `base + ((address-base) XOR S)`로 구한다. 기준 영역의 정렬 조건이 맞을 때만 `address XOR S`로 간단히 쓸 수 있다. 0x1000 기준 영역에서 64바이트 크기의 0x1000과 0x1040은 서로의 Buddy다.

다음 모형은 1024바이트 영역을 나누고 두 요청을 처리한다. Order는 페이지 수가 아니라 바이트 크기의 지수다. Python Set은 해당 Order의 빈 Buddy를 찾는 색인이며 실제 Kernel의 자료구조와 같지는 않다.

```run-python
maximum_order = 10
free = {order: set() for order in range(maximum_order+1)}
free[maximum_order].add(0)
allocated = {}

def allocate(size):
    assert 0 < size <= 1 << maximum_order
    wanted = (size-1).bit_length()
    found = next((order for order in range(wanted, maximum_order+1)
                  if free[order]), None)
    if found is None:
        return None
    offset = min(free[found])
    free[found].remove(offset)
    while found > wanted:
        found -= 1
        buddy = offset ^ (1 << found)
        free[found].add(buddy)
        print('분할:', offset, buddy, '각', 1 << found, '바이트')
    allocated[offset] = wanted
    return offset

def release(offset):
    order = allocated.pop(offset)
    while order < maximum_order:
        buddy = offset ^ (1 << order)
        if buddy not in free[order]:
            break
        free[order].remove(buddy)
        offset = min(offset, buddy)
        order += 1
        print('병합:', offset, 1 << order, '바이트')
    free[order].add(offset)

a = allocate(200)
b = allocate(300)
print('할당 offset:', a, b)
assert (a, b) == (0, 512)
release(a)
print('첫 해제 후:', {o: sorted(xs) for o, xs in free.items() if xs})
release(b)
assert not allocated and free[10] == {0}
assert sum(len(xs) for xs in free.values()) == 1
print('최종:', {o: sorted(xs) for o, xs in free.items() if xs})
```

Buddy 주소 계산은 O(1)이지만, 분할·병합은 Order 차이만큼 여러 단계를 거친다. 해당 Order의 빈 Buddy를 찾고 제거하는 비용도 색인 구조에 따라 달라진다. 위 코드의 `min(set)`은 선형 탐색이므로 이 모형 전체를 O(log N) 구현이라고 부르지 않는다.

요청이 `2^k+1`이면 `2^(k+1)` 크기를 받아 블록 크기 대비 여유가 50%에 가까워질 수 있다. ‘평균 25%’는 요청 분포와 분모 조건을 정하지 않으면 일반적인 값이 아니다. 총 빈 공간이 충분해도 사용할 수 없는 Buddy 조합이 남을 수 있으므로 외부 단편화도 완전히 사라지지 않는다.

Linux의 Order k는 기본 페이지 `2^k`개를 뜻한다. Linux 6.16의 `MAX_PAGE_ORDER` 기본값은 10이지만 아키텍처 설정으로 달라질 수 있고, 기본 페이지 크기도 모든 환경에서 4 KiB로 고정되지 않는다. Zone의 `free_area`는 Order와 migration type별 빈 목록을 관리한다. [Linux 6.16의 Order와 migration type](https://github.com/torvalds/linux/blob/v6.16/include/linux/mmzone.h)

이 버전의 `set_buddy_order()`는 `page_private`에 Order를 저장하고 `PageBuddy` 상태를 설정한다. `_mapcount`만으로 빈 Buddy를 판정하는 설명으로 바꾸면 안 된다. 목록에서 제거할 때는 Buddy 상태와 저장한 Order도 해제한다. [`page_alloc.c`의 Buddy 상태와 병합](https://github.com/torvalds/linux/blob/v6.16/mm/page_alloc.c)

실제 페이지 할당에는 Per-CPU Pageset, Zone 선택, 이동 가능한 페이지의 분류와 Compaction도 관여한다. 이는 순수 Buddy 모형 밖의 정책이다. [Linux 물리 메모리 관리](https://docs.kernel.org/mm/physical_memory.html)

`/proc/buddyinfo`는 Node·Zone별로 Order에 대응하는 빈 블록 수를 보여 준다. 한 개의 전역 Free List로 생각하거나 각 열을 같은 크기의 페이지 개수로 더하면 안 된다. Order k의 블록 한 개에는 기본 페이지가 `2^k`개 들어간다. [proc_buddyinfo 사용 설명](https://man7.org/linux/man-pages/man5/proc_buddyinfo.5.html)

PintOS의 Bitmap은 명시적인 Buddy 병합 없이도, 이웃 페이지를 해제해 비트가 0으로 이어지면 연속 빈 구간으로 인식한다. 앞의 Bitmap 예제처럼 큰 요청이 다시 가능해질 수 있다. Buddy와 Bitmap의 차이는 빈 구간을 표현하고 찾는 방식이며, 명시적 병합 함수의 유무만으로 단편화나 처리량의 우열을 정할 수는 없다.

## Bitmap으로 자원 상태를 표현한다

Bitmap은 같은 크기의 자원 N개를 N비트로 추적한다. 비트의 의미는 사용하는 쪽이 정한다. PintOS의 페이지 할당기에서는 0이 할당 가능한 페이지이고, 1은 사용 중이거나 예약되어 사용할 수 없는 페이지다. [Swap](/wiki/computer-systems-network-swap-11630540adf8/)에서는 같은 자료구조로 디스크 Slot의 점유 여부를 기록한다. 비트 배열 자체가 자원의 내용을 저장하거나 소유자의 수명을 관리하는 것은 아니다.

[`5afaa6d`의 `bitmap.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/kernel/bitmap.c)는 `unsigned long` 배열과 `bit_cnt`를 사용한다. 이 x86-64 구성에서 원소 하나는 64비트다. 비트 i가 들어 있는 원소는 `i/64`, 그 원소 안의 마스크는 `1UL<<(i%64)`로 구한다. 예를 들어 137번 비트는 `bits[2]`의 9번 위치이며 마스크는 `0x200`이다. 여기서 64는 이 구성의 `sizeof(unsigned long)*CHAR_BIT` 값이며 모든 C 환경의 상수는 아니다.

비트 수가 100이면 원소 두 개가 필요하고, 두 번째 원소에서는 하위 36비트만 유효하다. `last_mask()`는 그 범위를 `0xfffffffff`로 표현한다. 현재 코드에서 이 마스크를 명시적으로 적용하는 곳은 `bitmap_read()`다. `bitmap_set_all()`은 `bitmap_set_multiple()`을 통해 유효한 인덱스만 순회하며, 마지막 원소의 나머지 비트 전체를 초기화하는 함수는 아니다.

### 상태 비트와 관리 공간의 크기

비트 배열의 저장 비용은 `ceil(N/64)*8`바이트다. `struct bitmap`과 할당기의 관리 공간은 여기에 더해진다. 8,192개 페이지를 나타내는 비트 배열은 1,024바이트지만, 이것을 Pool 초기화가 실제로 예약한 크기와 혼동하면 안 된다. `palloc`은 객체와 배열을 담는 버퍼를 페이지 크기로 올려 확보한다.

| 가정한 자원 수 | 비트 배열 | x86-64 Bitmap 객체 포함 | palloc 방식으로 페이지 올림 |
|---|---:|---:|---:|
| 2,560개 | 320 B | 336 B | 4,096 B |
| 8,192개 | 1,024 B | 1,040 B | 4,096 B |

객체 크기 16바이트는 이 구성의 `size_t`와 포인터가 각각 8바이트라는 배치에서 나온다. ‘64 MiB RAM이면 두 Pool이 각각 정확히 8,192개의 빈 페이지를 갖는다’는 결론은 위 표에서 나오지 않는다. Firmware의 예약 구간과 Kernel 이미지, Bitmap 저장 공간을 제외한 실제 상태는 [부팅](/wiki/computer-systems-network-topic-cc14ff5f728b/)에서 정해진다.

생성 경로에도 차이가 있다. `bitmap_create()`는 객체와 비트 배열을 각각 `malloc()`으로 확보하며, 두 번째 할당이 실패하면 먼저 확보한 객체를 해제하고 `NULL`을 반환한다. `bitmap_create_in_buf()`는 호출자가 준 버퍼 안에 객체와 배열을 배치한다. `palloc_init()`이 `malloc_init()`보다 먼저 실행되므로 palloc은 두 번째 경로를 사용한다. 버퍼 안에 만든 Bitmap을 두 개의 독립 Heap 할당처럼 `bitmap_destroy()`로 해제해서는 안 된다.

4 MiB Swap 장치에 512바이트 Sector 여덟 개를 한 Slot으로 묶으면 Slot은 1,024개, 비트 배열은 128바이트다. 현재 [`anon.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c)는 `swap_table`을 사용하며 별도의 `swap_ref_count` 배열은 없다. 과거 설계에 있던 참조 수 배열의 비용을 현재 구현의 필수 비용에 더하지 않는다.

### 연속 검색의 비용과 예약 범위

`bitmap_scan(b,start,cnt,value)`는 후보 시작점을 하나씩 옮기면서 그 위치의 cnt개 비트가 모두 value인지 검사한다. 현재 구현은 후보마다 `bitmap_contains()`를 다시 호출한다. 비트 수를 N, 요청 길이를 C라고 하면 비트 검사 횟수의 상한은 `O(N*C)`다. C=1이거나 고정된 상수일 때는 O(N)으로 쓸 수 있다. 반대 값이 발견되면 해당 후보 검사를 일찍 끝내므로 매번 상한까지 읽는 것은 아니다.

`bitmap_scan_and_flip()`은 검색이 성공한 뒤 그 구간을 `!value`로 설정한다. 이름의 flip을 각 비트에 무조건 XOR을 적용한다는 뜻으로 읽으면 안 된다. 또한 개별 비트를 바꾸는 명령이 원자적이어도 검색과 예약을 합친 전체 절차는 원자적이지 않다. 두 실행 흐름이 모두 같은 빈 위치를 찾은 뒤 1로 설정하면, 비트에는 1 하나만 남지만 두 호출자가 같은 자원을 얻었다고 생각할 수 있다.

PintOS의 `bitmap_mark/reset/flip`에는 각각 `lock orq/andq/xorq`가 있다. 이 명령 한 번의 Read-Modify-Write와 여러 비트를 검사하는 할당 절차의 상호 배제는 다른 문제다. `palloc_get_multiple()`은 검색과 설정을 `pool->lock`으로 감싸고, Swap의 예약 경로는 `swap_lock`으로 보호한다. 반면 `palloc_free_multiple()`에는 같은 Pool Lock을 잡는 코드가 없다. 이 구현을 그대로 일반적인 다중 CPU 할당기로 옮겨도 안전하다고 결론 내릴 수는 없다.

LOCK 접두사를 언제나 Bus Lock과 동일시하거나 고정된 20~30 Cycle 비용으로 설명하는 것도 부정확하다. Cache Line 경계와 메모리 종류, 다른 Core와의 경쟁이 비용에 영향을 준다. [Linux의 Bus Lock 설명](https://www.kernel.org/doc/html/v5.17/x86/buslock.html)

다음 코드는 원소·마스크 계산과 현재 검색 방식의 비트 검사 횟수를 확인한다. 마지막 부분은 두 호출의 순서를 일부러 교차시킨 모형이다. 실제 Thread나 CPU의 원자 명령을 실행하는 실험은 아니다.

```run-python
def scan(bits, count):
    checks = 0
    for start in range(len(bits)-count+1):
        for index in range(start,start+count):
            checks += 1
            if bits[index]:
                break
        else:
            return start, checks
    return None, checks

index = 137
print('word_index', index//64, 'mask', hex(1<<(index%64)))
print('100_bits_last_mask', hex((1<<(100%64))-1))
for count in [2560,8192]:
    array_bytes = ((count+63)//64)*8
    buffer_bytes = 16+array_bytes
    reserved_bytes = ((buffer_bytes+4095)//4096)*4096
    print('capacity',count,'array',array_bytes,'buffer',buffer_bytes,'reserved',reserved_bytes)
for length,count in [(16,4),(32,4),(32,8)]:
    bits = [int((i+1)%count==0) for i in range(length)]
    found,checks = scan(bits,count)
    print('scan',length,count,'found',found,'bit_checks',checks)
bits = [0,0]
first,_ = scan(bits,1)
second,_ = scan(bits,1)
bits[first] = 1
bits[second] = 1
print('interleaved_reservations',first,second,'state',bits)
assert first == second
bits = [0,0]
reserved = []
for _ in range(2):
    start,_ = scan(bits,1)
    bits[start] = 1
    reserved.append(start)
print('serialized_reservations',reserved,'state',bits)
assert reserved == [0,1]
```

### 초기화된 Pool에서 할당하고 반환한다

Pool의 `base`는 0번 비트가 나타내는 페이지의 Kernel VA다. `uint8_t *`이므로 `base+PGSIZE*page_idx`의 덧셈은 바이트 단위다. `PAL_USER`는 User Pool을 선택하고, `PAL_ZERO`는 성공한 영역을 반환 전에 0으로 채우며, `PAL_ASSERT`는 실패를 `NULL` 대신 Panic으로 처리한다. `PAL_USER`만 설정한 호출에는 0 초기화가 보장되지 않는다.

예를 들어 `base=0x8004b00000`, `page_idx=5`이면 반환 주소는 `0x8004b05000`이다. 같은 주소를 반환할 때는 `pg_no(pages)-pg_no(base)`로 인덱스 5를 얻는다. `page_from_pool()`은 주소가 Pool의 반개구간에 속하는지 검사할 뿐, 그 호출자가 해당 할당의 소유자인지까지 증명하지 않는다.

`palloc_free_multiple()`은 페이지 정렬을 검사하고, `NULL`이나 개수 0이면 종료한다. 나머지 경로에서는 Pool을 찾고 디버그 빌드의 메모리를 `0xcc`로 채운 뒤, 비트들이 모두 사용 중인지 확인하여 free로 바꾼다. 실제 순서는 덮어쓰기가 `bitmap_all()` 검사보다 먼저다. 이 API는 유효한 할당의 주소와 크기를 넘긴다는 계약이 필요하며, 해제가 잘못된 포인터나 이중 해제를 안전하게 처리해 주는 인터페이스는 아니다. `palloc_get_page/free_page`는 이 다중 페이지 API에 개수 1을 넘기는 Wrapper다. `malloc()`으로 받은 블록은 `free()`로 반환하며, 페이지 할당에 블록용 해제 함수를 섞어 쓰지 않는다.

같은 PintOS Kernel의 `free()`도 `NDEBUG`가 정의되지 않았을 때 작은 블록을 `0xcc`로 채운다. 이후 빈 블록 목록의 링크를 그 블록 안에 쓰므로 해제된 모든 바이트가 계속 `0xcc`로 남는 것은 아니다. 큰 할당은 `palloc_free_multiple()`로 반환하고, 이 페이지 해제 경로의 채움도 `NDEBUG` 조건에 따른다. 이 값은 디버깅 단서일 뿐 Use After Free를 모두 검출하거나 즉시 Fault를 일으키는 장치는 아니다. [PintOS의 블록 반환](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/malloc.c#L256-L318), [페이지 반환](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/palloc.c#L327-L363)

할당으로 받은 KVA를 프로세스의 User VA와 연결하는 과정은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서 이어진다. 프레임을 예약하는 일과 Page Table에 Mapping을 설치하는 일은 별도의 단계다.

## 공간 확보에서 주소 변환과 회수로

할당기가 공간을 확보한 뒤에는 프로그램의 VA가 그 공간을 어떻게 가리키는지 확인해야 한다. 파일이나 물리 메모리를 주소 공간과 연결하는 방식은 [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/)에서, 빈 Frame이 부족할 때 기존 내용을 보존하며 재사용할 대상을 고르는 문제는 [페이지 교체](/wiki/computer-systems-network-topic-e50fd5d11ab2/)에서 이어진다. 연속된 빈 공간이 없는 상태와, 내보낼 수 있는 Page 자체가 없는 상태는 서로 다른 실패 조건이다.
