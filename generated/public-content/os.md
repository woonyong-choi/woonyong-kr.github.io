---
layout: default
title: OS
nav_order: 3
permalink: /wiki/os/
publication_state: publish
has_toc: true
projection_id: Wiki/computer-systems-network/os
projection_sha256: 8e7e9ac108bcccfcba548ce449af9caaf24679af2f7168dd2e479adc5e4464b1
parent: Systems
content_status: ready
public_parent_id: Wiki/computer-systems-network
grand_parent: CS 기초
---

# OS
{: .no_toc }

OS는 프로그램이 실행되는 환경을 만들고, 여러 프로그램이 사용하는 자원을 관리한다. 프로그램이 파일을 읽을 때 매번 디스크의 Sector를 지정하거나, 메모리를 할당받을 때 다른 프로그램의 물리 주소를 피해서 위치를 고르지는 않는다. OS가 제공하는 인터페이스와 접근 규칙을 통해 이 작업을 수행한다.

## 자원을 나누고 접근을 제한한다

CPU 시간, 메모리, 저장 장치와 네트워크는 한 프로그램만의 자원이 아니다. OS는 실행할 흐름을 선택하고, 사용할 공간을 관리하며, 요청한 접근을 허용할지 판단한다. 이때 추상화와 보호는 서로 다른 역할을 맡는다.

가상 주소는 프로그램이 사용할 주소 공간을 제공한다. Page Table의 Mapping과 권한은 그 주소의 접근을 제어한다. 같은 Page를 여러 프로세스가 공유하도록 연결할 수도 있다. 메모리의 격리와 공유는 주소 공간을 어떻게 Mapping하는지에 달려 있다. [주소 공간](/wiki/computer-systems-network-topic-3521ee6344f1/)과 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)은 이 관계를 구체적인 주소와 실행 예제로 다룬다.

파일의 이름과 offset도 저장 장치의 실제 배치를 대신하는 인터페이스다. [파일 시스템](/wiki/computer-systems-network-topic-2f8a1e4d5189/)은 이름에서 파일의 내용을 찾고, 구현에 따라 장치·네트워크·커널 정보로 요청을 연결한다. 파일 API가 있다고 모든 읽기가 물리 디스크에 도달하는 것은 아니다.

CPU 시간을 나누는 일은 [프로세스와 스레드](/wiki/computer-systems-network-topic-63b969bafddd/)의 실행 상태와 Scheduling으로 이어진다. 실행 중인 프로그램이 자발적으로 양보하지 않아도 선점할 수 있지만, 타이머 인터럽트가 올 때마다 반드시 다른 Thread로 바뀌지는 않는다. 다음 대상을 고르는 조건과 실제 전환을 구분해야 한다.

OS가 없는 프로그램도 실행할 수 있다. Bare Metal 프로그램은 장치 초기화와 실행에 필요한 기능을 직접 포함하거나 라이브러리를 이용한다. 여러 프로그램을 함께 실행할 때는 자원을 나누는 규칙과 서로의 실행을 보호할 경계가 추가로 필요하다.

## Kernel의 경계를 나누는 방법

Kernel은 OS 가운데 하드웨어의 특권 실행 모드에서 동작하는 핵심 부분이다. Shell과 시스템 유틸리티, 사용자 공간의 서비스까지 모두 같은 권한으로 실행되는 것은 아니다. [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에서는 실행 주소와 권한, 명령어와 예외의 조건을 구분한다.

Monolithic Kernel은 파일 시스템·Driver·메모리 관리 같은 기능을 커널 주소 공간에 함께 둔다. 내부 함수 호출과 포인터 전달로 기능을 연결할 수 있지만, 잘못된 쓰기가 다른 커널 구성 요소까지 훼손할 수 있다. Linux의 Kernel Module은 코드를 나누어 빌드하고 런타임에 적재하는 방법이다. 적재된 모듈에 별도의 사용자 프로세스 보호 경계가 생기는 것은 아니다.

Microkernel은 주소 공간, CPU 시간, 인터럽트와 IPC 같은 기반 기능을 커널에 두고 상위 서비스를 사용자 공간에 배치한다. 예를 들어 앱의 요청을 파일 서버가 받고, 필요하면 Driver 서버와 통신하는 방식으로 구성할 수 있다. 어떤 기능을 커널에 남기는지는 구현마다 다르다. seL4에도 타이머와 인터럽트 제어에 필요한 커널 코드가 있으므로 “Driver는 예외 없이 전부 밖에 있다”라고 일반화하지 않는다. [seL4의 Microkernel과 서비스 구성](https://sel4.systems/About/FAQ.html)

서버를 분리하면 오류의 영향을 제한할 수 있지만, 중단된 서버의 상태를 복구하고 다른 구성 요소의 참조를 정리해야 서비스가 회복된다. Driver가 DMA로 다른 메모리를 바꿀 수 있다면 장치 접근 권한과 IOMMU 같은 보호도 고려해야 한다. 프로세스를 나누는 것만으로 시스템 전체의 안전성이 자동으로 보장되지는 않는다.

## 관리 정책을 라이브러리에 두는 설계

Exokernel은 하드웨어 자원을 안전하게 나누어 사용할 수 있도록 보호하고, 파일·메모리·네트워크의 상위 추상화를 애플리케이션 쪽 Library OS에 맡기는 설계다. 자원 할당과 회수 자체가 사라지는 것은 아니다. 어떤 앱이 어떤 자원을 사용할 수 있는지, 자원을 회수할 때 무엇을 정리해야 하는지에 관한 경계는 여전히 필요하다.

MIT의 XOK와 ExOS는 이 구분을 구현한 연구 사례다. ExOS 같은 Library OS를 재사용할 수 있으므로 앱마다 파일 시스템 전체를 처음부터 작성해야 한다는 뜻도 아니다. 특정 Workload에 맞춘 정책을 선택할 여지가 생기는 대신 호환성·공유·자원 회수의 설계가 중요해진다. [MIT Exokernel](https://pdos.csail.mit.edu/archive/exo/)

Library OS를 이용하는 또 다른 사례는 Unikernel이다. MirageOS는 앱과 필요한 기능을 결합해 Hypervisor에서 실행하는 독립 이미지를 만든다. Exokernel의 자원 공유 구조와 비교하려면, 이미지에 포함되는 기능과 앱 사이의 보호 경계를 각각 살펴봐야 한다. [MirageOS의 구성과 빌드](https://github.com/mirage/mirage)

## 구조의 이름보다 실제 경로를 비교한다

커널 내부의 직접 호출과 서버 사이 IPC를 비교할 때는 전달할 데이터의 크기, 복사·공유 방식, 주소 공간 전환, Scheduling과 Cache 상태를 확인한다. 모든 IPC가 Payload를 복사하는 것도, 모든 서버 호출이 고정 횟수의 전환을 일으키는 것도 아니다. “Monolithic은 빠르고 Microkernel은 느리다”라는 순위만으로 실제 성능을 판단할 수는 없다.

코드 줄 수와 실행 이미지의 크기도 같은 척도가 아니다. 아키텍처, 활성 기능, Driver 포함 범위, Debug 정보와 압축 방식에 따라 달라진다. 서로 다른 범위로 센 숫자를 비교하면 작은 Kernel이 무엇을 밖으로 옮겼는지 놓치기 쉽다.

seL4의 정형 검증은 명시된 모델·구성·가정 아래에서 커널 구현과 명세의 관계를 증명한다. 그 위에서 실행하는 모든 애플리케이션, Driver와 하드웨어까지 무조건 검증됐다는 의미는 아니다. 증명된 속성과 신뢰하는 기반을 함께 읽어야 한다. [seL4 증명의 가정](https://sel4.systems/Verification/assumptions.html)

## Linux와 Windows에서 역할을 비교하기

작은 커널에서 하나의 자료구조로 표현하던 기능도 범용 OS에서는 여러 상태와 객체로 나뉜다. Linux의 `task_struct`와 메모리 주소 공간의 `mm_struct`, Windows의 Process·Thread 객체를 비교할 때는 이름보다 각 구조가 소유하는 자원과 수명을 확인한다. 구조체 크기와 fd·Handle 한도는 빌드·버전·설정에 따라 달라진다.

Linux에서는 공통 커널과 아키텍처별 진입 코드, 메모리 관리, VFS와 Driver가 역할을 나눈다. System Call 뒤의 경로가 항상 Block Layer와 디스크로 이어지지는 않는다. 파일 읽기도 Cache에서 끝나거나 다른 종류의 파일 시스템으로 전달될 수 있다. Windows 역시 I/O Manager·Memory Manager·Object Manager와 Kernel·HAL의 역할을 나누지만, 이 이름을 모든 요청이 순서대로 지나가는 호출 Stack으로 보아서는 안 된다.

### 자원의 이름, 객체와 주소 범위

Windows의 Object Manager는 파일·프로세스·Thread·동기화 객체·Section 등 여러 자원의 생성, 접근 권한과 수명을 관리한다. Handle을 통해 객체를 사용한다는 점은 fd와 비교할 수 있지만, 번호·권한·복제 규칙까지 같은 것은 아니다. 프로세스 내부의 값을 다른 프로세스에 복사하는 것만으로 접근 권한이 전달되지 않는다. [Windows Object Manager](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/windows-kernel-mode-object-manager)

가상 주소 범위와 물리 Page의 상태도 나누어 읽는다. Windows의 VAD는 프로세스의 가상 주소 범위를 설명하는 자료구조이며, Section은 공유 가능한 메모리와 파일 Mapping을 제공한다. 각 프로세스는 Section의 일부 또는 전체를 자신의 View로 Mapping한다. PintOS의 SPT Entry 한 개와 VAD·Section·PTE를 일대일로 대응시킬 수는 없다. [VAD 조회](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-vad), [Section과 View](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/section-objects-and-views)

PintOS의 `palloc_get_multiple()`은 Bitmap에서 연속된 여러 Page를 찾는다. 한 Page만 할당할 수 있는 인터페이스가 아니며, 총 여유량이 있어도 필요한 연속 구간이 없으면 실패할 수 있다. Linux의 Buddy 할당은 Order에 따른 물리 Page 블록을 다루고, Slab 계열은 커널 객체 할당에 사용한다. NUMA Node·Zone, 회수와 대기 가능 여부도 요청 조건에 영향을 준다. 구체적인 할당과 회수는 [메모리 관리](/wiki/computer-systems-network-topic-d160fea60072/)에서 살펴본다.

Windows의 MDL은 I/O Buffer가 놓인 물리 Page의 배치를 기술한다. 가상 주소가 연속이어도 이 Page들은 물리적으로 떨어져 있을 수 있다. MDL을 만든다는 것과 연속 물리 메모리를 확보한다는 것은 다르다. Page를 고정하고 Mapping하는 API에도 별도의 수명과 해제 계약이 있다. [MDL과 물리 Page](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/using-mdls)

### 실행 시간과 인터럽트 우선순위

Linux의 Fair Scheduling은 CFS의 최소 `vruntime` 선택만으로 모든 현재 버전을 설명할 수 없다. 커널은 6.6부터 EEVDF를 도입했다. EEVDF는 받아야 할 CPU 시간과 실제 사용량의 차이를 나타내는 Lag로 실행 자격을 판단하고, 자격이 있는 Task 중 Virtual Deadline이 이른 대상을 선택한다. Fair 정책과 Real-time·Deadline 정책의 적용 범위도 구분한다. [Linux EEVDF](https://docs.kernel.org/scheduler/sched-eevdf.html)

Windows에서는 프로세스의 Priority Class와 Thread의 상대 우선순위로 기본 우선순위를 정한다. 준비된 Thread 가운데 높은 우선순위를 먼저 실행하며 같은 우선순위에서는 Time Slice를 나눈다. 동적 조정과 실행 조건이 있으므로 고정된 20 ms를 모든 Thread의 Quantum으로 가정하지 않는다. [Windows Scheduling](https://learn.microsoft.com/en-us/windows/win32/procthread/scheduling-priorities)

Thread의 Scheduling 우선순위와 IRQL은 역할이 다르다. IRQL은 현재 실행 문맥에서 허용되는 인터럽트와 커널 함수의 조건에 영향을 준다. 예를 들어 `DISPATCH_LEVEL` 이상에서는 대기나 Pageable 메모리 접근에 제약이 있다. 한 CPU의 인터럽트 우선순위를 높여도 다른 CPU의 공유 데이터 접근까지 멈추지는 않는다. [Windows IRQL](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/managing-hardware-priorities)

DPC는 짧게 끝내야 할 ISR의 후속 처리를 Queue에 넣어 나중에 더 낮은 IRQL에서 수행하는 기능이다. PintOS의 `intr_yield_on_return()`은 인터럽트 복귀 때 Scheduling을 요청하는 표시이므로 같은 기능으로 바꾸어 부를 수는 없다. 미룬 작업의 종류와 실행 문맥을 함께 확인한다. [DPC의 역할](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/introduction-to-dpc-objects)

여러 CPU가 같은 상태를 바꾸는 경우에는 Lock·원자적 연산·읽기 측 자료구조의 수명 관리처럼 문제에 맞는 동기화가 필요하다. Linux의 RCU와 Windows의 단일 연결 List를 이름만으로 같은 방식으로 대응시키지는 않는다. 인터럽트를 끄는 범위, 잠들 수 있는 문맥, 독자가 참조 중인 객체를 언제 해제할지가 각각 다른 조건이다.

### API 계약과 내부 구현을 구분한다

시스템 호출의 번호와 진입 명령, Register와 Dispatch 방식은 OS뿐 아니라 CPU 아키텍처·ABI에 따라 달라진다. 한 x86-64 소스의 `LSTAR`·진입 Symbol·분기 구조를 모든 버전에 적용하지 않는다. 애플리케이션이 사용할 API와 커널 내부 자료구조의 이름도 구분해야 한다.

자료구조의 줄 수, 최대 메모리·CPU 수와 Context Switch 지연을 비교하려면 같은 조건으로 얻은 근거가 필요하다. QEMU에서 관찰한 시간을 물리 장비의 비용과 섞거나, 한 버전의 배열 크기를 OS 전체의 고정 한도로 사용하지 않는다. 비교하려는 기능과 설정을 정한 뒤 소스·명세·실행 결과가 각각 무엇을 설명하는지 확인한다.

## PintOS에서 역할을 코드에 연결하기

PintOS는 스케줄링·동기화·사용자 프로그램·가상 메모리·파일 시스템을 학습하기 위한 OS다. 현재 학습 저장소의 기본 구성은 파일 시스템과 Driver를 같은 커널 주소 공간에 두며, 일반적인 다중 Thread 사용자 프로세스나 완성된 네트워크 스택까지 제공하지 않는다. 그렇다고 타이머·키보드·디스크 Driver만 있는 것도 아니다. Serial과 VGA 같은 장치 코드도 포함된다.

부팅 코드는 각 기능의 의존 관계를 드러낸다. Thread와 메모리 할당자를 준비하고 주소 변환·인터럽트·장치를 초기화한다. `thread_start()`가 인터럽트를 허용하는 시점과 파일 시스템 초기화가 끝나는 시점은 같지 않다. 실제 초기화와 호출 경로는 [PintOS의 커널 구조](/wiki/computer-systems-network-topic-5cd3e3706e06/)에서 살펴본다.

추상화와 보호가 갖추어져도 저장의 완료 조건은 별도로 확인해야 한다. 쓰기 반환, 다시 읽기 성공, 전원 차단 뒤의 보존은 서로 다른 관찰이다. 현재 PintOS에는 일반적인 `fsync()` 시스템 콜이 없다. Guest 요청의 완료와 QEMU·Host의 저장 조건은 [fsync](/wiki/file-system-fsync/)에서 나누어 다룬다.
