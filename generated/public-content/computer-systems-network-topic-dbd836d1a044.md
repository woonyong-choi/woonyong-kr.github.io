---
layout: default
title: Paging
nav_order: 4
permalink: /wiki/computer-systems-network-topic-dbd836d1a044/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-dbd836d1a044
projection_sha256: 721476767e342725ae30e0977cb67107392bce6c6bed597c6ff29991f4ab7673
parent: 메모리 관리
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-d160fea60072
search_terms:
- 페이징
- CR3
- PCID
- TLB Flush
- 주소 공간 전환
- pml4_create
- pml4_get_page
- pml4_clear_page
- pml4_destroy
- pml4e_walk
- Page Table 생성과 해제
- 명시적 Page Table Walk
grand_parent: OS
ancestor: CS 기초
---

# Paging
{: .no_toc }

## 가상 페이지와 물리 Frame을 연결한다

Paging은 가상 주소 공간을 페이지로 나누고 각 페이지를 물리 Frame에 연결한다. 페이지 크기가 4 KiB라면 주소의 하위 12비트는 페이지 안의 offset이고 나머지는 어느 페이지인지 구분하는 데 쓰인다. 연속된 가상 페이지가 물리적으로도 연속된 Frame을 사용해야 하는 것은 아니다.

Page Table에는 주소뿐 아니라 접근 권한과 상태도 들어간다. 프로세스마다 같은 숫자의 User VA를 서로 다른 Frame에 연결할 수 있고, 한 Frame을 여러 VA로 볼 수도 있다. 후자는 공유 메모리나 파일 Mapping뿐 아니라 Kernel이 사용자 메모리에 접근하는 구조를 이해할 때도 필요하다.

## 주소의 어느 비트로 테이블을 고르는가

x86-64의 4단계 Paging에서 4 KiB 페이지를 찾을 때는 VA의 36비트를 9비트씩 나눠 네 테이블의 index로 사용한다. 각 테이블에는 8바이트 엔트리 512개가 들어가므로 테이블 자체의 크기는 4 KiB다. 엔트리 하나가 담당하는 가상 주소 범위는 단계마다 다르다.

| 필드 | VA 비트 | PintOS 계산 | 한 엔트리의 범위 | 테이블 전체의 범위 |
|---|---|---|---|---|
| PML4 index | 47:39 | `(va>>39)&0x1ff` | 512 GiB | 256 TiB |
| PDPT index | 38:30 | `(va>>30)&0x1ff` | 1 GiB | 512 GiB |
| PD index | 29:21 | `(va>>21)&0x1ff` | 2 MiB | 1 GiB |
| PT index | 20:12 | `(va>>12)&0x1ff` | 4 KiB | 2 MiB |
| Page offset | 11:0 | `va&0xfff` | 페이지 안의 바이트 위치 | 0~4,095 |

`0x1ff`는 9비트가 모두 1인 511이다. index는 항상 0~511이며 1은 두 번째 엔트리를 뜻한다. 예를 들어 상위 index들이 0인 PD[2]의 범위는 `0x400000~0x5fffff`이고, PT[2]는 `0x2000~0x2fff`를 담당한다. 마지막 PD[511]은 `0x3fe00000~0x3fffffff`, 마지막 PT[511]은 `0x1ff000~0x1fffff` 범위다. [PintOS의 index 매크로](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/pte.h)

이 표는 4단계 주소 변환을 전제로 한다. 64비트 값 모두를 독립적인 VA로 사용하는 것은 아니다. 이 모드의 canonical 주소는 상위 16비트가 bit 47의 부호 확장이며, 그 조건을 어기는 값을 네 index로 나눴다고 해서 유효한 주소가 되지는 않는다. 주소 비트 조건을 만족하는 것과 실제 Mapping·접근 권한이 있는 것도 별개의 조건이다.

### 같은 주소를 분해하고 다시 조립한다

다음 코드는 index와 offset을 구한 뒤 원래 주소를 다시 조립한다. PintOS의 `KERN_BASE=0x8004000000`, User Stack 바로 아래의 `0x4747f000`, 여러 테이블 범위를 선택하는 주소를 같은 방식으로 계산한다. 실제 Page Table이나 MMU를 실행하는 모형은 아니다.

```run-python
PAGE, MASK = 4096, 4095
SHIFTS = (39, 30, 21, 12)
U64 = (1 << 64)-1

def canonical48(address):
    sign = (address >> 47) & 1
    return 0 <= address <= U64 and address >> 48 == (0xffff if sign else 0)

def split(address):
    assert canonical48(address)
    return tuple((address >> shift) & 0x1ff for shift in SHIFTS)+(address & MASK,)

def join(fields):
    address = sum(index*(1 << shift) for index,shift in zip(fields[:4],SHIFTS))+fields[4]
    if address & (1 << 47):
        address |= U64 ^ ((1 << 48)-1)
    return address

addresses = [0x08048123, 0x8004000000, 0x4000000000,
             0x4747f000, 0x4000401000, 0x4001a03c,
             0xffff800000000123]
print('VA                 PML4 PDPT PD  PT  offset')
for address in addresses:
    fields = split(address)
    assert all(0 <= index < 512 for index in fields[:4])
    assert join(fields) == address
    print(f'{address:016x}', *[f'{index:4d}' for index in fields[:4]], f'{fields[4]:03x}')
assert split(0x08048123) == (0,0,64,72,0x123)
assert split(0x8004000000) == (1,0,32,0,0)
assert not canonical48(0x0000800000000000)

address = 0x4001a03c
base = address & ~MASK
rounded_up = (address+MASK) & ~MASK
print(f'page_number={address>>12:x} down={base:x} up={rounded_up:x}')
assert ((base+MASK) & ~MASK) == base
# Independent entry arithmetic: assume a 52-bit physical address field and NX bit.
physical_mask = ((1 << 52)-1) & ~MASK
pte = (1 << 63) | 0x12345000 | 7
physical = (pte & physical_mask) | (address & MASK)
assert physical == 0x1234503c
print(f'pte={pte:016x} frame={pte & physical_mask:x} physical={physical:x}')
print(f'PT base=3000 index=1 entry_address={0x3000+8*1:x}')

start, remaining = 0x40000ffe, 4
chunks = []
while remaining:
    count = min(remaining,PAGE-(start & MASK))
    chunks.append((hex(start),count))
    start += count
    remaining -= count
assert chunks == [('0x40000ffe',2),('0x40001000',2)]
print('page_chunks',chunks)
print('remaining_at_offset_300',PAGE-0x300)
print('fully_populated_table_bytes',[PAGE*512**level for level in range(4)])
```

Python 3.9.6에서 실행한 결과다.

```text
VA                 PML4 PDPT PD  PT  offset
0000000008048123    0    0   64   72 123
0000008004000000    1    0   32    0 000
0000004000000000    0  256    0    0 000
000000004747f000    0    1   58  127 000
0000004000401000    0  256    2    1 000
000000004001a03c    0    1    0   26 03c
ffff800000000123  256    0    0    0 123
page_number=4001a down=4001a000 up=4001b000
pte=8000000012345007 frame=12345000 physical=1234503c
PT base=3000 index=1 entry_address=3008
page_chunks [('0x40000ffe', 2), ('0x40001000', 2)]
remaining_at_offset_300 3328
fully_populated_table_bytes [4096, 2097152, 1073741824, 549755813888]
```

`0x08048123`의 PD index는 64이고 PT index는 72다. KERN_BASE는 PML4[1] 아래의 PDPT[0]·PD[32]에서 시작한다. `0x4747f000`도 같은 9비트 마스크로 계산하므로 PD index가 511을 넘을 수 없다. 주소를 조립하는 검산은 index 값과 비트 위치를 함께 확인하는 방법이다.

### 엔트리의 주소와 엔트리에 저장된 주소

CR3는 현재 루트 테이블의 물리 주소와 제어 정보를 담는다. 그 루트에서 PML4E, PDPTE, PDE가 다음 테이블의 주소를 제공하고, 마지막 PTE가 데이터 Frame의 주소를 제공한다. 각 단계에서 읽는 **엔트리 자체의 주소**와 그 엔트리에 **저장된 다음 주소**를 구별해야 한다. PT의 물리 시작이 `0x3000`이고 PT index가 1이면 PTE가 놓인 물리 위치는 `0x3008`이다. 그 위치의 8바이트 값에 들어 있는 Frame 주소가 최종 변환에 쓰인다.

현재 PintOS의 소프트웨어 조회는 `pml4_get_page → pml4e_walk → pdpe_walk → pgdir_walk`로 이어진다. 별도의 `pt_walk()`를 호출하지 않는다. 마지막 `pgdir_walk()`가 `ptov(PTE_ADDR(pdp[idx])+8*PTX(va))`로 PTE를 읽고 쓸 Kernel 포인터를 반환한다. `pml4e_walk()`의 반환값이 NULL이 아니어도 최종 PTE의 P 비트가 0일 수 있다. [조회와 Mapping 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

`create=0`에서 중간 테이블이 없으면 조회는 NULL을 반환한다. `create=1`이면 `PAL_ZERO`로 필요한 테이블을 확보하고 그 물리 주소와 P·W·U 비트를 상위 엔트리에 기록한다. `pml4e_walk()`와 `pdpe_walk()`는 이번 호출에서 새 테이블을 만들었는지 `allocated`로 기억한다. 하위 조회가 실패했을 때만 그 새 페이지를 회수하고 엔트리를 0으로 되돌린다. 이미 있던 테이블까지 함께 해제하는 절차가 아니다. 테이블 페이지를 만든 것과 사용자의 데이터 Frame을 확보한 것도 서로 다른 할당이다.

PTE에는 주소뿐 아니라 권한과 접근 기록도 들어간다. 아래에서는 주소 필드를 먼저 분리하고, Mapping이 만들어진 뒤 P·W·U·A·D를 어떻게 읽는지 살펴본다.

### 주소 비트와 상태 비트의 경계

다음 표는 **일반적인 x86-64 Paging의 4 KiB leaf PTE**를 읽는 기준이다. M은 해당 환경에서 사용하는 물리 주소 폭이다. 상위 엔트리나 큰 페이지에는 그대로 적용하지 않는다.

| 비트 | 용도 |
|---|---|
| 0 | P: 이 엔트리를 통한 변환을 허용하는 Present 비트 |
| 1·2 | R/W·U/S: 쓰기와 User 접근 조건 |
| 3·4 | PWT·PCD: PAT 등과 함께 메모리 유형을 결정하는 비트 |
| 5·6 | A·D: 접근과 쓰기의 기록 |
| 7 | PAT: 메모리 유형 선택에 사용 |
| 8 | G: CR4.PGE=1일 때 주소 공간 전환에서도 재사용할 수 있는 Global 변환을 표시 |
| 9–11 | 일반적인 Paging에서 하드웨어가 무시하는 영역 |
| 12–(M−1) | 4 KiB Frame의 물리 시작 주소 |
| M–51 | M<52이면 예약 영역이며 0이어야 함 |
| 52–58 | 하드웨어가 무시하는 영역 |
| 59–62 | CR4.PKE 또는 PKS가 활성화된 경우 접근 제어에 쓰는 protection key |
| 63 | EFER.NXE=1이면 NX(XD). 이 비트가 1이면 명령어 가져오기를 금지하며, NXE=0이면 예약 비트 |

PWT·PCD 하나만 보고 실제 메모리가 항상 특정 Cache 정책을 따른다고 단정하지 않는다. 비트 7도 마지막 PTE에서는 PAT지만, 큰 페이지를 가리키는 PDPTE·PDE에서는 PS다. 이 큰 페이지의 leaf 엔트리에는 D도 의미가 있다. 다음 테이블을 가리키는 nonleaf의 bit 6과 구별한다. [Intel SDM 092, Vol. 3A §5.5와 Table 5-16~5-20](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=138)

상위 상태 비트가 없는 단순한 예로 `PTE=0x0000000012345067`을 읽어 보자. Frame 시작은 `0x12345000`, 하위 플래그는 `0x067`이다. `0x067=0x040+0x020+0x004+0x002+0x001`이므로 D·A·U·W·P가 켜져 있다. 이 PTE에 연결된 VA가 `0x8048123`이면 offset은 `0x123`이고 최종 PA는 `0x12345123`이다. **PTE의 하위 12비트는 플래그이고 VA의 하위 12비트는 페이지 안의 위치**라는 차이를 읽는 계산이다. 실제 메모리 관측값은 아니다.

PintOS의 `PTE_ADDR()`와 `pte_get_paddr()`는 하위 12비트를 지운다. NX까지 들어 있는 PTE에서는 이것만으로 주소를 추출할 수 없어, 앞의 실행 예제는 물리 주소 폭을 52비트로 가정해 마스크를 만들었다. 현재 `pte.h`의 `PTE_ADDR_MASK`에는 `0xffffffffffffff000UL`이라는 17자리 리터럴이 남아 있다. 64비트에서 하위 12비트만 지우려는 값은 `0xfffffffffffff000ULL`이지만, 이 값도 NX 등을 분리하는 완전한 물리 주소 마스크는 아니다. 현재 조회 코드가 사용하는 것은 `PTE_ADDR()`이며 `PTE_ADDR_MASK`의 사용처는 선언 외에 확인되지 않는다. `PTE_AVL=0x00000e00`은 bit 9–11을 가리킨다. [PintOS의 비트 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/pte.h#L41)

### 필요한 하위 테이블만 만든다

사용하지 않는 주소 범위의 하위 테이블까지 미리 만들 필요는 없다. 4 KiB 페이지로 4단계의 모든 엔트리를 채운다는 가정에서는 PML4 1개, PDPT 512개, PD 512²개, PT 512³개가 필요하다. 테이블별 총 저장량은 각각 4 KiB, 2 MiB, 1 GiB, 512 GiB다. 실제 프로세스의 측정값이 아니라 전체 공간을 빠짐없이 채웠을 때의 계산이며 데이터 Frame의 비용은 포함하지 않는다.

큰 페이지는 중간 단계에서 Frame을 직접 가리켜 더 아래의 테이블을 생략한다. 지원되는 하드웨어에서 PDPTE의 PS=1은 1 GiB 페이지와 30비트 offset, PDE의 PS=1은 2 MiB 페이지와 21비트 offset을 사용한다. 일반 4 KiB Mapping은 마지막 PTE까지 내려가 12비트 offset을 붙인다. Frame도 선택한 페이지 크기로 정렬되어야 한다.

PintOS의 **부트 초기 Mapping과 일반 Mapping은 여기서 다르다**. [`start.S`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/start.S)는 PDE에 `PTE_P|PTE_W|0x180`을 기록하고, 2 MiB 간격의 물리 주소를 두 PD에 각각 128개 PDE로 연결한다. 두 범위가 같은 물리 영역을 별칭으로 가리킨다. PS가 켜진 부트 Mapping이다. 이후 [`paging_init()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/init.c)은 PGSIZE 간격으로 일반 테이블을 구성한다. 현재 `mmu.c`의 walk에는 PS를 읽고 조기에 종료하는 분기가 없으므로, 이 조회 함수를 부트의 큰 페이지 테이블에도 그대로 사용할 수는 없다.

Linux는 공통 계층을 `PGD → P4D → PUD → PMD → PTE`로 표현한다. x86의 4단계 구성에서는 P4D가 접히고 PGD가 PML4에 해당하며, PUD는 PDPT, PMD는 PD에 해당한다. 5단계 구성에서는 57비트 가상 주소를 사용하고 비트 56:48이 PML5 index가 된다. 이때 Linux의 PGD는 PML5, P4D는 PML4에 해당한다. 엔트리를 찾는 `*_offset()`·`pte_offset_*()`과 상태를 바꾸는 PTE helper를 구별해 읽는다. Linux 6.16의 `pte_mkwrite()`·`pte_wrprotect()`는 쓰기, `pte_mkyoung()`·`pte_mkold()`는 접근, `pte_mkdirty()`·`pte_mkclean()`은 dirty 상태를 다룬다. [x86 PTE helper](https://github.com/torvalds/linux/blob/v6.16/arch/x86/include/asm/pgtable.h) [Linux Page Table 계층과 folding](https://docs.kernel.org/6.16/mm/page_tables.html), [x86 5단계 Paging](https://docs.kernel.org/6.16/arch/x86/x86_64/5level-paging.html)

Linux HugeTLB는 지원되는 크기의 큰 페이지를 별도 Pool에서 관리한다. `/proc/meminfo`의 `HugePages_Total`만 보고 1 GiB 페이지 수라고 읽으면 안 된다. `Hugepagesize`는 기본 크기이고 크기별 Pool은 `/sys/kernel/mm/hugepages`에서 구별한다. PMD 크기의 THP는 애플리케이션이 HugeTLB Pool을 직접 지정하는 방식과 다르다. 큰 페이지는 TLB 부담을 줄일 수 있지만 연속된 물리 공간과 단편화 비용도 함께 고려한다. [HugeTLB의 크기별 Pool](https://docs.kernel.org/6.16/admin-guide/mm/hugetlbpage.html)

Windows의 일반 애플리케이션은 `GetLargePageMinimum()`으로 크기를 조회하고, 필요한 권한과 정렬을 갖춰 `VirtualAlloc(...,MEM_LARGE_PAGES,...)` 경로를 사용한다. `CreateFileMappingW`에서 `SEC_LARGE_PAGES|SEC_COMMIT`을 사용하는 경로도 있다. 이 경우 paging file이 backing이어야 하고, `SeLockMemoryPrivilege`와 large-page 크기에 맞는 객체·view 크기 및 정렬이 필요하다. 일반 데이터 파일이나 실행 이미지 Mapping에 같은 옵션을 적용하는 것은 아니다. [SEC_LARGE_PAGES의 조건](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-createfilemappingw) 특정 크기의 지원을 OS 이름만으로 단정하지 않는다. Kernel 내부 `_MMPTE`·`MiGetPteAddress`의 형태를 고정 API로 사용하는 대신, 디버거에서는 `!pte`가 보여 주는 PDE·PTE와 상태 비트를 대상 시스템에 맞춰 읽는다. [Windows Large Page](https://learn.microsoft.com/en-us/windows/win32/memory/large-page-support), [WinDbg !pte](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-pte)

## 테이블 생성과 Mapping 설치를 나누어 읽는다

PintOS의 `struct thread`에는 `uint64_t *pml4`라는 포인터가 들어 있다. 512개 엔트리 전체가 Thread 구조체에 포함되는 것은 아니다. [`pml4_create()`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/mmu.c)는 Kernel Pool에서 한 페이지를 얻고 `base_pml4`의 4 KiB를 그대로 복사해 그 포인터를 반환한다. 할당에 실패하면 NULL이다. `PAL_ZERO`를 사용하지 않아도 복사에 성공하면 512개 엔트리가 모두 덮어써진다.

새 루트를 만들었다고 User 데이터나 모든 하위 테이블까지 복제되는 것은 아니다. 복사한 엔트리는 기존 Kernel 하위 테이블을 계속 가리킨다. 따라서 공유 중인 하위 테이블의 엔트리를 바꾸는 것과 `base_pml4`의 루트 엔트리만 새 값으로 바꾸는 것은 효과가 다르다. 루트 한 칸을 교체했다고 이미 복사한 다른 루트의 값까지 저절로 바뀌지는 않는다. 이 레포의 Kernel 매핑은 PML4[1] 아래에서 시작한다. 256번부터의 상위 절반만 골라 복사하는 구현이 아니다. 구체적인 주소와 허용 범위는 [주소 공간](/wiki/computer-systems-network-topic-3521ee6344f1/)에서 확인한다.

이후 `pml4e_walk(pml4, va, create)`는 해당 VA가 사용할 **leaf PTE의 주소**를 찾는다. 중간 엔트리가 없고 `create=0`이면 NULL을 반환한다. `create=1`이면 필요한 테이블 페이지를 `palloc_get_page(PAL_ZERO)`로 확보한다. 마지막 PT까지 도달한 뒤 반환하는 PTE 칸은 아직 P=0일 수도 있다. PTE의 위치를 찾는 일과 데이터 Frame을 설치하는 일이 다른 이유다.

할당 실패도 단계별로 처리한다. `pdpe_walk()`와 `pml4e_walk()`는 이번 호출에서 하위 테이블을 새로 만들었는지 `allocated`로 기록한다. 더 아래의 탐색이 실패하면 이번에 만든 페이지를 반환하고 그 엔트리를 0으로 되돌린다. 이미 존재하던 하위 트리까지 지우는 처리는 아니다. [PintOS의 생성과 실패 정리](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/mmu.c#L11)

### 같은 페이지 수라도 필요한 테이블 수는 다르다

인접한 두 페이지는 PT 한 장을 공유할 수 있다. 두 주소가 서로 다른 2 MiB 구간에 놓이면 서로 다른 PT가 필요하고, 더 큰 경계를 넘으면 상위 테이블도 늘어난다. 각 배열의 512개 칸을 다 썼을 때 `next` 포인터로 연결하는 구조가 아니다. VA의 상위 index가 다른 하위 테이블을 고른다.

다음 예제는 빈 루트에서 지정한 주소를 4 KiB 페이지로 매핑할 때 필요한 테이블 수를 계산한다. 큰 페이지, 미리 만든 Kernel 매핑과 테이블 공유는 제외하며 데이터 Frame의 비용도 세지 않는다. 마지막 사례는 일반적인 4단계 주소 공간의 계산이다. PintOS가 그 주소를 독립적인 User 영역으로 지원한다는 뜻은 아니다.

```run-python
PAGE_SIZE = 4096


def table_pages(addresses):
    if any(not 0 <= address < (1 << 47) for address in addresses):
        raise ValueError("이 예제는 4단계 Paging의 낮은 canonical 주소만 받는다.")
    # 같은 상위 index를 사용하는 주소는 하위 테이블을 공유한다.
    return (1,) + tuple(len({address >> shift for address in addresses})
                        for shift in (39, 30, 21))


cases = [
    ("빈 루트", []),
    ("한 페이지", [0x1000]),
    ("인접한 두 페이지", [0x1000, 0x2000]),
    ("서로 다른 2 MiB 구간", [0x1000, 0x201000]),
    ("서로 다른 1 GiB 구간", [0x1000, 0x40001000]),
    ("서로 다른 512 GiB 구간", [0x1000, 0x8000001000]),
]
for label, addresses in cases:
    counts = table_pages(addresses)
    print(f"{label}: PML4/PDPT/PD/PT={counts}, 테이블={sum(counts) * PAGE_SIZE // 1024} KiB")

print(f"512 GiB 전체 매핑: 테이블={1 + 1 + 512 + 512**2} pages, 데이터={512**3} pages")

try:
    table_pages([1 << 47])
except ValueError as error:
    print(f"범위 검사: {error}")
```

Python 3.9.6에서 실행한 결과다.

```text
빈 루트: PML4/PDPT/PD/PT=(1, 0, 0, 0), 테이블=4 KiB
한 페이지: PML4/PDPT/PD/PT=(1, 1, 1, 1), 테이블=16 KiB
인접한 두 페이지: PML4/PDPT/PD/PT=(1, 1, 1, 1), 테이블=16 KiB
서로 다른 2 MiB 구간: PML4/PDPT/PD/PT=(1, 1, 1, 2), 테이블=20 KiB
서로 다른 1 GiB 구간: PML4/PDPT/PD/PT=(1, 1, 2, 2), 테이블=24 KiB
서로 다른 512 GiB 구간: PML4/PDPT/PD/PT=(1, 2, 2, 2), 테이블=28 KiB
512 GiB 전체 매핑: 테이블=262658 pages, 데이터=134217728 pages
범위 검사: 이 예제는 4단계 Paging의 낮은 canonical 주소만 받는다.
```

주소가 두 개라는 조건은 같아도 테이블 저장량은 16 KiB에서 28 KiB까지 달라진다. 반대로 루트만 있고 매핑이 없으면 루트의 4 KiB만 필요하다. 주소가 가리키는 데이터 Frame을 더하면 비용이 늘지만, 여러 VA가 같은 Frame을 공유할 수도 있으므로 주소 개수만으로 Frame 수까지 정하지 않는다. 출력의 512 GiB 전체 매핑은 4 KiB 데이터 페이지 512³개를 빈틈없이 붙이는 가정이다. 이때 테이블은 루트 1장, PDPT 1장, PD 512장, PT 512²장이다. 실제 PintOS의 사용량을 측정한 값은 아니다.

`pml4_create()`의 복사량이 4 KiB로 정해져 있다는 사실도 전체 실행 시간이 일정하다는 뜻은 아니다. [`palloc_get_multiple()`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/palloc.c#L291)은 Bitmap을 탐색한다. 이 경로를 확인하지 않고 할당을 O(1)로 가정하거나 고정된 Cycle 수를 붙이지 않는다.

### 32비트 Paging과 비교하기

전통적인 비PAE 32비트 x86에서 4 KiB 페이지는 `10(PD) + 10(PT) + 12(offset)`로 주소를 나눈다. 4바이트 Entry 1,024개가 4 KiB Table 하나에 들어간다. PAE를 사용한 32비트 구조에서는 최상위 4개와 아래 두 단계의 각 512개 Entry를 거치는 `2 + 9 + 9 + 12` 형태가 되며 Entry는 8바이트다. 따라서 “32비트는 항상 2단계”라고 일반화할 수 없다. 여기서 비교한 단계 수는 4 KiB 페이지의 경로이며 큰 페이지는 중간 단계에서 변환을 끝낼 수 있다. [Linux v6.12의 비PAE 구조](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/pgtable-2level_types.h), [PAE 구조](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/pgtable-3level_types.h)

### 같은 Mapping을 주소 값으로 확인하기

4 KiB 페이지와 현재의 4단계 변환에서 VA `0x400000`의 인덱스는 `0 / 0 / 2 / 0`이다. 초기 사용자 Stack Page의 주소 `0x4747f000`은 `0 / 1 / 0x3a / 0x7f`로 나뉜다. 앞의 주소 분해 예제에 값을 바꾸어 넣어 확인할 수 있다. Kernel VA `0x8004123000`은 이 PintOS의 `KERN_BASE=0x8004000000`을 빼면 PA `0x123000`이 된다. 사용자 VA에서 같은 뺄셈으로 Frame을 구하는 방식은 사용할 수 없다. VA `0x400000`을 PA `0x200000`에 연결했다고 가정하면 그 주소의 offset이 0이므로 접근할 PA도 `0x200000`이다. 인덱스 계산은 어느 PTE를 찾을지만 정하며, 그 PTE가 가리키는 Frame은 별도로 설치한 Mapping에 달려 있다.

`install_page()`는 이미 연결된 사용자 Page가 없는지 검사한 뒤 `pml4_set_page()`를 호출한다. 반면 하위 함수가 그 중복 검사를 모두 대신해 주지는 않는다. 호출자는 사용자 주소·Frame 주소의 Page 정렬과 `writable`을 확인해야 한다. 테이블을 만드는 `palloc_get_page(PAL_ZERO)` 중단점에는 다른 0 초기화 할당도 걸릴 수 있으므로, 호출 Stack과 `pml4_set_page()`의 인자를 함께 보아야 현재 Mapping을 위한 할당인지 알 수 있다. [Mapping 설치 함수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c), [Page Table 생성과 PTE 기록](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

## CR3의 주소 필드와 전환 조건

CR3에 넣는 것은 Kernel 포인터 자체가 아니라 최상위 테이블의 물리 주소와 제어 정보다. 4단계 Paging에서는 PML4, 5단계에서는 PML5가 루트다. 테이블은 4 KiB로 정렬하며 주소 필드는 해당 환경의 물리 주소 폭까지 사용한다. `& ~0xfff`만으로 모든 CPU 기능이 섞인 CR3에서 주소를 정확히 추출한다고 가정하지 않는다.

CR4.PCIDE=0이면 하위 비트 중 PWT·PCD가 테이블 접근의 메모리 유형에 관여한다. PCIDE=1이면 하위 12비트는 PCID다. PCID는 재사용할 주소 변환 문맥을 구별하며 PID나 PintOS의 tid와 같은 번호 체계가 아니다. LAM을 지원하는 구성에는 상위 제어 비트도 있으므로 사용하지 않는 상위 비트를 전부 같은 의미로 취급해서는 안 된다. [Intel SDM 092의 CR3 형식, Table 5-12·5-13](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=133)

| CR3를 쓰는 조건 | 요구되는 non-global 변환 무효화 |
|---|---|
| PCIDE=0 | PCID 0의 변환과 Paging-structure Cache를 무효화한다. |
| PCIDE=1, MOV 입력 bit 63=0 | 새로 선택하는 PCID의 변환과 Paging-structure Cache를 무효화한다. |
| PCIDE=1, MOV 입력 bit 63=1 | 이 명령 때문에 해당 Cache를 무효화할 의무가 없다. |

표의 bit 63은 **MOV 명령의 입력**에 지정하는 조건이다. CR3를 읽었을 때 남아 있는 ‘no-flush 상태 비트’가 아니다. CPU는 필요한 범위보다 많은 Cache 항목을 무효화할 수 있으므로 Global 변환이나 다른 PCID가 반드시 유지된다고 약속하는 표도 아니다. Global 변환에는 CR4.PGE 등의 조건이 있다. [Intel SDM의 명령별 무효화 규칙](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=161)

PintOS의 `pml4_activate(pml4)`는 NULL이면 `base_pml4`를 고른 뒤 `vtop()`으로 변환한 값을 `lcr3()`에 넘긴다. 같은 포인터인지 비교해 쓰기를 생략하는 분기는 없다. `process_activate(next)`는 그 뒤 TSS의 Kernel Stack을 갱신한다. 페이지 테이블을 바꾸는 것과 RIP·RSP 등의 실행 문맥을 복구하는 것은 서로 다른 작업이며, 공통 Kernel Mapping 덕분에 다음 주소 공간을 활성화한 뒤에도 Kernel 코드를 이어서 실행할 수 있다. [PintOS의 CR3 쓰기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/mmu.c), [활성화와 TSS](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L730)

종료 경로에서는 `curr->pml4 = NULL → pml4_activate(NULL) → pml4_destroy(old)` 순서를 지킨다. 먼저 Thread가 이전 테이블을 다시 선택하지 않게 하고, 현재 CPU가 기본 테이블을 사용하도록 바꾼 다음 이전 테이블을 해제한다. 현재 사용 중인 테이블을 먼저 반환하면 이후 주소 변환이 해제되거나 재사용된 메모리를 읽을 수 있다. 항상 같은 순간에 Triple Fault가 발생한다는 의미는 아니다. [현재 `process_cleanup()`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L697)

## TLB에 변환이 없다는 것과 페이지가 없다는 것

TLB(Translation Lookaside Buffer)는 최근 주소 변환을 재사용하는 CPU의 캐시다. 페이지 번호에서 Frame 번호를 찾는 데 그치지 않고, 그 변환의 접근 권한과 주소 공간 문맥도 다룬다. 따라서 **TLB Hit이어도 금지된 쓰기를 시도하면 Page Fault가 발생할 수 있다**. 캐시에 항목이 있다는 사실과 요청한 접근을 허용한다는 판단은 다르다. [Intel SDM의 TLB 정보와 사용 규칙](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=155)

| 접근 상황 | 이어지는 처리 |
|---|---|
| TLB Hit, 권한 허용 | 캐시한 변환을 사용한다. 실제 데이터는 별도의 Cache 계층에서 찾는다. |
| TLB Miss, Page Table에 유효한 변환과 권한이 있음 | x86 하드웨어가 변환을 구하고 이후 접근에 재사용할 수 있다. Miss 자체로 Page Fault가 발생하지는 않는다. |
| 캐시한 권한 또는 Page Table의 조건이 접근을 거부함 | Page Fault 정보를 커널에 전달한다. 복구 여부는 OS 정책과 해당 페이지의 상태에 달려 있다. |
| 변환 성공, 데이터 Cache Miss | 필요한 데이터를 하위 Cache나 RAM에서 가져온다. 데이터 Cache Miss만으로 디스크를 읽지는 않는다. |

4 KiB 페이지를 사용하는 4단계 구조에는 네 테이블의 논리적 조회가 있다. 그러나 이것이 매번 네 번의 DRAM 접근을 뜻하지는 않는다. 상위 변환을 기억하는 Paging-structure Cache가 일부 단계를 줄일 수 있고, 테이블 엔트리를 읽을 때도 CPU Cache가 관여한다. 큰 페이지는 더 일찍 Frame에 도달한다. 주소 변환과 데이터 접근을 구분해서 설명하되, 실제 CPU에서 두 처리가 언제나 완전히 직렬로 실행된다고 가정하지 않는다. [Intel SDM의 Paging-structure Cache](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=156)

명령어용 ITLB와 데이터용 DTLB를 나누고, 그 아래에 다른 TLB 계층을 두는 CPU도 있다. 엔트리 수, 연관도, 지원하는 페이지 크기는 CPU마다 다르다. 특정 모델을 확인하지 않은 채 ‘TLB는 항상 1 Cycle’이나 ‘4단계 Miss는 항상 1,000 Cycle’이라는 값을 사용하면 실제 병목을 잘못 짚게 된다. x86의 하드웨어 Walk와 달리 소프트웨어가 TLB 보충에 참여하는 아키텍처도 있다. [Linux의 TLB 구조와 비용 설명](https://docs.kernel.org/arch/x86/tlb.html), [소프트웨어 TLB 보충을 위한 인터페이스](https://docs.kernel.org/core-api/cachetlb.html)

### Set 수와 전체 엔트리 수를 나눠 계산한다

주소 폭이 14비트이고 페이지 크기가 64 B인 모형을 생각해 보자. offset은 6비트, VPN은 8비트다. `0x03D4`를 나누면 VPN은 15이고 offset은 20이다. 물리 주소 폭을 12비트로 정하면 Frame 번호는 6비트다. 페이지 단위 변환에서는 페이지 안의 offset이 유지된다.

4-way라는 말은 Set 하나에 엔트리가 네 개라는 뜻이다. **16 Set과 전체 16 Entry는 다른 구성**이다. VPN의 하위 비트를 Set index로 사용하는 모형에서는 다음과 같이 나뉜다.

| 가정한 구성 | 전체 엔트리 | Set 수 | Index 비트 | Tag 비트 | VPN 15의 Index / Tag |
|---|---:|---:|---:|---:|---|
| 16 Set, 4-way | 64 | 16 | 4 | 4 | 15 / 0 |
| 전체 16 Entry, 4-way | 16 | 4 | 2 | 6 | 3 / 3 |

다음 코드는 주소와 TLB 구성을 바꿔 계산할 수 있는 모형이다. 실제 CPU의 TLB를 조회하거나 지연 시간을 측정하지 않는다.

```run-python
VA_BITS, PA_BITS, PAGE_BITS = 14, 12, 6
address, frame_number = 0x03D4, 43
assert 0 <= address < 1 << VA_BITS
assert 0 <= frame_number < 1 << (PA_BITS - PAGE_BITS)

offset_mask = (1 << PAGE_BITS) - 1
vpn, offset = address >> PAGE_BITS, address & offset_mask
physical = (frame_number << PAGE_BITS) | offset
print(f"VPN={vpn}, offset={offset}, PA={physical:#x}")

for entries, ways in [(64, 4), (16, 4)]:
    assert entries > 0 and ways > 0 and entries % ways == 0
    sets = entries // ways
    assert sets & (sets - 1) == 0
    index_bits = sets.bit_length() - 1
    tag_bits = VA_BITS - PAGE_BITS - index_bits
    assert tag_bits >= 0
    index, tag = vpn & (sets - 1), vpn >> index_bits
    print(f"{entries} entries, {ways}-way: sets={sets}, "
          f"index_bits={index_bits}, tag_bits={tag_bits}, "
          f"index={index}, tag={tag}")
```

Python 3.9.6에서 실행한 결과다.

```text
VPN=15, offset=20, PA=0xad4
64 entries, 4-way: sets=16, index_bits=4, tag_bits=4, index=15, tag=0
16 entries, 4-way: sets=4, index_bits=2, tag_bits=6, index=3, tag=3
```

TLB가 한 번에 담당할 수 있는 주소 범위도 엔트리 수와 페이지 크기를 함께 봐야 한다. 동일 크기의 서로 다른 페이지를 각 엔트리가 하나씩 담는 모형에서 64 Entry × 4 KiB는 256 KiB, 1,536 Entry × 4 KiB는 6 MiB, 32 Entry × 2 MiB는 64 MiB다. 이는 세 가지 구성의 산술 예다. 실제 CPU가 모든 페이지 크기에 같은 용량을 제공하거나, 충돌 없이 그 범위를 모두 유지한다는 보장은 아니다.

평균 비용은 같은 범위의 비용을 정의한 뒤 계산한다. Hit 비용을 `H`, Miss 비용을 `M`, Hit 비율을 `h`로 두면 단순 모형의 평균은 `h×H+(1−h)×M`이다. 가령 변환 비용을 Hit 1, Miss 401이라는 가상 값으로 정하면 Hit 비율 99%에서는 5, 95%에서는 21이다. 이 계산에 실제 데이터 접근 비용이나 Page Fault 처리 시간을 섞으면 다른 모형이 된다.

## Page Table을 바꾼 뒤 남은 변환을 처리한다

메모리의 PTE를 수정해도 CPU가 이전 변환을 계속 사용할 수 있다. 특히 매핑을 제거하고 Frame을 다른 용도로 재사용하려면, 이전 주소로 그 Frame에 접근할 수 없도록 필요한 무효화를 마쳐야 한다. 단순히 시간이 지났다는 이유로 TLB 항목이 사라졌다고 가정해서는 안 된다. [Intel SDM의 무효화와 지연 조건](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=164)

x86에서는 `invlpg`로 주소에 해당하는 변환을 무효화하거나, CR3 전환과 `INVPCID`로 주소 공간 문맥을 다룬다. PCID가 꺼진 상태의 CR3 쓰기는 해당 문맥의 non-global 변환을 무효화한다. PCID를 사용하면 다른 주소 공간의 변환과 구분해 재사용할 수 있으며, CR3의 입력 비트와 명령에 따라 무효화 범위가 달라진다. Global 변환도 별도 조건을 갖는다. ‘CR3를 쓰면 모든 TLB가 반드시 비워진다’는 한 문장으로 묶을 수 없는 이유다. [Intel SDM의 명령별 무효화 범위](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=160)

여러 CPU가 같은 주소 공간을 사용했다면 다른 CPU에 남은 변환도 고려한다. TLB Shootdown은 이런 변경을 관련 CPU에 전달하는 작업이다. Linux는 주소 공간을 사용한 CPU 집합 등을 추적해 불필요한 무효화를 줄일 수 있다. 한 CPU에서 `invlpg`를 실행하는 것과 시스템 전체의 변경을 완료하는 것은 같지 않다. [Linux의 CPU별 무효화 범위](https://docs.kernel.org/core-api/cachetlb.html)

무효화 명령 자체의 비용뿐 아니라, 버린 항목을 다시 채우는 비용도 생긴다. 좁은 범위에는 페이지별 무효화가 유리할 수 있고, 넓은 범위에는 주소 공간 단위 처리가 더 적절할 수 있다. Linux의 선택은 범위와 CPU 구조, 이후 접근에 영향을 받는다. 고정된 100·200 Cycle로 우열을 정하지 않는다. Kernel Thread로 전환할 때 주소 공간을 당장 바꾸지 않는 Lazy TLB 처리와, PTI를 위해 User·Kernel Page Table을 전환하는 처리는 서로 다른 상황이다. PTI에서도 PCID 지원 여부가 재사용 비용에 영향을 준다. [Linux의 무효화 선택](https://docs.kernel.org/arch/x86/tlb.html), [PTI의 주소 공간 전환](https://docs.kernel.org/6.16/arch/x86/pti.html)

### PintOS의 세 경로를 구분한다

`lrn-pintos`의 `5afaa6d` 시점에서는 다음 세 경로를 별도로 읽어야 한다. 소스에 있는 연산을 확인한 것이며, 실제 부팅 중 무효화 횟수를 측정한 결과는 아니다.

| 경로 | 확인한 동작 |
|---|---|
| `schedule → process_activate → pml4_activate` | 대상 PML4의 물리 주소를 `lcr3()`에 넘긴다. |
| `pml4_clear_page` | Present를 내리고, 현재 CR3의 주소 공간이면 해당 User VA에 `invlpg`를 실행한다. |
| `pml4_set_page` | PTE를 기록하지만 이 함수 안에는 `invlpg`가 없다. 기존 문서의 ‘설치할 때도 항상 무효화한다’는 설명과 다르다. |

새로운 not-present 항목을 present로 만드는 경우와 기존 매핑·권한을 바꾸는 경우는 요구 조건이 다르다. 상위 호출자가 어느 상태의 PTE를 넘기는지까지 확인해야 한다. A·D 비트의 조회와 초기화 경로는 뒤의 ‘메모리의 비트와 Cache의 비트’에서 이어진다. [PintOS의 Mapping 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c), [Intel SDM의 선택적 무효화 조건](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=163)

Timer가 100 Hz이고 Time Slice가 4 Tick이라는 값만으로 Context Switch나 TLB Flush를 초당 25회 이하라고 계산할 수는 없다. `thread_block()`과 `thread_yield()`도 스케줄링을 일으킨다. 이 소스의 `schedule()`은 다음 Thread가 현재 Thread와 같은지 검사하기 전에 `process_activate(next)`를 호출하므로, CR3 쓰기 횟수와 서로 다른 Thread 사이의 전환 횟수도 그대로 일치하지 않는다. [PintOS의 스케줄링 경로](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c)

QEMU TCG의 Software TLB와 Host CPU의 TLB도 구별한다. QEMU v10.0.0의 `cpu_x86_update_cr3()`는 Guest Paging이 켜져 있으면 TCG의 `tlb_flush()`를 호출한다. 이것을 Host 하드웨어 TLB 전체를 비우는 동작으로 해석하지 않는다. Guest의 `invlpg`에도 별도의 TCG 처리 경로가 있다. 이 구분은 앞서 설명한 Guest VA·PA와 Host 메모리의 경계로 이어진다. [QEMU의 CR3 처리](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/helper.c), [Guest invlpg 처리](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/misc_helper.c)

### 같은 VA를 바꾸는 것과 남은 변환을 버리는 것

다음 모형에서 A와 B는 `0x8048123`을 서로 다른 Frame에 연결한다. Cache는 페이지 주소만으로 조회하고 CR3를 다시 쓰면 비운다. PCID·Global 페이지·권한·여러 CPU는 구현하지 않은 단순 모형이다. B의 Page Table만 수정한 직후와 해당 Cache 항목까지 버린 뒤의 출력을 비교해 보자.

```run-python
PAGE = 4096
tables = {
    0x41000: {0x8048000: 0x12345000},
    0x52000: {0x8048000: 0x23456000},
}
current = 0x41000
tlb = {}

def load_cr3(root):
    global current
    assert root in tables and root % PAGE == 0
    current = root
    tlb.clear()

def translate(address):
    page = address & -PAGE
    hit = page in tlb
    if not hit:
        if page not in tables[current]:
            raise LookupError('mapping missing')
        tlb[page] = tables[current][page]
    return tlb[page] + address % PAGE, hit

address = 0x8048123
pa, hit = translate(address)
print(f'A: PA={pa:#x}, hit={hit}')
assert (pa, hit) == (0x12345123, False)
assert translate(address) == (pa, True)
load_cr3(0x52000)
pa, hit = translate(address)
print(f'B: PA={pa:#x}, hit={hit}')
assert (pa, hit) == (0x23456123, False)

tables[current][address & -PAGE] = 0x34567000
stale, hit = translate(address)
print(f'PTE changed, cached PA={stale:#x}, hit={hit}')
assert stale == 0x23456123
tlb.pop(address & -PAGE, None)
fresh, hit = translate(address)
print(f'invalidated: PA={fresh:#x}, hit={hit}')
assert (fresh, hit) == (0x34567123, False)

load_cr3(current)
print('same CR3 reload clears model cache:', len(tlb) == 0)
try:
    translate(0x9000000)
except LookupError:
    print('unmapped page: rejected')
else:
    raise AssertionError('unmapped page must fail')
```

Python 3.9.6에서 실행한 결과다.

```text
A: PA=0x12345123, hit=False
B: PA=0x23456123, hit=False
PTE changed, cached PA=0x23456123, hit=True
invalidated: PA=0x34567123, hit=False
same CR3 reload clears model cache: True
unmapped page: rejected
```

B의 테이블을 수정해도 Cache에 남은 `0x23456123`이 먼저 반환된다. 해당 항목을 없앤 뒤에는 새 Frame의 `0x34567123`을 얻는다. 이 차이가 Page Table 수정과 TLB 무효화를 함께 다루는 이유다. 마지막 두 출력은 같은 루트를 다시 선택해도 이 모형은 Cache를 비우며, Mapping이 없는 페이지는 변환할 수 없다는 것을 확인한다. Python의 예외를 실제 CPU의 #PF 처리나 PintOS의 복구 절차로 해석하지 않는다.

## 페이지 안의 위치로 경계와 접근 범위를 계산한다

`pg_ofs(va)`는 offset, `pg_no(va)`는 `va>>12`로 페이지 번호를 얻는다. `pg_round_down()`은 페이지 시작으로 내리고, `pg_round_up()`은 현재 주소 이상인 가장 가까운 경계로 올린다. 이미 정렬된 주소는 그대로다. C의 고정 폭 정수에서는 올림에 사용하는 덧셈이 넘치지 않는 입력 범위도 확인해야 한다. [PintOS의 페이지 연산](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/vaddr.h)

VA `0x4001a03c`는 페이지 `0x4001a000` 안의 offset `0x3c`를 가리킨다. Frame 시작이 `0x12345000`이면 PA는 `0x1234503c`다. 페이지 크기만큼 정렬된 Frame에 offset을 더하므로 이 경우 덧셈과 OR의 결과가 같다. 같은 페이지 안의 주소들이 Frame을 공유한다는 것은 페이지 경계를 넘는 다음 바이트까지 같은 Frame에 있다는 뜻이 아니다.

offset이 `0x300`이면 현재 페이지에 남은 바이트 수는 `4096-768=3328`이다. 현재 [`copy_in()`·`copy_out()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c)는 매번 주소를 검증하고 `min(남은 전체 크기,PGSIZE-pg_ofs(user))`만 복사한다. 다음 페이지에서는 다시 검증한다. 첫 페이지가 유효하다는 사실만으로 버퍼 전체의 접근을 허용하지 않는 이유다.

버퍼의 시작과 마지막 주소가 모두 유효해도 그 사이의 페이지가 유효하다는 보장은 없다. 세 페이지 이상을 지나는 범위에서는 가운데 페이지의 Mapping이나 권한이 다를 수 있으므로, 양 끝만 검사하는 방식으로 페이지별 검사를 대신할 수 없다. 이 구현의 최초 검사 주소는 버퍼의 시작 주소이고, 다음 반복부터 페이지 경계로 이동한다. [실제 버퍼 순회](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c#L532-L558)

크기가 0인 버퍼가 차지하는 페이지 수는 0이다. 크기가 양수일 때의 페이지 수는 수학적으로 `floor((시작 offset + size - 1) / 4096) + 1`이며, 고정 폭 정수로 계산할 때는 먼저 입력 범위와 덧셈 Overflow를 확인해야 한다. `0x1FFF`부터 4,097바이트라면 마지막 바이트는 `0x2FFF`이고 끝 경계 `0x3000`은 포함되지 않는다. 따라서 `0x1000`과 `0x2000` 두 페이지에 걸친다.

예를 들어 시작 주소가 `0x08048ff0`, 크기가 `0x30`이면 끝 경계는 `0x08049020`이고 마지막 바이트는 그보다 1 작은 주소다. 첫 페이지에서 16바이트, 다음 페이지에서 32바이트를 다룬다. 다음 코드는 Python 정수로 페이지별 구간을 계산한다. 마지막 바이트가 64비트 주소 범위 안에 드는지 확인하며, C의 끝 포인터 연산까지 검증하는 것은 아니다. PintOS의 PTE 조회·복사나 접근 권한을 실행하는 모형은 아니며, 아래 페이지 수만으로 실제 검사 함수의 호출 횟수를 정할 수는 없다. 앞선 페이지의 검사나 준비가 실패하면 다음 페이지에 도달하지 못할 수 있고, 버퍼 순회 뒤 실제 복사에서 같은 페이지를 다시 검사하기도 한다.

```run-python
PAGE_SIZE = 4096
MAX_ADDRESS = (1 << 64) - 1


def buffer_chunks(start, size):
    if not 0 <= start <= MAX_ADDRESS or not 0 <= size <= (1 << 32) - 1:
        raise ValueError("주소 또는 크기가 입력 범위를 벗어납니다")
    if size == 0:
        return []
    if start == 0 or size - 1 > MAX_ADDRESS - start:
        raise ValueError("NULL 또는 주소 덧셈 Overflow입니다")
    chunks = []
    while size:
        page = start & ~(PAGE_SIZE - 1)
        length = min(size, PAGE_SIZE - (start - page))
        chunks.append((page, start, length))
        start += length
        size -= length
    return chunks


chunks = buffer_chunks(0x08048FF0, 0x30)
assert chunks == [(0x08048000, 0x08048FF0, 16), (0x08049000, 0x08049000, 32)]
assert buffer_chunks(0, 0) == []
assert buffer_chunks(0x1000, PAGE_SIZE) == [(0x1000, 0x1000, PAGE_SIZE)]
for start, size in [(0, 1), (MAX_ADDRESS, 2)]:
    try:
        buffer_chunks(start, size)
    except ValueError:
        continue
    raise AssertionError("잘못된 범위를 허용했습니다")
for page, address, length in chunks:
    print(f"Page {page:#x}: {address:#x}부터 {length}바이트")
print("페이지 수:", len(chunks), "전체 바이트:", sum(row[2] for row in chunks))
```

같은 내림 연산도 사용하는 목적은 다르다. SPT 검색은 fault 주소를 페이지 시작으로 정규화한다. `running_thread()`는 **Kernel Stack에서 실행 중인 RSP**가 `struct thread`와 같은 페이지에 놓인다는 배치 규칙을 이용한다. 임의의 User RSP를 내렸다고 Kernel의 thread 객체를 얻는 것은 아니다. Stack growth도 정렬만으로 허용하지 않는다. 현재 코드는 원래 fault 주소가 User Stack 최대 범위 안에 있고 기준 RSP의 32바이트 아래 이상인지 확인한 뒤 페이지를 확보한다. [SPT와 Stack growth](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c), [현재 Thread의 Stack 배치](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c)

TLB는 변환을 재사용하지만 VPN과 PFN 두 숫자만 저장하는 단순 표로 이해하면 부족하다. 접근 종류와 권한, 주소 공간의 문맥도 관계된다. QEMU 10.0의 TCG 코드도 MMU index와 읽기·쓰기·명령어 접근을 구분하고, RAM에 직접 접근할 수 있는 경로에서는 Guest VA에 `addend`를 더해 Host 포인터를 구한다. 모든 접근이 `mmu_translate()` 호출 하나를 거친다거나 TLB 태그의 하위 비트가 항상 0이라는 설명은 맞지 않는다. 이 Host 포인터 계산과 앞서 구한 Guest PA도 구별한다. [QEMU의 TLB 처리](https://github.com/qemu/qemu/blob/v10.0.0/accel/tcg/cputlb.c)

GDB에서 이미 멈춘 대상의 주소를 분해할 때는 다음처럼 64비트 마스크를 쓸 수 있다. 아래는 대상에 연결한 뒤 사용하는 관찰 명령이며 이 문서에서 실행한 GDB 결과는 아니다.

```gdb
set $va = (unsigned long long)$rip
p/x $va & 0xfffULL
p/x $va & ~0xfffULL
p/x ($va >> 39) & 0x1ffULL
p/x ($va >> 30) & 0x1ffULL
p/x ($va >> 21) & 0x1ffULL
p/x ($va >> 12) & 0x1ffULL
```

페이지 시작의 `x/1gx`는 해당 주소가 현재 문맥에 매핑된 경우에 읽는다. QEMU monitor의 `info tlb`와 GDB의 명령도 구별해야 한다. 표에 나온 index를 계산하는 것, 테이블 엔트리를 읽는 것, 실제 CPU 접근이 허용되는 것은 각각 따로 확인할 단계다.

## PAL_USER가 고르는 것은 주소가 아니라 Pool이다

PintOS의 [`palloc_get_page(PAL_USER)`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/palloc.c)는 User Pool에서 프레임을 예약하지만 **Kernel VA를 반환한다**. `PAL_USER`는 어떤 자원 Pool을 사용할지 정한다. 호출자가 사용할 User VA나 Page Table을 인자로 받는 함수가 아니다.

| 값 | 역할 |
|---|---|
| `upage` | 프로세스가 사용할 가상 페이지의 시작 주소 |
| `kpage` | Kernel이 프레임을 읽고 쓸 때 사용할 가상 주소 |
| `vtop(kpage)` | Page Table에 기록할 Guest 물리 Frame의 시작 주소 |
| `PTE_P` | 현재 Mapping이 present인지 나타내는 비트 |
| `PTE_U` | User 모드 접근을 허용하는 비트 |
| `PTE_W` | 쓰기를 허용하는 비트 |

Kernel은 실행 파일의 데이터를 프레임에 읽거나, 남은 부분을 0으로 채우고, fork의 내용을 복사해야 한다. 이때 `file_read_at()`·`memset()`·`memcpy()`에 넘길 C 포인터가 필요하다. 한편 프로세스는 자기 주소 공간의 코드·Stack 주소를 통해 같은 바이트에 접근한다. 두 요구를 연결하는 것이 Mapping이다.

[메모리 관리](/wiki/computer-systems-network-topic-d160fea60072/)의 할당기가 빈 Frame을 확보한 뒤, Page Table에 `upage → Frame`을 설치한다. `upage → kpage → Frame`처럼 User VA가 다른 VA를 거쳐 번역되는 구조는 아니다. User Mapping과 Kernel Mapping이 각각 같은 Frame을 가리킨다.

## Kernel 직접 Mapping과 PTE의 주소

이 레포의 [`vaddr.h`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/vaddr.h)는 `KERN_BASE=0x8004000000`을 사용한다.

```text
Kernel VA = Guest PA + KERN_BASE
Guest PA  = Kernel VA - KERN_BASE
```

`ptov()`는 첫 번째 계산으로 포인터를 만들고, `vtop()`은 Kernel 주소인지 ASSERT로 확인한 뒤 두 번째 계산을 한다. 이 주소 계산이 CPU의 주소 번역을 대신하는 것은 아니다. CPU는 현재 Page Table과 TLB를 통해 주소를 번역하며, 직접 Mapping은 위 관계가 성립하도록 미리 구성된 Mapping이다. 변환 매크로만으로 해당 물리 주소에 RAM이 존재하거나 접근 권한이 있다고 증명할 수도 없다.

예를 들어 PA `0xa000`에 대응하는 KVA는 `0x800400a000`이다. `0xa000`은 40 KiB이며, 4 KiB 페이지를 0부터 세면 Frame 번호는 10, 순서로는 열한 번째 페이지다. 이는 주소 관계를 보여 주는 계산 예시다. 이 주소를 `palloc_get_page(PAL_USER)`가 실제로 반환했다고 보거나, 변환 결과만으로 할당 가능한 Frame이라고 판단해서는 안 된다.

[`pml4_set_page()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)는 `upage`에 해당하는 leaf PTE를 찾거나 만들고 다음 값을 기록한다.

```c
*pte = vtop(kpage) | PTE_P | (rw ? PTE_W : 0) | PTE_U;
```

kpage 자체가 PTE에 들어가지 않고, 물리 Frame 주소로 바꾼 값이 들어간다. 이때 `PTE_P/W/U`의 값은 각각 `0x1/0x2/0x4`다.

반대로 `pml4_get_page(pml4,uaddr)`는 present PTE를 찾으면 `ptov(PTE_ADDR(*pte))+pg_ofs(uaddr)`를 반환한다. 결과는 Kernel VA이며, 입력 uaddr의 페이지 안 offset도 유지한다. 현재 함수가 확인하는 것은 Mapping의 present 상태다. 이 함수가 포인터를 반환했다고 User 쓰기 권한이나 전체 버퍼의 유효성이 자동으로 확인되는 것은 아니다.

### 명시적인 조회도 CPU의 주소 변환을 이용한다

`pml4_get_page()`는 인자로 받은 Page Table을 C 코드로 따라간다. User VA에 대한 하드웨어 TLB 결과를 조회하는 API는 아니지만, 함수 안에서 테이블 메모리를 읽는 load까지 MMU와 TLB를 우회하는 것은 아니다. 그 load는 현재 Kernel Mapping을 통해 실행된다. [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/)의 TCG 모드에서도 PintOS 함수는 Guest 명령어로 실행되고, 그 메모리 접근에 Software TLB가 사용될 수 있다.

유효한 Page Table 포인터를 받았다는 전제에서 User 매핑이 없으면 이 함수는 NULL을 반환한다. 잘못된 Kernel 포인터나 손상된 테이블을 전달해도 어떤 예외도 발생하지 않는다는 보장은 아니다. 또한 함수는 User의 U·W 권한을 모두 검사하거나 Frame을 고정하지 않는다. 반환 이후의 Mapping 변경, 페이지 경계를 넘는 버퍼, 아직 적재하지 않은 lazy page는 호출자가 별도로 처리해야 한다. [조회가 확인하는 조건](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/mmu.c#L231)

조회할 PML4가 현재 CR3와 같아야 하는 것도 아니다. 예를 들어 non-VM fork의 `duplicate_pte()`는 부모 PML4에서 얻은 Kernel VA를 `memcpy()`의 원본으로 사용한다. 같은 User VA를 현재 자식 주소 공간에서 직접 읽는 것과 구별해야 한다. 이때 부모 테이블과 Frame이 살아 있고 Kernel 직접 Mapping으로 접근할 수 있다는 전제가 필요하다. [부모 Frame의 복사](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L240)

### 두 VA에서 같은 바이트를 읽는다

다음 모형은 물리 Frame 하나를 Byte Array로 두고 User VA와 Kernel VA로 각각 접근한다. Frame의 PA는 `0xb05000`, User 페이지는 `0x8048000`으로 정했다. 실제 부팅에서 얻은 주소가 아니라 주소·offset·권한의 역할을 비교하기 위한 값이다. 간단한 leaf PTE만 모델링하며 네 단계 Page Table이나 TLB는 구현하지 않는다.

```run-python
PAGE = 4096
KERN_BASE = 0x8004000000
PRESENT, WRITE, USER = 1,2,4
upage,frame_pa = 0x8048000,0xb05000
kpage = KERN_BASE+frame_pa
pte = frame_pa|PRESENT|WRITE|USER
frame = bytearray(PAGE)

def user_offset(address,writing=False):
    if address//PAGE != upage//PAGE or not pte&PRESENT or not pte&USER:
        raise PermissionError('user mapping unavailable')
    if writing and not pte&WRITE:
        raise PermissionError('user page is read only')
    physical = (pte&~(PAGE-1))+(address&(PAGE-1))
    return physical-frame_pa

def kernel_offset(address):
    physical = address-KERN_BASE
    if not frame_pa <= physical < frame_pa+PAGE:
        raise ValueError('outside this frame')
    return physical-frame_pa

offset = 0x123
uva,kva = upage+offset,kpage+offset
frame[kernel_offset(kva)] = 0x41
print('pte',hex(pte),'user_va',hex(uva),'kernel_va',hex(kva))
print('guest_pa_from_user',hex((pte&~(PAGE-1))+offset))
print('guest_pa_from_kernel',hex(kva-KERN_BASE))
print('initial_views',hex(frame[user_offset(uva)]),hex(frame[kernel_offset(kva)]))
frame[user_offset(uva,writing=True)] = 0x5a
print('after_user_write',hex(frame[kernel_offset(kva)]))
pte &= ~WRITE
try:
    user_offset(uva,writing=True)
except PermissionError:
    print('read_only_user_write_rejected',True)
print('kernel_alias_still_readable',hex(frame[kernel_offset(kva)]))
assert (pte&~(PAGE-1))+offset == kva-KERN_BASE
```

처음 Kernel 주소로 넣은 `0x41`을 User 주소에서도 읽고, User 주소로 바꾼 `0x5a`를 Kernel 주소에서 읽는다. 데이터가 별도로 복제된 것이 아니라 같은 Byte Array 위치에 접근한 결과다. 한 Mapping의 쓰기 권한을 바꾸는 일과 Frame 자체를 제거하는 일도 구분된다.

## Present와 OS의 페이지 상태

P=1은 CPU가 그 엔트리를 주소 변환에 사용할 수 있다는 조건이다. 이것만으로 접근 권한 검사를 통과했거나, 대상이 RAM이거나, 필요한 데이터까지 읽어 왔다고 증명할 수는 없다. Page Table walk가 필요한 접근에서 어느 단계든 P=0인 엔트리를 만나면 그 경로의 변환은 성립하지 않는다. 최종 PTE를 아직 만들지 않은 경우도 중간 단계의 not-present 엔트리에서 멈출 수 있다. 예외의 원인과 복구 가능 여부는 [페이지 폴트](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에서 구별한다. [Intel SDM의 변환 조건](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=137)

P=0일 때 OS는 엔트리를 소프트웨어 상태로 해석할 수 있다. 하지만 모든 OS가 같은 형식을 쓰거나, 남은 63비트를 아무 제약 없이 사용한다는 뜻은 아니다. Linux v6.16의 **x86-64 swap PTE**는 bit 59–63에 swap type을, bit 9–58에 반전한 offset을 저장한다. bit 8은 not-present 상태에서 PROT_NONE을 구별하는 데 쓰이고, 낮은 비트에도 soft-dirty 등의 용도가 있다. 소스는 하드웨어 erratum 때문에 A·D 위치를 swap 정보에 사용하지 않는 이유도 명시한다. [Linux의 swap 인코딩](https://github.com/torvalds/linux/blob/v6.16/arch/x86/include/asm/pgtable_64.h#L185), [비트와 PROTNONE 정의](https://github.com/torvalds/linux/blob/v6.16/arch/x86/include/asm/pgtable_types.h)

Linux의 같은 비트 정의에서 `__PAGE_KERNEL`은 NX와 G를 포함하고, `__PAGE_KERNEL_ROX`는 쓰기를 허용하지 않으면서 실행을 허용하는 조합이다. 쓰기와 실행을 동시에 허용하지 않는 W^X 정책에는 이런 권한의 조합과 Mapping 관리가 함께 필요하다. NX를 지원한다는 사실 하나로 모든 Mapping에 W^X가 적용됐다고 판단하지 않는다. [Linux Kernel의 보호 속성 조합](https://github.com/torvalds/linux/blob/v6.16/arch/x86/include/asm/pgtable_types.h#L229)

Windows의 transition 페이지는 Working Set에서 빠졌어도 RAM에 남아 있을 수 있다. 다시 사용되거나 다른 용도로 바뀌기 전까지 내용을 유지할 수 있으므로, transition을 곧바로 pagefile 저장 상태로 읽지 않는다. [Windows의 transition과 soft fault](https://learn.microsoft.com/en-us/windows/win32/memory/working-set) Windows는 PFN database와 prototype PTE 같은 메모리 관리 구조도 사용한다. PTE 하나의 하드웨어 플래그와 이 소프트웨어 정보를 구별해야 한다. 디버거의 `!pfn`은 Frame의 참조 수와 상태 등을 조회하며, `!pte`로 얻은 PFN과 연결해서 읽을 수 있다. [PFN 조회](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-pfn), [hardware PTE와 prototype PTE의 구분](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/bug-check-0x4e--pfn-list-corrupt)

QEMU 10.0의 TCG도 `target/i386/tcg/system/excp_helper.c`에서 변환 경로의 Present를 검사한다. not-present 분기는 `#PF` 정보를 만들 때 오류 코드의 P를 0으로 두고, User 접근과 쓰기 접근은 별도 비트로 더한다. 읽기와 쓰기 모두에서 같은 오류 코드가 나온다는 뜻은 아니다. 실제 예외 전달과 PintOS의 재시도는 앞서 연결한 페이지 폴트의 흐름을 따른다. [QEMU의 not-present 분기](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c#L497)

## PTE의 권한과 Page Fault

PintOS의 PTE에서 P·W·U는 bit 0·1·2(`0x1/0x2/0x4`)이며, 각각 Mapping의 Present 상태, 쓰기 허용, User 접근 허용을 나타낸다. A·D가 접근의 흔적이라면 W·U는 접근 전에 검사할 조건이다. `0x12345007`은 Frame 주소 `0x12345000`에 P·W·U가 켜진 예다. A·D까지 켜지면 `0x12345067`이 된다. 이 숫자에서 W와 D를 혼동하면 쓰기가 가능한 상태와 쓰기가 기록된 상태를 구별할 수 없다.

같은 조건에서 `0x0000000012345025`를 상위 제어 Bit가 없는 4 KiB leaf PTE 예시로 읽으면 물리 Frame 주소는 `0x12345000`, 하위 Flag는 `0x025`다. P·U·A는 켜져 있고 W는 꺼져 있다. 이런 present Mapping에서 `pml4_get_page()`가 포인터를 반환해도 쓰기 허가까지 확인된 것은 아니다. 다만 W=0만으로 불법 쓰기라고 확정하지 않는다. 뒤의 COW 설명처럼 SPT의 논리적 쓰기 권한과 복구 가능성도 확인해야 한다. 이 예시의 주소 분리를 상위 제어 Bit가 있는 모든 PTE에 `~0xfff`만 적용하는 규칙으로 확대하지 않는다.

4단계 Paging에서 User 접근을 허용하려면 변환 경로의 모든 엔트리가 present이고 U=1이어야 한다. User 쓰기는 모든 단계의 W도 1이어야 한다. 최종 PTE가 `...007`이어도 상위 PDE의 U=0이면 User 접근을 허용하지 않는다. Supervisor 쓰기에 W=0을 적용할지는 CR0.WP도 결정한다. WP=1이면 Supervisor에도 쓰기 보호가 적용되고, WP=0이면 기본적인 R/W 검사에서 Supervisor 쓰기가 허용될 수 있다. P=0까지 무시한다는 뜻은 아니다. [Intel SDM 092, Vol. 3A §5.6](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf)

U=1 역시 Kernel의 모든 접근을 허용한다는 뜻은 아니다. SMEP는 Supervisor가 User 페이지에서 명령어를 가져오는 것을 제한하고, SMAP은 User 페이지에 대한 Supervisor의 데이터 접근을 제한한다. SMAP의 명시적 접근 예외에는 EFLAGS.AC 등이 관계된다. 명령어 실행에는 NX, 접근에는 protection key 같은 조건도 있으므로 P·W·U만으로 x86-64의 전체 권한 규칙을 구현할 수 없다.

Linux의 KPTI와 Windows의 KVA Shadow는 User 실행에 사용하는 Page Table에서 Kernel Mapping의 노출을 줄이는 별도의 방어다. Kernel 진입·복귀에 필요한 최소 Mapping은 남기므로, Kernel 엔트리를 전부 없애는 방식은 아니다. U/S 권한이나 SMAP·SMEP와 같은 기능으로 취급하지 않는다. [Linux PTI](https://docs.kernel.org/6.16/arch/x86/pti.html), [Windows KVA Shadow](https://www.microsoft.com/en-us/msrc/blog/2018/03/kva-shadow-mitigating-meltdown-on-windows)

PintOS의 `pml4_set_page()`는 User leaf에 U를 기록하며, 하위 테이블을 만드는 walk도 상위 엔트리에 P·W·U를 기록한다. `is_user_pte()`와 `is_writable()`은 `include/threads/mmu.h`에 정의된 leaf 검사다. 이 레포의 `is_user_vaddr()`는 주소가 `KERN_BASE=0x8004000000`보다 작은지 비교한다. 이 경계와 x86-64의 canonical 주소 범위를 같은 것으로 보면 안 된다. 또한 부트 소스는 CR0의 PE·PG를 켜지만 WP=1을 설정하는 코드는 확인되지 않는다. 이 소스만으로 실행 중인 CR0.WP 값이나 Kernel 쓰기 보호가 검증됐다고 말할 수는 없다. [PintOS의 부트 설정](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/start.S)

쓰기 권한은 읽기 전용 코드·파일 Mapping을 보호하거나, COW가 일어나기 전 공유 내용을 지키는 데 쓰인다. Windows의 `PAGE_READONLY`·`PAGE_READWRITE`·`PAGE_EXECUTE_READ`도 읽기·쓰기·실행을 구별하는 API 속성이다. 이 상수 값을 x86 PTE의 W 비트 자체로 대입하는 것은 아니다. [Windows 메모리 보호 속성](https://learn.microsoft.com/en-us/windows/win32/memory/memory-protection-constants)

### 오류 코드는 접근의 종류를 설명한다

Page Fault 오류 코드의 P·W·U는 PTE의 같은 이름 비트를 복사한 값이 아니다. PF_P=0은 not-present, PF_P=1은 보호 위반을 나타내며, PF_W는 쓰기 접근인지, PF_U는 User 접근인지 나타낸다. 기본적인 데이터 접근에서 User 쓰기가 present인 read-only 페이지에 막히면 `0b111=0x7`이다. User가 U=0인 페이지를 읽다 막히면 PF_U=1이므로 `0x5`다. 거부된 페이지의 U=0과 오류 코드의 U=1이 동시에 성립한다.

다음 모형은 4단계의 P·W·U와 CR0.WP만 검사한다. 주소 정규성, 예약 비트, NX, SMAP·SMEP, protection key는 제외했다. 뒤의 COW 분기도 유효한 주소·SPT 페이지·resident Frame이 이미 확인됐다고 가정한다. PintOS나 MMU를 실행하는 코드는 아니다.

```run-python
P, W, U = 1, 2, 4

def access(entries, user, write, wp=True):
    # Four-level data-access checks: no NX, SMAP, SMEP or keys.
    present = all(entry & P for entry in entries)
    user_page = all(entry & U for entry in entries)
    writable = all(entry & W for entry in entries)
    denied = (user and not user_page) or (write and not writable and (user or wp))
    if not present or denied:
        error = int(present) | (int(write) << 1) | (int(user) << 2)
        return f"#PF {error:#x}"
    return "allowed"

cases = [
    ("user read", [7, 7, 7, 5], True, False, True, "allowed"),
    ("user write read-only", [7, 7, 7, 5], True, True, True, "#PF 0x7"),
    ("user read supervisor", [7, 7, 3, 7], True, False, True, "#PF 0x5"),
    ("upper W=0", [7, 5, 7, 7], True, True, True, "#PF 0x7"),
    ("kernel write WP=1", [7, 7, 7, 5], False, True, True, "#PF 0x3"),
    ("kernel write WP=0", [7, 7, 7, 5], False, True, False, "allowed"),
    ("user read absent", [7, 7, 7, 0], True, False, True, "#PF 0x4"),
    ("user write absent", [7, 7, 7, 0], True, True, True, "#PF 0x6"),
]
for label, entries, user, write, wp, expected in cases:
    result = access(entries, user, write, wp)
    assert result == expected
    print(f"{label}: {result}")

def write_fault_action(logically_writable, references):
    # Assume the address, SPT page and resident frame have already been checked.
    if not logically_writable:
        return "reject"
    return "copy frame, then W=1" if references > 1 else "reuse frame, then W=1"

for writable, refs in [(False, 1), (True, 2), (True, 1)]:
    print(f"logical W={int(writable)} refs={refs}: {write_fault_action(writable, refs)}")
```

Python 3.9.6에서 실행한 결과다.

```text
user read: allowed
user write read-only: #PF 0x7
user read supervisor: #PF 0x5
upper W=0: #PF 0x7
kernel write WP=1: #PF 0x3
kernel write WP=0: allowed
user read absent: #PF 0x4
user write absent: #PF 0x6
logical W=0 refs=1: reject
logical W=1 refs=2: copy frame, then W=1
logical W=1 refs=1: reuse frame, then W=1
```

오류 코드가 같아도 OS가 선택할 복구 방법은 다를 수 있다. 현재 PintOS의 `vm_try_handle_fault()`는 not-present 여부로 경로를 나눈다. not-present이면 SPT의 페이지를 확보하거나 Stack 성장 조건을 검사한다. present인 쓰기 위반이면 SPT의 `page->writable`과 Frame을 검사한 뒤 `vm_handle_cow()`로 들어간다. 논리적 쓰기 권한이 없는 페이지나 읽기 보호 위반을 무조건 COW로 처리하지 않는다. 복구가 성공하면 원래 명령을 재시도하고, 쓰기가 허용된 Mapping을 통한 쓰기에서 D를 관찰할 수 있다.

`page->writable=true`인데 현재 PTE.W=0인 상태는 COW에서 가능하다. Frame의 `ref_count>1`이면 새 Frame에 4 KiB를 복사하고 쓰기 가능하게 연결한다. 참조 수가 1이면 같은 Frame을 W=1로 다시 연결한다. 따라서 COW fault마다 반드시 새 Frame을 복사하는 것은 아니다. VM을 사용하지 않는 `duplicate_pte()`는 별도의 eager 복사 경로에서 `is_writable()`로 부모 leaf의 쓰기 권한을 전달한다. 이 경로를 VM의 SPT 복제와 섞어 읽지 않는다. [현재 COW와 fault 분기](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c), [비 VM fork 경로](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)

## A·D 비트로 알 수 있는 것

A는 Accessed(bit 5, `0x20`), D는 Dirty(bit 6, `0x40`)다. 일반적인 읽기·명령어 가져오기는 변환에 사용하는 엔트리의 A를 켜고, 쓰기는 페이지를 직접 가리키는 leaf의 D도 켠다. 4 KiB Mapping에서는 마지막 PTE가 leaf지만, 2 MiB와 1 GiB Mapping에서는 각각 PDE와 PDPTE가 leaf다. D를 오직 마지막 단계 PTE에만 있는 상태로 설명하면 큰 페이지를 놓친다. CPU가 이 비트를 주기적으로 0으로 되돌리지는 않는다. OS는 필요한 관찰 구간에 맞춰 초기화한다. [Intel SDM 092, Vol. 3A §5.8](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf)

A=1은 정확한 접근 횟수나 시각을 담지 않는다. speculative 접근이나 뒤에 fault가 나는 접근에서도 A가 남을 수 있어, 명령어가 정상 완료됐다는 증거도 아니다. D=1도 이전 바이트와 새 바이트가 다르다는 비교 결과가 아니다. 같은 값을 다시 저장해도 쓰기는 일어난다. Intel TSX의 일부 구현은 A·D 갱신이 보인 뒤 트랜잭션을 abort할 수도 있다. [Intel SDM Vol. 1 §17.3.9.2](https://cdrdv2-public.intel.com/922477/253665-092-sdm-vol-1.pdf) 보통의 권한 거부 쓰기는 성공한 쓰기와 구별해 해석한다.

같은 Frame을 User VA와 Kernel VA로 가리켜도 두 Mapping의 PTE는 다르다. Kernel 별칭으로 접근한 기록이 User PTE에 자동으로 합쳐지지 않는다. COW로 공유한 부모 PTE의 A=1, 자식 PTE의 A=0도 함께 가능하다. Frame 전체의 사용을 판단하거나 다음 관찰 구간을 시작하려면 어느 Mapping의 상태를 모으고 초기화할지 정해야 한다.

### 메모리의 비트와 Cache의 비트

OS가 메모리의 PTE에서 A·D를 내렸어도 TLB에 이전 변환이 남아 있으면 이후 접근이 그 비트를 다시 기록하지 않을 수 있다. 새 관찰 구간을 정확하게 만들려면 변환 Cache의 상태를 함께 다뤄야 한다. 반대로 교체 후보를 대략 추정하는 정책은 정확성과 무효화 비용 사이에서 다른 선택을 할 수 있다. Linux 6.16 x86의 `ptep_clear_flush_young()`도 나이 추정의 오차를 감수하고 무효화를 생략한다. 함수 이름만으로 즉시 flush한다고 판단하면 안 된다. [Linux의 young 비트 초기화](https://github.com/torvalds/linux/blob/v6.16/arch/x86/mm/pgtable.c#L486-L503)

현재 PintOS의 `pml4_set_accessed()`·`pml4_set_dirty()`는 true면 비트를 켜고 false면 내린다. PTE가 있으면 현재 CR3가 대상 pml4의 물리 주소와 같은 경우에만 해당 VA에 `invlpg`를 실행한다. `pml4_is_accessed()`·`pml4_is_dirty()`는 PTE 포인터와 A·D를 검사하며 P는 검사하지 않는다. `pml4_clear_page()`가 P만 내리고 다른 비트를 남기므로, present가 아닌 엔트리에서도 남아 있던 A·D가 읽힐 수 있다. [PintOS의 비트 조회·초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

비트 마스크의 폭도 살펴야 한다. 이 소스에서 false 분기는 `*pte &= ~(uint32_t)PTE_A` 또는 D를 사용한다. 32비트에서 NOT을 계산한 마스크를 64비트 PTE와 AND하면 상위 32비트도 지워진다. 낮은 물리 주소만 사용하는 작은 구성에서 눈에 띄지 않더라도, 높은 주소 비트나 NX를 보존하는 일반적인 64비트 마스크는 아니다.

다음 모형은 Cache에 A·D가 이미 켜졌다는 정보가 남아 있는 경우를 단순화했다. 특정 CPU가 반드시 이 순서로 동작한다는 구현 모형은 아니다. 권한 검사는 생략하고 허용된 접근만 넣었다. 마지막 두 줄은 같은 64비트 값에서 마스크의 폭만 바꾼 계산이다.

```run-python
P, W, U, A, D = 1, 2, 4, 0x20, 0x40
U64 = (1 << 64)-1
frame = 0x12345000
entries = {"user": frame | P | W | U, "kernel": frame | P | W}
cached = {}

def touch(alias, write=False):
    # A possible cached-bit behavior, not a full MMU or an instruction simulator.
    old = cached.setdefault(alias, entries[alias])
    needed = A | (D if write else 0)
    entries[alias] |= needed & ~old
    cached[alias] |= needed

def clear(alias, bits, invalidate):
    entries[alias] &= U64 ^ bits
    if invalidate:
        cached.pop(alias, None)

def show(label):
    print(f"{label}: user={entries['user']:#x} kernel={entries['kernel']:#x}")

show("initial")
touch("user")
show("user read")
touch("user", write=True)
show("user write")
clear("user", A, invalidate=False)
touch("user")
show("clear A, keep cached translation, read")
assert not entries["user"] & A
cached.pop("user")
touch("user")
show("invalidate, read again")
assert entries["user"] & A
clear("user", D, invalidate=True)
touch("kernel", write=True)
show("clear user D, write through kernel alias")
assert not entries["user"] & D and entries["kernel"] & D

high_entry = (1 << 63) | (1 << 32) | frame | P | W | U | A | D
clear_with_u32 = high_entry & ((1 << 32)-1 ^ A)
clear_with_u64 = high_entry & (U64 ^ A)
assert clear_with_u32 >> 32 == 0
assert clear_with_u64 >> 32 == high_entry >> 32
print(f"clear A with 32-bit mask: {clear_with_u32:#018x}")
print(f"clear A with 64-bit mask: {clear_with_u64:#018x}")
```

Python 3.9.6에서 실행한 결과다.

```text
initial: user=0x12345007 kernel=0x12345003
user read: user=0x12345027 kernel=0x12345003
user write: user=0x12345067 kernel=0x12345003
clear A, keep cached translation, read: user=0x12345047 kernel=0x12345003
invalidate, read again: user=0x12345067 kernel=0x12345003
clear user D, write through kernel alias: user=0x12345027 kernel=0x12345063
clear A with 32-bit mask: 0x0000000012345047
clear A with 64-bit mask: 0x8000000112345047
```

User PTE의 A만 내린 직후에는 Cache에 남은 정보 때문에 A=0으로 읽힌다. 변환을 무효화한 다음 읽으면 다시 A=1이 된다. 그 뒤 User D를 내리고 Kernel 별칭으로 쓰면 Kernel PTE에만 D가 켜진다. 마지막 계산에서는 64비트 마스크가 상위 주소 비트와 NX를 보존하고, 32비트 마스크는 둘 다 잃는다. 이 예제는 비트 관찰의 한계를 보여 주며 실제 PintOS 빌드의 오류 재현 결과는 아니다.

## 접근 흔적을 교체 판단에 사용한다

PintOS의 현재 Clock 교체는 A=1인 후보에 second chance를 준다. `vm_get_victim()`은 `frame_lock`을 잡고 `clock_hand`에서 시작해, 교체 가능한 Frame의 소유자 PTE를 검사한다. A=1이면 내린 뒤 다음 Frame으로 넘어가고, A=0인 후보를 만나면 선택한다. 한 번의 호출에서 검사하는 상한은 Frame Table 크기 N의 두 배다. 첫 순회에서 A를 내렸다면 다음 순회에서 같은 후보를 다시 볼 수 있다.

교체 가능 조건에는 Frame·kva·page가 존재하고 `ref_count==1`이라는 조건이 들어간다. 현재 `struct frame`에는 하나의 `owner_thread`와 `page`가 있으며, 모든 owner를 순회하는 List는 없다. COW로 공유 중인 `ref_count>1` Frame은 이 단계에서 건너뛴다. 따라서 “공유자 중 하나라도 A=1이면 모든 PTE를 함께 초기화한다”는 정책을 이 구현의 동작으로 설명할 수는 없다. 빈 Table이거나 검사 상한 안에 교체 가능한 후보가 없으면 NULL을 반환한다. [Clock 구현과 Frame 구조](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)

Linux의 회수 정책은 PintOS의 Clock보다 많은 상태를 사용한다. 전통적인 active/inactive LRU뿐 아니라 구성에 따라 Multi-Gen LRU도 사용하며, accessed 정보와 reverse mapping으로 페이지의 사용 양상을 추정한다. NUMA balancing의 hinting fault는 접근을 감지할 수 있도록 Mapping을 별도로 보호하는 방식이다. Linux 6.16은 이를 위해 `PAGE_NONE` 계열로 보호를 바꾸고 `pte_protnone` fault를 `do_numa_page()`에서 처리한다. A=0만으로 Page Fault가 발생하는 것은 아니다. [NUMA 보호 변경](https://github.com/torvalds/linux/blob/v6.16/mm/mprotect.c#L550-L551), [Multi-Gen LRU](https://www.kernel.org/doc/html/v6.16/admin-guide/mm/multigen_lru.html) 페이지를 NUMA 노드 사이에서 옮기는 작업은 메모리 간 이동이며, D=1이라는 이유만으로 디스크 쓰기를 요구하는 절차가 아니다. [Linux의 folio 이동](https://github.com/torvalds/linux/blob/v6.16/mm/migrate.c)

Windows의 Working Set도 프로세스가 현재 물리 메모리에 보유한 페이지 집합과 그 조정을 다룬다. 회수된 페이지가 다른 Working Set에 공유되어 있거나 standby 상태로 남으면, 다시 접근할 때 디스크 없이 복구할 수 있다. 모든 회수를 디스크 I/O와 같게 보거나 Linux·Windows 모두가 같은 Clock 순서와 고정 주기로 A를 초기화한다고 설명하지 않는다. [Windows Working Set](https://learn.microsoft.com/en-us/windows/win32/memory/working-set)

## D 비트와 내용을 보존할 위치

A는 주로 어느 Frame을 후보로 삼을지 판단할 때, D는 내용을 어디에 보존해야 하는지 판단할 때 읽는다. D=0이라는 사실만으로 내용을 버릴 수 있는 것은 아니다. 다시 읽을 수 있는 파일이나 유효한 swap 사본이 있는지, 다른 Mapping을 통해 바뀌었는지도 관계된다.

현재 PintOS에서 후보를 고른 뒤의 동작은 페이지 종류에 따라 다르다.

| 페이지 종류 | 현재 보존 경로 | 확인할 조건 |
|---|---|---|
| Anonymous | D를 검사하지 않고 Frame 전체를 swap slot에 기록 | 빈 slot과 swap 장치가 필요하다. 4 KiB는 512바이트 sector 8개다. |
| File-backed | 소유자 User PTE가 dirty이고 `page_read_bytes>0`이면 파일에 기록 | Frame의 Kernel VA에서 파일 구간 길이만 쓴다. 마지막 페이지의 0으로 채운 끝부분은 포함하지 않는다. |
| File-backed 해제 | `file_backed_destroy()`가 같은 write-back 경로를 호출한 뒤 파일을 닫음 | 현재 destroy는 write-back의 실패 반환값을 전달하지 않는다. |

[`anon_swap_out()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c)는 Bitmap에서 slot을 확보해 8개 sector를 쓴다. `anon_swap_in()`은 이를 다시 읽고 slot을 반환한다. 이 구현에는 D=0일 때 기존 swap 사본을 재사용하는 분기가 없다.

[`file_backed_swap_out()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c)은 `frame->owner_thread`를 사용하며 없으면 현재 Thread를 사용한다. dirty라면 `file_write_at(file,frame->kva,page_read_bytes,ofs)`를 호출하고, 요청한 바이트 수만큼 썼을 때 D를 내린다. 변경된 바이트의 위치를 추적하는 것은 아니므로 dirty 페이지 안의 파일 구간 전체를 쓴다. 한 소유자의 User PTE만 검사한다는 점에서 Kernel 별칭의 D나 여러 공유 Mapping의 변경을 모두 합산하는 구현은 아니다.

`vm_evict_frame()`은 `swap_out()`이 실패하면 NULL을 반환하고 Mapping 해제를 진행하지 않는다. 성공하면 소유자 Mapping의 P를 내리고 기존 page와 Frame의 연결을 끊은 뒤, **같은 Frame을 반환해 재사용한다**. 이 경로에서 Frame을 `palloc_free_page()`로 반환했다가 다시 할당하는 것은 아니다. 이후 이전 VA의 내용을 복원할 때 어디서 읽어 올지는 SPT에 기록된 페이지 종류와 backing 상태에 따라 달라진다. [현재 Frame 재사용 경로](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L248)

`pml4_clear_page()`는 PTE가 present일 때 P만 내린다. 현재 CR3가 대상 Page Table을 사용하면 `invlpg`로 이전 변환도 무효화한다. 예를 들어 Frame PA가 `0x80005000`이고 초기 PTE가 `0x80005007`이면, P를 내린 값은 `0x80005006`이다. 주소와 W·U 비트가 남아 있어도 그 값이 현재 유효한 Mapping이라는 뜻은 아니다. 이 숫자는 A·D가 추가로 켜지지 않은 상태를 가정한 계산이다. [PTE와 TLB 무효화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c#L274)

반면 앞 표의 destroy 경로는 write-back의 실패값을 무시한다. 해제되었다는 사실만으로 파일에 성공적으로 저장됐다고 보장할 수는 없다. 여기서 확인한 것은 현재 소스의 제어 흐름이며, 디스크의 지속성이나 실패 주입 테스트 결과가 아니다.

Linux에서는 하드웨어 PTE.D, 파일 Cache의 folio dirty 상태, 사용자 변경 추적용 soft-dirty를 구별한다. `/proc/<pid>/pagemap`이 제공하는 soft-dirty를 x86의 원시 D 비트라고 읽으면 안 된다. pagemap은 원시 A도 제공하지 않으며, `kpageflags`의 REFERENCED·DIRTY도 Kernel의 페이지 상태다. [pagemap 형식](https://www.kernel.org/doc/html/v6.16/admin-guide/mm/pagemap.html), [soft-dirty 추적](https://www.kernel.org/doc/html/v6.16/admin-guide/mm/soft-dirty.html) 파일 write-back은 backing·파일 시스템·메모리 압력과 dirty 정책에 따라 진행한다. `dirty_expire_centisecs`는 write-back 대상으로 볼 나이, `dirty_writeback_centisecs`는 주기적 write-back의 간격을 다룬다. 둘 다 1/100초 단위이고 저장 완료 시각을 보장하지 않는다. `dirty_background_ratio`와 `dirty_ratio`는 백그라운드 쓰기 및 쓰기 주체의 제어에 관계되지만, 고정된 기본값이나 전체 RAM의 단순 비율로 모든 환경에 적용할 수는 없다. [Linux의 dirty 정책](https://www.kernel.org/doc/html/v6.16/admin-guide/sysctl/vm.html)

파일의 공유 Mapping을 동기화하는 `msync(MS_SYNC)`와 주소 Mapping을 제거하는 `munmap()`도 같은 보장이 아니다. `munmap()` 자체를 동기 write-back 완료로 간주하지 않는다. `MAP_PRIVATE`의 수정은 파일에 쓰는 공유 변경과 달리 사적 COW 내용을 만든다. “처음에는 모든 PTE가 이미 W=0으로 설치된다”는 고정 순서보다 지연 Mapping, 논리적 권한, 사적 복제의 의미를 구분한다. [Linux msync의 동기화](https://github.com/torvalds/linux/blob/v6.16/mm/msync.c), [Mapping 해제](https://github.com/torvalds/linux/blob/v6.16/mm/vma.c)

QEMU TCG의 Guest A·D 갱신은 x86 주소 변환 코드에서 확인할 수 있다. `mmu_translate()`는 경로의 권한을 결합하고 허용된 쓰기에 leaf D를 설정하며, D가 없는 읽기 변환에는 TLB의 쓰기 권한을 남기지 않아 첫 쓰기를 다시 처리한다. 한편 SoftMMU의 `TLB_NOTDIRTY`와 `notdirty_write()`는 QEMU의 RAM dirty tracking과 번역 코드 무효화 등을 다룬다. 이것을 Guest PTE.D의 다른 이름으로 보면 안 된다. [QEMU 10.0 x86 변환](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c), [SoftMMU의 RAM 쓰기 추적](https://github.com/qemu/qemu/blob/v10.0.0/accel/tcg/cputlb.c)

## 테이블을 해제할 때는 자식부터 반환한다

`pml4_clear_page()`는 한 Mapping의 Present를 내린다. Frame이나 비어 있는 중간 테이블을 할당기에 반환하지는 않는다. 반면 [`pml4_destroy()`](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/mmu.c#L200)는 PML4[0] 아래를 순회하고 마지막에 루트 자체를 반환한다. NULL 입력은 그대로 돌아오며 `base_pml4`를 파괴하려 하면 ASSERT로 막는다.

하위 함수는 Present 엔트리를 따라 `pdpe_destroy() → pgdir_destroy() → pt_destroy()`로 내려간다. `pt_destroy()`는 아직 Present인 leaf가 가리키는 데이터 Frame을 반환한 뒤 PT를 반환한다. 이후 PD와 PDPT, 마지막 PML4 순서로 돌아온다. 상위 테이블을 먼저 반환하면 하위 페이지의 주소를 안전하게 따라갈 수 없으므로, 생성할 때와 반대 방향으로 소유한 자원을 정리한다.

이때 커널의 C 포인터는 테이블 엔트리에 저장된 물리 주소와 다르다. 구현은 `ptov()`와 주소 마스크를 거쳐 Kernel 직접 Mapping의 포인터로 하위 페이지를 읽고 반환한다. PML4[1]의 공유 Kernel 트리까지 재귀적으로 해제하지 않는다. 상위 엔트리마다 주소 범위가 같다는 사실과, 이 구현이 어느 하위 트리의 소유권을 갖는지는 별개의 조건이다.

VM 빌드에서는 앞선 SPT 정리가 Mapping의 P를 내리고 공유 Frame의 참조 수를 처리한다. 그 뒤 Page Table을 파괴해야 같은 Frame을 다시 반환하는 일을 피할 수 있다. 사용 중인 CR3의 교체, SPT·Frame과 테이블의 해제 순서는 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에서 함께 읽는다. `pml4_destroy()` 자체가 TLB를 비우거나 Guest의 반환 페이지를 Host OS에 돌려주는 것은 아니다.

## 실행 파일의 적재와 VM의 지연 적재

현재 `load_program_headers()`가 `PT_LOAD`를 넘기면 `load_loadable_segment()`는 `phdr->p_flags & PF_W`로 `writable`을 정해 `load_segment()`에 전달한다. 따라서 코드가 놓인 주소라는 이유만으로 읽기 전용이라고 단정하지 않고, ELF의 권한과 현재 Mapping을 확인한다. [ELF 권한의 전달](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1002-L1061)

[`process.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)의 VM을 사용하지 않는 `load_segment()`는 프레임을 먼저 확보한다. 페이지에 해당하는 파일 바이트를 `file_read_at(file,kpage,page_read_bytes,ofs)`로 읽고, 남은 `page_zero_bytes`를 0으로 채운 다음 `install_page(upage,kpage,writable)`로 연결한다. 읽기나 Mapping 설치가 실패하면 확보한 프레임을 반환한다.

`install_page()`는 `pml4_get_page()`로 기존 Mapping이 없는지 검사한 뒤 `pml4_set_page()`를 호출한다. 현재 `pml4_set_page()` 자체는 leaf가 이미 present인지 검사하지 않으므로, 상위 호출자의 중복 검사와 하위 함수의 역할을 나누어 읽어야 한다.

VM 빌드의 `load_segment()`는 파일·offset·읽을 길이·0으로 채울 길이를 aux에 담고 `vm_alloc_page_with_initializer()`로 등록한다. 이때 `writable`은 `page->writable`로 보관한다. [VM 페이지에 권한 저장](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L95-L139) 아직 모든 프레임을 읽어 오는 단계는 아니다. 나중에 프레임을 확보하면 `lazy_load_segment()`가 `page->frame->kva`에 파일 내용을 읽고 나머지를 0으로 채운다. aux와 파일 참조의 반환은 이 페이지의 초기화 수명에 속한다. Eager 적재의 코드 조각을 모든 VM 실행 경로의 순서라고 일반화하면 안 된다.

현재 `vm_do_claim_page()`는 `pml4_set_page()`로 PTE를 설치한 **뒤에** `swap_in()`을 호출한다. 후자의 실패 때 이 함수에서 PTE를 되돌리는 코드는 없으므로, P=1만 보고 초기화 성공이나 안전한 재시도를 판단하면 안 된다. `PTE_W`도 항상 켜는 것이 아니라 `page->writable`에 따라 정한다. 등록, Frame 확보, 내용 준비와 원래 명령으로의 복귀는 [페이지 폴트](/wiki/computer-systems-network-topic-5cebdbc10ddf/)의 현재 코드 흐름에서 이어서 확인한다.

## Guest 물리 주소와 Host 메모리

QEMU에서 PintOS의 PTE가 가리키는 것은 **Guest PA**다. Host의 물리 주소나 QEMU 프로세스의 포인터가 아니다. QEMU의 메모리 계층은 Guest 물리 주소의 구간을 RAM backing이나 MMIO 동작에 연결한다. RAM 구간은 Host 메모리에, MMIO 구간은 장치 동작을 처리하는 callback에 대응할 수 있다. [QEMU 메모리 API](https://www.qemu.org/docs/master/devel/memory.html)

TCG 실행에서 Guest의 메모리 명령은 주소 번역과 접근 처리를 거친다. Guest에서 `memset(kpage,0,...)`를 실행한다는 이유만으로 전체 호출이 반드시 Host의 `memset()` 한 번으로 바뀐다고 볼 수는 없다. 또한 User VA와 Kernel VA가 각각 같은 Frame에 도달한다는 설명은 Guest 주소 공간 안의 별칭 관계다. 가상화 구현에서 Guest PA를 Host 메모리에 연결하는 별도 계층까지 없다는 뜻은 아니다.

Linux는 `struct page` 같은 메타데이터로 페이지를 다루며, 영구적인 직접 Mapping에 포함되지 않은 Highmem 페이지에는 임시 Mapping이 필요할 수 있다. `kmap_local_page()`로 얻은 주소는 호출한 문맥 안에서 사용하고 `kunmap_local()`로 반환한다. 낮은 메모리 페이지나 `CONFIG_HIGHMEM=n` 구성에서는 같은 API가 직접 Mapping 주소를 돌려줄 수 있다. 이 구분 때문에 모든 Kernel 페이지 접근을 고정된 상수 덧셈 하나로 설명할 수는 없다. [Linux의 Highmem과 임시 Mapping](https://docs.kernel.org/mm/highmem.html)

Windows의 MDL은 버퍼가 차지하는 물리 페이지를 기술하며, pageable 버퍼의 페이지를 고정하는 작업과 System 주소로 Mapping하는 작업은 구분된다. `MmGetSystemAddressForMdlSafe()`는 원래 프로세스의 User 주소 문맥에 의존하지 않는 System Mapping을 얻는 데 쓰인다. MDL을 할당하는 것만으로 페이지 고정과 Mapping이 모두 끝나는 것은 아니다. [Windows MDL 사용법](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/using-mdls)

## GDB로 Mapping과 데이터를 함께 확인한다

PintOS를 디버깅할 때는 이미 실행 중인 `pml4_set_page()`에서 멈추어 인자를 확인할 수 있다. 다음 명령은 QEMU와 해당 빌드의 심볼을 연결한 GDB 세션에서 사용하는 절차이며, 위 Python 모형의 실행 결과와는 별개의 검증이다.

```gdb
break pml4_set_page
continue
print/x upage
print/x kpage
print/x (uint64_t)kpage - 0x8004000000
```

소스를 보며 PTE 대입을 실행한 뒤 `pte`가 유효한지 확인하고 값을 읽는다. 고정된 `next` 두 번을 모든 빌드의 대입 완료 지점으로 가정하지 않는다.

```gdb
print/x pte
print/x *pte
print/x ((uint64_t)*pte & ~0xfffUL)
set $page_byte_offset = 0x123
x/16xb (char *)kpage + $page_byte_offset
```

그다음 현재 CR3가 대상 프로세스의 Page Table을 사용하는지 확인한 경우에만 User VA 쪽을 비교한다.

```gdb
x/16xb (char *)upage + $page_byte_offset
```

비교할 것은 PTE의 Frame 주소와 `kpage-KERN_BASE`, 두 Mapping이 가리키는 offset, 그리고 실제 바이트다. 서로 다른 두 Frame에 우연히 같은 데이터가 들어 있을 수도 있으므로 Dump 값이 같다는 사실 하나만으로 주소 별칭이 입증되지는 않는다. 프레임 번호와 유효한 Mapping을 함께 확인해야 한다.

### 바이트 비교를 자동화할 때

같은 Frame의 같은 offset을 읽더라도 비교 사이에 데이터나 Mapping이 바뀌면 결과가 달라질 수 있다. 관련 CPU를 멈추고, 같은 주소 공간과 가상 주소 모드에서 RAM을 비교한다. 덤프가 다르면 주소·offset·페이지 경계와 관찰 시점을 먼저 확인한다. 두 덤프가 모두 0이라는 사실만으로 적재 실패를 판단할 수도 없다. 원래 0이어야 하는 구간인지, 파일에서 읽어야 하는 구간인지에 따라 기대하는 값이 다르다.

Mapping 확인과 적재 결과 확인도 시점을 나눠야 한다. 현재 PintOS의 `vm_do_claim_page()`는 `pml4_set_page()`가 성공한 **뒤에** `swap_in()`을 호출한다. 위 Breakpoint에서 PTE를 기록한 직후에는 파일 데이터가 아직 준비되지 않았을 수 있다. 적재 결과를 확인할 때는 로더가 끝난 지점에서 유효한 Frame을 다시 확인하고, 예상 파일 바이트와 zero-fill 범위를 대조한다. 파일 offset이나 초기화가 잘못되어도 같은 Frame을 보는 두 덤프는 똑같이 잘못된 값을 보여 줄 수 있다. [현재 claim 순서](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)

Python을 지원하는 GDB에서는 위 비교를 자동화할 수 있다. 다음 명령은 앞 절처럼 `pml4_set_page()` 안에 멈춘 상태에서 사용한다. `upage`·`kpage`가 유효하고 PTE 기록을 마쳤는지 먼저 확인한다. `$page_byte_offset`은 비교할 페이지 안의 위치다. 이 명령은 연결한 Guest의 메모리를 읽으므로 별도의 Python 실행기에서 실행하지 않는다. 실제 GDB 세션에서 얻은 출력은 이 문서에 기록하지 않았다. [`read_memory()`와 현재 Inferior](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Inferiors-In-Python.html), [GDB 표현식 읽기](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Basic-Python.html)

```gdb
python
import gdb

offset = int(gdb.parse_and_eval("$page_byte_offset"))
assert 0 <= offset < 4096
length = min(16, 4096 - offset)
user_address = int(gdb.parse_and_eval("(unsigned long long)upage")) + offset
kernel_address = int(gdb.parse_and_eval("(unsigned long long)kpage")) + offset
inferior = gdb.selected_inferior()
user_bytes = bytes(inferior.read_memory(user_address, length))
kernel_bytes = bytes(inferior.read_memory(kernel_address, length))
print("same bytes:", user_bytes == kernel_bytes)
print("user:", user_bytes.hex())
print("kernel:", kernel_bytes.hex())
end
```

offset이 `0xff8`이면 이번 페이지에서 읽을 수 있는 범위는 8바이트다. 다음 페이지까지 비교하려면 그 페이지의 Mapping과 Frame을 따로 확인해야 한다. `same bytes: True`는 이번에 읽은 바이트가 같다는 뜻이며, Frame의 동일성·User 접근 권한·적재 데이터의 정확성을 대신 검증하지 않는다. 주소를 읽지 못하면 GDB의 오류를 확인하고 멈춘 위치와 Mapping을 다시 살핀다.

### PTE의 권한과 접근 비트

현재 빌드와 심볼을 연결한 GDB에서 `pml4_is_accessed()`나 `pml4_is_dirty()`에 멈추고, 소스를 보며 `pte` 대입을 지난 다음 NULL이 아닌지 확인한다. 이 상태에서 다음처럼 읽을 수 있다. 아래는 관찰 절차이며 실제 GDB 실행 결과가 아니다.

```gdb
print/x pte
print/x *pte
print (unsigned long long)*pte & 1
print ((unsigned long long)*pte >> 1) & 1
print ((unsigned long long)*pte >> 2) & 1
print ((unsigned long long)*pte >> 5) & 1
print ((unsigned long long)*pte >> 6) & 1
```

각 출력은 P·W·U·A·D 순서다. Clock의 `page->va`·`owner->pml4`·`frame->ref_count`를 같은 정지 시점에서 보고, 비트 초기화 전후와 `invlpg` 분기를 비교한다. GDB가 읽는 포인터와 CR3에 담긴 물리 주소를 혼동하지 않는다. 최적화로 지역 변수가 사라졌다면 그 빌드의 소스와 disassembly에서 대입 위치를 찾아야 한다. 정지 중인 Kernel에 임의의 함수를 호출하거나 존재하지 않는 owner List를 순회하는 스크립트로 결과를 만들어 내지 않는다.
