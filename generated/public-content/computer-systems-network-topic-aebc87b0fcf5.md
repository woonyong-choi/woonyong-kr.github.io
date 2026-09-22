---
layout: default
title: Thread
nav_order: 3
permalink: /wiki/computer-systems-network-topic-aebc87b0fcf5/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-aebc87b0fcf5
projection_sha256: 8927f49cf84cd195068b67b6a2cad10d44bc1ce1f61c2ddbbbc7826c3a63518e
parent: 프로세스와 스레드
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63b969bafddd
search_terms:
- 스레드
- thread_block
- thread_yield
- thread_unblock
- THREAD_BLOCKED
- THREAD_READY
- THREAD_DYING
- do_schedule
- destruction_req
- Idle Thread
- Thread
- thread_current
- running_thread
- Kernel Stack
- THREAD_MAGIC
- all_elem
- Stack Overflow
- VMAP_STACK
grand_parent: OS
ancestor: CS 기초
---

# Thread
{: .no_toc }

Thread는 실행을 이어 가는 데 필요한 Register와 Stack을 가진 실행 단위다. 실행할 수 있는 상태인지와 지금 CPU를 사용하는지는 별개다. 화면에서 프로그램이 멈춘 것처럼 보여도, CPU를 기다리는 중인지 다른 작업의 완료를 기다리는 중인지에 따라 살펴볼 코드가 달라진다.

## 실행 차례를 기다릴 때와 사건을 기다릴 때

PintOS의 `enum thread_status`는 네 상태를 구분한다. 다음 표의 Queue 규칙은 일반 Thread를 기준으로 하며, Idle Thread에는 뒤에서 설명할 예외가 있다.

| 상태 | 값 | 의미 | `ready_list` |
|---|---|---|---|
| RUNNING | 0 | 현재 CPU에서 실행 중 | 들어 있지 않음 |
| READY | 1 | 실행할 수 있지만 아직 선택되지 않음 | 들어 있음 |
| BLOCKED | 2 | Timer, Semaphore 등 깨울 사건을 기다림 | 들어 있지 않음 |
| DYING | 3 | 실행을 끝내고 Thread 페이지 회수를 기다림 | 들어 있지 않음 |

`timer_sleep(100)`을 호출한 Thread는 BLOCKED가 된다. 목표 tick에 `thread_unblock()`이 호출되면 READY로 바뀌지만, 실제 실행은 Scheduler가 선택한 뒤에 시작된다. 깨운 시각과 다시 실행한 시각 사이에 대기 시간이 더 생길 수 있다. [Alarm Clock](/wiki/computer-systems-network-alarm-clock-4f0f0546530e/)에서 이 차이를 tick과 대기 목록으로 확인할 수 있다.

상태를 바꾸는 주체도 다르다. 실행 중인 Thread는 `thread_block()`으로 기다리거나 `thread_yield()`로 양보한다. 다른 Thread나 외부 IRQ Handler는 `thread_unblock(t)`으로 대상을 실행 후보로 돌려놓는다. `schedule()`은 다음 대상을 RUNNING으로 표시한다. [상태 정의](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/thread.h), [상태를 바꾸는 함수](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

## Block은 기다림의 이유를 정하지 않는다

현재 PintOS의 `thread_block()`은 다음과 같다.

```c
void
thread_block (void) {
    ASSERT (!intr_context ());
    ASSERT (intr_get_level () == INTR_OFF);
    thread_current ()->status = THREAD_BLOCKED;
    schedule ();
}
```

이 함수는 자신을 Semaphore나 Sleep Queue에 넣지 않는다. 호출자가 먼저 대기할 조건과 대상을 연결해야 한다. `sema_down()`은 값이 0이면 `waiters`에 자신을 넣고, `thread_sleep()`은 `sleep_list`에 깨울 시각을 기록한 뒤 Block한다. 따라서 깨우기가 일어나지 않는 문제는 `thread_block()` 한 함수만 읽어서는 찾기 어렵다. 대기 목록에 넣은 코드와 그 목록에서 꺼내는 코드를 함께 따라가야 한다.

`sema_down()`은 다시 실행된 뒤에도 `while (sema->value == 0)`을 검사한다. READY가 되었다고 Semaphore를 이미 얻은 것은 아니다. 실제로 값이 양수일 때 감소시키고 대기를 끝낸다. [Semaphore의 대기와 깨우기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)

외부 IRQ Handler는 Block할 수 없다. 반면 일반 Thread가 IF를 끈 채 `thread_block()`을 호출하는 것은 위 코드가 요구하는 순서다. **인터럽트 비활성화는 CPU 양보 자체를 금지하지 않는다.** 목록과 상태를 바꾸는 도중 Timer IRQ가 끼어들지 않게 보호하는 것이다. SMP의 다른 CPU까지 보호하는 방법은 아니므로, Linux의 Spinlock·선점 제어와 그대로 대응시키지는 않는다.

## Yield한 Thread가 다시 선택될 수도 있다

`thread_yield()`는 기다릴 사건을 등록하지 않는다. 일반 Thread를 `ready_list`에 다시 넣고 `do_schedule(THREAD_READY)`를 호출한다. 가장 높은 우선순위가 여전히 자신에게 있으면 같은 Thread가 다시 선택된다. Yield는 다른 Thread의 실행이나 특정 시간 동안의 대기를 보장하는 함수가 아니다.

| 호출 | 호출 전 IF | Queue 변화 | 이후 경로 |
|---|---|---|---|
| `thread_block()` | OFF 필요 | Ready Queue에 넣지 않음 | 상태를 BLOCKED로 바꾼 뒤 `schedule()` |
| `thread_yield()` | 함수 안에서 OFF로 바꿈 | 우선순위에 맞춰 다시 삽입 | `do_schedule(THREAD_READY)` → `schedule()` |
| `thread_unblock(t)` | 함수 안에서 OFF로 바꿈 | BLOCKED인 대상을 삽입 | READY로 바꾸고 호출자에게 반환 |

`do_schedule()`이 `schedule()`을 호출한다. 반대 순서가 아니다. Block 경로는 상태를 직접 바꾸므로 `do_schedule()`을 거치지 않는다. `schedule()`은 `next_thread_to_run()`으로 대상을 고르고, RUNNING 표시와 `thread_ticks = 0`을 처리한다. USERPROG 빌드에서는 다음 Thread의 주소 공간도 활성화한다. 현재와 다음 대상이 다를 때만 `thread_launch(next)`로 Register와 Stack을 전환한다.

양보한 Thread가 나중에 다시 선택되면 자신이 멈췄던 호출 경로를 이어 간다. `thread_yield()`의 `intr_set_level(old_level)`이나 `thread_sleep()`의 같은 복원 코드는 그때 실행된다. 다른 Thread가 이전 Thread의 지역 변수 `old_level`을 대신 복원하는 구조가 아니다. 처음 실행되는 새 Thread는 `kernel_thread(function, aux)`에서 시작한다.

다음 대상을 선택하는 규칙과 입력을 바꾸는 실행 예제는 [우선순위 스케줄링](/wiki/computer-systems-network-topic-6276ce481024/)에 이어진다. Register 저장·복원은 [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/)의 Thread 실행 흐름과 함께 볼 수 있다.

## 생성, 종료, Idle의 예외

새 Thread는 `init_thread()`에서 BLOCKED로 초기화된다. 생성 코드가 실행 진입점과 인자, Stack을 준비한 뒤 `thread_unblock()`으로 READY로 만든다. “생성과 동시에 RUNNING”도 아니고, “생성 함수가 반환할 때까지 실행되지 않음”도 아니다. 높은 우선순위의 새 Thread가 생성 함수를 호출한 Thread보다 먼저 실행될 수 있다.

일반적으로 새 Thread 한 개에는 4KiB 페이지 한 장을 할당하고, 아래쪽에 `struct thread`, 나머지 공간에 아래로 자라는 Kernel Stack을 둔다. 현재 `init_thread()`는 초기 RSP를 `페이지 시작 + PGSIZE - sizeof(void *)`로 설정한다. 구조체에 필드가 추가되면 Stack에 남는 공간도 줄어든다. 큰 지역 배열과 깊은 재귀가 `magic`과 상태 필드를 손상시킬 수 있는 이유다.

`thread_exit()`는 USERPROG 자원을 정리하고 `all_list`에서 자신을 뺀 뒤 `do_schedule(THREAD_DYING)`으로 내려간다. 아직 사용 중인 Kernel Stack 페이지는 즉시 해제할 수 없다. 현재 `schedule()`은 종료된 이전 Thread를 `destruction_req`에 넣고, **이후 `do_schedule()` 호출**이 그 목록의 페이지를 해제한다. 다음 `schedule()` 호출마다 곧바로 해제하는 것은 아니다. 초기 Thread는 이 페이지 해제 대상에서 제외된다. 소스의 오래된 `schedule_tail()` 주석보다 실제 `destruction_req` 처리 위치를 기준으로 읽는다.

Idle Thread는 초기 실행을 위해 한 번 Ready Queue에 들어간다. 그 뒤에는 Queue가 비었을 때 `next_thread_to_run()`이 직접 반환하는 특별한 대상이다. Idle이 Block했더라도 다른 후보가 없으면 곧바로 자신이 선택되어 RUNNING이 될 수 있다. 이 경우 일반 Thread의 “BLOCKED → READY → RUNNING” 경로를 적용하면 설명이 맞지 않는다.

Idle의 `sti; hlt`는 Thread를 파괴하거나 컴퓨터를 종료하는 명령이 아니다. CPU가 다음 사건을 기다리는 경로다. IRQ가 처리되는 동안에도 현재 PintOS Thread가 자동으로 `tid=0`인 별도 Thread로 바뀌지는 않는다. IF와 외부 IRQ 문맥의 구분은 [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/)에서 다룬다.

## RSP에서 현재 Thread를 찾는 이유

PintOS는 현재 Kernel Stack과 `struct thread`를 같은 4KiB 페이지에 두므로 RSP의 하위 12비트를 지우면 페이지 시작을 얻는다. `running_thread()`는 이 주소를 `struct thread *`로 해석한다. 별도 전역 포인터를 전환할 때마다 교체하는 방식은 아니다.

다음 예제는 주소의 정렬과 경계만 계산한다. 예제 주소로 실제 메모리에 접근하거나 Kernel Thread를 생성하지 않는다.

```run-python
PAGE_SIZE = 4096
PAGE = 0x8004100000  # 실제 주소가 아닌 예제용 페이지 시작

def page_base(rsp):
    return rsp & ~(PAGE_SIZE - 1)

for offset in (0xFF8, 0xD80, 0x400):
    rsp = PAGE + offset
    print(f"RSP={rsp:#x} -> page={page_base(rsp):#x}")
    assert page_base(rsp) == PAGE

entry_rsp = PAGE + PAGE_SIZE - 8
print(f"새 함수 진입 RSP % 16 = {entry_rsp % 16}")
print(f"페이지 끝을 그대로 사용 = {page_base(PAGE + PAGE_SIZE):#x}")
assert page_base(PAGE + PAGE_SIZE) != PAGE
print("주소 내림만으로 magic이나 객체의 유효성은 확인되지 않는다.")
```

실행 결과:

```text
RSP=0x8004100ff8 -> page=0x8004100000
RSP=0x8004100d80 -> page=0x8004100000
RSP=0x8004100400 -> page=0x8004100000
새 함수 진입 RSP % 16 = 8
페이지 끝을 그대로 사용 = 0x8004101000
주소 내림만으로 magic이나 객체의 유효성은 확인되지 않는다.
```

새 함수에 넘기는 초기 RSP가 페이지 끝보다 8바이트 작은 것은 x86-64 함수 진입 시의 Stack 정렬과도 맞는다. 통상적인 함수 호출에서 반환 주소가 Stack에 들어간 직후에는 RSP를 16으로 나눈 나머지가 8이다. 다만 새 Thread는 실제 `call kernel_thread`를 거친 것이 아니라 준비된 `tf`를 복원해 진입한다. `kernel_thread()`는 전달받은 함수가 끝나면 `thread_exit()`를 호출하므로 가상의 반환 주소로 돌아가지 않는다.

`thread_current()`는 주소를 찾은 다음 `magic == THREAD_MAGIC`과 `status == THREAD_RUNNING`을 검사한다. 주소 내림 자체는 어느 비트가 Thread의 주소인지 계산할 뿐, 그 메모리에 유효한 객체가 있다는 사실을 증명하지 않는다. User Stack의 RSP에 같은 계산을 적용해서 Kernel Thread를 찾을 수도 없다. [현재 Thread 조회와 새 Thread 진입](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

상태를 이미 BLOCKED나 READY로 바꾼 `schedule()` 내부에서는 아직 같은 Kernel Stack 위에 있더라도 `thread_current()`의 RUNNING 검사를 만족하지 않는다. 이곳이 `running_thread()`를 직접 쓰는 이유다. 반대로 전환 중 `do_iret()`가 잠시 RSP를 `&next->tf`로 옮긴 순간은 일반 함수의 Stack 사용량을 재는 지점으로 적합하지 않다.

## 구조체 크기가 달라지면 Stack 공간도 달라진다

현재 `9d1b14c`의 공통 필드를 x86-64의 일반적인 LP64 배치로 계산하면 다음과 같다. 이 표는 정의에서 계산한 Offset이며, 실행 중인 Kernel의 측정값은 아니다. `USERPROG`와 `VM` 옵션이 뒤에 필드를 추가하므로 `sizeof(struct thread)`를 모든 빌드에서 같은 상수로 쓰지 않는다.

| 필드 | 시작 Offset | 크기 |
|---|---:|---:|
| `tid`, `status`, `priority`, `base_priority` | 0, 4, 8, 12 | 각각 4 |
| `wake_tick` | 16 | 8 |
| `name` | 24 | 16 |
| `donation_list` | 40 | 32 |
| `donation_elem` | 72 | 16 |
| `waiting_lock` | 88 | 8 |
| `elem` | 96 | 16 |
| `all_elem` | 112 | 16 |
| `nice`, `recent_cpu` | 128, 132 | 각각 4 |

`struct list_elem`에는 포인터 두 개가 있어 16바이트이고, `struct list`에는 Sentinel 두 개가 있어 32바이트다. 전체 Thread를 연결하는 필드의 실제 이름은 `all_elem`이다. `allelem`이나 `elem`의 고정 Offset을 다른 버전에서 그대로 가져오면 메모리를 잘못 해석한다.

`USERPROG`에서는 `pml4`, FD Table, 자식 상태 목록과 실행 파일 등의 필드가 추가된다. `VM`에서는 Supplemental Page Table, 마지막 User RSP와 Stack 경계도 보관한다. 공통 마지막에는 `intr_frame tf`와 `magic`이 온다. 현재 `intr_frame`은 192바이트지만 그것만으로 Thread 전체 크기나 남은 Stack을 알 수는 없다. [Thread 정의](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/thread.h), [Register Frame 정의](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/interrupt.h)

일반 Kernel 함수에서 `페이지 끝 - RSP`는 그 순간 Stack 상단부터 사용한 주소 범위를 살펴보는 출발점이다. 현재 Frame만의 크기나 최대 사용량은 아니다. 큰 지역 배열, 가변적인 호출 깊이, IRQ 진입 시 쌓이는 Frame을 함께 고려해야 한다. “재귀 몇 회까지 안전하다”는 기준은 각 함수의 실제 Frame과 빌드 결과 없이 정할 수 없다.

`magic` 손상은 Stack Overflow를 의심할 단서지만, 잘못된 포인터·초기화 누락·해제된 객체 접근·다른 메모리 쓰기도 원인이 될 수 있다. 값이 정상이라고 손상이 없다는 뜻도 아니다. 보호용 Guard Page처럼 접근 자체를 막는 장치는 아니기 때문이다.

## Stack과 객체 배치를 직접 확인하기

다음 GDB 명령은 일치하는 Debug Symbol로 일반 Kernel Thread의 실행을 멈춘 상황을 전제로 한다. 저장소를 읽어 작성한 관찰 절차이며, 실제 디버깅 결과를 옮긴 것은 아니다.

```gdb
set $t = (struct thread *)((unsigned long)$rsp & ~0xfffUL)
p $t->name
p $t->status
p/x $t->magic
p sizeof(struct thread)
p sizeof(struct intr_frame)
p (char *)&$t->elem - (char *)$t
p (char *)&$t->all_elem - (char *)$t
p/x $t->tf.rsp
p/x $rsp
bt 8
```

RSP가 올바른 Kernel Stack 안에 있는지 먼저 확인한다. `tf.rsp`는 이전 전환 때 저장한 값이거나 최초 실행을 위해 준비한 값이므로 지금의 RSP와 항상 같지 않다. `magic`이 변하는 시점을 좁힐 때는 유효한 객체의 주소를 먼저 확보하고 `watch $t->magic`을 사용할 수 있지만, 객체가 해제된 뒤에는 같은 주소의 의미가 달라진다.

Linux x86-64 v6.12는 `pcpu_hot.current_task`라는 CPU별 상태에서 현재 Task를 얻는다. 접근 명령은 설정에 따라 달라진다. PintOS의 4KiB 마스킹을 Linux Stack에 적용하는 방식으로 일반화하지 않는다. [Linux current](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/current.h)

Linux의 `CONFIG_VMAP_STACK`도 지원 아키텍처와 설정을 전제로 한다. 가상으로 연속된 Kernel Stack과 Guard Page를 제공하며 Task 구조체와 Stack을 PintOS처럼 한 페이지에 함께 둘 필요가 없다. Stack 크기와 IRQ Stack 사용은 별도 조건이므로 “모든 Linux는 16KiB Stack” 같은 고정 설명은 맞지 않는다. [Linux v6.12 VMAP_STACK](https://docs.kernel.org/6.12/mm/vmalloced-kernel-stacks.html)

Windows의 공개 API인 `KeGetCurrentThread()`는 현재 Thread의 불투명한 객체 포인터를 반환한다. 내부 구조의 Offset을 외워 직접 읽는 방법은 이 API의 계약이 아니다. [Microsoft의 현재 Thread API](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-kegetcurrentthread)

## 다른 운영체제의 상태 이름을 읽을 때

Linux v6.12의 `TASK_RUNNING`은 CPU에서 실행 중인 경우와 실행 가능한 대기를 같은 값으로 표현한다. `TASK_INTERRUPTIBLE`은 Signal로 대기가 중단될 수 있고, `TASK_UNINTERRUPTIBLE`은 일반적인 Signal 깨우기를 받지 않는 대기다. 후자를 “I/O만 기다리는 상태”로 한정할 수는 없다. 정지 상태와 추적 상태도 별도로 있으며, `EXIT_ZOMBIE` 같은 종료 상태는 `__state`와 다른 `exit_state` 필드에서 관리한다. [Linux Task 상태 정의](https://github.com/torvalds/linux/blob/v6.12/include/linux/sched.h)

Signal로 깨어났다는 사실만으로 모든 시스템 콜이 항상 `EINTR`을 반환한다고 단정하지 않는다. 예를 들어 `wait_event_interruptible()`은 조건이 참이면 0, Signal로 중단되면 커널 내부의 `-ERESTARTSYS`를 반환한다. 호출자가 이를 처리하는 경로까지 읽어야 최종 반환 동작을 알 수 있다. [Wait Queue API](https://github.com/torvalds/linux/blob/v6.12/include/linux/wait.h)

Windows에서도 Running·Ready·Waiting을 구분한다. 실행 가능한 Thread가 CPU를 기다리는 경우와, Timer나 동기화 객체를 기다려 실행할 수 없는 경우는 성능 분석에서도 다른 의미를 가진다. Waiting 시간이 길다는 사실만으로 문제라고 판단할 수는 없다. [Microsoft의 Thread 상태 분석](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/cpu-analysis)

관찰 API에 따라 더 세밀한 상태도 보인다. `System.Diagnostics.ThreadState`의 Standby는 CPU를 사용하기 직전인 상태, Terminated는 실행을 마친 상태를 나타낸다. 이 진단용 상태값을 읽어 Thread 사이의 동기화를 대신해서는 안 된다. [진단용 ThreadState](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.threadstate)

## 상태와 Stack을 함께 관찰하기

GDB에서는 커널 함수 호출로 값을 얻기보다, 현재 Register와 메모리에 저장된 필드를 먼저 읽는다. 다음은 일치하는 Debug Symbol을 사용한 PintOS Guest의 관찰 절차다. 실행을 마친 로그는 아니다.

```gdb
tbreak *thread_block
continue
set $blocked = (struct thread *)((unsigned long)$rsp & ~0xfffUL)
p $blocked->name
p $blocked->tid
p $blocked->status
p/x ($eflags & 0x200)
bt 4
tbreak *thread_unblock
continue
set $woken = (struct thread *)$rdi
p $woken->name
p $woken->status
```

`thread_block()`의 첫 명령에서 대상은 아직 RUNNING이다. 상태 대입문을 지난 뒤 BLOCKED를 확인해야 한다. 반대로 `thread_unblock()` 첫 명령의 RDI는 깨울 대상이며, 현재 실행 중인 Thread와 다를 수 있다. Semaphore 대기라면 값과 `waiters`, Timer 대기라면 `wake_tick`과 `sleep_list`를 함께 본다.

전환 직전과 직후에는 `disassemble /r thread_launch`로 실제 명령 위치를 확인하고 RSP와 저장된 `tf`를 비교한다. 고정된 `+0x18` Offset이나 `stepi 5`가 모든 빌드에서 전환 지점이라고 가정하지 않는다. `next_thread_to_run()`을 GDB의 식으로 호출하면 Ready Queue에서 원소를 꺼낼 수 있으므로, 관찰 목적으로 직접 호출하지 않는다. QEMU Guest Debugger의 `info threads`도 PintOS 전체 Thread 목록을 뜻하지 않는다.
