---
layout: default
title: 프로세스 종료
nav_order: 6
permalink: /wiki/computer-systems-network-topic-93ebb5bf7e48/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-93ebb5bf7e48
projection_sha256: f1a40d86b81987fbcf11dc9bf27509801f7f2aeff8c730054ae144ac2c47c0a7
parent: 사용자 프로그램
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63dd07ba6393
search_terms:
- process_exit
- process_cleanup
- pml4_destroy
- child_status
- supplemental_page_table_kill
- anon_destroy
- destruction_req
- exit_mm
- process_wait
- wait_sema
- exit_status
- waited
- waitpid
- Zombie
- GetExitCodeProcess
- orphan_status_list
- reparent_or_reap_children
- thread_root
- orphan-reparent-wait
grand_parent: PintOS
ancestor: CS 기초
---

# 프로세스 종료
{: .no_toc }

프로세스가 종료되면 실행을 멈추는 것과 함께 주소 공간, 열린 파일, 종료 상태를 정리해야 한다. 이 자원들의 수명이 모두 같은 순간에 끝나는 것은 아니다. 다른 프로세스와 공유한 Frame은 남을 수 있고, 부모가 아직 읽지 않은 종료 상태도 보관해야 한다.

PintOS에서는 이 관계가 `process_exit()`에 모인다. 아래 구현 설명은 [lrn-pintos의 `5afaa6d`](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos)를 기준으로 한다.

## 종료 상태를 남기고 실행을 끝낸다

`process_exit_with_status(status)`는 종료 메시지를 출력하고 `self_status->exit_status`에 값을 남긴 뒤 `thread_exit()`을 호출한다. 실제 자원 회수는 그 안의 `process_exit()`이 담당한다. 실행을 마친 이유를 기록하는 일과 자원을 돌려주는 일을 나누어 읽으면 함수 이름이 비슷해도 역할을 구분할 수 있다.

VM 빌드에서는 다음 순서로 진행한다.

```text
process_exit_with_status(status)
  └─ thread_exit()
       ├─ process_exit()
       │    ├─ process_cleanup(): SPT와 주소 공간 정리
       │    ├─ close_running_file(): 실행 파일 참조 닫기
       │    ├─ close_open_files(): fd와 fd Table 정리
       │    ├─ reparent_or_reap_children(): 자식 상태의 소유권 정리
       │    ├─ finish_self_status(): 종료 상태 알림
       │    └─ 필요하면 root thread 등록 해제
       ├─ 인터럽트 차단과 전체 Thread List에서 제거
       └─ do_schedule(THREAD_DYING)
```

non-VM 빌드는 파일과 종료 상태를 먼저 정리하고, `process_exit()`의 마지막에 주소 공간을 파괴한다. VM 빌드의 순서를 다른 구성에도 그대로 적용하면 실제 호출 순서를 잘못 설명하게 된다. [process_exit 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)

`THREAD_DYING`이 된 Thread는 실행 중인 자신의 Kernel Stack을 즉시 해제할 수 없다. 현재 `schedule()`은 해당 Thread를 `destruction_req`에 넣고 다른 Thread로 전환한다. 이후 `do_schedule()`이 이 대기 목록의 Page를 반환한다. 이 회수를 반드시 Idle Thread만 수행하는 것은 아니다. `struct thread`와 Kernel Stack은 같은 4096바이트 Page에 있으므로, 그 Page를 사용한 실행이 끝난 뒤에 회수해야 한다. [Thread 전환과 회수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c)

## SPT의 Page를 먼저 정리한다

[보조 페이지 테이블](/wiki/computer-systems-network-topic-aa5da5d73167/)은 현재 RAM에 있는 Page뿐 아니라 아직 읽지 않은 Page와 Swap에 있는 Page도 기억한다. PTE가 Present인 주소만 순회하면 aux와 파일 참조, Swap Slot이 남을 수 있다.

현재 정리 경로는 `hash_destroy()` → `spt_page_destroy()` → `vm_dealloc_page()`다. 마지막 함수는 다음 세 작업을 순서대로 호출한다.

```c
destroy(page);
vm_destroy_page_frame(page);
free(page);
```

첫 줄의 `destroy(page)`는 `page->operations->destroy`로 분기한다. 타입별 함수가 관리하는 backing 자원과 공통 Frame 정리의 책임이 나뉘어 있다.

| 현재 상태 | 타입별 정리 | 공통 정리에서 하는 일 |
|---|---|---|
| `VM_UNINIT` | aux의 파일 참조를 닫고 aux를 해제한다 | 남아 있는 Frame이 있으면 연결을 정리하고 Page를 해제한다 |
| `VM_ANON`, Frame 있음 | Swap 보유 상태를 확인한다 | PTE를 끊고 Frame 참조를 감소시킨다 |
| `VM_ANON`, Swap에 있음 | `in_swap`·`swap_slot`을 확인해 `swap_table` 비트를 반환한다 | Page를 해제한다 |
| `VM_FILE`, Frame 있음 | Dirty이면 `page_read_bytes`만 쓰고 파일 참조를 닫는다 | PTE와 Frame 연결을 정리한다 |
| `VM_FILE`, Frame 없음 | 보관하던 파일 참조를 닫는다 | Page를 해제한다 |

정상적으로 아직 접근하지 않은 UNINIT Page에는 Frame이 없다. 다만 상태를 확인하는 코드에서 “Frame이 없으면 모두 UNINIT”이라고 역으로 판단하면 교체된 FILE Page를 놓친다. aux 전환과 파일 Page의 수명은 [mmap](/wiki/computer-systems-network-mmap-838e9b0f7e0a/)에서 이어진다.

`hash_destroy()`는 각 항목의 destructor를 호출한 뒤 Bucket 저장 공간을 해제한다. 이 순회 도중 `spt_remove_page()`로 같은 Hash를 다시 수정하는 방식은 사용하지 않는다. Hash 구현이 순회와 제거를 맡고 callback은 전달받은 Page의 자원을 정리한다. 또한 Hash 순서는 가상 주소 순서가 아니다. 디버깅 로그에 낮은 주소부터 나타나야 한다는 조건을 만들 필요가 없다. [SPT 정리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c), [Hash destructor 계약](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/kernel/hash.c)

### 네 Page가 잡고 있는 자원

가상 Page가 네 개라고 실제 Frame도 네 개인 것은 아니다.

| 가상 주소 | 상태 | 이 예에서 보유한 자원 |
|---|---|---|
| `0x400000` | 아직 읽지 않은 실행 파일 Page | aux와 파일 참조 |
| `0x401000` | RAM의 Anonymous Page | Frame F1 |
| `0x402000` | Swap의 Anonymous Page | Slot 3 |
| `0x403000` | 수정한 mmap Page | Frame F2와 파일 참조 |

이 상태에는 SPT Page 네 개, resident Frame 두 개, Swap Slot 한 개가 있다. 마지막 Page의 파일 offset이 `8192`, 유효한 파일 데이터가 `3000`바이트라면 write-back 대상은 `[8192, 11192)`다. Frame의 나머지 `1096`바이트는 파일에 덧붙이지 않는다.

다음 모델은 이 자원들을 정리하며 횟수를 센다. 두 번째 실행에서는 F1을 다른 프로세스도 사용한다고 가정한다. 실제 Kernel을 실행하는 대신 Page 수와 반환되는 Frame 수의 차이를 확인한다.

```run-python
def cleanup(shared_f1=False):
    pml4_alive = True
    pages = [
        {"kind": "UNINIT", "va": 0x400000, "file": "lazy-ref"},
        {"kind": "ANON", "va": 0x401000, "frame": "F1"},
        {"kind": "ANON", "va": 0x402000, "slot": 3},
        {"kind": "FILE", "va": 0x403000, "frame": "F2",
         "file": "mmap-ref", "dirty": True, "ofs": 8192, "read_bytes": 3000},
    ]
    frames = {"F1": 2 if shared_f1 else 1, "F2": 1}
    swap_slots = {3}
    ptes = {0x401000, 0x403000}
    file_bytes = bytearray(11192)
    freed_frames = closed_files = freed_aux = destroyed_pages = 0

    for page in pages:
        if page["kind"] == "UNINIT":
            freed_aux += 1
        if "slot" in page:
            swap_slots.remove(page["slot"])
        if page["kind"] == "FILE" and page["dirty"]:
            assert pml4_alive, "Dirty를 확인할 Page Table이 필요합니다."
            offset, size = page["ofs"], page["read_bytes"]
            frame_bytes = b"X" * size + b"Z" * (4096 - size)
            file_bytes[offset:offset + size] = frame_bytes[:size]
        if "file" in page:
            closed_files += 1
        if "frame" in page:
            ptes.remove(page["va"])
            name = page["frame"]
            frames[name] -= 1
            if frames[name] == 0:
                del frames[name]
                freed_frames += 1
        destroyed_pages += 1

    pages.clear()
    assert not ptes and not swap_slots
    pml4_alive = False
    assert file_bytes[8192:] == b"X" * 3000
    assert len(file_bytes) == 11192
    assert destroyed_pages == 4 and freed_aux == 1 and closed_files == 2
    return destroyed_pages, freed_frames, frames

for shared in [False, True]:
    pages, freed, remaining = cleanup(shared)
    print(f"F1 공유={shared}: Page {pages}개 정리, Frame {freed}개 반환, "
          f"남은 Frame 참조={remaining}")

slot = 3
print(f"Slot {slot}: Sector {slot * 8}~{slot * 8 + 7}")
```

F1을 단독으로 사용하면 Frame 두 개를 반환하고, 공유하면 F2만 반환한다. Slot 3은 512바이트 Sector 여덟 개, 즉 24번부터 31번까지에 대응한다. Slot을 반환하는 동작은 allocator의 비트를 비워 재사용하게 하는 것이다. 현재 `anon_destroy()`는 디스크 내용을 0으로 덮어쓰지 않는다. [Anonymous Page 정리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c)

## 사용 중인 Page Table을 마지막에 파괴한다

SPT 정리가 끝나면 `process_cleanup()`은 다음 순서를 지킨다.

```c
uint64_t *pml4 = curr->pml4;
if (pml4 != NULL) {
    curr->pml4 = NULL;
    pml4_activate(NULL);
    pml4_destroy(pml4);
}
```

첫 대입은 스케줄러가 이 Thread를 다시 선택해도 해제할 PML4를 다시 활성화하지 못하게 한다. 다음 호출은 현재 CR3를 Kernel의 `base_pml4`로 전환한다. 그 뒤에야 이전 Page Table 메모리를 반환한다. 잘못된 순서는 해제한 메모리의 재참조로 이어질 수 있지만, 반드시 그 자리에서 Triple Fault가 난다고 결과를 고정할 수는 없다.

`pml4_destroy()`가 Page Table 저장 공간만 반환한다고 설명하는 것도 정확하지 않다. 이 저장소의 `pt_destroy()`는 남아 있는 Present PTE가 가리키는 Frame도 반환한다. VM 경로에서는 앞선 공통 Frame 정리가 PTE의 Present를 끄므로 이중 반환을 피한다. non-VM 경로는 Page Table 쪽의 Frame 반환을 이용한다. 어느 계층에서 먼저 Frame을 반환했는지 확인해야 두 경로를 안전하게 구분할 수 있다. [Page Table 파괴 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

Copy-on-Write로 Frame을 공유한다면 종료한 프로세스의 PTE는 제거하되 다른 프로세스의 Frame 참조는 남겨야 한다. 현재 `vm_destroy_page_frame()`은 `ref_count > 1`에서 참조 수만 감소시키고 물리 Frame을 반환하지 않는다. 다만 이 분기에는 `frame->page`와 `owner_thread`를 살아 있는 다른 참조자로 바꾸는 처리가 없다. 이후 Eviction에서 사용하는 소유자 정보의 수명까지 올바른지는 별도 검증이 필요하다. 참조 수가 감소했다는 사실만으로 모든 공유 상태의 정리가 끝났다고 단정할 수 없다.

`process_exec()`도 기존 주소 공간을 버릴 때 `process_cleanup()`을 사용한다. 현재 VM 경로에서는 기존 주소 공간 정리, 실행 파일 참조 닫기, SPT 재초기화, 새 ELF 적재 순서다. exec는 같은 프로세스가 새 프로그램을 실행하는 경로이므로 `process_exit()`의 자식 상태 정리와 종료 알림까지 호출하는 것은 아니다.

## 열린 파일의 참조를 닫는다

`close_open_files()`는 fd 2부터 `FD_MAX - 1`까지 닫고 fd Table Page를 반환한다. 이 저장소의 `FD_MAX`는 `PGSIZE / sizeof(struct file *)`이므로 x86-64 빌드에서는 512다. fd 0과 1을 뺀 일반 파일 슬롯은 510개다. `FD_MAX=128`을 고정한 디버깅 반복문은 Table의 뒤쪽을 놓친다.

`close_running_file()`은 실행 파일에 걸어 둔 쓰기 금지를 풀고 파일 참조를 닫는다. 이 정리가 빠지면 쓰기 금지가 너무 오래 남을 수 있고, 실행 중 너무 일찍 풀면 보호가 사라질 수 있다. 두 실수의 방향이 다르다. mmap은 별도로 재열기한 참조를 소유하므로, 원래 fd가 닫혔다는 이유만으로 매핑의 파일 참조까지 없어지는 것은 아니다. [File Descriptor](/wiki/pintos-file-descriptors/)와 mmap의 소유권을 함께 읽는다.

## 부모가 종료 상태를 한 번만 수거한다

자식이 `exit(42)`로 끝나더라도 부모가 곧바로 `wait()`를 호출한다는 보장은 없다. 종료 값은 자식의 User Stack이나 이미 해제될 `struct thread`에만 보관해서는 안 된다. 이 저장소는 별도로 할당한 `struct child_status`를 부모의 `child_status_list`와 자식의 `self_status`에서 함께 참조한다.

| 필드 | 역할 |
|---|---|
| `tid` | 부모가 기다릴 자식의 식별자 |
| `exit_status` | 자식의 종료 값. 초기값은 `-1`이다 |
| `waited` | 해당 상태를 수거하는 `wait()`가 시작되었는지 표시한다 |
| `exited` | 자식이 종료 알림 단계에 도달했는지 표시한다 |
| `orphaned` | 부모가 먼저 종료해 부모의 상태 목록에서 옮겨졌는지 표시한다 |
| `fork_success`·`fork_sema` | 자식의 초기화 결과를 부모에게 전달한다 |
| `wait_sema` | 자식의 종료를 기다리는 데 사용한다 |
| `elem` | 부모 목록 또는 고아 상태 목록에 연결한다 |

`fork_sema`와 `wait_sema`는 모두 0으로 시작하지만 서로 다른 사건을 기다린다. 전자는 “자식 초기화가 끝났는가”, 후자는 “자식이 종료했는가”를 나타낸다. `process_create_initd()`와 `process_fork()`가 상태를 만들고, `process_exec()`는 이미 존재하는 프로세스의 프로그램을 교체한다. exec마다 새로운 부모·자식 상태 객체를 만든다고 설명하면 안 된다. [child_status 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/thread.h), [상태 생성과 수거](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)

### 종료 값이 이동하는 경로

`wait(child_tid)`의 System Call 진입에서는 `RAX`에 `SYS_WAIT`, `RDI`에 자식 ID가 들어 있다. `syscall_handler()`가 `process_wait()`를 호출하고 반환 값을 `f->R.rax`에 넣는다. 자식의 `SYS_EXIT`는 `RDI`를 `int status`로 받아 `exit()` → `process_exit_with_status()`로 전달한다.

```text
자식: RDI의 status
  → process_exit_with_status(status)
  → self_status->exit_status
  → thread_exit() → process_exit() → finish_self_status()

부모: process_wait(child_tid)
  → child_status_list에서 tid 검색
  → 필요하면 wait_sema에서 기다림
  → cs->exit_status 읽기 → 목록에서 제거 → free(cs)
  → syscall_handler의 f->R.rax → User wait() 반환 값
```

따라서 두 User Stack 사이에서 숫자를 직접 복사하는 구조가 아니다. 값은 공유하는 Kernel 상태 객체에 남았다가 부모의 반환 레지스터로 이동한다. System Call wrapper인 `exit()`가 직접 모든 정리를 하는 것도 아니다. [System Call 분기](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c)

`process_wait()`는 현재 부모의 목록에서 찾은 자식만 기다린다. 항목이 없거나 이미 `waited`라면 `-1`이다. 처음 기다리는 경우에는 먼저 `waited = true`로 정하고, `exited`가 아직 false일 때만 `sema_down()`을 호출한다. 상태를 읽은 뒤 항목을 제거하고 해제하므로, 같은 자식에 대한 두 번째 순차 호출은 보통 목록 검색에서 실패한다. `waited`가 남아 있어야만 중복 호출을 막을 수 있는 것은 아니다.

`exit_status = -1`은 기본값이자 오류 경로에서 쓰는 값이다. User 프로그램이 직접 `exit(-1)`을 호출할 수도 있으므로, 부모가 `-1` 하나만 보고 예외 종류까지 판별할 수는 없다. PintOS는 Linux처럼 종료 Signal 번호와 정상 종료 값을 별도로 부호화하지 않는다.

### 기다리기 전후로 실행 순서가 바뀌면

| 실행 순서 | `wait_sema`에서 일어나는 일 | 부모의 처리 |
|---|---|---|
| 부모가 먼저 `wait()`하고 자식이 아직 살아 있음 | 값 0에서 대기 목록에 들어가 Block된다. 자식의 `sema_up()`이 값을 1로 만들고 깨운다 | 다시 실행될 때 `sema_down()`이 1을 소비하고 상태를 읽는다 |
| 자식이 먼저 종료 알림을 마침 | `sema_up()`으로 값이 1이 된다 | `exited == true`이므로 `sema_down()` 자체를 생략하고 상태를 읽는다 |
| 부모가 `exited == false`를 읽은 직후 자식이 종료함 | 부모가 `sema_down()`에 들어가기 전에 값이 1이 된다 | `sema_down()`이 값을 소비하고 잠들지 않는다 |

세 번째 순서를 빼면 Semaphore가 필요한 이유를 놓치기 쉽다. “아직 끝나지 않았다”는 검사와 실제 대기 사이에 알림이 와도 증가한 값이 남으므로 알림을 잃지 않는다. `sema_down()`은 값 검사, 대기 목록 등록, Block을 인터럽트를 끈 구간에서 처리한다. 이것은 현재 단일 CPU PintOS의 구현이며, 인터럽트 차단만으로 여러 CPU 사이의 공유 객체 보호까지 해결되지는 않는다.

`sema_up()`은 대기 중인 Thread를 READY로 만들고 값을 증가시킨다. 깨어난 Thread가 즉시 실행되는지는 스케줄러의 판단이다. 현재 구현은 마지막에 `check_preemption()`도 호출한다. 부모가 Block할 때마다 QEMU가 새 Timer Interrupt를 만들어 자식에게 CPU를 넘기는 구조는 아니다. `thread_block()`에서 이어지는 PintOS 스케줄러가 실행할 Thread를 고른다. [Semaphore 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/synch.c)

다음 모델은 세 순서에서 알림 값과 부모의 대기가 어떻게 달라지는지 보여 준다. 종료 알림 뒤의 객체 수명은 별도 문제이므로, 여기서는 자식의 알림 단계가 끝난 다음 부모가 상태를 해제하도록 고정한다.

```run-python
from dataclasses import dataclass

@dataclass
class ChildStatus:
    exit_status: int = -1
    waited: bool = False
    exited: bool = False
    value: int = 0
    waiting: bool = False
    alive: bool = True


def run(order):
    cs = ChildStatus()
    child_list = {7: cs}
    need_down = False
    down_completed = False
    events = []

    def wait_begin():
        nonlocal need_down
        assert not cs.waited
        cs.waited = True
        need_down = not cs.exited
        events.append(f"wait: exited={cs.exited}")

    def sema_down():
        nonlocal down_completed
        if not need_down:
            events.append("down 생략")
        elif cs.value:
            cs.value -= 1
            down_completed = True
            events.append("down: 1 → 0, 대기 없음")
        else:
            cs.waiting = True
            events.append("down: 0, 부모 BLOCKED")

    def child_exit():
        cs.exit_status = 42
        cs.exited = True
        cs.value += 1
        events.append("exit: status=42, up: 0 → 1")
        if cs.waiting:
            events.append("부모 READY")

    if order == "부모 먼저":
        wait_begin(); sema_down(); child_exit()
    elif order == "자식 먼저":
        child_exit(); wait_begin(); sema_down()
    else:
        wait_begin(); child_exit(); sema_down()

    if cs.waiting:
        assert cs.value == 1
        cs.value -= 1
        cs.waiting = False
        down_completed = True
        events.append("부모 재개: down이 1 → 0 소비")

    assert cs.exited and (not need_down or down_completed)
    result = cs.exit_status
    del child_list[7]
    cs.alive = False
    second_wait = -1 if 7 not in child_list else None
    assert result == 42 and second_wait == -1
    print(order, " | ".join(events))
    print(f"  반환={result}, 두 번째 wait={second_wait}, 해제 직전 값={cs.value}")

for order in ["부모 먼저", "자식 먼저", "검사와 down 사이에 종료"]:
    run(order)
```

자식이 먼저 끝난 경우에는 Semaphore 값 1을 소비하지 않은 채 상태 객체를 해제한다. 그 값은 외부에 별도로 할당한 자원이 아니며, 대기자가 없는 상태 객체의 필드다. 반대로 부모가 Block했다면 부모의 `sema_down()`이 끝나기 전에 Semaphore를 포함한 객체를 해제해서는 안 된다.

### 알림과 마지막 참조는 같은 사건이 아니다

현재 코드에는 상태 전달과 별개로 검토할 수명 경계가 있다. `finish_self_status()`는 `sema_up()` 뒤에 `cs->orphaned`와 `cs->waited`를 읽는다. 깨어난 부모는 `process_wait()`에서 같은 `cs`를 해제한다. 우선순위에 따른 즉시 선점이나 이후 스케줄링으로 부모가 먼저 수거하면 자식이 해제된 객체를 다시 읽을 수 있다.

이 가능성은 다음처럼 작은 수명 모델로 확인할 수 있다. 실제 Kernel 오류를 재현하는 테스트는 아니며, 코드에서 마지막 접근의 순서를 검토하는 예제다.

```run-python
class Record:
    def __init__(self):
        self.alive = True
        self.status = 42

    def read(self, owner):
        if not self.alive:
            raise RuntimeError(f"{owner}: 해제한 child_status에 접근")
        return self.status


def simulate(parent_runs_first):
    cs = Record()
    if parent_runs_first:
        print("부모가 받은 값:", cs.read("부모"))
        cs.alive = False
        try:
            cs.read("sema_up 뒤 자식")
        except RuntimeError as error:
            print(error)
    else:
        cs.read("sema_up 뒤 자식")
        print("부모가 받은 값:", cs.read("부모"))
        cs.alive = False
        print("이 순서에는 해제 후 접근이 없음")

for parent_first in [False, True]:
    print("알림 뒤 부모 먼저 실행:", parent_first)
    simulate(parent_first)
```

실제 수정에서는 마지막 참조를 끝내는 시점과 해제 책임을 함께 정해야 한다. 알림 뒤에 더는 `cs`를 읽지 않도록 종료 경로를 구성하거나, 부모·자식의 참조를 별도로 관리하는 방식 등을 검토할 수 있다. Flag 하나의 이름을 바꾸거나 Semaphore 값만 맞추는 것으로 객체 수명이 보장되지는 않는다. [종료 알림과 부모의 free](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)

### 부모가 먼저 종료한 경우

| 상황 | 현재 코드의 처리 |
|---|---|
| 자식이 먼저 종료하고 부모가 아직 기다리지 않음 | `exited`와 종료 값을 보관한다 |
| 부모가 종료할 때 이미 끝난 미회수 자식 | 상태를 List에서 빼고 해제한다 |
| 부모가 먼저 종료하고 자식은 살아 있음 | 상태를 `orphan_status_list`로 옮기고 `orphaned`로 표시한다 |
| 부모 없는 자식이 나중에 종료함 | 자신의 상태를 List에서 빼고 해제한다 |

`orphan_status_list`는 상태 보관 목록이다. Linux의 init 프로세스가 새 부모가 되어 `wait()`하는 것과 같은 구현은 아니다. `reparent_or_reap_children()`은 현재 항목을 제거하고 해제하기 전에 다음 항목을 확보한다. `list_remove()`가 항목의 모든 필드를 지우는 것은 아니지만, 포함 객체를 `free()`한 뒤 그 항목을 따라가는 것은 유효하지 않다.

부모가 종료하면서 이미 `exited`인 상태를 수거하는 경로도 앞의 마지막 참조 문제와 함께 검토해야 한다. “부모가 wait하지 않아도 모든 경우에 누수가 없고 안전하다”는 결론은 분기만 읽은 것으로 입증되지 않는다.

목록이 바뀌어도 자식의 `self_status`가 가리키는 객체 자체는 같다. 부모는 `child_status_list`를 따라 이 객체를 찾고, 자식은 포인터로 직접 참조한다. 하나뿐인 `elem`을 부모 목록에서 제거한 뒤 고아 목록에 넣는 이유도 여기에 있다. 같은 연결 원소를 두 List에 동시에 넣을 수는 없다. `orphan_status_list_initialized`는 목록의 초기화 여부일 뿐, 객체의 소유자나 Lock은 아니다.

`thread_root()`도 고아 목록의 수거자가 아니다. `initd()`는 최초 User 프로세스를 root로 기록하지만, `process_wait()`는 호출한 Thread 자신의 `child_status_list`만 검색한다. `reparent_or_reap_children()`에는 root의 목록으로 옮기는 경로가 없다. root가 손자의 ID를 알아도 그것만으로 wait할 권한을 얻지는 않는다. root 자신이 종료할 때도 먼저 자식 상태를 정리한 뒤 root 포인터를 NULL로 바꾼다. [상태 목록과 root 처리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)

다음 모델은 세 가지 종료 순서에서 레코드를 어느 목록에서 제거하는지 보여 준다. 각 동작을 하나의 단계로 처리하므로 앞서 살펴본 알림 도중의 선점과 포인터 수명 문제까지 검증하는 모델은 아니다.

```run-python
from dataclasses import dataclass

@dataclass
class Record:
    exited: bool = False
    waited: bool = False
    orphaned: bool = False
    status: int = -1


def simulate(child_first, parent_waits):
    child_id = 9
    record = Record()
    parent_records = {child_id: record}
    root_children = {5}  # root의 직접 자식은 중간 부모 5다.
    orphan_records = {}
    released_by = []

    def release(records, actor):
        assert records.pop(child_id) is record
        assert not released_by, "같은 레코드를 두 번 해제했습니다."
        released_by.append(actor)

    if child_first:
        record.status = 81
        record.exited = True

    if parent_waits:
        assert record.exited  # 이 사례는 자식 종료 뒤의 wait만 모델링한다.
        record.waited = True
        print("부모 wait 반환:", record.status)
        release(parent_records, "부모 wait")

    # 부모 종료: 끝난 자식은 수거하고, 나머지는 고아 목록으로 옮긴다.
    for tid, current in list(parent_records.items()):
        if current.exited and not current.waited:
            release(parent_records, "부모 exit")
        else:
            current.orphaned = True
            orphan_records[tid] = parent_records.pop(tid)

    print("부모 종료 뒤 고아 목록:", list(orphan_records))
    assert child_id not in root_children
    print("root는 자식 9를 자신의 목록에서 찾을 수 없습니다.")

    if not child_first:
        record.status = 81
        record.exited = True
        if record.orphaned and not record.waited:
            release(orphan_records, "고아 자식 exit")

    assert not parent_records and not orphan_records
    assert len(released_by) == 1
    print("해제 주체:", released_by[0], "\n")


for child_first, parent_waits in [(True, False), (False, False), (True, True)]:
    simulate(child_first, parent_waits)
```

GDB에서는 목록 원소의 주소와 `child_status` 시작 주소도 구분한다. `elem`은 구조체 첫 필드가 아니므로 List에서 얻은 주소를 곧바로 `struct child_status *`로 변환하면 필드를 잘못 읽는다. 아래는 `reparent_or_reap_children(curr)`에 중단한 상태에서 첫 레코드를 읽는 예다. 목록이 비어 있으면 해석하지 않는다.

```gdb
set $head = &curr->child_status_list
set $entry = $head->head.next
set $elem_offset = (long)&((struct child_status *)0)->elem
if $entry != &$head->tail
  set $record = (struct child_status *)((char *)$entry - $elem_offset)
  p $record->tid
  p $record->exited
  p $record->waited
  p $record->orphaned
end
```

고아 목록은 `ensure_orphan_status_list()`를 지난 뒤 같은 방식으로 읽을 수 있다. 목록에서 제거하거나 레코드를 해제하는 줄을 넘긴 뒤에는 앞서 저장한 포인터를 재사용하지 않는다. `offsetof`나 `list_entry`는 C Macro이므로 디버그 정보에서 그 이름을 바로 실행할 수 있다고 가정하지 않는다.

### 실제 테스트가 확인하는 범위

| 테스트 | 현재 소스와 기대 파일의 내용 | 여기서 더 확인해야 하는 것 |
|---|---|---|
| `wait-simple` | 자식은 `child-simple`을 exec하고 `main()`에서 81을 반환한다. 부모의 기대 값은 81이다 | 부모가 반드시 먼저 Block했다는 것은 출력만으로 알 수 없다 |
| `wait-twice` | 첫 반환 81, 두 번째 반환 `-1`을 기대한다 | 첫 수거 뒤 목록에서 제거되었는지 추적할 수 있다 |
| `wait-killed` | `child-bad`의 종료와 부모의 반환 `-1`을 기대한다 | 모든 비정상 종료 원인을 분류하는 테스트는 아니다 |
| `wait-bad-pid` | 임의 ID로 wait한다. 기대 파일은 정상 종료와 `exit(-1)` 두 출력을 허용한다 | 반환 값을 출력하지 않으므로 `-1` 반환만 단독 검증한다고 말할 수 없다 |

위 표는 테스트의 `.c`와 `.ck`를 읽어 확인한 내용이며 이번 정리에서 Kernel 테스트를 실행했다는 뜻은 아니다. 앞의 42는 상태 전달 모델의 예시 값이다. 실제 `wait-simple`의 기대 값 81과 섞지 않는다. `multi-oom`처럼 이름이 비슷한 테스트를 실행했다는 가정만으로 고아 상태 목록 전체의 회수를 증명하지도 않는다. [wait 테스트](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog)

### 이름이 남아 있는 orphan 테스트

저장소에는 `orphan-parent.c`와 `orphan-reparent-wait`, `orphan-reparent-twice`, `orphan-reparent-killed`, `orphan-reparent-storm`의 C 소스가 남아 있다. 중간 부모가 `exit(child_pid)`로 손자의 ID를 root에게 전달하고, root가 그 ID로 다시 wait하는 실험이다. `storm`은 이 흐름을 열 번 반복한다.

그러나 현재 `tests/userprog/Make.tests`에는 이 프로그램들이 등록되어 있지 않고, 대응하는 `.ck` 기대 파일도 없다. 더구나 현재 `process_wait()`는 고아 목록을 검색하지 않는다. 함수의 검색 규칙대로라면 root의 `wait(orphan_pid)`는 손자를 찾지 못해 `-1`을 반환한다. `killed`라는 이름의 실험에서 `-1`이 출력되어도 그것만으로 손자의 비정상 종료 상태를 수거했다고 볼 수 없다.

따라서 이 파일들의 주석을 현재 구현의 입양 기능이나 테스트 통과 근거로 사용하지 않는다. 실행 가능한 회귀 테스트로 바꾸려면 먼저 “직접 자식만 wait한다”는 현재 규칙에 맞춰 기대 값을 정하고 빌드 목록과 기대 파일을 갖춰야 한다. 여기서는 소스와 등록 상태만 확인했다. [orphan 실험 소스](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog), [정규 테스트 목록](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog/Make.tests)

### GDB로 같은 상태 객체를 따라간다

QEMU gdbstub의 `info threads`가 PintOS의 모든 Kernel Thread를 자동으로 나열한다고 기대하면 안 된다. Guest CPU와 Guest 메모리를 보고, PintOS의 `thread_current()`·대기 목록·상태 필드를 직접 대응시켜야 한다.

디버그 심볼을 가진 Kernel에서 `process_wait()`의 자식 검색 루프나 `finish_self_status()`에 중단한 뒤 다음 값을 확인한다. `curr`·`cs`는 해당 함수의 지역 변수가 초기화된 뒤에만 유효하다.

```gdb
break process_wait
break process_exit_with_status
break finish_self_status

# 자식의 finish_self_status(curr) 진입에 중단했을 때
set $cs = curr->self_status
p $cs
p *$cs
p sizeof(struct child_status)
p sizeof(struct semaphore)
p (long)&((struct child_status *)0)->exit_status

# $cs가 유효하고 0이 아님을 확인한 다음 실행한다.
set $wait_sem = &$cs->wait_sema
break sema_down if sema == $wait_sem
break sema_up if sema == $wait_sem
watch -l $cs->exit_status
watch -l $cs->exited
```

`exit_status`는 `process_exit_with_status()`에서 기록하므로, `finish_self_status()`에 처음 중단했다면 값은 이미 기록된 뒤다. 기록 순간을 보려면 앞선 함수에서 `thread_current()->self_status`를 확보하고 Watchpoint를 건다. 알림 전후에는 `p $wait_sem->value`, `p $wait_sem->waiters`로 같은 Semaphore를 추적한다. 해제 뒤에는 해당 Watchpoint를 삭제하고 객체를 더 읽지 않는다.

할당 지점을 찾을 때는 `process_fork()`나 `process_create_initd()`에서 `malloc(sizeof *cs)` 다음의 실제 소스 줄에 중단한다. `$pc + 0x30` 같은 임의 Instruction offset이나 `malloc(80)` 조건은 구조체 할당을 특정하지 못한다. `malloc()` 진입의 `RAX`도 아직 그 호출의 반환 포인터가 아니다. 코드 줄과 반환 이후의 값을 확인해야 한다.

`struct child_status`의 크기를 80B 또는 128B로 고정하지 않는다. 이 소스의 Semaphore는 `unsigned value`와 List를 포함하고, 두 Semaphore와 Padding이 전체 배치에 영향을 준다. 같은 빌드의 `sizeof`·필드 주소 차이로 확인한다. 자식 100개의 상태 저장량도 `100 × sizeof(struct child_status)`이며 Thread Page와 할당기의 부가 공간은 따로 센다.

## 회수량은 무엇을 세느냐에 따라 달라진다

8 MiB의 Anonymous 영역과 4 MiB의 파일 매핑은 4 KiB 기준 가상 Page 3072개다. 모두 실제 RAM에 올라와 있고 공유가 없을 때만 데이터 Frame도 3072개라고 계산할 수 있다. Lazy Page, Swap, 공유 Frame이 있으면 resident 수와 반환량이 달라진다. Anonymous Page 전부가 개별 Slot으로 내려갔다고 가정한 Swap 상한은 2048개이며, 파일 매핑의 backing은 해당 파일이다.

Page Table도 따로 센다. 4단계라는 말은 한 주소를 따라가는 깊이이며 전체 Table이 네 Page뿐이라는 뜻이 아니다. 다음 계산은 4 KiB Page만 사용하는 연속 12 MiB 영역을 `0x400000`에 놓고, 사용자 영역을 위해 필요한 서로 다른 Table을 센다. Kernel과 공유하는 Table이나 실제 할당 시점은 포함하지 않는다.

```run-python
PAGE = 4096
base = 0x400000
size = (8 + 4) * 1024 * 1024
addresses = range(base, base + size, PAGE)
pdpt, pd, pt = set(), set(), set()

for va in addresses:
    l4 = (va >> 39) & 0x1ff
    l3 = (va >> 30) & 0x1ff
    l2 = (va >> 21) & 0x1ff
    pdpt.add((l4,))
    pd.add((l4, l3))
    pt.add((l4, l3, l2))

tables = 1 + len(pdpt) + len(pd) + len(pt)
print("가상 데이터 Page:", size // PAGE)
print(f"PML4=1, PDPT={len(pdpt)}, PD={len(pd)}, PT={len(pt)}")
print("Page Table:", tables, "Page =", tables * PAGE, "B")
print("fd Table:", PAGE // 8, "칸, 일반 파일:", PAGE // 8 - 2, "칸")
assert size // PAGE == 3072 and tables == 9

used_before = [True, True, False, True, False]
used_after = [False, True, False, False, False]
print("Bitmap 용량:", len(used_before), "->", len(used_after))
print("사용 중인 비트:", sum(used_before), "->", sum(used_after))
```

이 배치에는 PT 여섯 개와 PD·PDPT·PML4가 하나씩 필요해 Table만 아홉 Page다. 마지막 Bitmap 예제에서는 용량은 그대로이고 사용 중인 비트만 3개에서 1개로 줄어든다. `bit_cnt`나 `bitmap_size()`는 용량을 보여 주므로 회수 전후 사용량 측정에 그대로 빼면 안 된다. 실제 Pool 사용량은 사용 표시된 비트를 세고, 다른 Thread의 할당과 해제가 끼지 않도록 관찰 조건을 맞춰야 한다. `struct file`, `struct page`, `child_status`의 크기도 추정 상수 대신 해당 빌드의 `sizeof`로 확인한다.

## 실제 OS와 QEMU에서 달라지는 부분

Linux v6.12의 `do_exit()`에서도 주소 공간, 파일, 부모 통지를 순서대로 처리하지만, 공유 자원의 수명은 별도 참조 수에 달려 있다. `mmput()`은 `mm_users`가 0이 될 때 주소 공간 정리를 진행하고, `mm_struct` 객체 자체의 수명에는 `mm_count`도 관여한다. VMA는 이 버전의 Maple Tree에서 순회한다. [Linux 종료 경로](https://github.com/torvalds/linux/blob/v6.12/kernel/exit.c), [mmput](https://github.com/torvalds/linux/blob/v6.12/kernel/fork.c)

`exit_mmap()`은 매핑을 제거하고 Page Table을 회수하며 VMA를 정리한다. 파일 Page의 PTE를 해제하는 경로에서는 Dirty 정보를 Folio에 남길 수 있다. 이것을 “모든 Dirty 파일 Page를 동기적으로 디스크에 쓴 뒤 exit가 끝난다”는 의미로 해석하면 안 된다. 종료와 내구성 보장은 분리되며, 저장 완료의 경계는 [fsync](/wiki/file-system-fsync/)에서 다룬다. [exit_mmap](https://github.com/torvalds/linux/blob/v6.12/mm/mmap.c), [파일 PTE의 Dirty 처리](https://github.com/torvalds/linux/blob/v6.12/mm/memory.c)

Linux의 reverse mapping은 물리 Page와 이를 매핑한 주소 공간의 관계를 추적하는 데 사용된다. PTE를 제거할 때도 대응하는 역매핑 정보를 정리한다. 같은 주소 공간이 여러 CPU에서 실행됐다면 관련 CPU에 남은 오래된 TLB 변환도 처리해야 한다. 한 CPU에서 CR3를 바꾼 것만으로 다른 CPU의 변환까지 사라진다고 일반화할 수 없다. [Linux TLB 정리](https://docs.kernel.org/core-api/cachetlb.html)

Linux의 `waitpid(pid, &status, 0)`는 PintOS의 `wait(pid)`와 반환 값의 의미부터 다르다. Linux는 수거한 자식의 PID를 반환하고 종료 정보는 `status`에 쓴다. 정상 종료는 `WIFEXITED(status)`로 확인한 뒤 `WEXITSTATUS(status)`로 값을 읽으며, 이때 보존되는 정상 종료 값은 하위 8비트다. Signal 종료는 `WIFSIGNALED`·`WTERMSIG`로 구분한다. `status` 전체를 그대로 프로그램의 종료 값이라고 출력해서는 안 된다. [Linux wait API](https://man7.org/linux/man-pages/man2/waitpid.2.html)

종료 상태의 부호화를 살펴보면 정상 `exit(42)`는 `0x2a00`, Signal 9 종료는 `0x0009`, Signal 11과 core 표식이 있는 값은 `0x008b`로 표현되는 Linux 사례를 볼 수 있다. 이것을 모든 OS의 고정된 16비트 자료형이라고 일반화하지 않는다. Linux의 API 인자는 `int *`이며 정지·재개 상태도 있고, 프로그램은 비트 배치를 직접 가정하기보다 제공된 Macro를 사용한다.

Linux v6.12의 `do_wait()`는 `wait_chldexit` 대기 목록에 등록하고 `TASK_INTERRUPTIBLE` 상태에서 자식 상태를 다시 확인한다. 종료한 자식을 수거하는 `wait_task_zombie()`는 일반 수거 경로에서 `exit_state`를 원자적으로 바꿔 수거 책임을 확보한다. 중복 수거를 막는 핵심을 단순히 “PID가 재사용되기 때문”이라고 설명할 수 없다. 반면 `waitid()`의 `WNOWAIT` 옵션은 상태를 관찰하고도 이후 수거를 위해 남겨 둔다. [Linux wait 구현](https://github.com/torvalds/linux/blob/v6.12/kernel/exit.c)

Linux의 대기에는 `WNOHANG`, Signal에 의한 중단, Thread Group과 추적 중인 자식의 규칙이 있다. `waitpid(-1, ...)`는 여러 자식 중 조건에 맞는 하나를 고르는 것이며 “동시에 여러 waiter가 있다”는 의미는 아니다. PintOS의 한 부모 Thread와 한 `wait_sema` 모델을 그대로 확대하면 이런 차이를 놓친다.

미수거 종료 상태가 Zombie로 남는 것과 모든 Kernel 자원이 그대로 남는 것은 다르다. PID·종료 상태·사용량 같은 수거용 정보와 객체 참조가 핵심이며, 고정된 “몇 KB”로 비교하지 않는다. `SIGCHLD`에 `SA_NOCLDWAIT`를 지정하거나 명시적으로 `SIG_IGN`을 설정한 경우에는 Zombie를 남기지 않을 수 있다. 일반적인 종료 알림 Signal을 받았다는 사실만으로 부모의 수거가 끝났다고 판단하지 않는다.

Linux의 종료 상태는 `EXIT_ZOMBIE`처럼 별도로 관리되며, 실행을 멈춘 Thread의 `TASK_*` 상태와 같은 필드는 아니다. 부모가 먼저 종료한 자식의 새 수거자는 살아 있는 같은 Thread Group 구성원, 상위 subreaper, 해당 PID Namespace의 init 순으로 결정할 수 있다. 모든 경우를 전역 PID 1에 바로 넘긴다고 단순화하지 않는다.

Windows에서도 프로세스 종료와 Kernel Object의 소멸은 구분된다. 종료 시 해당 프로세스의 Handle은 닫히지만, 다른 프로세스가 Handle을 유지하는 Object는 남을 수 있다. 종료된 Process Object는 signaled 상태가 되어 기다리던 실행 흐름을 깨운다. [Microsoft 프로세스 종료](https://learn.microsoft.com/en-us/windows/win32/procthread/terminating-a-process)

유효한 Process Handle로 `WaitForSingleObject()`의 종료 대기를 확인한 뒤 `GetExitCodeProcess()`로 종료 값을 읽는다. 대기 완료는 `CloseHandle()`과 다르며, PintOS의 단일 수거처럼 첫 대기가 Process Object의 상태를 소비하는 것도 아니다. `CloseHandle()`은 보유한 Handle 참조를 닫는다. 아직 실행 중일 때 `GetExitCodeProcess()`가 반환하는 `STILL_ACTIVE` 값과 실제 종료 값을 혼동하지 않도록 종료 대기 결과도 확인한다. [Windows 대기 API](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject), [종료 값 조회](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getexitcodeprocess)

QEMU는 PintOS의 SPT나 종료 상태 목록을 정리하지 않는다. Guest가 수행하는 메모리·CPU·장치 동작을 재현한다. Swap Bitmap 반환은 메모리 변경이고, `palloc_free_page()`도 Guest Pool에 Page를 돌려주는 동작이다. 이것이 즉시 Host의 QEMU RAM 사용량 감소로 나타나는 것은 아니다. Debug 빌드에서는 반환 Page에 `0xcc`를 채우는 코드도 실행된다.

CR3를 바꾸는 동작과 Page Table Page를 해제하는 동작도 다르다. QEMU v10.0.0의 `cpu_x86_update_cr3()`는 Paging이 켜져 있으면 TCG TLB를 비운다. 이를 근거로 `pml4_destroy()` 자체가 암묵적으로 TLB를 정리한다고 설명하지 않는다. Dirty mmap의 파일 쓰기는 별도로 IDE와 [BlockBackend](/wiki/qemu-block-backend/)를 거친다. KVM 등 다른 가속 방식에는 TCG 함수 경로를 그대로 적용하지 않는다. [QEMU CR3 갱신](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/helper.c)

QEMU의 `gdb_create_default_process()`에 나오는 orphan CPU는 CPU Cluster에 속하지 않은 vCPU를 GDB의 기본 Process로 묶는다는 뜻이다. PintOS에서 부모를 잃은 자식 프로세스를 입양하거나 종료 상태를 수거한다는 의미가 아니다. 같은 단어라도 무엇을 관리하는 계층인지 구분해야 한다. [QEMU 기본 GDB Process](https://github.com/qemu/qemu/blob/v10.0.0/gdbstub/gdbstub.c#L2324)

## 종료 경로를 관찰할 때

Kernel용 GDB와 PintOS 실행 환경이 준비되어 있다면 다음 중단점으로 순서를 따라갈 수 있다. 아래 코드는 웹 Python 실행기에서 실행하는 코드가 아니다.

```gdb
break process_exit
break process_cleanup
break supplemental_page_table_kill
break vm_dealloc_page
break close_open_files
break finish_self_status
break pml4_destroy
```

`supplemental_page_table_kill()`에서는 전달된 `spt->hash_table.elem_cnt`로 시작 시 항목 수를 볼 수 있다. 개별 Page 정리 횟수를 세려면 `vm_dealloc_page()`나 `spt_page_destroy()`를 센다. `hash_destroy()` 호출 횟수는 Hash 하나를 정리한 횟수라 Page 수와 다르다.

`vm_dealloc_page()` 진입에서는 `page->va`, `page->operations->type`, `page->frame`을 읽는다. 초기화된 ANON Page라면 `page->anon.in_swap`, `page->anon.swap_slot`을 확인하고, FILE Page라면 `page->file.ofs`와 `page_read_bytes`를 확인한다. UNINIT 상태에 다른 Union 멤버의 필드 이름을 적용하지 않는다.

파일 쓰기는 `file_write_at()`의 실제 인자 `file_ofs`, `size`, `buffer`와 Backtrace를 함께 확인한다. 이 함수에 멈췄다는 이유만으로 mmap 종료 write-back이라고 확정할 수는 없다. 열린 파일 목록은 `close_open_files()`에 전달된 `curr`를 통해 읽고, 종료 상태는 `finish_self_status()`의 `curr->self_status`가 유효할 때 확인한다.

`pml4_destroy()` 진입에서는 `$cr3`가 Kernel의 Page Table을 가리키는지 확인할 수 있다. `process_cleanup()` 진입 직후에는 `curr->pml4`가 아직 NULL이 아니어도 정상이다. NULL 대입과 CR3 전환이 수행된 이후의 상태를 봐야 한다. Kernel 함수를 GDB에서 직접 호출하면 실행에 영향을 줄 수 있으므로, 가능한 경우 전달된 인자와 계산이 끝난 지역 변수를 읽는다.

저장소 루트에서 x86-64 Linux와 PintOS용 Compiler·QEMU가 준비되면 다음 VM 테스트를 관련 경로의 출발점으로 사용할 수 있다.

```bash
make -C pintos/vm check \
  TESTS='tests/vm/mmap-exit tests/vm/swap-anon
         tests/vm/swap-fork tests/vm/swap-iter'
```

이 테스트들은 파일 변경 유지와 메모리 압박 상황 등을 확인하지만, 모든 해제 횟수와 실패·선점 경로까지 자동으로 보장하지는 않는다. 위에서 실행한 Python 모델의 결과와 실제 Kernel 테스트 결과를 구분한다.
