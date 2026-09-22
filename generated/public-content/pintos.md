---
layout: default
title: PintOS
nav_order: 10
permalink: /wiki/pintos/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/pintos
projection_sha256: d4102f76fe3be8d629b3a0df4ba344bb80d8e7cea8b47e73bb02311b3d34754a
parent: OS
content_status: ready
public_parent_id: Wiki/computer-systems-network/os
grand_parent: Systems
ancestor: CS 기초
---

# PintOS
{: .no_toc }

실행할 Thread를 고르는 순간과 가상 주소를 실제 Frame에 연결하는 순간에는 서로 다른 자원 관리 규칙이 필요하다. PintOS에서는 작은 교육용 커널의 코드를 따라가며 이 규칙이 어디서 적용되는지 확인할 수 있다. 구현을 보관하는 저장소는 `lrn-pintos`다.

## Thread에서 프로세스로

Threads 영역에서는 스케줄링, 동기화와 인터럽트를 다룬다. `pintos/threads/thread.c`와 `synch.c`를 함께 읽으면 실행 순서를 고르는 코드와 대기 중인 Thread를 깨우는 코드의 관계를 살펴볼 수 있다.

User Programs에서는 사용자 프로그램을 적재하고 System Call을 처리한다. `pintos/userprog/process.c`의 `fork`, `exec`, `wait` 흐름을 따라가면 부모와 자식 프로세스가 실행 상태와 종료 결과를 주고받는 경계를 확인할 수 있다.

## 가상 메모리와 Frame의 수명

Virtual Memory에서는 Page Fault를 계기로 Page를 준비하고, 필요에 따라 Swap이나 파일에서 내용을 읽는다. `pintos/vm/vm.c`, `anon.c`, `file.c`가 각각 공통 VM 경로, 익명 Page, 파일 기반 Page를 다룬다.

Copy-on-Write에서는 부모와 자식이 Frame을 공유하다가 쓰기 시점에 분리한다. 공유 횟수뿐 아니라 누가 Frame을 참조하는지도 회수 판단에 필요하므로, 구조체와 해제 경로를 함께 읽어야 한다.

## 소스에서 기능을 찾는 순서

PintOS는 Stanford에서 시작한 교육용 OS이며, 이 저장소는 x86-64로 확장한 KAIST 판을 바탕으로 한다. 과제 문서가 요구하는 기능과 현재 저장소에 구현된 기능은 구분한다. [KAIST PintOS 소개](https://casys-kaist.github.io/pintos-kaist/)

다음 경로는 `lrn-pintos` 저장소의 `pintos/` 아래를 기준으로 한다. 파일 크기보다 확인하려는 동작의 진입점에서 시작하면 실제 구현을 찾기 쉽다.

| 영역 | 출발점과 역할 | 이어서 읽을 내용 |
| --- | --- | --- |
| `threads/` | `init.c`의 `main()`, `loader.S`·`start.S`의 부트 코드, `kernel.lds.S`의 이미지 배치 | [부팅](/wiki/computer-systems-network-topic-cc14ff5f728b/) |
| `threads/` | `thread.c`의 `thread_create()`·`schedule()`, `synch.c`의 Semaphore·Lock·Condition | [스레드 구현](/wiki/computer-systems-network-topic-936b351311c8/), [동기화](/wiki/computer-systems-network-topic-cd8cd4ad9254/) |
| `threads/` | `palloc.c`의 Page Pool, `malloc.c`의 Arena, `mmu.c`의 PML4 조작 | [메모리 관리](/wiki/computer-systems-network-topic-d160fea60072/), [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/) |
| `threads/` | `intr-stubs.S`와 `interrupt.c`의 IDT·인터럽트 진입 | [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/) |
| `userprog/` | `process.c`의 `process_fork()`·`process_exec()`·`process_wait()`·`process_exit()`와 ELF 적재 | [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/), [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/) |
| `userprog/` | `syscall-entry.S`·`syscall.c`의 진입, `exception.c`의 `page_fault()`, `gdt.c`·`tss.c`의 보호 영역 준비 | [시스템 콜](/wiki/computer-systems-network-topic-3cc26725c1cb/), [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/) |
| `vm/` | `vm.c`의 SPT·Frame·Fault·회수, `uninit.c`의 지연 초기화, `anon.c`의 Swap, `file.c`의 파일 Mapping | [SPT](/wiki/computer-systems-network-topic-aa5da5d73167/), [가상 메모리 구현](/wiki/computer-systems-network-topic-83f24986336f/) |
| `filesys/` | `filesys.c`의 열기·생성·삭제, `file.c`의 열린 Handle, `inode.c`·`directory.c`·`free-map.c`의 저장 구조 | [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/) |
| `devices/` | `timer.c`·`disk.c`·`kbd.c`·`serial.c`·`vga.c`의 장치 처리, `input.c`·`intq.c`의 입력과 Queue | [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/) |
| `lib/` | `string.c`·`stdio.c`·`stdlib.c`·`arithmetic.c`·`random.c`의 공용 함수 | [커널 구조](/wiki/computer-systems-network-topic-5cd3e3706e06/) |
| `lib/kernel/` | `console.c`·`bitmap.c`·`hash.c`·`list.c`의 커널 전용 기능 | [SPT의 Hash와 List](/wiki/computer-systems-network-topic-aa5da5d73167/) |
| `lib/user/` | `syscall.c`의 사용자 Wrapper와 `console.c`의 출력 | [File Descriptor](/wiki/pintos-file-descriptors/) |
| `include/` | 하위 영역별 헤더. `thread.h`의 `struct thread`, `vm.h`의 `struct page`, `vaddr.h`·`pte.h`의 주소·PTE 정의 | [주소 공간](/wiki/computer-systems-network-topic-3521ee6344f1/) |
| `tests/`·`utils/` | 테스트 코드와 Host에서 실행하는 PintOS 도구 | [저장소의 테스트와 실행 도구](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos) |

헤더는 자료구조와 호출 계약, 소스는 그 구현을 확인하는 출발점이다. `include/lib/syscall-nr.h`에 번호가 있어도 실제 `syscall_handler()` 분기까지 이어지는지 확인해야 한다. `vm/inspect.c` 같은 검사 도구도 Kernel의 해당 상태가 준비된 뒤에 사용한다.

`struct page`는 `operations`의 함수 포인터와 Page 종류별 데이터를 함께 사용한다. 어떤 함수가 호출되는지는 파일 이름뿐 아니라 현재 Page 상태에 달려 있다. 또 `list_elem`을 객체 안에 두는 Intrusive List는 연결을 위해 별도 Node를 할당하지 않지만, 객체 자체의 생성과 수명 관리까지 없애 주지는 않는다.

### 학습 단계와 현재 구현

| 단계 | 주요 학습 내용 | 주로 확인할 영역 |
| --- | --- | --- |
| Threads | Alarm, Priority Scheduling, Priority Donation, 동기화 | `threads/`·`devices/timer.c` |
| User Programs | 인자 전달, System Call, `fork`·`exec`·`wait`, fd 관리 | `userprog/`와 관련 Header·Library |
| Virtual Memory | SPT, Lazy Loading, Stack Growth, `mmap`, Eviction, Swap | `vm/`와 프로세스·주소 변환 코드 |
| File System | 파일 확장, 하위 디렉터리, 할당 구조와 Cache | `filesys/`와 장치 코드 |

단계가 바뀌어도 수정 범위가 한 디렉터리 안에만 머무르지는 않는다. 예를 들어 VM의 Page Fault 처리는 `exception.c`에서 시작하고, 파일 Mapping의 자원은 프로세스 종료 때도 정리한다. 디렉터리별 점수나 줄 수를 기여도·완성도의 기준으로 삼기보다 기능이 이어지는 경로를 확인한다.

현재 기본 파일 시스템은 `inode.c`·`free-map.c`를 사용한다. `fat.c`·`page_cache.c`가 존재해도 FAT Chain과 Buffer Cache가 모두 완성됐다는 뜻은 아니다. 확장 경로의 TODO와 실제 빌드 조건은 파일 시스템 문서에서 따로 다룬다.

## 작은 커널에서 남아 있는 조건

단일 CPU에서는 인터럽트를 끈 짧은 구간을 이용해 일부 상태 변경을 보호할 수 있다. 그러나 그 구간에서 Block하거나 실행권을 넘기는 호출을 해도 안전하다는 뜻은 아니다. SMP에서는 다른 CPU도 같은 데이터에 접근할 수 있어 같은 방법만으로 보호할 수 없다.

PintOS의 Page 할당자는 Pool의 Bitmap을 검색하고, 작은 할당은 Arena를 사용한다. 비교 대상인 Linux의 Buddy·Slab·NUMA 정책과 범위가 다르지만, 작은 커널에서도 연속 공간 부족과 자원 누수·해제 순서를 따져야 한다. 현재 Linux의 정책 이름이나 코드 크기를 고정된 비교표로 외우기보다 관련 기능과 설정을 확인한다.

교육용이어도 사용자·커널 권한과 Page Table, TSS·IDT 같은 CPU 규칙은 실제 실행에 영향을 준다. 주소 변환은 모든 경우에 같은 깊이로 끝나지 않고, `syscall`의 Stack 전환은 TSS만으로 자동 처리되지 않는다. 코드에 사용된 명령과 Page 크기, 진입 경로를 함께 읽는다.

장치 코드에는 IDE·Timer·Keyboard뿐 아니라 Serial·VGA도 있다. `input.c`는 입력을 모으고 `intq.c`는 Queue를 제공하므로 모든 파일을 독립 하드웨어 Driver 하나로 세지 않는다. Serial Console과 QEMU의 GDB Stub도 별도 경로다.

이 구현에는 일반적인 네트워크 Stack과 Socket API, 동적 Kernel Module, 다중 사용자 권한 관리나 범용 전원 관리 체계를 제공하는 계층이 없다. 그렇다고 보호가 전혀 없는 것은 아니다. 구현한 격리와 범위 밖의 정책을 나누어 읽어야 한다.

Linux에서는 스케줄링과 공통 커널 기능을 `kernel/`, 메모리 관리를 `mm/`, 파일 시스템을 `fs/`, 장치를 `drivers/`, 네트워크를 `net/`, 아키텍처별 코드를 `arch/`에서 찾는다. PintOS의 `threads/`는 이 가운데 여러 역할을 함께 담는다. 이런 대응은 소스를 찾는 출발점이며, 서로 같은 추상화와 의존 관계를 가진다는 뜻은 아니다.

## 구현과 실행 환경

이 저장소는 KAIST PintOS를 바탕으로 한 크래프톤 정글 팀 구현의 개인 보존 저장소다. 제공된 커널 기반 코드와 팀 구현, 개인 기여를 구분한다. 교육용 커널에서 확인한 결과를 실제 서비스 운영 경험으로 확대하지 않는다.

검증 환경은 x86-64와 QEMU를 사용한다. 저장소에 기록된 이전 테스트 결과와 현재 커밋의 CI 결과는 구분해서 확인한다.

- [lrn-pintos](https://github.com/woonyong-kr/lrn-pintos)
- [영역별 구현 기록](https://github.com/woonyong-kr/lrn-pintos/tree/main/docs/pintos)
- [가상 메모리 코드](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm)
- [CI 실행 결과](https://github.com/woonyong-kr/lrn-pintos/actions/workflows/ci.yml)
