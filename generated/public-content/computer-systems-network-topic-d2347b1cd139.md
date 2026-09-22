---
layout: default
title: 원자적 연산
nav_order: 6
permalink: /wiki/computer-systems-network-topic-d2347b1cd139/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-d2347b1cd139
projection_sha256: e77e11de285b0ec62d81b06f19990123a09dace7ef63b8f5d127cc5a16a0c264
parent: 동기화
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-cd8cd4ad9254
search_terms:
- Atomic
- Atomic Operation
- RMW
- CAS
- Compare-And-Exchange
- stdatomic.h
- atomic_fetch_add
- intr_disable
- LOCK
- Memory Ordering
grand_parent: OS
ancestor: CS 기초
---

# 원자적 연산
{: .no_toc }

두 Thread가 같은 Counter를 한 번씩 증가시켰는데 값은 1만 늘어날 수 있다. 값을 읽는 동작과 새 값을 저장하는 동작이 각각 안전해도, 읽은 값을 바탕으로 증가시키는 전체 과정이 하나로 이어지지 않으면 이런 일이 생긴다.

## 읽기와 쓰기를 각각 보호해도 증가가 사라질 수 있다

Counter가 0일 때 A와 B가 모두 0을 읽었다고 하자. A가 1을 저장하고 B도 자신이 계산한 1을 저장하면, 두 번 증가시키려던 결과가 1이 된다. 이 순서와 실행 모델은 [Race Condition](/wiki/programming-languages-runtime-topic-4900a7670f08/)에서 확인할 수 있다.

`count++`를 읽기·계산·쓰기의 세 단계로 나누면 이 문제를 설명하기 쉽다. 다만 모든 Compiler가 반드시 세 개의 기계 명령을 만든다는 뜻은 아니다. 명령어 하나로 번역되더라도 다른 CPU와의 접근까지 원자적으로 처리하는지는 별도로 확인해야 한다.

일반 C 변수에 여러 Thread가 동기화 없이 접근하고 하나 이상이 값을 변경하면 Data Race가 될 수 있다. 이 경우 C의 동작은 정의되지 않으므로, 실제 프로그램의 결과를 단순히 “1 또는 2”로 한정해서는 안 된다. 위 순서는 값이 덮어써지는 원리를 설명하는 모델이다. [C11 초안 N1570, 5.1.2.4](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf#page=38)

값을 읽고 변경한 뒤 저장하는 연산을 Read-Modify-Write, 줄여서 RMW라고 한다. Atomic 증가 연산은 이 과정을 하나로 다룬다. 반면 Atomic Load 뒤에 Atomic Store를 따로 호출하면 두 연산 사이에 다른 변경이 들어갈 수 있다.

## 증가와 조건부 변경을 실행해 본다

다음 예제는 C11의 Atomic API로 반환값과 상태 변화를 확인한다. `fetch_add`는 증가하기 전 값을 반환하고, Compare-And-Exchange는 현재 값이 예상한 값과 같을 때만 새 값을 저장한다. 비교에 실패하면 `expected`에 관찰한 현재 값을 넣는다. [N1570, 7.17.7.4–5](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf#page=301)

```run-c
#include <assert.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdio.h>

int main(void) {
    atomic_int count = ATOMIC_VAR_INIT(0);
    int a = atomic_fetch_add_explicit(&count, 1, memory_order_relaxed);
    int b = atomic_fetch_add_explicit(&count, 1, memory_order_relaxed);
    printf("before A=%d, before B=%d, count=%d\n", a, b, atomic_load(&count));
    assert(a == 0 && b == 1 && atomic_load(&count) == 2);

    int expected = 1;
    bool changed = atomic_compare_exchange_strong(&count, &expected, 9);
    printf("CAS 1->9: changed=%d, observed=%d, count=%d\n",
           changed, expected, atomic_load(&count));
    assert(!changed && expected == 2 && atomic_load(&count) == 2);

    changed = atomic_compare_exchange_strong(&count, &expected, 9);
    printf("CAS 2->9: changed=%d, count=%d\n", changed, atomic_load(&count));
    assert(changed && atomic_load(&count) == 9);
    return 0;
}
```

실행 결과:

```text
before A=0, before B=1, count=2
CAS 1->9: changed=0, observed=2, count=2
CAS 2->9: changed=1, count=9
```

예제는 한 Thread에서 호출 순서를 고정했다. 여러 CPU의 경쟁을 재현하거나 처리 속도를 측정하는 실험은 아니다. 마지막 호출도 다른 Thread가 그사이에 값을 바꾸는 프로그램에서는 실패할 수 있다. Compare-And-Swap을 반복문에서 쓰는 이유가 여기에 있다. `weak` 버전에는 값이 같아도 실패할 수 있는 경우가 더 있으므로 재시도 조건을 함께 설계해야 한다.

## PintOS에서 인터럽트를 끄는 구간

현재 학습용 PintOS의 `intr_disable()`은 다음과 같이 IF를 끄고 이전 상태를 반환한다. 커널 구현을 읽기 위한 코드이며 일반 User Process에서 실행하는 예제가 아니다. [PintOS `9d1b14c`의 Interrupt 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c)

```c
enum intr_level
intr_disable (void) {
    enum intr_level old_level = intr_get_level ();
    asm volatile ("cli" : : : "memory");
    return old_level;
}
```

IF를 끄면 현재 CPU가 Maskable Hardware Interrupt를 받아 처리하는 것을 막는다. 모든 예외와 NMI를 없애거나 다른 CPU를 멈추는 동작은 아니다. 이전 상태를 돌려주는 이유는 작업 뒤 무조건 인터럽트를 켜는 대신 `intr_set_level(old_level)`로 원래 상태를 복원하기 위해서다. IF와 IRQ 진입의 구분은 [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/)에서 이어진다.

이 PintOS의 단일 CPU 실행에서는 Timer IRQ가 공유 목록과 상태 변경 사이에 끼어들지 않도록 보호할 수 있다. 그러나 인터럽트가 꺼져 있어도 코드가 직접 `thread_block()`이나 `schedule()`을 호출하면 실행 대상은 바뀔 수 있다.

`sema_down()`이 그 예다. 값이 0이면 자신을 `waiters`에 넣고 `thread_block()`으로 기다린다. 나중에 다시 실행되면 `while` 조건을 재검사하고, 값이 양수일 때 감소시킨다. 따라서 함수의 시작부터 반환까지 CPU를 독점하는 것이 아니라, 대기 등록과 상태 확인·변경에 필요한 순서를 지키는 구조다. 대기자가 다시 실행되기 전에 다른 Thread가 값을 가져가는 경우는 [Semaphore](/wiki/computer-systems-network-topic-fef68d934a03/)의 실행 예제에서 확인할 수 있다. [PintOS Semaphore 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c), [Block과 Scheduler](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

## 다른 CPU의 접근까지 다룰 때

CPU가 여러 개라면 현재 CPU의 인터럽트를 꺼도 다른 CPU는 같은 공유 메모리에 접근할 수 있다. x86의 `LOCK` Prefix가 붙은 메모리 RMW 명령은 이런 동시 접근에 대해 원자성을 제공하는 수단이다. `lock add`는 증가를, `lock cmpxchg`는 비교와 조건부 변경을 처리한다.

이를 항상 “메모리 버스 전체를 잠근다”라고 설명하면 실제 동작을 잘못 이해하기 쉽다. 내부 Cache에 놓인 메모리는 Cache Coherence를 이용해 처리할 수 있다. Cache Line 경계를 가로지르는 Split Lock이나 메모리 종류에 따라 Bus Lock이 필요한 경우를 따로 구분한다. [Intel의 Cache Locking 설명](https://www.intel.com/content/www/us/en/support/articles/000099741/processors/intel-xeon-processors.html), [Linux의 Bus Lock 설명](https://kernel.org/doc/html/v5.14/x86/buslock.html)

Linux의 Atomic API는 아키텍처별 구현을 감싼다. 모든 Linux CPU가 x86 명령을 쓴다는 뜻은 아니며, 일반 메모리를 위한 `atomic_t`를 MMIO 장치 Register에 그대로 적용해서도 안 된다. [Linux v6.12 Atomic API](https://github.com/torvalds/linux/blob/v6.12/Documentation/atomic_t.txt)

Linux v6.12의 Semaphore는 내부 Counter와 대기 목록을 `raw_spin_lock_irqsave()`로 보호한다. 이 Lock은 다른 CPU와의 경쟁을 다루고, IRQ 저장·복원은 같은 CPU의 인터럽트 문맥과의 경쟁도 함께 다루기 위한 것이다. 오래 기다리는 경로에서는 Spinlock을 놓고 Sleep한 뒤 다시 잡는다. Semaphore를 기다리는 동안 계속 Spinlock을 들고 도는 구조로 이해하면 안 된다. [Linux v6.12 Semaphore](https://github.com/torvalds/linux/blob/v6.12/kernel/locking/semaphore.c)

| 보호할 대상 | 먼저 볼 수단 | 확인할 조건 |
|---|---|---|
| 단일 CPU PintOS의 공유 상태 변경 | 인터럽트 상태 저장·복원 | 중간의 Block·Yield와 명시적 스케줄링 경로 |
| 여러 CPU가 갱신하는 값 하나 | Atomic RMW | 사용하는 API와 Memory Ordering |
| 여러 값과 목록이 함께 지켜야 하는 조건 | 같은 Lock으로 임계 영역 보호 | 모든 접근 경로가 같은 규칙을 따르는지 |
| 자원이 생길 때까지의 대기 | Semaphore나 Condition Variable | 대기 등록·깨우기·조건 재검사의 순서 |

## 값 하나의 원자성과 임계 영역을 구분한다

Atomic 연산 두 개가 자동으로 하나의 Transaction이 되는 것은 아니다. 잔액을 확인한 뒤 차감하거나, 목록에 넣으면서 별도 Counter를 바꾸는 작업은 두 값 사이의 조건도 지켜야 한다. Atomic 변수로 바꿨다는 사실만으로 이런 임계 영역의 보호가 끝나지는 않는다. [동기화](/wiki/computer-systems-network-topic-cd8cd4ad9254/)에서 Lock과 대기 도구를 함께 살펴볼 수 있다.

원자성과 다른 메모리 접근의 순서도 별개다. Linux의 반환값 없는 `atomic_inc()`에는 다른 주소의 접근에 대한 순서 보장이 붙지 않는다. API의 Acquire·Release 규칙까지 읽어야 공유 데이터가 언제 보이는지 판단할 수 있다. [Linux v6.12의 Ordering 규칙](https://github.com/torvalds/linux/blob/v6.12/Documentation/atomic_t.txt#L149-L172)

마지막으로 Atomic이라는 이름이 곧 Lock-Free 구현을 뜻하지는 않는다. C에서는 타입과 구현의 지원 여부를 구분하며 `atomic_is_lock_free()`로 객체에 대한 조건을 확인할 수 있다. 실제 Lock-Free 여부나 성능은 사용하는 빌드와 환경에서 확인한다. [N1570, 7.17.5](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf#page=297)
