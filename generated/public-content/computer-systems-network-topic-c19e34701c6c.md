---
layout: default
title: Interrupt
nav_order: 4
permalink: /wiki/computer-systems-network-topic-c19e34701c6c/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-c19e34701c6c
projection_sha256: 4f3cfbe8c7af09a04c0601e93a0e24ed42d5395ad59a2ba3f69f5973126c892b
parent: 커널 구조
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-5cd3e3706e06
search_terms:
- 인터럽트
- IDT
- IDTR
- IF
- CLI
- STI
- EOI
- intr_frame
- intr_handler
- intr_yield_on_return
- Timer Interrupt
grand_parent: PintOS
ancestor: CS 기초
---

# Interrupt
{: .no_toc }

끝나지 않는 계산을 실행하는 Thread도 Timer Interrupt가 들어오면 잠시 커널에 제어권을 넘긴다. Timer가 실행할 Thread를 고르는 것은 아니다. 장치가 사건을 알리고, CPU가 정해진 진입점으로 이동하면, 커널이 사건을 처리하고 다음 실행을 결정한다.

PintOS의 IRQ0을 따라가면 이 역할을 구분하기 쉽다. PIT가 신호를 만들고, PIC가 vector `0x20`을 전달한다. CPU는 IDT의 진입점을 찾아 실행 상태를 보존한다. 이어지는 PintOS 코드는 Timer의 tick을 세고, 필요하면 인터럽트 처리를 마친 뒤 CPU를 양보한다.

## IDT는 진입점을, Handler Table은 C 함수를 가리킨다

IDT는 CPU가 읽는 Interrupt Descriptor Table이다. IDTR에는 테이블의 **선형 주소**와 크기 제한이 들어간다. 64비트 Interrupt Gate는 16바이트이므로, 256개 항목을 둔 PintOS의 IDT는 4,096바이트이고 IDTR의 limit은 4,095다. vector `0x20`의 항목은 IDT 시작에서 `0x200`바이트 떨어져 있다.

Gate에는 Handler 주소, Code Segment Selector, Present, DPL, Gate 종류, IST 번호가 들어간다. 64비트 Handler 주소는 하위 16비트·중간 16비트·상위 32비트로 나뉘어 저장된다. [Intel SDM의 64비트 IDT와 Stack 규칙](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-3a-part-1-manual.pdf)

PintOS에서는 `intr_init()`이 각 Gate를 `intrNN_stub`에 연결한다. `intr_register_ext()`가 C 함수 `timer_interrupt()`를 등록해도 IDT의 주소가 곧바로 이 C 함수로 바뀌지는 않는다. `register_handler()`가 별도의 `intr_handlers[vec_no]`에 함수 포인터를 기록하고, 공통 진입 코드가 이를 호출한다.

| 구조 | 읽는 주체 | PintOS의 역할 |
|---|---|---|
| `idt[256]` | CPU | vector마다 Assembly Stub으로 진입 |
| `intr_stubs[256]` | 초기화 코드 | Stub 주소를 Gate에 기록 |
| `intr_handlers[256]` | `intr_handler()` | 저장된 vector로 C Handler 선택 |
| `intr_names[256]` | 진단 코드 | vector의 이름 출력 |

64비트 함수 포인터 배열 `intr_handlers`의 크기는 2,048바이트다. IDT와 항목 수는 같지만 항목의 형식과 크기가 다르다. [PintOS의 Gate 구성과 Handler 등록](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c)

Gate의 DPL은 소프트웨어가 `INT n`으로 의도적으로 진입할 수 있는 권한을 검사할 때 사용한다. 사용자 코드에서 발생한 Page Fault나 외부 IRQ가 DPL 0 Gate로 들어오는 것까지 금지하는 값은 아니다. PintOS의 `intr_register_ext()`는 `0x20`부터 `0x2f`까지를 DPL 0 Interrupt Gate로 등록한다. 내부 예외는 `intr_register_int()`로 등록하며, 이 구현의 64비트 [시스템 콜](/wiki/computer-systems-network-topic-3cc26725c1cb/)은 `SYSCALL`과 LSTAR를 이용하는 별도 경로다.

## IF를 끈 상태와 외부 인터럽트 문맥

RFLAGS의 IF는 일반적인 Maskable Interrupt의 수락 여부에 관여한다. Interrupt Gate는 진입하면서 IF를 지우고, Trap Gate는 기존 IF를 유지한다. 따라서 `INTR_ON`으로 등록한 Trap Gate가 진입 전 IF 0을 무조건 1로 바꾸는 것은 아니다. NMI와 동기적인 CPU Exception도 IF 하나로 모두 막을 수 없다.

PintOS는 `intr_get_level()`에서 `pushfq`로 읽은 Flag의 IF 비트를 검사한다. `intr_disable()`은 이전 상태를 반환하면서 `cli`를 실행하고, `intr_enable()`은 `sti`를 실행한다. 중첩된 보호 구간에서는 이전 상태를 저장했다가 복원해야 바깥쪽 구간이 의도치 않게 풀리지 않는다.

```c
enum intr_level old_level = intr_disable ();
/* 이 CPU의 외부 IRQ와 공유하는 상태를 변경한다. */
intr_set_level (old_level);
```

이는 커널 안에서 쓰는 코드 조각이다. 사용자 프로그램에서 같은 명령을 실행할 수 있는지는 CPL·IOPL 등 CPU의 권한 조건에 달려 있다. PintOS의 일반적인 사용자 실행은 Ring 3, IOPL 0이므로 임의의 `cli`·`sti`가 허용되지 않는다. `cli`의 `"memory"` clobber는 Compiler의 메모리 접근 이동을 제한하는 장치이며, 다른 CPU와의 동기화를 보장하는 Hardware Memory Barrier를 뜻하지 않는다.

또한 **IF가 0인 것과 `intr_context()`가 true인 것은 다르다.** `intr_context()`는 PintOS가 외부 IRQ를 처리하는 동안의 `in_external_intr` 값을 반환한다. 일반 Thread가 공유 자료구조를 보호하려고 IF를 꺼도 외부 IRQ 문맥으로 바뀌지는 않는다. `sema_down()`과 `thread_block()`은 이 구분을 이용해 IF를 끈 상태에서 대기 목록과 Thread 상태를 바꾸고 스케줄링한다. 반면 외부 IRQ Handler는 `thread_block()`이나 `thread_yield()`를 직접 호출할 수 없다. [Semaphore의 대기와 깨우기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)

인터럽트 비활성화의 보호 범위는 현재 CPU다. SMP의 다른 CPU 접근까지 막지는 않는다. IF를 끄면 자발적인 Context Switch까지 사라진다는 설명도 성립하지 않는다.

PintOS의 Idle Thread는 IF를 끈 뒤 `sti; hlt`를 이어서 실행한다. IF를 0에서 1로 바꾸는 `STI`의 Interrupt Shadow 덕분에 다음 명령까지 Maskable Interrupt 수락이 미뤄져, 활성화와 대기 사이에 IRQ를 먼저 처리하고 뒤늦게 잠드는 간격을 줄인다. 이미 IF가 1인 상태의 모든 `STI`에 같은 지연이 새로 생긴다고 일반화하지 않는다. [Idle Thread의 대기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

## CPU와 Assembly가 함께 만드는 Frame

64비트 IDT 진입에서는 CPU가 복귀에 필요한 SS·RSP·RFLAGS·CS·RIP를 Stack에 저장한다. 같은 CPL의 인터럽트에서도 SS:RSP를 저장한다. 권한이 바뀌면 TSS에서 새 Stack을 얻을 수 있고, Gate의 IST가 0이 아니면 지정한 IST Stack을 사용한다. PintOS의 `make_gate`는 IST를 0으로 설정한다.

그 위에 Stub과 `intr_entry`가 나머지 값을 더한다. 낮은 메모리 주소부터 읽은 `struct intr_frame`은 다음과 같다.

| Offset | 크기 | 필드 | 채우는 경로 |
|---|---|---|---|
| 0–119 | 120바이트 | R15부터 RAX까지 15개 Register | `intr_entry` |
| 120 | 8바이트 Slot | ES와 Padding | `intr_entry` |
| 128 | 8바이트 Slot | DS와 Padding | `intr_entry` |
| 136 | 8바이트 | `vec_no` | 각 Stub |
| 144 | 8바이트 | `error_code` | CPU 또는 Stub의 0 |
| 152 | 8바이트 | RIP | CPU |
| 160 | 8바이트 Slot | CS | CPU |
| 168 | 8바이트 | RFLAGS | CPU |
| 176 | 8바이트 | RSP | CPU |
| 184 | 8바이트 Slot | SS | CPU |

전체 크기는 192바이트다. ES·DS·CS·SS는 구조체에서 16비트 Selector와 Padding으로 표현하므로 Slot 전체를 Selector 값으로 읽지 않는다. 현재 CPU Register와 메모리에 저장한 Frame도 구별해야 한다. 예를 들어 C Handler 진입 시 RDI는 Frame 포인터이고, 중단된 코드의 RDI는 `frame->R.rdi`다. [Frame 정의](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/interrupt.h), [Assembly 진입·복귀](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/intr-stubs.S)

일반 IRQ처럼 CPU가 Error Code를 만들지 않는 경우 Stub이 0을 넣어 자리를 맞춘다. 다만 확인한 저장소는 `#SS`에 해당하는 `STUB(0c, zero)`를 사용한다. CPU가 Error Code를 넣는 `#SS`의 규칙과 맞지 않는 선언이다. 따라서 이 Stub 목록을 모든 x86 Exception의 올바른 Error Code 표로 사용해서는 안 된다. 여기서는 소스와 아키텍처 규칙의 불일치를 확인했으며, 해당 Exception을 일으켜 실행 결과를 확인한 것은 아니다.

Handler가 반환하면 `intr_entry`가 일반 Register와 Segment를 복원하고, `vec_no`와 `error_code` 영역을 건너뛴 다음 `iretq`를 실행한다. 같은 CPL에서도 저장된 SS:RSP로 복귀하는 과정과 실행 예제는 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에서 이어진다.

## IRQ0을 처리한 뒤 CPU를 양보하기까지

PintOS의 PIC 초기화는 IRQ0–7을 vector `0x20`–`0x27`에, IRQ8–15를 `0x28`–`0x2f`에 연결한다. 이 Vector Base는 초기화로 정한다. 칩의 IRQ0–15가 기본적으로 CPU Vector 0–15에 고정되어 있다는 뜻은 아니다. 두 8입력 PIC에서 Master IRQ2는 Slave 연결에 쓰이므로 독립적인 외부 장치 입력은 15개다.

현재 `pic_init()`의 초기화 값을 Port 쓰기 순서로 읽으면 다음과 같다. Command Port는 Master `0x20`, Slave `0xa0`이고 Data Port는 각각 `0x21`, `0xa1`이다.

| 쓰는 내용 | Master | Slave | 의미 |
|---|---|---|---|
| 먼저 Data에 Mask 설정 | `0xff` | `0xff` | 모든 입력을 Mask |
| ICW1, Command에 쓰기 | `0x11` | `0x11` | 초기화, Edge Trigger, Cascade, ICW4 사용 |
| ICW2, Data에 쓰기 | `0x20` | `0x28` | Vector Base |
| ICW3, Data에 쓰기 | `0x04` | `0x02` | Master IRQ2의 Slave, Slave의 연결 번호 2 |
| ICW4, Data에 쓰기 | `0x01` | `0x01` | 8086 모드, 명시적 EOI |
| 마지막 Data에 Mask 설정 | `0x00` | `0x00` | 모든 Mask 해제 |

실제 소스의 ICW1 주석에는 `single mode`라는 표현이 있지만 `0x11`의 Single Mode Bit는 0이다. 뒤의 ICW3와 함께 읽으면 Cascade 설정이다. `intr_register_ext()`는 `0x20`–`0x2f` 범위를 검사하며 DPL 0, `INTR_OFF`로 Handler를 등록한다. PIC의 입력 Mask를 해제하는 것과 CPU의 IF를 켜는 것은 별도 단계다. [PIC 초기화와 등록](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c), [QEMU의 ICW 해석](https://github.com/qemu/qemu/blob/v10.0.0/hw/intc/i8259.c#L187)

QEMU의 Edge Trigger 경로에서 `pic_set_irq()`는 LOW→HIGH 변화를 IRR에 남긴다. `pic_get_irq()`는 `IRR & ~IMR`의 후보와 ISR에 남은 처리 중 요청의 우선순위를 비교한다. CPU가 요청을 받아들이는 `pic_intack()` 단계는 ISR을 세우고 해당 Edge 요청의 IRR을 지운다. EOI는 그 뒤 ISR을 정리하는 명령이다. Slave 요청은 Master IRQ2와 Slave의 로컬 IRQ를 거쳐 Slave Base에 로컬 번호를 더한 Vector로 전달된다. IF만 켜져 있다고 모든 요청이 즉시 Handler에 들어가는 것은 아니다. [QEMU 요청 선택·응답·Cascade](https://github.com/qemu/qemu/blob/v10.0.0/hw/intc/i8259.c#L40)

IRQ0의 Guest Handler 경로는 다음 순서다.

1. CPU가 IDT의 `intr20_stub`으로 진입한다.
2. Stub은 Error Code 자리의 0과 vector `0x20`을 넣는다.
3. `intr_entry`가 Register를 저장하고 `intr_handler(frame)`을 호출한다.
4. `intr_handler()`가 외부 IRQ 문맥을 표시하고 등록된 `timer_interrupt()`를 호출한다.
5. `timer_interrupt()`가 `ticks++`, `thread_tick()`, `thread_awake(ticks)`를 실행한다.
6. 공통 Handler가 외부 IRQ 문맥 표시를 지우고 PIC에 EOI를 보낸다.
7. 양보가 예약되어 있으면 `thread_yield()`를 호출한다. 이 Thread가 다시 실행되면 남은 복귀 코드를 거쳐 `iretq`에 도달한다.

`intr_handler()`는 매 외부 IRQ의 시작에서 `yield_on_return`을 false로 초기화한다. `thread_tick()`이 현재 실행 조각의 tick 수를 올려 `TIME_SLICE = 4`에 도달하면, `intr_yield_on_return()`이 이 값을 true로 바꾼다. 실제 양보는 다음 마무리 코드에서 이루어진다.

```c
in_external_intr = false;
pic_end_of_interrupt (frame->vec_no);
if (yield_on_return)
    thread_yield ();
```

따라서 “`iretq`로 돌아간 다음 양보한다”는 순서가 아니다. EOI를 보낸 뒤에도 아직 C의 `intr_handler()` 안에 있으며, 그곳에서 Context Switch가 가능하다. `schedule()`은 새 실행 조각을 시작하며 `thread_ticks`를 0으로 만든다. Ready Queue와 우선순위에 따라 같은 Thread가 다시 선택될 수도 있다. Timer가 100Hz이고 조각이 4 tick이라는 계산만으로 초당 Context Switch가 반드시 25회 일어난다고 단정할 수 없다.

`TIME_SLICE`는 목표 100Hz의 tick 4개, 명목상 약 40ms다. Thread가 tick 사이에서 선택될 수도 있고, IRQ 수락이 늦어지거나 스스로 일찍 Block할 수도 있다. 이 값을 모든 실행의 최대 연속 시간이나 정확한 Wall-clock Quantum으로 해석하지 않는다. 더 높은 우선순위의 Thread가 깨어났을 때의 선택은 [우선순위 스케줄링](/wiki/computer-systems-network-topic-6276ce481024/)에서 별도로 살펴본다.

명령 수를 계산하려면 CPU의 실행률까지 가정해야 한다. 가령 100 MHz에서 Cycle당 명령 한 개를 완료하는 IPC 1을 가정하면 `100,000,000 × 0.04 × 1 = 4,000,000`개다. 4 tick만으로 이 수가 정해지지는 않는다. 실제 IPC, 메모리 대기, 인터럽트 처리, TCG 번역 비용과 Host 실행 시간을 고려하지 않은 이 계산을 PintOS의 처리량으로 쓰면 안 된다.

| 통계 분류 | 현재 구현의 검사 |
|---|---|
| `idle_ticks` | 현재 Thread가 `idle_thread`인지 |
| `user_ticks` | USERPROG 빌드에서 현재 Thread의 `pml4`가 있는지 |
| `kernel_ticks` | 앞의 두 분류에 해당하지 않는지 |

현재 `thread_tick()`에는 MLFQS를 선택했을 때의 `recent_cpu`·`load_avg`·우선순위 갱신도 있다. `user_ticks` 통계는 `t->pml4 != NULL`로 분류하므로, 그 순간의 CS가 Ring 3인지 직접 측정한 시간 통계와는 다르다. [Thread의 tick 처리와 스케줄링](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

EOI는 PIC가 기록한 처리 중 상태를 정리하는 응답이다. 현재 PintOS는 Master의 command port `0x20`에 `0x20`을 쓰고, Slave IRQ이면 `0xa0`에도 보낸다. 이 처리를 미룬 채 다른 실행으로 넘어가면 같은 IRQ와 PIC의 우선순위 관계에 있는 요청이 지연될 수 있다. 모든 종류의 CPU Exception과 IRQ가 영원히 차단된다는 뜻은 아니다.

`0x20`은 특정 IRQ 번호를 적지 않는 Non-specific EOI이며 현재 일반 우선순위 모드에서는 해당 PIC의 가장 높은 처리 중 IRQ를 정리한다. Slave IRQ에는 두 PIC의 상태 정리가 필요하다. PintOS의 Master→Slave 순서를 모든 구현의 권장 순서로 일반화하지 않는다. 예를 들어 Linux v6.12의 `mask_and_ack_8259A()`는 Slave에 Specific EOI를 보낸 뒤 Master IRQ2에 Specific EOI를 보낸다. [QEMU EOI 처리](https://github.com/qemu/qemu/blob/v10.0.0/hw/intc/i8259.c#L247), [Linux v6.12의 PIC 응답](https://github.com/torvalds/linux/blob/v6.12/arch/x86/kernel/i8259.c)

등록된 C Handler가 없으면 대부분의 vector는 Frame을 출력하고 Panic으로 이어진다. `0x27`과 `0x2f`에는 Spurious IRQ를 위한 예외 경로가 있다. 이 두 번호의 모든 IRQ가 가짜라는 뜻은 아니며, 여기의 예외는 **등록된 Handler가 없는 경우**에 적용된다.

### 반환 순서를 바꿔 보는 예제

아래 Python 코드는 IRQ0의 처리 표시·EOI·양보 순서만 표현한다. CPU나 PIC를 실행하는 Emulator는 아니다. 실제 PintOS의 `thread_yield()`는 외부 IRQ 문맥을 검사하고, 예제는 순서를 드러내려고 EOI 여부도 별도로 검사한다.

```run-python
TIME_SLICE = 4
slice_ticks = 0
in_external_intr = False
in_service = False
yield_on_return = False

def yield_cpu():
    global slice_ticks
    assert not in_external_intr, "external IRQ 처리 중에는 yield할 수 없음"
    assert not in_service, "이 모델의 IRQ0 EOI가 아직 끝나지 않음"
    slice_ticks = 0
    return "yield"

for tick in range(1, 6):
    in_service = True
    in_external_intr = True
    yield_on_return = False
    slice_ticks += 1
    yield_on_return = slice_ticks >= TIME_SLICE
    events = [f"handler(slice={slice_ticks})"]
    if yield_on_return:
        try:
            yield_cpu()
        except AssertionError:
            events.append("direct yield rejected")
    in_external_intr = False
    events.append("external=false")
    in_service = False
    events.append("EOI")
    if yield_on_return:
        events.append(yield_cpu())
    print(f"tick {tick}: " + " -> ".join(events))
```

실행 결과:

```text
tick 1: handler(slice=1) -> external=false -> EOI
tick 2: handler(slice=2) -> external=false -> EOI
tick 3: handler(slice=3) -> external=false -> EOI
tick 4: handler(slice=4) -> direct yield rejected -> external=false -> EOI -> yield
tick 5: handler(slice=1) -> external=false -> EOI
```

네 번째 tick에서 곧바로 양보하려는 호출은 거부된다. 외부 IRQ 처리를 마치고 EOI를 보낸 뒤에는 양보가 가능하고, 다음 실행 조각은 다시 1부터 시작한다. `TIME_SLICE`를 바꾸면 예약 시점이 어떻게 달라지는지 볼 수 있다.

## QEMU의 시간과 Guest의 tick

PintOS는 PIT channel 0을 Mode 2로 설정한다. 제어어 `0x34`를 port `0x43`에 쓰고, 계산한 count의 하위·상위 바이트를 port `0x40`에 차례로 쓴다. 목표 주파수 100Hz일 때 count는 11,932, 즉 `0x2e9c`다. 장치의 Port I/O·MMIO 구분은 [장치](/wiki/computer-systems-network-topic-d38307e3894c/)에서 다룬다.

QEMU v10.0.0의 PIT는 `QEMU_CLOCK_VIRTUAL`을 기준으로 다음 출력 변화 시점을 예약한다. 출력 변화는 `qemu_set_irq()`를 거쳐 PIC의 요청 상태에 전달된다. 이는 Host의 매 10ms마다 PintOS 함수를 직접 호출한다는 뜻이 아니다. Guest CPU가 IRQ를 수락할 조건과 가상 시간 진행, Host 스케줄링도 영향을 준다. IF를 오래 끄면 전달이 지연될 수 있고, PIC의 Pending Bit는 같은 IRQ가 발생한 횟수를 무제한으로 세는 Queue가 아니다. [QEMU PIT](https://github.com/qemu/qemu/blob/v10.0.0/hw/timer/i8254.c), [PIC](https://github.com/qemu/qemu/blob/v10.0.0/hw/intc/i8259.c)

TCG의 64비트 Interrupt 진입은 `target/i386/tcg/seg_helper.c`의 `do_interrupt64()`에서 확인할 수 있다. 이 함수는 `env->idt.base + vector * 16`을 Kernel Memory 접근 함수로 읽고, Gate를 검사한 뒤 Guest Stack에 복귀 상태를 쓴다. IDTR을 물리 주소로 간주해 Host 포인터로 역참조하는 과정이 아니다. [QEMU의 IDT 진입](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/seg_helper.c#L925-L1060)

Linux의 `NO_HZ` 설정은 Idle CPU나 조건을 만족하는 CPU의 불필요한 Scheduling Tick을 줄인다. 따라서 모든 OS의 선점을 PintOS의 고정 4 tick과 같은 방식으로 계산할 수는 없다. Windows의 DPC 역시 ISR의 후처리를 더 낮은 IRQL로 미루는 수단이며, PintOS의 양보 플래그와 구현이 같은 것은 아니다. [Linux NO_HZ](https://docs.kernel.org/timers/no_hz.html), [Windows DPC](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/introduction-to-dpc-objects)

Linux v6.12에서 해당 주기 처리 함수의 이름은 `sched_tick()`이다. 이 함수는 Run Queue의 시간을 갱신하고 현재 Task의 `sched_class->task_tick()`을 호출한다. 모든 Task의 고정 잔여 시간을 하나씩 줄이고 그 자리에서 RIP를 교환하는 공통 루틴은 아니다. 재스케줄링 요청과 실제 전환은 별도 경로이며, Fair Scheduler의 EEVDF 선택과 다른 정책의 차이는 [우선순위 스케줄링의 OS 비교](/wiki/computer-systems-network-topic-6276ce481024/#linux와-windows를-비교하는-기준)에서 이어진다. [Linux v6.12 sched_tick](https://github.com/torvalds/linux/blob/v6.12/kernel/sched/core.c#L5584-L5614)

현대 Timer는 먼저 시간을 읽는 **Clocksource**와 지정 시점에 인터럽트를 발생시키는 **Clockevent**를 구분해 비교한다. Linux가 항상 PIT→HPET→APIC→TSC 순서로 장치를 교체하는 고정 경로는 아니다. Linux v6.12의 PIT 드라이버에도 조건부 One-shot 지원이 있어 “PIT는 주기 모드만 가능하다”는 비교표는 맞지 않는다. APIC Timer의 LVT와 외부 입력 LINT0을 같은 것으로 보거나, TSC Counter의 주파수를 현재 CPU 실행 주파수와 항상 같다고 보면 안 된다. Windows의 QPC도 적합한 TSC 또는 Platform Counter를 사용하므로 “Windows는 APIC를 쓴다”만으로 시간 측정을 설명할 수 없다. [Linux Clocksource·Clockevent](https://docs.kernel.org/timers/timekeeping.html), [Linux PIT One-shot](https://github.com/torvalds/linux/blob/v6.12/drivers/clocksource/i8253.c#L139), [APIC Timer·LINT Register 구분](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/apicdef.h#L103), [Windows QPC와 TSC](https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps)

QEMU 시각을 ns 단위로 표현한다는 사실은 1 ns의 실제 IRQ 전달 정밀도를 보장하지 않는다. `icount` 설정에서는 실행한 명령 수로 가상 시간의 진행을 계산할 수 있지만 Cycle-accurate CPU 모델은 아니다. Host 부하와 실행 설정을 고정하지 않은 채 Emulator 오버헤드나 Handler 지연을 일정한 ns 수치로 제시하지 않는다. [QEMU icount의 범위](https://www.qemu.org/docs/master/devel/tcg-icount.html)

## GDB에서는 저장된 Frame부터 읽는다

다음은 Debug Symbol이 일치하는 PintOS Guest에 연결한 뒤 사용할 관찰 명령이다. 실행 결과를 미리 정한 로그가 아니라, 실제로 읽어야 할 값과 위치를 보여 준다. 함수 호출을 수반하는 `thread_current()`나 Debug 정보에 없는 `list_entry` Macro 대신 저장된 인자와 메모리를 우선 읽는다.

```gdb
tbreak *intr_handler
continue
set $frame = (struct intr_frame *)$rdi
p/x $frame->vec_no
p/x $frame->error_code
p/x $frame->rip
p/x $frame->rsp
p/x $frame->eflags
p sizeof(struct intr_frame)
p sizeof(idt)
p/x idt_desc
p intr_handlers[$frame->vec_no]
```

Timer 흐름은 `timer_interrupt`, `thread_tick`, `intr_yield_on_return`, `thread_yield`의 Breakpoint로 이어서 관찰할 수 있다. 함수 진입 직후와 대입문 실행 뒤를 구분해야 tick 값의 전후 관계를 잘못 읽지 않는다. 외부 IRQ 마무리에서 `in_external_intr`, `yield_on_return`, EOI 호출 순서를 함께 확인하면 된다.

Guest GDB의 `info threads`는 보통 QEMU가 노출한 vCPU를 가리키며 PintOS의 모든 Thread 목록을 자동으로 보여 주는 명령이 아니다. QEMU의 `pit_irq_timer_update()`나 `pic_set_irq()`를 조사하려면 QEMU 자체의 Debug Symbol을 사용한 Host Debugger가 필요하다. 두 관찰 대상의 차이는 [Debugger](/wiki/platform-delivery-operations-topic-f89d71c7eb29/)에 정리되어 있다.

GDB의 `$pc`는 현재 명령 위치이며 경과 시간을 재는 Clock이 아니다. 이를 상수나 이전 주소와 빼서 tick 간 시간을 측정하지 않는다. `timer_init()`의 Count 대입 전이나 `timer_interrupt()`의 `ticks++` 전에서 멈추면 아직 갱신되지 않은 값이 보인다. 고정 소스 줄 번호 대신 함수·대입 위치와 Disassembly를 확인하고, 짧은 지연의 `timer_calibrate()`·`loops_per_tick` 및 Sleep 관찰은 [알람 시계](/wiki/computer-systems-network-alarm-clock-4f0f0546530e/)의 기존 예제를 사용한다.
