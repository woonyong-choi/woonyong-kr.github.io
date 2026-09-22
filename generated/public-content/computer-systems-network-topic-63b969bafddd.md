---
layout: default
title: 프로세스와 스레드
nav_order: 2
permalink: /wiki/computer-systems-network-topic-63b969bafddd/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-63b969bafddd
projection_sha256: 2f9fade3187814ebe5bebea30e7be3abf6474ea95ee9a4ae6f5fcd252c2bfcf5
parent: OS
content_status: ready
public_parent_id: Wiki/computer-systems-network/os
grand_parent: Systems
ancestor: CS 기초
---

# 프로세스와 스레드
{: .no_toc }

한 프로그램에서 두 작업이 같은 버퍼를 사용하더라도, 각 작업이 다음에 실행할 명령과 돌아갈 함수 위치까지 같아지는 것은 아니다. **프로세스는 주소 공간과 자원을 묶고, 스레드는 그 안에서 이어서 실행할 상태를 가진다.** 버퍼를 공유하는 문제와 실행 흐름을 바꾸는 문제를 나누면 두 개념의 차이가 드러난다.

커널은 주소 변환·입출력·보호·스케줄링 같은 OS의 핵심 기능을 수행한다. 스케줄러는 실행 가능한 흐름 가운데 다음에 CPU를 사용할 대상을 고르는 커널 기능이다. OS에는 이런 커널 기능을 이용하는 셸과 시스템 유틸리티도 포함된다. 한 논리 CPU에서는 실행 대상을 시간에 따라 바꿀 수 있고, 여러 논리 CPU에서는 서로 다른 흐름이 동시에 실행될 수 있다. 이 구분을 Linux의 자원 공유와 PintOS의 실제 전환 코드로 이어서 살펴본다.

시분할은 실행 가능한 흐름에 CPU 시간을 나누어 대화형 작업에도 응답 기회를 만드는 방식이다. I/O를 기다리는 작업을 Block시키고 다른 작업을 실행하는 다중프로그래밍은 배치 처리에서도 가능하다. 따라서 배치 처리라면 언제나 한 작업만 진행하고 I/O 대기 중 CPU도 논다고 설명하지 않는다. 시분할의 동시성은 여러 CPU에서 실제로 함께 실행하는 병렬성과도 구분한다.

선점형 스케줄링은 실행 중인 프로그램의 자발적인 양보에만 의존하지 않는다. Timer IRQ가 판단 기회를 주고, 더 높은 우선순위의 작업이 준비되는 사건도 재선택의 계기가 된다. 실행 조각을 짧게 하면 응답 기회가 늘 수 있지만 전환과 Cache 영향도 커질 수 있다. 실제 응답 시간과 처리량은 작업 부하와 정책으로 확인하며, PintOS의 4 tick은 모든 작업이 공평하게 40ms씩 받는다는 약속이 아니다. [타이머에서 양보까지](/wiki/computer-systems-network-topic-c19e34701c6c/#irq0을-처리한-뒤-cpu를-양보하기까지), [다음 후보를 고르는 정책](/wiki/computer-systems-network-topic-6276ce481024/#ready-queue에서-무엇을-먼저-고르는가)에서 각각의 역할을 읽는다.

## 주소 공간과 실행 상태를 나누어 보기

OS는 메모리에는 가상 주소, 저장 장치에는 파일·경로·offset, CPU에는 프로세스 자원과 Thread의 실행 상태라는 인터페이스를 둔다. 하드웨어의 배치를 감추는 추상화와 다른 프로그램의 접근을 막는 보호는 함께 필요하다. 추상화만 있다고 격리가 자동으로 생기지는 않는다. 주소 변환과 접근 검사는 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/), 권한 경계는 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에서 이어진다.

여기서 MMU·Timer·TSS·DMA를 모든 추상화의 필수 부품으로 나열하지는 않는다. MMU가 제공하는 주소 변환·보호와 소프트웨어가 주소를 해석하는 방식은 구현 경계가 다르고, 파일 인터페이스가 DMA를 반드시 요구하는 것도 아니다. TSS는 x86의 특정 커널 진입에 관여하는 구조이며 모든 OS의 스케줄러 자체를 뜻하지 않는다. PintOS의 자료구조와 정책을 실행하는 Guest와 CPU·장치를 제공하는 [QEMU system emulation](/wiki/computer-systems-network-qemu-b1366076be02/#먼저-실행-모드를-구분한다)을 구별하면 이 경계를 확인할 수 있다.

x86-64에서 실행을 이해할 때 다음 레지스터가 출발점이 된다. CPU는 커널의 `struct thread`를 직접 해석해서 스케줄링하지 않는다. 커널이 메모리에 보관한 상태를 레지스터에 반영하면 CPU가 그 상태에 따라 실행한다.

| 확인할 상태 | 레지스터 | 읽어야 할 의미 |
|---|---|---|
| 다음 명령어 위치 | `RIP` | 어느 코드에서 실행을 이어갈 것인가 |
| 현재 스택 위치 | `RSP` | 어느 호출 스택을 사용하고 있는가 |
| 주소 변환의 기준 | `CR3` | 현재 페이지 테이블의 루트와 관련 제어 정보 |
| 현재 권한 수준 | `CS`의 CPL | 현재 실행이 어떤 특권 수준에 있는가 |

같은 프로세스의 두 스레드는 주소 공간을 공유하면서도 각자의 명령어 위치·레지스터·호출 스택을 가진다. 따라서 스레드 전환이 반드시 서로 다른 주소 공간으로의 전환을 뜻하지는 않는다. 반대로 서로 다른 주소 공간을 사용하려면 실행 상태뿐 아니라 주소 변환의 기준도 준비해야 한다. 가상 주소가 코드·데이터·스택과 연결되는 과정은 [주소 공간](/wiki/computer-systems-network-topic-3521ee6344f1/)에서 이어진다.

타이머 인터럽트는 커널이 실행 흐름을 다시 선택할 기회를 제공한다. 그러나 인터럽트가 한 번 발생할 때마다 반드시 다른 스레드가 선택되는 것은 아니다. 준비된 스레드와 정책에 따라 같은 흐름을 계속 실행할 수도 있다.

## Linux에서는 무엇을 공유하는가

프로세스를 관리하기 위해 커널이 보관하는 정보를 교과서에서는 **PCB(Process Control Block)**라고 부른다. 실제 커널에서는 식별자, 저장한 레지스터, 주소 공간과 열린 파일 정보를 여러 구조체에 나누어 연결할 수 있다.

Linux는 스케줄링 대상인 각 task를 `task_struct`로 표현한다. 같은 프로세스에 속한 사용자 스레드들도 각각의 `task_struct`를 가질 수 있다. Linux v6.16의 이 구조체에는 `mm_struct *mm`이 있으며, 주소 공간을 함께 사용하는 task들은 같은 `mm_struct`를 참조할 수 있다. `copy_mm()`은 `CLONE_VM`이면 기존 `mm`의 참조를 얻고, 그렇지 않으면 `dup_mm()` 경로로 별도의 주소 공간 정보를 만든다. 그러므로 “프로세스마다 `task_struct`가 딱 하나 있다”는 설명은 맞지 않는다. [Linux v6.16 task 정의](https://github.com/torvalds/linux/blob/v6.16/include/linux/sched.h#L812), [주소 공간의 공유·복제 분기](https://github.com/torvalds/linux/blob/v6.16/kernel/fork.c#L1502)

`mm_struct`에는 주소 공간의 영역 정보와 페이지 테이블에 접근하는 기준이 함께 들어 있다. Linux v6.16의 `pgd`는 페이지 테이블 계층의 최상위 PGD를 가리키고, `mm_mt`는 이 주소 공간의 VMA를 관리하는 Maple Tree다. 각 `vm_area_struct`는 `[vm_start, vm_end)` 범위와 접근 권한·파일 매핑 같은 속성을 설명한다. VMA는 영역의 의미를 기록하고 페이지 테이블은 실제 주소 변환 상태를 담는다. 따라서 VMA가 있어도 그 안의 모든 페이지에 물리 프레임이 준비된 것은 아니다. [Linux v6.16의 주소 공간 관리](https://docs.kernel.org/6.16/mm/process_addrs.html), [페이지 테이블 계층](https://docs.kernel.org/6.16/mm/page_tables.html)

같은 사용자 주소 공간을 사용하는 스레드 T1과 T2는 주소 변환의 계층도 공유한다. 매핑된 전역 변수의 같은 가상 주소는 두 스레드에서 같은 물리 프레임으로 이어진다. 여기서 페이지 테이블을 공유한다는 말은 여러 단계의 테이블을 함께 사용한다는 뜻이며, 전체 테이블이 물리 페이지 한 장이라는 뜻은 아니다. 각 스레드의 스택은 이 주소 공간 안에서 서로 다른 범위를 사용한다. 사용자·커널 진입에 따른 페이지 테이블 분리 같은 구현 차이도 있으므로, 공유 여부를 설명할 때는 `CR3`의 숫자 하나보다 어떤 주소 공간과 매핑을 함께 쓰는지에 주목한다.

`clone()`은 자원별로 공유 여부를 지정한다.

| 조건 | 공유하는 것 | 함께 구분할 것 |
|---|---|---|
| `CLONE_VM` | 주소 공간 | 파일 테이블까지 공유시키는 조건은 아니다 |
| `CLONE_FILES` | 파일 디스크립터 테이블 | 한쪽의 FD 변경이 같은 테이블에 반영된다 |
| `CLONE_SIGHAND` | 시그널 처리 방법을 담은 테이블 | 스레드별 시그널 마스크는 별도다 |
| `CLONE_THREAD` | Thread Group, TGID | 각 스레드의 TID는 서로 다르다 |

현대 Linux에서 `CLONE_THREAD`를 사용하려면 `CLONE_SIGHAND`가 필요하고, `CLONE_SIGHAND`에는 `CLONE_VM`이 필요하다. `CLONE_FILES`는 별도 조건이다. 따라서 `CLONE_VM` 하나를 POSIX 스레드의 모든 공유 조건으로 적을 수 없다. 이 표 역시 완전한 스레드 라이브러리 구현 절차는 아니다. 스택과 TLS, 종료 처리 등도 준비해야 한다. 파일 테이블을 복사한 경우에도 기존 FD들이 같은 Open File Description을 참조하면 파일 offset은 공유될 수 있다. [clone의 자원 공유 계약](https://man7.org/linux/man-pages/man2/clone.2.html)

일반적인 `fork()`의 부모와 자식은 별도 주소 공간을 갖는다. COW로 일부 물리 페이지를 잠시 공유하는 것과 같은 `mm_struct`를 사용하는 것은 다른 의미다. 각 스레드의 커널 스택 또한 별도로 관리된다.

같은 프로세스의 스레드는 일반 데이터와 힙을 공유하지만 호출 스택·시그널 마스크·스레드별 저장소인 TLS는 구분한다. `errno`도 스레드마다 독립된 값을 갖는 예다. 다른 스레드의 스택에 있는 객체라도 주소를 전달받으면 접근할 수 있으므로, “스택이 별도다”가 모든 접근을 하드웨어로 차단한다는 뜻은 아니다. 객체의 수명과 접근 규칙을 함께 지켜야 한다. [POSIX 스레드의 공유·개별 속성](https://man7.org/linux/man-pages/man7/pthreads.7.html)

공유 주소 공간은 동시 접근의 순서와 안전성을 자동으로 보장하지 않는다. 한 스레드가 기록한 데이터를 다른 스레드가 사용할 때는 Mutex나 적절한 Atomic 연산 등으로 동기화해야 한다. 특히 C의 일반 변수에 동기화 없이 충돌하는 접근을 수행하면 데이터 경쟁으로 정의되지 않은 동작이 될 수 있다. “전역 변수의 변경이 언제나 즉시 안전하게 보인다”는 설명으로 이를 대신할 수 없다.

Windows에서는 프로세스 객체와 스레드 객체를 각각 `EPROCESS`, `ETHREAD`로 표현한다. 이는 같은 자원·실행 흐름 구분을 다른 커널 구조로 구현한 예다. 두 구조체는 드라이버 문서에서 불투명 객체로 다루므로, 고정된 필드 배치를 전제로 사용하지 않는다. [Windows의 커널 객체](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/eprocess)

## PintOS에서는 하나의 구조체가 어떻게 확장되는가

여기서 읽는 코드는 `lrn-pintos`의 **`5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0`** 버전이다. 이 저장소의 교육용 구현을 Linux 전체의 내부 구조와 동일하게 취급하지 않는다.

Project 1은 커널 스레드와 스케줄링을 다룬다. 커널 스레드들은 커널 주소 공간을 사용하면서 각자의 `struct thread`와 커널 스택을 가진다. Project 2에서는 사용자 프로그램을 실행하기 위해 주소 공간·파일·자식 종료 상태가 추가된다. 이 구현은 한 사용자 프로세스 안의 여러 사용자 스레드를 지원하는 구조가 아니므로, `struct thread`에 프로세스 자원도 함께 보관한다. Project 3은 여기에 가상 페이지를 추적할 보조 페이지 테이블과 사용자 스택 관련 상태를 더한다.

| 역할 | 이 버전의 필드 예 | 구분할 점 |
|---|---|---|
| 식별과 실행 상태 | `tid`, `name`, `status` | `RUNNING`, `READY`, `BLOCKED`, `DYING` 상태를 추적한다 |
| 우선순위·깨우기 | `priority`, `base_priority`, `wake_tick` | 현재 유효 우선순위와 원래 우선순위는 다를 수 있다 |
| 대기·기부·전체 목록 | `elem`, `donation_list`, `donation_elem`, `waiting_lock`, `all_elem` | 서로 다른 목록의 연결과 대기 관계를 보관한다 |
| MLFQS 계산 | `nice`, `recent_cpu` | 피드백 스케줄링에 필요한 값이다 |
| 커널 실행 문맥 | `tf` | 이 구현이 저장·복원하는 레지스터 상태다 |
| 사용자 프로세스 자원 | `pml4`, `fd_table`, `next_fd`, `running_file` | 사용자 주소 공간과 열린 파일을 관리한다 |
| 부모·자식 관계 | `child_status_list`, `self_status` | fork·wait·종료 결과를 전달하는 상태와 연결된다 |
| 가상 메모리 상태 | `spt`, `user_rsp`, `stack_bottom` | 가상 페이지와 사용자 스택의 상태를 추적한다 |
| 손상 확인 | `magic` | 구조체 손상을 발견하는 검사값이다 |

`USERPROG`와 `VM` 조건부 필드가 있으므로 구조체 크기는 빌드 구성에도 영향을 받는다. 필드별 고정 바이트 수를 더해 전체 크기를 추정하기보다, 해당 빌드의 정의와 디버그 정보를 확인해야 한다. [실제 struct thread 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/thread.h#L126)

## 4 KiB 페이지에서 커널 스택이 자라는 방향

이 PintOS에서는 `struct thread`를 페이지의 낮은 주소에 두고, 같은 **4 KiB 페이지**의 위쪽에서 커널 스택이 아래로 자란다. 구조체와 스택이 사용할 수 있는 전체 공간은 그 한 페이지 안에 들어가야 한다. 구조체가 차지하는 크기뿐 아니라 정렬·초기 프레임·호출 중 사용량도 스택 여유를 제한한다.

따라서 커널 함수의 큰 지역 배열이나 깊은 호출은 스레드 구조체를 침범할 수 있다. `magic` 검사와 `thread_current()`의 assertion은 이런 손상을 발견하는 단서지만, 모든 스택 오류를 예방하거나 원인을 확정하는 장치는 아니다. 큰 임시 버퍼를 동적으로 할당할 때도 실패 처리와 해제 책임이 필요하다. 사용자 프로그램의 스택은 별도 사용자 주소 공간에 있으며, 이 4 KiB 커널 스택과 혼동하지 않는다. [페이지 배치와 스택 제약](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/thread.h#L28)

이 배치만으로 “스레드 하나는 총 4 KiB만 소비한다”고 계산할 수도 없다. 사용자 페이지·페이지 테이블·파일과 자식 상태·할당기 등 다른 자원이 추가되기 때문이다. RAM을 4096으로 나눈 값이나 `tid_t` 정수 범위를 최대 동시 스레드 수로 제시하지 않는다. 실제 수용량은 구성과 작업 부하를 정한 뒤 측정해야 한다.

## thread_create에서 첫 명령까지

`thread_create(name, priority, func, aux)`는 먼저 실행할 함수를 호출하는 것이 아니라, **나중에 복원할 첫 실행 문맥을 만든다.** 코드의 순서는 다음과 같다.

1. `palloc_get_page(PAL_ZERO)`로 페이지를 얻는다. 실패하면 `TID_ERROR`를 반환한다.
2. `init_thread()`가 이름·우선순위·목록·검사값 등을 초기화하고 상태를 `BLOCKED`로 둔다. 초기 `tf.rsp`는 페이지 상단에서 포인터 한 칸을 뺀 위치다.
3. TID를 발급하고 `tf.rip`에 `kernel_thread`를 지정한다. 첫 인자인 함수 포인터는 `tf.R.rdi`, 보조 인자는 `tf.R.rsi`에 준비하며 커널 세그먼트와 flags도 설정한다.
4. 인터럽트를 잠시 끄고 `all_elem`으로 `all_list`에 등록한 뒤 이전 인터럽트 상태를 복원한다. 이어 `thread_unblock()`이 ready list에 우선순위 순서로 넣고 `READY`로 바꾼다. 이 함수 자체는 즉시 다른 스레드를 실행시키지 않는다.
5. `thread_create()`는 새 스레드의 우선순위가 현재 스레드보다 높으면 **직접 `thread_yield()`를 호출한다.** 이 경로에 `check_preemption()` 호출은 없다.
6. 스케줄러가 새 스레드를 선택하면 `thread_launch()`와 `do_iret()`이 준비된 문맥으로 전환한다. 처음 도착하는 `kernel_thread()`는 인터럽트를 켜고 `func(aux)`를 호출한다. 그 함수가 반환하면 `thread_exit()`로 종료한다.

`all_list`는 실행 가능한 스레드만 담는 ready list와 역할이 다르다. MLFQS는 전체 스레드의 `recent_cpu`와 우선순위를 갱신할 때 이 목록을 순회한다. 생성 중 목록 연결을 인터럽트 차단으로 보호하는 이유는 타이머 인터럽트의 순회가 연결 중간에 끼어들지 못하게 하기 위해서다. 이 PintOS 실행 모델에서 사용하는 보호 방식이며, 로컬 인터럽트 차단만으로 다른 CPU의 접근까지 막는 것은 아니다. [전체 목록에 등록하는 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L320), [MLFQS의 목록 순회](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L906)

새 스레드는 부모의 `thread_create()`가 반환되기 전에 실행될 수도 있다. 반대로 ready list에 들어갔다고 곧바로 실행을 시작했다고 볼 수도 없다. 생성·실행 가능 상태·CPU 선택은 서로 다른 단계다. `check_preemption()`은 이 버전의 다른 선점 판단을 읽을 때 참고할 함수이며, 생성 경로의 직접 호출로 대체해 그리면 실제 코드와 달라진다. [생성·unblock 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L279), [첫 실행 래퍼와 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L579)

## 멈춘 스레드가 돌아오는 위치

`thread_yield()`는 인터럽트를 끄고 현재 스레드를 ready list에 넣은 뒤 `do_schedule(THREAD_READY)`로 들어간다. `schedule()`은 다음 스레드를 선택하여 `RUNNING`으로 표시하고 time slice를 새로 시작한다. 현재와 다음 스레드가 다를 때 실제 레지스터 전환을 수행한다.

`thread_launch()`의 어셈블리는 현재 스레드의 정수 레지스터·스택 포인터·flags 등 이 구현의 실행 문맥을 `tf`에 저장한다. 돌아올 `RIP`에는 어셈블리의 `out_iret` 위치를 기록한다. 이어 `do_iret(&next->tf)`이 다음 문맥을 복원하고 `iretq`를 실행한다. 이미 실행했던 스레드가 다시 선택되면 처음의 `func(aux)`를 재호출하는 것이 아니라, 저장해 둔 전환 코드의 복귀 위치에서 이어진다. 새 스레드만 초기 `tf.rip`가 가리킨 `kernel_thread`에서 출발한다. `intr_frame`을 모든 CPU 확장 상태를 빠짐없이 보존하는 범용 문맥으로 확대해서는 안 된다. [thread_launch와 schedule](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L645)

`USERPROG` 빌드에서는 `schedule()`이 `process_activate(next)`도 호출한다. 이는 `pml4_activate(next->pml4)`와 `tss_update(next)`를 수행한다. 전자는 사용자 페이지 테이블 또는 기본 커널 페이지 테이블을 선택하여 `CR3`에 반영하고, 후자는 TSS의 `rsp0`를 다음 스레드의 커널 스택 상단으로 설정한다. 실행 문맥 복원과 주소 공간·커널 진입 스택 준비가 이 지점에서 연결된다. [process_activate](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L730), [페이지 테이블 활성화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c#L221), [TSS 갱신](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/tss.c#L76)

TSS 설명에서는 진입 방식도 구분해야 한다. 특권 수준이 바뀌는 인터럽트·예외 진입은 TSS의 스택 정보를 사용할 수 있으며 IST 설정도 영향을 준다. 모든 인터럽트가 무조건 `rsp0`로 이동하는 것은 아니다. 또한 이 PintOS의 `SYSCALL` 경로는 같은 자동 전환을 가정하지 않는다. `syscall-entry.S`가 사용자 `RSP`를 보관하고 TSS의 `rsp0`를 읽어 커널 스택으로 **명시적으로** 옮긴 뒤 사용자 문맥을 쌓는다. 사용자 복귀용 프레임과 커널 스케줄링을 재개할 `thread.tf`의 역할도 나누어 읽는다. [시스템 호출 진입 어셈블리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall-entry.S#L6)

종료 중인 스레드는 자기 커널 스택으로 쓰는 페이지를 즉시 해제할 수 없다. 이 코드의 `schedule()`은 종료한 스레드를 `destruction_req`에 넣고, 이후 `do_schedule()`이 이전 요청의 페이지를 회수한다. 사용 중인 실행 자원을 언제 회수할 수 있는지도 문맥 전환과 함께 결정된다. 종료 상태의 전달과 자원 회수는 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에서 이어진다.

## QEMU와 GDB에서 무엇을 관찰하는가

PintOS가 Guest이고 QEMU를 실행하는 쪽이 Host다. Guest의 레지스터와 메모리는 PintOS 실행 상태를 담고, `struct thread`와 스케줄링 목록의 의미는 Guest 커널이 정의한다. QEMU 내부의 CPU 상태 구조나 메모리 표현을 특정 버전의 필드명으로 고정할 필요는 없다. TCG·하드웨어 가속 등 실행 방식도 Host 내부 구현에 영향을 준다.

GDB는 QEMU의 gdbstub을 통해 Guest 레지스터와 메모리를 읽고, 커널의 디버그 정보로 바이트를 구조체 필드로 해석할 수 있다. 이때 실행 중인 커널과 심벌 파일이 일치해야 한다. 또한 QEMU gdbstub이 GDB의 thread로 보여 주는 대상은 Guest CPU다. 이를 PintOS의 ready list에 있는 스레드 목록으로 읽으면 안 된다. 기본 메모리 조회는 현재 Guest 가상 주소 변환을 사용한다. [QEMU의 GDB 지원과 CPU 표현](https://www.qemu.org/docs/master/system/gdb.html)

다음은 **실행 결과가 아닌 관찰 절차**다. 디버그 심벌을 갖춘 해당 빌드에 연결하고, 일반적인 PintOS 커널 스택을 사용 중인 안정된 위치에서 멈춘 뒤 확인한다.

```console
(gdb) ptype struct thread
(gdb) p sizeof(struct thread)
(gdb) p/x $rsp
(gdb) set $thread_page = ((unsigned long long)$rsp) & ~0xfffULL
(gdb) p ((struct thread *)$thread_page)->tid
(gdb) p ((struct thread *)$thread_page)->name
(gdb) p ((struct thread *)$thread_page)->status
(gdb) p ((struct thread *)$thread_page)->tf
(gdb) p/x $cr3
```

페이지 경계로 내림하는 식은 이 PintOS의 `running_thread()`가 커널 스택에서 현재 구조체를 찾는 배치 원리를 따라간다. 사용자 모드의 `RSP`, 초기 부팅 스택, 전환 도중의 임시 상태에 무조건 적용할 수는 없다. 구조체 크기는 선택한 심벌의 빌드 결과이며, 다른 빌드의 값까지 증명하지 않는다. 저장된 `tf`도 항상 그 순간의 실제 레지스터와 같지는 않다. 실행 중인 스레드의 최신 문맥은 전환 시 저장되기 때문이다.

두 정지 지점의 `RSP`·현재 스레드 정보·`CR3`를 함께 비교하면 실행 흐름과 주소 공간의 관계를 구분할 수 있다. 같은 `CR3`에서도 다른 스레드가 실행될 수 있고, `CR3` 값 하나만으로 스레드 ID를 알아낼 수는 없다. `CR3`에는 제어 정보가 함께 들어갈 수 있으므로 모든 비트를 루트의 물리 주소로 단정하지 않는다. 또한 `CR3` 기록 시 TLB 처리 범위는 CPU 설정과 구현 조건에 달려 있어 “모든 CR3 변경은 항상 전체 TLB를 비운다”고 일반화하지 않는다.

## 코드를 다시 읽을 때의 출발점

| 찾으려는 동작 | 파일과 함수 |
|---|---|
| 구조체와 커널 스택의 배치 | `include/threads/thread.h`의 `struct thread` |
| 최초 main 스레드 등록 | `threads/thread.c`의 `thread_init()` |
| 생성과 첫 문맥 준비 | `thread_create()`, `init_thread()`, `kernel_thread()` |
| 실행 가능 상태와 다음 대상 선택 | `thread_unblock()`, `thread_yield()`, `next_thread_to_run()`, `schedule()` |
| 레지스터 저장·복원 | `thread_launch()`, `do_iret()`, `include/threads/interrupt.h`의 `intr_frame` |
| 주소 공간과 커널 진입 스택 준비 | `userprog/process.c`의 `process_activate()`, `threads/mmu.c`, `userprog/tss.c` |
| 사용자 프로그램 생성·교체·회수 | `process_fork()`, `process_exec()`, `process_exit()` |

파일 경로는 위에서 지정한 커밋의 `pintos/` 아래를 기준으로 한다. 필드 정의에서 시작해 생성 시 채워지는 값, 전환 시 저장되는 값, 복원 뒤 이어지는 명령의 순서로 읽으면 프로세스의 자원과 스레드의 실행 상태가 코드 안에서 어떻게 만나는지 추적할 수 있다.
