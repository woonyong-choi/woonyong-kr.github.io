---
layout: default
title: Swap
nav_order: 7
permalink: /wiki/computer-systems-network-swap-11630540adf8/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-swap-11630540adf8
projection_sha256: e6b307288c6f73bd4bc21c825d71416369044c0f9ce66d333a51313a54c8dff6
parent: 가상 메모리 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-83f24986336f
search_terms:
- anon_swap_in
- anon_swap_out
- anon_destroy
- swap_slot
- in_swap
- swap_table
- SECTORS_PER_PAGE
- bitmap_scan_and_flip
grand_parent: PintOS
ancestor: CS 기초
---

# Swap
{: .no_toc }

Frame을 다른 페이지에 내주려면 그 안의 데이터를 나중에 어떻게 복원할지 알아야 한다. 원본 파일에서 다시 읽을 수 있는 깨끗한 데이터와, 실행 중에 만들어져 파일로 복원할 수 없는 데이터는 이 조건이 다르다. Swap은 후자의 내용을 별도 저장 공간에 보관했다가 다시 메모리로 가져오는 데 쓰인다.

여기서는 [PintOS `5afaa6d`의 `anon.c`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c)를 기준으로 익명 페이지의 상태와 Swap Slot을 살펴본다. 이 구현의 Slot은 한 페이지를 저장하며, Bitmap이 사용 여부를 관리한다.

## 익명 페이지와 파일에서 가져온 초기 내용

Stack과 Heap, 초기값을 0으로 채우는 BSS는 익명 메모리를 이해하는 대표적인 사례다. 다만 `malloc()`을 호출할 때마다 새 페이지를 할당하는 것은 아니며, 이미 확보한 Heap 안의 공간을 재사용할 수도 있다. ‘파일에서 시작했는가’와 ‘현재 내용을 복구할 저장소(Backing Store)가 어디인가’도 구분해야 한다.

PintOS의 ELF Loader는 파일의 바이트를 읽는 Page도 최종 타입 `VM_ANON`으로 등록한다. 따라서 이 코드에서는 `.text`나 `.data`에서 시작한 데이터도 ANON의 Swap 경로를 탈 수 있다. `VM_FILE`로 등록한 File Mapping의 동작은 [PintOS mmap](/wiki/computer-systems-network-mmap-838e9b0f7e0a/)에서 다룬다. 일반 OS에서도 Private Mapping에서 수정된 내용을 원본 실행 파일에 그대로 쓰는 것과 Shared Mapping의 Writeback은 같은 정책이 아니다.

ANON Page는 먼저 UNINIT으로 등록된 뒤 타입별 초기화를 거친다. `anon_initializer()`는 Operations를 `anon_ops`로 바꾸고 `swap_slot = BITMAP_ERROR`, `in_swap = false`를 설정한다. 이 함수 자체는 데이터 Frame을 0으로 채우지 않는다. `anon_swap_in()`의 ‘아직 Swap에 없음’ 분기에는 Zero Fill이 있지만, 첫 UNINIT 초기화가 그 분기를 자동으로 실행하는 것은 아니다. 최초 바이트가 준비되는 순서는 [지연 적재](/wiki/computer-systems-network-topic-0a62f7f28b03/)에서 확인할 수 있다.

## Page 상태와 Slot 좌표

`struct anon_page`의 필드는 `swap_slot`과 `in_swap`이다. 전자는 Swap 영역의 슬롯 번호이고, 후자는 그 번호가 현재 복구에 사용할 슬롯을 나타내는지 구분한다. Slot 번호는 사용자 VA나 Frame의 PA와 다른 좌표다.

| 항목 | 이 구현의 값과 의미 |
| --- | --- |
| `PGSIZE` | 4096바이트 |
| `DISK_SECTOR_SIZE` | 512바이트 |
| `SECTORS_PER_PAGE` | `4096 / 512 = 8` |
| `BITMAP_ERROR` | `SIZE_MAX`, 유효한 Slot을 찾지 못했음을 나타냄 |
| Slot `N`의 시작 Sector | `N * 8` |
| Slot `N`의 논리 바이트 Offset | `N * 4096` |
| Swap 장치 | `disk_get(1, 1)`, 두 번째 IDE 채널의 Slave |

예를 들어 Slot 5는 Sector 40–47에 저장된다. 논리 디스크에서의 시작 Offset은 20,480바이트다. 이 값을 QEMU 이미지 파일의 물리적인 저장 위치와 항상 같다고 가정할 수는 없다. 이미지 형식과 Block Backend가 그 사이의 변환을 담당한다.

`vm_anon_init()`은 장치의 전체 Sector 수를 8로 나눈 몫만큼 Bitmap을 만든다. 1 MiB 장치라면 256개, 4 MiB 장치라면 1,024개 Slot에 해당한다. 장치가 없거나 Bitmap을 만들지 못하면 Swap 입출력을 처리할 수 없다. Slot 개수는 실제 연결한 디스크로부터 구하며, 고정된 기본 용량을 전제로 하지 않는다.

`swap-anon`은 20 MiB 배열에 4 KiB 간격으로 한 바이트씩, 총 5,120곳에 접근하며, `Make.tests`는 이 테스트에 `MEMORY=10`, `SWAP_DISK=30`, `TIMEOUT=180`을 지정한다. 여기서 `SWAP_DISK=30`을 정확히 30 MiB라고 읽어서는 안 된다. 이 실행기는 정수 크기로 임시 디스크를 만들 때 `0xfc000 × 크기`바이트를 기록한다. 아래 계산은 이 생성식과 4 KiB Page를 기준으로 하며, 실제 연결된 디스크를 읽거나 테스트를 실행하지 않는다. [swap-anon 설정](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/Make.tests#L127-L129), [임시 디스크 생성식](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/utils/pintos#L42-L55)

```run-python
swap_disk_option = 30
array_mib = 20
page_bytes = 4096
sector_bytes = 512
assert isinstance(swap_disk_option, int) and swap_disk_option > 0
assert isinstance(array_mib, int) and array_mib > 0

image_bytes = 0xfc000 * swap_disk_option
sector_count = image_bytes // sector_bytes
slot_count = sector_count // (page_bytes // sector_bytes)
access_count = array_mib * 1024 * 1024 // page_bytes
print("이미지 바이트:", image_bytes)
print("Sector 수:", sector_count, "Slot 수:", slot_count)
print("4 KiB 간격의 접근 수:", access_count)
assert slot_count * page_bytes <= image_bytes < (slot_count + 1) * page_bytes
```

기본값으로 계산하면 이미지 30,965,760바이트, Sector 60,480개, Slot 7,560개다. 4 KiB 간격의 접근 5,120회가 Slot 수보다 적다는 사실만으로 테스트 통과나 특정 Page의 Swap Out을 증명할 수는 없다. 실제 Frame 공급량과 다른 Page의 사용량, 교체 정책도 영향을 준다. 4 KiB 간격으로 한 바이트씩 비교하는 테스트의 범위는 [페이지 교체의 테스트 관찰](/wiki/computer-systems-network-topic-163345dd1b02/#gdb로-선택과-재사용을-따라가기)에서 이어서 살펴본다.

페이지 안의 바이트와 디스크의 Sector가 어떻게 대응하는지 계산해 보자. 아래에서 `slot`을 바꾸면 같은 페이지가 다른 Slot에 저장될 때의 범위를 볼 수 있다. 메모리 주소는 이 계산에 들어가지 않는다.

```run-python
PAGE_SIZE = 4096
SECTOR_SIZE = 512
slot = 42
sectors_per_page = PAGE_SIZE // SECTOR_SIZE
assert PAGE_SIZE % SECTOR_SIZE == 0 and slot >= 0

for i in range(sectors_per_page):
    sector = slot * sectors_per_page + i
    page_start = i * SECTOR_SIZE
    disk_start = sector * SECTOR_SIZE
    print(f"Page[{page_start:4d}..{page_start + SECTOR_SIZE - 1:4d}]"
          f" → Sector {sector} → 디스크 바이트 {disk_start}..{disk_start + SECTOR_SIZE - 1}")

start = slot * PAGE_SIZE
end = start + PAGE_SIZE - 1
print("Slot 전체 범위:", start, "..", end)
assert end - start + 1 == PAGE_SIZE
```

Slot 42라면 Sector 336–343, 논리 디스크의 바이트 172,032–176,127에 해당한다. **디스크 전체를 그대로 담은 Raw 이미지**를 안정된 상태에서 읽는 경우에만 이 Offset을 파일 도구에 그대로 사용할 수 있다. 예를 들어 Slot 3의 다섯 번째 Sector는 `(3 * 8 + 4) * 512 = 14336`에서 시작한다. 해당 조건을 만족하는 자신의 `swap.dsk`가 있을 때 다음 명령으로 512바이트를 확인할 수 있다. 실행 중인 이미지의 변경 시점이나 Cache까지 고정하는 명령은 아니다.

```sh
xxd -s 14336 -l 512 swap.dsk
```

## 저장·복원·폐기를 나눠 보기

Swap Out은 빈 Slot을 확보하고 Frame의 4 KiB를 512바이트씩 여덟 번 쓴다. 빈 Slot이 없으면 `bitmap_scan_and_flip()`이 `BITMAP_ERROR`를 반환하므로 `anon_swap_out()`은 데이터를 쓰기 전에 `false`를 반환한다. 쓰기가 끝나면 해당 Page의 `swap_slot`과 `in_swap`을 갱신한다. `swap_lock`은 여덟 번의 I/O를 포함한 구간 전체에서 한 번 획득하고 해제한다.

PTE의 Present Bit를 내리고 Page와 Frame의 연결을 끊는 작업은 바깥의 `vm_evict_frame()`이 맡는다. `anon_swap_out()`이 실패하면 그 후속 정리로 진행하지 않는다. 데이터를 보관한 뒤 기존 Mapping을 제거해야 아직 복구할 수 없는 Page의 Frame을 재사용하는 일을 피할 수 있다. [Frame 교체 호출부](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L241-L259)

Swap In은 기록된 Slot의 여덟 Sector를 새 Frame에 읽는다. 이어 Bitmap을 비우고 `swap_slot = BITMAP_ERROR`, `in_swap = false`로 돌린다. 이 구현은 복원한 Page가 그 Slot을 더 이상 소유하지 않는 방식이다. Slot은 다른 페이지가 다시 사용할 수 있다.

프로세스 종료처럼 데이터를 복원할 필요 없이 Page를 없앨 때에는 `anon_destroy()`가 사용 중인 Slot만 비운다. 이때 Swap 데이터를 읽어 올 필요는 없다. Frame과 Page 객체 자체의 정리는 호출자인 `vm_dealloc_page()`의 후속 단계가 담당한다. 이 경계는 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)의 자원 회수와 연결된다.

아래 예제는 Slot 두 개와 메모리 배열로 표현한 디스크를 사용한다. Slot 고갈, 복원 뒤 재사용, 읽기 없이 폐기하는 경로를 실행할 수 있다. PintOS Kernel, 실제 디스크 오류와 동시성은 재현하지 않는다.

```run-python
PAGE_SIZE = 4096
SECTOR_SIZE = 512
SECTORS_PER_PAGE = PAGE_SIZE // SECTOR_SIZE

class SwapSlots:
    def __init__(self, capacity):
        self.used = [False] * capacity
        self.disk = bytearray(capacity * PAGE_SIZE)
        self.reads = 0
        self.writes = 0

    def store(self, page):
        assert len(page) == PAGE_SIZE
        slot = next((i for i, used in enumerate(self.used) if not used), None)
        if slot is None:
            raise MemoryError("빈 Swap Slot이 없습니다.")
        self.used[slot] = True
        for i in range(SECTORS_PER_PAGE):
            disk_offset = slot * PAGE_SIZE + i * SECTOR_SIZE
            page_offset = i * SECTOR_SIZE
            self.disk[disk_offset:disk_offset + SECTOR_SIZE] = page[page_offset:page_offset + SECTOR_SIZE]
            self.writes += 1
        return slot

    def restore(self, slot):
        assert self.used[slot]
        page = bytearray(PAGE_SIZE)
        for i in range(SECTORS_PER_PAGE):
            disk_offset = slot * PAGE_SIZE + i * SECTOR_SIZE
            page_offset = i * SECTOR_SIZE
            page[page_offset:page_offset + SECTOR_SIZE] = self.disk[disk_offset:disk_offset + SECTOR_SIZE]
            self.reads += 1
        self.used[slot] = False
        return page

    def discard(self, slot):
        assert self.used[slot]
        self.used[slot] = False

swap = SwapSlots(2)
a = swap.store(b'A' * PAGE_SIZE)
b = swap.store(b'B' * PAGE_SIZE)
before = (swap.used.copy(), bytes(swap.disk), swap.writes)
try:
    swap.store(b'C' * PAGE_SIZE)
except MemoryError as error:
    print(error)
assert (swap.used, bytes(swap.disk), swap.writes) == before

assert swap.restore(a) == b'A' * PAGE_SIZE
c = swap.store(b'C' * PAGE_SIZE)
assert c == a
reads_before = swap.reads
swap.discard(b)
assert swap.reads == reads_before
assert swap.disk[b * PAGE_SIZE:(b + 1) * PAGE_SIZE] == b'B' * PAGE_SIZE
print("A를 복원한 뒤 C가 사용한 Slot:", c)
print("사용 중인 Slot:", swap.used)
print("Sector 읽기:", swap.reads, "회, 쓰기:", swap.writes, "회")
assert swap.reads == 8 and swap.writes == 24
```

Bitmap을 비운다고 저장 장치의 바이트를 즉시 0으로 지우는 것은 아니다. 위 모델의 B 데이터도 폐기 뒤 배열에 남아 있지만, 더 이상 복구에 사용할 Slot으로 소유하지 않는다. Slot의 수명과 데이터 지우기는 서로 다른 동작이다.

## Bitmap의 저장 공간과 탐색 비용

앞의 실행 모델은 읽기 쉽게 사용 여부를 Python List에 담았다. 실제 PintOS의 `struct bitmap`은 `bit_cnt`와 `unsigned long *bits`를 가지며, 각 Slot을 비트 하나로 나타낸다. 이 x86-64 구성에서 배열 원소 하나는 64비트를 담는다. Slot `N`은 `bits[N / 64]`의 `N % 64`번째 비트에 대응한다. [Bitmap 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/kernel/bitmap.c)

1,024개 Slot의 비트 배열은 16개 원소, 128바이트다. 여기에 `struct bitmap`과 메모리 할당기의 부가 공간이 더해진다. `bitmap_scan_and_flip(b, start, cnt, value)`는 지정한 값의 비트 `cnt`개가 연속된 첫 위치를 찾고 값을 뒤집는다. Swap에서는 `start = 0`, `cnt = 1`, `value = false`로 호출한다. 마지막 비트만 비었거나 전부 사용 중이면 전체 Slot을 검사하므로 이 호출의 최악 탐색 비용은 O(n)이다.

다음 모델은 마지막 Slot 하나만 빈 경우에 비트 위치와 검사 횟수를 보여 준다. Python 실행 시간을 PintOS의 처리 시간으로 측정하는 예제는 아니다.

```run-python
slot_count = 1024
bits_per_word = 64
assert slot_count > 0
words = [0] * ((slot_count + bits_per_word - 1) // bits_per_word)

def mark(slot):
    words[slot // bits_per_word] |= 1 << (slot % bits_per_word)

def is_used(slot):
    return bool(words[slot // bits_per_word] & (1 << (slot % bits_per_word)))

for slot in range(slot_count - 1):
    mark(slot)

checks = 0
found = None
for slot in range(slot_count):
    checks += 1
    if not is_used(slot):
        found = slot
        mark(slot)
        break

assert found == slot_count - 1 and checks == slot_count
print("확보한 Slot:", found)
print("배열 원소:", found // bits_per_word, "비트 위치:", found % bits_per_word)
print("검사한 Slot:", checks)
print("PintOS 비트 배열의 데이터 크기:", len(words) * 8, "바이트")
```

개별 비트를 바꾸는 명령이 원자적이어도 ‘빈 비트 찾기 → 점유’ 전체가 자동으로 원자적인 것은 아니다. 두 실행 흐름이 같은 빈 비트를 발견할 수 있으므로 Swap 코드는 탐색과 점유를 같은 `swap_lock` 안에서 수행한다. Slot 수나 탐색 복잡도만으로 실제 병목 여부를 단정할 수는 없다. Disk I/O와 Lock 대기까지 함께 측정해야 한다.

## COW의 Frame 공유와 Slot 공유

현재 PintOS에는 Frame의 `ref_count`가 있지만 Swap Slot의 참조 카운트는 없다. `anon_ops`에도 `.copy` Callback이 없으며 `anon_copy()`나 `swap_slot_ref()`를 통해 Slot을 공유하는 구현은 들어 있지 않다. 교체 후보를 고를 때는 `frame->ref_count == 1`인 Frame만 허용한다. 따라서 COW로 공유한 Frame 전체를 한 Slot에 저장하고 모든 소유자의 상태를 바꾸는 경로와 구분해야 한다. [교체 가능한 Frame의 조건](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)

이미 Swap에 있는 부모 Page의 복사도 별도로 검토해야 한다. 이 버전의 SPT 복사에서 새 자식 Page를 Claim하는 것만으로 부모의 Swap 내용을 복원해 복제하는 절차가 완성되지는 않는다. Frame이 있는 Page의 COW 분기와 디스크에만 데이터가 남은 Page는 입력 상태가 다르다. 자세한 복사 경로는 [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/)에서 다룬다.

W11 기준 커밋 `09390dd`는 Bitmap과 별도로 `size_t` 참조 수 배열을 할당하고 모든 원소를 0으로 초기화한다. 초기화 중 Swap 장치, Bitmap 또는 참조 수 배열을 확보하지 못하면 각각 Panic으로 멈춘다. 이후 `swap_slot_alloc()`이 빈 비트를 점유하면서 해당 카운터를 1로 바꾸고, `swap_slot_ref()`·`swap_slot_unref()`는 Slot 범위를 검사하고, 같은 Lock 안에서 점유 비트와 양수 참조 수를 확인한 뒤 증감한다. 현재 학습 레포의 Bitmap만 사용하는 구현과 구분해야 한다. [W11 Slot 관리 초기화와 참조 수](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/anon.c#L39-L97)

Slot 공유를 설계하려면 한쪽이 복원했다고 다른 쪽의 복구 데이터까지 해제하지 않도록 해야 한다. 아래는 이 수명 조건만 보여 주는 별도 모델이다. 현재 PintOS가 구현한 기능을 실행하는 코드는 아니다.

참조 카운트를 별도 배열로 두는 설계라면 비트 배열 외의 저장 공간도 필요하다. 예를 들어 1,024개 Slot마다 64비트 카운터를 둔다면 카운터 배열만 8 KiB다. 이는 현재 구현의 메모리 사용량이 아니라 그 설계를 추가했을 때의 계산이다.

```run-python
slot = 5
references = {"parent": slot, "child": slot}
allocated = {slot}

def release(owner):
    released = references.pop(owner)
    if released not in references.values():
        allocated.remove(released)
    print(owner, "참조 해제 뒤:", references, "사용 중인 Slot:", sorted(allocated))

release("parent")
assert slot in allocated and references["child"] == slot
release("child")
assert not allocated
```

Linux는 Swap 영역의 사용 상태를 `swap_map` 등으로 관리하며, Non-present PTE에 Swap의 Type과 Offset을 표현할 수 있다. `swap_map`에는 사용 수 이외에 Cache 상태나 추가 Count를 나타내는 비트도 있어 단순한 정수 배열 하나로 전부 설명할 수는 없다. 페이지 크기 역시 아키텍처와 구성에 따라 달라지므로 Linux에서도 항상 4 KiB라고 두지 않는다. [Linux Swap 상태](https://github.com/torvalds/linux/blob/v6.12/include/linux/swap.h), [Swap Entry 표현](https://github.com/torvalds/linux/blob/v6.12/include/linux/swapops.h)

Linux v6.12의 `copy_nonpresent_pte()`는 일반 Swap Entry를 복제할 때 `swap_duplicate()`를 호출하고, 기존 Entry의 exclusive 표시가 있다면 공유 상태로 바꾼다. 후속 Swap Fault는 읽기 접근에서도 발생할 수 있다. `do_swap_page()`는 먼저 Swap Cache를 찾고, 필요한 경우 저장 데이터를 읽어 온다. 쓰기 접근도 해당 Folio를 사적으로 사용할 수 있는 조건이면 재사용할 수 있으므로, 언제나 임시 Frame을 읽고 다른 Frame을 하나 더 복사하는 순서로 설명할 수는 없다. Swap 데이터의 복원과 사적인 쓰기를 위한 COW를 각각 확인해야 한다. [Swap Entry의 복제](https://github.com/torvalds/linux/blob/v6.12/mm/memory.c#L791-L820), [Swap Cache 조회와 적재](https://github.com/torvalds/linux/blob/v6.12/mm/memory.c#L4200-L4326), [쓰기 권한과 후속 COW](https://github.com/torvalds/linux/blob/v6.12/mm/memory.c#L4536-L4604)

## 디스크 I/O와 실패의 범위

PintOS가 Page 하나를 저장하거나 복원할 때 `disk_write()` 또는 `disk_read()`를 여덟 번 호출한다는 사실은 호스트 물리 디스크가 정확히 여덟 번 동작했다는 뜻이 아니다. Guest의 Sector I/O는 QEMU의 장치 에뮬레이션과 Block Backend를 거친다. 채널 번호와 IRQ를 고정해서 첫 번째 IDE 채널의 값으로 읽어서도 안 된다. 실제 장치 경로는 [IDE Controller](/wiki/ide-controller/), 이미지와 호스트 파일 경계는 [QEMU Block Backend](/wiki/qemu-block-backend/)에서 구분한다.

어떤 Slot이 비어 있는지 판단하는 것은 Guest인 PintOS의 일이다. QEMU의 IDE 장치나 Block Backend가 `swap_table`의 비트를 보고 Slot을 할당하지는 않는다. Bitmap 조작은 Guest 메모리의 연산이며, 실제 디스크 접근은 그 뒤의 `disk_read()`·`disk_write()` 경로에서 발생한다.

메모리 Page, 파일시스템의 할당 단위, 장치의 논리·물리 Sector도 따로 구분해야 한다. 예를 들어 512e 장치는 논리 Sector를 512바이트로 제공하면서 물리 Sector는 4 KiB로 사용한다. 4Kn은 두 크기 모두 4 KiB다. Windows의 NTFS Cluster 역시 포맷할 때 정하는 값이므로 Page 크기와 항상 일치한다고 볼 수 없다. [논리·물리 Sector](https://learn.microsoft.com/en-us/windows/compatibility/advanced-format-disk-compatibility-update), [NTFS 할당 단위](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/format)

Linux에서는 Block 계층의 BIO에 페이지와 그 안의 범위를 연결할 수 있다. Swap 파일 활성화 때도 파일 블록 크기와 `PAGE_SIZE`의 관계를 따로 확인한다. 따라서 PintOS의 ‘512바이트씩 함수 여덟 번 호출’이라는 구현을 다른 OS의 입출력 횟수로 옮겨 해석하지 않는다. [BIO의 페이지 범위](https://cdn.kernel.org/doc/html/latest/filesystems/api-summary.html), [Linux 6.12의 Swap I/O](https://github.com/torvalds/linux/blob/v6.12/mm/page_io.c)

이 코드에서 빈 Slot 없음이나 Swap 장치 없음은 `false` 반환으로 이어질 수 있다. 반면 `disk_read()`·`disk_write()`는 Sector별 성공 여부를 `bool`로 돌려주는 API가 아니다. 여덟 번 중 일부만 끝난 디스크 오류를 Swap 함수가 원자적으로 되돌린다고 보장할 수 없다. 정상 반환의 의미와 전원 손실 뒤의 영속성도 같은 조건이 아니다.

## GDB에서 Page와 Bitmap을 관찰하기

`vm_anon_init()`에서는 `disk_get()` 결과를 대입한 줄을 지난 뒤 `swap_disk`가 NULL이 아닌지 확인하고 `swap_disk->name`을 읽는다. 현재 학습 레포의 Bitmap은 생성 이후 `swap_table`에서 관찰한다. W11의 `disk_bitmap`·`swap_slot_count`·`swap_ref_count`는 참조 수 배열의 초기화까지 끝난 뒤 대조한다.

해당 Revision을 디버그 정보와 함께 빌드하고 실행 중인 PintOS에 GDB를 연결한 상태에서 다음 함수에 멈출 수 있다. 아래는 관찰 절차이며 실제 실행 로그는 아니다.

```gdb
break anon_swap_out
break anon_swap_in
break anon_destroy
continue
```

함수에 들어왔을 때 `page->va`, `page->anon.in_swap`, `page->anon.swap_slot`을 확인한다. Frame이 있는 경로에서는 `page->frame->kva`와 `page->frame->ref_count`도 볼 수 있다. Slot 확보 뒤의 지역 변수 `slot`은 해당 대입을 지난 시점에서 읽어야 한다.

Bitmap을 확인하려고 `bitmap_scan_and_flip()`을 직접 호출하면 빈 Slot을 실제로 점유해 프로그램 상태가 바뀐다. 관찰할 때는 이미 저장된 상태를 읽거나 함수가 반환한 Slot을 확인해야 한다. `swap_table`이 존재하고 Slot이 범위 안에 있는지 확인한 뒤에는 디버그 정보의 `bit_cnt`와 `bits`를 읽어 Bitmap의 해당 비트를 따라갈 수 있다.

Swap Out 전후에는 Slot 점유와 데이터 저장을, Swap In 뒤에는 Slot 반환과 `in_swap` 해제를, 미복원 종료에서는 읽기 없이 Slot을 반환하는지 구분해서 살펴본다. Frame 교체와 PTE 정리는 이 함수들 바깥의 [가상 메모리 구현](/wiki/computer-systems-network-topic-83f24986336f/)까지 이어서 확인한다.

저장한 내용과 복원한 내용을 비교할 때는 동일 Page의 대응하는 저장·복원 시점을 잡는다. 4 KiB Page와 512 Byte Sector를 사용하는 이 PintOS에서 Slot 3은 Sector 24부터 시작한다. Raw 이미지가 별도 기준 오프셋 없이 연결되어 있다면 파일의 바이트 오프셋은 `24 * 512 = 12,288`이다. 이 계산의 이미지 형식 조건은 [QEMU의 Raw 오프셋](/wiki/computer-systems-network-qemu-b1366076be02/#raw-이미지의-직접-오프셋은-조건이-있다), 바이트 덤프의 읽기 범위는 [Paging의 비교 절차](/wiki/computer-systems-network-topic-dbd836d1a044/#gdb로-mapping과-데이터를-함께-확인한다)에서 확인한다. 해당 Page의 전체 4,096바이트를 비교하고, 비교 사이에 내용이 변경되거나 Slot이 재사용되지 않았는지도 확인한다. 전체가 같다는 결과는 비교한 Page의 해당 복원을 뒷받침하며, 모든 Swap I/O의 정확성을 증명하지는 않는다.

부모의 저장 내용을 자식이 그대로 읽는지는 자식이 `exec()`하지 않는 별도 흐름에서 확인한다. fork 전에 부모 Page가 실제로 ANON 타입이고 Frame 없이 유효한 Slot을 가리키는지 확인하고, 저장한 바이트를 비교 기준으로 남긴다. W11의 Slot 공유 경로라면 fork 뒤에는 서로 다른 Page 객체가 같은 Slot을 참조해야 한다. 부모가 먼저 Swap In하거나 종료한 뒤 자식이 해당 VA를 읽는 순서와, 자식이 먼저 읽는 순서를 각각 관찰한다. 남은 참조가 있는 동안 Slot이 재사용되지 않고 자식이 기준 바이트를 얻는지가 확인할 조건이다. 큰 배열을 썼다는 사실만으로 특정 Page의 Swap Out을 증명할 수는 없으며, 자식이 먼저 `exec()`하면 상속받은 주소 공간을 새 프로그램으로 바꾸므로 이 비교를 할 수 없다. [W11 슬롯 참조와 복원](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/anon.c#L59-L150), [구현별 Slot 복제의 차이](/wiki/computer-systems-network-topic-4af2e32913a4/#현재-학습-레포와-w11-작업본은-소유권을-다르게-기록한다)
