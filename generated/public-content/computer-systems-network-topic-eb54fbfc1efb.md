---
layout: default
title: 조건 변수
nav_order: 5
permalink: /wiki/computer-systems-network-topic-eb54fbfc1efb/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-eb54fbfc1efb
projection_sha256: c5cd2b96c7c4fb66e5bcfa9a621c3dc2c47e1774e2ea4f0ef9ce599d9bd35c2e
parent: 동기화
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-cd8cd4ad9254
search_terms:
- Condition Variable
- cond_wait
- cond_signal
- cond_broadcast
- Private Semaphore
- Mesa
- Hoare
- Lost Wakeup
- Spurious Wakeup
grand_parent: OS
ancestor: CS 기초
---

# 조건 변수
{: .no_toc }

조건 변수는 공유 상태가 바뀔 때까지 기다리는 Thread와 그 변화를 알리는 Thread를 연결한다. 조건 자체를 저장하는 변수는 아니다. Queue가 비었는지, Buffer에 빈자리가 있는지 같은 조건은 공유 상태를 읽어서 판단하고, 그 상태는 Lock으로 보호한다.

## 조건을 검사한 Lock으로 다시 돌아오기

소비자는 Queue가 비어 있으면 기다리고, 항목이 있으면 꺼내야 한다. 다음 코드는 이 사용 규칙을 나타내는 PintOS 스타일의 예시다. `queue_empty`, `queue_pop`과 Queue의 실제 정의는 별도로 필요하다.

```c
lock_acquire(&lock);
while (queue_empty())
    cond_wait(&not_empty, &lock);
item = queue_pop();
lock_release(&lock);
```

생산자는 같은 Lock을 획득해 항목을 넣은 뒤 `cond_signal(&not_empty, &lock)`로 변화를 알리고 Lock을 해제한다. 기다리는 동안 소비자가 계속 Lock을 가지고 있으면 생산자는 Queue를 채울 수 없다. 그래서 `cond_wait()`는 Lock을 풀고 기다린 다음, 반환하기 전에 다시 획득한다.

`while`을 `if`로 바꾸면 깨어난 뒤 조건을 다시 검사하지 않는다. 하지만 소비자가 깨워진 사이에 다른 소비자가 먼저 Lock을 얻고 항목을 가져갈 수 있다. 명시적인 Signal 없이 반환하는 Spurious Wakeup이 없는 구현에서도 이 재검사는 필요하다.

공간이 제한된 Buffer에서는 하나의 Lock에 `not_empty`, `not_full` 두 조건 변수를 연결할 수 있다. 생산자는 가득 찼는지, 소비자는 비었는지 검사한다. FIFO Queue를 구현하려면 Head와 Tail의 순서도 유지해야 한다. `buffer[count++]`에 넣고 `buffer[--count]`로 꺼내는 코드는 LIFO Stack이며 FIFO 소비 순서를 보장하지 않는다.

## PintOS의 대기 등록 순서

기준은 [현재 저장소의 `cond_wait()`와 `cond_signal()`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)이다. 각 `cond_wait()` 호출은 자기 Stack에 `semaphore_elem waiter`를 만든다. 그 안에 초기값 0인 Private Semaphore가 들어 있다.

```c
struct semaphore_elem waiter;
sema_init(&waiter.semaphore, 0);
list_push_back(&cond->waiters, &waiter.elem);
lock_release(lock);
sema_down(&waiter.semaphore);
lock_acquire(lock);
```

순서의 핵심은 **대기자를 등록한 뒤 Lock을 푸는 것**이다. Lock을 먼저 풀고 나중에 등록하면, 그 사이에 생산자가 Signal을 보내고 사라질 수 있다. 그러면 소비자는 변화를 이미 놓쳤는데도 기다리게 된다. 이를 Lost Wakeup 문제로 볼 수 있다.

올바른 등록 순서에서는 Lock을 푼 직후, 아직 `sema_down()`에 도달하기 전에 선택된 대기자에게 Signal이 와도 Private Semaphore의 값 1이 남는다. 소비자는 나중에 `down`에서 그 값을 소비하므로 잠들지 않고 다음 단계로 간다. 이미 `down`에서 잠들었다면 Signal이 해당 Thread를 깨운다.

단, 이 순서가 현재 코드의 모든 Signal 경로를 안전하게 만든다는 뜻은 아니다. 아래에서 다루는 우선순위 비교 함수에는 별도의 빈 List 문제가 있다.

## 두 List와 두 번의 기다림

`cond->waiters`가 담는 노드와 Semaphore의 `waiters`가 담는 노드는 종류가 다르다.

| 위치 | 연결된 노드 | 의미 |
|---|---|---|
| `cond->waiters` | Stack 위 `semaphore_elem.elem` | Signal을 받을 대기 호출 |
| `waiter.semaphore.waiters` | 기다리는 `thread.elem` | Private Semaphore에서 잠든 Thread |
| `lock->semaphore.waiters` | Lock을 기다리는 `thread.elem` | Signal 뒤 Lock을 다시 얻지 못한 Thread |

Signal은 먼저 조건 변수 List에서 `semaphore_elem` 하나를 빼고 그 안의 Semaphore를 `up`한다. Private Semaphore에서 깨어나 `down`을 마친 Thread는 Lock을 다시 획득한다. 이때 다른 Thread가 소유 중이면 Lock의 Semaphore에서 다시 잠들 수 있다.

따라서 “조건 변수에서 깨어났다”와 “`cond_wait()`가 반환했다”는 다른 시점이다. 후자는 Lock 재획득까지 끝났다는 뜻이다. `waiter`의 Stack 수명은 호출이 반환할 때까지 유지되며, List에서 먼저 제거한 뒤 깨우는 순서가 이 지역 객체를 안전하게 정리하는 데 필요하다. 고정된 Stack 사용량은 구조체 크기만으로 계산할 수 없다. 함수 Frame과 Compiler 최적화까지 실제 빌드에서 확인해야 한다.

Private Semaphore는 선택된 호출의 통지를 보관한다. 다른 소비자가 동일한 공용 Semaphore에 들어가 그 통지를 가져가는 구조가 아니다. 그렇더라도 공유 Queue의 항목은 먼저 Lock을 얻은 소비자가 가져갈 수 있다. 통지의 귀속과 공유 자원의 소유를 구분해야 한다.

## Mesa 방식에서 Signal은 무엇을 약속하는가

PintOS의 조건 변수는 Mesa 방식이다. Signal은 대기자가 다시 실행될 기회를 만들고, 대기자는 Lock을 재획득한 뒤 조건을 확인한다. Hoare 방식처럼 Signal과 함께 Monitor의 실행 권한을 대기자에게 직접 넘기는 규칙이 아니다.

그렇다고 Signal을 보낸 Thread가 반드시 CPU를 계속 가진다는 뜻도 아니다. 현재 `sema_up()`은 더 높은 우선순위의 Thread를 깨우면 선점을 유발할 수 있다. 깨어난 Thread는 Signal을 보낸 Thread가 아직 가진 Lock을 다시 기다리게 되고, 그 과정에서 Donation이 생길 수 있다. CPU 선택과 Lock 소유는 따로 관찰해야 한다.

`cond_signal()`은 대기자가 없으면 미래의 호출을 위한 통지를 저장하지 않는다. `cond_broadcast()`는 현재 등록된 대기자들을 반복해서 깨우지만, 모두가 같은 순간에 Lock을 소유하는 것은 아니다. 여러 Thread가 깨어나도 공유 조건이 충분하지 않으면 일부는 다시 기다린다.

대기자 n명을 정렬하는 Signal의 List 처리에는 O(n log n)이 들 수 있다. 각 Private Semaphore의 실제 대기자는 해당 호출 Thread 한 명이므로, 정상적인 사용에서 내부 List는 0명 또는 1명이다. 비교 함수가 내부 List도 정렬한다고 해서 각 대기자에 임의의 여러 Thread가 매달리는 모델로 비용을 계산하면 맞지 않는다. Broadcast는 Signal을 반복하므로 매번 남은 List를 다시 정렬하는 비용과 Lock 재경쟁까지 구분해서 봐야 한다.

## 현재 우선순위 비교 함수의 빈 List 문제

현재 `cond_signal()`은 `cmp_sema_priority`로 조건 변수 대기 List를 정렬한다. 비교 함수는 각 Private Semaphore의 대기 List를 정렬한 뒤 `list_front()`에서 Thread의 우선순위를 읽는다.

문제는 `cond->waiters`에 등록되었다는 사실이 Private Semaphore에서도 이미 잠들었다는 뜻은 아니라는 데 있다. 다음 순서는 코드상 가능하다.

1. C는 Private Semaphore에서 이미 기다리고 있다.
2. B가 `cond_wait()`에 들어와 자신의 `semaphore_elem`을 등록한다.
3. B가 Lock을 푼 뒤, `sema_down()` 호출 전에 다른 Thread가 실행된다.
4. 그 Thread가 같은 Lock을 얻고 `cond_signal()`을 호출한다.
5. 정렬 과정이 B와 C를 비교한다. B의 Private Semaphore 대기 List는 아직 비어 있다.

현재 비교 함수에는 이 빈 List를 검사하는 코드가 없다. 비교가 발생하면 `list_front()`의 전제에 어긋난다. 대기자가 한 명일 때 정렬 비교가 생기지 않는 경우와, 여러 명을 비교하는 경우도 구분해야 한다. 이는 소스에서 도출한 경로이며, 여기서 Kernel Crash를 재현한 결과는 아니다.

개선하려면 대기 등록 시 해당 Thread의 Pointer 등을 보관해 Private Semaphore가 비어 있어도 현재 유효 우선순위를 읽을 수 있어야 한다. 등록 당시 숫자만 복사하면 이후 Donation 변화를 놓칠 수 있다. 이 문서의 모델은 비교에 필요한 정보가 무엇인지 보여 주며, 저장소의 Kernel 코드를 수정한 것은 아니다.

```run-python
from collections import deque


class PrivateWaiter:
    def __init__(self, name, priority):
        self.name = name
        self.priority = priority
        self.value = 0
        self.blocked = False

    def down(self):
        if self.value == 0:
            self.blocked = True
            return "BLOCKED"
        self.value -= 1
        self.blocked = False
        return "PASSED"

    def up(self):
        self.value += 1
        self.blocked = False


a = PrivateWaiter("A", 30)
condition_waiters = [a]  # Registered while holding the application lock.
print("registered:", [w.name for w in condition_waiters])
condition_waiters.remove(a)
a.up()  # Signal after unlock, before A calls down.
print(f"early signal: value={a.value}, down={a.down()}, value_after={a.value}")

queue = deque(["item"])
queue.popleft()  # Another consumer gets the lock before A reacquires it.
print("after lock reacquire: predicate=", bool(queue), sep="")
print("consumer action:", "consume" if queue else "wait again")

b = PrivateWaiter("B", 40)
c = PrivateWaiter("C", 20)
c.down()
condition_waiters = [b, c]
print("private waiters:", {w.name: int(w.blocked) for w in condition_waiters})
print("all private lists nonempty:", all(w.blocked for w in condition_waiters))
print("priority from saved owner:", max(condition_waiters, key=lambda w: w.priority).name)
```

실행 결과:

```text
registered: ['A']
early signal: value=1, down=PASSED, value_after=0
after lock reacquire: predicate=False
consumer action: wait again
private waiters: {'B': 0, 'C': 1}
all private lists nonempty: False
priority from saved owner: B
```

첫 출력은 실제로 잠들기 전에 도착한 통지가 남는 경우다. 중간 출력은 다른 소비자가 항목을 가져갔으므로 조건을 다시 검사해야 하는 경우다. 마지막 출력은 B가 등록만 했을 때도 우선순위를 비교해야 하는 상황을 보여 준다. `PrivateWaiter.priority`는 모델의 명시적인 정보이며 현재 C 구조체에 있는 필드가 아니다. 실제 구현을 개선한다면 저장한 Thread Pointer를 통해 변하는 우선순위를 읽는 방식까지 검토해야 한다.

## 테스트와 GDB 관찰

[priority-condvar 테스트](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/tests/threads/priority-condvar.c)는 우선순위 21부터 30까지의 Thread 10명을 만들고, `cond_signal()`이 높은 우선순위의 대기자를 먼저 깨우는지 검사한다. 일반적인 대기 순서 검사는 위의 “등록 후 아직 잠들지 않은 대기자” 경로를 반드시 재현한다는 뜻이 아니다.

다음은 Debug Build의 `cond_signal()`에서 `cond` 인자를 읽을 수 있을 때 첫 대기자의 구조를 살펴보는 GDB 명령이다. 먼저 각 List가 비어 있는지 확인한다.

```gdb
set $c = cond
set $e = $c->waiters.head.next
if $e != &$c->waiters.tail
  set $off = (unsigned long)&((struct semaphore_elem *)0)->elem
  set $w = (struct semaphore_elem *)((char *)$e - $off)
  p $w->semaphore.value
  set $te = $w->semaphore.waiters.head.next
  if $te != &$w->semaphore.waiters.tail
    set $toff = (unsigned long)&((struct thread *)0)->elem
    set $t = (struct thread *)((char *)$te - $toff)
    p $t->name
    p $t->priority
    p $t->status
  else
    printf "registered, but private semaphore waiters is empty\n"
  end
end
```

`cond_wait()` 함수 진입 직후에는 지역 `waiter`가 아직 초기화되지 않았다. `sema_init()`과 List 삽입을 지난 지점, Lock을 푼 뒤, Signal에서 대기자를 제거한 뒤, Lock을 다시 얻은 뒤를 나눠 본다. 고정 명령어 offset 대신 소스 줄 중단점을 사용한다. QEMU의 `info threads`는 Guest PintOS Thread 목록을 대신하지 않으므로 위 List와 Guest의 Thread 구조를 읽어야 한다.

LP64의 현재 선언에서는 `semaphore_elem`이 56바이트, 그 안의 Semaphore offset이 16으로 예상된다. 조건 변수 자체는 List 하나이므로 32바이트다. 디버그 심볼의 `ptype /o`와 `sizeof`로 실제 배치를 확인하고, `cond->waiters` 노드를 곧바로 `struct thread *`로 바꾸지 않는다.

## POSIX와 Windows의 계약

[POSIX 조건 대기](https://man7.org/linux/man-pages/man3/pthread_cond_wait.3p.html)에서도 호출자는 Mutex를 가지고 들어가며, 성공적으로 반환할 때 다시 소유한다. Lock 해제와 대기의 원자성은 다른 Thread가 Mutex를 얻고 Signal을 보내는 순서에 대한 보장이다. 전체 대기 시간이 하나의 명령어나 하나의 임계 구역이라는 뜻은 아니다. 대기 중인 조건 변수에 서로 다른 Mutex를 섞어 사용하는 데에도 제약이 있다.

Timeout과 Cancellation 경로는 단순한 Signal보다 더 많은 규칙을 가진다. 반환 코드와 조건을 함께 검사해야 하며, 재검사 없이 공유 자원을 소비하면 안 된다. 대기자를 깨우는 순서는 POSIX 자체가 항상 FIFO나 항상 우선순위순으로 고정하는 것이 아니다.

Futex 기반 구현을 비교할 때도 Private Semaphore와 같은 자료구조라고 가정하지 않는다. 값을 읽은 뒤 잠들기 전에 값이 바뀌었는지 Kernel이 다시 비교하는 절차는 통지를 놓치는 틈을 막는 데 쓰일 수 있다. 이미 잠든 Thread는 값 변경만으로 자동으로 깨어나지 않으므로 Wake 연산도 필요하다. Linux Kernel의 Wait Queue Entry 역시 그 자체가 통지를 저장하는 토큰은 아니다. 대기 등록과 공유 조건의 재검사 규칙을 함께 읽어야 한다.

[Windows 조건 변수](https://learn.microsoft.com/en-us/windows/win32/sync/condition-variables)도 Spurious Wakeup과, 깨어난 Thread보다 다른 Thread가 먼저 진행하는 상황을 고려해 조건을 다시 검사하도록 설명한다. Windows에서 허용되는 Wake 호출 위치를 그대로 PintOS에 적용해서는 안 된다. 현재 PintOS의 `cond_signal()`은 관련 Lock을 호출자가 소유하고 있는지 검사한다.
