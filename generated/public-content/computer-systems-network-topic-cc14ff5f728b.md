---
layout: default
title: 부팅
nav_order: 2
permalink: /wiki/computer-systems-network-topic-cc14ff5f728b/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-cc14ff5f728b
projection_sha256: 70d6d3c8f1b00b68471bad551e25d8f83478e1adbfe1494c5ab96f5d3ad092ac
parent: 커널 구조
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-5cd3e3706e06
grand_parent: PintOS
ancestor: CS 기초
---

# 부팅
{: .no_toc }

PintOS의 `main()`은 64 Bit C 코드다. 이 함수가 실행되기 전에는 Firmware와 Loader가 이미 커널 이미지를 메모리에 올리고, CPU 모드와 임시 Page Table, Stack을 준비해야 한다. 아래 흐름은 학습 저장소의 `5afaa6d`에 들어 있는 x86 BIOS 부팅 경로를 기준으로 한다.

## BIOS에서 커널의 첫 명령까지

이 BIOS 부팅 경로에서는 디스크 첫 Sector의 Loader가 물리 주소 `0x7c00`에서 실행된다. `loader.S`는 16 Bit Real Mode 코드로 시작한다. `cli`로 외부의 Maskable Interrupt를 막고, Segment Register와 `0x7c00` 아래로 자라는 Stack을 준비한다.

Loader는 Port `0x64`·`0x60`의 키보드 컨트롤러 경로로 A20을 활성화한다. A20 주소 비트가 강제로 0이면 `0x100000`과 `0x0`이 겹치는 것처럼 주소 Alias가 생기기 때문이다. BIOS의 `int 0x15`·E820 기능으로 메모리 지도를 받은 뒤에는 GDT를 읽고 CR0.PE를 켠다. Far Jump로 CS를 다시 읽으면 32 Bit 코드 Segment에서 실행을 이어 간다.

인터럽트를 막은 상태에서도 코드에 적힌 `int 0x15` 같은 소프트웨어 호출은 실행할 수 있다. IF가 모든 종류의 인터럽트와 예외를 막는 것은 아니다. 보호 모드 전환 뒤에는 Segment Register를 다시 설정하고 임시 Stack을 `LOADER_PHYS_BASE + 0x30000`에 둔다.

커널은 파일 이름을 찾아 읽지 않는다. Loader가 IDE 장치를 Polling하며 LBA 1부터 `KERNEL_LOAD_PAGES × 8`개의 Sector를 순서대로 읽는다. Sector 하나는 512 Byte이며 `rep insw`로 16 Bit 값 256개를 받는다. 목적지는 물리 주소 `LOADER_PHYS_BASE=0x200000`이다. 적재를 끝내면 그 주소를 호출해 `start.S`의 진입 코드로 넘어간다. [Loader의 적재 경로](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/loader.S)

Port I/O의 상대는 QEMU에서 제공하는 IDE 장치일 수 있다. Guest의 명령·Status Polling과 Host의 디스크 이미지 접근은 서로 다른 단계다. QEMU의 모든 Machine과 Firmware가 이 BIOS 경로를 사용하는 것은 아니며, 해당 학습 실행 설정과 장치 구성을 함께 확인한다.

## 두 주소 범위를 임시로 Mapping한다

`start.S`는 CR4.PAE를 켜고 부트 Page Table을 만든다. 2 MiB Page를 나타내는 PDE 128개로 물리 주소 `[0, 256 MiB)`를 연결한다. 주소 공간은 4단계 Paging 형식이지만 이 Mapping은 PDE의 큰 Page에서 끝나므로 PML4·PDPT·PD까지만 순회한다.

| Mapping | Table의 선택 | 가상 주소 범위 | 연결되는 물리 주소 |
| --- | --- | --- | --- |
| Identity Mapping | PML4 0, PDPT 0, PDE 0~127 | `[0, 0x10000000)` | `[0, 256 MiB)` |
| Kernel 직접 Mapping | PML4 1, PDPT 0, PDE 32~159 | `[0x8004000000, 0x8014000000)` | `[0, 256 MiB)` |

두 번째 PDE 배열에서 256 Byte를 건너뛰는 코드는 `256 / 8 = 32`번째 Entry에서 시작한다는 뜻이다. PML4 1번의 512 GiB와 PDE 32번의 64 MiB가 합쳐져 `LOADER_KERN_BASE=0x8004000000`이 된다. 이 상수는 커널 이미지가 적재되는 물리 주소 `0x200000`과 역할이 다르다.

Identity Mapping은 Paging을 켜는 직후의 명령과 낮은 주소 접근을 이어 준다. Kernel Mapping은 링크된 높은 VA로 C 코드를 실행할 준비를 한다. `RELOC(x)`는 아직 높은 주소를 사용할 수 없는 구간에서 `x - LOADER_KERN_BASE`를 계산한다. 이름을 바꾸는 매크로가 별도의 Mapping을 설치하는 것은 아니다. [부트 Page Table 구성](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/start.S)

## 64 Bit 코드와 main으로 넘어간다

Table을 준비한 뒤 CR3에 PML4의 물리 주소를 넣고, EFER의 LME·SCE 비트와 CR0의 PG를 설정한다. IA-32e 모드 활성화와 64 Bit 코드 Segment로의 전환은 순서가 있는 단계다. 이 코드는 64 Bit GDT를 읽고 `lret`으로 `entry_64`에 들어간다.

`entry_64`는 RBP를 0으로 만들고 RSP를 `LOADER_KERN_BASE + 0x1000`으로 설정한 뒤 높은 주소의 `main`을 호출한다. 앞서 Loader가 쓰던 임시 Stack과 이 부트 Stack을 구분해야 한다. 주소 공간과 호출 Stack의 관계는 [주소 공간](/wiki/computer-systems-network-topic-3521ee6344f1/)에서 이어진다.

현재 `bootstrap` 앞부분에는 CPU 지원을 확인하려는 CPUID 관련 명령이 있지만, `EAX=0`으로 호출한 뒤 `LONG_MODE` 비트를 검사하는 `test` 다음에 결과를 처리하는 조건 분기가 없다. 이 코드를 완성된 Long Mode 지원 검사로 볼 수는 없다. 지원하지 않는 CPU를 거부하는지까지 확인하려면 해당 검사 경로를 따로 검증해야 한다. 여기서는 소스의 제어 흐름을 읽었으며 실제 CPU를 바꾸어 부팅한 결과를 포함하지 않는다.

`main()`은 BSS를 비우고 명령행을 해석한 뒤 Thread와 Console, 메모리 할당자와 Kernel Page Table을 준비한다. 이어 인터럽트와 장치, 빌드 옵션에 따른 사용자 프로그램 기능을 초기화한다. `thread_start()`에서 인터럽트를 허용한 뒤에도 Serial Queue·Timer 보정·디스크·파일 시스템·VM 초기화가 남아 있다. 모든 빌드가 모든 기능을 포함하는 것은 아니므로 `USERPROG`·`FILESYS`·`VM` 조건을 함께 읽는다. [main의 초기화 순서](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/init.c)

Linux의 부팅 경로는 Firmware와 아키텍처, 이미지 형식에 따라 달라진다. EFI Stub을 포함한 커널은 기존 EFI Bootloader 없이도 EFI 실행 이미지로 적재할 수 있다. PintOS의 Sector 단위 BIOS Loader나 옛 GRUB의 Stage 구성을 모든 Linux 부팅에 대응시키지는 않는다. [Linux EFI Boot Stub](https://docs.kernel.org/admin-guide/efi-stub.html)

## 사용할 메모리를 먼저 구분한다

Kernel은 부팅 직후부터 자신이 사용할 메모리와 보존해야 할 영역을 알아야 한다. Firmware가 RAM으로 보고한 범위에도 이미 Kernel 이미지나 부트 정보가 들어 있을 수 있다. 페이지 할당기는 사용 가능한 주소 구간을 읽고, 자신의 관리 공간까지 예약한 다음 남은 페이지를 공개해야 한다.

PintOS `5afaa6d`에서는 `loader.S`가 BIOS의 E820 기능으로 메모리 맵을 수집하고, `palloc_init()`이 이를 두 Pool과 Bitmap으로 바꾼다. 그 뒤에 `malloc_init()`과 `paging_init(mem_end)`가 실행된다. [초기화 순서](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/init.c)

E820은 RAM 그 자체가 아니라 Guest 물리 주소 구간의 용도를 설명하는 자료다. QEMU의 `-m`은 Guest RAM의 크기를 지정하고, Guest Firmware가 주소별 사용 가능·예약 상태를 보고한다. 이 레포의 `tests/Make.tests`는 `MEMORY=20`을 사용하고, 직접 실행 Wrapper `utils/pintos`의 기본값은 256이다. `-m`으로 바꿀 수 있으므로 모든 실행이 20 MiB라는 전제는 맞지 않는다. 지정한 RAM 크기와 palloc의 빈 페이지 수 역시 같은 값이 아니다.

## Loader가 전달하는 주소와 구간

[`loader.S`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/loader.S)는 `EAX=0xe820`, `EDX=0x534d4150`, `ECX=24`를 설정해 `int 0x15`를 호출한다. 응답을 반복해서 저장한 뒤 Multiboot 정보에 전체 길이와 맵의 시작 주소를 기록한다.

| 값 | 이 구현에서의 역할 |
|---|---|
| `MULTIBOOT_INFO=0x7000` | 부트 정보 구조체의 물리 주소 |
| `MULTIBOOT_MMAP_LEN` | 구조체 시작에서 44바이트 뒤에 있는 맵 길이 필드 |
| `MULTIBOOT_MMAP_ADDR` | 48바이트 뒤에 있는 맵 주소 필드 |
| `E820_MAP=0x7034` | C 코드가 E820 레코드 배열로 읽는 시작점 |
| `LOADER_PHYS_BASE=0x200000` | Kernel 이미지의 시작 물리 주소 |
| `LOADER_KERN_BASE=0x8004000000` | Kernel 직접 Mapping의 VA 오프셋 |

`palloc.c`의 `struct e820_entry`는 32비트 필드 여섯 개로 구성된다. 시작 주소와 길이는 각각 상·하위 32비트를 `((uint64_t)hi<<32)+lo`로 합친다. 길이 size인 구간은 `[start,start+size)`로 읽으며 끝 주소는 포함하지 않는다. 이 코드는 맵 길이를 `sizeof(struct e820_entry)`로 나누고 고정된 24바이트 간격으로 순회한다. 이 배치를 다른 부트 프로토콜의 공통 규칙으로 볼 수는 없다.

부트 정보에 있는 물리 주소를 C 포인터로 접근할 때는 `ptov()`를 쓴다. 예를 들어 `0x7034`는 Kernel VA `0x8004007034`가 된다. 여기서 더하는 상수는 이 레포의 직접 Mapping 규칙이며, `ptov()`가 Page Table을 새로 만들거나 메모리를 할당하는 것은 아니다. 주소별 역할은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서 이어진다.

## E820의 요약과 Pool 경계를 나눠 읽는다

[`resolve_area_info()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/palloc.c)는 type 1인 `USABLE`과 type 3인 `ACPI_RECLAIMABLE`을 합산한다. 후자까지 즉시 사용하는 것은 이 코드의 정책이며 모든 Firmware 환경에서 ACPI 자료를 바로 덮어써도 된다는 의미는 아니다.

시작 주소가 1 MiB보다 낮으면 `base_mem`, 나머지는 `ext_mem`으로 분류한다. 각 area의 `start/end`는 포함된 구간들의 바깥 경계이고, `size`는 사용 가능하다고 받아들인 길이의 합이다. 중간에 예약된 Hole이 있으면 `end-start`와 `size`가 다르다. 경계 안의 모든 주소를 free로 처리해서는 안 되는 이유다.

`populate_pools()`은 `(base_mem.size+ext_mem.size)/PGSIZE`로 페이지 수를 계산한다. User Pool의 목표는 `min(total_pages/2,user_page_limit)`, Kernel Pool의 목표는 나머지다. `user_page_limit`은 기본 `SIZE_MAX`이고 `-ul` 옵션으로 제한할 수 있다. 가정한 usable 용량 자체가 20 MiB라면 5,120페이지, 기본 User 몫은 2,560페이지다. 한도를 1,000으로 정하면 Kernel의 목표는 4,120페이지가 된다. 이 계산은 실제 E820에 Hole이 없는 20 MiB를 가정했을 때의 값이다.

Kernel 몫을 먼저 배정하는 순회에는 `KERN_START → KERN → USER_START 또는 USER` 상태가 있다. `rem`은 남은 페이지 수이며 `size`는 현재 레코드의 바이트 수, `size_in_pg`는 그 페이지 수다. Kernel 경계가 레코드 중간에 놓이면 `start+rem*PGSIZE`로 경계를 정하고 남은 부분을 User Pool 쪽에 포함한다. `user_pages-size_in_pg+rem`은 현재 레코드의 뒷부분을 반영한 뒤 더 필요한 User 페이지 수를 나타낸다.

이 구현의 `case USER`에는 `ASSERT(rem==size)`가 남아 있다. 앞에서 rem을 페이지 단위로 관리하고 size를 바이트로 읽었으므로 단위가 맞지 않는다. 이 분기에 도달했는지와 실제 부팅 실패 여부는 구체적인 E820 입력으로 확인해야 한다. 코드에 있는 비교를 올바른 일반 알고리즘으로 옮기거나, 이 한 줄만으로 모든 부팅이 실패한다고 단정하지 않는다.

## Kernel과 Bitmap을 다시 할당하지 않게 한다

[`kernel.lds.S`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/kernel.lds.S)는 Kernel을 `LOADER_KERN_BASE+LOADER_PHYS_BASE`에서 시작하고 `.text`, `.rodata`, `.data`, `.bss`를 배치한 뒤 `_end`를 제공한다. BSS는 0으로 초기화할 전역·static 데이터의 영역이다. 메모리 지도에서 읽은 용량만 보고 이 영역을 빈 공간으로 돌려주면 실행 중인 Kernel을 덮어쓰게 된다.

`free_start=pg_round_up(&_end)`는 Kernel 이미지 다음 페이지 경계다. `init_pool()`은 Pool이 관리할 주소 범위와 Bitmap이 저장될 주소를 각각 설정한다.

- `p->base`: Pool의 0번 페이지 주소다.
- `p->used_map`: `_end` 뒤의 버퍼에 배치한 Bitmap 객체다.
- `bm_pages`: 이름과 달리 페이지 개수가 아니라 페이지 크기로 올린 **바이트 수**다.

Bitmap 용량은 Pool의 `[start,end)` 주소 폭을 `PGSIZE`로 나누어 정한다. 따라서 그 사이의 예약 Hole도 비트 위치를 차지한다. `init_pool()`은 일단 모든 유효 비트를 true로 막고, 두 Bitmap을 배치한 만큼 `free_start`를 이동한다. 여기까지의 끝 주소가 `usable_bound`다.

다음 E820 순회에서만 실제 free 페이지를 연다. 구간 시작과 `usable_bound` 중 큰 값을 페이지 경계로 올리고, 해당 주소가 속한 Pool을 찾는다. 인덱스는 `pg_no(start)-pg_no(pool->base)`다. 한 E820 구간이 Pool 경계를 넘으면 `pool_end`에서 잘라 현재 Pool의 비트를 먼저 false로 만들고, 다음 Pool에서 나머지를 처리한다.

이 방식에서는 낮은 주소의 부트 자료뿐 아니라 `_end` 뒤의 Bitmap 자체도 예약 상태로 남는다. 커널 시작 전의 낮은 메모리를 추가로 활용하라는 TODO가 있어, Firmware가 usable이라고 보고한 페이지가 모두 free로 공개되지는 않는다. 또한 Pool의 Bitmap 용량과 할당 가능한 비트 수를 같은 숫자로 읽어서는 안 된다.

### 예약된 Hole이 있는 작은 메모리 지도

다음 모형은 Guest RAM의 끝을 20 MiB로 두되 `[0x9f000,0x100000)`을 예약한다. `_end`는 물리 주소로 환산한 `0x258321`이라고 가정한다. 사용 가능한 페이지의 앞부분을 Kernel 몫으로 정하고, Bitmap 공간까지 제외한 최종 free 수를 구한다. 실제 `populate_pools()`의 상태 머신이나 앞서 지적한 ASSERT를 그대로 재현하는 코드는 아니다.

```run-python
PAGE = 4096
KERN_BASE = 0x8004000000
regions = [(0,0x9f000,1),(0x9f000,0x100000,2),(0x100000,0x1400000,1)]
usable = [pa for start,end,kind in regions if kind in (1,3)
          for pa in range(start,end,PAGE)]
total = len(usable)
user_goal = total//2
kernel_goal = total-user_goal
split = usable[kernel_goal-1]+PAGE
pools = [('kernel',usable[0],split),('user',split,regions[-1][1])]
kernel_end = 0x258321
cursor = ((kernel_end+PAGE-1)//PAGE)*PAGE
print('usable_pages',total,'kernel_goal',kernel_goal,'user_goal',user_goal)
print('pool_split_pa',hex(split),'rounded_kernel_end',hex(cursor))
for name,start,end in pools:
    capacity = (end-start)//PAGE
    buffer_bytes = 16+((capacity+63)//64)*8
    reserved = ((buffer_bytes+PAGE-1)//PAGE)*PAGE
    print(name,'bitmap_capacity',capacity,'bitmap_bytes',buffer_bytes,'reserved',reserved)
    cursor += reserved
print('usable_bound_pa',hex(cursor),'kva',hex(KERN_BASE+cursor))
for name,start,end in pools:
    free = [pa for pa in usable if start <= pa < end and pa >= cursor]
    first_index = (free[0]-start)//PAGE if free else None
    print(name,'first_free_index',first_index,'free_pages',len(free))
assert len(usable) == 5023
assert cursor == 0x25b000
assert all(not (0x9f000 <= pa < 0x100000) for pa in usable)
```

같은 20 MiB 주소 끝을 가정해도 usable 합은 5,023페이지다. Kernel 몫은 2,512페이지지만 그 Pool의 주소 폭에는 예약 Hole까지 포함된다. 반면 `_end`와 Bitmap을 제외한 free 수는 더 작다. 목표 배분량, Bitmap 용량, 실제 빈 페이지를 나누어 읽으면 부트 로그의 숫자를 비교하기 쉬워진다.

## 할당기의 초기화와 주소 Mapping

`palloc_init()`은 E820 요약을 출력하고 Pool을 만든 뒤 `ext_mem.end`를 반환한다. 이후 `malloc_init()`이 작은 블록 할당기를 초기화한다. `paging_init(mem_end)`는 palloc에서 Page Table용 페이지를 받아 `[0,mem_end)`의 물리 주소에 Kernel 직접 Mapping을 구성한다. Kernel 코드·읽기 전용 데이터 구간에는 쓰기 권한을 제거하고 새 CR3를 활성화한다. 부트 초기의 기존 Mapping과 이 시점에 다시 구성하는 Page Table을 구분해야 한다.

이후 할당 요청은 [메모리 관리](/wiki/computer-systems-network-topic-d160fea60072/)에서 다루는 Bitmap 검색과 반환 주소 계산으로 이어진다. QEMU가 PintOS의 Pool을 대신 관리하는 것은 아니다. Guest 물리 주소의 RAM backing과 장치 접근은 QEMU의 MemoryRegion 계층이 담당하며, 어떤 페이지를 어느 용도로 빌려줄지는 Guest Kernel이 정한다. [QEMU 메모리 API](https://www.qemu.org/docs/master/devel/memory.html)

Linux의 부트 메모리 관리도 일반 페이지 할당기를 사용할 수 있기 전에 사용 가능·예약 구간을 먼저 관리한다. `memblock`은 이 구간과 필요에 따라 NUMA Node 정보를 보관하고, 아키텍처의 초기화가 진행되면 사용할 페이지를 Buddy 할당기로 넘긴다. 실제 Zone 구성은 아키텍처와 설정에 따라 달라지므로 DMA·DMA32·Normal·HighMem이 모든 시스템에 동시에 존재한다고 가정하지 않는다. [Linux 부트 메모리 관리](https://docs.kernel.org/core-api/boot-time-mm.html)

Windows는 Free·Zeroed뿐 아니라 Standby·Modified, 프로세스 Working Set 등 서로 다른 상태와 사용량을 구분한다. 이것들을 PintOS의 두 Pool이나 비트 하나에 그대로 대응시킬 수는 없다. [Windows 메모리 통계](https://learn.microsoft.com/en-us/windows/win32/memory/memory-performance-information)

실제 주소를 확인할 때는 부트 로그의 E820 entry, `_end`, `kernel_pool.base`, `user_pool.base`, 각 Bitmap의 `bit_cnt`와 free 비트 수를 대조한다. `palloc_get_page()`를 디버거에서 호출하면 관찰을 넘어 페이지를 실제로 할당한다. 이미 수행되는 할당의 반환값을 확인하고, `PAL_ZERO` 여부와 Debug 빌드의 `0xcc` 채움도 함께 읽는 편이 상태 변화를 해석하기 쉽다.
