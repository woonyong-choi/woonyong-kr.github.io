---
layout: default
title: 교착 상태
nav_order: 5
permalink: /wiki/computer-systems-network-topic-41c6d9a5eb18/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-41c6d9a5eb18
projection_sha256: b4cd02bbb73a616ae7be1e2bc1020a3c096a6b7aec1c8a0e84795b343343a1bf
parent: OS
content_status: ready
public_parent_id: Wiki/computer-systems-network/os
search_terms:
- Deadlock
- Coffman
- Circular Wait
- Hold and Wait
- Lock Order
- Lockdep
- Banker Algorithm
- Priority Inversion
- Livelock
- Starvation
grand_parent: Systems
ancestor: CS 기초
---

# 교착 상태
{: .no_toc }

Thread A가 Lock 1을 가진 채 Lock 2를 기다리고, Thread B가 Lock 2를 가진 채 Lock 1을 기다리면 둘 다 앞으로 나아갈 수 없다. 각자가 놓아야 할 자원을 상대방이 기다리는 교착 상태(Deadlock)다. CPU 시간을 더 주거나 우선순위를 높여도 이 대기 관계는 풀리지 않는다.

## 대기의 이유를 구분한다

잠시 I/O를 기다리는 Thread도 멈춰 보이지만, 완료 사건이 도착하면 다시 실행될 수 있다. Starvation은 실행 기회가 계속 다른 작업으로 넘어가는 문제다. Livelock에서는 서로 반응하고 재시도하면서 상태가 바뀌어도 작업이 진행되지 않는다. 교착을 판단할 때는 단순한 지연보다 **진행에 필요한 사건을 누가 만들 수 있는지**를 추적한다.

여러 Lock이 있어야만 교착이 생기는 것은 아니다. non-recursive Mutex 하나를 가진 Thread가 같은 Mutex를 다시 기다리는 자기 대기도 가능하다. PintOS의 현재 `lock_acquire()`는 소유자가 자기 자신인지 ASSERT로 검사하므로 이 특정 오용은 일반 대기 전에 잡는다. 서로 다른 Thread의 여러 Lock이 만드는 순환까지 탐지하는 것은 아니다. [PintOS Lock 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/synch.c)

## Coffman의 네 조건

재사용 가능한 자원을 점유하고 기다리는 모델에서 교착이 발생하려면 다음 조건들이 함께 성립해야 한다. [Coffman 등의 System Deadlocks, 1971](https://uobdv.github.io/Design-Verification/Supplementary/System_Deadlocks-Four_necessary_and_sufficient_conditions_for_deadlock.pdf)

| 조건 | Lock 대기에 적용하면 |
|---|---|
| 상호 배제(Mutual Exclusion) | 한 Lock을 동시에 여러 소유자가 가질 수 없다. |
| 점유 대기(Hold and Wait) | 이미 가진 Lock을 놓지 않고 다른 Lock을 기다린다. |
| 비선점(No Preemption) | 소유자의 Lock을 임의로 빼앗지 못한다. |
| 순환 대기(Circular Wait) | A가 B를, B가 다시 A를 기다리는 고리가 생긴다. |

필요조건 목록을 “이 기능들이 있는 시스템은 항상 교착 상태다”라는 충분조건으로 읽으면 안 된다. 특히 같은 종류의 자원에 여러 Instance가 있으면 Resource Allocation Graph의 순환만으로 교착을 확정할 수 없다. Lock처럼 자원마다 소유자 한 명이 정해지는 대기 모델과 구분해야 한다. 여기서 비선점은 **자원 소유권**에 관한 조건이다. CPU 선점을 허용하는 OS에서도 Lock의 비선점 조건은 성립할 수 있다.

## 순환을 만들고 끊어 보기

두 Thread가 반대 순서로 Lock을 요청한다고 하자. A가 Lock 1, B가 Lock 2를 먼저 얻은 뒤 각각 두 번째 Lock을 요청하면 순환한다. 같은 코드라도 A가 두 Lock을 모두 사용하고 놓은 뒤 B가 시작했다면 그 실행에서는 순환이 생기지 않는다. Lock 획득 순서와 실제 교차 실행 순서를 함께 봐야 한다.

다음 예제는 Lock 소유자와 대기자를 Dictionary로 표현하고 순환 경로를 찾는다. 실제 Lock을 잠가 실행을 멈추는 프로그램이 아니다. Thread마다 한 Lock을 기다리고 Lock마다 소유자가 한 명이라는 모델이다.

```run-python
def find_cycle(waiting, owners):
    # 각 Thread는 한 Lock을 기다리고, 각 Lock에는 holder 한 명이 있다.
    for start in waiting:
        path = []
        position = {}
        thread = start
        while thread in waiting:
            if thread in position:
                return path[position[thread]:] + [thread]
            position[thread] = len(path)
            path.append(thread)
            thread = owners.get(waiting[thread])
            if thread is None:
                break
    return []

owners = {"A": "T1", "B": "T2"}
waiting = {"T1": "B", "T2": "A"}
print("opposite order:", " -> ".join(find_cycle(waiting, owners)))
priorities = {"T1": 10, "T2": 50}
priorities["T1"] = priorities["T2"]
print("after donation:", " -> ".join(find_cycle(waiting, owners)))
assert find_cycle(waiting, owners) == ["T1", "T2", "T1"]

# T2도 A부터 요청하면 B를 먼저 점유하지 않는다.
owners = {"A": "T1"}
waiting = {"T2": "A"}
print("same order:", find_cycle(waiting, owners))
assert find_cycle(waiting, owners) == []

# non-recursive Lock 하나를 같은 Thread가 다시 기다리는 경우도 표현된다.
owners = {"A": "T1"}
waiting = {"T1": "A"}
print("self wait:", " -> ".join(find_cycle(waiting, owners)))
assert find_cycle(waiting, owners) == ["T1", "T1"]
```

실행 결과:

```text
opposite order: T1 -> T2 -> T1
after donation: T1 -> T2 -> T1
same order: []
self wait: T1 -> T1
```

우선순위만 바꾸어도 `T1 → T2 → T1`은 남는다. T2도 A부터 요청하게 하면 B를 먼저 가진 채 기다리는 관계가 사라진다. 마지막의 자기 대기 예시는 non-recursive Lock의 일반적인 위험을 표현한 것이며, PintOS ASSERT가 성공적으로 통과한 실행을 뜻하지 않는다.

## 획득 순서를 설계에 넣는다

여러 Lock에 일관된 순서를 정하고 모든 호출 경로가 이를 따르면 순환 대기를 제거할 수 있다. 예를 들어 항상 `lock_a` 다음 `lock_b`를 획득하게 한다.

```c
/* 관련된 모든 경로가 같은 순서를 지킨다는 전제의 발췌다. */
lock_acquire (&lock_a);
lock_acquire (&lock_b);
/* 두 Lock으로 보호되는 상태를 갱신한다. */
lock_release (&lock_b);
lock_release (&lock_a);
```

한 함수의 순서만 맞추면 끝나는 것은 아니다. Helper가 안에서 다른 Lock을 잡는 경우, Callback이 상위 기능으로 다시 들어오는 경우, 오류 처리와 취소 경로도 포함한다. 정렬 기준을 객체 ID나 자원 종류로 정했다면 모든 사용자가 같은 기준을 적용해야 한다. 해제 순서를 반대로 하는 습관만으로 획득 순서의 순환이 사라지지는 않는다.

다른 예방 방법은 필요한 자원을 함께 확보하거나, 일부 획득에 실패하면 이미 확보한 자원을 반환하고 재시도하는 것이다. 이 경우 중간에 실패하면 수행한 변경을 되돌릴 수 있어야 한다. 재시도 간격과 경쟁 규칙이 없으면 서로 양보만 하는 Livelock이나 Starvation이 생길 수 있다.

## 예방·회피·탐지와 복구

예방은 필요조건이 성립하지 않도록 획득 규칙을 정한다. 회피는 요청을 허용한 뒤에도 모든 작업이 완료될 수 있는 안전 순서가 남는지 검사한다. Banker's Algorithm은 작업의 최대 자원 요구량 같은 정보를 미리 알아야 한다. 안전하지 않은 상태와 이미 교착한 상태는 같지 않으며, 회피는 잠재적인 위험 상태에 들어가지 않는 접근이다.

탐지는 실제 대기 관계에서 교착을 찾고, 복구는 작업 중단·Rollback·재시도 같은 방법으로 고리를 끊는다. 일반 Thread를 강제로 종료한다고 공유 상태가 자동으로 일관되게 복원되지는 않는다. Timeout도 교착의 증거 자체가 아니며, 시간 초과 후 소유 자원과 부분 변경을 정리하는 규칙이 있어야 한다.

PostgreSQL은 교착을 감지하면 관련 Transaction 중 하나를 중단해 다른 Transaction이 진행하게 한다. 중단될 Transaction을 임의로 예상해서는 안 된다. 애플리케이션은 전체 Transaction을 다시 실행할 수 있도록 설계하고, 여러 행이나 객체를 일관된 순서로 갱신해 위험을 줄인다. 명시적인 `LOCK` 문이 없어도 행 잠금에서 교착이 생길 수 있다. [PostgreSQL의 교착 처리](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-DEADLOCKS)

Linux와 Windows가 교착을 모두 무시하고 재부팅으로만 처리한다는 설명은 지나치게 넓다. Linux의 Lockdep은 관찰한 Lock 의존성과 실행 문맥을 바탕으로 잘못된 잠금 순서를 진단한다. 모든 애플리케이션 교착을 자동으로 해소하는 기능은 아니지만, 커널에 교착 검증 수단이 없다는 주장과도 다르다. 대응은 OS 전체의 단일 선택보다 자원·계층별 정책으로 살펴본다. [Linux Lockdep](https://docs.kernel.org/6.12/locking/lockdep-design.html)

## 우선순위 기부로 해결되지 않는 대기

PintOS의 Priority Donation은 Lock 소유자를 더 높은 우선순위로 실행시키는 정책이다. A와 B가 서로의 Lock을 기다리고 있으면 두 우선순위가 같아져도 실행 가능해지지 않는다. 현재 기부 루프의 직접 1회·추가 최대 7회 제한은 포인터 탐색을 끝내는 조건이며, 소유권을 회수하거나 순환을 끊지 않는다.

따라서 기부가 필요한 우선순위 역전과 순환 대기를 별도로 조사한다. 한쪽이 실행되어 Lock을 놓을 수 있는데 스케줄링에서 밀리는지, 양쪽 모두 상대의 해제를 기다리는지부터 구분한다. 기부의 전파와 철회는 [우선순위 기부](/wiki/computer-systems-network-topic-0eef2c64a382/)에 이어진다.
