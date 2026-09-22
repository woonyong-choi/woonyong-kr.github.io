---
layout: default
title: Doubly Linked List
nav_order: 4
permalink: /wiki/computer-science-topic-2d043afd0f9f/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-2d043afd0f9f
projection_sha256: f726ca1dacc6e85cfd00bbb97b87b8827f36a09d3e110d706438e63505bc8c39
parent: Linked List
content_status: ready
public_parent_id: Wiki/keywords/computer-science-topic-2f43235867e4
search_terms:
- Doubly Linked List
- 이중 연결 리스트
- Sentinel
- PintOS
- list_elem
- Intrusive List
- list_entry
- container_of
- offsetof
- all_elem
- donation_elem
grand_parent: 자료구조
ancestor: CS 기초
---

# Doubly Linked List
{: .no_toc }

`10 ⇄ 20 ⇄ 30`에서 `20`을 제거하려면 `10`의 다음을 `30`으로, `30`의 이전을 `10`으로 바꾼다. Doubly Linked List는 노드마다 `prev`와 `next`를 저장하므로 **삭제할 노드를 알고 있다면** 양쪽 이웃을 바로 찾을 수 있다.

인덱스나 값으로 그 노드를 먼저 찾아야 한다면 탐색 비용이 추가된다. 양방향이라는 이유로 Array처럼 임의의 인덱스에 O(1)로 접근하는 것은 아니다.

## 양 끝에 경계 노드를 둔다

첫 번째 노드나 마지막 노드를 제거할 때마다 특별한 분기를 넣는 대신, 데이터에 포함하지 않는 head와 tail 노드를 둘 수 있다. 이를 Sentinel이라고 부른다. 빈 List에서는 `head.next`가 tail을, `tail.prev`가 head를 가리킨다.

다음은 연결을 바꾸는 부분만 일반 C에서 실행하는 작은 모형이다. 값도 노드 안에 두었으며, PintOS Kernel을 실행하거나 실제 `struct thread`를 사용하는 코드는 아니다.

```run-c
#include <assert.h>
#include <stdio.h>

struct node {
    int value;
    struct node *prev;
    struct node *next;
};

static void insert_before(struct node *before, struct node *item) {
    assert(before->prev != NULL && item->prev == NULL && item->next == NULL);
    item->prev = before->prev;
    item->next = before;
    before->prev->next = item;
    before->prev = item;
}

static void remove_node(struct node *item) {
    assert(item->prev != NULL && item->next != NULL);
    item->prev->next = item->next;
    item->next->prev = item->prev;
    item->prev = NULL;
    item->next = NULL;
}

int main(void) {
    struct node head = {0, NULL, NULL}, tail = {0, NULL, NULL};
    head.next = &tail;
    tail.prev = &head;
    struct node a = {10, NULL, NULL}, b = {20, NULL, NULL};
    struct node c = {30, NULL, NULL};
    insert_before(&tail, &a);
    insert_before(&tail, &b);
    insert_before(&tail, &c);
    remove_node(&b);
    printf("중간 삭제: %d -> %d\n", head.next->value, head.next->next->value);
    assert(a.next == &c && c.prev == &a);
    remove_node(&a);
    printf("처음 삭제 후: %d\n", head.next->value);
    remove_node(&c);
    printf("빈 List: %s\n", head.next == &tail ? "yes" : "no");
    assert(head.next == &tail && tail.prev == &head);
    return 0;
}
```

세 번의 삭제가 모두 같은 함수로 처리된다. head와 tail은 경계를 나타내므로 데이터 노드처럼 제거하지 않는다. 이 모형에서는 제거한 노드의 연결도 NULL로 비우지만, 모든 Linked List 구현이 그렇게 하는 것은 아니다. 호출자는 이미 제거한 노드를 다시 제거하거나 같은 연결을 여러 List에 동시에 끼우지 않아야 한다.

연결을 바꾸는 대입 수는 List가 길어져도 일정하다. 다만 이 예제는 한 Thread에서 실행한다. 여러 Thread가 같은 List를 동시에 수정할 때의 동기화는 별도로 필요하다.

## PintOS의 구조체 안에 들어 있는 연결

`lrn-pintos`의 `5afaa6d` 버전에서 `struct list_elem`은 `prev`와 `next`를 가진다. `struct list`는 head와 tail 경계 노드를 보관한다. `list_init()`이 두 경계를 연결하고, `list_remove()`는 유효한 내부 원소의 이웃 두 곳을 이어 준 뒤 다음 원소를 반환한다. 위 모형과 달리 제거한 원소의 `prev`와 `next`를 NULL로 지우지는 않는다. [구조체 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/lib/kernel/list.h#L83), [초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/kernel/list.c#L56), [제거 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/kernel/list.c#L241)

연결용 노드를 따로 할당하는 대신, List에 들어갈 구조체가 `struct list_elem` 멤버를 직접 품는다. 이런 형태를 Intrusive List라고 부른다. `list_entry()`는 연결 멤버의 주소에서 바깥 구조체를 찾는 데 쓰인다. List 조작 자체가 별도 노드 할당을 요구하지 않는다는 뜻이며, Thread 객체의 메모리 할당까지 없다는 뜻은 아니다.

`struct thread`의 `elem`은 ready List 또는 Semaphore 대기 List에 연결할 때 쓰고, `donation_elem`은 우선순위 기부 목록에 따로 쓴다. 서로 다른 목록에 동시에 참여하려면 각 연결의 소속을 구분해야 한다. 같은 `elem`을 두 목록에 동시에 넣으면 그 안의 `prev`·`next`가 두 연결을 함께 표현할 수 없다. [Thread의 연결 멤버](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/thread.h#L129)

## 연결 변경이 빠르다고 스케줄링 전체가 O(1)은 아니다

현재 구현의 `thread_unblock()`과 `thread_yield()`는 ready List에 우선순위 비교 함수를 넘겨 `list_insert_ordered()`로 삽입한다. 이 함수는 들어갈 위치를 찾을 때 List를 순회한다. 연결 대입은 O(1)이지만 위치 탐색은 원소 수 n에 대해 최악 O(n)이다. [ready List 삽입](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L365), [정렬된 위치 탐색](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/kernel/list.c#L415)

Semaphore도 `sema_down()`에서 우선순위에 맞춰 기다리는 Thread를 넣고, `sema_up()`에서 대기 목록을 다시 정렬한 뒤 앞 원소를 꺼내 깨운다. 따라서 단순 FIFO Queue로 설명하거나 꺼내는 연산 하나만 보고 `sema_up()` 전체를 O(1)이라고 할 수 없다. 대기 목록 정렬과 ready List 삽입 비용을 함께 읽어야 한다. [Semaphore의 대기와 깨우기](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/synch.c#L60)

List에 들어간 뒤 우선순위가 바뀌는 경로에서는 순서를 다시 맞추는지도 따로 확인해야 한다. 정렬 삽입 함수가 있다는 사실만으로 항상 최고 우선순위 Thread가 맨 앞에 있다고 보장할 수는 없다. 여기서 확인한 것은 해당 버전의 구조와 호출 경로이며, Kernel 실행으로 스케줄러의 모든 동작을 검증했다는 뜻은 아니다.

## list_entry는 연결을 따라가지 않고 주소를 되짚는다

현재 `9d1b14c`의 `list_entry()`는 다음과 같이 정의되어 있다. PintOS의 타입과 매크로를 전제로 한 구현 설명이므로 이 조각만 따로 실행하지 않는다.

```c
#define list_entry(LIST_ELEM, STRUCT, MEMBER)           \
    ((STRUCT *) ((uint8_t *) &(LIST_ELEM)->next         \
        - offsetof (STRUCT, MEMBER.next)))
```

`LIST_ELEM->next`가 가리키는 다음 노드로 이동하는 것이 아니다. `&`로 **현재 원소 안의 next 필드 주소**를 구하고, 바깥 구조체 시작부터 그 필드까지의 Offset을 뺀다. 양쪽 계산이 같은 필드를 기준으로 하므로 다음 관계가 성립한다.

```text
바깥 구조체 시작 = 연결 멤버 주소 - 연결 멤버 Offset
                = next 필드 주소 - 바깥 구조체 안의 next 필드 Offset
```

예를 들어 설명용 객체가 `0x1000`에서 시작하고 연결 멤버가 Offset `0x20`에 있다면, 멤버의 주소는 `0x1020`이다. 8바이트 포인터 환경에서 `next` 필드가 그 안의 두 번째 포인터라면 `0x1028 - 0x28 = 0x1000`으로 같은 시작 주소를 얻는다. 이 숫자는 계산을 위한 예시이며 실제 `struct thread`의 Offset이 아니다.

포인터를 바이트 단위로 바꾸지 않고 `struct list_elem *`에서 같은 숫자를 빼면 원소 크기만큼 곱해져 계산이 달라진다. 또 Sentinel은 바깥 `struct thread`를 품은 데이터 원소가 아니므로 `list_entry()`에 넣어 Thread처럼 읽어서는 안 된다. 빈 List의 `list_begin()`이 tail을 반환하는 경우를 먼저 처리해야 하는 이유다. [PintOS list_entry 정의](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/lib/kernel/list.h#L101)

올바른 타입·멤버와 살아 있는 객체가 필요하다. `elem`으로 얻은 주소에서 `donation_elem`의 Offset을 빼면 다른 위치를 바깥 구조체로 해석한다. 숫자로 주소가 계산되었다고 올바른 객체가 되는 것은 아니다.

## 같은 객체가 여러 목록에 참여할 때

Thread는 실행 후보이면서 전체 Thread 목록의 구성원일 수 있다. 이때 같은 객체 안에 서로 다른 연결 멤버를 두면 된다. 현재 PintOS의 구분은 다음과 같다.

| 연결 | 사용하는 목록 |
|---|---|
| `elem` | Ready, Sleep, Semaphore 대기, 지연 해제 목록 중 해당 시점의 한 곳 |
| `donation_elem` | 자신이 기다리는 Lock 소유자의 Donation 목록 |
| `all_elem` | 전체 Thread를 추적하는 `all_list` |
| `child_status.elem` | 부모가 보관하는 자식 상태 레코드 목록 |

한 Thread가 Semaphore에서 기다리면서 `all_list`에도 남아 있는 것은 가능하다. 두 목록이 다른 멤버를 사용하기 때문이다. 같은 `elem`을 Ready와 Sleep에 동시에 끼우는 것은 불가능하다. 두 목록이 서로 다른 이웃을 같은 `prev`·`next`에 쓰면서 연결을 훼손한다. [현재 Thread의 연결 멤버](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/thread.h#L126)

다음 C 예제는 작은 `task` 객체를 두 목록에 연결하고, 서로 다른 멤버에서 같은 바깥 객체를 찾는다. 실제 PintOS 구조체나 Kernel을 쓰지 않는 독립 프로그램이다. Offset은 하드코딩하지 않고 실행 환경의 `offsetof()`로 얻는다.

```run-c
#include <assert.h>
#include <stddef.h>
#include <stdio.h>

struct link { struct link *prev, *next; };
struct list { struct link head, tail; };
struct task {
    const char *name;
    struct link ready;
    struct link all;
};

static void init(struct list *list) {
    list->head.prev = NULL;
    list->head.next = &list->tail;
    list->tail.prev = &list->head;
    list->tail.next = NULL;
}

static void append(struct list *list, struct link *item) {
    item->prev = list->tail.prev;
    item->next = &list->tail;
    item->prev->next = item;
    list->tail.prev = item;
}

static void unlink_item(struct link *item) {
    item->prev->next = item->next;
    item->next->prev = item->prev;
    /* PintOS list_remove처럼 제거한 원소의 포인터는 지우지 않는다. */
}

int main(void) {
    struct list ready, all;
    struct task a = {.name = "A"}, b = {.name = "B"};
    init(&ready);
    init(&all);
    append(&ready, &a.ready);
    append(&ready, &b.ready);
    append(&all, &a.all);
    append(&all, &b.all);

    struct task *from_ready = (struct task *)
        ((char *)ready.head.next - offsetof(struct task, ready));
    struct task *from_all = (struct task *)
        ((char *)all.head.next - offsetof(struct task, all));
    assert(from_ready == &a && from_all == &a);
    printf("서로 다른 연결로 찾은 객체: %s, %s\n", from_ready->name, from_all->name);

    unlink_item(&a.ready);
    assert(ready.head.next == &b.ready && all.head.next == &a.all);
    printf("ready에서 A 제거: B가 첫 원소\n");
    printf("all에는 A 유지: %s\n", all.head.next == &a.all ? "yes" : "no");
    printf("제거한 연결의 포인터가 남음: %s\n",
           a.ready.prev != NULL && a.ready.next != NULL ? "yes" : "no");
    append(&ready, &a.ready);
    assert(ready.head.next == &b.ready && ready.tail.prev == &a.ready);
    printf("A를 다시 삽입: B -> A\n");
    return 0;
}
```

실행 결과:

```text
서로 다른 연결로 찾은 객체: A, A
ready에서 A 제거: B가 첫 원소
all에는 A 유지: yes
제거한 연결의 포인터가 남음: yes
A를 다시 삽입: B -> A
```

List에서 A의 `ready` 연결을 제거해도 `all` 연결은 남는다. 바깥 객체를 해제하려면 이렇게 다른 목록에서 참조하는지도 확인해야 한다. 하나의 노드가 빠졌다는 사실이 객체의 모든 사용이 끝났다는 뜻은 아니다.

Intrusive List는 연결을 추가할 때 별도 노드 할당을 요구하지 않는다는 장점이 있다. 반면 데이터 타입이 List용 필드를 알아야 하며, 연결 멤버마다 소속과 수명을 관리해야 한다. 일반적인 비침입형 List도 이미 할당한 노드나 Pool을 사용할 수 있으므로 삽입마다 반드시 `malloc()`한다고 비교하지 않는다. 같은 데이터를 여러 별도 노드가 가리킬 수 있다는 것과, 동일한 연결 노드가 여러 목록에 동시에 들어간다는 것도 다르다. Cache 이점은 실제 메모리 배치와 접근 패턴에 따라 달라진다.

## 제거 후 남아 있는 포인터의 의미

PintOS `list_remove()`는 이웃의 연결을 고친 뒤 다음 원소를 반환하지만 제거한 원소의 포인터는 지우지 않는다. 위 예제도 같은 성질을 드러낸다. `prev`와 `next`가 NULL이 아니라고 그 원소가 아직 목록에 속해 있다고 판단할 수 없다.

제거한 원소는 분리된 채로 둘 수 있다. 곧바로 다시 삽입해야 하는 규칙은 없다. 나중에 유효한 목록에 한 번 삽입하면 그때 연결 필드를 새 이웃으로 덮어쓴다. 문제는 같은 원소를 다시 제거하거나, 다른 용도로 재사용한 뒤 예전 목록 소속이라고 생각하고 조작하는 경우다.

순회하며 제거할 때는 `list_remove()`가 반환한 다음 원소를 보관하거나 제거 전에 다음 위치를 확보한다. 제거한 객체를 해제하고 나서 `e->next`를 읽으면 이미 수명이 끝난 메모리 접근이 된다. 삽입·삭제 중 여러 포인터의 불변식이 잠시 깨질 수 있으므로, 한 포인터 대입이 원자적이라는 사실만으로 List 전체가 동시 접근에 안전해지지 않는다.

현재 우선순위 비교 함수는 엄격한 `>`를 사용한다. `list_insert_ordered()`는 새 원소가 먼저 와야 하는 지점에서 멈추므로, 기존 순서가 유효한 상태에서 같은 우선순위 원소는 기존 동률 원소 뒤에 들어간다. `>=`로 바꾸면 비교 규약과 동률 처리가 달라진다. 이후 우선순위 값이 변경되면 정렬을 다시 맞추는 경로가 별도로 필요하다. [정렬 삽입](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/lib/kernel/list.c#L415)

## Linux의 원형 List와 container_of

Linux v6.12의 `list_head`도 객체 안에 연결 멤버를 넣지만, 하나의 Sentinel이 원을 이루는 구조다. 빈 List에서는 head의 `next`와 `prev`가 자기 자신을 가리킨다. PintOS처럼 서로 다른 head·tail을 두고 바깥쪽을 NULL로 끝내는 구조와 구분한다. [Linux List 정의](https://github.com/torvalds/linux/blob/v6.12/include/linux/types.h), [원형 List 초기화](https://github.com/torvalds/linux/blob/v6.12/include/linux/list.h)

`container_of(ptr, type, member)`는 멤버 주소에서 Offset을 빼는 같은 원리를 쓰며 List 외의 포함 관계에도 적용한다. 현재 정의는 `include/linux/container_of.h`에 있다. 입력 포인터와 멤버 타입이 일치하거나 void인지를 `static_assert`로 검사하지만, 같은 타입인 두 멤버를 잘못 지정한 경우까지 논리적으로 판별하지는 못한다. 객체 수명이나 실제 소속도 검사 대상이 아니다.

이 매크로는 Statement Expression, `typeof`, GNU 방식의 `void *` 산술 등 Kernel의 Compiler 환경을 전제로 한다. 모든 C 환경에 그대로 옮길 수 있는 표준 라이브러리 함수는 아니다. 기본 `container_of`는 입력의 const를 잃을 수 있으며, 이를 보존하는 `container_of_const`도 따로 정의되어 있다. [Linux v6.12 container_of](https://github.com/torvalds/linux/blob/v6.12/include/linux/container_of.h)

## GDB에서 목록과 연결 멤버를 함께 확인하기

다음은 일치하는 Debug Symbol로 PintOS를 멈춘 뒤 Ready Queue를 읽는 절차다. Kernel 함수를 호출하지 않고 필드 주소에서 Offset을 계산한다. 실행 결과를 옮긴 로그는 아니다.

```gdb
set $sample = (struct thread *)((unsigned long)$rsp & ~0xfffUL)
set $offset = (char *)&$sample->elem - (char *)$sample
set $e = ready_list.head.next
set $end = &ready_list.tail
set $count = 0
while $e != 0 && $e != $end && $count < 128
  set $t = (struct thread *)((char *)$e - $offset)
  p $t->name
  p $t->status
  p $t->priority
  p/x $e->prev
  p/x $e->next
  set $e = $e->next
  set $count = $count + 1
end
p $count
p $e == $end
```

128개 제한은 손상된 순환 연결을 끝없이 따라가지 않기 위한 관찰 한도다. 실제 Thread 수가 더 많을 수도 있으므로 한도에 닿았다고 곧바로 손상이라고 판단하지 않는다. NULL 종료, 예상 밖의 순환, 이웃의 역방향 불일치가 있다면 삽입·제거 순서를 확인한다. 잘못된 주소에서는 Debugger의 메모리 읽기 자체도 실패할 수 있다.

`all_list`를 순회할 때는 반드시 `all_elem`의 Offset을 사용한다. Semaphore를 보려면 함수 첫 명령에서 인자 주소를 확보한 뒤 그 Semaphore의 `waiters.head.next`와 `waiters.tail`을 같은 방식으로 비교한다. `sema_down()`에 막 진입한 순간은 아직 자신을 대기 목록에 넣기 전일 수 있다. RUNNING Thread의 `elem`에 옛 포인터가 남아 있다는 이유만으로 Ready Queue 소속이라고 결론 내리지 않는다.

QEMU의 `info threads`나 `thread apply all`은 Debugger가 보는 실행 단위를 다룬다. PintOS의 전체 Thread 목록이 필요하면 Guest의 `all_list`를 관찰해야 한다. 어떤 멤버로 어느 목록에 연결되었는지가 주소 해석의 출발점이다.
