---
layout: default
title: 페이지 교체
nav_order: 6
permalink: /wiki/computer-systems-network-topic-163345dd1b02/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-163345dd1b02
projection_sha256: 543a7130e00a298fce7ce0acf190877864da6d667705e5a77f0e25e9ebec3b5d
parent: 가상 메모리 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-83f24986336f
search_terms:
- vm_get_frame
- vm_get_victim
- vm_evict_frame
- vm_frame_evictable
- clock_hand
- frame_lock
- pml4_is_accessed
- file_backed_swap_out
grand_parent: PintOS
ancestor: CS 기초
---

# 페이지 교체
{: .no_toc }

새 페이지를 올릴 Frame이 없다면 기존 페이지의 Frame을 재사용해야 한다. 이때 필요한 일은 교체 대상을 고르는 것, 기존 내용을 복원할 수 있게 보존하는 것, 이전 Mapping을 끊는 것이다. 어느 하나라도 빠지면 새 페이지가 다른 프로세스의 데이터를 덮어쓰거나, 나중에 돌아온 페이지가 이전 내용을 잃을 수 있다.

여기서는 [PintOS `5afaa6d`의 `vm.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)를 따라 Frame 할당 실패부터 재사용까지 살펴본다. 알고리즘의 일반적인 선택 기준은 [메모리 관리의 페이지 교체](/wiki/computer-systems-network-topic-e50fd5d11ab2/)로, 익명 페이지의 데이터 저장 방식은 [Swap](/wiki/computer-systems-network-swap-11630540adf8/)으로 이어진다.

## 할당 실패에서 교체로 넘어가기

`vm_get_frame()`은 먼저 `struct frame`을 만들고 `palloc_get_page(PAL_USER)`로 User Pool의 물리 페이지를 얻는다. Frame 객체의 `malloc()`부터 실패하면 교체를 시도하기 전에 `NULL`을 반환한다. 객체를 만들었지만 User Pool에서 페이지를 얻지 못한 경우에는 그 빈 객체를 해제하고 `vm_evict_frame()`으로 기존 Frame을 구한다.

새로 할당한 Frame과 교체해서 얻은 Frame 모두 이후에는 현재 Thread를 `owner_thread`로 기록하고 `ref_count = 1`로 준비한다. `frame_table`에 이미 들어 있는 객체인지 확인하므로, 교체한 Frame을 같은 목록에 다시 중복 삽입하지 않는다. 기존 Frame을 재사용하는 경로는 그 물리 페이지를 `palloc_free_page()`로 반환했다가 다시 할당하는 절차가 아니다.

`vm_get_frame()` 위의 ‘항상 유효한 주소를 반환한다’는 주석과 달리 실제 코드에는 실패 반환이 있다. 교체 후보가 없거나 페이지 내용을 내보내지 못하면 Frame 확보에 실패한다. 메모리가 가득 찼다는 사실만으로 교체가 반드시 성공하지는 않는다.

## Clock이 관찰하는 정보

정확한 LRU는 페이지들의 마지막 접근 순서를 유지해야 한다. Clock은 그 순서 대신 Accessed Bit를 이용해 최근 접근의 흔적을 살핀다. Accessed Bit가 켜져 있으면 한 번 더 기회를 주고 비트를 내린다. 이후 다시 검사할 때도 접근 흔적이 없으면 교체 대상으로 고를 수 있다. 이 값은 접근 횟수나 마지막 접근 시각을 담고 있지 않다.

Accessed Bit와 Dirty Bit는 역할이 다르다. 기본 Clock은 Accessed Bit로 후보를 고르고, 페이지를 실제로 내보내는 단계는 페이지의 종류와 Dirty 상태에 따라 보존 방법을 결정한다. 익명 페이지의 복구 데이터를 원본 파일의 Dirty Writeback과 같은 조건으로 판단해서는 안 된다.

현재 PintOS는 `frame_table`, `frame_lock`, `clock_hand`로 순회를 관리한다. `clock_ptr`, `frame->owners`, `vm_frame_accessed()`를 사용하는 다른 설계의 코드를 이 Revision의 구현으로 읽으면 안 된다.

## 후보 조건과 두 바퀴의 상한

`vm_get_victim()`은 `frame_lock`을 잡은 상태에서 다음 순서로 검사한다.

1. 목록이 비어 있으면 후보 없이 끝낸다.
2. `clock_hand`가 없거나 목록 끝을 가리키면 첫 원소에서 시작한다.
3. Frame의 `kva`와 `page`가 있고 `ref_count == 1`인지 확인한다. 조건을 만족하지 않으면 건너뛴다.
4. 소유자의 PML4가 존재하고 해당 Page의 Accessed Bit가 켜져 있으면 비트를 내리고 다음 Frame으로 이동한다.
5. 후보를 찾으면 다음 위치로 `clock_hand`를 옮겨 둔 뒤 반환한다.

검사 횟수는 호출 시점의 `list_size(&frame_table) * 2`로 제한한다. 이는 **실제 코드의 순회 상한**이다. 두 바퀴 안에 반드시 후보를 찾는다는 뜻은 아니다. 모든 Frame이 COW 공유 중이거나 다른 후보 조건을 만족하지 않으면 `NULL`을 반환한다. 후보가 된 Frame의 소유자나 PML4가 없을 때는 Accessed 검사 분기를 통과하지 않고 선택으로 진행한다는 점도 코드 그대로 구분해야 한다.

아래 모델에서 공유 Frame을 건너뛰는 경우, 모두 최근에 접근된 경우, 후보가 하나도 없는 경우를 비교할 수 있다. 실제 Page Table이나 동시 실행 중의 접근은 재현하지 않는다.

```run-python
from copy import deepcopy

def choose_victim(frames, hand=0):
    if not frames:
        return None, hand, []
    hand %= len(frames)
    trace = []
    for _ in range(2 * len(frames)):
        index = hand
        frame = frames[index]
        hand = (hand + 1) % len(frames)
        if not frame['kva'] or not frame['page'] or frame['refs'] != 1:
            trace.append((frame['name'], '후보 제외'))
            continue
        if frame['owner_pml4'] and frame['accessed']:
            frame['accessed'] = False
            trace.append((frame['name'], 'Accessed 해제'))
            continue
        trace.append((frame['name'], '선택'))
        return index, hand, trace
    return None, hand, trace

def frame(name, accessed, refs=1):
    return dict(name=name, accessed=accessed, refs=refs,
                kva=True, page=True, owner_pml4=True)

cases = [
    ('공유 Frame 건너뛰기', [frame('F0', False, 2), frame('F1', True), frame('F2', False)]),
    ('모두 최근에 접근됨', [frame('F0', True), frame('F1', True)]),
    ('전부 공유 중', [frame('F0', False, 2), frame('F1', False, 2)]),
]
results = []
for title, initial in cases:
    frames = deepcopy(initial)
    victim, hand, trace = choose_victim(frames)
    print(title, '→', trace, '다음 위치:', hand)
    results.append((victim, len(trace)))
assert results == [(2, 3), (0, 3), (None, 4)]
```

일반 Clock 설명에서 ‘첫 바퀴에 비트를 내리고 다음 바퀴에 선택한다’는 말은 검사 가능한 후보가 있고, 그 사이의 접근으로 비트가 다시 바뀌지 않는 상황을 전제로 한다. 이 조건과 구현의 유한한 검사 횟수를 나누어 보면 무한 반복이나 후보 없음도 함께 검토할 수 있다.

## Page 내용을 보존한 뒤 Mapping 끊기

`vm_evict_frame()`은 선택한 Page의 `operations->swap_out`을 호출한다. 이름에 Swap이 들어 있지만, 모든 타입이 Swap 디스크에 쓰는 것은 아니다.

| Page 타입과 상태 | 이 Revision의 보존 동작 |
| --- | --- |
| `VM_ANON` | Frame의 4 KiB를 Swap Slot의 여덟 Sector에 기록 |
| `VM_FILE`, Dirty이고 읽을 파일 바이트가 있음 | `page_read_bytes`만큼 원본 파일의 `ofs` 위치에 기록 |
| `VM_FILE`, Clean | 파일 Writeback 없이 성공 반환 |

File Page의 끝부분은 파일에서 읽은 바이트와 0으로 채운 바이트로 나뉠 수 있다. 따라서 Dirty Page를 내보낼 때 항상 4 KiB 전체를 파일에 쓰는 것은 아니다. `file_backed_swap_out()`은 실제로 기록한 바이트 수가 요청한 수와 같은지 확인하고, 성공한 뒤 Dirty Bit를 내린다. 자세한 파일 범위와 수명은 [PintOS mmap](/wiki/computer-systems-network-mmap-838e9b0f7e0a/)에서 다룬다. [File Page의 Swap Out](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c)

보존 함수가 `false`를 반환하면 `vm_evict_frame()`도 실패로 끝난다. 성공하면 소유자 PML4의 Present Bit를 내리고, 기존 `page->frame`과 `victim->page`, `victim->owner_thread`의 연결을 끊는다. 재사용할 Frame의 `ref_count`는 0이 아니라 1로 둔다. 이후 Frame을 확보한 호출자가 새 Page와 연결한다.

이전 Page의 SPT 항목은 남아 있어야 한다. PTE가 현재 접근 가능한 물리 Frame을 가리키는 동안, SPT의 Page는 해당 VA가 합법적인지와 다음 Fault에서 어디서 복원할지를 기억하기 때문이다. 아직 실제 Frame을 얻지 않은 `VM_UNINIT` Page는 이 교체 과정에서 내보낼 상주 Frame이 없다.

새 Page를 올리는 `vm_do_claim_page()`는 Page와 Frame을 연결하고 PTE를 설치한 뒤 `swap_in()`을 부른다. PTE 설치가 실패하면 연결과 Frame을 정리하지만, 마지막 `swap_in()` 실패는 반환값으로 전달할 뿐 이 함수 안에서 같은 정리를 반복하지 않는다. 따라서 기존 페이지 보존 성공, 새 PTE 설치 성공, 새 내용 적재 성공을 서로 다른 단계로 확인해야 한다. PTE가 존재한다는 사실만으로 전체 Claim이 끝났다고 판단할 수 없다.

다음은 **성공 여부가 정해진 보존 함수**를 이용해 Mapping 해제 순서만 확인하는 모델이다. 실제 파일·Swap I/O의 부분 실패나 동시성까지 보장하는 코드는 아니다.

```run-python
from copy import deepcopy

def evict(frame, preserve_succeeded):
    if not preserve_succeeded:
        return False
    frame['old_mapping_present'] = False
    frame['old_page_frame'] = None
    frame['page'] = None
    frame['owner'] = None
    frame['refs'] = 1
    return True

original = dict(kva='Frame F7', page='Page A', owner='부모', refs=1,
                old_mapping_present=True, old_page_frame='Frame F7')
failed = deepcopy(original)
assert not evict(failed, preserve_succeeded=False)
assert failed == original
print('보존 실패 뒤 기존 Mapping:', failed['old_mapping_present'])

reused = deepcopy(original)
assert evict(reused, preserve_succeeded=True)
assert reused['old_page_frame'] is None and not reused['old_mapping_present']
reused['page'] = 'Page B'
reused['owner'] = '새 소유자'
assert reused['kva'] == original['kva'] and reused['page'] != original['page']
print('같은 Frame의 새 용도:', reused)
```

`frame_lock`은 후보 목록을 순회하고 선택하는 구간을 보호하며 `vm_get_victim()`이 반환할 때 해제된다. 이어지는 Swap I/O 전체를 그 Lock이 보호한다고 설명할 수는 없다. 동시성까지 검증하려면 선택한 Frame의 수명과 재진입, 다른 Thread의 변경 가능성을 별도로 추적해야 한다.

## COW와 Accessed Bit의 관찰 범위

현재 구현은 `ref_count > 1`인 공유 Frame을 교체 후보에서 제외한다. 공유한 모든 Page의 PTE를 순회해 Accessed Bit를 합치거나, 하나의 Swap Slot을 모든 소유자에게 넘기는 구현은 없다. 공유 Frame만 남으면 메모리에 데이터가 있어도 이 교체 경로로는 Frame을 얻지 못할 수 있다. Slot 공유의 별도 설계 조건은 [Swap](/wiki/computer-systems-network-swap-11630540adf8/)에서 다룬다.

공유 Frame도 교체하는 설계라면 어느 소유자 하나가 접근했는지, 모든 Mapping을 어떻게 무효화할지, 각 Page가 어디에서 복구할지를 함께 관리해야 한다. 단일 `owner_thread`의 PTE만 관찰하는 코드를 다중 소유자 전체의 상태로 확대해석해서는 안 된다.

PintOS의 `pml4_is_accessed()`와 `pml4_is_dirty()`는 지정한 PML4에서 해당 VA의 PTE를 찾는다. 관찰 대상은 현재 실행 Thread의 주소 공간이 아니라 **해당 Frame의 소유자 주소 공간**이어야 한다. 같은 물리 Frame에 대한 서로 다른 VA Mapping의 접근 흔적도 자동으로 같은 비트에 모이지 않는다.

`pml4_set_accessed(..., false)`는 PTE의 Accessed Bit를 내리고, 수정한 PML4가 현재 CR3의 주소 공간이면 `invlpg`로 그 VA의 TLB 항목을 무효화한다. Translation Cache에 남은 상태와 실제 PTE가 어긋나지 않게 다루는 과정이다. 다음 접근이 항상 새 Page Walk를 수행한다고 생각하면 Accessed 관찰을 잘못 해석할 수 있다. [PTE 비트 조작과 무효화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

## 주소와 비트를 숫자로 확인하기

이 PintOS의 `PTE_A`는 bit 5인 `0x20`, `PTE_D`는 bit 6인 `0x40`이다. 아래 예제는 가상의 PTE `0x12345067`을 주소와 낮은 Flag로 나누고, User VA `0x8048123`의 페이지 내부 Offset `0x123`을 더한다. Kernel Alias 계산에는 해당 Revision의 `LOADER_KERN_BASE = 0x8004000000`을 사용한다. 실제 프로세스의 PTE를 읽는 코드는 아니다. [PTE 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/pte.h), [Kernel 기준 주소](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/loader.h)

```run-python
P, W, U, A, D = 0x1, 0x2, 0x4, 0x20, 0x40
KERN_BASE = 0x8004000000
pte = 0x12345067
va = 0x8048123
offset = va & 0xfff
physical_base = pte & ~0xfff
print('User Page:', hex(va & ~0xfff), 'Offset:', hex(offset))
print('Frame PA:', hex(physical_base), '낮은 Flag:', hex(pte & 0xfff))
print('같은 바이트의 PA:', hex(physical_base + offset))
print('Kernel Alias:', hex(KERN_BASE + physical_base + offset))
print('P/W/U/A/D:', [bool(pte & bit) for bit in (P, W, U, A, D)])

after_accessed_clear = pte & ~A
after_unmap = after_accessed_clear & ~P
print('Accessed 해제:', hex(after_accessed_clear))
print('이전 Mapping 해제:', hex(after_unmap))
assert offset == 0x123 and physical_base == 0x12345000
assert after_accessed_clear == 0x12345047
assert after_unmap == 0x12345046
assert after_unmap & D and not after_unmap & P
```

Present Bit를 내리는 연산은 PTE 전체를 0으로 덮어쓰는 것과 다르다. 예제에서도 주소 비트와 Dirty Bit는 남지만, Present가 0이므로 기존 User VA로 그 Frame에 접근할 수는 없다. 이 모델은 정수 계산만 수행하므로 TLB 무효화나 실제 메모리 보호까지 실행하지는 않는다. 또한 `PTE_ADDR`의 단순 마스크를 NX 같은 상위 Flag가 있는 임의의 x86-64 PTE 해독기로 확장해서 사용하면 안 된다.

## Dirty까지 고려하는 변형

NRU나 Enhanced Clock 계열에서는 Accessed와 Dirty를 함께 고려할 수 있다. 다음 네 상태는 그런 선택 기준을 이해하기 위한 분류다. 현재 PintOS의 기본 Clock에서 나아가 보존 비용까지 고려할 때 무엇이 달라지는지 보여 준다. [NRU의 네 상태](https://web.sfc.keio.ac.jp/~rdv/keio/sfc/teaching/undergrad-OS/undergrad-OS-2019/lec07-page-replacement.html)

| Accessed | Dirty | 관찰한 상태 |
| --- | --- | --- |
| 0 | 0 | 최근 접근 흔적이 없고, 이 Mapping에서 쓰기 흔적도 없음 |
| 0 | 1 | 최근 접근 흔적은 없으나 쓰기 흔적이 있음 |
| 1 | 0 | 최근 접근 흔적이 있으며 쓰기 흔적은 없음 |
| 1 | 1 | 최근 접근과 쓰기의 흔적이 모두 있음 |

이 순서로 우선순위를 주는 방식은 최근 참조가 없고 추가 Writeback을 줄일 수 있는 후보를 먼저 찾으려는 것이다. 다만 Dirty Bit 하나만으로 모든 Page의 보존 비용을 정할 수는 없다. 원본 파일로 복원 가능한지, Swap 사본이 있는지, 어떤 Mapping에서 비트를 관찰했는지가 함께 필요하다.

## Linux와 비교할 때 확인할 조건

Linux는 메모리 압력에 따라 `kswapd`가 비동기로 회수하거나, 할당을 수행하는 흐름에서 Direct Reclaim을 진행한다. Page Cache와 익명 메모리는 복원 방법이 다르며, 모든 Kernel Page나 DMA 버퍼를 같은 방식으로 재사용할 수 있는 것도 아니다. NUMA 환경에서는 Node와 Zone별 상태도 영향을 준다. PintOS의 단일 Frame 목록과 즉시 교체 흐름을 Linux의 전체 정책으로 옮겨 설명하지 않는다. [Linux 메모리 회수](https://docs.kernel.org/admin-guide/mm/concepts.html#reclaim)

Linux cgroup v2에서는 메모리 회수의 압력과 Swap 사용 한도도 그룹별로 제어한다. `memory.high`를 넘으면 해당 그룹의 실행을 늦추고 회수를 유도하며, `memory.swap.max`는 Swap 사용량의 상한을 둔다. 따라서 전체 RAM과 Swap의 빈 공간만으로 특정 프로세스가 사용할 수 있는 양을 판단하기는 어렵다. [Linux v6.12 cgroup의 메모리 제어](https://docs.kernel.org/6.12/admin-guide/cgroup-v2.html#memory)

전통적인 Active/Inactive LRU 계열과 Multi-Gen LRU도 구분해야 한다. Multi-Gen LRU는 접근 시기가 비슷한 페이지를 세대로 관리하는 대안이며, 사용 여부는 Kernel Build와 실행 설정에 따라 달라진다. 실행 환경을 비교할 때는 활성화된 정책과 페이지별 최근 접근 정보를 함께 확인해야 한다. [Multi-Gen LRU](https://docs.kernel.org/admin-guide/mm/multigen_lru.html)

Windows에서는 프로세스의 Working Set에서 페이지를 제거해도 그 내용이 곧바로 RAM에서 사라지는 것은 아니다. 모든 Working Set에서 빠진 뒤에도 다시 참조되거나 다른 용도로 재사용될 때까지 Transition 상태로 남을 수 있다. 수정된 내용은 재사용 전에 Backing Store에 보존해야 한다. 이미 메모리에 남은 페이지로 해결하는 Soft Fault와 파일·Pagefile을 읽어야 하는 Hard Fault도 구분한다. PintOS의 즉시 Frame 재사용과 Windows의 Working Set 조정을 같은 한 단계로 대응시키기 어려운 이유다. [Windows Working Set](https://learn.microsoft.com/en-us/windows/win32/memory/working-set)

메모리 압축도 디스크로 내보내기와 구분한다. Linux의 zswap은 Swap으로 보낼 Page를 압축해 RAM의 Cache에 보관할 수 있고, Windows 10의 메모리 압축도 내용을 압축한 채 RAM에 유지하는 경로를 제공한다. 압축에는 CPU 작업이 필요하므로, 줄어드는 메모리와 디스크 I/O뿐 아니라 복원 비용도 함께 살펴야 한다. [Linux v6.12 zswap](https://docs.kernel.org/6.12/admin-guide/mm/zswap.html), [Windows 10 메모리 압축](https://learn.microsoft.com/en-us/shows/seth-juarez/memory-compression-in-windows-10-rtm)

페이지 수와 I/O 비용을 계산할 때도 단위를 먼저 고른다. PintOS의 교체 순회에 들어가는 `N`은 그 시점의 `frame_table` 원소 수다. 총 RAM을 4 KiB로 나눈 값과는 다르다. ANON Page 하나를 내보내는 경로는 512바이트 Sector 쓰기 여덟 번이며, File Page의 Writeback 범위는 `page_read_bytes`다. 이 호출 횟수는 QEMU나 호스트 디스크의 실제 I/O 횟수나 지연 시간을 뜻하지 않는다. Swap 용량·Bitmap 크기의 계산은 [Swap](/wiki/computer-systems-network-swap-11630540adf8/)에 이어진다.

## GDB로 선택과 재사용을 따라가기

해당 Revision의 디버그 빌드를 실행하고 GDB를 연결한 뒤 다음 함수에 멈출 수 있다. 아래 명령은 관찰 시작점이며, 실제 실행 기록은 아니다.

```gdb
break vm_get_victim
break vm_evict_frame
break anon_swap_out
break file_backed_swap_out
break vm_do_claim_page
continue
```

`vm_get_victim()`에서는 지역 변수가 대입된 뒤 `frame`, `page`, `owner`, `scan_count`, `max_scans`를 읽는다. 실제 이름인 `clock_hand`의 위치를 함께 보고, 후보 제외와 Accessed 해제, 선택 중 어느 분기를 지나는지 구분한다. 빌드마다 달라지는 `vm_get_victim+80` 같은 명령어 Offset을 고정하면 원하는 분기에 멈춘다고 보장할 수 없다.

`vm_evict_frame()`에서 후보가 정해진 뒤에는 `victim`과 이전 `page`의 주소를 GDB 편의 변수에 저장해 둘 수 있다. `finish`를 실행하면 함수의 지역 변수 범위를 벗어나므로, 그 뒤에도 지역 변수 `victim`을 그대로 읽는 예제를 사용하지 않는다. 저장해 둔 주소로 기존 Mapping과 Page–Frame 연결이 언제 끊어졌는지 확인한다.

데이터 경로까지 볼 때는 `disk_write`, `disk_read`에 멈춰 `info args`로 실제 인자 이름과 Sector 번호를 확인한다. 파일 Writeback에서는 `page_read_bytes`와 반환한 바이트 수를 비교한다. 이후 `vm_do_claim_page()`에서 같은 `kva`가 새 Page에 연결되는지를 따라가면 ‘선택됨’과 ‘재사용 완료’를 구분할 수 있다.

실제 테스트도 이름이나 오래된 주석 대신 수행하는 연산을 읽어 골라야 한다. 같은 Revision의 [`page-linear.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/page-linear.c)는 5 MiB를 채우고 읽은 뒤 두 차례 변환해 원래 값이 유지되는지 검사한다.

[`swap-anon.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/swap-anon.c)는 20 MiB 배열에 4 KiB 간격으로 한 바이트씩 기록하고 다시 비교한다. 배열이 Page 경계에 정렬돼 있다는 조건은 이 소스에 없으며, 이 PintOS의 8비트 `char`에 저장한 패턴은 `i`가 256 늘어날 때마다 반복된다. 따라서 같은 패턴을 저장한 위치끼리 바뀌는 오류는 이 비교만으로 놓칠 수 있다.

반면 [`swap-file.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/swap-file.c)의 본문은 읽기 전용 mmap 데이터와 파일 끝부분의 0 채움을 검사하며, 주석에 적힌 익명 페이지로 메모리 채우기 단계는 없다. 이 파일만 보고 Dirty Writeback과 실제 교체가 검증됐다고 주장할 수 없다. 여기서는 테스트 코드를 대조했으며, Kernel 테스트의 통과 결과를 제시하지 않는다.

QEMU의 책임은 Guest 명령과 장치의 동작을 제공하는 것이다. 교체 대상 선택과 Swap Bitmap 관리는 PintOS 코드가 수행한다. Guest의 Accessed/Dirty 관찰, QEMU의 주소 변환 Cache, 디스크 Backend를 하나의 처리 단계처럼 섞지 않도록 [IDE Controller](/wiki/ide-controller/)와 [QEMU Block Backend](/wiki/qemu-block-backend/)의 경계를 함께 살펴본다.

QEMU의 `MemoryRegion`은 Guest가 보는 RAM·MMIO 등의 주소 영역을 표현하고, RAM 영역의 실제 내용은 Host 메모리로 뒷받침된다. Guest OS가 Swap으로 내보내는 것과 Host OS가 QEMU 프로세스의 메모리를 회수하는 것은 별개다. Guest Frame의 재사용이 곧 Host 메모리 할당 해제를 뜻하지도 않는다. [QEMU Memory API](https://www.qemu.org/docs/master/devel/memory.html)
