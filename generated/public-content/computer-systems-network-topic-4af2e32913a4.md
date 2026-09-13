---
layout: default
title: 프로세스 생성
nav_order: 5
permalink: /wiki/computer-systems-network-topic-4af2e32913a4/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-4af2e32913a4
projection_sha256: 215a06197bc6979761b6dcedff8f6189ad340a56e9d245ea7365dd8c8697f529
parent: 사용자 프로그램
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63dd07ba6393
search_terms:
- process_fork
- __do_fork
- fork_args
- fork_sema
- fork_success
- duplicate_fd_table
- duplicate_running_file
- intr_frame
- RAX
- duplicate_pte
- page_get_type
- spt_copy_uninit_page
- Copy-on-Write
- COW
- cow-simple
- vm_handle_wp
- spt_copy_cow_page
- anon_copy
- frame_owner
grand_parent: PintOS
ancestor: CS 기초
---

# 프로세스 생성
{: .no_toc }

`fork()`는 부모가 실행하던 지점에서 이어갈 자식 프로세스를 만든다. 부모는 자식의 ID를 받고 자식은 0을 받는다. 두 실행 흐름이 같은 호출 다음에서 갈라질 수 있으려면 레지스터뿐 아니라 주소 공간과 열린 파일의 상태도 준비되어야 한다.

PintOS에서는 이 준비를 새로 만든 자식 Thread의 `__do_fork()`가 수행한다. 부모의 `process_fork()`는 자식이 초기화 결과를 알릴 때까지 기다린다. 아래 코드는 [lrn-pintos의 `5afaa6d`](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos)를 기준으로 읽는다.

## Thread 생성과 프로세스 복제의 완료 시점

`thread_create()`의 성공만으로 사용자 프로세스 복제가 끝난 것은 아니다. 이 함수는 Kernel Thread의 Page와 시작 문맥을 만들고 스케줄러에 등록한다. 주소 공간과 파일 복제는 이후 자식의 진입 함수가 담당한다. 부모가 결과를 확인하지 않고 성공 ID를 반환하면 뒤늦은 복제 실패를 호출자에게 전달하지 못한다.

그렇다고 `thread_create()`가 돌아온 순간에 자식이 항상 READY 상태라고 고정할 수도 없다. 현재 구현은 더 높은 우선순위의 자식을 깨우면 `thread_yield()`를 호출한다. Timer에 의한 선점도 가능하므로 자식이 이미 실행되었거나 초기화를 마쳤을 수 있다. 부모가 필요한 것은 특정 실행 순서가 아니라 **초기화 결과가 준비된 다음에만 결과를 읽는 순서**다. [Thread 생성](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c)

`child_status` 안의 두 Semaphore는 기다리는 사건이 다르다.

| 필드 | 기다리는 사건 | 결과를 읽는 함수 |
|---|---|---|
| `fork_sema`와 `fork_success` | 자식의 초기화 성공 또는 실패 | 부모의 `process_fork()` |
| `wait_sema`와 `exit_status` | 자식의 종료 | 부모의 `process_wait()` |

fork가 성공해도 프로그램이 나중에 오류로 종료할 수 있다. 생성 결과와 종료 결과는 별도로 받아야 한다. 종료 상태의 수명과 수거는 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에서 다룬다.

## 부모의 User 문맥을 자식에게 전달한다

System Call에 진입할 때 `RAX`는 `SYS_FORK`, `RDI`는 새 Thread 이름의 User 포인터다. `syscall_handler()`는 `fork(thread_name, f)`를 거쳐 `process_fork(thread_name, f)`로 현재 User 레지스터를 담은 `intr_frame`을 전달한다. 이름 포인터는 User 메모리 검증을 거친다.

부모는 `child_status`를 할당하고 상태와 두 Semaphore를 초기화한다. 이어 다음 정보로 `fork_args`를 만든다.

```c
struct fork_args {
    struct thread *parent;
    struct intr_frame if_;
    struct child_status *cs;
};
```

`args->if_ = *if_`는 프레임의 값을 복사한다. 자식은 자신의 지역 변수 `if_`로 다시 복사한 뒤 `args`를 해제한다. 부모가 나중에 프레임의 `RAX`를 반환 ID로 바꾸더라도, 자식이 보관한 복사본까지 같은 값으로 바뀌어서는 안 된다.

여기서 부모의 `thread->tf`를 대신 복사하면 안 된다. 그 필드는 Thread 스케줄링 문맥에도 쓰이며, 이번 fork를 호출한 User 문맥을 전달하는 인자가 아니다. 자식은 전달받은 프레임의 `if_.R.rax`를 0으로 바꾸고 `do_iret(&if_)`로 복원한다. 부모의 반환 값은 `process_fork()`가 돌려준 ID를 System Call 프레임의 `f->R.rax`에 쓰는 경로로 결정된다. [fork 진입과 프레임 전달](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c), [System Call wrapper](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c)

`struct intr_frame`과 `fork_args`의 크기는 해당 빌드에서 `sizeof`로 확인한다. 포인터 둘의 크기에 프레임 크기를 더할 때도 정렬과 Padding을 고려해야 한다. 특정 자료에서 본 184바이트를 모든 x86-64 프레임의 고정값으로 사용하지 않는다.

### 같은 가상 주소와 다른 프레임

부모와 자식의 User RIP·RSP 값이 같아도 두 프로세스의 모든 물리 메모리가 같은 것은 아니다. 같은 User 가상 주소를 각 프로세스의 Page Table로 해석한다. non-VM 복제는 별도 Frame으로 같은 내용을 만들고, Copy-on-Write는 처음에 Frame을 공유했다가 쓰기 권한과 참조 상태에 따라 분리할 수 있다. User Stack 주소 값과 프레임 복사본을 둔 Kernel Stack 주소도 구분한다.

현재 `include/threads/interrupt.h`의 packed 정의를 기준으로 계산하면 `gp_registers`는 15개의 64비트 레지스터, 즉 120바이트다. 전체 `intr_frame`은 명시된 Segment Padding과 벡터·오류 코드, 복귀 정보를 포함해 192바이트다. `R.rax`의 offset은 112, `rip`는 152, `rsp`는 176이다. 이 값은 해당 소스의 x86-64 배치에서 계산한 것이며 실제 빌드의 GDB 출력이나 CPU 실행 측정값은 아니다. [프레임 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/interrupt.h)

다음 예제는 이 배치에 레지스터 값을 넣고 부모 → args → 자식의 두 번 값 복사를 실행한다. 부모가 반환 ID를 쓰더라도 자식의 복사본은 별도로 남는다.

```run-python
import struct

fields = [(name, 8) for name in
          "r15 r14 r13 r12 r11 r10 r9 r8 rsi rdi rbp rdx rcx rbx rax".split()]
fields += [("es와 Padding", 8), ("ds와 Padding", 8), ("vec_no", 8),
           ("error_code", 8), ("rip", 8), ("cs와 Padding", 8),
           ("eflags", 8), ("rsp", 8), ("ss와 Padding", 8)]
offsets, total = {}, 0
for name, size in fields:
    offsets[name] = total
    total += size
assert total == 192 and offsets["rax"] == 112
assert offsets["rip"] == 152 and offsets["rsp"] == 176

parent = bytearray(total)
for name, value in [("rax", 2), ("rip", 0x401122), ("rsp", 0x7FFFFF00)]:
    struct.pack_into("<Q", parent, offsets[name], value)
args_frame = bytearray(parent)
child = bytearray(args_frame)
del args_frame
struct.pack_into("<Q", parent, offsets["rax"], 17)
struct.pack_into("<Q", child, offsets["rax"], 0)

for label, frame in [("부모", parent), ("자식", child)]:
    values = {name: hex(struct.unpack_from("<Q", frame, offsets[name])[0])
              for name in ["rax", "rip", "rsp"]}
    print(label, values)
assert parent is not child
assert parent[:112] == child[:112] and parent[120:] == child[120:]
print(f"프레임 {total}B, 소스 수준의 두 번 복사 {2 * total}B")
```

이 코드의 초기 `RAX = 2`는 해당 저장소의 `SYS_FORK` 번호다. 자식의 프레임을 복사한 직후에는 아직 부모가 돌려받을 자식 ID가 들어 있는 것이 아니다. 부모 ID 17은 결과 전달 모델의 예시다. 두 번의 구조체 복사는 소스에서 수행하는 복사량이며 Compiler가 생성하는 실제 load/store 수나 실행 시간을 뜻하지 않는다.

`do_iret()`은 현재 `threads/thread.c`에 있다. 먼저 프레임에서 범용 레지스터와 Segment 값을 복원한 뒤 `iretq`를 실행한다. 이 경로에서 남은 복귀 프레임은 RIP·CS·RFLAGS·RSP·SS다. 현재 User Code Selector `SEL_UCSEG`는 `0x23`, 하위 두 비트의 RPL은 3이다. Selector 값만 맞으면 무조건 복귀가 성공하는 것은 아니며, Descriptor와 주소 등의 조건도 유효해야 한다. [레지스터 복원](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c), [Selector 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/loader.h)

Linux v6.12의 x86 구현에서도 `copy_thread()`가 User `pt_regs`를 복사하고 `childregs->ax = 0`으로 만든다. 다만 `childregs->sp`를 새 Kernel Stack 주소로 바꾼다는 설명은 틀리다. 새 Kernel 실행 문맥은 `p->thread.sp`에 준비하고, `childregs->sp`는 `args->stack`이 지정된 경우 그 User Stack 값으로 바뀐다. User 복귀 문맥과 Kernel의 시작 프레임을 서로 다른 필드로 읽어야 한다. [Linux x86 copy_thread](https://github.com/torvalds/linux/blob/v6.12/arch/x86/kernel/process.c)

## 자식이 성공을 알리기 전에 준비하는 것

정상적으로 전달된 `fork_args`를 받은 `__do_fork()`의 순서는 다음과 같다.

```text
self_status 연결 → User intr_frame 복사 → fork_args 해제
  → pml4_create()
  → process_activate(): 자식 Page Table과 TSS 갱신
  → VM: SPT 초기화와 복제
    또는 non-VM: pml4_for_each(duplicate_pte)
  → duplicate_fd_table()
  → duplicate_running_file()
  → if_.R.rax = 0
  → process_init()
  → fork_success = true
  → sema_up(fork_sema)
  → do_iret(): 자식 User 문맥으로 진입
```

현재 `process_init()`의 본문은 별도 초기화 작업을 하지 않는다. fd Table은 앞선 `duplicate_fd_table()`에서 만들기 때문에, 함수 이름만 보고 `process_init()`이 fd를 복제한다고 추정하지 않는다.

non-VM의 `duplicate_pte()`는 User Frame을 새로 할당해 4096바이트를 복사하고 부모 PTE의 쓰기 권한을 반영한다. VM에서는 [보조 페이지 테이블](/wiki/computer-systems-network-topic-aa5da5d73167/)이 Lazy 상태와 backing 정보를 포함하므로, 현재 Present인 PTE만 복제하는 경로와 다르다. 현재 SPT 복제는 최종 타입이 `VM_FILE`인 mmap Page를 제외한다. 이를 Linux의 일반적인 mmap 상속 규칙으로 설명하지 않는다. [mmap](/wiki/computer-systems-network-mmap-838e9b0f7e0a/)의 fork 경계와 함께 읽는다.

`duplicate_fd_table()`은 새 fd Table을 만들고 각 파일에 `file_duplicate()`를 호출한다. 이 저장소의 `file_duplicate()`는 새 `struct file`에 현재 위치 `pos`와 쓰기 금지 상태를 복사하고 같은 Inode를 참조한다. 디스크 파일 내용까지 통째로 복제하는 의미의 Deep Copy가 아니다. 실행 파일의 쓰기 금지 참조는 `duplicate_running_file()`에서 별도로 이어받는다. [파일 복제](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/file.c)

부모는 복제가 진행되는 동안 `process_fork()`에서 결과를 기다리므로, 같은 부모 Thread가 User 코드로 돌아가 원본 주소 공간을 바꾸거나 파일을 닫는 것을 막는다. 이것만으로 공유 자원 전체가 여러 CPU와 Thread 사이에서 안전하다고 일반화할 수는 없다.

### 현재 VM 복제에서 확인할 경계

현재 소스의 함수 이름만 보고 Lazy·Swap·COW 복제가 모두 완성되었다고 판단할 수는 없다. `page_get_type()`은 현재 Operations 타입이 UNINIT이면 `page->uninit.type`의 최종 타입을 반환한다. 정상적인 Lazy Anonymous Page에 이 함수를 적용하면 `VM_ANON`이 나온다.

그런데 `supplemental_page_table_copy()`는 이 반환 값에 `VM_UNINIT`을 비교해 `spt_copy_uninit_page()`를 호출한다. 최종 타입이 ANON 또는 FILE로 등록된 일반적인 UNINIT Page는 이 조건에 들어가지 않는다. helper에 aux 복사와 `file_reopen()`이 구현되어 있다는 사실과 실제 분기가 그 helper에 도달한다는 사실은 별개다.

Helper 자체는 부모의 `aux`가 있으면 새 `lazy_load_arg`에 값을 복사하고, 파일 포인터가 있으면 `file_reopen()`으로 별도 파일 객체를 얻는다. 자식 Page의 등록에는 부모의 VA·쓰기 권한·예정 타입·초기화 Callback을 전달한다. 파일 참조가 있는 Lazy Page의 복사를 확인할 때는 부모와 자식이 같은 Offset·읽기 길이·0 채움 길이를 가지면서도 Page·`aux`·파일 객체의 주소는 분리되는지 본다. 파일 내용 전체를 복제하는 것은 아니며 두 파일 객체는 같은 Inode를 참조할 수 있다. 재열기나 등록에 실패하면 Helper가 새로 만든 자원만 정리한다. [UNINIT 복사 Helper의 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L592-L627)

다른 설계로는 `aux`와 파일 참조를 공유하면서 마지막 참조까지 수명을 유지하거나, fork 때 미초기화 Page를 먼저 적재한 뒤 복사하는 방법이 있다. 전자는 공유를 전제로 한 정리 계약이 필요하고, 후자는 아직 필요하지 않은 파일 읽기와 데이터 복사 비용을 fork 시점에 치른다. 현재 Helper의 독립 복사와 이런 대안을 섞어서 단순한 포인터 대입을 안전한 복제로 해석하지 않는다.

Swap에 있는 ANON Page도 따로 살펴봐야 한다. 현재 분기에서 Frame이 없으면 자식 Page를 할당·claim하지만, 부모의 `swap_slot` 내용을 읽어 복사하는 처리가 없다. 마지막 `memcpy()`도 부모 Frame이 있을 때만 실행한다. 따라서 이 경로를 “Swap Slot snapshot 복사”라고 설명할 근거가 없다. 새 Page의 초기화 방식에 따라 값이 달라질 수 있으므로, 부모 데이터를 읽지 않았다는 코드 관찰을 임의의 바이트 결과나 재현한 Kernel 오류로 바꾸지 않는다. [타입 조회와 SPT 복제 분기](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c)

| 부모 Page의 상태 | 현재 복제 분기에서 읽히는 경로 |
|---|---|
| UNINIT, 최종 FILE | FILE 제외 조건으로 건너뛴다 |
| UNINIT, 최종 ANON | `page_get_type()`이 ANON이므로 UNINIT helper 분기를 지나간다 |
| 초기화된 ANON, Frame 있음 | `spt_copy_cow_page()`로 Frame을 공유한다 |
| 초기화된 ANON, Frame 없음 | 새 Page를 claim하지만 부모의 Swap 데이터를 복사하는 분기가 없다 |

이 표는 현재 코드의 검토 결과다. VM 구현을 수정한 결과나 관련 테스트가 통과한 결과는 아니다. COW가 있는 코드와 모든 Page 상태의 복제가 올바른 코드는 같은 의미가 아니므로, 이 구분을 유지한 채 상태별 학습을 이어간다.

non-VM에서 User Page가 10개라면 데이터 복사량은 `10 × 4096 = 40960`바이트다. 여기에 Page Table·자식 Thread Page·fd Table·상태 객체의 할당이 더해진다. 데이터 Page 수에 비례하는 복사 비용만으로 fork 전체의 정확한 시간 복잡도나 실제 실행 시간을 설명하지 않는다. Lazy·Swap·공유 Frame이 섞인 VM 경로에는 같은 복사량 공식을 그대로 적용할 수 없다.

GDB에서 `duplicate_pte()`를 세면 callback 진입 수이며, 그중 할당·매핑까지 성공한 Page 수와 다를 수 있다. memcpy 뒤의 데이터를 확인하려면 부모·자식 포인터를 유효한 시점에 GDB 변수로 저장하고 현재 소스 줄에서 관찰한다. `finish`로 함수를 빠져나온 뒤 이미 사라진 지역 변수 `newpage`를 그대로 읽지 않는다. 첫 8바이트가 같다는 것만으로 4096바이트 전체가 같다는 결론도 내리지 않는다.

## 첫 쓰기까지 Frame 복사를 미룬다

부모와 자식이 같은 데이터를 읽기만 하거나 자식이 곧 `exec()`를 호출한다면, fork 때 모든 데이터 Page를 복사하는 일은 낭비가 될 수 있다. Copy-on-Write(COW)는 사적으로 쓸 메모리의 내용을 처음에는 공유하고, 쓰기로 내용이 달라질 때 필요한 복사본을 만든다. 자식의 Kernel Stack과 Page Table, SPT Entry는 각각 따로 만든다.

부모와 자식의 writable Page가 Frame A를 공유한다고 하자. 양쪽 PTE의 W를 내리되 SPT의 `page->writable=true`는 유지한다. 이때도 읽기는 가능하다. 먼저 쓰는 쪽이 자식이면 Frame B를 만들어 A의 내용을 복사하고 자식의 PTE만 B에 연결한다. 부모가 먼저 쓰는 경우에는 부모 쪽이 사본을 받는다. **공유 상태에서 먼저 쓰는 쪽**이 사본을 받는다.

다음 표는 두 프로세스가 Page 하나를 공유하고 정상적으로 복구하는 경우의 상태 변화다. A·B는 상태 변화를 설명하기 위한 Frame 식별자다.

| 시점 | 부모의 매핑 | 자식의 매핑 | 참조 수와 내용 |
|---|---|---|---|
| fork 전 | A, W=1 | 없음 | A의 참조 수 1 |
| fork 후 | A, W=0 | A, W=0 | A의 참조 수 2, 같은 바이트를 읽음 |
| 자식의 첫 쓰기 후 | A, W=0 | B, W=1 | A와 B 각각 1, 자식의 변경은 B에만 남음 |
| 이후 부모가 쓰기 | A, W=1 | B, W=1 | A를 더 공유하지 않으므로 복사 없이 권한 복원 |

자식의 종료나 `exec`로 공유 매핑이 사라져 참조가 하나 남으면, read-only였던 부모 PTE는 그대로 남는다. 학습 레포와 W11 작업본은 부모의 다음 쓰기에서 남은 참조를 보고 W를 복원할 수 있다. 프로세스가 셋 이상이면 어느 Page가 빠졌는지와 각 Frame의 남은 참조를 같은 방식으로 추적해야 한다.

### 같은 쓰기 보호 위반도 모두 COW는 아니다

PTE의 W=0은 현재 쓰기를 막는다는 뜻이다. 읽기 전용 코드처럼 원래 쓰기를 허용하지 않은 Page와 COW 때문에 잠시 막은 Page를 구별하려면 OS의 권한 정보가 더 필요하다. 아래에서 `page->writable`은 원래 허용한 접근, PTE의 W는 현재 매핑의 접근 조건이다.

| SPT의 쓰기 허용 | 현재 매핑과 Frame | 쓰기 보호 위반 처리 |
|---|---|---|
| false | 읽기 전용 Page | COW로 쓰기를 허용하지 않음 |
| true | 유효한 resident Frame, 참조 수 > 1 | 별도 Frame에 복사하고 쓰기 가능하게 연결 |
| true | 유효한 resident Frame, 참조 수 = 1 | 같은 Frame의 쓰기 권한만 복원 |
| 어느 값이든 | 주소·SPT Entry·Frame을 확인할 수 없음 | 정상 COW 복구로 취급하지 않음 |

예를 들어 상위 상태 비트를 생략한 4KiB PTE `0x12345007`에서 W(`0x2`)를 끄면 `0x12345005`다. 기본적인 사용자 데이터 쓰기가 이 보호에 막히면 Page Fault 오류 코드가 `0x7`일 수 있다. 오류 코드의 P는 보호 위반, W는 쓰기 접근, U는 사용자 접근을 나타낸다. **PTE의 0x5와 오류 코드의 0x7은 서로 다른 정보를 담는다.** COW 복구 여부는 앞의 SPT·Frame 조건까지 확인해 결정한다.

이 숫자는 최종 PTE에만 초점을 둔 예다. 실제 사용자 쓰기 권한은 상위 Page Table Entry에도 영향을 받으며, Supervisor 쓰기는 CR0.WP 등의 조건을 확인해야 한다. TLB에 유효한 변환 정보가 있으면 Page Walk를 다시 수행하지 않고 그 정보를 사용한다. 주소 폭·NX와 TLB, 권한 조합별 실행 예제는 [Paging의 기존 PTE·COW 판별 예제](/wiki/computer-systems-network-topic-dbd836d1a044/#오류-코드는-접근의-종류를-설명한다)에서 이어진다. PTE의 bit 63–12에는 NX처럼 주소가 아닌 비트도 있으므로, 물리 주소를 추출할 때는 주소 폭과 각 비트의 의미를 함께 확인해야 한다.

### 현재 학습 레포와 W11 작업본은 소유권을 다르게 기록한다

본문의 기본 코드 기준은 `lrn-pintos@5afaa6d`다. 비교한 W11 checkout은 `Jungle-12-303/wk11_7@09390dd`를 기준으로 하며, VM 관련 네 파일에 미커밋 변경이 있다. 아래에서 **W11 작업본**은 이 네 파일의 변경을 포함한 상태를 가리킨다.

`anon_copy()`, 타입별 `page_operations.copy`, `swap_slot_ref/unref`는 W11의 기준 커밋에 이미 있다. 로컬 변경은 여기에 `frame_owner/owners`와 대표 소유자 갱신, 모든 소유자의 매핑을 끊는 공유 Frame의 swap-out 처리를 더한다. [W11 기준 커밋의 anon_copy·슬롯 참조](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/anon.c)

| 확인 지점 | lrn-pintos@5afaa6d | W11 로컬 작업본, 09390dd 기반 |
|---|---|---|
| 상주 익명 Page 복제 | `supplemental_page_table_copy → spt_copy_cow_page` | 타입별 `page_operations.copy → anon_copy` |
| Frame의 공유 추적 | `ref_count`와 대표 `page/owner_thread` | `ref_count`, `owners` 목록과 대표 소유자 |
| 사본으로 이동 | 복사 뒤 기존 참조 수를 줄이고 `vm_remap_page` 호출 | 새 owner 추가·매핑 성공 뒤 기존 owner 제거 |
| 공유 Frame의 교체 | 참조 수가 1인 Frame만 교체 후보 | 소유자별 매핑을 추적하여 공유 익명 Frame의 swap-out 처리 |
| swap 상태의 복제 | 부모 swap 내용을 복사하는 분기를 이 코드에서 확인할 수 없음 | 같은 슬롯 정보를 복제하고 `swap_slot_ref`로 슬롯 참조 증가 |

현재 학습 레포는 상주 익명 Page를 위한 자식 SPT Entry를 만들고 부모와 자식의 PTE를 같은 Frame에 read-only로 연결한 뒤 `ref_count`를 증가시킨다. 쓰기 보호 위반은 `page_fault → vm_try_handle_fault → vm_handle_write_protect_fault → vm_handle_wp`로 이어진다. 주소와 SPT·Frame을 확인하고 `page->writable`이 true이면 `vm_handle_cow`가 복사와 재사용을 나눈다. not-present 접근은 Lazy·Swap·Stack의 준비 경로로 보낸다. [현재 fork·fault 처리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c), [예외 분류](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/exception.c)

`vm_copy_cow_page()`는 새 Frame을 얻고 `PGSIZE` 바이트를 복사한다. `vm_remap_page()`는 현재 매핑을 지운 뒤 새 Frame 또는 기존 Frame을 writable로 설치한다. 복구한 Page Fault에서 돌아오면 fault를 낸 명령을 다시 실행한다. 복사는 원래 내용을 보존하고, 재실행된 store가 새 Frame의 첫 바이트를 바꾼다. 설명용 주소 A=`0x12345000`, B=`0x23456000`을 쓰는 단순한 PTE 예라면 자식의 매핑은 `0x12345005`에서 `0x23456007`로 바뀐다.

W11 작업본의 `vm_frame_add_owner()`는 Page와 Thread를 담은 owner 항목을 추가하고 참조 수를 늘린다. `vm_frame_remove_owner()`는 해당 항목을 제거하고 대표 `page/owner_thread`를 남은 소유자로 갱신한다. Page를 파괴할 때도 해당 매핑과 owner를 먼저 제거하고, 참조가 남으면 Frame을 유지한다. Page 파괴로 마지막 참조가 사라지면 Frame도 해제된다. 이 owner 관리는 W11 작업본의 `pintos/vm/vm.c`와 `pintos/include/vm/vm.h`에 구현되어 있다.

W11의 `8712916`에서는 swap된 부모 Page를 fork할 때 자식 Page를 `vm_claim_page()`로 준비하고, 부모 슬롯의 데이터를 `disk_read()`로 읽었다. 다음 커밋 `f90c5d9`는 이 분기를 ANON 상태 복사와 `swap_slot_ref()`로 바꿨다. 이 변경으로 해당 Page의 데이터 읽기가 fork 이후의 접근 시점으로 미뤄졌다. [W11의 swapped Page 복제 변경](https://github.com/Jungle-12-303/wk11_7/commit/f90c5d9eb2913e17b396c59d23a257fe52e5f34c)

Slot 공유 대신 부모의 저장 데이터를 읽어 자식 전용 Frame이나 Slot에 보관하는 독립 복사도 설계할 수 있다. 이때 읽기 함수가 부모의 Slot 참조까지 반환하는지 확인해야 한다. 부모가 계속 사용할 저장 데이터를 먼저 해제하면 자식의 사본을 만드는 동안 원본을 잃을 수 있다. 부모를 먼저 Swap In한 뒤 Frame을 복사하는 방법도 있지만, 자식의 Frame을 확보하다가 다시 교체가 일어나면 방금 복원한 부모 Frame이 재사용될 수 있다. 따라서 복사가 끝날 때까지 원본 Frame의 수명을 보호하고, 도중에 실패하면 새로 확보한 Frame·Slot·Page를 정리하는 조건이 필요하다. 독립 복사의 I/O 비용뿐 아니라 추가 할당이 불러오는 교체와 실패 경로까지 함께 살펴야 하는 이유다. [Swap In의 참조 해제](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/anon.c#L114-L129), [Frame 할당과 교체](/wiki/computer-systems-network-topic-83f24986336f/#frame이-부족하면-기존-페이지를-내보낸다)

swap된 Page를 복제하는 `anon_copy()` 분기는 자식의 `operations`를 `anon_ops`에 연결한 뒤 `dst_page->anon = src_page->anon`을 수행한다. `struct page`의 union 안에는 `struct anon_page anon`이 값 필드로 들어 있으므로, 이 대입은 `swapped`와 `swap_idx` 값을 복사한다. 부모와 자식은 서로 다른 Page 객체를 가지면서 같은 슬롯 번호로 저장 데이터를 참조한다. 각 Page의 타입에 맞는 union 멤버를 읽는 기준은 [SPT의 Page 상태 관찰](/wiki/computer-systems-network-topic-aa5da5d73167/#gdb에서-두-상태를-나란히-확인한다)에서 확인할 수 있다.

W11 작업본의 공유 익명 Frame을 swap-out하면 내용을 슬롯 하나에 기록하고 소유 Page들에 같은 슬롯을 남긴다. 각 매핑을 끊은 뒤 Frame 공유 대신 슬롯 참조 수로 저장 데이터의 수명을 관리한다. 이미 swap된 Page를 fork할 때도 슬롯 참조가 하나 늘어난다. 나중에 각 Page가 claim·swap-in될 때는 별도 Frame으로 내용을 읽고 슬롯 참조를 줄이며, 마지막 참조가 사라져야 슬롯을 반환한다. 데이터 복사는 각 Page의 claim 시점까지 미뤄진다. [기준 커밋의 슬롯 수명 관리](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/anon.c)

공유 중인 resident Page를 읽는 동안에는 Frame을 그대로 사용하지만, swap된 Page에서는 유효한 읽기 접근도 not-present fault를 일으켜 별도 Frame으로 복원한다. 예를 들어 A와 B가 슬롯 5를 참조하던 중 B가 읽으면, B의 Page만 Frame에 올라오고 슬롯의 참조 수는 2에서 1로 줄어 A의 복구 데이터가 남는다. 한쪽의 참조 해제 뒤에도 슬롯을 유지하고 마지막 참조에서 반환하는 조건은 [Swap의 기존 수명 모델](/wiki/computer-systems-network-swap-11630540adf8/#cow의-frame-공유와-slot-공유)로 확인할 수 있다.

W11 기준 커밋의 Swap In은 Slot을 읽은 뒤 참조 수를 줄이고, 복원한 Page의 `swapped`와 `swap_idx`를 초기 상태로 돌린다. 그 Page를 다시 내보낼 때는 `swap_slot_alloc()`으로 빈 Slot을 확보한다. 다른 Page가 예전 Slot을 참조하는 동안에는 그 Slot의 Bitmap이 사용 중으로 남으므로, 새 내용이 다른 쪽의 복구 데이터를 덮어쓰지 않는다. 모든 참조가 사라진 뒤라면 같은 Slot 번호를 다시 사용할 수 있다. 번호 자체가 영구적으로 다른 것이 아니라, 살아 있는 참조의 데이터를 보존하는 것이 조건이다. 또한 `anon_copy()`의 Slot 공유 분기에 데이터 I/O가 없다는 관찰을 fork 전체의 I/O나 비용이 0이라는 결론으로 넓히지 않는다. [W11 Slot 할당과 참조 관리](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/anon.c#L59-L97), [복원 뒤 해제와 재할당](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/anon.c#L114-L150)

W11 작업본의 `anon_swap_out()`은 데이터를 저장한 뒤 `list_pop_front(&frame->owners)`로 owner 연결을 하나씩 꺼낸다. 각 Page에 `swapped=true`와 같은 `swap_idx`를 기록하고 `page->frame=NULL`로 바꾼 다음, 해당 PTE를 지우고 owner 객체를 해제한다. Page 객체는 SPT에 남아 슬롯 위치를 기억한다. 저장과 매핑 정리가 성공하면 `vm_evict_frame()`이 그 victim Frame을 반환해 다른 Page에 재사용하므로, `page->frame=NULL`은 이전 Page와 Frame의 연결이 끊겼다는 뜻이다.

이와 달리 현재 학습 레포의 swap 메타데이터는 `swap_slot/in_swap`이고, 공유 Frame은 교체 후보에서 제외한다. 앞의 VM 복제 경계에서 확인한 Lazy·Swap·VM_FILE의 제한도 그대로 적용된다. W11의 타입별 `file_copy()`·`uninit_copy()`는 소스에서 확인했으며, 파일·Lazy 복제의 실행 검증은 별도로 필요하다. [현재 교체 조건](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c), [W11의 타입별 분기](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/vm.c)

W11 기준 커밋은 `supplemental_page_table_copy()`에서 각 Page의 `operations->copy`를 호출한다. 현재 Operations가 `uninit_ops`이면 `uninit_copy()`로 들어가므로, 이 경로는 예정 타입을 조회한 뒤 `VM_UNINIT`과 비교하지 않는다. `aux`의 값과 파일 참조를 복제한 뒤 부모의 VA·쓰기 권한·예정 타입·Callback으로 자식 Page를 등록한다. `page_initializer`는 예정 타입에 맞춰 등록 함수가 다시 고른다. [W11 SPT 순회](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/vm.c#L472-L485), [타입별 Copy 호출](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/include/vm/vm.h#L77-L89)

다만 이 버전의 `uninit_copy()`는 `malloc()` 결과를 검사하지 않고 `memcpy()`에 넘긴다. 파일 재열기 실패 때는 새 `aux`를 해제하지만, Page 등록이 실패한 뒤 새 `aux`와 파일 참조를 정리하는 처리는 빠져 있다. `uninit_destroy()`도 비어 있어, 등록 뒤 초기화되지 않은 채 제거되는 Page의 남은 자원 정리를 보장하지 않는다. 따라서 타입별 Copy 함수가 연결되어 있다는 사실만으로 실패 경로나 전체 수명 관리까지 완성됐다고 볼 수 없다. [W11 UNINIT 복사와 Destroy](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/vm/uninit.c#L65-L99)

### PTE 갱신과 실패 경로도 함께 읽는다

`pml4_set_page(..., rw)`는 `rw`에 따라 W를 넣어 PTE를 기록한다. 이 함수 안에는 `invlpg`가 없다. `pml4_clear_page()`는 Present를 내리고 수정 대상이 현재 CR3의 주소 공간이면 해당 VA를 무효화한다. fork에서 부모 PTE를 read-only로 바꾸는 경로와 현재 프로세스의 COW 매핑을 clear/set하는 경로는 무효화 시점이 다르므로, 스케줄링 때의 CR3 변경까지 함께 읽어야 한다. 여기서 다루는 범위는 현재 CPU의 TLB 갱신까지다. [두 레포가 공유하는 PTE 설정 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c), [기존 TLB 설명](/wiki/computer-systems-network-topic-dbd836d1a044/#pintos의-세-경로를-구분한다)

새 Frame을 얻지 못하면 COW 함수는 false를 반환할 수 있다. 공유 Frame밖에 남지 않은 경우도 현재 학습 레포의 교체 제한에 걸린다. 또한 현재 코드는 기존 `ref_count`를 줄인 뒤 새 매핑을 시도하지만, W11 작업본은 매핑 성공 뒤 기존 owner를 제거한다. 매핑 실패 뒤 참조·매핑·할당 상태가 일관되는지 점검할 때는 이 순서 차이가 중요하다. 소유자가 먼저 종료하는 경우, 다중 fork, 메모리 부족과 매핑 실패는 단일 성공 사례와 별도로 검증해야 한다. [공유 Frame과 교체의 범위](/wiki/computer-systems-network-topic-163345dd1b02/#cow와-accessed-bit의-관찰-범위)

### cow-simple이 확인하는 것은 한 Page의 분리다

두 레포에서 같은 `tests/vm/cow/cow-simple.c`를 사용한다. 테스트는 fork 전 데이터의 앞부분을 확인하고 Frame 식별값을 저장한다. 자식에서는 첫 쓰기 전에 부모와 식별값이 같은지, `large[0] = '@'` 뒤에는 달라지는지 확인한다. 부모는 자식을 기다린 뒤 원래 식별값과 앞부분의 데이터를 유지하는지 확인한다. 이 절은 테스트 소스와 기대 파일을 바탕으로 설명한다. Kernel 테스트와 아래 GDB 명령은 이번 정리에서 실행하지 않았다. [cow-simple 소스](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/cow/cow-simple.c), [기대 출력](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/cow/cow-simple.ck)

`get_phys_addr()`는 `int 0x42`로 검사 handler를 호출한다. 이 구현은 `pml4_get_page()`가 반환한 Kernel VA에 `PTE_ADDR()`를 적용해 하위 offset을 지운 값을 돌려준다. 반환값의 주소 체계는 Kernel VA이며, 테스트는 이 식별값으로 두 매핑이 같은 Frame을 가리키는지 비교한다. 문자열 비교 범위는 `strlen("Lorem ipsum")`인 11바이트다. 이 테스트가 확인하는 범위는 한 Page의 Frame 분리와 그 앞부분의 데이터 보존이다. [검사 인터럽트](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/inspect.c), [주소 조회](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

x86-64 Linux용 PintOS Compiler와 QEMU 환경을 준비했다면 저장소 루트에서 다음 명령으로 해당 테스트를 실행할 수 있다.

```bash
make -C pintos/vm check TESTS=tests/vm/cow/cow-simple
```

GDB에서 현재 학습 레포는 `spt_copy_cow_page`, W11은 `anon_copy`를 공유 시작점으로 잡는다. 두 버전 모두 `vm_handle_wp`와 `vm_copy_cow_page`에서 복구와 실제 복사를 구분할 수 있다. 다음 명령은 유효한 Page 인자가 보이는 위치에서 Frame과 참조 수를 관찰할 때 사용한다.

```gdb
break vm_handle_wp
continue
p page
if page != 0 && page->frame != 0
  p/x page->va
  p page->writable
  p page->frame
  p page->frame->ref_count
end
```

먼저 Page와 Frame이 유효한지 확인한 뒤 필드를 읽는다. `page_fault()`의 원인 변수는 초기화된 줄에서 읽고, CR2의 fault 주소와 `f->rip`의 store 명령 주소를 구별한다. 복사 전 old Frame을 GDB 변수에 보관하고 새 Frame 할당·복사·매핑 뒤의 상태를 각각 읽는다. 지역 변수는 해당 함수가 실행 중일 때, Frame 포인터는 대상이 해제되기 전까지만 관찰에 사용할 수 있다.

### 줄어드는 것은 데이터 복사량이다

4KiB Page 10개를 부모가 계속 유지하고 자식이 그중 3개만 수정한다고 하자. 데이터 Frame만 세면 eager copy는 총 20개, COW는 공유 7개와 부모·자식 각각의 독립 Frame 3개씩으로 총 13개다. 80KiB와 52KiB의 차이인 28KiB는 이 가정에서의 계산값이다.

같은 가정에서 100개 중 10개만 쓰면 데이터 복사는 400KiB에서 40KiB로 줄어든다. 쓰기 없이 바로 exec하거나 종료하면 이 Page들의 사본을 만들지 않을 수 있다. Page Table·SPT·Thread·owner 객체의 생성과 관리, fault 처리에는 별도 비용이 든다. `100 × 8바이트`의 PTE 기록량과 `100 × 4096바이트`의 데이터 복사량은 서로 다른 작업의 양이므로, 전체 비용을 비교하려면 이 작업들과 나머지 관리 비용을 함께 측정해야 한다.

비교한 W11 작업본의 `struct list`는 두 `list_elem`을 담고 각 원소는 포인터 두 개를 가진다. 포인터와 `size_t`가 8바이트인 소스 배치를 가정하면 `owners`는 32바이트, `ref_count`와의 필드 합은 40바이트다. 16,384 Frame에 이 두 필드가 있다고 가정한 합은 640KiB이고, 별도로 owner 항목당 32바이트가 더 필요하다. 이 항목은 공유 수가 1인 Frame을 등록할 때도 생길 수 있다. 실제 전체 메모리 사용량은 allocator의 관리 비용과 다른 필드·자료구조까지 포함해 측정해야 한다. [W11 목록 구조](https://github.com/Jungle-12-303/wk11_7/blob/09390ddf168688d60a148c910dfe800e541b5368/pintos/include/lib/kernel/list.h)

### 다른 OS의 COW와 비교할 때

Linux v6.12의 `do_wp_page()`는 shared 매핑을 별도로 처리하고, private 익명 Page에서는 exclusive 상태와 folio 재사용 조건 등을 확인한다. 재사용 조건에는 참조 수와 매핑 수, 잠금·swapcache 상태 등이 함께 관여한다. 재사용할 수 없는 private Page는 `wp_page_copy()`로 이어진다. [Linux v6.12 쓰기 폴트](https://github.com/torvalds/linux/blob/v6.12/mm/memory.c#L3585-L3746)

KSM은 지정한 익명 영역에서 내용이 같은 Page를 찾아 쓰기 보호된 하나의 Page로 합치는 별도 기능이다. fork의 공유와 출발점은 달라도, 나중의 사적인 쓰기를 위해 분리할 필요가 있다는 점이 이어진다. PCID와 메모리 압축은 이와 목적과 동작 경로가 다른 기능이다. [Linux KSM](https://docs.kernel.org/6.12/admin-guide/mm/ksm.html)

Windows의 `FILE_MAP_COPY` View에 처음 쓰면 쓰는 프로세스의 사본이 생기고 원본 파일에는 그 변경을 쓰지 않는다. 여기서 다루는 것은 파일 View의 쓰기 정책으로, Unix식 fork와는 API 범위가 다르다. Windows 비교는 공식 `FILE_MAP_COPY` 계약을 기준으로 한다. 공유·private·읽기 전용 매핑의 정책과 기존 실행 예제는 [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/#같은-파일을-읽어도-쓰기의-의미는-달라진다)에 있다. [Microsoft FILE_MAP_COPY](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-mapviewoffile)

QEMU v10.0.0의 TCG는 Guest의 Page Table 권한을 계산하고, 거부된 사용자 쓰기를 보호 위반으로 전달한다. `PAGE_WRITE`가 허용되지 않은 경우의 분기와 오류 코드 P·W·U 조합이 여기에 있다. COW인지 판단하고 Frame을 복사하는 것은 Guest인 PintOS의 일이다. [QEMU 권한과 fault 구성](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c#L344-L490)

## 성공과 실패를 한 번씩 전달한다

부모는 `thread_create()`가 성공하면 자식 ID를 상태 객체에 넣고 `sema_down(&cs->fork_sema)`를 한 번 호출한다. 자식이 아직 결과를 알리지 않았다면 값 0에서 잠들고, 먼저 알렸다면 값 1을 소비하고 곧바로 진행한다. “초기값이 0이므로 부모는 반드시 Block된다”는 설명은 두 번째 순서를 놓친다.

자식은 성공 여부를 먼저 기록한 다음 `sema_up()`으로 알린다. 알림만 먼저 보내면 깨어난 부모가 아직 초기값인 `fork_success = false`를 읽을 수 있다. 부모에게 필요한 것은 결과 저장, 알림, 결과 읽기의 순서다.

| 실패 지점 | 현재 코드의 상태 정리와 알림 |
|---|---|
| 부모의 `child_status`·`fork_args` 할당 실패 | 부모가 가진 임시 객체를 정리하고 `TID_ERROR`를 반환한다. 생성된 자식이 없으므로 Semaphore에서 기다리지 않는다 |
| `thread_create()` 실패 | 부모가 `args`와 상태 항목을 정리하고 반환한다. 자식의 알림을 기다리지 않는다 |
| 자식의 PML4·SPT/PTE 복제 실패 | `error` 경로에서 실패를 알린 뒤 `thread_exit()`의 공통 정리를 거친다 |
| 자식의 fd 복제 실패 | helper가 이미 복제한 파일과 fd Table을 정리한다. 그 뒤 자식의 공통 실패 경로로 간다 |
| 실행 파일 복제 실패 | 자식의 실패 알림 뒤 공통 종료 경로가 이미 보유한 자원을 정리한다 |

자식의 일반적인 초기화 실패 경로는 다음 순서다.

```c
cs->exit_status = -1;
cs->exited = true;
cs->fork_success = false;
curr->self_status = NULL;
sema_up(&cs->fork_sema);
```

이후 자식은 `thread_exit()`로 부분적으로 만든 주소 공간과 파일을 정리한다. 부모는 false 결과를 읽고 자신의 목록에서 상태 객체를 제거해 해제한다. `curr->self_status = NULL`은 자식의 종료 정리가 부모가 회수할 상태 객체에 다시 접근하지 않게 하는 경계다. 앞의 [wait/exit 종료 알림](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에서 검토한 마지막 참조 문제와 비교할 수 있다.

따라서 현재 실패 경로를 “PML4·SPT를 모두 파괴한 뒤 실패를 통지한다”는 그림으로 바꾸면 호출 순서가 틀린다. 실패 알림을 받은 부모가 먼저 실행될 수 있고, 자식의 자원 정리는 그 뒤에 이어질 수 있다. 초기화 실패라는 결과와 모든 메모리 반환이 끝난 시점은 같다기보다 별도 사건이다.

정상 인자로 만들어진 자식에 대해서는 성공 또는 일반 초기화 실패 중 한 경로에서 알림 한 번이 필요하다. 다만 `__do_fork()` 앞부분의 NULL 인자 방어 경로는 바로 종료한다. 내부 호출 계약이 깨지는 경우까지 “어떤 실패에서도 반드시 알린다”고 단정하지 않는다.

첫 User 프로세스를 만드는 `process_create_initd()`에서는 명령줄용 Page, `child_status`, `initd_args`를 차례로 확보한다. `child_status`는 `args`를 할당하기 전에 부모 목록에 등록한다. 뒤의 할당이나 `thread_create()`가 실패해 `done`으로 오면, 확보한 `args`와 명령줄 Page를 반환하고 등록된 상태 항목을 제거해 해제한다. 아직 확보하지 않은 객체까지 해제하거나, 어느 실패 지점에서나 바로 반환하면 된다고 생각해서는 안 된다. [initd 생성과 실패 정리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L65-L133)

성공 경로에서는 `args->file_name`과 `args->cs`를 채워 `initd()`로 넘긴다. `initd()`는 상태 객체를 `self_status`에 연결하고 인자 객체를 해제한다. 명령줄 Page는 `process_exec()`가 `load()`의 결과를 받은 뒤 반환한다. 그 뒤에도 필요한 상태 객체의 수명과 해제 주체는 [부모의 wait와 부모·자식의 종료 순서](/wiki/computer-systems-network-topic-93ebb5bf7e48/)에 따라 따로 관리한다. 이 생성 단계의 회수만으로 전체 종료 경로가 안전하다고 결론 내릴 수는 없다. [initd의 인자 인계](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L139-L166), [명령줄 Page 반환](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L413-L461)

실패한 호출마다 4 KiB Page 한 장을 반환하지 않는다고 가정하면, 100회 누수량은 `4096 × 100 = 409600 B = 400 KiB`다. 이는 회수 누락이 누적되는 크기를 설명하는 계산이며, 실제 Kernel Pool 크기나 고갈 시점을 측정한 값은 아니다. 누수량을 판단할 때는 [용량과 실제 회수량의 차이](/wiki/computer-systems-network-topic-93ebb5bf7e48/)도 함께 확인한다.

### 실행 순서와 실패 지점을 바꿔 본다

다음 예제는 부모의 대기 순서와 네 초기화 단계의 실패를 바꿔 본다. 실제 Frame이나 fd를 할당하는 대신 소유 자원 이름을 기록한다. 성공할 때는 두 프레임의 `RAX`가 갈라지고, 실패할 때는 상태와 자식 자원의 회수 책임이 나뉘는 것을 확인한다.

```run-python
from dataclasses import dataclass

@dataclass
class Status:
    success: bool = False
    exited: bool = False
    exit_status: int = -1
    sema: int = 0
    signals: int = 0
    alive: bool = True


def fork_model(child_first, fail_at=None):
    stages = ["PML4", "주소 공간", "fd Table", "실행 파일"]
    cs = Status()
    resources = []
    parent_frame = {"rax": "SYS_FORK", "rip": 0x401122, "rsp": 0x7FFFFF00}
    child_frame = parent_frame.copy()
    self_status_attached = True
    log = []

    if not child_first:
        assert cs.sema == 0
        log.append("부모: fork_sema에서 BLOCKED")

    for stage in stages:
        if stage == fail_at:
            log.append(f"자식: {stage} 실패")
            break
        resources.append(stage)
    else:
        child_frame["rax"] = 0
        cs.success = True

    if not cs.success:
        cs.exited = True
        self_status_attached = False
    cs.sema += 1
    cs.signals += 1
    log.append(f"자식: 결과={cs.success} 기록 후 알림")

    assert cs.signals == 1 and cs.sema == 1
    cs.sema -= 1
    log.append("부모: 대기 없이 알림 소비" if child_first else "부모: 재개 후 알림 소비")
    parent_frame["rax"] = 17 if cs.success else -1

    if not cs.success:
        assert not self_status_attached
        cs.alive = False
        log.append("부모: 실패 상태 해제")
        resources.clear()
        log.append("자식: 부분 자원 정리, User 진입 없음")
        assert not resources
    else:
        assert parent_frame["rax"] == 17 and child_frame["rax"] == 0
        assert len(resources) == 4 and cs.alive
        log.append("자식: User 문맥 RAX=0, 부모 반환=17")

    assert cs.sema == 0
    print(f"자식 알림 먼저={child_first}, 실패 지점={fail_at}")
    print("  " + " → ".join(log))

for child_first in [False, True]:
    for fail_at in [None, "PML4", "주소 공간", "fd Table", "실행 파일"]:
        fork_model(child_first, fail_at)

# Thread 생성 자체가 실패한 경우에는 자식 알림을 기다리지 않는다.
created = False
print("Thread 생성 실패:", {"반환": -1, "down 횟수": int(created), "자식 알림": 0})
```

모델에서 fd 단계가 실패하면 해당 helper 내부의 부분 회수까지 끝났다고 취급한다. 실제 저장소에서는 `duplicate_fd_table()`의 `error` 경로와 `thread_exit()`의 공통 정리를 따로 추적해야 한다. 이 모델의 통과는 실제 메모리 부족 경로 전체의 무결성을 입증하지 않는다.

## 파일 복제가 의미하는 것을 테스트로 읽는다

`fork-read`는 부모가 파일의 처음 20바이트를 읽은 뒤 fork한다. 자식은 이어지는 부분을 읽고 User 버퍼를 바꾼 뒤 파일을 닫는다. 부모는 자식의 종료를 기다린 뒤 자신의 fd로 같은 나머지 부분을 읽어 원문과 비교한다. fd Table의 분리뿐 아니라 현재 위치 복사와 User 메모리의 독립성도 살펴보는 테스트다.

이 저장소에서는 부모와 자식의 `struct file.pos`가 각각 존재한다. Linux의 일반 fork는 같은 Open File Description을 가리켜 파일 offset을 공유하므로 이 차이를 구분해야 한다. 다음 예제는 PintOS 쪽의 별도 위치와 같은 파일 데이터 참조를 작은 모델로 표현한다.

```run-python
data = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
parent = {"data": data, "pos": 20, "closed": False}
child = parent.copy()

def read(handle, size):
    assert not handle["closed"]
    start = handle["pos"]
    result = handle["data"][start:start + size]
    handle["pos"] += len(result)
    return result

child_result = read(child, 6)
child["closed"] = True
assert parent["pos"] == 20 and not parent["closed"]
parent_result = read(parent, 6)
assert child_result == parent_result == b"KLMNOP"
assert parent["data"] is child["data"]
print("자식이 읽은 값:", child_result.decode())
print("자식을 닫은 뒤 부모가 읽은 값:", parent_result.decode())
print("같은 데이터 참조, 별도 위치와 닫힘 상태")
```

파일 객체의 수명과 fd 번호의 상세 규칙은 [File Descriptor](/wiki/pintos-file-descriptors/)에서 이어진다.

| 테스트 | 실제 소스의 확인 범위 |
|---|---|
| `fork-boundary` | Page 경계를 넘는 이름 문자열로 자식을 만들고, 자식의 종료 값 54를 부모가 받는지 확인한다 |
| `fork-read` | 부모·자식의 읽기 위치, 닫힘 상태, User 버퍼의 분리를 확인한다 |
| `fork-close` | 자식이 fd를 닫은 뒤에도 부모의 fd로 전체 내용을 읽을 수 있는지 확인한다 |
| `no-vm/multi-oom` | 재귀적으로 자식을 만들다가 실패하면 깊이를 전달한다. 이후 반복에서 도달 깊이가 줄어들지 않는지 확인한다 |

현재 `multi-oom`의 기준 상수는 10이다. 첫 실행 깊이를 구한 뒤 10회 더 반복하며, 각 반복의 깊이가 첫 값보다 작으면 실패한다. 파일 앞의 “최소 28개” 또는 “항상 같은 깊이”라는 오래된 주석보다 실제 상수와 `< first_run_depth` 조건을 기준으로 읽는다. 별도 비정상 종료 자식도 만들지만, 이 테스트 하나로 모든 실패 분기의 해제 횟수가 정확하다고 증명할 수는 없다.

`swap-fork`와 `page-parallel`은 자식이 fork 직후 새 프로그램을 exec하는 테스트다. `swap-fork`는 자식 10개가 `child-swap`을 실행하고 모두 0으로 종료하는지 확인한다. `child-swap`의 주석에는 5MB라고 쓰여 있지만, 실제 배열은 1 MiB이며 배열에 4 KiB 간격으로 한 바이트씩 256곳에 값을 쓰고 다시 비교한다. `page-parallel`은 자식 4개가 `child-linear`를 실행하게 하고, 각 자식은 1 MiB 버퍼를 암호화·복호화한 뒤 모든 바이트가 0인지 검사하여 `0x42`를 반환한다. 따라서 두 테스트가 통과해도 부모의 swapped Page를 자식이 exec 없이 직접 읽어 복제 내용을 확인했다고 볼 수는 없다. 실제 Swap In·Out 발생 여부와 Slot 소유권은 실행 설정과 해당 경로의 관찰로 따로 확인해야 한다. [swap-fork의 자식 실행](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/swap-fork.c#L10-L31), [child-swap의 검사 범위](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/child-swap.c#L12-L37), [page-parallel의 자식 수와 종료 값](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/page-parallel.c#L7-L25), [child-linear의 바이트 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/child-linear.c#L10-L35)

`child-swap`은 모든 자식에서 배열의 같은 위치 `i × PAGE_SIZE`에 같은 값 `(char)i`를 기록한다. 따라서 서로 다른 자식의 같은 위치를 잘못된 Page에 연결해도, 비교하는 바이트가 같다면 이 검사에서 오류가 드러나지 않을 수 있다. 자식별 격리 검사를 보강할 때는 프로세스마다 구분되는 데이터를 사용하고 각 SPT·Page·Slot의 대응도 함께 확인해야 한다. 이는 현재 테스트의 쓰기·비교식을 바탕으로 판단한 검사 한계이며, 잘못된 공유를 실제 Kernel에서 재현한 결과는 아니다. [child-swap의 쓰기와 비교](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/child-swap.c#L26-L36)

학습 레포의 `Make.tests`는 `swap-fork`에 `MEMORY=40`, `SWAP_DISK=200`, `TIMEOUT=600`을 지정한다. 이 테스트별 설정을 모든 실행의 기본값으로 일반화하지 않는다. [swap-fork의 실행 설정](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/Make.tests#L136-L138)

다음 명령은 x86-64 Linux의 PintOS Compiler와 QEMU 환경이 준비되었을 때 저장소 루트에서 실행할 수 있다. 여기서는 테스트 소스와 기대 파일을 읽었으며 Kernel 실행 결과를 새로 확인한 것은 아니다.

```bash
make -C pintos/userprog check \
  TESTS='tests/userprog/fork-boundary tests/userprog/fork-read
         tests/userprog/fork-close tests/userprog/no-vm/multi-oom'
```

성공 출력만으로 부모가 실제로 얼마나 오래 Block했는지까지 알 수 없다. 초기화의 각 실패 지점과 알림의 순서는 중단점이나 별도의 실패 주입으로 관찰해야 한다. [fork 테스트 소스](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog)

## Linux·Windows·QEMU에서의 생성 경계

Linux v6.12의 `kernel_clone()`은 호출한 쪽에서 `copy_process()`로 새 Task와 자원 관계를 준비한 뒤 `wake_up_new_task()`로 자식을 실행 가능하게 만든다. PintOS처럼 자식 Thread가 복제를 끝냈다는 Semaphore 알림을 부모가 기다리는 구조와는 다르다. Copy-on-Write는 데이터 Page의 복사를 늦추지만 Task와 Page Table 준비까지 없어지는 것은 아니다. “COW이므로 즉시 반환하고 동기화도 없다”는 표현은 생성 비용과 내부 보호를 지나치게 생략한다. [Linux 생성 경로](https://github.com/torvalds/linux/blob/v6.12/kernel/fork.c)

주소 공간을 복제할 때도 VMA와 PTE는 별도로 준비한다. Linux v6.12의 `dup_mmap()`은 복제 대상 VMA를 만들고 파일 매핑의 참조를 유지한다. `copy_page_range()`는 나중의 Fault로 올바르게 채울 수 있는 PTE의 복사를 생략할 수 있다. 이 판단은 단순히 부모가 아직 접근하지 않았는지가 아니라 `userfaultfd` 쓰기 보호, 특수 매핑 Flag와 `anon_vma` 상태 등을 확인한다. 자식의 후속 접근도 Page Cache를 사용할 수 있으므로, 독립 주소 공간을 만들었다고 파일 내용을 반드시 디스크에서 다시 읽는 것은 아니다. [Linux VMA 복제](https://github.com/torvalds/linux/blob/v6.12/kernel/fork.c#L663-L746), [PTE 복사를 생략하는 조건](https://github.com/torvalds/linux/blob/v6.12/mm/memory.c#L1328-L1369), [파일 매핑과 Page Cache](/wiki/computer-systems-network-topic-0a62f7f28b03/#linuxwindows와-qemu에서-대응되는-부분)

`kernel_clone()`의 `CLONE_VFORK` 경로는 별도의 Completion을 만들고 `wait_for_vfork_done()`으로 기다린다. 이것은 일반 fork의 생성 준비와 다른 대기다. Linux fork의 부모 반환은 자식 PID, 자식 반환은 0이며 실패는 부모에게 `-1`과 `errno`로 전달된다. fd는 복사되지만 해당 Open File Description의 offset과 상태 Flag를 공유한다. [Linux fork API](https://man7.org/linux/man-pages/man2/fork.2.html)

Windows의 `CreateProcessW()`는 실행 파일로 새 프로세스와 초기 Thread를 만든다. 부모의 실행 지점에서 같은 호출이 두 번 반환되는 fork 모델과는 다르다. 더구나 함수의 성공 반환이 새 프로그램의 초기화까지 모두 끝났음을 뜻하지 않는다. 필요한 DLL을 찾거나 초기화하는 데 뒤늦게 실패하면 새 프로세스가 종료될 수 있다. 따라서 PintOS의 `fork_success`를 모든 OS의 애플리케이션 준비 완료 신호로 대응시키지 않는다. [Microsoft CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)

QEMU의 TCG는 Guest의 System Call, 레지스터와 메모리 접근, 인터럽트와 장치 동작을 실행한다. `fork_success`라는 결과의 의미나 언제 부모에게 알릴지는 PintOS 코드가 결정한다. QEMU v10의 x86 System Call 경로는 `gen_SYSCALL()`과 `target/i386/tcg/system/seg_helper.c`의 `helper_syscall()`에서 확인할 수 있다. [TCG System Call 생성](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/emit.c.inc), [x86 System Call helper](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/seg_helper.c)

부모가 Block하면 PintOS의 스케줄러가 바로 다른 Thread를 선택할 수 있다. 자식 실행이 반드시 다음 Timer Tick까지 기다려야 하는 것은 아니다. 실제 하드웨어를 항상 결정적이라고 보거나 QEMU의 Timer가 항상 `icount`로만 정해진다고 비교하지 않는다. 명시적인 `icount` 설정, 가속 방식, 외부 입력과 부하를 확인하지 않은 타이밍 수치는 쓰지 않는다.

## GDB에서 초기화 결과를 확인한다

실제 Kernel 심볼을 사용하는 GDB에서 다음 진입점부터 시작한다.

```gdb
break process_fork
break __do_fork
break duplicate_fd_table
break duplicate_running_file
break do_iret
```

부모의 `process_fork()`에서 `cs`가 할당·초기화된 뒤 실제 소스 줄에 중단하고 관찰할 Semaphore를 고른다. 아래 명령은 그때 실행한다.

```gdb
set $cs = cs
set $fork_sem = &$cs->fork_sema
p $cs->tid
p $cs->fork_success
p $fork_sem->value
break sema_down if sema == $fork_sem
break sema_up if sema == $fork_sem
```

자식의 알림 직전에는 `curr->self_status->fork_success`, 지역 프레임 `if_.R.rax`, `curr->pml4`, `curr->fd_table`, `curr->running_file`을 확인한다. `do_iret()`에 들어간 뒤에는 함수의 프레임 포인터 인자를 기준으로 읽는다. 지역 변수의 이름과 생존 범위가 다른 지점에서 같은 명령을 재사용하지 않는다.

실패 경로에서는 `cs->exit_status = -1`, `cs->exited = true`, `fork_success = false`와 `curr->self_status = NULL`을 알림 전에 확인한다. 부모가 false 결과를 수거한 뒤에는 `$cs`를 더 읽지 않는다. `fork_args`도 자식이 초기에 해제하므로 이후에는 자식의 지역 `if_` 복사본을 관찰한다.

Linux 전용 GDB helper인 `$lx_current()`를 PintOS의 Thread 조회 함수처럼 쓰거나, 예전 파일 줄 번호를 그대로 붙여 넣지 않는다. `info line process_fork`, `list __do_fork`로 현재 소스 위치를 찾고 `thread_current()`와 실제 인자를 대응시킨다. 프레임과 구조체 크기는 `p sizeof(struct intr_frame)`, `p sizeof(struct fork_args)`로 같은 빌드에서 확인한다.
