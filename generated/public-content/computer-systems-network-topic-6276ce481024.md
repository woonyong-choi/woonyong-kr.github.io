---
layout: default
title: 우선순위 스케줄링
nav_order: 3
permalink: /wiki/computer-systems-network-topic-6276ce481024/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-6276ce481024
projection_sha256: 75252c8f0d86385aba0612e6196fc9de78bf7dab617792891ea753c42613755e
parent: 스레드 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-936b351311c8
search_terms:
- Priority Scheduling
- ready_list
- thread_create
- check_preemption
- thread_priority
- FIFO
- TIME_SLICE
- MLFQS
- Priority Donation
- priority-preempt
- priority-change
- priority-sema
- ready_list reorder
- SCHED_FIFO
- SCHED_RR
grand_parent: PintOS
ancestor: CS 기초
---

# 우선순위 스케줄링
{: .no_toc }

우선순위가 31인 A가 40인 B를 만들면 누가 먼저 실행될까? 현재 PintOS 구현에서는 B를 READY로 만든 뒤 우선순위를 비교하고 A가 CPU를 양보한다. 하지만 B가 생성되었다는 사실만으로 CPU 실행이 저절로 바뀌지는 않는다. Ready Queue에 넣는 단계와 다음 Thread를 고르는 단계를 따라가야 한다.

## Ready Queue에서 무엇을 먼저 고르는가

이 문서의 코드는 `lrn-pintos`의 기본 우선순위 모드를 기준으로 한다. 우선순위 범위는 0–63이며 값이 클수록 먼저 선택한다. `ready_list`는 `thread_priority()`의 `a->priority > b->priority` 비교로 정렬된 Doubly Linked List다. 다음 대상을 고르는 `next_thread_to_run()`은 목록이 비었으면 Idle Thread, 그렇지 않으면 맨 앞 원소를 반환한다. [현재 스케줄러](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

T1(10), T2(31), T3(20)이 모두 READY라면 선택 순서는 T2 → T3 → T1이다. 같은 우선순위라면 `list_insert_ordered()`가 앞서 들어온 동순위 원소 뒤에 삽입하므로 FIFO 순서를 유지한다. 이 규칙은 우선순위가 유지되는 구간의 Queue 순서다. Priority Donation이나 MLFQS로 값이 바뀌는 경로는 별도로 함께 읽어야 한다. [정렬 삽입 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/lib/kernel/list.c)

일반 Thread가 Yield하면 자신도 우선순위에 맞게 다시 들어간다. 여전히 가장 높은 우선순위라면 자신이 바로 선택되고, 동순위 후보가 있으면 그 후보 뒤에서 기다린다. 따라서 Time Slice가 끝났다는 이유만으로 낮은 우선순위 Thread가 반드시 CPU를 받는 것은 아니다. 높은 우선순위의 실행 가능 작업이 계속 남아 있으면 낮은 우선순위 작업이 오래 기다릴 수 있다.

## 깨우기와 선점 판단을 분리한다

`thread_unblock()`은 BLOCKED인 대상을 Ready Queue에 삽입하고 READY로 바꾼다. 함수 안에서 즉시 `thread_yield()`를 호출하지 않는다. 호출자가 대상을 깨운 뒤 공유 상태의 나머지를 갱신할 수 있어야 하기 때문이다.

Semaphore가 좋은 예다. `sema_up()`은 대기 목록을 현재 우선순위로 다시 정렬하고 첫 Thread를 깨운 다음, `sema->value`를 증가시킨다. 그 뒤 IF를 복원하고 `check_preemption()`을 호출한다. 값 증가 전에 CPU를 넘기면 깨어난 Thread가 아직 0인 값을 보고 다시 기다릴 수 있다. [Semaphore의 선점 판단 위치](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)

현재 `check_preemption()`은 문맥에 따라 두 경로를 선택한다.

```c
if (list_empty (&ready_list))
    return;
struct thread *front =
        list_entry (list_begin (&ready_list), struct thread, elem);
if (thread_current ()->priority < front->priority) {
    if (intr_context ())
        intr_yield_on_return ();
    else
        thread_yield ();
}
```

외부 IRQ 문맥에서는 선점을 무시하는 것이 아니라 **IRQ 마무리에서 양보하도록 예약**한다. 일반 Thread 문맥에서는 즉시 `thread_yield()`로 내려간다. 다만 이 함수가 존재한다는 것과 모든 깨우기 경로에서 호출된다는 것은 다르다. 현재 Alarm Clock의 `thread_awake()`는 `thread_unblock()`만 호출한다. 따라서 Alarm 깨우기마다 이 우선순위 검사가 자동으로 실행된다고 설명해서는 안 된다.

`thread_unblock()`과 `thread_yield()`는 내부에서 IF를 끄고 이전 값을 복원한다. 호출 전에 IF가 반드시 켜져 있어야 하는 함수는 아니다. 반면 외부 IRQ Handler는 `thread_yield()`를 직접 호출할 수 없다. 이 차이와 EOI 이후 실제 양보 순서는 [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/)에 연결된다.

## 새 Thread는 생성 함수가 반환하기 전에 실행될 수 있다

`thread_create()`는 먼저 페이지를 할당하고 `init_thread()`로 BLOCKED 상태를 만든다. 할당에 실패하면 `TID_ERROR`를 반환한다. 성공하면 TID를 배정하고 초기 Frame의 RIP를 `kernel_thread`, RDI를 실행할 함수, RSI를 `aux`로 설정한다. Segment와 초기 IF를 준비하고 `all_list`에 연결한 뒤 `thread_unblock(t)`을 호출한다.

이 시점에는 새 Thread가 실행에 필요한 초기 상태를 갖춘다. “초기화가 아직 안 끝났기 때문에 unblock 안에서 양보하면 안 된다”는 설명보다, **깨우기 함수에 호출자마다 다른 후속 처리를 끼워 넣지 않는 역할 분담**으로 이해하는 편이 정확하다.

마지막 비교는 함수에 전달된 `priority` 인자가 아니라 `t->priority > thread_current()->priority`다. MLFQS 모드에서는 새 Thread가 부모의 `nice`와 `recent_cpu`를 물려받고 우선순위를 계산하므로 두 값이 항상 같지 않다. 기본 우선순위 모드에서 A(31)가 B(40)를 만들면 A는 양보하고, B가 C(35)를 만들면 B는 계속 실행한다.

더 높은 우선순위의 후보가 있으면 Scheduler는 전체 Queue에서 먼저 선택할 대상을 고른다. 방금 생성한 Thread가 모든 경우에 바로 선택된다고 단정할 수는 없다. 새 Thread가 먼저 실행되고 종료하거나 Block한 뒤, 생성한 Thread가 돌아와 `thread_create()`의 TID 반환까지 이어 갈 수도 있다.

## 입력을 바꾸며 선택 순서를 확인하기

다음 예제는 Queue와 상태 전환을 한 번에 한 사건씩 진행하는 Python 모델이다. 실제 PintOS Thread·IRQ·Register를 실행하지 않고, Priority Donation과 MLFQS도 생략한다. `create()`·`unblock()`·`yield_cpu()`를 비교하면 깨우기, 양보, 선택의 차이가 보인다.

```run-python
states = {"A": "RUNNING"}
priorities = {"A": 31}
ready = []
current = "A"
yield_on_return = False

def enqueue(name):
    ready.append(name)
    ready.sort(key=lambda n: -priorities[n])  # 동순위는 삽입 순서 유지

def show(event):
    queue = ",".join(f"{n}:{priorities[n]}" for n in ready) or "empty"
    print(f"{event}: running={current}, ready=[{queue}]")

def select():
    global current
    assert ready, "이 예제에서는 Idle 대신 실행 후보가 있다고 가정한다."
    current = ready.pop(0)
    states[current] = "RUNNING"

def yield_cpu():
    states[current] = "READY"
    enqueue(current)
    select()

def unblock(name):
    assert states[name] == "BLOCKED"
    states[name] = "READY"
    enqueue(name)

def create(name, priority):
    states[name] = "BLOCKED"
    priorities[name] = priority
    unblock(name)
    if priority > priorities[current]:
        yield_cpu()

def block():
    states[current] = "BLOCKED"
    select()

def check_preemption(external_irq):
    global yield_on_return
    if ready and priorities[ready[0]] > priorities[current]:
        if external_irq:
            yield_on_return = True
        else:
            yield_cpu()

create("B", 40)
show("A creates B(40)")
create("C", 35)
show("B creates C(35)")
yield_cpu()
show("B yields")
block()
show("B blocks")
unblock("B")
show("unblock B only")
check_preemption(external_irq=True)
print(f"IRQ check: deferred={yield_on_return}, running={current}")
# 외부 IRQ 표시 해제와 EOI를 마친 뒤의 양보만 모델링한다.
if yield_on_return:
    yield_on_return = False
    yield_cpu()
show("IRQ finish")
create("D", 40)
show("B creates D(40)")
yield_cpu()
show("B yields to equal priority")
```

실행 결과:

```text
A creates B(40): running=B, ready=[A:31]
B creates C(35): running=B, ready=[C:35,A:31]
B yields: running=B, ready=[C:35,A:31]
B blocks: running=C, ready=[A:31]
unblock B only: running=C, ready=[B:40,A:31]
IRQ check: deferred=True, running=C
IRQ finish: running=B, ready=[C:35,A:31]
B creates D(40): running=B, ready=[D:40,C:35,A:31]
B yields to equal priority: running=D, ready=[B:40,C:35,A:31]
```

B가 C보다 우선순위가 높을 때 Yield해도 B가 다시 선택된다. B가 Block해야 C가 실행된다. B를 깨우는 함수는 C를 즉시 바꾸지 않고, 뒤의 선점 검사가 양보를 예약한다. 마지막에는 같은 우선순위의 D가 먼저 Ready Queue에 있으므로 B가 Yield할 때 D를 고른다.

B와 C의 우선순위를 같게 바꾸거나 D를 더 낮게 바꾸어, 예상한 실행 순서와 출력을 비교해 볼 수 있다. 이 예제의 Python List 연산 시간은 PintOS Linked List의 비용 측정으로 사용할 수 없다.

## Time Slice와 실행 비용을 해석하기

`thread_tick()`은 실행 조각의 `thread_ticks`를 증가시키고 4에 도달하면 양보를 예약한다. `schedule()`은 같은 Thread를 다시 골라도 이 값을 0으로 만든다. 일반 Thread의 Ready Queue 재삽입은 후보 수 n에 대해 O(n), 맨 앞 선택 자체는 O(1)이다. 전체 전환에는 주소 공간 활성화와 Register 복원 등 다른 작업도 포함된다.

100Hz에서 4 tick을 곱하면 명목상 40ms가 나오지만, 모든 실행의 최대 연속 시간이나 선점 지연을 보장하는 수치는 아니다. IRQ를 끈 구간, 가상 시간, Host 스케줄링, 호출 시점과 tick 경계가 영향을 준다. “깨우면 지연 0ms”, “최악 지연은 항상 1 tick”, “Context Switch는 수백 Cycle” 같은 수치는 측정 없이 성능값으로 쓰지 않는다.

QEMU는 가상 PIT·PIC와 Guest CPU 명령을 실행한다. PintOS의 우선순위 숫자나 Ready Queue에서의 선택은 Guest 소프트웨어의 정책이다. TCG와 KVM 같은 실행 방식에 따라 시간 특성은 달라져도, QEMU가 PintOS의 대기 목록을 대신 정렬하는 것은 아니다.

## Linux와 Windows를 비교하는 기준

Linux v6.12의 Fair Scheduler는 EEVDF 선택을 사용한다. 깨어난 Task의 가상 실행 시간만 비교해 가장 작은 Task를 무조건 고른다는 과거 CFS 설명을 그대로 적용하면 맞지 않는다. `check_preempt_wakeup_fair()`는 `pick_eevdf()`의 결과에 따라 `resched_curr()`로 재스케줄링을 요청하며, `yield_task_fair()`는 현재 Entity의 가상 Deadline을 늘린다. `vruntime`을 무조건 최댓값으로 만드는 함수가 아니다. [Linux v6.12 Fair Scheduler](https://github.com/torvalds/linux/blob/v6.12/kernel/sched/fair.c)

Linux의 재스케줄링 요청과 실제 전환 시점은 실행 문맥과 선점 설정에 달려 있다. per-CPU Run Queue, 동기화와 CPU 간 깨우기도 고려해야 한다. PintOS의 한 CPU·한 Ready Queue와 같은 지연 수치로 비교하지 않는다.

Windows는 같은 우선순위의 실행 가능한 Thread에 Time Slice를 나누고, 더 높은 우선순위의 Thread가 준비되면 낮은 우선순위 Thread의 남은 Time Slice보다 이를 우선한다. Process의 Priority Class와 Thread의 Priority Level이 기본 우선순위에 함께 반영된다. 모든 Windows 버전의 Quantum을 30ms나 180ms로 고정해 설명하거나, 이 규칙을 하나의 내부 DPC 함수 호출로 단정하지 않는다. [Windows Scheduling Priorities](https://learn.microsoft.com/en-us/windows/win32/procthread/scheduling-priorities)

## Queue를 바꾸지 않고 다음 후보 확인하기

Debugger에서는 `thread_unblock`, `thread_yield`, `check_preemption`, `next_thread_to_run`에 중단점을 두어 원인과 결과를 연결한다. 다음은 Debug Symbol이 있는 Guest에서 Ready Queue를 읽는 명령이다. `list_entry` Macro나 커널 함수 호출을 사용하지 않는다.

```gdb
set $elem_offset = (unsigned long)&((struct thread *)0)->elem
set $e = 'thread.c'::ready_list.head.next
while $e != &'thread.c'::ready_list.tail
  set $t = (struct thread *)((char *)$e - $elem_offset)
  p $t->name
  p $t->priority
  p $t->status
  set $e = $e->next
end
```

Queue가 비어 있으면 반복문은 한 번도 실행되지 않는다. `next_thread_to_run()`을 식으로 직접 호출하면 원소를 제거하므로 관찰값을 훼손할 수 있다. 실제 선택을 보려면 함수의 반환값이나 `schedule()`에서 대입을 마친 `next`를 관찰한다. Thread가 Yield하기 전후의 상태와 Stack은 [Thread](/wiki/computer-systems-network-topic-aebc87b0fcf5/)에서 이어진다.

## 기부 후에는 Queue 순서도 확인한다

기본 우선순위 모드의 `thread_set_priority()`는 `base_priority`를 갱신하고 `refresh_priority()`로 기부를 반영한 뒤 `check_preemption()`을 호출한다. MLFQS 모드에서는 이 API가 우선순위를 직접 바꾸지 않는다. Lock 해제는 남은 기부로 우선순위를 재계산하고 `sema_up()`을 통해 선점 검사에 도달한다. 기부의 수명은 [우선순위 기부](/wiki/computer-systems-network-topic-0eef2c64a382/)에서 다룬다.

숫자를 바꾸는 것만으로 List 순서가 바뀌지는 않는다. 현재 `lock_acquire()`의 기부 코드는 holder의 `priority`를 올리지만 holder가 이미 READY일 때 Ready Queue에서 재배치하지 않는다. `refresh_priority()`도 `donation_list`만 정렬한다. MLFQS의 주기적인 `ready_list` 정렬을 기본 모드의 Donation 보완 처리로 볼 수는 없다. [기부 갱신 경로](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)

다음은 M(30), L(10) 순서인 Queue에서 L의 값만 50으로 높이는 모델이다. 마지막 정렬은 차이를 보여 주기 위해 추가한 동작이며, 현재 PintOS Donation 코드에 이미 구현된 처리라는 뜻은 아니다.

```run-python
priority = {"M": 30, "L": 10}
ready = ["M", "L"]
print(f"before donation: {[(n, priority[n]) for n in ready]}")
priority["L"] = 50
print(f"after field update: {[(n, priority[n]) for n in ready]}")
print(f"pop-front choice: {ready[0]}")
ready.sort(key=lambda n: -priority[n])
print(f"after reorder: {[(n, priority[n]) for n in ready]}")
print(f"priority choice: {ready[0]}")
assert ready[0] == "L"
```

실행 결과:

```text
before donation: [('M', 30), ('L', 10)]
after field update: [('M', 30), ('L', 50)]
pop-front choice: M
after reorder: [('L', 50), ('M', 30)]
priority choice: L
```

기부 직후 맨 앞을 꺼내면 M을 고르지만 값에 맞게 재정렬하면 L을 고른다. 이는 List의 값 갱신만으로 순서가 보존되지 않는다는 예제다. 특정 PintOS 테스트를 실행해 실패를 관찰한 기록은 아니다. 정렬 불변조건은 삽입 지점뿐 아니라 Queue에 들어간 원소의 우선순위가 바뀌는 지점에서도 확인해야 한다.

우선순위 범위가 작고 고정돼 있다면 우선순위별 Queue와 Bitmap을 사용하는 선택지도 있다. Linked List 전체를 비교해 삽입하는 대신 해당 Queue 뒤에 붙이고, 비어 있지 않은 최상위 Queue를 찾는다. 다만 우선순위가 바뀌면 소속 Queue와 Bitmap을 함께 갱신해야 한다. Linux v6.12의 RT Class에서도 우선순위별 Queue와 Bitmap을 사용한다. Fair Scheduler 전체가 같은 구조라는 의미는 아니다. `SCHED_FIFO`는 같은 우선순위 사이에서 Time Slice 만료만으로 순환하지 않고, `SCHED_RR`은 Time Slice를 사용한다. [Linux RT Queue](https://github.com/torvalds/linux/blob/v6.12/kernel/sched/rt.c), [스케줄링 정책](https://man7.org/linux/man-pages/man7/sched.7.html)

## 테스트가 요구하는 순서와 관찰값

`priority-preempt`는 main(31)이 새 Thread(32)를 만든 뒤 다음 메시지에 도달하기 전에 새 Thread가 완료되기를 기대한다. 새 Thread가 반복해서 Yield해도 main보다 우선순위가 높으므로 자신이 다시 선택될 수 있다. `priority-change`는 현재 우선순위를 낮춘 뒤의 양보, `priority-sema`는 Semaphore 대기자의 선택 순서를 확인한다. 각 테스트가 검사하는 조건을 구분해야 한다. [선점 테스트](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/tests/threads/priority-preempt.c)

GDB에서 선점 검사의 빈도를 조사한다면 `check_preemption()` 진입 횟수, 비교가 참이 된 횟수, `thread_yield()` 호출 횟수, 실제 `curr != next` 전환 횟수를 따로 센다. IRQ에서 예약만 한 검사와 즉시 양보한 검사를 같은 전환 횟수로 합치지 않는다. Queue가 비면 맨 앞 Thread를 읽지 않고, 출력 때문에 관찰 대상의 시간 특성이 바뀔 수 있다는 점도 고려한다. 특정 검사 비율이나 성능 향상률은 이 코드만으로 계산할 수 없다.
