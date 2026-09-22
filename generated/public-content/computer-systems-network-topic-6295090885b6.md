---
layout: default
title: Mutex
nav_order: 3
permalink: /wiki/computer-systems-network-topic-6295090885b6/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-6295090885b6
projection_sha256: 34b88b40de5849290b8a1a15f8972259c79cbd68887e33855212ba0aa4ff11a8
parent: 동기화
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-cd8cd4ad9254
search_terms:
- 뮤텍스
- Mutex
- Lock
- holder
- lock_acquire
- lock_release
- lock_try_acquire
- Critical Section
grand_parent: OS
ancestor: CS 기초
---

# Mutex
{: .no_toc }

Mutex는 공유 상태에 접근하는 구간을 한 번에 한 Thread만 실행하도록 만든다. 이름은 Mutual Exclusion, 즉 상호 배제에서 왔다. 핵심은 보호할 상태와 획득·해제 범위를 함께 정하는 데 있다. 같은 값을 다루는 일부 코드만 Lock을 사용하면 보호 규칙이 성립하지 않는다.

## 획득한 Thread가 해제한다

Lock은 잠겼다는 상태뿐 아니라 누가 소유하는지도 다룬다. [Semaphore](/wiki/computer-systems-network-topic-fef68d934a03/)와 달리, Mutex에서는 원칙적으로 획득한 Thread가 해제한다. 다른 Thread에게 완료 사실을 알리는 용도라면 소유자 없는 통지 도구가 더 잘 맞는다.

PintOS의 Lock은 재귀적이지 않다. 이미 가진 Lock을 같은 Thread가 다시 획득하려 하면 `ASSERT`가 실패한다. 이 규칙을 모든 Lock 구현의 보편적인 성질로 일반화해서는 안 된다. 재귀적 Mutex를 제공하는 API도 있다.

획득과 해제 사이의 임계 구역에서는 보호 대상의 불변식을 유지해야 한다. 여러 Lock이 필요하다면 획득 순서를 정하고, 해제되지 않는 오류 경로가 없는지 살펴본다. 잘못된 순서는 [교착 상태](/wiki/computer-systems-network-topic-41c6d9a5eb18/)로 이어질 수 있다.

## PintOS의 holder와 Semaphore

기준 코드는 [lrn-pintos의 `synch.c`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)다. 현재 구조는 소유자 Pointer와 초기값 1인 Semaphore를 결합한다.

```c
struct lock {
    struct thread *holder;
    struct semaphore semaphore;
};
```

`lock_init()`은 `holder = NULL`로 설정하고 내부 Semaphore를 1로 초기화한다. 획득 과정에서 소유자가 있고 MLFQS가 아니라면 Donation 관계를 먼저 등록한다. `sema_down()`이 성공한 뒤에는 현재 Thread의 `waiting_lock`을 비우고 `holder`를 현재 Thread로 바꾼다.

따라서 Lock을 기다리는 Thread는 내부 Semaphore의 `waiters`에 `elem`으로 들어간다. Donation 관계를 위해 소유자의 `donation_list`에 들어갈 때는 별도 `donation_elem`을 쓴다. 같은 Thread가 두 관계에 참여하더라도 List 노드를 공유하지 않는다.

`lock_release()`는 해당 Lock 때문에 생긴 Donation을 제거하고 유효 우선순위를 다시 계산한다. 이어 `holder`를 비우고 내부 Semaphore를 `up`한다. MLFQS에서는 Donation 처리를 건너뛴다. 깨운 Thread에게 소유권을 곧바로 넘기는 코드는 없다. 대기자가 다시 실행되어 `sema_down()`을 마쳐야 새 `holder`가 된다.

`holder == NULL`만 보고 현재 Thread가 획득했다고 판단할 수도 없다. 상태를 읽는 것과 획득에 성공하는 것은 다른 연산이다. 코드 중간을 관찰할 때는 Semaphore의 값과 소유자 설정이 아직 모두 끝나지 않았을 수 있다는 점도 고려한다.

## 기다리지 않는 획득과 우선순위 기부

`lock_try_acquire()`는 내부 `sema_try_down()`이 성공했을 때만 `holder`를 설정한다. 실패하면 잠들거나 Donation 관계를 만들지 않고 `false`를 반환한다. 성공한 경우에는 나중에 해제할 책임이 생긴다.

일반 `lock_acquire()`도 언제나 Context Switch를 하지는 않는다. 사용 가능한 Lock이라면 내부 Semaphore의 값을 감소시키고 통과한다. 반대로 이미 다른 Thread가 소유했다면 기다릴 수 있으므로 외부 Interrupt Handler에서 사용할 수 없다. 현재 코드의 `lock_try_acquire()`에는 잠들지 않는 경로를 Interrupt 문맥에서 사용할 수 있다는 주석이 있지만, 이것을 Handler에서 일반 Mutex의 소유·해제 프로토콜을 구성해도 된다는 규칙으로 넓히면 안 된다. 필요한 통지는 문맥에 맞는 Semaphore 연산으로 설계한다.

우선순위가 높은 대기자는 낮은 소유자에게 우선순위를 빌려줄 수 있다. 현재 구현은 직접 소유자 1명과 추가 최대 7명을 따라가며, 해제할 때는 남은 Donation과 기본 우선순위로 복원한다. 여러 Lock과 중첩 기부의 상세 흐름은 [우선순위 기부](/wiki/computer-systems-network-topic-0eef2c64a382/)에서 다룬다.

현재 구현에는 Donation List의 등록·전파·제거 전체를 감싸는 별도의 Interrupt 비활성 구간이 없다. `sema_down()`과 `sema_up()` 내부의 보호가 그 바깥 코드까지 보호하지는 않는다. 또한 Donation으로 READY Thread의 우선순위 필드가 바뀌어도 Ready Queue를 그 자리에서 재정렬하지 않는다. 이는 소스에서 확인한 구현 경계이며, 특정 테스트의 실제 실패 결과로 제시하는 것은 아니다.

## 소유 관계를 디버깅하기

`lock_acquire`와 `lock_release`에 중단점을 두면 소유자와 대기자를 분리해 볼 수 있다. 아래 명령은 해당 함수에 멈췄고 `lock` 인자를 읽을 수 있을 때 사용한다.

```gdb
set $lk = lock
p $lk->holder
p $lk->semaphore.value
if $lk->holder != 0
  p $lk->holder->name
  p $lk->holder->priority
  p $lk->holder->base_priority
end
p $lk->semaphore.waiters
```

획득 전의 `holder`는 기존 소유자다. `sema_down()`이 끝나고 `holder`를 대입한 뒤에는 새 소유자를 확인한다. 해제에서는 Donation 제거 전후의 우선순위를 비교한다. `lock_release()`가 반환했을 때는 이미 다른 Thread가 획득했을 수 있으므로 `holder`가 반드시 NULL이라고 기대하지 않는다.

중단 위치는 `list lock_release`와 소스 줄 번호로 잡는다. `lock_release+80` 같은 고정 명령어 offset은 빌드에 따라 달라진다. 함수 반환 뒤에도 인자 Register가 원래 Pointer를 유지한다고 가정하지 않는다. 필요한 주소는 위처럼 GDB 편의 변수에 보관한다. 대기 Thread 목록은 Semaphore 문서의 `dump-sema`에 `&$lk->semaphore`를 넘겨 읽을 수 있다.

LP64에서 현재 선언의 예상 크기는 48바이트이며, `holder`는 offset 0, 내부 Semaphore는 8이다. 실제 빌드의 배치는 `ptype /o struct lock`으로 확인한다. QEMU가 Lock 의미를 판단하거나 Donation을 수행하는 것은 아니다. [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/)는 Guest 명령과 메모리 접근을 실행하고 GDB에 관찰 경로를 제공한다.

## Linux와 Windows에서 같은 이름을 읽을 때

[Linux v6.12 Kernel Mutex](https://docs.kernel.org/6.12/locking/mutex-design.html)는 경쟁이 없는 원자적 획득, 설정과 실행 상태에 따른 Optimistic Spinning, 잠드는 대기 경로를 구분한다. 이미 Kernel 안에서 동작하는 도구이므로 이 차이를 사용자 공간의 System Call 유무로 설명하면 맞지 않는다. 소유자만 해제할 수 있고 재귀적 획득은 허용하지 않으며, 사용 중인 객체의 수명도 호출자가 보장해야 한다.

사용자 공간의 POSIX Mutex와 Kernel의 `struct mutex`는 같은 구조체가 아니다. Futex를 이용하는 라이브러리 구현이나 Priority Inheritance용 경로를 일반 Kernel Mutex와 섞어 설명하지 않는다.

[Windows Critical Section](https://learn.microsoft.com/en-us/windows/win32/sync/critical-section-objects)은 한 Process 안에서 사용하고 재귀적 진입을 허용한다. 같은 Thread가 여러 번 들어갔다면 같은 횟수만큼 나와야 한다. 대기자의 FIFO 획득 순서는 보장하지 않는다. 이런 차이 때문에 Mutex라는 이름만으로 재귀 여부·공유 범위·공정성·Timeout 지원을 추정하면 안 된다.
