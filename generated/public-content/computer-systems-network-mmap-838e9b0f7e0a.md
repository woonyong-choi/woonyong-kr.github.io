---
layout: default
title: mmap
nav_order: 8
permalink: /wiki/computer-systems-network-mmap-838e9b0f7e0a/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-mmap-838e9b0f7e0a
projection_sha256: f9122e87ebc184ea76c43ee6d0da70d9ee6f6ee0aad3eb5d9c8153fcce37556b
parent: 가상 메모리 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-83f24986336f
search_terms:
- mmap
- munmap
- VM_FILE
- UNINIT
- file_backed_swap_in
- file_backed_swap_out
- page_read_bytes
- map_start
- Dirty Page
- QEMU
- SYS_MMAP
- SYS_MUNMAP
- LSTAR
- mmap-overlap
- mmap-kernel
- 주소 정렬
- file_reopen
- mmap-twice
- mmap-shuffle
- mmap-inherit
- swap-file
- mmap-ro
- PTE_W
- PF_W
- PF_P
- vm_handle_wp
- file position
- file_read_at
- file_write_at
- 명시적 offset
grand_parent: PintOS
ancestor: CS 기초
---

# mmap
{: .no_toc }

PintOS의 `mmap()`은 파일의 일정 구간을 가상 주소에 연결한다. 매핑된 주소를 읽으면 파일에서 온 바이트가 보이고, 쓰기 가능한 매핑을 수정하면 해제나 Page 교체 과정에서 변경을 파일에 돌려준다. 프로그램이 `write()`를 호출하지 않아도 파일이 바뀔 수 있는 이유다.

이 문서는 `lrn-pintos`의 `5afaa6d` 코드에서 파일 매핑이 등록되고, 처음 접근되고, 해제되는 경로를 설명한다. 일반 OS의 공유 매핑과 private 매핑은 [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/)에서 구분한다. PintOS의 인자는 `addr, length, writable, fd, offset`이며 Linux의 `prot`, `flags`를 그대로 받는 API가 아니다.

## 매핑을 등록할 때 파일을 모두 읽지 않는다

PintOS 사용자 프로그램에서 다음 호출은 파일 offset `0`부터 `6000`바이트를 주소 `0x10000000`에 연결한다. 아래 C 조각은 PintOS의 열린 File Descriptor와 사용자 프로그램 환경을 전제로 한다.

```c
char *p = mmap((void *) 0x10000000, 6000, 1, fd, 0);
if (p != MAP_FAILED) {
    p[5000] = 'X';
    munmap(p);
}
```

이 저장소에서 `MAP_FAILED`는 `NULL`이다. Linux의 `(void *) -1`과 혼동하지 않는다. `mmap()`의 성공은 주소와 backing 정보를 등록했다는 뜻이며, 모든 파일 Page를 RAM으로 읽었다는 뜻은 아니다.

호출은 `lib/user/syscall.c`의 `syscall5()`에서 `userprog/syscall.c`의 `SYS_MMAP` 분기로 들어간다. 커널의 `mmap()`은 `fd`를 `struct file *`로 바꾼 뒤 `do_mmap()`을 부른다. 현재 코드에는 `SYS_MMAP`, `SYS_MUNMAP`, `struct file_page`와 실제 Page 연산이 구현되어 있다. [현재 syscall 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c)

## 호출 번호가 반환값으로 바뀌는 과정

현재 `include/lib/syscall-nr.h`의 번호는 `SYS_MMAP=14(0x0e)`, `SYS_MUNMAP=15(0x0f)`다. `mmap(0x10000000, 4096, 0, 3, 0)`을 호출하면 사용자 wrapper가 `RAX=14`, `RDI=0x10000000`, `RSI=0x1000`, `RDX=0`, `R10=3`, `R8=0`을 준비한다. 여섯 번째 인자까지 사용하는 wrapper의 위치는 `R9`지만 mmap은 다섯 인자를 사용한다.

`RAX`는 Handler에 들어갈 때 호출 번호이고, 돌아갈 때는 결과다. 현재 `SYS_MMAP` 분기는 `mmap()`이 반환한 주소를 `f->R.rax`에 기록한다. 성공한 예에서는 `0x10000000`, 실패하면 `0`이다. 커널 함수로 전달하기 전에 fd 숫자를 `struct file *`로 해석하는 일은 CPU가 아니라 PintOS가 한다.

x86-64의 `syscall`은 복귀할 명령 주소와 Flag를 `RCX`, `R11`에 보관하고, `LSTAR`로 설정한 Kernel 진입점으로 이동한다. 이런 사용 때문에 네 번째 syscall 인자에 `RCX` 대신 `R10`을 쓰는 규약을 확인해야 한다. PintOS의 `syscall_init()`은 `MSR_LSTAR(0xc0000082)`에 `syscall_entry`를 등록한다. [현재 wrapper](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/user/syscall.c)

이 저장소의 `syscall-entry.S`가 사용자 Stack Pointer를 보관하고 TSS의 Kernel Stack으로 바꾼 뒤 Register를 `intr_frame`으로 구성한다. Stack 전환까지 `syscall` 명령 하나가 자동으로 해 주는 것으로 읽지 않는다. Handler가 돌아오면 Assembly가 반환 Register와 사용자 상태를 복원하고 `sysretq`로 복귀한다. [현재 진입 Assembly](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall-entry.S)

QEMU v10.0.0 TCG에서도 이 두 층은 나뉜다. `target/i386/tcg/emit.c.inc`의 `gen_SYSCALL()`은 Helper 호출 코드를 만들고, `target/i386/tcg/system/seg_helper.c`의 `helper_syscall()`은 Guest의 STAR·LSTAR·FMASK를 이용해 CPU 상태를 바꾼다. MSR 값을 저장하고 읽는 코드는 같은 `system` 디렉터리의 `misc_helper.c`에 있다. QEMU가 mmap 번호 14를 보고 직접 파일을 매핑하는 것은 아니다. 그 번호를 해석하는 코드는 이후 실행되는 Guest의 `syscall_handler()`다. [QEMU SYSCALL 변환](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/emit.c.inc), [QEMU Kernel 진입 Helper](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/seg_helper.c)

## 주소 범위를 끝까지 확인한다

`mmap()`은 새 파일을 연결하기 전에 요청 전체가 허용되는지 검사한다. 현재 구현의 순서는 간단한 값 검사, 주소 범위 검사, fd 조회와 파일 길이 확인, SPT 충돌 확인이다. `do_mmap()`만 직접 호출하면 syscall 쪽 검사를 모두 거친 것이 아니므로 두 함수의 책임을 함께 읽어야 한다.

| 검사 | 현재 코드에서 거절하는 입력 | 막으려는 문제 |
|---|---|---|
| 시작 주소 | NULL 또는 Page 정렬이 아닌 주소 | Page 0 사용과 Page 경계 불일치 |
| 길이와 offset | 길이 0, 음수 offset, 정렬되지 않은 offset | 빈 매핑과 잘못된 파일 구간 |
| fd | 0·1·음수, fd Table에서 파일을 찾을 수 없는 값 | Console이나 없는 파일을 backing으로 사용 |
| 파일 | 길이가 0인 파일 | 파일 바이트가 없는 매핑 |
| 주소 범위 | 64비트 덧셈에서 되감기거나 Kernel 영역을 포함 | 검사한 범위와 실제 등록 범위 불일치 |
| SPT | 요청이 차지할 Page 중 이미 등록된 주소 | 기존 매핑·Code·Data·Stack 덮어쓰기 |

주소와 파일 offset은 `4096`바이트 경계에 맞아야 하지만, 길이는 Page 배수일 필요가 없다. `0x10001234`의 Page 내부 offset은 `0x234`이고, 파일 offset `0x1234`도 같은 나머지를 가지므로 거절한다. 반면 `offset=0x1000`은 정렬된 정상 사례다.

현재 코드는 `offset >= file_length`만을 이유로 호출을 거절하지 않는다. `do_mmap()`은 이때 남은 파일 바이트를 0으로 계산한다. 이를 “파일 끝 이상의 offset은 반드시 거절한다”는 별도 정책으로 바꾸어 설명하지 않는다. 입력의 반환값과 실제 Page 내용·해제 동작은 해당 구현과 과제 요구를 함께 확인해야 한다.

### 끝 주소가 작아 보이는 경우

이 PintOS의 `KERN_BASE`는 `0x8004000000`이다. 요청 구간을 `[start, start + length)`로 쓰면 오른쪽 끝은 포함하지 않는다. 현재 Kernel 코드는 마지막으로 포함되는 바이트 `last = start + length - 1`을 검사한다. 길이 0을 먼저 거절해야 이 계산에서 1을 빼도 의미가 있다.

다음 코드는 syscall에서 해석한 64비트 unsigned 주소와 길이를 모델링한다. SPT 충돌과 자원 할당은 뒤에서 따로 확인하므로 “등록 후보”는 실제 mmap 성공이라는 뜻이 아니다.

```run-python
PAGE = 4096
KERNEL = 0x8004000000
MASK = (1 << 64) - 1
files = {3: 6000, 4: 0}  # fd -> 파일 길이

def inspect(addr, length, offset=0, fd=3):
    assert 0 <= addr <= MASK and 0 <= length <= MASK
    if addr == 0 or length == 0 or addr % PAGE:
        return "주소 또는 길이 오류"
    if offset < 0 or offset % PAGE or fd < 2:
        return "offset 또는 fd 오류"
    last = (addr + length - 1) & MASK
    if last < addr or addr >= KERNEL or last >= KERNEL:
        return "주소 범위 오류"
    if fd not in files or files[fd] == 0:
        return "파일 없음 또는 빈 파일"
    return "등록 후보"

cases = [
    ("정상", 0x10000000, 4096, 0, 3),
    ("주소 정렬", 0x10001234, 4096, 0, 3),
    ("offset 정렬", 0x10000000, 4096, 0x1234, 3),
    ("중간 offset", 0x10000000, 4096, 0x1000, 3),
    ("Console", 0x10000000, 4096, 0, 1),
    ("없는 fd", 0x10000000, 4096, 0, 0x5678),
    ("빈 파일", 0x10000000, 4096, 0, 4),
    ("길이 0", 0x10000000, 0, 0, 3),
    ("Kernel 바로 앞", KERNEL - PAGE, PAGE, 0, 3),
    ("Kernel 침범", KERNEL - PAGE, PAGE + 1, 0, 3),
    ("64비트 되감기", MASK + 1 - PAGE, 2 * PAGE, 0, 3),
]
for label, addr, length, offset, fd in cases:
    print(f"{label}: {inspect(addr, length, offset, fd)}")

start = KERNEL - PAGE
length = (-KERNEL + PAGE) & MASK
exclusive_end = (start + length) & MASK
last = (start + length - 1) & MASK
print(f"mmap-kernel의 긴 범위: 끝(exclusive)={exclusive_end:#x}, 마지막 바이트={last:#x}")
assert exclusive_end == 0 and last == MASK
assert inspect(start, length) == "주소 범위 오류"
assert inspect(KERNEL - PAGE, PAGE) == "등록 후보"
assert inspect(KERNEL - PAGE, PAGE + 1) == "주소 범위 오류"
```

마지막 긴 범위는 `start + length`가 64비트에서 0이 된다. 하지만 현재 코드처럼 1을 뺀 마지막 바이트를 계산하면 `0xffffffffffffffff`이므로 `last < start`는 거짓이다. 이 경우에는 Kernel 영역 검사로 거절한다. 끝 주소를 포함하는 표현과 포함하지 않는 표현을 섞으면 어느 조건이 실패를 잡는지 잘못 설명하게 된다. [mmap-kernel 테스트](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-kernel.c)

### 아직 읽지 않은 주소도 이미 사용 중이다

`length=6000`이면 요청한 바이트 구간은 `[0x10000000, 0x10001770)`이고, 점유하는 Page 구간은 `[0x10000000, 0x10002000)`이다. 두 구간의 오른쪽 끝은 서로 다르다. 첫 주소가 비었다고 끝낼 수 없으며 `0x10000000`, `0x10001000` 모두 검사해야 한다.

현재 `do_mmap()`은 `spt_find_page()`로 모든 후보 Page를 확인한 뒤 등록을 시작한다. 별도의 `pml4_get_page()` 검사는 이 함수에 없다. 이 방식은 VM의 유효한 사용자 Page가 SPT에 등록되어 있다는 구조를 전제로 한다. Present PTE만 검사하는 방식으로 바꾸면 아직 한 번도 읽지 않은 매핑을 놓친다. `mmap-overlap`은 첫 매핑을 읽기 전에 같은 주소로 다시 요청해 이 차이를 드러낸다.

다음 모델은 기존 Page와의 겹침을 확인하고, 등록 도중 할당 실패가 발생하면 이번 호출에서 만든 항목만 되돌린다.

```run-python
PAGE = 4096
existing = {0x10000000: "기존 매핑", 0x10001000: "기존 매핑"}

def pages_for(base, length):
    if base % PAGE or length <= 0:
        raise ValueError("정렬된 시작 주소와 양의 길이가 필요합니다.")
    return [base + i * PAGE for i in range(1 + (length - 1) // PAGE)]

for label, base, length in [
    ("오른쪽에 인접", 0x10002000, 4096),
    ("뒤 Page와 겹침", 0x10001000, 4096),
    ("왼쪽에서 걸침", 0x0ffff000, 8192),
]:
    requested = pages_for(base, length)
    collision = [va for va in requested if va in existing]
    print(label, "충돌:", [hex(va) for va in collision])

def register(base, length, fail_after=None):
    requested = pages_for(base, length)
    if any(va in existing for va in requested):
        return False
    created = []
    try:
        for va in requested:
            if fail_after is not None and len(created) == fail_after:
                raise MemoryError("할당 실패 모델")
            existing[va] = "새 매핑"
            created.append(va)
        return True
    except MemoryError:
        for va in created:
            del existing[va]
        return False

before = dict(existing)
assert not register(0x20000000, 6000, fail_after=1)
assert existing == before
print("두 번째 Page 할당 실패 후:", {hex(va): owner for va, owner in existing.items()})
assert register(0x10002000, 4096)
print("인접 영역 등록:", [hex(va) for va in sorted(existing)])
```

실제 `do_mmap()`에서는 aux 할당·파일 재열기·SPT 등록 중 실패하면 `do_munmap(start_addr)`로 앞서 등록한 Page를 되돌린다. 입력을 검사하는 단계에서 기존 영역을 건드리지 않는 것과, 등록 중 실패했을 때 새 자원을 회수하는 것은 각각 필요한 조건이다.

`mmap-over-code`, `mmap-over-data`, `mmap-over-stk`는 각각 `test_main()`의 Code Page, 정적 변수의 Data/BSS Page, 지역 변수의 Stack Page 위에 파일을 매핑하려 한다. 모두 이미 다른 용도로 등록된 사용자 주소다. 파일을 읽을 수 있다는 사실만으로 그 주소를 다시 사용할 수는 없다.

## 파일 위치를 기억하는 두 단계

등록 직후 Page의 현재 연산은 `VM_UNINIT`이고, 나중에 사용할 타입은 `VM_FILE`이다. `do_mmap()`은 각 Page에 `lazy_load_arg`를 만들고 `vm_alloc_page_with_initializer(VM_FILE, ..., lazy_load_file, aux)`로 등록한다.

| 정보 | 현재 코드의 필드 | 필요한 이유 |
|---|---|---|
| 연결된 파일 | `file` | Page를 다시 읽고 수정된 내용을 저장한다 |
| 파일 내 시작 위치 | `ofs` | 각 Page가 파일의 어느 구간인지 찾는다 |
| 파일에서 읽을 길이 | `page_read_bytes` | 마지막 Page에서 파일 끝을 넘지 않는다 |
| 0으로 채울 길이 | `page_zero_bytes` | 파일이 없는 Frame의 뒷부분을 초기화한다 |
| 매핑 시작 주소 | `map_start` | `munmap()`이 같은 매핑에 속한 Page만 제거한다 |

가상 주소와 쓰기 권한은 `struct page`의 `va`, `writable`에 있다. `struct file_page`에 `writable`이라는 필드가 따로 있는 것은 아니다.

현재 구현은 Page마다 `file_reopen()`으로 독립된 파일 참조를 보관한다. 원래 fd가 닫혀도 매핑이 파일에 접근할 수 있는 이유다. 여기서 참조를 다시 연다는 것은 파일 내용 전체를 복제한다는 뜻이 아니다. `struct file`과 inode의 관계는 [File Descriptor](/wiki/pintos-file-descriptors/)와 [inode](/wiki/computer-systems-network-topic-c76b83867c50/)에서 이어진다.

설계를 바꾸어 여러 Page가 하나의 매핑 객체와 파일 참조를 공유하게 할 수도 있다. 이 경우에는 마지막 참조가 사라질 때 파일을 닫도록 소유권을 관리해야 한다. 현재 방식은 각 Page의 정리가 단순한 대신 열린 파일 객체가 Page 수만큼 늘어난다. 어느 방식을 쓰든 fd Table의 포인터만 빌려 둔 채 매핑 수명을 보장할 수는 없다.

매핑 객체를 공유하는 설계에서는 Page 정리가 참조할 객체를 먼저 해제하지 않는다. Page마다 파일을 닫는 현재 방식과 매핑 객체가 한 번 닫는 방식을 섞으면 같은 참조를 중복으로 닫을 수 있다.

처음 접근하면 Page Fault 처리에서 SPT Entry를 찾고 `vm_do_claim_page()`로 Frame을 확보한다. 이 코드의 실제 순서는 Frame 연결, `pml4_set_page()`, `swap_in()`이다. 그 뒤 `uninit_initialize()`가 `file_backed_initializer()`를 호출하여 aux의 필드를 `page->file`로 옮기고, `lazy_load_file()`이 파일 바이트를 읽는다.

`file_backed_swap_in()`은 `file_read_at(file, kva, page_read_bytes, ofs)`로 읽고, 나머지를 `memset()`으로 0으로 채운다. `file_read_at()`은 파일의 현재 position을 이동하지 않으므로 매핑의 Page Fault가 다른 `read()`의 위치를 바꾸지 않는다. 이미 `VM_FILE`로 초기화된 Page가 다시 적재될 때는 aux 전환 없이 이 연산을 사용한다. [현재 file.c](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c), [현재 vm.c](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)

`page->uninit`, `page->anon`, `page->file`은 같은 Union 공간을 쓴다. 아직 UNINIT 연산이 필요한데 `page->file`에 먼저 값을 써 넣으면 callback이나 aux 포인터를 덮을 수 있다. 현재 `uninit_initialize()`는 callback과 aux를 지역 변수에 먼저 보관하고, 타입을 전환한 뒤 그 callback을 호출한다.

`file_backed_initializer()`는 aux를 별도 인자로 받지 않고 `page->uninit.aux`에서 지역 포인터로 꺼낸다. 이어서 `page->operations`를 바꾸고 파일 정보를 `page->file`로 옮긴다. Metadata를 옮기는 곳은 이 initializer이고, `lazy_load_file()`은 읽기를 시도한 뒤 aux 메모리를 해제한다.

실행 파일의 `load_segment()`도 파일·offset·read/zero 길이를 aux에 담지만, 현재 VM 코드에서는 목표 타입을 `VM_ANON`으로 등록한다. mmap의 `VM_FILE`처럼 나중에 원본 실행 파일로 쓰기를 돌려주는 Page가 아니다. 같은 초기 파일 읽기를 사용한다고 이후 backing과 정리 정책까지 같은 것은 아니다. [실행 파일 적재](/wiki/computer-systems-network-topic-a6a32eb78db0/)에서 이 차이를 다룬다.

## 파일을 다시 열어도 offset은 기억해야 한다

`file_reopen()`은 원래 fd와 파일 참조의 수명을 분리하지만, 순차 읽기에 의존하는 구현까지 고쳐 주지는 않는다. 새 `struct file`의 `pos`는 0에서 시작한다. 파일 offset `0x1000`에 대응하는 Page를 적재하면서 `file_read()`를 호출하면 두 번째 Page 대신 첫 번째 Page를 읽는다.

이 잘못된 읽기가 `pos`를 `0x1000`으로 옮기면, 뒤의 `file_write()`는 우연히 두 번째 Page에 쓸 수 있다. 쓰기 위치가 맞았다는 사실로 처음 읽은 내용까지 맞았다고 판단할 수 없는 이유다. 재적재하거나 Page 접근 순서를 바꾸면 순차 위치도 달라진다. 현재 `mmap-off` 테스트는 매핑에서 읽은 내용과 해제 후 파일 내용을 각각 검사한다. [열린 파일의 위치 처리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/file.c), [mmap-off](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-off.c)

다음 예제는 두 Page에 각각 `A`, `B`를 채워 순차 위치와 명시적 offset을 비교한다. `BytesIO`의 현재 위치를 `file->pos`에 대응시킨 Python 모델이며, 아래의 `read_at()`과 `write_at()`은 범위가 유효한 고정 길이 버퍼만 다룬다.

```run-python
from io import BytesIO

PAGE = 4096
OFFSET = PAGE
original = b"A" * PAGE + b"B" * PAGE

# 잘못된 구현: 새 파일 객체의 현재 위치 0에서 읽는다.
cursor = BytesIO(original)
wrong_frame = cursor.read(PAGE)
print(f"순차 읽기: {wrong_frame[:1].decode()}, 읽은 뒤 위치: {cursor.tell():#x}")
cursor.write(b"X" * PAGE)
print("두 번째 Page에 쓰기:", cursor.getvalue()[OFFSET:] == b"X" * PAGE)
print("같은 객체에서 다시 순차 읽기:", len(cursor.read(PAGE)), "B")
assert wrong_frame != original[OFFSET:OFFSET + PAGE]
assert cursor.getvalue()[:PAGE] == original[:PAGE]

# offset API 모델: 명시한 바이트 범위만 읽고 쓰며 현재 위치를 바꾸지 않는다.
def read_at(file, size, offset):
    with file.getbuffer() as data:
        return bytes(data[offset:offset + size])


def write_at(file, data, offset):
    with file.getbuffer() as target:
        target[offset:offset + len(data)] = data


fixed = BytesIO(original)
frame = read_at(fixed, PAGE, OFFSET)
print(f"offset 읽기: {frame[:1].decode()}, 현재 위치: {fixed.tell():#x}")
write_at(fixed, b"X" * PAGE, OFFSET)
for offset in (OFFSET, 0, OFFSET):
    loaded = read_at(fixed, PAGE, offset)
    print(f"재적재 offset={offset:#x}: {loaded[:1].decode()}, 현재 위치={fixed.tell():#x}")
    assert loaded == (b"A" if offset == 0 else b"X") * PAGE
assert frame == b"B" * PAGE and fixed.tell() == 0
```

첫 읽기의 결과는 `A`지만 매핑이 읽어야 할 값은 `B`다. 순차 API로 두 번째 Page에 `X`를 기록한 뒤 다시 읽으면 현재 위치가 파일 끝이어서 0바이트를 얻는다. 반면 명시적 offset을 쓰면 `0x1000 → 0 → 0x1000` 순서로 다시 읽어도 각 Page의 바이트를 가져오며 현재 위치는 0을 유지한다.

Kernel에서 같은 경계를 확인하려면 `file_read_at()` 또는 `file_write_at()`의 인자가 유효한 중단점에서 `file_ofs`와 `file->pos`를 함께 읽는다. 호출 전후에도 같은 파일 객체의 `pos`가 유지되는지 비교한다. 앞의 Python 실행은 이 관찰 기준을 설명하며 실제 PintOS의 I/O·Page Fault를 실행한 결과는 아니다.

## 6000바이트 파일의 마지막 Page

Page가 `4096`바이트이고 매핑 길이와 파일 길이가 모두 `6000`바이트라면 다음 두 구간이 생긴다.

| 가상 Page 시작 주소 | 파일 offset | 파일에서 읽는 바이트 | 0으로 채우는 바이트 |
|---|---:|---:|---:|
| `0x10000000` | 0 | 4096 | 0 |
| `0x10001000` | 4096 | 1904 | 2192 |

`p[5000]`의 주소는 `0x10001388`이다. 두 번째 Page 안에서는 `904 = 0x388`번째 위치이고, 파일 위치는 `4096 + 904 = 5000`이다. 다음 코드는 주소 계산과 파일 읽기·zero fill을 함께 실행한다. 실제 Page Fault 대신 두 번째 Frame을 `bytearray`로 만든다.

```run-python
page_size = 4096
base = 0x10000000
file_bytes = bytes(i % 256 for i in range(6000))
index = 5000

page_number, within_page = divmod(index, page_size)
page_base = base + page_number * page_size
file_offset = page_number * page_size
read_bytes = min(page_size, len(file_bytes) - file_offset)
zero_bytes = page_size - read_bytes
frame = bytearray(file_bytes[file_offset:file_offset + read_bytes])
frame.extend(bytes(zero_bytes))

print(f"접근 주소: {base + index:#x}, Page 시작: {page_base:#x}")
print(f"Page 내부: {within_page}, 파일 위치: {file_offset + within_page}")
print(f"파일 {read_bytes}B + zero fill {zero_bytes}B")
print(f"읽은 값: {frame[within_page]:#x}")
assert frame[within_page] == file_bytes[index] == 0x88
assert len(frame) == page_size
assert frame[read_bytes:] == bytes(zero_bytes)

# 매핑이 파일 중간에서 시작하면 파일 위치에 시작 offset을 더한다.
mapping_offset = 0x1000
second_page_file_offset = mapping_offset + page_number * page_size
access_file_offset = second_page_file_offset + within_page
print(f"매핑 시작 offset {mapping_offset:#x}: Page의 파일 offset {second_page_file_offset:#x}")
print(f"같은 p[5000]의 파일 위치: {access_file_offset:#x}")
assert access_file_offset == 0x2388
```

매핑을 수정한 뒤 파일로 되돌릴 때도 `page_read_bytes`만 쓴다. 위의 두 번째 Page에서는 `1904`바이트만 파일에 대응하며, 뒤의 `2192`바이트는 파일을 늘리는 내용이 아니다. 매핑 길이가 파일 길이보다 짧다면 그 길이도 함께 제한한다. 현재 `do_mmap()`은 남은 매핑 길이, Page 크기, 남은 파일 바이트 중 읽을 수 있는 양을 선택한다.

예제 끝에서 매핑 시작 offset을 `0x1000`으로 바꾸면 두 번째 Page의 파일 offset은 `0x2000`, `p[5000]`의 파일 위치는 `0x2388`이다. 이 경우에도 `4096 + 1904`바이트를 모두 파일에서 읽으려면 파일이 최소 `0x1000 + 6000 = 10096`바이트여야 한다. 파일 길이가 여전히 `6000`바이트라면 매핑 시작점 뒤에 남은 실제 파일 데이터는 `1904`바이트뿐이다. 매핑 길이와 파일 길이를 같은 값으로 놓고 시작 offset을 빠뜨리면 마지막 Page 계산이 틀어진다.

## 읽을 수 있는 매핑에 쓰면 어떻게 될까

`mmap-ro`는 `mmap(0x10000000, 4096, 0, fd, 0)`으로 파일을 매핑한 뒤, 먼저 읽지 않고 `*((int *)map) = 0`을 실행한다. 세 번째 인자 `writable=0`은 사용자 쓰기를 허용하지 않는다는 뜻이다. 이 권한은 `do_mmap()`에서 `vm_alloc_page_with_initializer()`로 전달되고 공통 `struct page`의 `writable`에 저장된다. `struct file_page`의 별도 필드를 찾는 것이 아니다.

아직 Frame과 PTE가 없는 첫 접근에서는 SPT의 권한이 판단 근거다. 이미 Page를 적재했다면 PTE의 쓰기 권한도 그 의미를 반영해야 한다. 그래서 “PTE가 없으니 일단 Page를 만들면 된다”는 처리만으로는 읽기 전용 매핑을 보호할 수 없다.

| 값 | 담고 있는 의미 |
|---|---|
| `page->writable` | OS가 이 Page에 쓰기를 허용했는가 |
| PTE의 `PTE_W` | 현재 하드웨어 주소 변환이 쓰기를 허용하는가 |
| Fault의 `PF_W` | 실패한 접근이 쓰기였는가 |
| Fault의 `PF_P` | 일반적인 데이터 접근에서 Page 부재인가, 권한 위반인가 |

`PTE_W`와 `PF_W`는 둘 다 `0x2`지만 서로 다른 값의 비트다. 하나는 접근을 허용하는 설정이고, 다른 하나는 이미 발생한 접근을 설명한다. `page_fault()`는 CR2에서 접근한 주소를 읽고 `f->error_code`를 `not_present`, `write`, `user`로 나눈다. 이 주소는 Fault를 일으킨 명령의 주소 `f->rip`와도 구분한다.

현재 `vm_claim_spt_page()`는 쓰기 요청인데 `page->writable=false`이면 claim하지 않고 실패한다. 이후 Stack 확장을 검사하는 경로가 있지만, `mmap-ro`의 `0x10000000`은 해당 후보 범위 밖이다. 이미 적재한 읽기 전용 Page에 쓰면 쓰기 보호 처리로 들어가고, `vm_handle_wp()`가 같은 `writable=false` 조건으로 거절한다. 처리할 수 없는 사용자 Fault는 `page_fault()`의 종료 경로로 이어진다. [현재 Fault 처리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c), [예외 Handler](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/exception.c)

다음 모델은 SPT에 등록된 Page에 대한 정상적인 사용자 데이터 접근에서 낮은 세 Fault 비트만 비교한다. 실제 CPU 예외를 발생시키는 코드는 아니며, Reserved Bit·실행 권한 등 다른 Fault 원인은 포함하지 않는다.

```run-python
PF_P, PF_W, PF_U = 0x1, 0x2, 0x4
PTE_P, PTE_W, PTE_U = 0x1, 0x2, 0x4

def inspect(code, logical_writable):
    not_present = not bool(code & PF_P)
    write = bool(code & PF_W)
    user = bool(code & PF_U)
    if write and not logical_writable:
        decision = "쓰기 거절"
    elif not_present:
        decision = "Page 적재 후보"
    else:
        decision = "권한 복구 가능 여부 확인"
    return not_present, write, user, decision

for label, code, writable in [
    ("아직 적재하지 않은 읽기 전용 Page에 쓰기", 0x6, False),
    ("읽기 전용 Page를 처음 읽기", 0x4, False),
    ("적재된 읽기 전용 Page에 쓰기", 0x7, False),
    ("논리적으로 쓰기 가능한 Page의 쓰기 보호", 0x7, True),
]:
    absent, write, user, decision = inspect(code, writable)
    print(f"{label}: code={code:#x}, not_present={absent}, "
          f"write={write}, user={user} -> {decision}")

frame_base = 0x12340000
readonly_pte = frame_base | PTE_P | PTE_U
print(f"읽기 전용 PTE: {readonly_pte:#x}, PTE_W={bool(readonly_pte & PTE_W)}")
assert readonly_pte == 0x12340005
assert inspect(0x6, False)[3] == inspect(0x7, False)[3] == "쓰기 거절"
assert inspect(0x4, False)[3] == "Page 적재 후보"
```

첫 접근부터 쓰면 이 모델의 Fault 값은 `0x6`, 먼저 읽어서 적재한 뒤 쓰면 `0x7`이다. 원인은 다르지만 읽기 전용이라는 OS의 결정은 유지된다. 반면 Copy-on-Write에서는 논리적으로 쓰기가 허용된 Page의 PTE를 일부러 읽기 전용으로 둘 수 있다. 따라서 `PTE_W=0`이나 `PF_P=1`만으로 모든 쓰기 Fault를 곧바로 종료 처리하는 것도 맞지 않는다. 현재 `vm_handle_wp()` 역시 논리적 쓰기 권한과 Frame을 확인한 뒤 COW 처리로 이어진다.

QEMU TCG는 Page Table 계층의 권한을 조합해 사용자 쓰기가 허용되는지 판단하고 Fault 비트를 만든다. 그 주소가 `mmap()`으로 등록됐는지, SPT에 어떤 권한이 남아 있는지는 PintOS가 판단한다. 이 역할 구분은 [페이지 폴트](/wiki/computer-systems-network-topic-5cebdbc10ddf/)를 읽을 때도 유지한다. [QEMU v10.0.0 권한 검사](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c)


## Dirty Page를 구분해야 하는 이유

읽기만 한 Frame과 수정한 Frame을 같은 방식으로 파일에 쓰면 안 된다. 매핑을 읽은 뒤 일반 `write()`가 원본 파일을 바꿨는데, `munmap()`이 예전 Frame을 무조건 기록하면 새 파일 내용이 사라진다. `mmap-clean`은 바로 이 경우를 검사한다. [mmap-clean 테스트 소스](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-clean.c)

x86 PTE의 `PTE_D = 0x40`은 그 변환을 통한 쓰기가 있었음을 나타낸다. 예를 들어 `0x12345067`의 하위 Flag에는 Present `0x01`, Writable `0x02`, User `0x04`, Accessed `0x20`, Dirty `0x40`이 들어 있다. Dirty는 변경된 바이트 수나 원본과의 비교 결과가 아니다. 같은 값을 다시 써도 쓰기는 일어난다.

현재 `file_backed_swap_out()`은 Frame의 소유 Thread를 찾아 그 `pml4`에서 `page->va`의 Dirty Bit를 읽는다. 다른 프로세스의 Frame을 내보내는데 무조건 `thread_current()->pml4`를 검사하면 다른 Page Table을 볼 수 있다. 하나의 Frame에 여러 가상 주소가 연결되는 경우에도 어느 PTE를 통해 썼는지 구분해야 한다.

Dirty이고 파일에 대응하는 바이트가 있으면 `filesys_lock`을 잡고 `file_write_at()`을 호출한다. 요청한 길이를 모두 쓴 경우에만 Dirty Bit를 내린다. Short Write이면 `false`를 반환하여 성공으로 처리하지 않는다. 현재 구현은 여기서 `page->writable`을 다시 검사하는 대신, 매핑 권한과 Page Fault 처리에서 허용된 쓰기가 PTE에 기록되도록 한다. 읽기 전용 매핑에 쓰려는 접근은 정상적인 Dirty Page 생성 경로가 되어서는 안 된다.

다음 모델에서는 clean Frame을 저장하지 않아 파일의 새 내용이 유지되는 경우와, dirty Frame에서 마지막 Page의 유효 바이트만 저장하는 경우를 비교한다.

```run-python
page_size = 4096

def write_back(file_bytes, frame, offset, read_bytes, dirty):
    if not dirty or read_bytes == 0:
        return 0
    file_bytes[offset:offset + read_bytes] = frame[:read_bytes]
    return read_bytes

file_bytes = bytearray(b"old!")
clean_frame = bytearray(file_bytes) + bytearray(page_size - len(file_bytes))
file_bytes[:] = b"new!"  # 일반 write()에 대응하는 파일 변경
written = write_back(file_bytes, clean_frame, 0, 4, dirty=False)
print("clean Page:", written, "B 저장, 파일:", bytes(file_bytes))
assert file_bytes == b"new!"

file_bytes = bytearray(b"a" * 6000)
offset = 4096
read_bytes = 6000 - offset
frame = bytearray(file_bytes[offset:]) + bytearray(page_size - read_bytes)
frame[904] = ord("X")
frame[3000] = ord("Z")  # 파일 끝 뒤의 padding 수정
written = write_back(file_bytes, frame, offset, read_bytes, dirty=True)
print("dirty Page:", written, "B 저장, 파일 길이:", len(file_bytes))
print("파일 offset 5000:", chr(file_bytes[5000]))
assert written == 1904 and len(file_bytes) == 6000
assert file_bytes[5000] == ord("X") and ord("Z") not in file_bytes
```

이 모델의 `dirty` 인자는 PTE를 읽는 대신 직접 준 값이다. 실행 결과는 파일 경계와 덮어쓰기 정책을 보여 주며, Kernel의 Dirty 추적이나 저장 장치 내구성을 검증하지는 않는다.

## 해제와 Page 교체의 공통점, 다른 점

`do_munmap(addr)`은 SPT에서 Page를 하나씩 찾으며 `map_start == addr`인 동안만 제거한다. 연속된 주소에 다른 파일 매핑이 있어도 시작 주소가 다르면 순회가 멈춘다. 아직 접근하지 않은 `UNINIT(FILE)`은 aux의 `map_start`를 보고, 초기화된 `VM_FILE`은 `page->file.map_start`를 본다.

예를 들어 `0x10000000`부터 `0x3000`바이트를 매핑하면 Page 시작 주소는 `0x10000000`, `0x10001000`, `0x10002000`이다. 그 뒤 `0x10003000`에 다른 매핑을 만들었더라도 첫 매핑의 `munmap()`은 세 Page까지만 제거해야 한다. 현재 구현에서 첫 매핑의 중간 주소 `0x10001000`을 넘기면 `map_start`가 인자와 일치하지 않아 제거하지 않고 끝난다. Linux의 `munmap(addr, length)`처럼 일부 구간을 해제하는 API가 아니다.

별도의 `mmap_region`에 시작 주소·Page 수·파일 참조를 모아 두는 설계도 가능하다. 그 방식에서는 Region의 수명과 공유 파일 참조를 함께 관리해야 한다. 현재 저장소는 각 Page에 `map_start`를 보관하고 파일 참조도 Page별로 재열기한다. 별도 Region List가 구현되어 있다고 설명하거나, 같은 파일 참조 하나를 모든 Page에서 각각 닫는 형태로 두 설계를 섞어서는 안 된다.

현재 연산 타입과 최종 Page 타입은 구분해야 한다. `page_get_type()`은 UNINIT의 경우 나중에 사용할 `page->uninit.type`을 반환한다. 따라서 `page_get_type(page) == VM_FILE`만으로는 `page->file`을 읽어도 되는지 알 수 없다. 실제 `destroy(page)`의 분기는 현재 `page->operations`가 정한다.

| 상태 | 현재 연산 타입 | Frame | 파일 정보와 정리 경로 |
|---|---|---|---|
| 접근하기 전 | `VM_UNINIT` | 없음 | aux를 읽고 `uninit_destroy()`로 정리한다 |
| 적재된 파일 Page | `VM_FILE` | 있음 | `page->file`을 읽고 Dirty이면 저장한다 |
| 교체되어 나간 파일 Page | `VM_FILE` | 없음 | 재적재를 위해 보관한 `page->file`의 참조를 정리한다 |

Frame이 없다는 조건만으로 UNINIT이라고 판단하면 세 번째 상태를 놓친다. 반대로 PTE만 지우고 SPT Entry를 남기면 다음 접근의 Page Fault가 매핑을 다시 살릴 수 있다. 해제는 주소 변환과 SPT의 등록 정보를 함께 정리해야 끝난다.

접근하지 않은 Page에는 저장할 Frame 바이트가 없다. `uninit_destroy()`가 열린 파일 참조와 aux를 정리하면 된다. 초기화된 Page는 `file_backed_destroy()`가 write-back을 시도하고 파일 참조를 닫는다. 실제 Frame 정리와 Page 메모리 해제는 바깥의 `vm_dealloc_page()`가 이어서 수행한다. 프로세스 종료 때도 SPT의 Page를 정리하는 경로가 사용된다.

`pml4_clear_page()`를 호출하면 Dirty 비트까지 반드시 사라지는 것은 아니다. 현재 `threads/mmu.c`는 PTE의 Present 비트만 끄고, `pml4_is_dirty()`는 Present 여부와 별도로 Dirty 비트를 읽는다. 다만 PTE 자체를 해제하거나 재사용한 뒤에는 이전 상태를 근거로 삼을 수 없다. write-back에 필요한 PML4·Frame·파일 참조의 수명을 보장하는 것이 핵심이며, 현재 `vm_dealloc_page()`는 `destroy(page)` 뒤에 Frame을 정리한다. [PTE 상태를 다루는 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

파일 참조를 aux에서 `page->file`로 옮겼다면 aux를 해제하면서 그 파일까지 닫으면 안 된다. aux의 저장 공간은 버려도 파일 참조는 이후 Page-in과 write-back에 필요하다. 타입 전환 뒤에는 `page->uninit.aux`를 다시 읽지 않고, 각 상태의 소유자가 한 번씩 정리한다.

6000바이트 매핑에서 `p[0]`만 수정했다면 첫 번째 Page는 Dirty인 `VM_FILE`, 두 번째 Page는 아직 `VM_UNINIT`일 수 있다. 첫 번째는 파일의 앞 `4096`바이트를 저장할 수 있고, 두 번째는 Page 데이터 쓰기 없이 aux와 파일 참조를 정리한다. 같은 매핑 안에서도 실제 접근 여부에 따라 정리 경로가 다르다.

다음 실행 모델은 파일 참조와 aux 메모리의 수명을 센다. Dirty write-back은 앞의 예제에서 분리해 다뤘으므로 여기서는 소유권 이동만 표현한다.

```run-python
def lifecycle(access, evict=False):
    page = {"type": "UNINIT", "aux": {"file": "reopened-file"},
            "file": None, "resident": False}
    freed_aux = closed_file = 0

    if access:
        aux = page["aux"]
        page["file"] = aux["file"]  # 참조를 이동하며 다시 열지는 않는다.
        page["type"] = "FILE"
        page["aux"] = None
        freed_aux += 1
        page["resident"] = True
        if evict:
            page["resident"] = False
            assert page["file"] is not None  # 재적재를 위해 보존
            page["resident"] = True  # 같은 파일 참조로 다시 적재

    if page["type"] == "UNINIT":
        closed_file += 1
        page["aux"] = None
        freed_aux += 1
    else:
        closed_file += 1
        page["file"] = None
    page["resident"] = False
    assert freed_aux == closed_file == 1
    return freed_aux, closed_file

for label, accessed, evicted in [
    ("접근 없이 해제", False, False),
    ("첫 접근 후 해제", True, False),
    ("접근·교체·재적재 후 해제", True, True),
]:
    freed, closed = lifecycle(accessed, evicted)
    print(f"{label}: aux 해제 {freed}회, 파일 참조 닫기 {closed}회")
```

이 모델은 등록과 파일 읽기가 성공한 경로를 비교한다. 실제 구현의 초기화 실패 경로까지 보장하는 예제는 아니다. 현재 VM 빌드의 `process_exit()`은 `process_cleanup()`으로 SPT와 PML4를 정리한 뒤 실행 파일과 fd Table의 파일을 닫는다. SPT를 정리할 때는 write-back에 필요한 PML4가 아직 유효해야 한다.

Page 교체는 Page 자체를 없애는 일이 아니다. 현재 `vm_evict_frame()`은 `swap_out(page)`이 성공한 뒤 소유자의 PTE를 지우고 Page와 Frame의 연결을 끊는다. File-backed Page는 파일과 offset을 남겨 두었다가 다시 읽을 수 있다. Anonymous Page를 보존하는 [Swap](/wiki/computer-systems-network-swap-11630540adf8/) Slot과 구분한다.

현재 코드에서 확인되는 한계도 있다. Eviction은 `swap_out()` 실패 시 Frame 회수를 중단하지만, `file_backed_destroy()`는 그 반환값을 확인하지 않고 파일을 닫는다. 또한 `vm_do_claim_page()`는 PTE 설치 실패를 정리하지만, 뒤의 `swap_in()` 실패에는 같은 정리 분기가 없다. 두 실패 경로까지 정상이라고 단정할 수 없으며, 파일 쓰기·읽기 실패를 주입하는 검증이 별도로 필요하다. 이 문서의 코드 대조는 해당 실행 시험을 통과했다는 뜻이 아니다.

## 같은 파일을 두 번 매핑하면 무엇이 같을까

같은 파일의 offset 0을 `0x10000000`과 `0x20000000`에 매핑할 수 있다. 파일과 offset은 같아도 가상 주소와 SPT Entry, Page의 수명은 각각 다르다. 현재 SPT의 Hash key는 Page 경계로 내린 가상 주소다. 파일 offset을 key로 쓰면 두 요청을 구분하지 못한다.

`file_reopen()`은 같은 inode를 가리키는 새 `struct file`을 만든다. 원본 파일의 바이트를 복제하는 함수가 아니다. 현재 위치 `pos`와 닫을 책임은 새 객체에 있고, `file_read_at()`·`file_write_at()`은 지정한 offset으로 접근하므로 `pos`를 바꾸지 않는다. 파일의 식별과 열린 파일 객체의 수명은 [File Descriptor](/wiki/pintos-file-descriptors/)에서도 구분한다. [열린 파일 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/file.c)

현재 구현에서 6000바이트 매핑을 성공적으로 만들면 Page가 두 개이고, 매핑을 위해 재열기한 파일 참조도 두 개다. 한 Page를 읽고 다른 Page를 읽지 않았더라도 각 참조는 해당 Page의 정리 경로에서 한 번씩 닫혀야 한다. Region 하나가 파일 참조 하나를 소유하는 대안이라면 매핑 전체의 close는 한 번이다. “매핑당 close 한 번”을 모든 설계의 공통 규칙으로 삼으면 현재 Page별 소유권을 잘못 검사하게 된다.

다음 모델은 두 매핑의 SPT key, 파일 offset, 파일 참조를 비교한다. A는 128 KiB로 32 Page를 차지하고, B는 같은 파일의 앞 6000바이트를 별도 주소에 매핑한다. Page Fault와 파일 I/O는 생략하고 등록 정보와 참조의 수명만 실행한다.

```run-python
PAGE = 4096
FILE_LENGTH = 128 * 1024
spt = {}
refs = {}

def register(base, length):
    assert base % PAGE == 0 and 0 < length <= FILE_LENGTH
    count = 1 + (length - 1) // PAGE
    addresses = [base + i * PAGE for i in range(count)]
    assert not any(va in spt for va in addresses)
    for i, va in enumerate(addresses):
        offset = i * PAGE
        read_bytes = min(PAGE, length - offset, FILE_LENGTH - offset)
        ref_id = len(refs)
        refs[ref_id] = {"inode": "sample", "closed": False}
        spt[va] = {"map_start": base, "ofs": offset,
                   "read_bytes": read_bytes, "file_ref": ref_id}

def unmap(base):
    va = base
    closed = 0
    while va in spt and spt[va]["map_start"] == base:
        page = spt.pop(va)
        ref = refs[page["file_ref"]]
        assert not ref["closed"]
        ref["closed"] = True
        closed += 1
        va += PAGE
    return closed

a, b = 0x10000000, 0x20000000
register(a, 128 * 1024)
register(b, 6000)
assert spt[a]["ofs"] == spt[b]["ofs"] == 0
assert spt[a]["file_ref"] != spt[b]["file_ref"]
print("등록 Page:", len(spt), "재열기한 파일 참조:", len(refs))
va = a + 17 * PAGE
print(f"A의 Page 17: VA={va:#x}, file offset={spt[va]['ofs']:#x}")
assert spt[va]["ofs"] == 0x11000
assert unmap(a + PAGE) == 0  # 시작 주소가 아닌 입력
print("A 해제에서 닫은 참조:", unmap(a))
assert set(spt) == {b, b + PAGE}
assert all(not refs[p["file_ref"]]["closed"] for p in spt.values())
print("남은 B의 Page:", [hex(va) for va in spt])
print("B 해제에서 닫은 참조:", unmap(b))
assert not spt and all(ref["closed"] for ref in refs.values())
```

출력에서 A의 Page 17은 가상 주소 `0x10011000`, 파일 offset `0x11000`에 대응한다. A를 해제하면 32개 참조가 닫히지만 B의 두 Page와 참조는 남는다. 같은 파일을 가리키는 것과 한 매핑의 자원을 함께 정리하는 것은 서로 다른 관계다.

파일 내용의 일관성은 이 소유권 모델만으로 보장되지 않는다. 같은 inode라도 이미 적재한 Frame이 서로 다르면 다른 매핑의 변경이 즉시 보이는지는 별도 정책이다. KAIST 과제는 서로 다른 프로세스가 같은 파일을 매핑할 때 데이터 일관성까지 요구하지 않는다. 실제 공유 방식은 앞서 본 [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/)의 `MAP_SHARED`·Copy-on-Write와 나누어 이해한다. [KAIST mmap 요구사항](https://casys-kaist.github.io/pintos-kaist/project3/memory_mapped_files.html)

### 여러 실행 흐름이 같은 영역을 바꾼다면

별도 Region List와 동시 접근을 지원하도록 확장한다면, List에 추가·제거하는 연산과 Page Fault가 참조하는 객체의 수명을 함께 보호해야 한다. I/O 전에 List Lock을 풀더라도 그 사이 Region이나 파일 참조가 해제되지 않도록 참조를 확보하거나 해제 중 상태를 관리해야 한다. 단순히 “List Lock 밖에서 I/O를 한다”만으로 수명이 보장되지는 않는다. Frame·파일 시스템 Lock을 얻는 순서도 맞춰야 한다. 이는 현재 구현에 없는 Region List를 추가할 때의 설계 조건이다.

## fork와 exec 사이의 매핑

현재 `supplemental_page_table_copy()`는 `page_get_type(src_page) == VM_FILE`이면 복사하지 않고 다음 Page로 넘어간다. 아직 `VM_UNINIT` 상태여도 최종 타입이 `VM_FILE`이면 같은 분기에 들어간다. 따라서 이 구현의 파일 매핑은 fork 직후부터 자식 SPT에 복사되지 않는다. `process_exec()`는 별도로 현재 주소 공간을 정리하고 SPT를 다시 초기화한 뒤 새 실행 파일을 적재한다. fork에서 무엇을 복사하는지와 exec에서 무엇을 없애는지는 각각 확인해야 한다. [현재 SPT 복사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c), [현재 exec](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)

W11 기준 커밋 `09390dd`의 `file_copy()`는 자식 Page를 등록하고 Claim한 뒤, 상주 부모 Frame의 바이트를 복사한다. 이 등록에는 파일을 준비할 Callback과 `aux`가 없고, 해당 버전의 `file_backed_initializer()`는 Operations만 바꾼다. 자식의 파일·Offset·읽기 길이를 복사하거나 파일을 다시 여는 호출도 없다. 따라서 Frame의 바이트가 같아지는 것만으로 자식의 파일 매핑 정보와 수명이 준비됐다고 볼 수 없다. [W11 FILE 초기화](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/file.c#L32-L49), [FILE 복사 함수](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/file.c#L165-L179)

같은 함수의 `swapped` 분기는 파일의 내용을 자식 Frame이 아니라 `src_page->frame->kva`로 읽는다. 부모 Page가 Eviction으로 Frame 연결을 잃은 상태라면 이 포인터를 역참조할 수 없다. 이를 “파일에서 자식 Frame으로 복원하는 구현”이라고 설명하면 읽기 대상과 수명 조건을 모두 놓친다. 기준 커밋의 FILE swap-out은 Dirty 내용을 파일에 쓰지만 반환 길이를 검사하지 않은 채 `swapped`를 기록한다. 이 경로는 쓰기 완료와 실패 복구도 따로 검증해야 한다. [W11 FILE swap-out](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/file.c#L52-L62), [Frame 연결 해제](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/vm.c#L205-L217)

아직 UNINIT인 FILE Page는 W11의 `uninit_copy()`로 복제한다. [프로세스 생성의 W11 복사 경계](/wiki/computer-systems-network-topic-4af2e32913a4/#현재-학습-레포와-w11-작업본은-소유권을-다르게-기록한다)에서 본 Page별 파일 재열기는 매핑 전체를 해제하는 조건과도 맞아야 한다. W11의 `do_mmap()`은 파일을 한 번 다시 열어 여러 Page의 `aux`에 같은 포인터를 넣지만, `do_munmap()`은 인접 Page의 파일 포인터가 같은 동안만 제거한다. 두 UNINIT Page를 fork하고 자식에서 모두 정상 초기화했다고 가정하면, 각 Page의 파일 객체가 달라 첫 Page에서 시작한 해제가 둘째 Page 앞에서 멈출 수 있다. 이는 포인터 비교 조건을 따라간 소스상의 판단이며 실행으로 재현한 결과는 아니다. 현재 학습 레포의 `map_start`를 이용한 매핑 범위 관리와 구별해야 한다. [W11 매핑 등록과 해제](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/file.c#L76-L133)

복제를 관찰할 때는 등록 직후의 UNINIT과 초기화 뒤의 FILE 상태를 먼저 나눈다. 실제 SPT 순회와 `file_copy()`에서 유효한 부모·자식 Page를 찾고, 같은 VA의 파일·Offset·읽기 길이와 Frame 연결을 비교한다. 복제 경로가 성공한 뒤 두 Frame이 유효한 경우에만 파일 유효 영역과 0 채움을 포함한 전체 `PGSIZE` 바이트를 비교한다. 매핑 범위의 Page를 VA별로 빠짐없이 확인하고, PTE의 쓰기 권한·Dirty 상태는 바이트 일치와 파일 반영 정책을 구분해 읽는다. 함수가 false를 반환했다면 어느 호출에서 실패했는지 확인한다. false만으로 파일 재열기 실패라고 판단할 수는 없다. W11의 `mmap-read`는 파일 내용과 뒤의 0 채움을 검사하지만 fork를 호출하지 않으므로, 위 복제 경로의 검증 결과로 사용할 수 없다. [mmap-read의 확인 범위](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/tests/vm/mmap-read.c)

현재 학습 레포의 `mmap-inherit`는 부모가 `0x54321000`에 읽기 전용 매핑을 만든 뒤 fork하고, 자식이 `child-inherit`를 exec하게 한다. 자식은 같은 주소에 쓰기를 시도하며, 부모는 자식의 종료 코드와 자신의 매핑 내용이 유지되는지 확인한다.

이 테스트의 자식이 쓰기에 실패했다는 사실만으로 SPT Entry가 없었다고 단정할 수는 없다. 잘못 남은 읽기 전용 매핑에서도 쓰기는 실패할 수 있기 때문이다. 주소 공간에서 매핑이 제거됐는지까지 확인하려면 exec 이후 SPT와 PTE를 확인하거나, 해당 주소의 읽기도 실패하는 별도 검증이 필요하다. fork 직후 상태를 확인하는 테스트도 따로 있어야 한다. [mmap-inherit 테스트](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-inherit.c)


## 파일 offset에서 디스크 요청까지

write-back은 `file_write_at()` → `inode_write_at()` → `disk_write()`로 이어진다. mmap만을 위한 별도의 디스크 장치를 쓰는 것이 아니다. 전체 Sector를 바꾸면 직접 쓰고, 일부만 바꾸면 기존 Sector를 Bounce Buffer로 읽어 나머지 바이트를 보존한 뒤 쓴다.

기본 파일 시스템의 연속 할당에서 파일의 첫 데이터 Sector가 `200`이라고 가정하면, 파일 offset `4096`은 8개 Sector 뒤인 `208`이다. 아래 계산은 이 연속 할당 가정을 사용한다. Index나 FAT로 연결된 파일에는 실제 블록 조회를 대신할 수 없다.

```run-python
pte = 0x12345067
flags = {"Present": 0x01, "Writable": 0x02, "User": 0x04,
         "Accessed": 0x20, "Dirty": 0x40}
print("PTE:", ", ".join(name for name, mask in flags.items() if pte & mask))

first_sector = 200
file_offset = 4096
sector_delta, within_sector = divmod(file_offset, 512)
disk_sector = first_sector + sector_delta
backend_offset = disk_sector * 512
print(f"Disk Sector: {disk_sector}, Sector 내부: {within_sector}")
print(f"BlockBackend offset: {backend_offset} = {backend_offset:#x}")
assert disk_sector == 208 and backend_offset == 106496 == 0x1A000
assert pte & flags["Dirty"]
```

`disk_write()` 아래의 [IDE 컨트롤러](/wiki/ide-controller/)는 ATA PIO 명령 `0x30`과 데이터 전송을 처리한다. QEMU의 `ide_sector_write()`는 Guest Sector 번호를 `sector_num << 9`로 바꾸어 `blk_aio_pwritev()`에 전달한다. [BlockBackend](/wiki/qemu-block-backend/) 아래에서 Raw·qcow2 같은 이미지 형식과 Host I/O를 처리한다. `0x1A000`을 Host 파일의 실제 위치로 곧바로 읽을 수 있는지는 이미지 형식과 Raw offset 설정에 달려 있다.

QEMU의 TCG x86 MMU 구현에는 Store 접근에서 `PG_DIRTY_MASK`를 설정하는 코드가 있다. Guest의 Page Fault와 PTE 변경을 하드웨어 동작으로 재현하는 부분이다. 디스크 쪽에는 별도로 IDE와 Block I/O 경로가 있다. QEMU가 PintOS의 `struct file_page`나 “이 매핑을 지금 저장해야 한다”는 정책을 판단하는 것은 아니다. TCG의 함수 경로를 KVM 등 다른 가속 방식에도 그대로 적용하지 않는다. [QEMU v10.0.0 x86 MMU](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c)

접근하지 않은 Page의 aux 누수나 중복 close는 디스크 Trace만으로 확인하기 어렵다. 또한 Page 데이터의 write-back이 없다고 전체 디스크 쓰기가 없다고 단정해서도 안 된다. 기본 파일 시스템에서 이미 제거된 inode의 마지막 참조를 닫으면 `inode_close()`가 Sector를 반환하고, `free_map_release()`가 Bitmap을 기록한다. 이런 Metadata I/O는 mmap Page의 Dirty write-back과 별개의 원인이다. [공간 반환 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/free-map.c)

Guest에서 파일 쓰기가 끝난 것과 Host 저장 장치에 변경이 안전하게 남은 것은 별도의 경계다. `munmap()`에서 `file_write_at()`이 성공했다는 이유만으로 전원 장애까지 견딘다고 해석하지 않는다. 그 아래의 완료 조건은 [fsync](/wiki/file-system-fsync/)에서 다룬다.

## 실행 중에는 어느 값을 볼까

PintOS Kernel을 GDB로 디버깅할 때는 함수마다 유효한 인자가 다르다. `syscall_handler()`에서 `f`가 유효한 상태라면 다음 Register가 호출 인자를 담는다.

```gdb
break syscall_handler
print/x f->R.rax
print/x f->R.rdi
print f->R.rsi
print f->R.rdx
print f->R.r10
print f->R.r8
```

`RAX`는 호출 번호이고, 순서대로 `RDI=addr`, `RSI=length`, `RDX=writable`, `R10=fd`, `R8=offset`이다. `print` 명령은 실제로 해당 중단점에서 멈춘 뒤 실행한다.

정렬 검사에서 offset의 하위 비트를 보려면 같은 중단점에서 `print/x f->R.r8 & 0xfff`를 실행할 수 있다. `pg_ofs()` 같은 inline 함수를 디버거가 호출할 수 있다고 가정할 필요가 없다. 주소 범위는 현재 구현과 동일하게 포함되는 마지막 바이트를 계산해 확인한다.

쓰기 보호를 확인할 때는 `vm_try_handle_fault()` 진입에서 이미 전달된 인자를 읽을 수 있다. 아래 `print`는 중단점에서 멈춘 뒤 실행한다.

```gdb
break vm_try_handle_fault
print/x addr
print/x f->error_code
print not_present
print write
print user
```

SPT 권한은 `vm_claim_spt_page()`에서 `spt_find_page()`가 반환한 뒤 `page`가 NULL이 아닌 것을 확인하고 `print page->writable`로 읽는다. PTE는 `pml4_set_page()`의 대입이 끝난 직후 `print/x *pte`, `print/x *pte & 0x2`로 확인한다. Fault 값과 PTE 값 중 어느 쪽을 읽었는지 함께 구분한다.

aux 전환은 `uninit_initialize()` 진입에서 먼저 `page->operations->type`을 확인하고, UNINIT 상태일 때만 `print *(struct lazy_load_arg *) page->uninit.aux`로 읽는다. `file_backed_initializer()`가 끝난 뒤에는 아래의 `page->file` 필드로 옮겨서 확인한다. 디버거가 두 Union 멤버를 모두 출력할 수 있어도 둘이 동시에 유효하다는 뜻은 아니다.

`file_backed_swap_out()`에서는 `page`가 유효한지, resident Frame이 있는지부터 확인한다. 다음 조회는 초기화된 `VM_FILE` Page이며 `page->frame`이 NULL이 아닐 때 사용한다.

```gdb
break file_backed_swap_out
print/x page->va
print page->operations->type
print page->file.ofs
print page->file.page_read_bytes
print page->file.page_zero_bytes
print/x page->file.map_start
print page->frame->owner_thread
x/32xb page->frame->kva
```

Dirty 값은 `pml4_is_dirty()` 내부의 `pte` 계산 뒤에서 확인하면 실행 중인 Kernel 함수를 GDB에서 직접 호출하지 않아도 된다. `file_write_at()`에 멈추면 인자 `file_ofs`, `size`, `buffer`를 확인하고, `disk_write()`에 멈추면 그 함수의 `sec_no`, `buffer`로 내려간 값을 확인한다. Guest GDB에서 QEMU의 `blk_aio_pwritev()`가 잡히지는 않는다. 그 중단점은 Debug Symbol이 있는 QEMU 프로세스에 붙인 Host Debugger에서 사용한다.

현재 저장소의 테스트 소스는 각기 다른 경계를 확인한다.

| 테스트 | 확인하는 동작 |
|---|---|
| `mmap-read` | 매핑으로 읽은 바이트와 파일 내용, 마지막 Page의 zero fill |
| `mmap-write` | 매핑을 수정한 뒤 해제했을 때 파일에 남는 내용 |
| `mmap-ro` | 읽기 전용 매핑에 첫 접근부터 쓴 뒤 정상 실행이 이어지지 않는지 |
| `mmap-clean` | 수정하지 않은 Frame이 일반 파일 쓰기를 덮어쓰지 않는지 |
| `mmap-off`, `mmap-bad-off` | 0이 아닌 정렬된 파일 offset과 정렬되지 않은 offset |
| `mmap-close`, `mmap-remove` | fd를 닫거나 파일 이름을 제거한 뒤에도 매핑의 파일 참조가 유지되는지 |
| `mmap-unmap` | 해제한 영역의 SPT 등록까지 제거되어 이후 접근이 허용되지 않는지 |
| `mmap-overlap` | 아직 접근하지 않은 매핑과 겹치는 요청도 거절하는지 |
| `mmap-over-code`, `mmap-over-data`, `mmap-over-stk` | 기존 Code·Data/BSS·Stack 영역을 덮어쓰지 않는지 |
| `mmap-kernel`, `mmap-misalign` | Kernel을 포함하는 범위와 정렬되지 않은 시작 주소를 거절하는지 |
| `mmap-bad-fd`, `mmap-zero` | 없는 fd와 길이 0인 매핑 뒤 접근의 실패 경로 |
| `mmap-exit` | 명시적 `munmap()` 없이 종료해도 변경이 기록되는지 |
| `mmap-twice` | 같은 파일을 두 가상 주소에서 각각 읽을 수 있는지 |
| `mmap-shuffle` | 128 KiB 매핑의 초기화와 반복 Shuffle 뒤 Checksum |
| `mmap-inherit` | 자식의 exec 후 쓰기 실패와 부모 매핑 내용의 유지 |
| `swap-file` | 작은 메모리 설정에서 큰 파일 읽기와 마지막 Page의 zero fill |

`mmap-ro.ck`는 쓰기 직전 메시지까지 확인하며 `IGNORE_EXIT_CODES=1`을 사용한다. 정확히 `exit(-1)`을 출력했는지까지 검사하는 것은 아니다. 또한 먼저 읽어 적재한 뒤 쓰는 경우는 이 테스트에 없다. 그 경로는 별도 변형으로 확인해야 한다.

테스트 이름만으로 확인 범위를 넓혀 읽으면 안 된다. `mmap-zero`는 빈 파일에 **길이 0**으로 매핑을 요청하고 이후 접근에서 실패하는지 확인한다. 따라서 이 테스트만 통과했다고 “길이는 양수지만 파일이 비어 있는 경우”까지 검증한 것은 아니다. `mmap-bad-fd`의 기대 출력은 NULL 반환과 프로세스 종료 경로를 모두 허용하지만, 현재 syscall 코드는 없는 fd에 NULL을 반환한다. 테스트가 허용하는 범위와 현재 코드가 선택한 동작을 나누어 읽는다.

`mmap-unmap`의 해제 전 두 번째 식은 `*(int *)ACTUAL + 0x1000`이다. 이는 첫 위치에서 읽은 값에 상수를 더하는 식이므로 두 번째 Page를 미리 읽은 증거가 아니다. 해제 뒤의 접근은 `*(int *)(ACTUAL + 0x1000)`이어서 두 번째 Page를 실제로 가리킨다. 괄호 위치까지 확인해야 아직 접근하지 않은 Page도 함께 제거하는지 해석할 수 있다. [mmap-unmap 테스트](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-unmap.c)

`mmap-twice`는 두 매핑을 읽어 비교하지만, 한쪽을 `munmap()`한 뒤 다른 쪽을 다시 읽는 순서는 포함하지 않는다. 앞의 실행 모델은 그 수명 차이를 보여 주지만 실제 Kernel의 해당 경로는 따로 시험해야 한다. `mmap-shuffle`도 매핑 안에서 초기화하고 열 번 섞으며 Checksum을 출력한다. 파일을 다시 열어 저장된 결과를 읽는 테스트는 아니므로, 이 Checksum만으로 write-back 완료까지 확인했다고 해석하지 않는다.

`swap-file`의 현재 `Make.tests` 설정은 `MEMORY=8`, `SWAP_DISK=10`이다. 소스 첫 주석에는 128 MB와 Anonymous Page 채우기가 적혀 있지만, 테스트 본문에는 그 채우기 단계가 없다. 실제로는 큰 파일을 매핑해 내용을 비교하고 마지막 Page의 남는 부분을 확인한다. `file_backed_swap_out()`·`file_backed_swap_in()`이 몇 번 실행됐는지는 중단점이나 실행 중 집계로 확인할 일이다. 테스트 이름이나 주석만으로 교체 횟수를 만들어 적지 않는다. [VM 테스트 설정](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/Make.tests), [swap-file 본문](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/swap-file.c)

저장소 루트에서, x86-64 Linux와 PintOS용 Compiler·QEMU가 준비된 환경이라면 다음처럼 VM 테스트를 선택할 수 있다. 웹의 Python 실행기는 이 Kernel 테스트 환경을 대신하지 않는다.

```bash
make -C pintos/vm check \
  TESTS='tests/vm/mmap-read tests/vm/mmap-write tests/vm/mmap-clean
         tests/vm/mmap-off tests/vm/mmap-bad-off tests/vm/mmap-close
         tests/vm/mmap-remove tests/vm/mmap-unmap tests/vm/mmap-exit
         tests/vm/swap-file tests/vm/mmap-overlap tests/vm/mmap-over-code
         tests/vm/mmap-over-data tests/vm/mmap-over-stk tests/vm/mmap-kernel
         tests/vm/mmap-misalign tests/vm/mmap-bad-fd tests/vm/mmap-zero
         tests/vm/mmap-twice tests/vm/mmap-shuffle tests/vm/mmap-inherit
         tests/vm/mmap-ro'
```

위 명령은 재현할 테스트 범위를 제시한다. 이 글에서 직접 실행한 것은 Python 모델이며, 이 명령의 실행 결과나 QEMU 디버깅 화면을 측정 결과로 제시한 것은 아니다. 과제의 요구사항과 코드의 실제 구현, 실행으로 확인한 결과를 구분해서 읽는다. [KAIST PintOS Memory Mapped Files](https://casys-kaist.github.io/pintos-kaist/project3/memory_mapped_files.html)
