---
layout: default
title: 문맥 교환
nav_order: 5
permalink: /wiki/computer-systems-network-topic-6d5c07c64010/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-6d5c07c64010
projection_sha256: 09ac967f8810379dc825c82bd0ba791cc070646136f051dc3e1dd3b7bd0d57f3
parent: 프로세스와 스레드
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63b969bafddd
search_terms:
- Context Switch
- 문맥 교환
- thread_launch
- do_iret
- intr_frame
- RIP
- RSP
- out_iret
grand_parent: OS
ancestor: CS 기초
---

# 문맥 교환
{: .no_toc }

문맥 교환은 지금 실행을 멈춘 위치를 보관하고 다른 실행 흐름을 이어 가는 과정이다. 함수 이름이 같더라도 Thread마다 Stack과 지역 변수, 돌아갈 위치가 따로 있다. A가 `schedule()`에서 양보한 뒤 B가 실행되었다면, 나중에 A가 선택될 때는 A가 남겨 둔 호출 경로로 돌아간다.

## 다시 선택되면 처음부터 실행하지 않는다

다음 예제는 Generator의 재개 위치로 이 차이를 보여 준다. 선택 순서를 직접 지정한 Python 모델이며 CPU Register나 PintOS Scheduler를 구현하지 않는다.

```run-python
# Generator가 기억하는 재개 위치를 이용한 설명 모델이다.
# CPU Register 저장이나 PintOS Scheduler를 구현한 코드는 아니다.
def worker(name):
    print(f"{name}: 함수 시작")
    yield
    print(f"{name}: 첫 양보 뒤에서 재개")
    yield
    print(f"{name}: 함수 종료")

workers = {name: worker(name) for name in ("A", "B")}
for selected in ("A", "B", "A", "B", "A", "B"):
    try:
        next(workers[selected])
    except StopIteration:
        print(f"{selected}: 더 이상 실행할 코드 없음")
```

실행 결과:

```text
A: 함수 시작
B: 함수 시작
A: 첫 양보 뒤에서 재개
B: 첫 양보 뒤에서 재개
A: 함수 종료
A: 더 이상 실행할 코드 없음
B: 함수 종료
B: 더 이상 실행할 코드 없음
```

A를 다시 선택해도 `함수 시작`을 반복하지 않는다. 실제 PintOS는 Generator 대신 저장된 RIP와 RSP, Register와 Kernel Stack을 사용한다. 처음 실행하는 Thread에는 돌아갈 이전 실행 지점이 없으므로 생성 시 준비한 `kernel_thread(function, aux)`에서 시작한다.

## 다음 Thread를 고르는 일과 전환하는 일

현재 `lrn-pintos`의 `9d1b14c`에서는 `schedule()`이 다음 순서로 처리한다.

1. `running_thread()`로 아직 현재 Stack을 쓰는 Thread를 찾는다.
2. `next_thread_to_run()`이 Ready Queue의 첫 Thread 또는 Idle을 선택한다.
3. 선택한 Thread를 RUNNING으로 표시하고 `thread_ticks`를 0으로 만든다.
4. USERPROG 빌드에서는 `process_activate(next)`로 주소 공간과 Kernel Stack 진입 정보를 준비한다.
5. 현재와 다음 Thread가 다르면 `thread_launch(next)`를 호출한다.

현재 Thread가 양보한 뒤 다시 가장 높은 우선순위로 선택될 수도 있다. 이때는 `thread_launch()`를 거치지 않지만, 앞선 상태·tick 초기화와 USERPROG의 `process_activate()`는 이미 실행된다. 주소 공간 활성화를 `curr != next` 안에서만 수행한다고 읽으면 실제 코드와 다르다. [Scheduler와 전환 코드](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c), [process_activate](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c)

DYING인 이전 Thread는 이때 바로 해제하지 않고 `destruction_req`에 넣는다. 자신이 실행 중인 Stack을 먼저 반환할 수 없기 때문이다. 실제 페이지 반환은 이후 `do_schedule()`이 처리한다. 상태와 종료 경로는 [Thread](/wiki/computer-systems-network-topic-aebc87b0fcf5/)에 이어진다.

## thread_launch가 보관하는 실행 위치

`thread_launch()`는 현재와 다음 Thread의 `tf` 주소를 준비하고 IF가 꺼져 있는지 검사한 뒤 Inline Assembly에 들어간다. 함수 전체가 Assembly만으로 이루어진 것은 아니다. C 호출과 함수 진입을 거친 **이 저장 지점의 Kernel 실행 문맥**을 기록한다.

현재 `struct intr_frame`의 배치는 다음과 같다. Register를 저장하는 위치와 `iretq`가 읽을 복귀 정보를 같은 구조 안에 맞춰 둔다.

| Offset | 내용 |
|---:|---|
| 0–119 | `r15`부터 `rax`까지 15개 GP Register |
| 120, 128 | ES, DS와 각각의 Padding |
| 136, 144 | `vec_no`, `error_code` |
| 152 | RIP |
| 160 | CS와 Padding |
| 168 | RFLAGS를 담는 `eflags` |
| 176 | RSP |
| 184 | SS와 Padding |

전체 Frame은 192바이트다. 그러나 `thread_launch()`가 192바이트 전부를 새로 채우는 것은 아니다. 문맥 교환 경로는 `vec_no`와 `error_code`를 쓰지 않고 건너뛴다. 이 필드는 IRQ·예외 진입에도 같은 Frame 형식을 쓰기 때문에 존재한다. [Frame 정의](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/interrupt.h)

Assembly는 작업에 사용할 RAX·RBX·RCX를 Stack에 잠시 보관하고, 나머지 Register와 함께 원래 저장 지점의 값으로 `tf`에 옮긴다. `call __next`가 Stack에 남긴 주소를 꺼낸 다음 `out_iret - __next`를 더해 재개할 Label을 계산한다. 현재 RSP, Segment Selector와 Flags도 기록하고 다음 Thread의 `tf`를 `do_iret()`에 넘긴다.

이 Frame을 “CPU의 모든 상태”라고 부르면 범위가 지나치게 넓다. 여기에는 FPU·SIMD Register, 모든 MSR, Debug Register까지 저장하는 코드가 없다. 호출 전 User Register를 이 C 함수가 처음부터 모두 보존한다는 뜻도 아니다. 호출 규약상 Caller-saved Register는 앞선 함수 호출에서 이미 바뀌었을 수 있다.

## do_iret 뒤에 이어지는 두 가지 경로

`do_iret()`는 RSP를 다음 Thread의 `tf` 주소로 바꾼다. GP Register와 DS·ES를 복원하고 RSP를 Frame의 Offset 152로 옮겨 `iretq`를 실행한다. 이때 RIP·CS·RFLAGS·RSP·SS가 준비된 실행 위치로 복원된다. 현재 PintOS의 x86-64 복귀 경로이며, 32비트 모드의 같은 권한 복귀 규칙을 그대로 적용하지 않는다. QEMU v10.0.0의 64비트 IRET 구현도 같은 CPL이라는 이유만으로 RSP·SS 복원을 생략하지 않는다. [QEMU의 IRET 복원 분기](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/seg_helper.c#L2084)

이전에 실행하던 Thread라면 RIP가 `out_iret`이므로 `thread_launch()`의 뒤를 거쳐 자기 `schedule()` 호출 경로로 돌아간다. `thread_yield()`에서 멈췄다면 그 함수의 남은 IF 복원 코드까지 이어진다. 새 Thread라면 생성 시 설정한 RIP가 `kernel_thread`이므로 전달받은 함수를 처음 실행한다. 두 경우에 같은 복원 함수를 쓸 수 있는 것은 생성 코드가 최초 Frame을 미리 구성했기 때문이다.

Timer IRQ가 계기인 전환에서는 Frame을 둘로 구분해야 한다. IRQ 진입 시 기존 실행 상태가 Kernel Stack에 저장되고, IRQ 반환 전 양보 경로를 따라 들어간 `thread_launch()`는 그보다 안쪽의 Kernel 호출 상태를 `thread.tf`에 저장한다. 나중에 이 Thread가 선택되면 안쪽 호출부터 되돌아오고, 결국 IRQ 반환 코드가 바깥 Frame을 복원한다. `thread.tf` 하나가 언제나 인터럽트 직전 User 상태라고 해석하면 이 순서가 사라진다. [IRQ 진입·반환](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/intr-stubs.S), [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/)

## Register 외에 함께 바뀌는 상태

USERPROG의 `process_activate(next)`는 다음 Thread의 Page Table을 활성화하고 TSS의 Kernel Stack 진입 정보를 갱신한다. 이는 다음 User→Kernel 진입에 필요한 준비이며, 현재 Assembly의 RSP를 즉시 바꾸는 `do_iret()`와 역할이 다르다. 서로 다른 User 주소 공간이 같은 가상 주소를 쓰더라도 Page Table이 다른 물리 페이지로 연결할 수 있다. Kernel Thread에는 Kernel용 Page Table을 사용한다.

CR3 변경과 TLB 처리, QEMU가 번역한 코드의 Translation Block 캐시는 구분한다. 주소 변환 캐시의 갱신을 “모든 CPU Cache와 번역 코드를 매번 지운다”로 확대할 수 없다. 세부 경로는 [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/)에서 다룬다. Register 저장 비용뿐 아니라 주소 공간 전환과 이후 Cache 접근도 성능에 영향을 주지만, 이 코드 검토만으로 어느 항목이 가장 비싸다고 측정한 것은 아니다.

Linux x86-64 v6.12의 `__switch_to_asm`은 RBP·RBX·R12–R15를 Stack에 저장한 뒤 이전 RSP를 보관하고 다음 RSP를 불러온다. 이 여섯 Register만이 전체 Task 상태라는 뜻은 아니다. 뒤의 `__switch_to()`가 TLS, FS/GS, FPU 전환 준비·마무리, CPU별 현재 Task와 Stack 정보를 함께 처리한다. Kernel 함수의 호출 규약과 IRQ·User 복귀 Frame이 각각 보존할 상태를 나눈 구조다. [Linux Assembly 전환](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/entry_64.S#L177), [Linux C 전환](https://github.com/torvalds/linux/blob/v6.12/arch/x86/kernel/process_64.c#L606)

## 전환 직전과 직후를 관찰하는 위치

다음은 Debug Symbol이 일치하는 PintOS를 GDB로 관찰할 때 사용할 절차다. 실행 로그가 아니며, 최적화된 빌드에서는 변수의 관찰 가능 여부가 달라진다.

```gdb
tbreak *thread_launch
continue
set $previous = (struct thread *)((unsigned long)$rsp & ~0xfffUL)
set $next = (struct thread *)$rdi
p $previous->name
p $next->name
p/x &$previous->tf
p/x &$next->tf
p/x $next->tf.rip
p/x $next->tf.rsp
disassemble /r thread_launch
disassemble /r do_iret
```

RDI가 첫 인자를 담는다는 해석은 이 x86-64 함수의 첫 명령에서만 적용한다. 함수 안쪽으로 진행한 뒤에도 계속 같은 인자라고 가정하지 않는다. 실제 Disassembly에서 `iretq` 위치에 멈춰 `x/5gx $rsp`로 복귀 Frame을 읽고, 한 명령씩 진행한 뒤 RIP·RSP·호출 경로를 비교할 수 있다. 고정된 `함수+0x18`이나 `stepi 5`가 모든 빌드의 전환 지점이라는 보장은 없다.

`next_thread_to_run()`을 GDB 식으로 직접 호출하면 Ready Queue에서 원소를 꺼낼 수 있다. 관찰 중 Kernel 함수를 임의 호출하지 않고 Register와 메모리를 읽는다. 전환 중 `printf()`를 넣는 방법 역시 Stack·Lock·실행 순서를 바꾸므로, 출력만 추가한 것이 원래 동작을 그대로 보존한다고 보지 않는다.
