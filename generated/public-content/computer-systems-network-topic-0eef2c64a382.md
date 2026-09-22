---
layout: default
title: 우선순위 기부
nav_order: 4
permalink: /wiki/computer-systems-network-topic-0eef2c64a382/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-0eef2c64a382
projection_sha256: aa6a054436432236648fe5303a79d7d3bf53c57cd50b0182ecc2fc6c9ccf6f14
parent: 스레드 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-936b351311c8
search_terms:
- Priority Donation
- Priority Inversion
- Priority Inheritance
- donation_list
- donation_elem
- waiting_lock
- Nested Donation
- refresh_priority
- Priority Ceiling
grand_parent: PintOS
ancestor: CS 기초
---

# 우선순위 기부
{: .no_toc }

높은 우선순위의 Thread가 Lock을 기다리고 있다면 누구에게 CPU를 주어야 할까? 기다리는 Thread를 계속 고를 수는 없다. 먼저 Lock을 놓을 수 있는 Thread가 실행되어야 한다. 우선순위 기부(Priority Donation)는 이 의존성을 스케줄링에 반영한다.

## 먼저 실행되어야 하는 Lock 소유자

L(10)이 Lock A를 가진 상태에서 H(50)가 A를 요청하면 H는 기다린다. 이때 A와 무관한 M(30)이 실행 가능해지면, 우선순위만 비교하는 Scheduler는 L보다 M을 먼저 고른다. H보다 낮은 M의 실행이 L의 Lock 해제를 늦추고 H의 대기도 늘리는 우선순위 역전(Priority Inversion)이다.

H가 L에게 우선순위 50을 기부하면 L은 M보다 먼저 선택될 수 있다. L이 A를 해제한 뒤에는 H가 다시 실행 가능해진다. H가 가진 CPU 시간을 L에게 옮기거나 H를 대신 실행하는 것은 아니다. Scheduler가 비교하는 L의 우선순위를 일시적으로 바꾼다.

중간 우선순위 작업이 계속 공급되면 기부 없는 H의 대기는 임계 구역 길이만으로 제한되지 않는다. 이를 Unbounded Priority Inversion이라고 한다. 반대로 기부를 사용해도 Lock 소유자가 I/O나 다른 사건을 기다리면 즉시 진행할 수 없다. 기부는 모든 대기 시간을 없애거나 Deadline을 자동으로 보장하는 장치가 아니다.

Lock에는 소유자(holder)가 있으므로 기부할 대상을 찾을 수 있다. 일반 Semaphore에는 이런 소유권이 없다. `down()`한 Thread와 `up()`하는 Thread가 달라도 되므로, Semaphore 대기만 보고 기부 대상을 정할 수는 없다. 다만 Lock을 가진 Thread가 별도의 Semaphore에서 기다리는 동안 Lock 대기자로부터 기부받는 상황은 가능하다.

## 기본값과 유효 우선순위를 나눈다

이 문서는 `lrn-pintos`의 기본 우선순위 모드를 기준으로 한다. MLFQS 모드에서는 현재 `lock_acquire()`와 `lock_release()`가 Donation 처리를 건너뛴다. [PintOS의 Lock 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)

`base_priority`는 기부가 없을 때 사용할 기본값이고 `priority`는 지금 Scheduler가 비교하는 유효 우선순위다. 기본값도 `thread_set_priority()`로 바뀔 수 있으므로, 생성 당시의 값을 영원히 보관하는 필드는 아니다.

| 필드 | 담고 있는 관계 |
|---|---|
| `priority` | 현재 비교할 유효 우선순위 |
| `base_priority` | 기부와 별도로 설정한 기본 우선순위 |
| `donation_list` | 이 Thread에게 직접 기부한 대기자 목록 |
| `donation_elem` | 다른 소유자의 기부 목록에 들어가는 List Node |
| `waiting_lock` | 현재 획득을 기다리는 Lock |

L의 기본값이 10이고 A를 기다리는 H(60), B를 기다리는 M(40)이 있다면 L의 유효 우선순위는 60이다. A를 놓은 뒤에도 B의 기부가 남으므로 40으로 내려가야 한다. B까지 놓아야 10으로 돌아간다. Lock 하나를 해제하면서 목록 전체를 비우거나 무조건 기본값을 대입하면 남은 기부를 잃는다.

`refresh_priority()`는 기본값부터 시작해 기부 목록을 현재 donor 우선순위로 정렬하고 맨 앞 값과 비교한다. donor 자신도 기부받을 수 있으므로 목록에 들어올 때의 숫자를 복사해 두는 것과 다르다. n명이면 이 구현의 정렬 비용은 O(n log n), 정렬 후 맨 앞 조회는 O(1)이다. 전체 기부·해제 비용을 조회 한 번의 비용으로 설명해서는 안 된다. [우선순위 재계산](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

`thread_set_priority()`는 기본값을 바꾸고 재계산한 뒤 선점 여부를 검사한다. 기부 60을 받고 있을 때 기본값을 10에서 20으로 바꾸어도 유효 우선순위는 60이다. 나중에 기부가 사라지면 새 기본값 20으로 돌아간다.

## Lock을 기다리는 동안 이어지는 포인터

현재 `lock_acquire()`는 소유자가 있으면 다음 순서로 기부 관계를 만든다.

1. 현재 Thread의 `donation_elem`을 소유자의 `donation_list`에 넣는다.
2. 현재 Thread의 `waiting_lock`에 요청한 Lock을 기록한다.
3. 소유자의 우선순위를 현재 Thread의 유효 우선순위 이상으로 올린다.
4. 소유자도 다른 Lock을 기다리고 있다면 다음 소유자에게 전파한다.
5. `sema_down()`으로 획득을 기다린다. 성공한 뒤 `waiting_lock`을 비우고 새 소유자를 기록한다.

예를 들어 H가 M의 Lock B를 기다리고 M이 L의 Lock A를 기다리면 `H → B → M → A → L`로 이어진다. H의 기부를 M에서 멈추면 L이 여전히 낮은 우선순위여서 A를 해제하기 어렵다. H의 우선순위가 L까지 전달되어야 한다.

이때 H를 모든 소유자의 `donation_list`에 넣지는 않는다. H는 M의 직접 donor이고 M은 L의 직접 donor다. M의 유효 우선순위가 올라간 상태에서 L도 그 영향을 받는다. 하나의 `donation_elem`을 여러 List에 동시에 연결하면 링크가 깨진다.

`donation_elem`과 `elem`도 서로 다른 Node다. Lock을 기다리는 H는 `donation_elem`으로 소유자의 기부 목록에, `elem`으로 Semaphore 대기 목록에 들어갈 수 있다. 같은 `elem`은 Ready Queue와 Semaphore 대기 목록에서 번갈아 사용하지만 두 목록에 동시에 넣지 않는다. [Thread 필드](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/thread.h)

## 전파 깊이는 무엇을 세는가

현재 코드는 직접 소유자를 한 번 갱신한 **뒤에** `while (idx < 7)`을 수행한다. 따라서 직접 기부 1회와 추가 전파 최대 7회, 합계 최대 8명의 소유자를 방문한다. `waiting_lock` 또는 다음 소유자가 없으면 더 일찍 끝난다. 이미 충분히 높은 우선순위를 만났다는 이유만으로 루프를 끝내지는 않는다.

`priority-donate-chain` 테스트의 숫자는 이 구현 한계와 구분해야 한다. `NESTING_DEPTH = 8`은 main과 donor 7개를 포함하는 Thread 수다. 실제 Lock 배열은 7개이며 donor의 우선순위는 `3, 6, 9, …, 21`이다. main은 0에서 시작한다. 마지막 T7의 기부가 T6부터 main까지 도달할 때는 소유자 7명을 방문하므로 직접 1회와 추가 6회가 필요하다. 소스의 오래된 주석에 나오는 Lock 7과 달리 실제 배열과 접근 범위는 Lock 0–6이다. [체인 테스트 본체](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/tests/threads/priority-donate-chain.c)

T1은 Lock 1을 가진 채 Lock 0을 기다리고, T6는 Lock 6을 가진 채 Lock 5를 기다린다. T7은 새 Lock을 먼저 잡지 않고 Lock 6을 기다린다. donor i보다 1 낮은 우선순위의 interloper는 기부가 끊어졌을 때 먼저 실행될 수 있는 작업이다. 테스트는 donor가 끝난 뒤 해당 interloper가 실행되기를 기대한다. 이는 테스트가 요구하는 순서이며, 여기서 PintOS를 실행해 얻은 로그는 아니다.

깊이 제한은 탐색을 끝낼 뿐이다. Lock 대기가 순환하면 기부 루프가 끝난 뒤에도 Thread는 계속 기다릴 수 있다. 따라서 “8번 안에 멈춘다”와 “교착을 해결한다”는 서로 다른 조건이다. 순환 대기 자체는 [교착 상태](/wiki/computer-systems-network-topic-41c6d9a5eb18/)에서 다룬다.

## 값의 전파와 복원을 실행해 보기

다음 Python 모델은 기부 관계와 우선순위 값만 변경한다. 실제 Thread 선택, Semaphore 깨우기, Lock 소유권 이전, IRQ와 경쟁 조건은 실행하지 않는다. 두 Lock에서 받은 기부, 기본값 변경, 테스트와 같은 7명 체인, 구현 한계를 넘는 체인을 차례로 비교한다.

```run-python
class Thread:
    def __init__(self, name, base):
        self.name = name
        self.base = self.priority = base
        self.waiting = None
        self.donors = []

class Lock:
    def __init__(self, holder):
        self.holder = holder

def wait_for(thread, lock):
    assert thread.waiting is None and lock.holder is not None
    thread.waiting = lock
    holder = lock.holder
    holder.donors.append(thread)
    visited = []
    # 직접 holder 1명과 추가 holder 최대 7명의 값만 갱신한다.
    for _ in range(8):
        holder.priority = max(holder.priority, thread.priority)
        visited.append(holder.name)
        if holder.waiting is None or holder.waiting.holder is None:
            break
        holder = holder.waiting.holder
    return visited

def refresh(thread):
    thread.priority = max([thread.base] + [d.priority for d in thread.donors])

def release(lock):
    holder = lock.holder
    holder.donors = [d for d in holder.donors if d.waiting is not lock]
    refresh(holder)
    lock.holder = None
    # 깨우기와 획득은 실행하지 않는다. 이 모델은 기부 기록만 다룬다.

low, medium, high = Thread("L", 10), Thread("M", 40), Thread("H", 60)
a, b = Lock(low), Lock(low)
wait_for(medium, b)
wait_for(high, a)
print(f"two locks: L={low.priority}, base={low.base}")
low.base = 20
refresh(low)
print(f"change base: L={low.priority}, base={low.base}")
release(a)
print(f"release A: L={low.priority}, donors={[d.name for d in low.donors]}")
release(b)
print(f"release B: L={low.priority}, donors={[d.name for d in low.donors]}")
assert low.priority == 20

threads = [Thread(f"T{i}", i * 3) for i in range(8)]
locks = [Lock(t) for t in threads[:-1]]
history = [threads[0].priority]
for i in range(1, 8):
    visited = wait_for(threads[i], locks[i - 1])
    history.append(threads[0].priority)
print(f"chain main: {history}")
print(f"T7 donation: {' -> '.join(visited)}")
assert history == [0, 3, 6, 9, 12, 15, 18, 21]
assert threads[0].donors == [threads[1]]  # T7를 모든 목록에 넣지 않는다.
release(locks[0])
print(f"release lock 0: main={threads[0].priority}, T1={threads[1].priority}")

# 깊이 한계를 분리해서 본다. 9번째 holder까지 이어지는 대기 관계를 준비한다.
holders = [Thread(f"P{i}", 1) for i in range(9)]
chain_locks = [Lock(t) for t in holders]
for i in range(8):
    holders[i].waiting = chain_locks[i + 1]
donor = Thread("D", 63)
visited = wait_for(donor, chain_locks[0])
print(f"depth limit: visited={len(visited)}, P7={holders[7].priority}, P8={holders[8].priority}")
assert len(visited) == 8 and holders[8].priority == 1
```

실행 결과:

```text
two locks: L=60, base=10
change base: L=60, base=20
release A: L=40, donors=['M']
release B: L=20, donors=[]
chain main: [0, 3, 6, 9, 12, 15, 18, 21]
T7 donation: T6 -> T5 -> T4 -> T3 -> T2 -> T1 -> T0
release lock 0: main=0, T1=21
depth limit: visited=8, P7=63, P8=1
```

A를 해제한 뒤 M의 기부가 남아 40을 유지하고, B까지 해제하면 변경한 기본값 20이 나타난다. 체인에서는 main의 값이 0부터 21까지 올라가지만 직접 donor는 T1 하나다. 마지막 예에서는 아홉 번째 소유자 P8이 갱신되지 않는다. 기본값이나 donor 값을 바꿔 본 뒤 어떤 값이 남을지 먼저 예상해 보면 기부의 수명이 드러난다.

## 해제 순서와 현재 구현의 한계

`lock_release()`는 donor의 `waiting_lock`이 해제할 Lock과 같은지 검사하고 해당 Node만 제거한다. 순회 중에는 다음 Node를 먼저 저장한다. 그 뒤 `refresh_priority()`, `holder = NULL`, `sema_up()`으로 이어진다. `sema_up()`은 현재 우선순위로 대기 목록을 다시 정렬하고 가장 높은 대기자를 깨운 뒤 선점을 검사한다. 깨우기와 실제 Lock 획득은 같은 동작이 아니며, 깨어난 Thread는 `sema_down()`의 조건을 다시 확인한다.

기부 원리를 이해했다고 현재 구현의 모든 경로가 올바르다고 결론 내릴 수는 없다. 이 버전의 `lock_acquire()`는 소유자의 `priority`를 직접 바꾸지만 READY인 소유자를 Ready Queue에서 재배치하지 않는다. `refresh_priority()`도 기부 목록만 정렬한다. Queue 중간에 있던 Thread의 숫자가 커져도 `next_thread_to_run()`은 맨 앞을 선택하므로 순서가 어긋날 수 있다. [우선순위 스케줄링](/wiki/computer-systems-network-topic-6276ce481024/)에서 값 변경과 Queue 재정렬을 비교한다.

또한 기부 등록·전파와 제거·재계산 전체를 감싸는 `intr_disable()`은 현재 두 Lock 함수에 없다. 안에서 호출하는 `sema_down()`과 `sema_up()`의 보호 구간을 바깥 List 갱신까지 확장해 해석하면 안 된다. 한 CPU에서도 Interrupt에 의해 실행 흐름이 끼어들 수 있다. 이 사실은 코드로 확인되는 보호 범위의 한계이며, 특정 경쟁 오류를 이 문서에서 재현했다는 뜻은 아니다.

Timeout이나 대기 취소에 따른 기부 철회 경로도 이 Lock API에는 없다. 새 대기자에게 소유권이 넘어갈 때 남은 대기 관계를 어떻게 관리하는지, 우선순위 변경이 이미 연결된 Queue에 어떻게 반영되는지도 구현을 확장할 때 함께 확인해야 한다. Lock 원본 코드를 수정한 결과로 설명하지 않는다.

## 테스트와 GDB에서 확인할 관계

테스트는 서로 다른 조건을 만든다. 한 테스트의 기대값을 모든 기부 경로의 실행 증거로 쓰지 않는다.

| 테스트 | 확인하는 조건 |
|---|---|
| `priority-donate-one` | 같은 Lock의 두 대기자로 기본 31이 32, 33으로 상승 |
| `priority-donate-multiple` | 여러 Lock 중 하나를 놓아도 남은 기부 유지 |
| `priority-donate-lower` | 기부 중 기본값을 낮추고 기부가 끝난 뒤 복원 |
| `priority-donate-nest` | H(33) → M(32) → L(31)의 2명 소유자 전파 |
| `priority-donate-chain` | main과 donor 7개의 체인 및 interloper 순서 |
| `priority-donate-sema` | Semaphore에서 기다리는 Lock 소유자의 기부 반영 |

준비된 PintOS Threads 빌드 디렉터리에서는 `make check TESTS=tests/threads/priority-donate-chain`처럼 테스트의 전체 경로를 지정한다. 필요한 Cross Compiler와 QEMU가 설치되어 있어야 한다. 위 Python 실행은 이 커널 테스트의 통과 기록을 대신하지 않는다. [테스트 실행 규칙](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/tests/Make.tests)

GDB에서는 `lock_acquire`, `lock_release`, `refresh_priority`에 중단점을 두고, 해당 지역 변수가 대입된 지점까지 진행한 뒤 확인한다. 함수 진입 때의 `waiting_lock`과 `priority`를 완료 후 값으로 읽지 않는다. 아래에서는 조사할 `struct thread *`를 `$t`에 넣었다고 가정한다.

```gdb
set $donation_offset = (unsigned long)&((struct thread *)0)->donation_elem
set $e = $t->donation_list.head.next
while $e != &$t->donation_list.tail
  set $donor = (struct thread *)((char *)$e - $donation_offset)
  p $donor->name
  p $donor->priority
  p $donor->waiting_lock
  set $e = $e->next
end
set $holder = $t
set $depth = 0
while $holder != 0 && $depth < 9
  p $holder->name
  p $holder->priority
  p $holder->base_priority
  set $lock = $holder->waiting_lock
  if $lock == 0
    set $holder = 0
  else
    set $holder = $lock->holder
  end
  set $depth = $depth + 1
end
```

이 명령은 메모리를 읽으며 커널 함수를 호출하지 않는다. 반복 한계에 닿으면 체인이 끝났다고 단정하지 말고 같은 주소의 재등장이나 더 긴 체인을 구분한다. `refresh_priority()` 전후에는 `t`의 주소를 보존해 값을 비교한다. 함수 종료 시 RDI가 여전히 처음 인자를 가리킨다고 가정하지 않는다.

현재 64-bit 선언에서 `donation_elem`과 `elem`의 예상 Offset은 각각 `0x48`, `0x60`이다. `priority=0x08`, `base_priority=0x0c`, `wake_tick=0x10`, `name=0x18`, `donation_list=0x28`, `waiting_lock=0x58`로 이어지는 앞부분 배치에서 계산한 값이다. Debug Symbol의 `p/x (unsigned long)&((struct thread *)0)->donation_elem`로 해당 빌드의 실제 배치를 확인한다. 예를 들어 시작 주소를 임의로 `0x80005000`이라 두면 donor Node는 `0x80005048`이고, 여기서 Offset을 빼야 Thread 주소로 돌아간다. 이 주소는 실행에서 수집한 값이 아니다.

PintOS의 `list_entry()`는 내부적으로 `next` 멤버 주소와 그 Offset을 이용하지만, GDB에서는 위처럼 Node 시작 주소에서 Node Offset을 빼도 같은 구조체를 찾는다. `elem`으로 연결된 목록에 `donation_elem` Offset을 적용하면 다른 주소를 읽는다. QEMU의 GDB stub은 Guest 메모리·Register를 전달하며 기부 체인의 의미나 우선순위를 대신 판단하지 않는다.

## 다른 시스템과 비교하기

Linux v6.12의 RT Mutex는 Lock별 waiter Tree와 소유자별 `pi_waiters` Tree를 사용한다. 소유자 Tree에는 가진 Lock 각각의 최상위 waiter가 들어간다. Cached Red-Black Tree의 삽입·삭제와 최상위 조회를 구분해야 하며, 체인 전체의 비용을 단일 Tree 연산의 O(log n)으로 줄여 설명할 수는 없다. `rt_mutex_adjust_prio_chain()`은 우선순위 상승과 하락, 대기 관계 재배치, 교착 검사와 깊이 한계를 처리한다. 이 버전의 `max_lock_depth` 기본값은 1024다. [RT Mutex 설계](https://docs.kernel.org/6.12/locking/rt-mutex-design.html), [체인 처리](https://github.com/torvalds/linux/blob/v6.12/kernel/locking/rtmutex.c), [깊이 기본값](https://github.com/torvalds/linux/blob/v6.12/kernel/locking/rtmutex_api.c)

POSIX의 `PTHREAD_PRIO_INHERIT`는 대기자의 우선순위를 물려받는 규칙이고, `PTHREAD_PRIO_PROTECT`는 대기자 유무와 관계없이 가진 Mutex의 Priority Ceiling을 반영하는 규칙이다. 표준에 이름이 있다는 사실과 특정 OS·라이브러리·설정의 지원 여부는 별개다. 일반 Lock 전부가 자동으로 PI를 제공한다고 설명하지 않는다. [POSIX Mutex Protocol](https://man7.org/linux/man-pages/man3/pthread_mutexattr_getprotocol.3p.html)

1997년 Mars Pathfinder 사례도 이 차이를 보여준다. 비행 소프트웨어 책임자 Glenn Reeves의 설명에 따르면 낮은 우선순위 ASI/MET Task가 가진 `select()` 내부 Mutex 때문에 `bc_dist`가 지연됐고, 주기 완료 실패를 감지한 `bc_sched`가 Reset을 일으켰다. 관련 Mutex의 Priority Inheritance를 활성화해 문제를 수정했다. 낮은 우선순위의 버스 관리 Task가 Watchdog을 막았다는 단순화보다는 실제 대기 관계를 구분하는 편이 정확하다. [Glenn Reeves의 당시 설명](https://postmortem.io/incidents/nasa--1997-07-04--mars-pathfinder-priority-inversion/)
