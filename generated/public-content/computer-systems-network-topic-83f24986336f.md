---
layout: default
title: 가상 메모리 구현
nav_order: 6
permalink: /wiki/computer-systems-network-topic-83f24986336f/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-83f24986336f
projection_sha256: 1750773dc773428d70cf589adceeb4253d48186e71eec984641d32e501aa35c1
parent: PintOS
content_status: ready
public_parent_id: Wiki/projects/pintos
search_terms:
- struct page
- struct frame
- page_operations
- vm_do_claim_page
- UNINIT
- page_get_type
grand_parent: OS
ancestor: CS 기초
---

# 가상 메모리 구현
{: .no_toc }

사용자 주소에 대응하는 물리 메모리가 아직 없어도, 그 주소가 잘못된 접근이라는 뜻은 아니다. 실행 파일의 일부를 나중에 읽기로 했을 수도 있고, 이전에 사용하던 페이지를 Swap으로 내보냈을 수도 있다. 가상 메모리 구현은 이런 경우에 필요한 데이터를 복구하고 CPU가 같은 명령어를 다시 실행할 수 있게 만드는 일이다.

여기서는 [lrn-pintos의 VM 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)을 기준으로 커널 객체와 하드웨어 Mapping의 관계를 읽는다. SPT의 검색과 PML4의 차이는 [보조 페이지 테이블](/wiki/computer-systems-network-topic-aa5da5d73167/), 파일 Mapping은 [PintOS mmap](/wiki/computer-systems-network-mmap-838e9b0f7e0a/)에서 다룬다.

## Page, Frame, Operations

이 구현의 `struct page`는 **사용자 가상 페이지**의 Metadata다. `struct frame`은 그 데이터를 담을 **물리 Frame**을 커널이 관리하는 객체다. 이름이 비슷하더라도 Linux의 `struct page`와 같은 대상을 뜻하지 않는다. [PintOS VM 구조체](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/vm/vm.h)

| 객체 | 현재 코드의 주요 필드 | 책임 |
|---|---|---|
| `struct page` | `operations`, `va`, `frame`, `hash_elem`, `writable`, Union | 가상 주소·논리적 쓰기 권한·타입별 복구 정보 |
| `struct frame` | `kva`, `page`, `elem`, `owner_thread`, `ref_count` | 물리 Frame의 커널 주소와 대표 소유자, Frame Table 연결 |
| `struct page_operations` | `swap_in`, `swap_out`, `destroy`, `type` | Page 타입에 맞는 동작 선택 |
| `struct supplemental_page_table` | `hash_table` | 프로세스의 Page를 주소로 검색 |

`frame->kva`는 물리 주소 그 자체가 아니다. 커널이 Frame의 바이트를 읽고 쓰는 가상 주소이며, PTE를 만들 때 `vtop()`으로 물리 주소를 얻는다. `frame->elem`은 전역 Frame Table의 List에 연결하고, `page->hash_elem`은 해당 프로세스 SPT의 Hash Table에 연결한다.

현재 `struct frame`에는 `owners` List가 없고 `page_operations`에는 `copy` 함수 포인터도 없다. COW에 사용하는 것은 `ref_count`와 대표 `page`·`owner_thread`이며, fork 복사는 `supplemental_page_table_copy()` 등의 별도 코드가 담당한다. 구현을 설명하는 구조체에 설계 후보 필드를 섞어 넣지 않는다.

현재 Header를 x86-64 대상으로 컴파일해 크기를 확인하면 `struct page`는 88바이트, `struct frame`은 48바이트다. Frame 객체의 48바이트와 실제 데이터를 담는 4 KiB는 별도 할당이다. 여기에 Hash Table, 파일 참조, aux와 Allocator의 관리 비용도 있으므로 Page 수에 88만 곱한 값을 전체 VM 메모리 사용량으로 제시하지 않는다.

### 같은 저장 공간을 다른 타입으로 사용한다

`struct page`의 Union에는 한 시점의 타입에 필요한 정보가 들어간다.

| Union 멤버 | 주요 값 | 쓰이는 시점 |
|---|---|---|
| `uninit` | `init`, `type`, `aux`, `page_initializer` | 최종 타입으로 초기화되기 전 |
| `anon` | `swap_slot`, `in_swap` | Anonymous Page의 Swap 위치·상태 |
| `file` | `file`, `ofs`, `page_read_bytes`, `page_zero_bytes`, `map_start` | File Page의 읽기·쓰기와 mmap 범위 |

UNINIT은 아직 초기화되지 않았다는 뜻이다. 모든 비상주 Page가 UNINIT인 것은 아니다. 이미 초기화된 ANON Page가 Swap으로 나가도 타입은 ANON으로 남을 수 있다. 또 Anonymous Page가 반드시 처음부터 파일과 무관한 바이트로 채워지는 것도 아니다. 이 PintOS의 ELF Lazy Page는 파일 바이트를 읽어 ANON Page로 시작할 수 있다.

`operations`는 `const struct page_operations *`다. 이 포인터를 통해 함수 Table을 수정하지 않는다는 뜻이며, 포인터 자체를 다른 Table로 바꿀 수 없다는 뜻은 아니다. UNINIT에서 ANON이나 FILE로 초기화할 때 실제로 `page->operations`가 바뀐다.

## 함수 포인터로 타입별 동작을 고른다

호출자는 `swap_in(page, kva)`라는 공통 표현을 사용한다. 실제 호출 대상은 현재 `page->operations`에 들어 있는 함수다. 다음은 실제 Header의 Macro다. Kernel 타입에 의존하는 설명용 발췌이며 독립 실행 프로그램은 아니다.

```c
#define swap_in(page, v) (page)->operations->swap_in ((page), v)
#define swap_out(page) (page)->operations->swap_out (page)
#define destroy(page) \
    if ((page)->operations->destroy) (page)->operations->destroy (page)
```

| 현재 Operations | `swap_in` | `swap_out` | `destroy` |
|---|---|---|---|
| UNINIT | `uninit_initialize` | NULL | `uninit_destroy` |
| ANON | `anon_swap_in` | `anon_swap_out` | `anon_destroy` |
| FILE | `file_backed_swap_in` | `file_backed_swap_out` | `file_backed_destroy` |

이것은 C의 함수 포인터와 Union으로 동작을 분리하는 방식이다. C++ Class 상속이 실제로 일어나는 것은 아니며, 공통 호출 표현을 쓴다고 모든 연산을 모든 상태에서 호출해도 되는 것은 아니다. 특히 UNINIT의 `swap_out`은 NULL이다.

### 초기화 함수와 데이터 준비 함수

`vm_alloc_page_with_initializer()`는 Page 객체를 할당하고 UNINIT으로 SPT에 등록한다. 요청한 타입의 하위 3비트로 `anon_initializer` 또는 `file_backed_initializer`를 고른다. `VM_PAGE_CACHE`가 enum에 선언되어 있더라도 현재 함수의 Switch는 ANON과 FILE만 받아들인다.

첫 Claim에서는 `uninit_initialize()`가 타입 초기화 함수를 먼저 호출하고, 성공한 경우 선택적인 `init(page, aux)` 콜백을 호출한다. Union이 덮어써질 수 있으므로 `init`과 `aux`를 지역 변수에 먼저 보관한다. [UNINIT 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/uninit.c)

ANON의 타입 초기화는 Operations와 Swap Metadata를 설정한다. 그 함수 자체가 Frame을 0으로 채우지는 않는다. `anon_swap_in()`에는 `in_swap == false`일 때 0으로 채우는 분기가 있지만, 첫 UNINIT 초기화가 곧바로 그 함수를 호출하는 것은 아니다. 첫 Claim의 실제 바이트는 등록한 콜백까지 따라가야 한다. 초기 Stack의 이 차이는 [인자 전달](/wiki/computer-systems-network-topic-1217820258bd/)에서도 확인할 수 있다. [Anonymous Page 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c)

다음 예제는 함수 선택과 타입 전환을 Python으로 표현한다. `frame`은 변화가 보이도록 8바이트로 줄이고 `0xa5`로 초기화했다. 실제 Allocator가 이 패턴을 반환한다는 뜻은 아니다.

```run-python
def anon_swap_in(page, frame):
    if page['in_swap']:
        frame[:] = page['saved_bytes']
        page['in_swap'] = False
    else:
        frame[:] = bytes(len(frame))
    return True

def uninit_initialize(page, frame):
    callback = page['init']
    aux = page['aux']
    page.clear()                  # Union을 다른 타입으로 사용하는 모형
    page.update(type='ANON', swap_in=anon_swap_in, in_swap=False)
    return callback(page, frame, aux) if callback else True

def copy_initial_bytes(page, frame, aux):
    frame[:] = aux
    return True

for label, callback in [('콜백 없음', None), ('파일 바이트 콜백', copy_initial_bytes)]:
    page = dict(type='UNINIT', swap_in=uninit_initialize,
                init=callback, aux=b'ELFbytes')
    frame = bytearray([0xA5] * 8)
    swap_in = page['swap_in']
    assert swap_in(page, frame)
    print(label, '첫 Claim:', page['type'], frame.hex())
    if callback is None:
        assert frame == bytes([0xA5] * 8)
    else:
        assert frame == b'ELFbytes'
    assert page['swap_in'] is anon_swap_in
    swap_in = page['swap_in']
    assert swap_in(page, frame)
    print('  ANON의 swap_in을 별도로 호출:', frame.hex())
    assert frame == bytes(8)
```

첫 호출에서 Operations가 바뀌어도 이미 진행 중인 UNINIT 호출이 ANON의 `swap_in`으로 자동 점프하지는 않는다. 예제의 두 번째 호출은 함수 선택의 차이를 보이기 위한 호출이며 실제 VM에서 정상적으로 재접근할 때의 전체 절차를 대신하지 않는다.

### 타입 비트와 Stack Marker

`VM_TYPE(type)`은 하위 3비트만 남긴다. `VM_ANON | VM_MARKER_0`는 값 9이고, 타입을 추출하면 ANON인 1이다. `page_get_type()`은 현재 Operations가 UNINIT이면 `uninit.type`에 저장한 **목표 타입**을 반환한다. 따라서 `page_get_type(page) == VM_UNINIT`을 미초기화 상태 검사로 그대로 사용하면 현재 Operations의 상태를 놓칠 수 있다.

```run-python
VM_UNINIT, VM_ANON, VM_FILE = 0, 1, 2
VM_MARKER_0 = 1 << 3

def page_get_type(operations_type, target_type):
    current = operations_type & 7
    return target_type & 7 if current == VM_UNINIT else current

target = VM_ANON | VM_MARKER_0
print('저장한 목표 값:', target)
print('현재 Operations:', VM_UNINIT)
print('page_get_type 결과:', page_get_type(VM_UNINIT, target))
assert target == 9
assert page_get_type(VM_UNINIT, target) == VM_ANON
assert VM_UNINIT != VM_ANON
```

Stack Marker를 기록하는 것과 성장 조건을 판단하는 것은 다르다. 이 구현의 `vm_should_grow_stack()`은 주소 상한·Stack 최대 범위와 저장한 RSP를 비교한다. 아직 SPT에 Page가 없는 주소에도 성장 여부를 판단해야 하므로 Marker가 반드시 먼저 존재해야 하는 것은 아니다.

## Claim에서 Mapping과 바이트를 준비한다

`vm_claim_page(va)`는 SPT에서 Page를 찾고 `vm_do_claim_page()`에 전달한다. Claim은 Page Fault에서만 일어나는 일이 아니다. 초기 Stack처럼 등록 직후 명시적으로 Claim하는 경로도 있다.

현재 `vm_do_claim_page()`의 순서는 다음과 같다.

1. `vm_get_frame()`으로 Frame을 확보한다.
2. `frame->page`, `frame->owner_thread`, `page->frame`을 연결한다.
3. `pml4_set_page()`로 해당 프로세스의 PTE를 설치한다.
4. `swap_in(page, frame->kva)`의 반환값을 돌려준다.

PTE 설치가 실패하면 Page·Frame 연결을 끊고 Frame Table에서 제거한 뒤 물리 페이지와 Frame 객체를 반환한다. 반면 **현재 함수에는 `swap_in()` 실패 뒤 같은 정리를 수행하는 분기가 없다.** 필요한 Rollback과 구현된 Rollback을 구분해야 한다. 데이터 준비가 실패했는데도 PTE와 Frame 연결이 남을 수 있다는 것이 이 코드에서 확인할 점이다.

다음 예제는 두 실패 지점 뒤 남는 상태를 비교한다. Memory Allocation과 Page Table을 불리언으로 나타내며 실제 Kernel이나 오류 주입 테스트는 실행하지 않는다.

```run-python
def current_claim(pte_ok, swap_in_ok):
    state = dict(frame_allocated=True, linked=True, pte_present=False)
    if not pte_ok:
        state.update(frame_allocated=False, linked=False)
        return False, state
    state['pte_present'] = True
    return swap_in_ok, state

for name, pte_ok, swap_ok in (
    ('PTE 설치 실패', False, False),
    ('데이터 준비 실패', True, False),
    ('성공', True, True),
):
    ok, state = current_claim(pte_ok, swap_ok)
    print(name, '반환:', ok, '상태:', state)
    if not pte_ok:
        assert not any(state.values())
    elif not swap_ok:
        assert state['pte_present'] and state['linked']
```

Rollback을 완성하려면 Mapping, Frame 소유, Union 전환과 aux·파일 참조의 수명을 함께 살펴야 한다. PTE만 지운다고 초기화 콜백이 이미 바꾼 모든 상태가 돌아오는 것은 아니다. 이 문서의 모델을 구현 완료나 Kernel 테스트 통과의 근거로 사용하지 않는다.

## Frame이 부족하면 기존 페이지를 내보낸다

`vm_get_frame()`은 먼저 `palloc_get_page(PAL_USER)`를 시도한다. 실패하면 후보 Frame을 내보내 재사용한다. 객체 할당 실패나 교체 후보·Backing Store 문제로 NULL을 반환할 수 있으므로 항상 성공한다는 주석을 함수의 보장으로 받아들이지 않는다.

현재 Clock 순회는 `ref_count == 1`이고 Page와 메모리가 연결된 Frame을 후보로 삼는다. 대표 소유자의 PML4에서 Accessed Bit가 설정되어 있으면 지우고 다음 후보로 이동한다. 공유 중인 Frame을 무조건 같은 방식으로 Evict하는 구현은 아니다. 후보 수와 검색 상한, 동시 접근 조건은 [페이지 교체](/wiki/computer-systems-network-topic-163345dd1b02/)에서 이어서 다룬다.

`vm_evict_frame()`은 먼저 타입에 맞는 `swap_out()`을 호출한다. 실패하면 아직 연결을 끊지 않고 실패를 반환한다. 성공하면 대표 소유자의 PTE를 Not Present로 만들고 Page와 Frame의 연결을 해제한 뒤 Frame을 재사용한다.

ANON은 Swap Slot을 확보해 4 KiB를 기록한다. FILE은 Dirty일 때 파일의 유효한 바이트 범위를 기록하며, 깨끗한 File Page를 내보낼 때마다 파일에 다시 쓰는 것은 아니다. `pml4_clear_page()` 역시 PTE 전체를 0으로 지우지 않고 Present Bit를 내린다. [File Page의 입출력](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c), [Mapping 제거](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

COW에서는 여러 Page가 한 Frame을 가리킬 수 있다. 이 구현은 참조 수를 늘리고 사용자 PTE를 읽기 전용으로 만들며, 쓰기 Fault에서 공유 수에 따라 복사하거나 다시 쓰기를 허용한다. 다만 대표 `page`와 `owner_thread` 하나가 전체 소유자 집합을 표현하지는 못한다. 소유자 종료·대표 교체·실패 복구까지 참조 수 하나만으로 해결된다고 보지 않는다. fork와 회수 경로는 [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/), [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에 연결된다.

## Page Fault에서 커널이 판단하는 것

주소 변환이 TLB에 없으면 CPU는 Page Table을 따라가며 주소와 권한을 확인한다. 항상 매 접근마다 4단계 전체를 읽는 것은 아니다. Page Fault는 Not Present뿐 아니라 권한 위반 등으로도 발생한다. 커널의 예외 핸들러는 CR2의 주소와 error code를 읽어 복구를 시도한다.

이 PintOS의 `vm_try_handle_fault()`는 NULL·Kernel 주소를 먼저 제외하고 Not Present 여부로 경로를 나눈다. Not Present 경로는 SPT Claim을 먼저 시도하고, 그것이 실패하면 Stack 성장 조건을 검사한다. 코드상으로는 SPT 검색 실패만 성장 검사로 이어지는 것이 아니므로 흐름도를 그릴 때 반환 조건을 그대로 따라가야 한다. 쓰기 보호 경로는 쓰기 Fault인지, Page와 Frame이 있는지, 논리적 쓰기 권한이 있는지를 확인한 뒤 COW 처리를 시도한다.

Stack 성장 조건에는 `USER_STACK` 미만, 최대 1 MiB 범위 안, Fault 주소가 RSP보다 32바이트 이상 아래가 아니라는 비교가 들어간다. 사용자 Fault이면 프레임의 RSP, 커널에서 사용자 메모리를 다룰 때면 저장한 `user_rsp`를 사용한다. 현재 `vm_stack_growth()`는 중간 Page를 등록하고 Claim하며, 호출자는 목표 Page에 다시 `vm_claim_page()`를 호출한다. 의도한 한 번의 Claim과 실제 호출 횟수가 같은지도 확인해야 한다. 세부 분기는 [페이지 폴트](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에서 이어진다.

복구가 성공하면 인터럽트 복귀 경로가 Fault를 일으킨 명령으로 돌아간다. 새 Mapping과 데이터로 명령이 다시 실행되며, 복구할 수 없는 경우에는 정상 재실행을 기대할 수 없다. 복귀할 레지스터의 배치는 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에서 설명한다.

## 메모리와 Swap 용량을 Page 단위로 읽는다

이 구현의 Page 크기는 4 KiB이고 Disk Sector는 512바이트이므로 Swap Slot 하나는 8개 Sector다. `vm_anon_init()`은 고정된 ‘기본 4 MiB’ 상수를 사용하지 않고 실제 Swap Disk의 Sector 수를 `SECTORS_PER_PAGE`로 나눠 Bitmap 크기를 정한다. Disk가 없으면 사용할 Swap Table도 준비되지 않는다.

User Pool도 항상 32 MiB라고 정해져 있지 않다. `populate_pools()`는 메모리 영역에서 계산한 Page 수의 절반과 `user_page_limit`을 비교해 User Pool 배분량을 정한다. 실제 사용할 수 있는 양에는 Kernel 영역과 Pool 관리용 공간 등의 조건이 더 관련된다. [Page Pool 구성](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/palloc.c)

다음 계산은 용량 단위를 비교하는 예제다. 실제 QEMU의 RAM·Disk 설정을 읽거나 사용 가능한 Frame 수를 측정하지 않는다.

```run-python
PAGE_SIZE, SECTOR_SIZE = 4096, 512
user_pool_example = 32 * 1024 * 1024
swap_example = 4 * 1024 * 1024
sectors_per_page = PAGE_SIZE // SECTOR_SIZE
frame_units = user_pool_example // PAGE_SIZE
swap_sectors = swap_example // SECTOR_SIZE
slots = swap_sectors // sectors_per_page
print('32 MiB를 4 KiB 단위로 나누면:', frame_units)
print('4 MiB Disk의 Sector 수:', swap_sectors)
print('한 Slot의 Sector 수:', sectors_per_page)
print('4 MiB Disk의 Slot 수:', slots)
assert (frame_units, sectors_per_page, slots) == (8192, 8, 1024)
```

## 구현을 연결하고 확인하는 순서

처음 구현할 때는 SPT 등록, 첫 Claim, Page Fault 복구를 먼저 연결하면 이후 기능의 실패 지점을 찾기 쉽다. [보조 페이지 테이블](/wiki/computer-systems-network-topic-aa5da5d73167/)에서 같은 페이지의 중복 등록과 주소 정렬을 확인하고, [지연 적재](/wiki/computer-systems-network-topic-0a62f7f28b03/)에서 등록한 정보가 첫 접근까지 살아 있는지 살핀다. Claim이 성공했다면 Page와 Frame의 연결만 보지 않고 PTE와 실제 바이트까지 확인한다.

이때 서로 다른 네 가지 관리 정보를 구분하면 복구 경로가 분명해진다.

| 관리 정보 | 기억하는 것 |
|---|---|
| PML4에서 이어지는 Page Table | 현재 VA의 물리 주소와 접근 권한 |
| SPT | 프로세스의 가상 페이지와 복구 정보 |
| Frame Table | 상주 Frame과 교체 후보 |
| Swap Bitmap과 Page의 Swap Metadata | 사용 중인 Slot과 해당 Page를 복구할 위치 |

다음에는 [Stack 성장과 Page Fault 분기](/wiki/computer-systems-network-topic-5cebdbc10ddf/), [페이지 교체](/wiki/computer-systems-network-topic-163345dd1b02/), [Swap](/wiki/computer-systems-network-swap-11630540adf8/)을 연결한다. [mmap](/wiki/computer-systems-network-mmap-838e9b0f7e0a/)에서는 주소 범위·파일 참조와 Dirty Writeback을, [fork](/wiki/computer-systems-network-topic-4af2e32913a4/)에서는 UNINIT·상주·Swap 상태별 소유권을 확인한다. 이 순서는 기능 간 의존성을 살피기 위한 순서이며, 모든 구현에 고정된 유일한 절차는 아니다.

정리 경로는 마지막에만 추가하지 않는다. 각 할당과 파일 참조를 넣을 때 등록 실패, 초기화 실패, 첫 접근 없이 종료하는 경우를 함께 살핀다. [프로세스 종료와 exec의 정리](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에서는 Frame, Swap Slot, aux, 파일 참조가 어느 함수에서 반환되는지까지 연결한다. 실패를 반환했다는 사실만으로 할당한 자원이 모두 정리됐다고 판단하지 않는다.

GDB에서는 한 함수에 멈춘 상태로 모든 지역 변수를 읽으려 하지 말고, 값이 만들어지는 위치를 따라간다. 디버그 빌드에 연결한 뒤의 관찰 기준은 다음과 같다.

| 멈출 위치 | 값이 준비된 뒤 비교할 내용 |
|---|---|
| `vm_alloc_page_with_initializer`, `spt_find_page` | 등록한 VA와 페이지 경계로 내린 검색 주소 |
| `page_fault` | CR2에서 읽은 Fault 주소, `f->error_code`, `f->rip`와 저장한 RSP |
| `vm_do_claim_page` | Page–Frame 연결, PTE 설치 결과, `swap_in()` 반환값 |
| `lazy_load_segment`, `file_backed_swap_in` | 파일 Offset, 읽은 길이, Frame의 파일 바이트와 0 채움 |
| 타입별 `destroy`와 `process_cleanup` | Frame·Slot·aux·파일 참조의 반환과 남아 있는 Mapping |

Fault 주소는 접근 대상이고 RIP는 실행 중인 명령어 주소다. 복구 뒤 두 주소가 같아지는 것이 아니라, 같은 명령어가 준비된 Mapping을 사용해 다시 실행되는지를 확인한다. `x/32xb`로 바이트를 읽을 때도 해당 함수의 지역 변수 범위와 Frame의 생존 여부를 먼저 확인한다. 위 표는 관찰 방법이며 Kernel 테스트의 실행 결과는 아니다.

## 다른 OS와 QEMU를 비교할 때

Linux의 VMA는 연속된 가상 주소 영역의 정책을, `struct page`와 Folio는 물리 페이지·페이지 묶음의 관리를 설명할 때 등장한다. 주소 공간, 물리 메모리와 타입별 동작을 나눈다는 관점은 비교할 수 있지만 PintOS의 Page와 VMA를 같은 크기의 객체로 대응시키지는 않는다. Linux의 Zone과 Allocator도 단순한 User Pool 하나보다 넓은 물리 메모리 관리 문제를 다룬다. [Linux 물리 메모리](https://docs.kernel.org/6.12/mm/physical_memory.html), [메모리 관리 API](https://docs.kernel.org/6.12/core-api/mm-api.html)

Linux에서 영역별 동작은 `vm_operations_struct`의 `fault`·`map_pages` 같은 Callback으로 연결된다. 함수 테이블로 구현을 선택한다는 점은 PintOS의 `page_operations`와 비교할 수 있지만, 두 구조체가 담당하는 단위와 Callback 계약은 다르다. [Linux 6.12 `vm_operations_struct`](https://github.com/torvalds/linux/blob/v6.12/include/linux/mm.h#L556-L623)

파일의 Page Cache 입출력은 별도의 `address_space_operations`가 맡으며, Linux 6.12는 여기에 `read_folio`, `writepages`, `release_folio` 등의 함수 포인터를 연결한다. [Linux VFS의 Address Space Operations](https://docs.kernel.org/6.12/filesystems/vfs.html#struct-address-space-operations)

Windows의 VAD와 PFN 역시 구분해서 본다. WinDbg의 `!vad`는 가상 주소 Descriptor와 범위를, `!pfn`은 물리 Page Frame의 상태를 확인하는 데 사용한다. Working Set은 프로세스가 현재 물리 메모리에 유지하는 페이지를 다루는 관점이다. 이 이름들을 모두 `palloc`과 일대일로 대응시키거나 Windows의 교체 정책을 하나의 고정 알고리즘으로 단정하지 않는다. [WinDbg VAD](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-vad), [WinDbg PFN](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-pfn), [Working Set](https://learn.microsoft.com/en-us/windows/win32/memory/working-set)

QEMU의 System Emulation은 Guest CPU의 주소 변환과 예외를 실행한다. SPT의 `struct page`를 해석해 파일이나 Swap 복구 정책을 대신 고르는 주체는 아니다. 그 정책은 QEMU 위에서 실행되는 PintOS 코드가 수행한다. Guest 물리 주소가 어느 Host 메모리 영역으로 이어지는지도 Machine의 Memory Mapping을 거치므로 모든 주소를 하나의 `RAMBlock.host + guest_pa` 식으로 계산하지 않는다.

문서를 코드와 대조할 때는 `vm.c`의 등록·Claim·Fault·교체 흐름을 먼저 연결하고, 타입별 바이트 준비는 `uninit.c`, `anon.c`, `file.c`로 내려간다. Page 객체의 존재, Frame의 할당, PTE의 Present와 실제 데이터 준비는 각각 다른 상태다. 이 네 가지를 구분해야 잘못된 접근과 아직 준비되지 않은 접근, 준비 도중의 실패를 설명할 수 있다.
