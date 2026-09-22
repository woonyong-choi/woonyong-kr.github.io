---
layout: default
title: 스레드 구현
nav_order: 4
permalink: /wiki/computer-systems-network-topic-936b351311c8/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-936b351311c8
projection_sha256: 79cd58767c8c5f5002af1647876db8dc039c942c40f3e9b78aacd144a477422b
parent: PintOS
content_status: ready
public_parent_id: Wiki/projects/pintos
search_terms:
- thread_init
- thread_start
- Idle Thread
- idle_started
- HLT
- STI
- Boot
- MLFQS
grand_parent: OS
ancestor: CS 기초
---

# 스레드 구현
{: .no_toc }

PintOS의 Thread 구현은 부팅 때 이미 실행 중인 코드에 Thread 상태를 부여하는 데서 시작한다. 이후 생성·대기·깨우기·선점이 같은 자료구조를 사용한다. 각 함수를 따로 읽기보다 현재 Stack, Thread 상태, 대기 목록이 언제 함께 바뀌는지를 따라가면 연결이 보인다.

## 처음부터 실행 중이던 main

현재 `lrn-pintos`의 `9d1b14c`에서 `thread_init()`은 새 페이지를 할당하거나 다른 실행 흐름으로 전환하지 않는다. Boot 코드가 마련한 현재 Stack의 페이지 시작을 찾아 `initial_thread`로 사용한다. 그 자리에 `init_thread(..., "main", PRI_DEFAULT)`로 구조체를 초기화하고 RUNNING 상태와 TID를 부여한다.

진입 시 IF는 OFF여야 한다. 임시 GDT를 로드하고 `tid_lock`, `ready_list`, `sleep_list`, `destruction_req`, `all_list`와 `load_avg`를 초기화한다. MLFQS가 켜져 있으면 초기 Thread의 우선순위를 계산한 뒤 `all_elem`으로 전체 목록에 넣는다. TID는 `allocate_tid()`가 Lock으로 보호한 증가값을 사용한다. [thread_init](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c#L164)

이 시점의 `main`은 Ready Queue에서 선택된 새 Thread가 아니다. 이미 사용 중인 Boot Stack을 Thread 규약에 맞게 등록한 것이다. `init_thread()`가 설정한 `tf.rsp`도 최초 Frame 준비용 값이며, 현재 C 함수의 RSP를 읽어 기록한 값은 아니다. 실제 저장·복원 과정은 [문맥 교환](/wiki/computer-systems-network-topic-6d5c07c64010/)에 이어진다.

Linux도 부팅 초기 Task를 일반적인 Task 생성 API로 처음 만드는 것은 아니다. v6.12의 `init_task`는 정적 구조체로 정의되고 `init_stack`을 참조한다. 초기 실행 문맥을 OS가 관리할 형태로 준비한다는 점은 같지만, PintOS의 페이지 마스킹과 Linux의 구조체 배치를 동일한 구현으로 보지는 않는다. [Linux 초기 Task](https://github.com/torvalds/linux/blob/v6.12/init/init_task.c)

## 초기화 순서는 사용할 수 있는 기능을 결정한다

`threads/init.c`에서는 `thread_init()` 뒤에 페이지 할당기와 Heap 할당기를 준비한다. USERPROG 빌드의 TSS·GDT 초기화와 Interrupt·Timer·입력 장치 초기화를 거친 다음 `thread_start()`를 호출한다. Serial Queue 초기화와 Timer Calibration은 그 뒤다. 이 순서를 바꾸면 아직 준비되지 않은 할당·인터럽트·대기 기능을 호출할 수 있다. [Kernel 초기화 순서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/init.c#L76)

`thread_create()`는 `palloc_get_page(PAL_ZERO)`를 쓰므로 페이지 할당기가 먼저 준비되어야 한다. `thread_init()`이 끝났다는 사실만으로 임의의 Blocking을 안전하게 할 수 있다는 뜻도 아니다. 실행 가능한 다른 Thread와 Idle이 아직 없는 부팅 구간에서 대기하면 다음 실행 대상을 확보하지 못할 수 있다.

`init_thread()`는 구조체를 0으로 지우고 BLOCKED 상태, 이름, 기본·유효 우선순위, 초기 RSP, `nice`, `recent_cpu`, `magic`, Donation 목록을 설정한다. USERPROG에서는 FD·자식 상태·실행 파일 필드를, VM에서는 User RSP와 Stack 경계를 준비한다. 전체를 0으로 지웠다고 Supplemental Page Table 등의 별도 초기화까지 끝난 것은 아니다.

새 Thread 생성 코드는 여기에 실행할 함수와 인자를 Frame에 넣고 `all_list`에 연결한 뒤 `thread_unblock()`으로 실행 후보에 올린다. MLFQS에서는 Idle을 제외한 자식이 생성자의 `nice`와 `recent_cpu`를 이어받는다. 더 높은 우선순위의 새 Thread는 생성 함수가 반환하기 전에 실행될 수 있다. [Thread 생성과 초기 상태](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c#L279)

## Idle 준비를 기다리는 작은 Semaphore

`thread_start()`는 초기값 0인 지역 Semaphore `idle_started`를 만들고, 그 주소를 Idle Thread의 인자로 넘긴다. 이어 `intr_enable()`을 호출하고 `sema_down()`으로 준비 완료를 기다린다. Idle은 처음 실행될 때 `idle_thread = thread_current()`를 대입한 뒤 `sema_up(idle_started)`으로 완료를 알린다.

`thread_start()`가 반환한 뒤에야 Interrupt가 처음 켜지는 것은 아니다. 함수 안의 `intr_enable()` 이후에는 Timer IRQ가 들어올 수 있다. Idle이 먼저 `sema_up()`을 마쳤다면 뒤늦게 호출한 `sema_down()`이 값을 소비하고 바로 진행할 수도 있다. 초기값이 0이라는 이유만으로 Down이 반드시 Block한다고 단정하지 않는다. 이 통지 순서는 [Semaphore](/wiki/computer-systems-network-topic-fef68d934a03/)의 실행 모델과 같은 원리다.

Semaphore를 지역 변수로 두어도 이 경로에서는 `thread_start()`가 준비 완료를 기다리는 동안 Stack Frame이 살아 있다. Idle이 포인터를 영구 보관해 나중에도 쓰는 설계가 아니다. 함수가 반환한 뒤 지역 변수의 주소를 계속 이용할 수 있다는 일반 규칙으로 확대하지 않는다.

Idle의 `sema_up()`은 깨어난 main의 우선순위에 따라 즉시 선점을 일으킬 수 있다. 따라서 Idle이 반드시 자기 반복문의 `thread_block()`까지 실행하고 나서 main이 돌아온다고 순서를 고정하면 안 된다.

## 아무도 실행할 일이 없을 때

Idle은 최초 실행을 위해 한 번 Ready Queue에 들어간다. 이후에는 일반적인 Ready 재삽입에서 제외되고, Queue가 비었을 때 `next_thread_to_run()`이 반환하는 마지막 실행 대상이 된다. Idle이 `thread_block()`을 호출해도 다른 후보가 없으면 다시 자신이 선택될 수 있다.

Idle의 반복문은 IF를 끄고 Block한 다음 다시 선택되면 `sti; hlt`로 사건을 기다린다. IF가 0인 상황에서 `sti`가 만드는 Maskable Interrupt 지연 덕분에 바로 다음 `hlt`까지 진행할 수 있다. 이 설명을 NMI를 포함한 모든 사건의 차단으로 해석하지 않는다. `hlt`는 CPU를 종료하거나 Thread를 파괴하는 명령이 아니며, 이 Kernel의 권한 있는 실행 문맥에서 사용한다. [Idle 반복문](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c#L545)

QEMU v10.0.0의 TCG `helper_hlt()`는 `CPUState`의 `halted`를 설정하고 `EXCP_HLT`로 현재 CPU 실행 루프를 빠져나간다. Guest의 HLT를 Host 프로세스 종료로 처리하는 것은 아니다. 이것만으로 Host CPU 소비나 절전 효과를 수치로 검증한 것도 아니다. [QEMU HLT 처리](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/misc_helper.c#L508)

Linux의 CPUIdle은 논리 CPU의 Idle 경로에서 Governor와 Driver가 협력한다. Idle State를 선택할 때 예상 대기 시간, 진입 후 이득이 생기는 시간과 복귀 지연 등을 고려한다. 모든 CPU에서 같은 C-state를 쓰거나 모든 Idle이 반드시 `hlt` 한 명령으로 구현되는 것은 아니다. [Linux v6.12 CPUIdle](https://docs.kernel.org/6.12/admin-guide/pm/cpuidle.html)

PintOS의 `idle_ticks`, `kernel_ticks`, `user_ticks`는 Timer tick을 실행 상태에 따라 분류한 통계다. User 통계도 현재 코드에서는 Thread의 `pml4` 유무로 분류하므로 매 tick에 직접 CPL을 측정한 결과로 읽지 않는다. 전력량이나 Host의 CPU 점유율을 나타내는 값도 아니다.

## Timer에서 시작한 경로를 이어 읽기

PIT 설정과 IRQ 전달은 하드웨어·QEMU 쪽의 역할이고, 깨어난 Thread 중 누구를 실행할지 정하는 것은 PintOS Scheduler의 역할이다. 현재 `TIMER_FREQ = 100`은 명목상 tick 간격을 약 10ms로 정한다. QEMU 실행·Debug 정지·Interrupt 지연이 있어도 Host 시계에서 정확히 10ms마다 Handler가 실행된다는 보장은 아니다.

`TIME_SLICE = 4`에 도달하면 IRQ 반환 시 양보를 요청하지만, 반드시 다른 낮은 우선순위 Thread로 바뀌는 것은 아니다. 다음 대상을 고르는 정책은 그대로 적용된다. Sleep의 목표 tick에 도달했다는 사실도 즉시 CPU를 얻었다는 뜻은 아니다.

상태와 실행 위치는 [Thread](/wiki/computer-systems-network-topic-aebc87b0fcf5/)와 [문맥 교환](/wiki/computer-systems-network-topic-6d5c07c64010/)에서, 시각과 깨우기는 [Alarm Clock](/wiki/computer-systems-network-alarm-clock-4f0f0546530e/)과 [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/)에서 살펴본다. 실행 후보의 순서는 [우선순위 스케줄링](/wiki/computer-systems-network-topic-6276ce481024/), Lock을 기다릴 때의 역전은 [Priority Donation](/wiki/computer-systems-network-topic-0eef2c64a382/)에 연결된다.

## 부팅 경계를 GDB에서 관찰하기

다음은 일치하는 Debug Symbol을 사용하는 관찰 절차다. 실행 완료 기록은 아니다.

```gdb
tbreak *thread_init
continue
p/x ($eflags & 0x200)
set $boot_page = (struct thread *)((unsigned long)$rsp & ~0xfffUL)
finish
p initial_thread == $boot_page
p initial_thread->name
p initial_thread->status
p/x initial_thread->magic
tbreak *thread_start
continue
tbreak *idle
continue
```

`thread_init()` 첫 명령에서 아직 유효한 Thread라고 가정해 `thread_current()`를 호출하지 않는다. 초기화가 끝난 뒤 필드와 상태를 읽는다. Idle 진입 시점과 `sema_up()` 이후의 실행 주체를 비교하면 준비 완료 통지와 선점을 구분할 수 있다. 멈추는 위치는 빌드의 Disassembly로 확인하며, `printf()`를 전환 중에 넣어 실행 순서가 그대로 유지된다고 가정하지 않는다.
