---
layout: default
title: 지연 적재
nav_order: 4
permalink: /wiki/computer-systems-network-topic-0a62f7f28b03/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-0a62f7f28b03
projection_sha256: 0e81e39ee4ecfe15a4e71403ddbc3e2521e451cb4457fd4d62b8aa768f688b03
parent: 가상 메모리 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-83f24986336f
search_terms:
- uninit_initialize
- uninit_destroy
- lazy_load_segment
- lazy_load_arg
- spt_copy_uninit_page
- page_initializer
grand_parent: PintOS
ancestor: CS 기초
---

# 지연 적재
{: .no_toc }

프로그램이 주소 공간을 확보했다는 사실과 그 내용을 물리 메모리에 모두 올렸다는 사실은 다르다. 지연 적재는 나중에 읽을 파일 위치와 초기화 방법을 먼저 기록하고, 실제 데이터 준비를 필요한 시점까지 미룬다. Demand Paging은 페이지에 대한 접근을 계기로 필요한 내용을 준비하는 방식이다. 지연 적재라는 표현은 페이지 이외의 자원에도 쓰인다.

여기서는 [PintOS `5afaa6d`의 VM 구현](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm)을 기준으로 ELF의 지연 적재를 살펴본다. 읽기 비용을 뒤로 미루면 시작할 때의 작업과 미사용 페이지의 Frame 수를 줄일 수 있다. 대신 첫 접근에는 Fault 처리 비용이 들며, Working Set이 커지면 여전히 Frame 부족과 교체가 발생한다. 가상 주소 공간을 크게 만드는 것과 실제 메모리 사용을 끝까지 보장하는 정책도 구분해야 한다.

## 파일을 읽기 전에 등록하는 정보

VM 경로의 `load_segment()`는 페이지마다 읽을 바이트와 0으로 채울 바이트를 나누고, 다음 정보를 `lazy_load_arg`에 저장한다.

| 필드 | 나중에 사용하는 정보 |
| --- | --- |
| `file` | `file_reopen()`으로 얻은 별도 `struct file *` |
| `ofs` | 이 페이지를 읽기 시작할 파일 Offset |
| `page_read_bytes` | 파일에서 읽을 바이트 수 |
| `page_zero_bytes` | 읽은 내용 뒤를 0으로 채울 바이트 수 |
| `map_start` | Mapping 시작 주소이며 ELF 적재에서는 `NULL` |

등록 함수에는 `VM_ANON`과 `lazy_load_segment` Callback을 전달한다. `vm_alloc_page_with_initializer()`가 내부에서 UNINIT Page를 만든다는 뜻이지 호출자가 최종 타입으로 `VM_UNINIT`을 전달한다는 뜻은 아니다. 실제 코드는 `VM_TYPE(type) != VM_UNINIT`을 Assert한다. 등록이 성공하면 SPT에 Page가 있지만 `page->frame`은 `NULL`이며 이 사용자 주소의 Mapping도 아직 없다. [등록과 ELF 적재](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1344-L1389)

UNINIT의 저장 공간에는 최종 타입, 내용 초기화 Callback `init`, 그 인자인 `aux`, 타입별 초기화 함수 `page_initializer`가 들어간다. 이들은 [가상 메모리 구현](/wiki/computer-systems-network-topic-83f24986336f/)에서 설명한 Page의 Union을 사용한다. 파일을 처음 읽는다는 이유만으로 최종 타입이 반드시 FILE이 되는 것은 아니다. 이 ELF 경로는 파일의 초기 바이트를 읽은 뒤 ANON으로 관리한다.

현재의 Callback·정리 계약에서는 Page마다 별도의 `aux`를 할당해 등록한 파일 Offset과 길이를 유지한다. 하나의 `aux`를 여러 Page에 등록한 채 다음 반복에서 값을 바꾸면 앞 Page도 뒤 Page의 읽기 정보를 보게 되고, 한 Page가 그 `aux`를 소비·해제한 뒤에는 다른 Page에 해제된 포인터가 남는다.

아래 값은 분할 계산을 위한 예시다. 특정 빌드의 `args-none` ELF를 측정한 결과가 아니다. 첫 구간은 파일에서 `0x1a78`바이트를 읽고, 두 번째 구간은 `0x10`바이트를 읽도록 정했다.

```run-python
PAGE_SIZE = 4096

def register_segment(va, offset, read_bytes, zero_bytes):
    assert va % PAGE_SIZE == offset % PAGE_SIZE == 0
    assert (read_bytes + zero_bytes) % PAGE_SIZE == 0
    pages = []
    while read_bytes or zero_bytes:
        take = min(read_bytes, PAGE_SIZE)
        zero = PAGE_SIZE - take
        pages.append(dict(va=va, offset=offset, read=take, zero=zero))
        read_bytes -= take
        zero_bytes -= zero
        va += PAGE_SIZE
        offset += take
    return pages

pages = register_segment(0x400000, 0, 0x1a78, 8192 - 0x1a78)
pages += register_segment(0x402000, 0x2000, 0x10, 4096 - 0x10)
for page in pages:
    print(f"VA={page['va']:#x}, offset={page['offset']:#x}, "
          f"read={page['read']}, zero={page['zero']}")
assert [p['read'] for p in pages] == [4096, 2680, 16]
assert all(p['read'] + p['zero'] == PAGE_SIZE for p in pages)
print("등록된 Segment Page:", len(pages), "개")
```

이 세 페이지의 등록만으로는 Frame을 할당하지 않는다. 그러나 프로세스 전체의 사용자 Frame 수가 0이라는 뜻은 아니다. 초기 Stack은 별도로 Claim한다. [인자 전달](/wiki/computer-systems-network-topic-1217820258bd/)과 Segment 등록의 비용을 구분해서 세어야 한다.

## 첫 접근에서 바뀌는 상태

매핑되지 않은 주소에 접근하면 CPU가 Page Fault를 발생시킨다. PintOS는 주소와 접근 권한을 검사하고 SPT에서 복구 정보를 찾는다. 유효한 접근을 처리할 수 있을 때 `vm_do_claim_page()`가 다음 순서로 진행한다.

1. Frame을 확보하고 Page와 연결한다.
2. `pml4_set_page()`로 사용자 VA와 Frame의 Mapping을 설치한다.
3. `swap_in()`을 통해 현재 Operations의 초기화 함수를 호출한다.
4. UNINIT이면 타입별 초기화 뒤 내용 초기화 Callback을 실행한다.

이 버전은 Mapping을 내용 초기화보다 먼저 설치한다. Page Table 설치 실패에는 정리 경로가 있지만, 이어지는 `swap_in()` 실패를 같은 방식으로 되돌리지는 않는다. 따라서 함수가 `false`를 반환했다는 사실만으로 Frame과 Mapping도 원상 복구됐다고 판단하면 안 된다. Claim의 상태 변화는 [가상 메모리 구현](/wiki/computer-systems-network-topic-83f24986336f/)에서 함께 확인할 수 있다.

`uninit_initialize()`는 Union이 덮어써지기 전에 필요한 두 값을 지역 변수에 보관한다. 다음은 해당 함수의 핵심 표현이다.

```c
vm_initializer *init = uninit->init;
void *aux = uninit->aux;
return uninit->page_initializer(page, uninit->type, kva) &&
    (init ? init(page, aux) : true);
```

`page_initializer()`가 먼저 ANON 또는 FILE의 Operations와 내부 필드를 설정한다. 성공했을 때만 `init()`을 호출하며, Callback이 없으면 이 두 번째 단계를 생략한다. ELF Callback `lazy_load_segment()`는 `file_read_at()`이 요청한 바이트 수만큼 읽었을 때 나머지를 0으로 채운다. 읽을 바이트가 0인 페이지도 있으므로 모든 UNINIT Fault가 실제 디스크 읽기를 요구한다는 설명은 맞지 않는다. [UNINIT 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/uninit.c), [ELF Callback](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1300-L1327)

성공한 Fault 처리는 중단된 접근을 다시 시도할 수 있게 만든다. 유효하지 않은 주소나 권한 위반까지 성공으로 바꾸는 것은 아니다. 또한 커널이 명시적으로 Claim할 수도 있으므로 UNINIT의 초기화가 항상 사용자 코드의 첫 Page Fault에서만 일어나는 것은 아니다.

## 접근하지 않은 페이지의 자원 정리

ELF 등록 단계의 `file_reopen()`은 파일 디스크립터 번호를 만드는 호출이 아니다. 같은 Inode를 가리키는 별도의 커널 파일 객체를 얻는다. 이를 통해 실행 파일을 열어 둔 다른 객체의 수명과 페이지의 지연 읽기 수명을 나눈다.

한 페이지의 `aux`와 파일 객체는 다음 경로 중 하나에서 정리된다.

| 상황 | 정리하는 코드 |
| --- | --- |
| 파일 객체를 다시 여는 데 실패 | `load_segment()`가 `aux` 해제 |
| UNINIT 등록 실패 | `load_segment()`가 파일 닫기와 `aux` 해제 |
| 내용 초기화 성공 또는 읽기 실패 | `lazy_load_segment()`가 파일 닫기와 `aux` 해제 |
| 초기화 전에 Page 제거 | `uninit_destroy()`가 파일 닫기와 `aux` 해제 |

현재 `uninit_destroy()`에는 해제가 구현돼 있다. 옛 스텁의 TODO 주석만 보고 미구현으로 판단할 수는 없다. 다만 이 함수는 `aux`를 `lazy_load_arg`로 해석한다. 다른 Callback과 다른 형태의 `aux`를 추가한다면 이 소유권 계약도 함께 바꿔야 한다. 초기화 도중 Operations가 이미 바뀐 상황까지 미접근 UNINIT의 정리 경로로 처리할 수 있는 것도 아니다.

Fork에는 자식의 `aux`를 새로 할당하고 파일 객체를 다시 여는 `spt_copy_uninit_page()` Helper가 있다. 그러나 Helper가 있다는 사실과 실제 분기에서 호출된다는 사실은 다르다. 이 버전의 `page_get_type()`은 UNINIT에 대해 예정된 최종 타입을 반환하므로 그 결과를 `VM_UNINIT`과 비교하는 복사 분기는 의도대로 동작하지 않는다. 현재 상태는 `page->operations->type`과 구분해서 봐야 한다. 실제 복사 경로와 영향은 [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/)에 연결된다. Helper의 정의와 호출부는 모두 `vm/vm.c`에 있다.

## 얼마나 아낄 수 있는가

아직 접근하지 않은 Segment Page는 데이터를 담을 4 KiB Frame을 사용하지 않는다. Page·SPT·`aux`·파일 객체·Allocator 관리 정보까지 없어지는 것은 아니다. 이 Revision의 헤더를 x86-64 대상으로 확인하면 `struct page`는 88바이트, 그 Union에 들어가는 `struct uninit_page`는 32바이트, 별도로 할당하는 `lazy_load_arg`는 40바이트다. Union의 32바이트를 Page의 88바이트에 다시 더하지 않는다. 예를 들어 1 MiB를 256개 페이지로 등록할 때 Page와 `aux`만 합쳐도 32 KiB이며, 파일 객체와 SPT·Allocator의 비용은 여기에 더해진다.

데이터 Frame의 절약량은 페이지 크기와 실제 접근한 페이지 수를 기준으로 계산해야 한다.

```run-python
PAGE_SIZE = 4096
registered = 4 * 1024 * 1024 // PAGE_SIZE
touched = 1
saved_frames = registered - touched
saved_bytes = saved_frames * PAGE_SIZE
print("등록:", registered, "페이지")
print("접근:", touched, "페이지")
print("미사용 데이터 Frame:", saved_frames, "개")
print("그 Frame에 해당하는 공간:", saved_bytes, "bytes")
assert saved_bytes == 4 * 1024 * 1024 - PAGE_SIZE
```

이 예시는 4 MiB의 페이지 범위 중 한 페이지만 접근한다고 가정한다. 메타데이터 비용, 초기 Stack, Page Table, 공유와 교체는 계산에서 제외했다. 절약률은 실제 접근한 페이지에 따라, User Pool의 크기는 메모리 맵과 설정에 따라 달라진다.

## Linux·Windows와 QEMU에서 대응되는 부분

Linux의 VMA와 Windows의 VAD는 가상 주소 영역을 나타내고, PintOS SPT는 페이지 단위의 복구 정보를 둔다. 이 차이 때문에 VMA 하나와 UNINIT Page 하나를 같은 크기의 메타데이터 객체로 비교할 수 없다. 인접한 VMA는 파일·권한·정책 등이 호환될 때 합쳐질 수도 있다. [Linux의 VMA 병합 조건](https://github.com/torvalds/linux/blob/v6.12/mm/vma.c)

Linux의 파일 매핑은 Page Cache를 이용할 수 있으며, 쓰기를 처리하는 방식은 Private Mapping과 Shared Mapping의 계약에 따라 다르다. 모든 파일 매핑의 쓰기가 COW가 되는 것은 아니다. `MAP_POPULATE`처럼 미리 페이지를 준비하는 옵션이나 명시적인 접근도 있으므로 `mmap()`이 항상 모든 물리 페이지 준비를 미루는 것은 아니다. [Linux Page Table과 Fault](https://docs.kernel.org/6.12/mm/page_tables.html), [`do_mmap()`의 Populate 조건](https://github.com/torvalds/linux/blob/v6.12/mm/mmap.c#L465-L469)

Windows의 Soft Fault는 이미 메모리에 있는 내용을 사용하거나 Demand-zero·COW 등으로 처리할 수 있고, Hard Fault는 Backing Store 읽기를 필요로 한다. Linux의 Minor·Major Fault와 비교할 때에도 디스크 접근 여부와 실제 원인을 봐야 한다. Fault 종류마다 일정한 마이크로초·밀리초 비용이 정해져 있는 것은 아니다. [Windows Working Set](https://learn.microsoft.com/en-us/windows/win32/memory/working-set), [파일 View의 접근 모드](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-mapviewoffile)

QEMU TCG는 Guest Page Table과 접근 권한을 확인한다. UNINIT의 `aux`를 읽거나 ELF를 적재할지를 판단하는 쪽은 Guest인 PintOS다. Guest의 변환 과정에서 Present가 없는 항목을 만나면 Page Fault를 전달하고, PintOS가 Mapping과 내용을 준비한 뒤 접근을 다시 시도한다. 다음 접근에서는 QEMU의 TLB를 활용하거나 기존 번역 블록을 재사용할 수 있다. [보조 페이지 테이블](/wiki/computer-systems-network-topic-aa5da5d73167/)의 주소 변환 경계와 함께 읽으면 두 역할을 구분하기 쉽다.

## GDB에서 등록과 초기화를 구분하기

다음 명령은 해당 Revision을 디버그 정보와 함께 빌드한 PintOS에 GDB를 연결한 상태를 전제로 한다. 함수 진입에서 인자를 확인하는 관찰 절차이며 실제 실행 결과를 옮긴 로그는 아니다.

```gdb
break vm_alloc_page_with_initializer
break uninit_initialize
break lazy_load_segment
break uninit_destroy
break spt_copy_uninit_page
continue
```

등록 함수에서 `type`, `upage`, `init`, `aux`를 보고, `uninit_initialize()`에서는 진입 시의 `page->operations->type`, `page->uninit.type`, `page->uninit.aux`, `page->frame`을 비교한다. Step으로 타입 초기화를 지난 뒤에는 Union을 다시 `uninit`으로 읽지 않는다. 미접근 종료는 `uninit_destroy()`, 내용 초기화 뒤의 정리는 `lazy_load_segment()`의 종료 부분을 따른다.

원시 바이트를 비교하려면 타입 초기화 전후에 같은 Page의 Union 시작 주소를 확인하고, 현재 빌드의 타입 정보로 읽을 범위를 정한 뒤 [바이트 단위 메모리 조회](/wiki/platform-delivery-operations-topic-f89d71c7eb29/#memory의-주소와-단위를-명시한다)로 덤프를 남긴다. 원시 덤프와 현재 타입의 필드 해석을 구별하고, `uninit_initialize()`의 호출 프레임에 보관한 `init`·`aux`의 포인터 값도 따로 확인한다. Callback 뒤 해제된 `aux`는 역참조하지 않는다.

GDB의 `return false`는 선택한 함수의 실행을 중단하고 반환 상태를 만들며, 남은 함수 본문을 실행하지 않는다. `lazy_load_segment()`의 `done` 경로 전에 강제 반환하면 파일 닫기와 `aux` 해제도 건너뛰므로 실제 `file_read_at()` 읽기 실패의 정리 경로를 검증한 결과가 아니다. 실패 경로를 검증할 때는 원래 분기가 정리 코드까지 실행되는지와 호출자에게 전달된 실패 결과를 따로 확인한다. [GDB의 강제 반환](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Returning.html), [현재 ELF Callback의 정리 경로](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1300-L1327)

임시 계측으로 읽기 반환값을 저장한 뒤 요청량보다 하나 작은 값으로 바꾸면 Callback의 실패 분기와 정리 코드를 확인할 수 있다. 그러나 이미 Buffer에 기록된 바이트까지 되돌리지는 않으므로 실제로 파일을 덜 읽은 상황을 재현한 결과와 구분한다. 이 방식은 읽기 요청량이 0인 Page를 제외하고 적용해야 한다.

해제 횟수를 셀 때는 할당부터 해제까지 한 객체의 수명을 기준으로 삼는다. 대상 `aux`와 파일 포인터를 해제 전에 기록하고, 그 객체에 대한 실제 `free()`·`file_close()` 호출을 확인한다. 정리 Helper 진입에서 올린 Counter만으로는 해제가 실행됐다고 볼 수 없다. 같은 주소가 다음 할당에 재사용될 수도 있으므로 서로 다른 객체의 수명을 한 번의 집계에 섞지 않는다.

등록 함수의 Breakpoint 적중 횟수는 현재 살아 있는 UNINIT Page 수와 다르다. 실패한 등록, 이미 초기화된 Page, 제거된 Page가 섞일 수 있다. 현재 개수가 필요하면 SPT에 남은 각 Page의 실제 Operations 타입을 세어야 한다. Fork Helper가 전혀 호출되지 않는 결과도 앞서 설명한 타입 판정과 함께 해석한다.
