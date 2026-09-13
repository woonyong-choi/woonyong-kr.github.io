---
layout: default
title: 보조 페이지 테이블
nav_order: 2
permalink: /wiki/computer-systems-network-topic-aa5da5d73167/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-aa5da5d73167
projection_sha256: 5fa00a7f16766b451b9e97828a7d6c33bde53d6d10c3421ef70bce8eebdd72c3
parent: 가상 메모리 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-83f24986336f
search_terms:
- spt_find_page
- page_hash
- Page Table Walk
- Not Present
- CR3
- Swap Entry
grand_parent: PintOS
ancestor: CS 기초
---

# 보조 페이지 테이블
{: .no_toc }

Page Table에 유효한 Mapping이 없다는 사실만으로는 접근을 거부해야 할지 판단할 수 없다. 실행 파일을 나중에 읽을 주소인지, Swap에서 되살릴 페이지인지, Stack을 늘려야 하는 주소인지 커널이 알고 있어야 한다. PintOS의 Supplemental Page Table, 줄여서 SPT는 이 판단에 필요한 Page Metadata를 보관한다.

CPU가 주소를 변환할 때 사용하는 Page Table과, 커널이 페이지의 상태를 관리하는 SPT는 역할이 다르다. [lrn-pintos의 현재 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)에서 SPT는 프로세스별 Hash Table이고, PML4는 x86-64 Page Table 계층의 최상위 Table이다. PintOS 함수 이름에서 `pml4`가 전체 계층의 시작 포인터를 가리키는 경우와 최상위 Table 하나를 구분해서 읽는다.

## Mapping과 복구 정보를 나눈다

| 알아야 할 내용 | Page Table | SPT와 Page Metadata |
|---|---|---|
| 현재 VA를 어느 물리 주소로 바꿀지 | Present한 Mapping과 권한을 제공 | 연결된 Frame을 커널 객체로 추적 |
| 최초 접근에서 읽을 파일 위치 | 파일 객체나 ELF 적재 콜백을 해석하지 않음 | UNINIT의 콜백과 aux로 기록 |
| 내보낸 Anonymous Page의 위치 | 현재 구현은 Present Bit를 내려 Mapping 해제 | `anon.swap_slot`, `anon.in_swap` 보관 |
| mmap의 파일·범위·유효 바이트 | Dirty 등 하드웨어 상태 제공 | `file_page`의 파일·offset·크기·범위 보관 |
| fork에서 복제할 정보 | 현재 Mapping만으로 초기화 전 Page까지 알 수 없음 | Page와 타입별 Metadata를 순회 |
| 새로운 Stack 주소인지 | 없는 Mapping만으로 성장 정책을 알 수 없음 | Stack 경계와 저장한 RSP 등 커널 정책을 함께 사용 |

Dirty Bit는 하드웨어 Page Table에 있고 파일 offset은 커널 Metadata에 있다. File Page의 쓰기 반영은 양쪽 정보를 함께 사용한다. SPT에 같은 Dirty Bit를 별도로 저장해야만 동작하는 구조라고 생각할 필요는 없다.

Present가 0이면 PTE에 어떤 소프트웨어 정보도 담을 수 없다는 뜻은 아니다. Linux는 Non-present PTE에 Swap Entry를 인코딩하는 경로를 사용한다. 따라서 SPT가 필요한 이유를 ‘PTE의 남은 3비트로 Swap 번호를 표현할 수 없어서’라고 일반화하면 맞지 않는다. 여기의 PintOS가 복구 정보를 Page 객체에 분리해 저장한다는 구현 선택과 CPU가 PTE를 해석하는 조건을 나누어 이해해야 한다. [Linux Swap Entry 변환](https://github.com/torvalds/linux/blob/v6.12/include/linux/swapops.h)

## 주소를 Page 경계로 맞춰 검색한다

현재 SPT는 `struct hash hash_table`을 가진다. `spt_find_page()`는 찾을 주소를 `pg_round_down()`으로 내린 다음 임시 Page의 `va`에 넣어 Hash 검색에 사용한다. `page_hash()`는 이 포인터 값의 바이트를 Hash하고 `page_less()`는 VA를 비교한다. 같은 Page 안의 다른 주소가 하나의 Page 객체로 연결되는 이유다.

```run-python
PAGE_SIZE = 4096
spt = {0x401000: {'type': 'UNINIT', 'writable': False,
                  'file_offset': 0x1000}}

for address in (0x401000, 0x401234, 0x401FFF, 0x402000):
    page_base = address & ~(PAGE_SIZE - 1)
    offset = address & (PAGE_SIZE - 1)
    found = spt.get(page_base)
    print(f'VA=0x{address:x}, Page=0x{page_base:x}, offset=0x{offset:x}, 발견={found is not None}')

assert spt.get(0x401234 & ~0xFFF) is spt[0x401000]
assert spt.get(0x402000) is None
```

이 Python Dictionary는 주소를 정렬하는 규칙을 보여 주는 모델이다. PintOS Hash Table의 충돌 처리나 실행 시간을 재현하지 않는다. Hash 조회의 평균 비용은 분포와 Load Factor 등의 조건을 함께 고려해야 하며, 단순히 평균 O(1)이라는 이유만으로 실제 조회 지연을 측정한 것처럼 쓰지 않는다.

Page를 등록할 때는 VA가 Page 경계에 맞는지, 같은 주소가 이미 있는지, 객체 할당과 Hash 삽입이 성공했는지 확인한다. 타입별 Frame 연결과 콜백은 [가상 메모리 구현](/wiki/computer-systems-network-topic-83f24986336f/)에서 다룬다.

`vm_alloc_page_with_initializer()`는 Page를 할당한 뒤 지원하는 타입을 찾지 못하거나 SPT 삽입에 실패하면 그 Page를 해제한다. 이때 전달받은 `aux`와 파일 참조는 해제하지 않으므로, 등록 실패를 받은 ELF·mmap 호출자가 자신이 준비한 자원을 정리한다. [Page 등록과 실패 처리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L95-L138), [ELF 호출자](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1360-L1378), [mmap 호출자](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c#L153-L179)

이미 등록된 VA로 다시 호출하면 `spt_find_page()` 검사에서 거절하므로 새 Page의 할당과 `uninit_new()`·`spt_insert_page()` 호출까지 도달하지 않는다. 기존 Page는 SPT에 그대로 남는다. 따라서 같은 VA를 두 번 등록하는 요청으로 중복 거절은 확인할 수 있지만, Hash 삽입 실패 뒤의 정리 분기를 시험했다고 볼 수는 없다.

## Hash 값과 Bucket의 수

현재 `hash_bytes()`는 64비트 값에 FNV Prime을 곱한 뒤 입력 바이트를 XOR한다. 순서가 **곱셈 → XOR**이므로 FNV-1 방식이며, XOR를 먼저 하는 FNV-1a와 다르다. 초기값은 `0xcbf29ce484222325`, Prime은 `0x100000001b3`다. `page_hash()`는 `va` 포인터 자체의 바이트를 입력으로 쓴다. 현재 x86-64의 8바이트 Little Endian 표현을 기준으로 읽어야 한다. [Hash 함수와 Rehash](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/kernel/hash.c)

Bucket의 수는 2의 거듭제곱이다. `find_bucket()`은 `hash & (bucket_cnt - 1)`로 Bucket을 고르고, 그 안의 Doubly Linked List를 순회한다. 충돌한 원소를 버리거나 다음 빈 Bucket으로 옮기는 Open Addressing 방식이 아니다. 두 Key의 동등성은 `less(a, b)`와 `less(b, a)`가 모두 거짓인지로 판단한다.

Hash Table은 처음에 Bucket 네 개를 만든다. 삽입·교체·삭제 뒤의 `rehash()`는 원소 수를 2로 나눈 몫 이하의 가장 큰 2의 거듭제곱을 구하고, 최소 네 개를 유지한다. 새 Bucket 배열 할당이 성공한다면 원소 15개에서는 4개, 16개에서는 8개, 100개에서는 32개가 된다. 소스의 `MIN_ELEMS_PER_BUCKET`·`MAX_ELEMS_PER_BUCKET` 상수가 직접 확장 조건에 쓰이는 것은 아니다.

다음 코드는 그 주소 Hash와 Bucket 수 계산을 실행한다. 실제 PintOS의 메모리를 읽거나 조회 시간을 측정하는 예제는 아니다.

```run-python
MASK = (1 << 64) - 1

def page_hash(address):
    if not 0 <= address <= MASK:
        raise ValueError("64비트 주소가 필요하다.")
    value = 0xcbf29ce484222325
    for byte in address.to_bytes(8, "little"):
        value = ((value * 0x100000001b3) & MASK) ^ byte
    return value

def target_buckets(count):
    if count < 0:
        raise ValueError("원소 수는 음수일 수 없다.")
    target = max(4, count // 2)
    return 1 << (target.bit_length() - 1)

for count in (0, 15, 16, 32, 64, 65, 100):
    buckets = target_buckets(count)
    print(f"pages={count}, buckets={buckets}, load={count / buckets:g}")

for address in (0x400000, 0x401000, 0x8048000):
    value = page_hash(address)
    print(f"VA={address:#x}, hash={value:#018x}, bucket(8)={value & 7}")

assert target_buckets(15) == 4 and target_buckets(16) == 8
assert target_buckets(64) == target_buckets(65) == 32
assert target_buckets(100) == 32
assert page_hash(0) == (0xcbf29ce484222325 * pow(0x100000001b3, 8, 1 << 64)) & MASK
```

16개에서 하나를 삭제하면 목표 Bucket 수가 다시 4개로 줄어든다. 이 경계에서 삽입과 삭제를 반복하면 Rehash도 반복될 수 있다. 새 배열을 할당하지 못하면 기존 테이블을 그대로 사용하므로, 목표 크기와 실제 현재 크기도 구별한다. 평균 조회 비용과 최악의 Chain 순회 비용은 [Hash Table](/wiki/computer-science-topic-c3f2953a97c2/)의 조건을 따른다. Page Fault 전체의 비용에는 Frame 확보와 파일·Swap I/O도 포함된다.

`struct hash_elem` 안에는 List 연결이 들어 있고, Bucket 배열의 각 항목은 Head와 Tail을 가진 `struct list`다. 현재 x86-64 구조에서는 포인터 두 개의 `list_elem`이 16바이트, Sentinel 두 개의 `list`가 32바이트이므로 초기 Bucket 배열만 128바이트다. Hash 객체와 Page·할당기 Metadata는 별도다. `hash_entry()`는 `offsetof`를 이용해 포함한 Page의 주소로 돌아간다. Hash 멤버가 Page의 첫 필드라고 가정해서 주소를 변환하면 안 된다. [Hash 구조체](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/lib/kernel/hash.h), [List 구조체](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/lib/kernel/list.h)

실제 성장을 조사하려면 `rehash()`에서 `h->elem_cnt`와 `h->bucket_cnt`를 비교하고, 할당 실패 여부와 Bucket의 Chain을 함께 살핀다. 함수가 반환된 뒤에도 주소를 쓸 계획이라면 유효한 인자 `h`를 먼저 Debugger 변수에 보관한다. `args-many` 같은 테스트의 로딩 과정은 관찰 대상으로 삼을 수 있지만, 소스만 읽고 특정 Chain 길이나 실행 시간을 결과로 쓰지는 않는다.

정확한 Page 한 개를 찾는 일에는 Hash가 어울리지만 범위 검색과 정렬 순회가 중요하면 균형 Tree 등 다른 구조를 고려할 수 있다. Linked List는 단순한 대신 순차 검색이 필요하고, 정렬 배열은 조회와 삽입·삭제 비용의 균형이 다르다. 자료구조의 이름 하나로 Cache 효율이나 실제 성능의 우열을 확정할 수는 없다.

## 4단계 Page Table과 주소 계산

이 PintOS의 기본 Page는 4 KiB다. 일반적인 4 KiB Page의 주소 변환에서는 PML4, PDPT, PD, PT의 index에 각각 9비트를 사용하고 마지막 12비트를 Page offset으로 남긴다. Table 한 개에는 8바이트 Entry 512개가 들어가므로 4 KiB다. 전체 프로세스의 Page Table이 언제나 4 KiB 하나라는 뜻은 아니다.

```run-python
KERN_BASE = 0x8004000000
PAGE_SIZE = 4096
PTE_P, PTE_W, PTE_U = 1, 2, 4

def trace(address, frame_pa):
    assert frame_pa % PAGE_SIZE == 0
    indexes = tuple((address >> shift) & 0x1FF for shift in (39, 30, 21, 12))
    offset = address & 0xFFF
    base = address & ~0xFFF
    frame_kva = KERN_BASE + frame_pa
    pte = frame_pa | PTE_P | PTE_W | PTE_U
    final_pa = frame_pa + offset
    print(f'VA 0x{address:x}: PML4/PDPT/PD/PT =', indexes)
    print(f'  Page=0x{base:x}, offset=0x{offset:x}')
    print(f'  Frame KVA=0x{frame_kva:x}, PTE=0x{pte:x}, PA=0x{final_pa:x}')
    assert frame_kva - KERN_BASE == frame_pa
    return indexes, final_pa

indexes, pa = trace(0x8048123, 0x12340000)
assert indexes == (0, 0, 0x40, 0x48)
assert pa == 0x12340123
_, pa = trace(0x401234, 0x12345000)
assert pa == 0x12345234
print('Table 한 개:', 512 * 8, 'bytes')
```

`0x8048123`의 PML4 index는 1이 아니라 0이고 PD index는 2가 아니라 `0x40`이다. 비트 분해를 직접 실행하면 주소 예제의 이런 계산 오류를 확인할 수 있다. Frame의 PA는 설명을 위해 정한 값이며 해당 PintOS 실행에서 그 주소가 실제로 할당됐다는 뜻은 아니다.

`ptov()`와 `vtop()`은 이 Kernel의 Direct Mapping 기준 주소인 `KERN_BASE`를 더하거나 뺀다. 다른 OS의 `0xffff8000...` 주소 예제를 가져와 같은 계산을 적용하지 않는다. 사용자 VA를 `vtop()`에 넣어 주소 변환을 대신할 수도 없다. 사용자 VA는 현재 프로세스 Page Table의 Mapping을 찾아야 한다. [주소 계산 Macro](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/vaddr.h)

이 예제는 마지막 PTE의 주소와 기본 Flag만 구성한다. 실제 접근 허용 여부는 상위 단계의 Present·User·Writable 등과 CPU 설정도 함께 결정하며, 모든 Mapping의 Flag가 `0x7`인 것은 아니다. `pml4_get_page()`는 변환 결과를 Kernel 가상 주소로 반환하면서 원래 Page offset도 더한다. 따라서 Page 중간 주소로 조회한 결과를 `frame->kva`의 Page 시작 주소와 그대로 비교하면 차이가 난다. [PintOS Page Table 함수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

## 등록, Claim, Eviction, 제거

| 시점 | SPT의 Page | Frame과 PTE |
|---|---|---|
| Lazy 등록 직후 | UNINIT과 초기화 정보 존재 | Frame이 없고 사용자 Mapping도 아직 없음 |
| Claim 성공 | 최종 타입과 복구 정보 유지 | Frame 연결·PTE 설치·바이트 준비 완료 |
| Eviction 성공 | Page는 남고 필요한 Backing 정보 유지 | 연결된 Frame을 떼고 PTE Present 해제 |
| 재접근 복구 성공 | Page를 찾아 타입에 맞게 복원 | 새 Frame을 연결하거나 확보한 Frame 재사용 |
| munmap·종료 | 해당 Page의 자원 해제와 제거 | 해당 Mapping과 참조를 정리 |

표는 각 작업이 성공해 끝난 시점을 비교한다. Claim 도중 PTE를 먼저 설치하고 바이트를 나중에 준비하는 실제 순서나 중간 실패 상태까지 Present Bit 하나로 표현할 수는 없다.

SPT 검색에서 Page가 없으면 곧바로 모든 접근을 거부하는 것도 아니다. 현재 Fault Handler에는 Stack 성장 여부를 검사하는 경로가 있다. 반대로 Page가 있어도 쓰기 권한이나 데이터 복구 문제가 있으면 실패할 수 있다. 정확한 조건과 실패 처리 범위는 [페이지 폴트](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에 연결된다.

fork에서는 SPT의 미초기화 정보, 상주 페이지, Swap 상태 등 복제할 대상을 나눠야 한다. 이미 PML4에 올라온 사용자 Mapping만 순회하면 아직 Claim하지 않은 페이지가 빠진다. 실제 분기와 현재 구현의 한계는 [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/)에서 다룬다. 종료 때의 `supplemental_page_table_kill()`은 Hash를 파괴하며 각 Page의 타입별 자원 해제와 Frame 회수를 연결한다. 자세한 순서는 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)를 참고한다.

## GDB에서 두 상태를 나란히 확인한다

다음 절차는 디버그 심볼이 있는 PintOS Kernel을 QEMU와 연결한 환경을 전제로 한다. SPT의 소프트웨어 객체와 하드웨어 Mapping을 같은 주소로 비교하려는 관찰 절차이며 새 Kernel 실행 결과를 제시한 것은 아니다.

```gdb
break spt_find_page
continue
p/x va
set $query = (uintptr_t)va
finish
# x86-64 반환값 RAX는 방금 찾은 struct page *다.
set $page = (struct page *)$rax
p/x $page
```

반환값이 NULL이 아닐 때에만 아래 필드를 읽는다. `page_get_type()`의 목표 타입과 현재 `operations->type`을 혼동하지 않도록 Operations부터 본다.

```gdb
p/x $page->va
p $page->operations->type
p $page->writable
p/x $page->frame
```

Operations가 UNINIT일 때만 `uninit.aux`, ANON일 때만 `anon.in_swap`과 `anon.swap_slot`, FILE일 때만 `file` 멤버를 읽는다. Union의 다른 멤버를 동시에 유효한 정보로 해석하지 않는다. Frame이 NULL이면 `frame->kva`를 역참조하지 않는다.

Mapping은 `pml4_get_page()`의 `pml4`·`uaddr` 인자와 반환값을 같은 방식으로 확인하거나 Page Table Walk를 따라간다. GDB Remote Target에서 임의의 Kernel 함수 호출이 항상 가능한 것은 아니므로 `call spt_find_page(...)` 성공을 전제로 절차를 만들지 않는다.

CR3는 Page Table Root의 물리 주소를 담고 GDB의 일반 메모리 조회는 보통 Guest 가상 주소를 사용한다. `(CR3) + 8 * index`를 곧바로 가상 주소처럼 읽거나, 최상위 PML4 Entry만 보고 마지막 PTE의 Present를 판단하면 안 된다. 상위 Table은 존재하지만 최하위 Mapping이 없는 경우도 있다. Frame이 준비된 뒤에는 `pml4_get_page()`의 결과가 `frame->kva + Page offset`과 일치하는지 비교할 수 있다.

## OS의 Metadata와 Emulator의 역할

Linux는 VMA로 연속된 가상 주소 영역의 정책을 관리하며 실제 Page Table도 별도로 둔다. 이것이 PintOS의 Page 단위 SPT와 같은 구조라는 뜻은 아니다. Linux의 공통 Page Table API는 5단계 계층을 표현하고 실제 하드웨어가 쓰지 않는 단계는 Fold할 수 있다. 따라서 모든 Linux의 PGD를 곧바로 4단계 PML4 하나와 같은 것으로 설명하지 않는다. [Linux Page Table 계층](https://docs.kernel.org/6.12/mm/page_tables.html)

QEMU TCG는 Guest CR3와 Page Table Entry를 이용해 주소 변환을 수행하고 필요한 경우 Guest Page Fault를 일으킨다. TCG의 TLB가 변환 결과를 보관하므로 매번 전체 Walk를 수행한다고 가정하지 않는다. SPT의 Page·aux가 뜻하는 파일 읽기나 Swap 복구 정책은 Guest Kernel인 PintOS가 실행한다. QEMU가 메모리에 있는 SPT 바이트를 디버거로 보여 줄 수 있다는 사실과 VM 정책을 이해한다는 사실은 다르다. [QEMU x86 주소 변환과 Fault](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c)
