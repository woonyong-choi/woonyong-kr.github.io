---
layout: default
title: Semaphore
nav_order: 4
permalink: /wiki/computer-systems-network-topic-fef68d934a03/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-fef68d934a03
projection_sha256: ebd7bf36b3e1b0712b95ab18c2f5471f4b453149d24f3c2ac646f30dc8652769
parent: 동기화
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-cd8cd4ad9254
search_terms:
- 세마포어
- Semaphore
- P
- V
- sema_down
- sema_up
- sema_try_down
- Futex
- Lost Wakeup
grand_parent: OS
ancestor: CS 기초
---

# Semaphore
{: .no_toc }

Semaphore는 사용할 수 있는 횟수를 세고, 그 횟수가 0이면 호출한 Thread를 기다리게 한다. 남은 횟수를 하나 소비하는 연산이 `down`이고, 하나 돌려주는 연산이 `up`이다. 문헌에서는 각각 P와 V라고도 부른다.

연결 3개를 공유하는 Pool이라면 처음 값을 3으로 두고, 연결을 가져갈 때 `down`, 반납할 때 `up`을 호출할 수 있다. 반면 작업 완료를 기다리는 용도라면 0에서 시작한다. 이때 생산자가 먼저 `up`을 호출해도 값 1이 남으므로 나중의 `down`은 기다리지 않는다.

## 횟수를 세는 도구와 소유자를 기록하는 도구

Semaphore에는 일반적으로 소유자가 없다. A가 `down`하고 B가 `up`하는 완료 통지를 표현할 수 있는 이유다. 같은 Thread가 획득과 해제를 책임지는 [Mutex](/wiki/computer-systems-network-topic-6295090885b6/)와 구분해야 한다.

Binary Semaphore는 값이 0과 1 사이에서 움직이도록 사용하는 형태다. 초기값을 1로 설정했다는 사실만으로 모든 구현이 최대값 1을 강제하지는 않는다. PintOS의 `sema_up()`은 단순히 값을 증가시키므로 두 번 잘못 호출하면 2가 될 수 있다. 자원 수만큼 획득·반납한다는 사용 규칙도 함께 지켜야 한다.

## PintOS에서는 어디에 기다리는가

이 문서의 구현 기준은 [lrn-pintos의 `synch.c`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)와 [구조체 선언](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/synch.h)이다.

```c
struct semaphore {
    unsigned value;
    struct list waiters;
};
```

`waiters`에는 기다리는 `struct thread` 전체가 아니라 그 안의 `elem`이 연결된다. 이 필드는 Thread가 READY일 때는 `ready_list`, Semaphore에서 BLOCKED일 때는 해당 `waiters`에 속한다. 같은 노드를 두 List에 동시에 넣을 수 없으므로, 깨울 때는 먼저 대기 List에서 빼고 Ready Queue에 넣어야 한다. Donation에 쓰는 `donation_elem`은 별도 필드다.

`sema_down()`은 다음 순서로 동작한다.

1. 이전 Interrupt 상태를 저장하고 Interrupt를 끈다.
2. `value == 0`이면 현재 Thread를 우선순위 순서로 `waiters`에 넣고 `thread_block()`을 호출한다.
3. 나중에 다시 실행되면 `while` 조건부터 검사한다.
4. 값이 양수일 때만 1을 빼고 이전 Interrupt 상태로 복원한다.

반복문은 Busy Waiting이 아니다. 값이 0인 각 시도 사이에 Thread가 BLOCKED가 되어 CPU를 다른 Thread에 넘긴다. 반대로 `sema_try_down()`은 값이 0이면 곧바로 `false`를 반환하고, 양수이면 감소시킨 뒤 `true`를 반환한다.

## 깨우기와 획득 사이에 생기는 틈

`sema_up()`은 Interrupt를 끈 뒤 대기자가 있으면 List를 다시 정렬하고 가장 앞의 Thread 하나를 깨운다. 그다음 `value`를 증가시키고 이전 Interrupt 상태를 복원한 뒤 `check_preemption()`을 호출한다.

정렬을 다시 하는 이유는 기다리는 동안 Donation으로 우선순위가 바뀔 수 있기 때문이다. 깨워진 Thread는 READY가 될 뿐, 그 순간 토큰을 소유하지 않는다. 실제로 토큰을 소비하는 곳은 다시 실행된 `sema_down()`의 감소 연산이다. 그 전에 다른 Thread가 토큰을 가져가면 원래 대기자는 다시 잠들어야 한다. 단일 CPU에서도 이런 끼어들기는 가능하다.

다음 예제는 실행 순서를 직접 지정한 모델이다. A를 먼저 깨운 뒤 C가 토큰을 가져가게 하면, A가 재개되어도 다시 BLOCKED가 된다. 실제 Kernel Scheduler나 Interrupt를 실행하는 코드는 아니다.

```run-python
from collections import deque


class Semaphore:
    def __init__(self, value=0):
        if value < 0:
            raise ValueError("value must be nonnegative")
        self.value = value
        self.waiters = deque()
        self.ready = []

    def down(self, name):
        if self.value == 0:
            self.waiters.append(name)
            return "BLOCKED"
        self.value -= 1
        return "ACQUIRED"

    def up(self, priorities):
        selected = None
        if self.waiters:
            selected = max(self.waiters, key=lambda name: priorities[name])
            self.waiters.remove(selected)
            self.ready.append(selected)
        self.value += 1
        return selected


priorities = {"A": 40, "B": 20, "C": 50}
s = Semaphore()
print("A down:", s.down("A"))
print("B down:", s.down("B"))
print(f"up: selected={s.up(priorities)}, value={s.value}, ready={s.ready}")
print("C before A resumes:", s.down("C"))
s.ready.remove("A")
print(f"A resumes: {s.down('A')}, waiters={list(s.waiters)}")
print(f"next up: selected={s.up(priorities)}, value={s.value}")
s.ready.remove("A")
print(f"A retry: {s.down('A')}, value={s.value}")

event = Semaphore()
event.up({})
print(f"signal before wait: {event.down('receiver')}, value={event.value}")
event.up({})
event.up({})
print("extra up calls:", event.value)
```

실행 결과:

```text
A down: BLOCKED
B down: BLOCKED
up: selected=A, value=1, ready=['A']
C before A resumes: ACQUIRED
A resumes: BLOCKED, waiters=['B', 'A']
next up: selected=A, value=1
A retry: ACQUIRED, value=0
signal before wait: ACQUIRED, value=0
extra up calls: 2
```

C가 호출하는 `down`을 빼면 A의 첫 재시도가 성공한다. `priorities`의 값을 바꾸면 깨울 대기자도 달라진다. 마지막 두 줄은 먼저 도착한 통지를 저장하는 성질과, 잘못된 추가 `up`을 Binary Semaphore가 자동으로 막아 주지는 않는다는 점을 보여 준다.

이 모델은 현재 우선순위를 비교해 한 명을 고른다. PintOS의 List 정렬 알고리즘이나 선점 시점까지 복제하지는 않는다.

## Interrupt를 끈 범위와 잠든 시간을 구분하기

Interrupt를 끄면 해당 CPU에서 마스크 가능한 Interrupt의 처리를 미룬다. 장치가 사건을 발생시키거나 Interrupt가 Pending 상태가 되는 것까지 없애지는 않는다. 또한 `thread_block()`처럼 명시적으로 Scheduler를 호출하는 동작을 막는 것도 아니다.

따라서 `sema_down()`이 돌아오기까지 걸린 시간 전체를 Interrupt 비활성 시간으로 계산하면 틀린다. 현재 Thread가 잠든 뒤 실행되는 다른 Thread는 Interrupt를 켤 수 있다. 보호하려는 것은 값 검사와 대기 등록·상태 변경 사이의 짧은 구간이다. SMP에서는 한 CPU의 Interrupt를 끄는 것만으로 다른 CPU의 접근을 막을 수 없다.

`sema_down()`은 잠들 수 있으므로 외부 Interrupt Handler에서 호출할 수 없다. `sema_try_down()`과 `sema_up()`은 해당 문맥에서 사용할 수 있지만, `up`이 선점을 유발할 수 있다는 점은 남는다. Thread 문맥에서는 양보하고, Interrupt 문맥에서는 [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/) 반환 시점의 양보를 예약한다. “기다리지 않는다”와 “호출 중 다른 Thread가 실행되지 않는다”는 서로 다른 말이다.

성능도 하나의 상수로 설명하기 어렵다. 대기자 n명을 정렬하는 `up`에는 O(n log n), m명이 있는 Ready Queue에 삽입하는 과정에는 O(m)이 들 수 있고 실제 Context Switch 비용은 별개다. `down`도 대기 등록 없이 통과하는 경우와 List 삽입·대기·재시도를 거치는 경우가 다르다.

## 현재 저장소에서 확인할 사용 예

`threads/thread.c`의 `idle_started`는 초기값 0인 완료 통지다. 부팅 Thread는 Idle Thread의 준비가 끝날 때까지 기다리고, Idle Thread가 `sema_up()`으로 이를 알린다. `sema_self_test()`는 두 Semaphore를 번갈아 올리고 내리는 왕복을 10회 수행하도록 작성되어 있다.

`userprog/process.c`의 Fork에서도 부모가 자식의 복제 완료를 기다린다. 부모가 기다리는 대상은 생성한 자식의 `child_status`에 있는 `fork_sema`이며, 부모 자신의 `self_status`와 혼동하면 안 된다. 자식은 복제 성공·실패 경로에서 같은 완료 통지를 보낸다.

자식 종료를 기다리는 `process_wait()`는 같은 상태 객체의 `wait_sema`와 `exited`를 사용한다. 자식은 종료 사실을 기록하고 Semaphore를 올린다. 부모가 먼저 기다리는 경우와 자식이 먼저 종료한 경우를 모두 살펴야 하며, 초기값 0이라는 이유만으로 언제나 Block한다고 판단하지 않는다.

반면 현재 [Alarm Clock](/wiki/computer-systems-network-alarm-clock-4f0f0546530e/) 구현은 `sleep_list`의 Thread를 직접 깨운다. 이 경로에 Thread별 `timer_sema`가 있다고 가정하면 실제 코드를 잘못 추적하게 된다.

[priority-sema 테스트](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/tests/threads/priority-sema.c)는 우선순위 21부터 30까지의 대기자 10명을 만들고 높은 순서로 깨우는지 검사한다. `priority-donate-sema`에서는 Lock을 가진 L이 Semaphore에서 기다리는 중에 H의 우선순위를 기부받는다. main의 `up`은 M보다 L을 먼저 깨워야 한다. 이는 테스트 소스가 정한 기대 동작이며, 여기서 Kernel 테스트를 실행했다는 뜻은 아니다.

## GDB에서 대기 List를 읽기

다음 명령은 디버그 심볼이 있는 Kernel을 연결한 뒤 사용하는 관찰 도구다. `list_entry` 매크로나 `thread_current()`의 Inferior Call을 실행하지 않고, 디버그 타입에서 필드 위치를 구한다. 호출자는 `dump-sema sema`처럼 유효한 Semaphore 주소를 넘긴다.

```gdb
define dump-sema
  set $s = (struct semaphore *)$arg0
  set $e = $s->waiters.head.next
  set $end = &$s->waiters.tail
  set $off = (unsigned long)&((struct thread *)0)->elem
  set $i = 0
  printf "value=%u\n", $s->value
  while $e != $end && $e != 0 && $i < 128
    set $t = (struct thread *)((char *)$e - $off)
    printf "[%d] %s priority=%d status=%d\n", $i, $t->name, $t->priority, $t->status
    set $e = $e->next
    set $i = $i + 1
  end
  if $e != $end
    printf "stopped before tail: check address or traversal limit\n"
  end
end
break sema_down
break sema_up
```

함수 진입 시의 List 첫 원소가 곧 깨울 Thread라고 단정하면 안 된다. `sema_up()` 내부의 정렬이 끝나기 전에는 우선순위 변경이 List 순서에 반영되지 않았을 수 있다. 정렬 전후와 `thread_unblock()`의 인자를 함께 확인한다.

LP64에서 현재 선언을 그대로 배치하면 `value`는 offset 0, `waiters`는 8, Semaphore 크기는 40바이트로 예상된다. 이는 `unsigned` 4바이트, Pointer 8바이트, 두 Sentinel을 가진 List 32바이트라는 전제의 계산이다. 실제 디버그 대상은 `ptype /o struct semaphore`, `p sizeof(struct semaphore)`로 확인한다. 임의 주소나 고정된 `thread.elem` offset을 관찰 결과처럼 사용하지 않는다.

## 다른 운영체제와 비교할 때

[Linux v6.12의 Kernel Semaphore](https://github.com/torvalds/linux/blob/v6.12/kernel/locking/semaphore.c)는 `raw_spinlock_t`, `count`, `wait_list`를 사용한다. 대기자가 있으면 List 첫 항목을 제거하고 그 대기자의 `up` 표시를 설정한다. PintOS처럼 공용 값을 증가시킨 뒤 깨운 Thread가 다시 경쟁하는 방식과 다르다. 이 버전의 코드를 PintOS에 그대로 대입해서는 안 된다. Linux에는 Signal로 중단하는 대기와 Timeout을 지정하는 대기도 별도 API로 존재한다.

사용자 공간의 [Futex](https://man7.org/linux/man-pages/man2/futex.2.html)는 또 다른 층이다. 4바이트 정렬된 32비트 Word를 기준으로 값을 비교하고 잠드는 동작을 연결한다. 이는 `pthread_mutex_t` 전체가 4바이트라는 뜻이 아니다. 경쟁이 없을 때의 원자 연산은 라이브러리가 수행할 수 있고, 잠들 필요가 있을 때 Kernel에 요청한다. Word 값을 바꾸는 것만으로 이미 잠든 Thread가 자동으로 깨어나는 것도 아니다. 대기 조건과 Wake 호출을 함께 설계해야 한다.
