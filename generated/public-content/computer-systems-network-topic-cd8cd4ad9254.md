---
layout: default
title: 동기화
nav_order: 4
permalink: /wiki/computer-systems-network-topic-cd8cd4ad9254/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-cd8cd4ad9254
projection_sha256: c4f4a829bb4742f7597190a6f2aab0d20ac7cb33a89ed65b2e14fdcb78d48a2c
parent: OS
content_status: ready
public_parent_id: Wiki/computer-systems-network/os
search_terms:
- Synchronization
- 동기화
- Semaphore
- Mutex
- Condition Variable
- Wait Queue
- Blocking
- Busy Waiting
grand_parent: Systems
ancestor: CS 기초
---

# 동기화
{: .no_toc }

동기화는 여러 실행 흐름이 공유 상태를 읽고 바꾸는 순서를 조정하는 일이다. 같은 값을 건드리지 못하게 막는 것과, 어떤 일이 끝날 때까지 기다리는 것은 서로 다른 문제다. 먼저 지켜야 할 상태와 진행할 조건을 정하면 필요한 도구를 고르기 쉬워진다.

## 공유 상태와 기다릴 조건

Queue를 함께 사용하는 생산자와 소비자에게는 두 가지 규칙이 필요하다. Queue의 연결 구조를 동시에 바꾸지 않아야 하고, 비어 있을 때는 소비자가 기다려야 한다. Lock만 사용하면 구조는 보호할 수 있지만 빈 Queue를 기다리는 방법이 남는다. 반대로 통지만 보내고 Queue의 수정 규칙을 정하지 않으면 공유 상태가 손상될 수 있다.

| 도구 | 중심이 되는 상태 | Queue에서 맡는 역할 |
|---|---|---|
| [Mutex](/wiki/computer-systems-network-topic-6295090885b6/) | 누가 보호 구간을 소유하는가 | Queue를 읽고 바꾸는 구간을 보호한다 |
| [Semaphore](/wiki/computer-systems-network-topic-fef68d934a03/) | 사용할 수 있는 횟수가 얼마인가 | 자원 수를 제한하거나 완료 통지를 보관한다 |
| [조건 변수](/wiki/computer-systems-network-topic-eb54fbfc1efb/) | 어떤 상태 변화를 기다리는 호출이 있는가 | Lock을 풀고 기다린 뒤 다시 얻어 조건을 검사한다 |

조건 변수는 Queue가 비었는지를 대신 저장하지 않는다. 실제 조건은 Lock으로 보호된 공유 상태에 있다. 깨어난 소비자도 Lock을 다시 얻은 뒤 조건을 확인해야 한다. 조건 확인과 갱신이 분리되었을 때 생기는 문제는 [경쟁 상태](/wiki/programming-languages-runtime-topic-4900a7670f08/)에서 실행 순서를 바꿔 살펴볼 수 있다.

## 잠들 수 있는 문맥인가

Busy Waiting은 실행 중 반복 검사하며 CPU를 사용한다. Blocking은 현재 Thread를 실행 후보에서 빼고 Scheduler에 제어를 넘긴다. 기다리는 시간이 짧은지뿐 아니라 소유자가 다른 CPU에서 실행 중인지, 현재 문맥에서 잠들 수 있는지까지 고려해야 한다.

PintOS의 외부 Interrupt Handler에서는 `sema_down()`이나 일반 Lock 획득처럼 잠들 수 있는 함수를 사용할 수 없다. 현재 Thread를 임의의 기다림으로 묶는 대신, 문맥에 맞는 통지와 반환 뒤의 실행을 연결한다. Interrupt를 끄는 것은 잠들어도 된다는 허가가 아니며 SMP 전체의 배제를 뜻하지도 않는다.

Linux의 Kernel Mutex, Spinlock, Wait Queue, Completion, 사용자 공간의 POSIX Mutex와 Futex는 각각 문맥과 계약이 다르다. `wait_event()`를 POSIX 조건 변수의 같은 구현이라고 보거나, 모든 Wait Queue가 FIFO라고 가정하지 않는다. Windows의 Mutex, Critical Section, Condition Variable, Event도 소유권·통지 저장·공유 범위를 따로 확인해야 한다.

## PintOS 코드와 메모리를 연결하기

PintOS는 `threads/synch.c`에서 Semaphore, Lock, 조건 변수를 작은 구조체로 드러낸다. Semaphore에서 기다리는 Thread는 `thread.elem`으로 List에 연결되고, 조건 변수는 Stack의 `semaphore_elem`을 거쳐 Private Semaphore의 Thread List에 연결된다. 두 List의 원소 타입을 혼동하면 주소를 잘못 해석하게 된다.

깨우기는 실행 후보로 돌려놓는 단계이고, 실제 실행과 자원 획득은 이후에 일어난다. [Thread](/wiki/computer-systems-network-topic-aebc87b0fcf5/)의 상태 변경과 [우선순위 스케줄링](/wiki/computer-systems-network-topic-6276ce481024/)을 함께 보면 이 사이의 순서를 추적할 수 있다. Lock 대기자의 우선순위를 소유자에게 전하는 [우선순위 기부](/wiki/computer-systems-network-topic-0eef2c64a382/)도 소유권을 넘기는 연산과는 다르다.

[QEMU](/wiki/computer-systems-network-qemu-b1366076be02/)는 이런 동기화 의미를 대신 구현하지 않는다. Guest 명령이 자료구조의 바이트를 바꾸고, Debugger가 그 메모리와 Register를 읽을 수 있도록 실행 환경을 제공한다. 대기 List와 소유자·값을 해석하는 기준은 Guest Kernel 코드다.

실제 코드의 자료구조 크기나 함수 offset은 Debug Build에서 확인한다. 근거 없는 고정 주소, 측정하지 않은 실행 시간, QEMU 실행과 Hardware 실행을 같은 것으로 취급한 수치로 동작을 설명하지 않는다. 각 하위 문서에서 구현 버전, 관찰 지점, 실행 가능한 모델의 범위를 함께 확인할 수 있다.
