---
layout: default
title: 주소 공간
nav_order: 2
permalink: /wiki/computer-systems-network-topic-3521ee6344f1/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-3521ee6344f1
projection_sha256: b4b4a3c4f3f40e4841caa3c0d918543a9e3ab0e01b43b4b4a8709bf5fba48aaa
parent: 메모리 관리
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-d160fea60072
search_terms:
- Canonical Address
- KERN_BASE
- VMA
- LMA
- 초기 main Thread
grand_parent: OS
ancestor: CS 기초
---

# 주소 공간
{: .no_toc }

프로그램이 사용하는 주소는 프로세스의 **가상 주소 공간**에 속한다. 같은 주소라도 프로세스가 다르면 다른 메모리를 가리킬 수 있고, 서로 다른 주소를 같은 물리 페이지에 연결할 수도 있다. 주소의 범위와 접근 권한을 정하는 일, 물리 Frame을 확보하는 일, 그 안에 객체를 만드는 일은 각각 다른 단계다.

전역 변수 `int g = 42;`와 `malloc()`으로 얻은 블록을 비교하면 이 차이가 드러난다. 전역 변수의 초기값은 실행 파일에서 출발하고, 동적 할당은 실행 중에 필요한 공간을 요청한다. 어느 경우든 주소를 사용할 수 있다는 사실만으로 해당 페이지가 이미 물리 메모리에 상주한다고 결론낼 수는 없다. 주소 변환 자체는 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서 다룬다.

## 주소의 형태와 접근 권한은 서로 다른 조건이다

x86-64의 4단계 Paging에서는 bit 47을 상위 16비트로 부호 확장한 주소가 canonical form을 만족한다. 두 유효 범위 사이의 값은 이 규칙에 맞지 않는다. 다음 표는 **주소 형태의 범위**이며, 각 범위를 User와 Kernel 중 누가 사용하는지는 OS가 정한다.

| 4단계 Paging의 범위 | 크기 |
|---|---:|
| `0x0000000000000000`–`0x00007fffffffffff` | 128 TiB |
| `0xffff800000000000`–`0xffffffffffffffff` | 128 TiB |

5단계 Paging에서는 bit 56을 부호 확장하므로 양쪽 범위가 각각 64 PiB로 늘어난다. 이 기능의 지원과 활성화는 별도로 확인해야 한다. 여기서는 LAM으로 포인터의 상위 비트를 처리하지 않는 주소를 기준으로 한다. Non-canonical 주소를 사용하는 일반적인 메모리 접근은 #GP를, Stack Segment를 사용하는 접근은 #SS를 일으킬 수 있다. Page Table의 Present·권한 문제로 발생하는 #PF와는 원인이 다르다. [Intel SDM의 주소 검사와 Paging](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf), [Linux의 5단계 Paging](https://docs.kernel.org/6.16/arch/x86/x86_64/5level-paging.html)

Canonical 주소라도 Mapping이 없거나 권한이 맞지 않으면 접근할 수 없다. 반대로 낮은 canonical 범위 안에 Kernel을 놓을 수도 있다. Linux x86-64의 전형적인 배치는 낮은 범위에 프로세스의 Mapping을, 높은 범위에 Kernel의 직접 Mapping·vmalloc·vmemmap·실행 이미지 등을 둔다. KASLR과 빌드 설정에 따라 일부 기준 주소가 달라지며, PTI를 사용하면 User와 Kernel 실행 때 사용하는 Page Table도 구분된다. 아래 PintOS의 `KERN_BASE`를 Linux의 `PAGE_OFFSET`으로 바꿔 끼우면 같은 주소 계산이 되지 않는다. [Linux 6.16의 주소 배치](https://docs.kernel.org/6.16/arch/x86/x86_64/mm.html), [PTI](https://docs.kernel.org/6.16/arch/x86/pti.html)

Linux 6.16 문서의 기본 x86-64 주소 배치에서 직접 Mapping에 배정한 가상 영역은 4단계 Page Table일 때 64 TiB, 5단계일 때 32 PiB다. 이는 설치된 RAM 용량이나 모든 실행의 실제 Mapping 범위를 뜻하지 않는다. 4단계의 기본 기준 주소는 `0xffff888000000000`이지만, `CONFIG_RANDOMIZE_MEMORY`와 KASLR 활성 상태에 따라 부팅 때 위치와 범위가 조정될 수 있다. [Linux 6.16의 기본 주소 배치](https://docs.kernel.org/6.16/arch/x86/x86_64/mm.html), [KASLR의 영역 조정](https://github.com/torvalds/linux/blob/v6.16/arch/x86/mm/kaslr.c#L100-L168)

같은 버전의 `__va(pa)`는 `PAGE_OFFSET`을 더하지만, `__pa(kva)`를 모든 Kernel 주소에서 그 상수를 빼는 함수로 설명하면 안 된다. 비디버그 구현의 `__phys_addr_nodebug()`는 직접 Mapping 주소와 Kernel 실행 이미지 주소를 구분하며, 후자에는 `__START_KERNEL_map`과 `phys_base`를 사용한다. PintOS의 고정 오프셋 변환과 비교할 때도 주소가 어느 영역에 속하는지 먼저 확인해야 한다. [변환 매크로](https://github.com/torvalds/linux/blob/v6.16/arch/x86/include/asm/page.h#L40-L59), [x86-64의 물리 주소 계산](https://github.com/torvalds/linux/blob/v6.16/arch/x86/include/asm/page_64.h#L22-L39)

## 실행 파일에서 메모리로

Linux의 ELF 실행 파일을 예로 들어 `g`의 경로를 따라가 보자. 컴파일러와 어셈블러는 소스를 기계어와 데이터, 심볼 정보가 있는 목적 파일로 바꾼다. 링커는 목적 파일들을 결합하면서 심볼 참조를 해결하고 실행 파일의 배치를 정한다. 일반적인 구성에서 쓰기 가능한 전역 변수의 초기값 42는 `.data`에 들어간다. 실제 배치는 최적화와 Linker 설정에 따라 달라질 수 있다.

여기서 **Section**과 **Segment**를 구분해야 한다. `.text`, `.data`, `.bss` 같은 Section은 파일 안의 내용을 종류별로 나눈다. 실행할 때 로딩할 범위와 권한은 Program Header가 나타내며, 그중 `PT_LOAD` Segment가 메모리에 적재할 영역을 기술한다. Section 하나마다 별도의 Mapping이 생기는 것은 아니다. `.bss`는 보통 `SHT_NOBITS` Section으로 표현하므로 크기는 있어도 그 크기만큼의 초기값을 파일에 저장하지 않는다. 명시적으로 0을 대입한 정적 객체도 이 영역에 놓일 수 있다. [ELF의 Section과 Program Header](https://man7.org/linux/man-pages/man5/elf.5.html)

`execve()`로 새 프로그램을 실행하면 Kernel은 기존 주소 공간의 Mapping을 새 실행 이미지에 맞게 바꾼다. 동적 링크 ELF라면 `PT_INTERP`가 지정한 인터프리터도 관여해 필요한 공유 라이브러리를 준비한다. 실행 파일에 있는 내용을 모두 먼저 읽어야만 프로그램이 시작되는 것은 아니다. [Linux의 `execve()`](https://man7.org/linux/man-pages/man2/execve.2.html)

이 학습 저장소의 PintOS 사용자 프로그램은 `Makefile.userprog`의 `-static` 옵션으로 링크하며, 필요한 Library 코드를 실행 파일에 포함한다. `load_program_headers()`도 `PT_DYNAMIC`·`PT_INTERP`·`PT_SHLIB`를 만나면 적재를 거부한다. Linux에서 Dynamic Linker가 공유 라이브러리를 준비하는 경로가 이 로더에도 있다고 가정할 수는 없다. 공유 라이브러리의 파일 페이지와 사적 쓰기를 구분하는 원리는 [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/#같은-파일을-읽어도-쓰기의-의미는-달라진다)에서 확인한다. [사용자 프로그램의 정적 링크](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/Makefile.userprog), [지원하는 Program Header](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1032-L1062)

프로그램이 `g`를 처음 읽는 순간에도 여러 경로가 가능하다. 같은 페이지에 이미 접근했거나 로딩 과정에서 준비했다면 곧바로 읽을 수 있다. 페이지가 아직 현재 프로세스에 연결되지 않았지만 파일 내용이 Page Cache에 있다면 디스크를 읽지 않는 Minor Fault로 처리할 수 있다. 저장 장치에서 내용을 가져와야 하는 경우에는 Major Fault가 발생할 수 있다. 따라서 ‘변수의 첫 접근 → Page Fault → 디스크 읽기’가 언제나 성립하는 것은 아니다. Fault의 종류와 처리 경로는 [Page Fault](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에서 이어진다.

### 파일에 없는 0은 어디서 오는가

`PT_LOAD`의 `p_filesz`는 파일에서 가져올 바이트 수, `p_memsz`는 메모리에 필요한 바이트 수다. `p_memsz`가 더 크면 그 차이에 해당하는 영역은 0으로 채워진다. 다음 코드는 초기값 42를 담은 4바이트와 뒤의 0으로 채울 영역을 구성한다. ELF 파일을 직접 로딩하는 프로그램은 아니며, Segment의 두 크기가 의미하는 바이트 배열을 실행해 보는 모델이다.

```run-python
from struct import pack, unpack_from

file_bytes = pack('<I', 42)
file_size = len(file_bytes)
memory_size = 12
virtual_start = 0x400000
assert 0 <= file_size <= memory_size

segment = bytearray(memory_size)
segment[:file_size] = file_bytes
for offset in range(0, memory_size, 4):
    value = unpack_from('<I', segment, offset)[0]
    origin = '파일의 초기값' if offset < file_size else '0으로 채운 영역'
    print(f'VA={virtual_start + offset:#x}: {value} ({origin})')

assert unpack_from('<I', segment, 0)[0] == 42
assert segment[file_size:] == bytes(memory_size - file_size)
```

첫 주소에는 42, 뒤의 두 주소에는 0이 출력된다. 이 예제는 4바이트 정수와 Little Endian을 명시적으로 선택했다. 실제 Kernel이 페이지를 언제 확보하는지, 어떤 Frame에 연결하는지까지 이 배열로 재현하지는 않는다.

## 영역의 이름과 객체의 수명

주소 공간을 설명할 때는 보통 다음 영역을 구분한다. 이는 각 영역의 용도를 정리한 표이며, 모든 프로세스가 이 순서로 연속 배치된다는 뜻은 아니다.

| 영역 | 주로 담는 내용 | 함께 볼 조건 |
| --- | --- | --- |
| Text | 실행할 기계어 | 실행·읽기·쓰기 권한은 Segment와 Mapping 설정에 달려 있다. |
| Data | 초기값이 있는 정적 객체 | 파일의 초기값과 실행 중 변경된 값은 다를 수 있다. |
| BSS | 0으로 초기화할 정적 객체 | 파일에 같은 크기의 0을 모두 저장할 필요가 없다. |
| Heap | 동적으로 할당하는 블록 | 할당기가 여러 Mapping과 Arena를 사용할 수 있다. |
| Stack | 함수 호출에 필요한 저장 공간 | 같은 프로세스의 Thread들도 보통 각자의 Stack을 사용한다. |
| 기타 Mapping | 공유 라이브러리, 파일, 익명 메모리 등 | 공유 여부와 접근 권한을 Mapping마다 정한다. |

‘Heap은 위로, Stack은 아래로 자란다’는 그림은 전형적인 배치를 단순화한 것이다. `brk()`로 관리하는 영역의 끝은 주소가 커지는 방향으로 확장할 수 있지만, 모든 `malloc()`이 그 끝을 늘리는 것은 아니다. 주소 배치는 ASLR, 실행 파일 형식과 ABI, Mapping 요청 등에 영향을 받는다. 서로 떨어진 영역을 하나의 Heap 그림으로 표현하면 이 차이가 사라진다.

객체의 **수명**은 실제 배치와 구분해서 읽어야 한다. C에서 자동 저장 기간을 가진 일반적인 지역 객체는 해당 Block을 실행하는 동안 존재한다. 그 Block이 끝난 뒤 객체를 가리키던 포인터로 접근하면 안 된다. 지역 변수라고 해서 항상 Stack에 바이트가 생기는 것은 아니다. 컴파일러가 Register에 두거나 연산 자체를 없앨 수도 있다. [C 작업 초안 N3096, 6.2.4 객체의 저장 기간](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3096.pdf)

| 저장 기간 | 예 | 수명이 끝나는 기준 |
| --- | --- | --- |
| Static | 전역 변수, 함수 안의 `static` 변수 | 프로그램 실행이 끝날 때 |
| Thread | C의 Thread Local 객체 | 해당 Thread 실행이 끝날 때 |
| Automatic | 일반적인 Block 내부 지역 변수 | 해당 Block의 실행이 끝날 때; VLA에는 선언 시점과 Scope에 따른 별도 규칙이 있다. |
| Allocated | `malloc()` 등으로 확보한 객체 | 해제할 때 |

함수 안에 선언한 `static` 변수는 함수가 반환되어도 남는다. 반대로 지역 포인터가 사라져도 그 포인터가 가리키던 동적 할당은 자동으로 해제되지 않는다. 소유한 블록을 해제하지 못하면 누수가 되고, 해제한 뒤 다시 접근하면 Use After Free가 된다. 프로세스가 종료되면 OS가 그 주소 공간을 회수하지만, 실행 중의 반환 책임까지 없어지는 것은 아니다. C++의 `new`·`delete`처럼 사용하는 언어와 API에 맞는 생성·소멸 규칙도 함께 확인한다. 선언 위치만 보는 대신 ‘누가 이 공간을 소유하며 언제까지 사용하는가’를 확인해야 한다.

## 함수 호출과 Stack Frame

Stack은 중첩된 함수 호출과 반환에 맞춰 저장 공간을 관리한다. x86-64에서 `RSP`는 현재 Stack 위치를 가리키며, 호출 과정에는 반환 주소와 필요한 Register 저장, 지역 저장 공간이 관여한다. 다만 모든 호출이 같은 모양의 Stack Frame을 만들지는 않는다. Inline으로 호출 자체가 없어질 수 있고, Frame Pointer인 `RBP`를 생략하는 코드도 있다.

인자 전달 규칙도 ‘x86-64는 처음 여섯 개를 Register로 전달한다’만으로 설명하기에는 부족하다. **System V AMD64 ABI**에서는 INTEGER로 분류한 인자를 `RDI`, `RSI`, `RDX`, `RCX`, `R8`, `R9` 순서의 사용 가능한 Register에 배정한다. SSE로 분류한 인자는 별도의 Vector Register를 사용한다. 구조체의 분류, 정렬과 Register의 잔여 수에 따라서도 전달 위치가 달라진다. 이는 하나의 ABI 규칙이며, 다른 ABI에 그대로 적용하지 않는다. [System V AMD64 ABI의 Stack Frame과 인자 전달](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex)

Stack 공간에는 한도가 있으므로 깊은 재귀 호출과 큰 지역 배열은 주의해야 한다. Linux의 Stack 크기를 일괄적으로 8 MiB라고 정할 수는 없다. NPTL에서 새 Thread의 기본 Stack 크기는 프로그램 시작 시점의 `RLIMIT_STACK`이 유한한지와 아키텍처에 영향을 받으며, Thread 속성으로 바꿀 수도 있다. Stack 확장이 한도에 도달하면 `SIGSEGV`가 발생할 수 있다. 모든 Stack 손상이 반드시 Guard Page에서 즉시 잡힌다는 뜻은 아니다. [Thread의 기본 Stack 크기](https://man7.org/linux/man-pages/man3/pthread_create.3.html), [Stack 자원 한도](https://man7.org/linux/man-pages/man2/getrlimit.2.html)

## malloc과 OS 사이의 경계

`malloc(size)`는 요청을 담을 블록을 할당기에서 받는 함수다. 이미 확보한 빈 블록으로 요청을 처리할 수도 있으므로 호출할 때마다 시스템 호출이 필요한 것은 아니다. `free(ptr)`도 먼저 할당기 관점의 반환이며, 항상 즉시 Mapping을 없애거나 프로세스의 메모리 사용량을 같은 크기만큼 줄이지는 않는다.

Linux의 `brk()`는 데이터 영역 끝을 나타내는 **Program Break**를 바꾼다. `sbrk()`는 증가량으로 이 위치를 조정하는 라이브러리 함수이며, Linux에서는 내부적으로 `brk()`를 사용한다. 일반 응용 프로그램은 이 경계를 직접 조작하기보다 `malloc()` 같은 할당 인터페이스를 사용한다. [Program Break와 `sbrk()`](https://man7.org/linux/man-pages/man2/brk.2.html)

별도의 [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/)을 얻는 `mmap()` 경로도 있다. glibc의 할당기는 요청 크기와 기존 빈 공간, Arena와 설정에 따라 경로를 고른다. `M_MMAP_THRESHOLD`의 초기값 128 KiB는 ‘그 이상이면 반드시 mmap’이라는 고정 규칙이 아니다. 기존 빈 블록에서 요청을 처리할 수 있고, 기본 동작에서는 임계값도 할당·해제 이력에 따라 조정된다. [glibc의 mmap 임계값](https://man7.org/linux/man-pages/man3/mallopt.3.html)

따라서 `malloc(256 * 1024)`만 보고 정확한 시스템 호출을 단정할 수 없다. 어떤 할당기를 쓰는지, 재사용할 공간이 있는지, 임계값과 Arena 상태가 어떤지 알아야 한다. 실제 호출 경로를 확인하려면 해당 환경에서 추적해야 한다. 독립된 큰 Mapping은 해제할 때 개별적으로 반환하기 쉽지만, Program Break로 얻은 영역의 중간 블록은 비어도 끝을 바로 줄일 수 없다. 재사용을 위해 보유하는 정책도 OS 반환 시점에 영향을 준다.

Stack을 ‘빠르고 단편화가 없는 공간’, Heap을 ‘느리지만 무제한인 공간’으로 나누는 설명도 거칠다. Stack의 연속적인 Frame 관리는 단순하지만 호출·정렬·페이지 확보 비용까지 사라지는 것은 아니다. Heap에는 탐색·동기화·단편화 비용이 있으나 이미 준비한 블록을 빠르게 재사용하는 경로도 있다. 두 공간 모두 환경의 한도 안에서 사용한다. 블록의 분할과 병합, 재할당 실패 시 내용 보존은 [메모리 관리](/wiki/computer-systems-network-topic-d160fea60072/)에서 다룬다.

## PintOS의 Kernel은 어느 주소에 놓이는가

[lrn-pintos `9d1b14c`](https://github.com/woonyong-kr/lrn-pintos/tree/9d1b14cbdf41425ba8867af743c03cf32190ee9b)의 상수와 Linker Script를 함께 읽으면 파일의 로드 위치와 실행 주소를 구분할 수 있다.

| 기준 | 값 | 의미 |
|---|---|---|
| `KERN_BASE` | `0x8004000000` | Kernel 직접 Mapping의 기준: 512 GiB + 64 MiB |
| `LOADER_PHYS_BASE` | `0x200000` | Kernel 이미지의 물리 로드 주소: 2 MiB |
| Kernel Text VMA | `0x8004200000` | `KERN_BASE + LOADER_PHYS_BASE` |
| `USER_STACK` | `0x47480000` | 초기 User Stack의 상단 |
| `PGSIZE` | `0x1000` | 일반 페이지 크기: 4 KiB |

[`kernel.lds.S`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/kernel.lds.S)는 현재 위치를 `LOADER_KERN_BASE + LOADER_PHYS_BASE`로 정하고 `.text`에 `AT(LOADER_PHYS_BASE)`를 지정한다. VMA는 실행할 때의 주소, LMA는 이미지를 적재할 주소다. 따라서 Kernel Text의 `0x8004200000`에서 기준을 빼면 `0x200000`이 된다. `0x4200000`이 아니다.

[`paging_init(mem_end)`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/init.c#L178)는 `pa < mem_end`인 페이지마다 `pa + KERN_BASE`에 Mapping을 구성한다. 마지막 `KERN_BASE + mem_end`는 포함하지 않는다. `start`부터 `_end_kernel_text` 전까지 PTE의 W를 내리고, 나머지는 P·W를 설정한다. User 접근을 허용하는 U는 leaf PTE에 넣지 않는다. Supervisor 쓰기의 실제 제한에는 CR0.WP 같은 CPU 설정도 관계되므로, PTE의 W가 0이라는 사실과 모든 Kernel 쓰기가 차단됐다는 판단은 구분한다. 직접 Mapping에 들어간 주소라고 해서 모두 `palloc`이 할당할 수 있는 RAM인 것도 아니다.

### User 주소 판별만으로 Mapping을 보장할 수는 없다

`is_user_vaddr(va)`는 `va < KERN_BASE`만 검사한다. 이 조건은 Mapping의 존재, 버퍼 전체의 범위, User 접근 권한까지 확인하지 않는다. ELF의 적재 주소는 Program Header에서 읽고, `validate_segment()`가 범위와 크기 등을 검사한다. `0x400000`부터 고정된 크기의 모든 영역을 항상 코드로 채우는 구조가 아니다. 초기 Stack 페이지는 `0x4747f000`에서 시작하지만 이후 성장과 Mapping 정책은 별도 구현에 달려 있다. [주소 매크로](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/vaddr.h), [ELF와 Stack 준비](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c)

Page Table 구현에는 더 좁은 가정도 있다. `KERN_BASE`는 PML4[1] 아래의 PD[32]에서 시작한다. `0x8000000000`처럼 `KERN_BASE`보다 작으면서 PML4 index가 1인 값도 있지만, 현재 `pml4_destroy()`는 PML4[0] 아래만 해제한다. `pml4_create()`는 `base_pml4`의 상위 엔트리를 복사해 Kernel 쪽 하위 테이블을 공유한다. 따라서 단순 주소 비교를 통과한 모든 값을 독립적인 User Mapping에 안전하게 쓸 수 있다고 일반화하면 안 된다. 허용할 범위를 넓히려면 생성·공유·해제의 가정부터 함께 맞춰야 한다. 이는 현재 코드의 경계에 대한 검토이며, 해당 범위에 Mapping을 만들어 실행한 결과는 아니다. [Page Table의 생성·조회·해제](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/mmu.c)

### main이 시작되기 전에 준비되는 것

`main()`에 도달했을 때 하드웨어 Paging은 이미 켜져 있다. `start.S`는 PAE와 임시 테이블을 준비하고 CR3를 설정한 뒤 EFER.LME·CR0.PG와 Segment 전환을 통해 64비트 실행을 시작한다. 이 부트 테이블은 2 MiB 페이지를 사용한다. 사용자 페이지의 지연 적재와 교체를 담당하는 SPT·VM 초기화가 끝났다는 뜻은 아니다. [부트 주소 변환](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/start.S)

`entry_64`가 정하는 초기 RSP는 `KERN_BASE + 0x1000`이다. `call`이 8바이트 반환 주소를 저장하면 `0x8004000ff8`이 되며, 이후 함수의 Prologue와 다른 호출에 따라 더 움직인다. `thread_init()`은 현재 Kernel RSP를 페이지 시작으로 내려 최초 Thread를 등록한다. 최초 Thread를 새 페이지에 할당하는 흐름이 아니다. `main()`은 이어서 `palloc_init() → malloc_init() → paging_init(mem_end)`를 실행한다. 마지막 단계가 `base_pml4`를 만들고 `pml4_activate(NULL)`로 활성화한다. [최초 Thread](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c), [초기화 순서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/init.c#L76)

다음 예제는 주소 형태와 상수의 산술 관계를 비교한다. MMU나 부팅을 실행하지 않으며, `after_call`은 호출 직후 한 순간만 계산한 값이다.

```run-python
U64 = (1 << 64) - 1
KERN_BASE, PAGE = 0x8004000000, 4096

def canonical(address, bits):
    if not 0 <= address <= U64 or bits not in (48, 57):
        return False
    upper = address >> bits
    expected = (1 << (64 - bits)) - 1 if address & (1 << (bits - 1)) else 0
    return upper == expected

for address in (0x7fffffffffff, 0x800000000000,
                0xffff7fffffffffff, 0xffff800000000000):
    print(f'{address:016x}: 48-bit={canonical(address, 48)}, '
          f'57-bit={canonical(address, 57)}')

kernel_text_pa = 0x200000
kernel_text_va = KERN_BASE + kernel_text_pa
assert canonical(KERN_BASE, 48)
assert kernel_text_va - KERN_BASE == kernel_text_pa
print(f'kernel_text: VA={kernel_text_va:#x}, PA={kernel_text_pa:#x}')
print('KERN_BASE:', KERN_BASE // (1 << 30), 'GiB +',
      KERN_BASE % (1 << 30) // (1 << 20), 'MiB')

stack_top = KERN_BASE + PAGE
after_call = stack_top - 8
print(f'boot_stack: top={stack_top:#x}, after_call={after_call:#x}, '
      f'page={after_call & -PAGE:#x}')
assert after_call & -PAGE == KERN_BASE
candidate = 0x8000000000
print(f'candidate={candidate:#x}: below_KERN_BASE={candidate < KERN_BASE}, '
      f'PML4_index={(candidate >> 39) & 511}')
assert candidate < KERN_BASE and ((candidate >> 39) & 511) == 1
assert not canonical(-1, 48) and not canonical(1 << 64, 48)
```

Python 3.9.6에서 실행한 결과다.

```text
00007fffffffffff: 48-bit=True, 57-bit=True
0000800000000000: 48-bit=False, 57-bit=True
ffff7fffffffffff: 48-bit=False, 57-bit=True
ffff800000000000: 48-bit=True, 57-bit=True
kernel_text: VA=0x8004200000, PA=0x200000
KERN_BASE: 512 GiB + 64 MiB
boot_stack: top=0x8004001000, after_call=0x8004000ff8, page=0x8004000000
candidate=0x8000000000: below_KERN_BASE=True, PML4_index=1
```

48비트 조건에서 제외된 두 주소가 57비트 조건에서는 형태 검사를 통과한다. 실제 접근 가능 여부는 여전히 활성화한 Paging 방식과 Mapping에 달려 있다. 마지막 줄은 `is_user_vaddr`에 해당하는 비교와 PML4 index가 같은 경계를 표현하지 않는다는 점을 보여 준다.

## PintOS에서 같은 차이를 읽는다

[PintOS `5afaa6d`의 Thread 구조](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/thread.h)에서는 4 KiB 페이지 하나를 `struct thread`와 Kernel Stack이 함께 사용한다. 구조체는 낮은 쪽에 놓이고 Stack은 페이지 끝에서 아래로 자란다. 따라서 **실제로 쓸 수 있는 Kernel Stack은 4 KiB보다 작다.** 구조체 크기는 빌드 구성과 필드에 따라 달라진다.

`struct thread` 끝쪽의 `magic`은 손상을 알아차리는 보조 수단이다. [`thread_current()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L392)는 현재 Thread를 구한 뒤 Magic과 실행 상태를 검사한다. Stack이 구조체를 침범해 Magic을 바꾸면 이 검사에서 잡힐 수 있지만, 모든 Overflow를 잡는 Guard Page와 같지 않다. 다른 잘못된 쓰기도 Magic을 손상할 수 있다.

User Stack은 이 Kernel Stack과 별개다. 이 저장소는 `USER_STACK`을 `0x47480000`으로 정의하며, 사용자 프로그램의 Stack을 그 아래에 준비한다. 초기 Stack에 넣는 내용은 [인자 전달](/wiki/computer-systems-network-topic-1217820258bd/)에서, Project 3의 Fault 기반 성장 조건은 [Page Fault](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에서 확인할 수 있다. 이 주소와 성장 규칙을 일반적인 Linux 기본값으로 옮겨 해석하지 않는다.

Kernel 함수에서 큰 지역 배열이 필요하다면 제한된 Stack을 얼마나 차지하는지 먼저 확인한다. 수명이 호출 범위를 넘거나 크기가 크면 `malloc()` 또는 `palloc_get_page()` 같은 동적 할당을 고려하고, 성공 여부와 반환 책임을 함께 처리한다. 이 PintOS의 Kernel `malloc()`은 `palloc` 위에서 작은 블록과 Arena를 관리한다. 사용자 프로그램의 `malloc()`이 같은 함수를 직접 호출한다고 보면 안 된다.

이 저장소의 시스템 콜 목록에는 `brk`나 `sbrk`가 없다. VM 빌드의 `mmap()`은 유효한 파일 fd와 파일 offset을 받아 매핑하며, Linux의 익명 Mapping과 같은 API가 아니다. 따라서 User Heap을 설명하면서 Linux의 `brk`·`mmap`이나 PintOS의 Kernel `malloc()`을 그대로 대응시키지 않는다. [시스템 콜 목록](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/lib/syscall-nr.h), [파일 기반 mmap의 입력 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c#L404-L435)

작은 블록을 묶는 Descriptor와 Arena, 페이지를 추적하는 Pool·Bitmap의 구체적인 구현은 [메모리 관리](/wiki/computer-systems-network-topic-d160fea60072/)에 정리되어 있다. Kernel Pool과 User Pool은 예약 영역 등을 제외하고 할당에 사용할 물리 메모리를 나누며, 시스템 RAM 전체를 단순히 반씩 가진다는 뜻은 아니다. 두 Pool을 나누면 사용자 페이지 요청이 Kernel Pool을 직접 소진하는 일을 제한할 수 있지만, 모든 Kernel 할당의 성공을 보장하지는 않는다.
