---
layout: default
title: 실행 파일 적재
nav_order: 2
permalink: /wiki/computer-systems-network-topic-a6a32eb78db0/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-a6a32eb78db0
projection_sha256: fd77926e2915d6be1d612f5004eda0bd3a74fae536755af91c6208dd7962497f
parent: 사용자 프로그램
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63dd07ba6393
search_terms:
- copy_in_string
- point_of_no_return
- FD_CLOEXEC
- e_entry
- _start
- load_bias
- AT_ENTRY
- AddressOfEntryPoint
grand_parent: PintOS
ancestor: CS 기초
---

# 실행 파일 적재
{: .no_toc }

실행 파일은 아직 실행 중인 프로세스가 아니다. 로더는 파일의 어느 바이트를 어떤 가상 주소에 배치할지 정하고, 페이지의 권한과 초기 Stack을 준비한 뒤 첫 명령어로 제어를 넘긴다. 파일 offset은 파일 안의 위치이고, 가상 주소는 프로세스가 실행 중에 사용하는 주소다. ELF 적재는 이 두 위치를 연결하는 작업이다.

여기서는 [lrn-pintos의 `process.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)를 기준으로 ELF64 x86-64 적재 경로를 읽는다. `#ifndef VM`의 즉시 적재와 `#else`의 Lazy Loading은 같은 소스 안에 있으므로 빌드 조건도 함께 확인해야 한다.

## Header에서 적재 대상을 찾는다

ELF는 Executable and Linkable Format의 약자다. ELF Header는 파일 형식과 대상 CPU, 진입점, 다른 Header Table의 위치를 알려 준다. Program Header는 적재할 Segment나 실행에 필요한 부가 정보를 기술한다. `.text`, `.data`, `.bss`는 Section 이름이며 Program Header 하나가 여러 Section을 포함할 수 있다. 따라서 Section 이름과 적재 Segment를 일대일로 대응시키지 않는다.

이 PintOS 로더는 Section Header Table을 읽지 않는다. ELF Header와 Program Header를 읽고 `PT_LOAD`가 지정한 바이트를 적재한다. Program Header Table이 반드시 ELF Header 바로 뒤에 온다고 가정하지도 않는다. 위치는 `e_phoff`가 정한다. [ELF Program Header 명세](https://refspecs.linuxfoundation.org/elf/gabi4+/ch5.pheader.html)

### ELF64 Header

이 구조체는 64바이트다. offset은 파일 시작을 기준으로 한다. [ELF Header 필드](https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.eheader.html)

| offset | 크기 | 필드 | 읽을 내용 |
|---|---|---|---|
| `0x00` | 16 | `e_ident` | Magic, Class, Endianness, 형식 버전 등 |
| `0x10` | 2 | `e_type` | 파일 종류. 이 구현은 `ET_EXEC = 2` 허용 |
| `0x12` | 2 | `e_machine` | 대상 CPU. x86-64는 `0x3e` |
| `0x14` | 4 | `e_version` | 형식 버전 |
| `0x18` | 8 | `e_entry` | 최초 실행할 가상 주소 |
| `0x20` | 8 | `e_phoff` | Program Header Table의 파일 offset |
| `0x28` | 8 | `e_shoff` | Section Header Table의 파일 offset |
| `0x30` | 4 | `e_flags` | CPU별 flag |
| `0x34` | 2 | `e_ehsize` | ELF Header 자체의 크기 |
| `0x36` | 2 | `e_phentsize` | Program Header 한 항목의 크기 |
| `0x38` | 2 | `e_phnum` | Program Header 개수 |
| `0x3a` | 2 | `e_shentsize` | Section Header 한 항목의 크기 |
| `0x3c` | 2 | `e_shnum` | Section Header 개수 |
| `0x3e` | 2 | `e_shstrndx` | Section 이름 문자열 Table의 인덱스 |

`read_elf_header()`는 먼저 64바이트를 모두 읽었는지 검사한다. 이어서 처음 7바이트가 `7f 45 4c 46 02 01 01`인지 확인한다. 앞의 4바이트는 ELF Magic이고, 뒤의 3바이트는 64비트·Little Endian·형식 버전 1을 나타낸다. `e_type`, `e_machine`, `e_version`, Program Header 크기 56바이트와 개수 1,024 이하도 확인한다.

Header에 필드가 있다는 사실과 이 로더가 그 필드를 검사한다는 사실은 다르다. 예를 들어 `e_ehsize`는 구조체에 들어 있지만 위 함수의 조건식에는 포함되지 않는다.

### Program Header

ELF64 Program Header 한 항목은 56바이트다. 다음 offset은 해당 항목의 시작을 기준으로 한다.

| offset | 크기 | 필드 | 의미 |
|---|---|---|---|
| `0x00` | 4 | `p_type` | Segment 또는 부가 정보의 종류 |
| `0x04` | 4 | `p_flags` | `PF_R = 4`, `PF_W = 2`, `PF_X = 1` |
| `0x08` | 8 | `p_offset` | 파일에서 읽을 시작 위치 |
| `0x10` | 8 | `p_vaddr` | Segment의 시작 가상 주소 |
| `0x18` | 8 | `p_paddr` | 물리 주소 관련 필드. 이 로더는 사용하지 않음 |
| `0x20` | 8 | `p_filesz` | 파일에 존재하는 바이트 수 |
| `0x28` | 8 | `p_memsz` | 메모리에서 필요한 바이트 수 |
| `0x30` | 8 | `p_align` | 정렬 조건 |

`load_program_headers()`는 `e_phoff + i * 56`에서 항목을 하나씩 읽는다. `read_program_header()`는 위치를 검사하고 56바이트를 모두 읽었는지 확인한다. 이후의 분기는 다음과 같다.

| `p_type` | 이 구현의 처리 |
|---|---|
| `PT_LOAD = 1` | 검증 후 `load_loadable_segment()`에서 적재 준비 |
| `PT_DYNAMIC = 2` | 거부 |
| `PT_INTERP = 3` | 거부 |
| `PT_SHLIB = 5` | 거부 |
| `PT_NULL = 0`, `PT_NOTE = 4`, `PT_PHDR = 6` | 건너뜀 |
| `PT_STACK = 0x6474e551` 및 나머지 값 | 건너뜀 |

`PT_INTERP`는 동적 링커와 같은 Interpreter의 경로를 나타내며 `PT_DYNAMIC`은 동적 링크 정보다. `PT_SHLIB`는 ABI에서 의미가 정해지지 않은 예약 항목이다. 이 셋을 모두 같은 동적 링크 기능이라고 설명할 필요는 없다. GNU Stack 항목을 건너뛴다는 것은 그 항목의 실행 권한 정책을 적용했다는 뜻도 아니다.

다음 예제는 Header 바이트를 만들고 다시 해석한다. 코드와 데이터 Segment를 포함한 실행 파일을 만드는 예제는 아니다. `ident`의 Magic이나 `machine`, `phnum`을 바꾸면 검증 결과도 확인할 수 있다.

```run-python
import struct

elf = struct.Struct('<16sHHIQQQIHHHHHH')
phdr = struct.Struct('<IIQQQQQQ')
ident = b'\x7fELF\x02\x01\x01' + bytes(9)
# 적재할 코드가 없는 Header 예제다. 실행 파일 자체를 만들지는 않는다.
raw = elf.pack(ident, 2, 62, 1, 0x400000, elf.size, 0,
               0, elf.size, phdr.size, 1, 0, 0, 0)
raw += phdr.pack(1, 5, 0x1000, 0x400000, 0, 0x2A00, 0x3000, 0x1000)

if len(raw) < elf.size:
    raise ValueError('ELF Header가 잘렸습니다.')
fields = elf.unpack_from(raw)
ident, kind, machine, version, entry, phoff = fields[:6]
phentsize, phnum = fields[9:11]
if not (ident[:7] == b'\x7fELF\x02\x01\x01'
        and kind == 2 and machine == 62 and version == 1
        and phentsize == phdr.size and phnum <= 1024):
    raise ValueError('이 예제의 ELF64 x86-64 조건과 다릅니다.')
if phoff + phentsize * phnum > len(raw):
    raise ValueError('Program Header Table이 잘렸습니다.')

print('ELF Header bytes:', elf.size)
print('Program Header bytes:', phdr.size)
print('magic:', ident[:4].hex(' '))
print(f'entry={entry:#x}, phoff={phoff:#x}, phnum={phnum}')
for i in range(phnum):
    kind, flags, offset, va, pa, filesz, memsz, align = phdr.unpack_from(
        raw, phoff + i * phentsize)
    print(f'[{i}] type={kind}, flags={flags:#x}, offset={offset:#x}, va={va:#x}')
    print(f'    filesz={filesz:#x}, memsz={memsz:#x}, align={align:#x}')
```

## 파일 바이트를 페이지에 나누기

`PT_LOAD`의 의미 있는 메모리 범위는 `p_vaddr`부터 `p_memsz`바이트다. 앞의 `p_filesz`바이트는 파일에서 읽고, 그 뒤의 `p_memsz - p_filesz`바이트는 0으로 초기화한다. `.bss`처럼 초기값이 0인 데이터는 파일에 같은 크기의 0을 저장하지 않고 이 차이로 표현할 수 있다.

페이지 단위로 적재하려면 그 앞뒤의 정렬 여백도 계산해야 한다. 파일과 가상 주소의 페이지 내 offset이 같을 때, PintOS는 다음 값을 구한다.

```text
file_page   = p_offset에서 페이지 내 offset을 뺀 위치
mem_page    = p_vaddr에서 페이지 내 offset을 뺀 주소
page_offset = p_vaddr의 하위 12비트
전체 범위    = page_offset + p_memsz를 4096의 배수로 올림
```

`p_filesz > 0`이면 `read_bytes = page_offset + p_filesz`다. Segment가 페이지 중간에서 시작하면 파일도 앞쪽 페이지 경계부터 읽으므로 `page_offset`을 더한다. 반면 `p_filesz == 0`이면 읽을 파일 데이터가 없으므로 `read_bytes = 0`으로 두고 전체 페이지 범위를 0으로 채운다. 어느 경우든 `zero_bytes = 전체 범위 - read_bytes`다.

BSS 크기와 `zero_bytes`를 구분해야 한다. `p_filesz = 0x48`, `p_memsz = 0x50`인 정렬된 Segment의 BSS는 8바이트다. 그러나 한 페이지에서 72바이트만 읽으므로 나머지 4,024바이트를 0으로 채운다. 이 값에는 BSS 밖의 페이지 여백도 포함된다.

아래 값은 계산을 위한 입력이다. 특정 `args-none` 또는 `args-single` 바이너리에서 관측한 출력으로 제시하지 않는다. 빌드 옵션과 소스가 달라지면 Program Header의 값도 달라진다.

```run-python
PAGE = 4096


def page_plan(offset, va, filesz, memsz):
    if min(offset, va, filesz, memsz) < 0 or memsz < filesz:
        raise ValueError('음수이거나 메모리 크기가 파일 크기보다 작습니다.')
    if offset % PAGE != va % PAGE:
        raise ValueError('파일과 가상 주소의 페이지 내 offset이 다릅니다.')
    inside = va % PAGE
    file_pos = offset - inside
    page_va = va - inside
    total = (inside + memsz + PAGE - 1) // PAGE * PAGE
    remaining_read = inside + filesz if filesz else 0
    remaining_zero = total - remaining_read
    rows = []
    while remaining_read or remaining_zero:
        read = min(remaining_read, PAGE)
        zero = PAGE - read
        rows.append((page_va, file_pos, read, zero))
        remaining_read -= read
        remaining_zero -= zero
        file_pos += read
        page_va += PAGE
    return rows


cases = [
    ('code', 0x1000, 0x400000, 0x4EF0, 0x4EF0),
    ('BSS only', 0x0F00, 0x405F00, 0, 0x524),
    ('data and BSS', 0x3000, 0x403000, 0x48, 0x50),
    ('inside a page', 0x1123, 0x401123, 13, 21),
]
for name, offset, va, filesz, memsz in cases:
    rows = page_plan(offset, va, filesz, memsz)
    print(f'\n{name}: {len(rows)} pages, BSS={memsz - filesz} bytes')
    for page_va, file_pos, read, zero in rows:
        location = f'{file_pos:#x}' if read else '-'
        print(f'va={page_va:#x}, file={location}, read={read}, zero={zero}')
```

`code`는 5페이지이며 마지막 페이지에서 `0xef0`바이트를 읽고 `0x110`바이트를 0으로 채운다. BSS는 0바이트여도 페이지 끝의 0 채움은 남는다. `BSS only`는 가상 주소의 페이지 내 offset이 `0xf00`이어서, 의미 있는 크기가 `0x524`바이트여도 2페이지를 준비한다.

`inside a page`에서는 Segment의 파일 데이터가 13바이트지만 페이지 경계부터 304바이트를 읽는다. 이 가운데 앞의 291바이트는 정렬 때문에 함께 읽는 범위다. BSS는 8바이트이며 나머지는 페이지 여백이다.

파일 크기를 `0x2a00`으로 바꾸면 4,096·4,096·2,560바이트로 나뉘고 마지막 페이지의 1,536바이트를 0으로 채운다. 두 Segment가 각각 5페이지와 1페이지이고 Stack 1페이지를 즉시 적재한다면 사용자 데이터 Frame은 7개, 28 KiB다. 이 계산에는 Page Table, 커널 객체, 파일 상태의 메모리가 포함되지 않는다.

### Segment 끝과 Page 끝은 다르다

`p_memsz - p_filesz`는 Segment 안에서 파일에 없는 바이트의 수다. 페이지를 모두 채우기 위해 0으로 만드는 양은 이보다 클 수 있다. 위 `page_plan()`에 다음 값을 넣어 비교할 수 있다. 표의 크기와 주소는 계산을 위한 입력이며 실제 바이너리를 측정한 값은 아니다.

| `p_offset` / `p_vaddr` | `p_filesz` / `p_memsz` | 페이지별 read | 페이지별 zero |
|---|---|---|---|
| `0x3000` / `0x404000` | `0xA30` / `0x1800` | 2,608 / 0 | 1,488 / 4,096 |
| `0x3020` / `0x8043020` | `0x100` / `0x200` | 288 | 3,808 |
| `0x1000` / `0x400000` | `0x2800` / `0x2800` | 4,096 / 4,096 / 2,048 | 0 / 0 / 2,048 |
| `0x4000` / `0x600000` | `0x100` / `0x3000` | 256 / 0 / 0 | 3,840 / 4,096 / 4,096 |

첫 행에서 Segment 자체의 0 초기화 영역은 `6,144 - 2,608 = 3,536`바이트다. 페이지 단위 zero 합계 5,584바이트에는 Segment 끝 이후의 2,048바이트도 포함된다. 둘째 행의 read 288바이트에는 정렬을 맞추기 위해 앞에서 읽는 32바이트가 들어 있다. 파일에 들어 있는 Segment의 크기는 여전히 256바이트다. 셋째 행은 `p_memsz == p_filesz`라 BSS가 없어도 마지막 Page의 남는 공간을 0으로 채운다.

명시적으로 초기화하지 않은 정적 저장 기간의 `int counter`나 `static char buffer[1024]`는 C의 초기화 규칙에 따라 0으로 초기화되며, 일반적인 ELF 도구에서는 이런 데이터를 BSS에 배치한다. 반면 `int answer = 42`는 보통 초기값을 파일에 저장한다. C의 언어 규칙과 ELF Section 배치는 다른 층의 약속이다. 모든 프로그램이 정확히 두 개의 `PT_LOAD`를 갖거나, BSS가 독립된 Loadable Segment여야 하는 것은 아니다.

## 적재 전에 검사하는 범위

`validate_segment()`는 다음 조건을 확인한다. ELF가 선언한 주소를 그대로 PTE에 기록하지 않고 파일과 사용자 주소 공간의 경계를 먼저 확인하는 단계다.

| 검사 | 조건 |
|---|---|
| 페이지 내 위치 | `p_offset % PGSIZE == p_vaddr % PGSIZE` |
| 파일 시작 위치 | `p_offset <= file_length(file)` |
| 크기 관계 | `p_memsz >= p_filesz` |
| 사용자 주소 범위 | 시작 주소와 끝 주소 모두 `KERN_BASE` 미만 |
| 주소 덧셈 | 64비트 덧셈이 감싸져 끝 주소가 시작보다 작아지지 않음 |
| 0번 페이지 | `p_vaddr >= PGSIZE` |

0번 페이지를 비워 두면 일반적인 NULL 포인터 접근이 유효한 사용자 Mapping으로 성공하는 일을 막을 수 있다. 파일 위치와 메모리 위치의 offset을 맞추는 조건은 페이지 단위 복사에서 같은 바이트가 같은 위치에 놓이게 한다. `p_memsz >= p_filesz`는 메모리 범위보다 많은 파일 데이터를 배치하려는 선언을 거부한다.

아래 모델은 이 함수의 검사 범위를 보여 준다. Python의 정수는 자동으로 64비트에서 넘치지 않으므로 끝 주소 계산에는 명시적으로 Mask를 적용했다.

```run-python
PAGE = 4096
KERNEL_BASE = 0x8004000000
U64_MASK = (1 << 64) - 1


def rejected_by(offset, va, filesz, memsz, file_length):
    if any(n < 0 or n > U64_MASK for n in (offset, va, filesz, memsz)):
        raise ValueError('ELF64 필드는 64비트 부호 없는 정수여야 합니다.')
    end = (va + memsz) & U64_MASK
    checks = [
        ('page offset', offset % PAGE == va % PAGE),
        ('file offset', offset <= file_length),
        ('memory size', memsz >= filesz),
        ('user range', va < KERNEL_BASE and end < KERNEL_BASE),
        ('address wrap', end >= va),
        ('page zero', va >= PAGE),
    ]
    return [name for name, passed in checks if not passed]


base = dict(offset=0x1000, va=0x401000, filesz=0x2A00,
            memsz=0x3000, file_length=0x5000)
cases = [
    ('valid', {}),
    ('different page offset', dict(offset=0x1001)),
    ('offset past EOF', dict(offset=0x6000)),
    ('memory too small', dict(memsz=0x100)),
    ('cross kernel boundary', dict(va=KERNEL_BASE - PAGE)),
    ('wrapped end', dict(va=0x400000, memsz=(1 << 64) - 0x200000)),
    ('page zero', dict(va=0)),
    ('data extends past EOF', dict(file_length=0x1100)),
]
for name, changes in cases:
    failures = rejected_by(**(base | changes))
    print(name + ': ' + (', '.join(failures) if failures else 'passes these checks'))
```

마지막 입력은 파일 데이터의 끝이 EOF를 넘지만 이 여섯 검사를 통과한다. 함수가 확인하는 것은 `p_offset`의 범위이며 `p_offset + p_filesz` 전체가 아니기 때문이다. 이후 실제 읽기가 요청 크기를 채우지 못하면 즉시 적재는 실패하고, Lazy Loading에서는 해당 페이지를 읽는 시점에 실패한다. 따라서 이 함수의 통과를 완전한 ELF 유효성 검증과 같게 보지 않는다.

이 코드에는 `p_memsz == 0`을 별도로 거부하는 조건이나 일반적인 `p_align` 유효성 검사도 없다. 또한 64비트 Header의 크기 값을 `uint32_t read_bytes`와 `zero_bytes`로 옮긴다. 큰 입력까지 지원하려면 덧셈, 형 변환, 파일 범위와 자원 제한을 함께 검토해야 한다.

## 즉시 적재와 Lazy Loading

`load()`는 새 PML4를 만들고 활성화한 뒤 명령줄을 복사해 인자를 나눈다. 실행 파일을 열어 쓰기 금지를 설정하고, Header와 Segment를 검사한 다음 Stack과 초기 실행 상태를 만든다.

```mermaid
flowchart TD
    H["ELF와 Program Header 검증"] --> S["PT_LOAD의 페이지 범위 계산"]
    S --> E["VM 미사용<br/>Frame 할당·파일 읽기·0 채움"]
    E --> P["사용자 PTE 설치"]
    S --> L["VM 사용<br/>SPT에 초기화 정보 등록"]
    L --> F["해당 페이지의 Claim<br/>Frame 확보·파일 읽기·0 채움"]
    P --> R["사용자 주소로 접근"]
    F --> R
```

VM을 사용하지 않는 `load_segment()`는 `PAL_USER`로 Frame을 얻고 `file_read_at()`으로 필요한 바이트를 읽는다. 정확한 크기를 읽지 못하면 방금 얻은 Frame을 반환하고 실패한다. 남은 범위를 `memset()`으로 0으로 채운 뒤 `install_page()`로 Mapping을 설치한다. 설치에 실패해도 그 Frame을 반환한다.

`install_page()`는 중복 Mapping을 검사하고 `pml4_set_page()`를 호출한다. PTE에는 Frame의 물리 주소와 `PTE_P`, `PTE_U`, 필요한 경우 `PTE_W`가 들어간다. `kpage`는 커널이 Frame을 다루는 가상 주소이므로 `vtop(kpage)`로 물리 주소를 구한다. ELF의 `PF_R`, `PF_W`, `PF_X` 중 이 적재 경로가 권한 판단에 쓰는 것은 `PF_W`다. [PintOS Page Table 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

VM을 사용하는 `load_segment()`는 아직 사용자 데이터 Frame을 만들지 않는다. 대신 페이지마다 `struct page`, 파일을 다시 연 참조, 파일 offset과 읽기·0 채움 크기를 준비해 SPT에 넣는다. 목표 종류는 `VM_ANON`이며, 최초 상태는 초기화 전인 UNINIT이다. 나중에 `vm_claim_page()`나 Page Fault 처리에서 Frame을 확보하고 `lazy_load_segment()`가 파일을 읽는다. 읽기가 끝나면 콜백이 자신의 파일 참조와 aux를 정리한다.

Lazy Loading도 Metadata 메모리를 사용한다. 또한 `setup_stack()`은 Stack 페이지를 등록한 직후 Claim하므로 초기 Stack까지 첫 사용자 Page Fault로 미루지는 않는다. 필요한 페이지가 적으면 초기 파일 읽기와 Frame 할당을 줄일 수 있지만, 모든 실행에서 더 빠르다거나 처음 실행할 때 Page Fault가 없어야 한다고 단정할 수는 없다. 권한 위반이나 잘못된 주소에 의한 Page Fault는 즉시 적재에서도 발생할 수 있다. [SPT 등록과 Claim 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)

## Stack과 최초 실행 상태

이 소스의 `USER_STACK`은 `0x47480000`이고 초기 Stack 페이지는 `0x4747f000`부터 그 직전까지다. `setup_stack()`은 처음 `RSP`를 `USER_STACK`으로 두지만, `setup_initial_stack()`이 인자 문자열과 포인터를 넣으면서 최종 `RSP`를 낮춘다. 따라서 `load()`가 끝난 뒤에도 `RSP == USER_STACK`이라고 예상하면 안 된다.

명령줄은 공백을 기준으로 분리하며 `argv` 배열은 최대 64개 인자를 받는다. 초기 Stack에는 문자열, 정렬 여백, `argv[argc]`의 NULL, 인자 포인터와 가짜 반환 주소가 들어간다. `RDI`에는 `argc`, `RSI`에는 `argv` 주소를 넣는다. Linux처럼 환경 변수와 Auxiliary Vector를 함께 구성하는 경로는 아니다. 인자의 자세한 배치는 [인자 전달](/wiki/computer-systems-network-topic-1217820258bd/)에서 이어서 다룬다.

Segment와 Stack 준비가 성공하면 `if_->rip = ehdr.e_entry`를 설정하고 `process_exec()`가 `do_iret()`로 사용자 실행 상태를 복원한다. 실행 파일의 참조는 [파일시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/#실행-파일의-쓰기를-막는-이유)에서 설명하는 쓰기 보호 수명과 함께 유지된다.

## e_entry에서 첫 명령어까지

ELF64 Header의 `e_entry`는 파일 offset `0x18`에 놓인 8바이트 값이다. 파일 안에서 실행할 코드를 찾는 offset이 아니라 실행을 시작할 가상 주소다. 이 PintOS의 구조체 이름은 `struct ELF`이고, `load()`는 Segment 적재와 초기 Stack 준비가 끝난 뒤 `if_->rip = ehdr.e_entry`를 수행한다. 이 대입만으로 CPU의 RIP가 즉시 바뀌지는 않는다. 커널이 계속 실행하다가 `do_iret()`로 준비한 문맥을 복원할 때 제어가 넘어간다.

PintOS의 [User Linker Script](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/user/user.lds)는 `.text`를 `0x400000`부터 배치하고 `ENTRY(_start)`를 선언한다. `_start`가 항상 `.text`의 첫 바이트에 놓이는 것은 아니다. 링크할 Object의 내용과 배치에 따라 심볼의 주소가 달라질 수 있으므로 `args-single`이나 `halt`의 진입 주소는 해당 빌드의 ELF에서 읽어야 한다. `_start()`는 `main(argc, argv)`를 호출하고 그 반환값을 `exit()`에 전달한다. [User 진입 함수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/user/entry.c)

| 관찰하는 값 | 위치 | 달라지는 시점 |
|---|---|---|
| `ehdr.e_entry` | 커널이 읽은 ELF Header | 실행 파일을 읽을 때 |
| `if_->rip` | 커널 메모리의 복귀 프레임 | `load()` 마지막 대입 뒤 |
| CPU의 RIP | 실행 중인 CPU 상태 | `iretq`가 복귀 상태를 반영할 때 |
| 첫 명령어 바이트 | 사용자 가상 주소의 Mapping | 즉시 적재 또는 Lazy Page 초기화 이후 접근 가능 |

진입점이 있다는 사실과 그 위치에서 실행할 수 있다는 사실은 다르다. 현재 로더는 각 `PT_LOAD`의 범위를 검사하지만, `e_entry`가 실제 적재 Segment 안에 있는지 별도로 대조하지 않는다. Header를 읽고 Stack을 준비하는 데 성공해도 첫 명령어를 가져오는 과정에서 실패할 수 있다.

주소가 canonical이고 유효한 Lazy Page가 등록되어 있다면 첫 Instruction Fetch의 Page Fault가 정상적인 적재 계기가 될 수 있다. 반면 미등록 주소나 사용자에게 허용되지 않은 Mapping은 다른 문제다. Supervisor Mapping의 코드를 CPL 3에서 가져오면 접근 권한 위반이고, non-canonical RIP는 Page Table 조회 실패와도 구분한다. 따라서 `e_entry >= KERN_BASE`라는 비교 하나로 모든 실패를 `#PF`라고 설명하지 않는다. 이 구현이 ELF의 실행 권한 `PF_X`를 별도로 적용하지 않는다는 점도 Segment의 존재 여부와 나눠 확인해야 한다.

프레임에서는 `rip`이 `0x98`, `cs`가 `0xa0`에 있다. GDB에서 `x/gx $rdi+0xa0`으로 진입점을 확인하려 하면 CS를 읽게 된다. 구조체 타입으로 `tf->rip`을 읽고, 현재 빌드의 `iretq` 직전 프레임과 직후 RIP를 비교하는 절차는 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에서 다룬다.

## exec는 같은 프로세스의 프로그램을 바꾼다

`fork()`는 자식을 만들지만 `exec()`는 현재 프로세스가 실행할 프로그램을 바꾼다. 이 PintOS의 `process_exec()`는 같은 Thread에서 실행되므로 tid와 Kernel Stack을 유지한다. 부모가 종료 상태를 읽을 `self_status`와 자신의 자식 목록도 새로 만들지 않는다. 성공한 exec에서는 일반 파일의 fd Table도 그대로 사용한다.

교체되는 것은 사용자 주소 공간과 실행 파일 참조다. 이전 코드·데이터·Stack·mmap을 정리하고, 새 프로그램의 PML4와 SPT, 초기 Stack을 준비한다. 자원별 회수 순서는 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)의 주소 공간 정리와 같다. 다만 성공한 exec는 Thread를 종료하지 않고 새 프로그램으로 이어진다.

| 상태 | 성공한 PintOS exec 전후 |
|---|---|
| tid와 Kernel Stack | 유지한다 |
| 일반 파일의 fd Table | 열린 파일과 현재 위치를 유지한다 |
| `self_status`와 자식 상태 목록 | 기존 부모·자식 관계를 유지한다 |
| 사용자 PML4·SPT와 코드·데이터·Stack | 이전 내용을 정리하고 새 이미지로 구성한다 |
| `running_file` | 이전 실행 파일을 닫고 새 실행 파일의 쓰기 보호를 유지한다 |
| 사용자 RIP·RSP | 새 Entry Point와 인자 배치를 마친 Stack으로 바꾼다 |

시스템 콜의 `exec()`는 먼저 `copy_in_string()`으로 명령줄을 Kernel Page에 복사한다. 곧 이전 사용자 주소 공간을 파괴하므로, 그 안의 문자열을 계속 참조해서는 안 되기 때문이다. 이 함수는 최대 한 Page 안에서 문자열 끝을 찾고 주소를 확인한다. 잘못된 주소, 길이 초과, 복사 공간 할당 실패는 `process_exec()`에 들어가기 전에도 `exit(-1)`로 이어질 수 있다. [명령줄 복사와 exec 호출](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c)

### 새 주소 공간을 준비하는 순서

`process_exec()`는 자신의 Kernel Stack에 지역 변수 `intr_frame`을 둔다. 스케줄러가 저장하는 `thread->tf`를 새 프로그램의 초기 프레임으로 덮어쓰지 않는다. 사용자 Code Selector는 `0x23`, Data·Stack Selector는 `0x1b`, 초기 RFLAGS는 `FLAG_IF | FLAG_MBS`, 즉 `0x202`다. 이 값은 현재 저장소의 GDT 정의를 기준으로 하며 다른 구현의 `0x2b`·`0x33`과 섞지 않는다.

프레임 전체를 0으로 초기화하는 코드는 없다. Segment와 Flag를 먼저 설정하고, 적재 과정에서 RIP·RSP·RDI·RSI를 채운다. 따라서 나머지 일반 레지스터가 모두 0이라고 예상해서는 안 된다. [초기 프레임과 exec 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c), [Selector 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/loader.h)

| 단계 | VM 빌드 | non-VM 빌드 |
|---|---|---|
| 이전 이미지 정리 | `process_cleanup()` 뒤 `close_running_file()` | `close_running_file()` 뒤 `process_cleanup()` |
| SPT 준비 | `supplemental_page_table_init()`으로 다시 초기화 | SPT를 사용하지 않음 |
| 새 이미지 적재 | `load()`가 PML4, Lazy Page와 초기 Stack 준비 | `load()`가 PML4, 데이터 Frame과 초기 Stack 준비 |
| 마지막 처리 | 명령줄 Kernel Page를 반환하고, 성공하면 `do_iret()` | 동일 |

VM에서 SPT를 먼저 정리하는 것은 Lazy Page와 파일에 연결된 자원을 실행 파일 참조의 수명과 맞추기 위해서다. 파괴한 Hash Table을 초기화하기 전까지 정상적인 SPT처럼 탐색해서는 안 된다. `load()` 내부에서 인자를 나누려고 만든 별도의 명령줄 복사본은 `load()`가 정리하고, 시스템 콜이 전달한 복사본은 `process_exec()`가 정리한다.

### 실패해도 이전 프로그램으로 돌아갈 수 있을까

이 구현은 새 실행 파일을 열기 전에 이전 주소 공간을 정리한다. 따라서 파일 열기, Header 검사, Segment나 Stack 준비가 실패해도 이전 이미지로 돌아갈 수 없다. `load()`의 실패를 받은 `process_exec()`는 `-1`을 반환하고, 시스템 콜의 `exec()`는 이를 `exit(-1)`로 처리한다. 그 종료 경로에서 남아 있는 새 주소 공간과 일반 파일도 정리한다. “exec가 실패하면 사용자 호출 지점에서 계속 실행된다”는 규칙을 이 PintOS에 적용하면 안 된다.

아래 모델은 이미지 교체의 성공과 실패를 비교한다. 실제 Page Table이나 파일을 조작하지 않으며, 예제의 `fds`는 열린 파일 상태를 나타내는 작은 Dictionary다.

```run-python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class Process:
    tid: int = 7
    image: Optional[str] = "program-A"
    kernel_stack: str = "kernel-stack-7"
    fds: dict = field(default_factory=lambda: {3: ("notes.txt", 20)})
    exited: bool = False
    exit_status: Optional[int] = None


def replace_program(load_succeeds):
    process = Process()
    original_tid = process.tid
    original_stack = process.kernel_stack
    original_fds = process.fds
    print("exec 전:", process.image, dict(process.fds))

    process.image = None  # 이 PintOS는 이전 이미지를 먼저 정리한다.
    if load_succeeds:
        process.image = "program-B"
        assert process.tid == original_tid
        assert process.kernel_stack == original_stack
        assert process.fds is original_fds
        assert process.fds[3] == ("notes.txt", 20)
        print("새 프로그램 시작:", process.image, dict(process.fds))
    else:
        # process_exec()의 실패를 시스템 콜 exec()가 종료로 처리한다.
        process.exited = True
        process.exit_status = -1
        process.fds.clear()
        print("프로세스 종료:", process.exit_status, dict(process.fds))

    assert process.image != "program-A"
    print("이전 프로그램의 exec 호출 다음으로 복귀하지 않습니다.\n")


replace_program(load_succeeds=True)
replace_program(load_succeeds=False)
```

Linux도 모든 exec 실패를 되돌릴 수 있는 것은 아니다. 준비 단계의 오류는 기존 프로그램에 반환할 수 있지만, Linux v6.12의 `begin_new_exec()`가 `point_of_no_return`을 설정한 뒤에는 이후 오류를 치명적인 실패로 처리한다. 이 Flag는 `exec_mmap()`보다 먼저 설정된다. 따라서 경계를 단순히 “PML4를 바꿨는가”로 판단하지 않는다. 이후 실패 경로는 기존의 치명적 Signal이 없으면 SIGSEGV를 보낸다. [Linux의 교체 확정 시점과 실패 처리](https://github.com/torvalds/linux/blob/v6.12/fs/exec.c#L1149)

Linux의 fd도 별도 규칙을 따른다. 일반 fd는 유지되지만 `FD_CLOEXEC`가 설정된 fd는 닫는다. Signal 처리 방식과 다른 Thread, 환경 변수와 Auxiliary Vector 등의 처리까지 이 PintOS의 단일 Thread·fd Table 모델로 설명하지 않는다. [execve가 바꾸는 프로세스 속성](https://man7.org/linux/man-pages/man2/execve.2.html)

## 바이너리와 GDB에서 확인하기

실제 테스트 바이너리가 있는 Linux 또는 Cross Toolchain 환경에서는 Header를 먼저 확인한다. 경로는 저장소 루트 기준이다.

```sh
file pintos/userprog/build/tests/userprog/args-none
readelf -h -l pintos/userprog/build/tests/userprog/args-none
```

`objdump -f -p`도 파일 형식과 Program Header를 살펴보는 데 사용할 수 있다. 출력에서 entry, Segment 수, 파일 offset과 크기를 읽은 뒤 위 계산 예제의 입력에 넣는다. `.text`와 `.data` Segment가 항상 두 개라는 전제는 두지 않는다.

GDB에서는 디버그 심볼이 있는 커널과 연결한 뒤 함수의 진입점에 중단점을 둔다. 다음은 Header를 읽기 전과 읽은 뒤를 구분하는 명령이다.

```gdb
break read_elf_header
continue
set $header = ehdr
finish
p *$header
x/64xb $header
```

`read_elf_header()` 진입점에서는 출력 Buffer가 아직 읽힌 상태가 아니다. `finish`로 호출이 끝난 뒤 반환값과 Header를 함께 본다. `e_ident`는 고정 길이 배열이므로 NULL 종료 문자열처럼 비교하지 않는다.

Segment를 살펴볼 때는 `load_loadable_segment()`에서 `p *phdr`, `validate_segment()`에서 시작·끝 주소와 반환값, `load_segment()`에서 `ofs`, `upage`, `read_bytes`, `zero_bytes`, `writable`을 확인한다. 함수 이름을 기준으로 `list`와 `next`를 사용하면 빌드마다 달라지는 `load+300` 같은 기계어 offset을 추측하지 않아도 된다.

VM 미사용 빌드에서는 `install_page()`에서 사용자 주소와 커널 Frame 주소를 함께 확인한다. VM 빌드에서는 SPT 등록과 PML4의 현재 Mapping을 구분한다. `info proc mappings`는 PintOS의 SPT를 출력하는 명령이 아니다. `pml4_get_page()`가 아직 NULL이어도 Lazy Page가 SPT에 등록되어 있을 수 있다. 실제 적재 이후에는 entry 주소와 그 주소에 대응하는 커널 가상 주소에서 같은 바이트가 보이는지, BSS 범위가 0인지 확인할 수 있다.

주소 공간 교체를 보려면 `process_exec()`, `process_cleanup()`, `load()`, `do_iret()`에 중단점을 둔다. `process_exec()`에서 `curr` 대입을 지난 뒤 이전 PML4, tid와 fd Table을 기록하고, 새 적재 뒤 같은 항목과 매핑 내용을 비교한다. 반환된 Page가 재사용되면 이전과 새 PML4의 주소 값이 같을 수도 있으므로 주소가 달라졌는지만으로 교체 여부를 판단하지 않는다.

```gdb
break process_exec
break process_cleanup
break load
break do_iret

# do_iret(tf)에 중단했을 때 새 사용자 문맥을 확인한다.
p/x tf->rip
p/x tf->rsp
p/x tf->cs
p/x tf->ss
p/x tf->eflags
p tf->R.rdi
p/x tf->R.rsi
```

`pml4_activate()` 진입 시점의 CR3는 아직 전환 전일 수 있다. `lcr3()`가 실행된 뒤의 `$cr3`와 대상 PML4의 물리 주소를 비교해야 한다. Kernel 가상 주소인 PML4 포인터와 CR3를 그대로 비교하거나, 임의의 `process_exec+100`에 중단해 아직 정해지지 않은 `success`를 읽지 않는다. QEMU의 TCG TLB 갱신과 Guest Page Pool의 반환 역시 서로 다른 사건이다. [PML4 활성화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c), [QEMU CR3 갱신](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/helper.c)

이 문서의 Python 예제는 Header 해석, 페이지 계산과 이미지 교체 모델을 실행한다. GDB 명령은 해당 커널에서 확인할 관찰 절차이며, 새 QEMU 실행의 통과 기록이나 메모리 측정값으로 제시하지 않는다.

## Linux·Windows·QEMU와의 경계

Linux의 `execve()`는 현재 프로세스의 프로그램 이미지를 바꾸며, 성공하면 이전 호출 위치로 돌아오지 않는다. 동적 링크 ELF에서는 `PT_INTERP`가 가리키는 Interpreter가 공유 라이브러리 적재와 연결에 참여한다. Linux의 프로세스 이미지를 설명할 때는 Demand Paging, ASLR, 환경 변수와 Auxiliary Vector, Signal·Thread·권한 상태의 변경도 함께 고려한다. 구체적인 주소 상한, ASLR 설정과 프로그램 Header 수 제한을 모든 Linux 환경에서 같은 상수로 보지 않는다. [Linux execve](https://www.man7.org/linux/man-pages/man2/execve.2.html)

Linux v6.12의 `load_elf_binary()`는 주 실행 파일의 진입점을 `e_entry + load_bias`로 계산한다. `PT_INTERP`가 있으면 최초 제어는 Interpreter의 적재 주소와 그 ELF의 `e_entry`를 합한 위치로 넘기고, 주 프로그램 진입점은 Auxiliary Vector의 `AT_ENTRY`로 전달한다. Interpreter가 없으면 주 프로그램 진입점을 사용한다. 정적 링크 여부만으로 Load Bias가 항상 0이라고 판단할 수는 없으며, ET_EXEC와 ET_DYN, ASLR 적용 조건도 확인해야 한다. [Linux ELF 진입점 계산](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c)

같은 버전에서 파일 바이트가 있는 `PT_LOAD`는 `elf_load()` → `elf_map()` → `vm_mmap()`으로 매핑한다. 파일 크기보다 큰 메모리 범위를 준비할 때, 마지막 파일 페이지의 꼬리에서 필요한 0 채움은 `padzero()`가 처리하고 그 뒤 페이지 범위는 `vm_brk_flags()`로 마련한다. `padzero()`는 사용자 주소에 직접 0을 쓰므로, 모든 데이터 준비가 첫 사용자 명령까지 미뤄지는 것은 아니다. [Linux 6.12의 Segment 매핑과 0 채움](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c#L356-L446), [padzero의 사용자 메모리 쓰기](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c#L118-L129)

Windows의 PE 이미지는 `MZ` Header와 `PE\0\0` Signature, COFF·Optional Header, Section 정보를 사용한다. 진입점의 `AddressOfEntryPoint`는 실제 적재 Base를 기준으로 더하는 RVA이며 파일 offset과 다르다. Header의 `ImageBase`는 선호 주소이므로 실제 적재 주소와 항상 같다고 전제하지 않는다. PE 진입점의 계산만으로 OS Loader를 포함한 최초 Thread 시작 절차 전체를 설명할 수는 없다. Import, Relocation과 DLL 처리가 필요한 것도 단순한 파일 복사로 설명할 수 없는 이유다. `CreateProcess`로 새 프로세스를 만드는 API와 Linux의 `execve()`로 기존 이미지를 교체하는 API도 구분한다. [Microsoft PE 명세](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)

PintOS를 System Emulation으로 실행하는 QEMU는 Guest CPU·메모리·디스크 장치의 동작을 제공한다. 여기서 Guest 파일시스템 안의 `args-none`을 해석하는 쪽은 PintOS 로더다. Guest가 디스크 바이트를 읽고 PTE를 기록하면 QEMU는 그 장치와 주소 변환 동작을 실행한다. 이 설명은 QEMU 자체에 ELF를 읽는 코드가 없다는 뜻은 아니다. Machine의 Kernel Image를 직접 적재하는 경로와 User Mode Emulation은 별도로 구분해야 한다. [QEMU System Emulation](https://www.qemu.org/docs/master/system/introduction.html), [User Mode Emulation](https://www.qemu.org/docs/master/user/main.html)
