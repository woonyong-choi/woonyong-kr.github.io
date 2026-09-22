---
layout: default
title: 시스템 콜
nav_order: 4
permalink: /wiki/computer-systems-network-topic-3cc26725c1cb/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-3cc26725c1cb
projection_sha256: 303b1bcafd28316ae26ebeb00cc8c0b2231a984cfd484f048c2ac7115c62c14a
parent: 사용자 프로그램
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63dd07ba6393
search_terms:
- syscall_handler
- SYSCALL
- RAX
- R10
- SYS_MMAP
- SYS_MUNMAP
- filesys_lock
- copy_in_string
- ABI
- SYSRET
- intr_frame
- LSTAR
- FMASK
- TSS
- RSP
- seccomp
- vDSO
grand_parent: PintOS
ancestor: CS 기초
---

# 시스템 콜
{: .no_toc }

사용자 프로그램이 파일에 쓰려면 커널에 파일과 장치 처리를 요청해야 한다. 시스템 콜은 이 요청의 번호·인자·반환값을 약속한 인터페이스다. 커널에 들어오는 CPU 명령과, 들어온 뒤 번호에 맞는 기능을 실행하는 Dispatch는 서로 다른 단계다.

PintOS의 `write(fd, buffer, size)`를 따라가면 사용자 Wrapper가 RAX에 번호 10을, RDI·RSI·RDX에 세 인자를 놓는다. `syscall3`의 3은 인자 개수다. `SYSCALL`이 `syscall_entry`로 진입하면 Assembly가 Kernel Stack으로 옮겨 Frame을 만든 뒤 `syscall_handler()`를 호출한다. [사용자 Wrapper](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/lib/user/syscall.c)

이 Wrapper의 inline asm 앞에는 `asm("rdi")`, `asm("rsi")`처럼 사용할 Register를 지정한 지역 변수 선언이 있다. `halt`는 인자가 없어 `syscall0`, `exit(status)`는 인자가 하나여서 `syscall1`, `mmap`은 다섯 인자를 넘기는 `syscall5`를 사용한다. 매크로 이름의 숫자와 RAX에 넣는 syscall 번호는 서로 다른 값이다.

## 커널은 MSR에 진입 규칙을 등록한다

LSTAR는 호출할 기능의 번호가 아니라 커널 진입 코드의 주소를 담는다. PintOS의 `syscall_init()`은 아래 세 MSR을 설정한다. MSR 번호는 `wrmsr`가 대상을 고르는 식별자이며, 프로그램이 읽고 쓰는 메모리 주소가 아니다. [PintOS의 MSR 설정](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall.c#L78-L100)

| MSR | 번호 | 이 PintOS에서 기록하는 값 |
|---|---|---|
| STAR | `0xc0000081` | `0x0013000800000000` |
| LSTAR | `0xc0000082` | `syscall_entry`의 주소 |
| SYSCALL_MASK, FMASK | `0xc0000084` | IF·TF·DF·IOPL·AC·NT를 합친 `0x47700` |

STAR의 값은 `((0x23 - 0x10) << 48) | (0x08 << 32)`로 계산한다. 상위 16 Bit가 `0x13`, 그다음 16 Bit가 `0x08`이다. 이 설정에서 진입할 Kernel CS·SS는 `0x08`·`0x10`, 정상적인 64비트 SYSRET으로 돌아갈 User CS·SS는 `0x23`·`0x1b`다. User SS는 User CS보다 8 작다. [Selector 상수](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/loader.h#L71-L83)

CPL은 현재 코드의 실행 권한 수준이며 CS의 하위 두 Bit로 확인할 수 있다. PintOS는 Kernel에서 0, User에서 3을 사용한다. Selector를 Table index·RPL로 나누는 실행 예제는 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/#실행-주소와-실행-권한)에 있다. 주소의 매핑과 접근 권한은 Page Table과 CPU의 보호 설정도 함께 확인해야 한다.

`write_msr()`는 ECX에 MSR 번호, EDX:EAX에 64비트 값을 나누어 놓고 `wrmsr`를 실행한다. 일반 사용자 코드에서 MSR을 임의로 바꾸는 API가 아니라 커널 초기화 코드다. Flag를 하나씩 조합하고 Mask 적용 결과를 보는 예제는 [CPU의 RFLAGS 설명](/wiki/computer-systems-network-cpu-4b05d739f0f6/#값의-크기와-flag를-함께-바꿔-보기)에서 이어진다. [write_msr 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/intrinsic.h#L123-L128)

## 진입 주소에 도착해도 스택은 아직 사용자 것이다

`SYSCALL`은 LSTAR에 등록한 코드로 제어를 넘기지만, 사용자 포인터를 검증하거나 `intr_frame`을 만들어 주지는 않는다. RCX에는 다음 명령의 RIP가, R11에는 복귀에 쓸 플래그가 남는다. 현재 RFLAGS에서는 FMASK가 지정한 비트를 지운다. RF를 제거하는 세부 동작과 STAR의 selector 설정은 [QEMU의 CPU 상태 전환](/wiki/computer-systems-network-qemu-b1366076be02/#cpu가-정한-상태-전환)에서 확인할 수 있다.

PintOS가 설정하는 FMASK는 IF·TF·DF·IOPL·AC·NT의 합인 `0x47700`이다. IF를 지워 일반적인 마스크 가능한 외부 인터럽트를 막은 상태에서 스택을 준비한다. 이것이 NMI까지 차단하거나 진입 코드 전체를 하나의 원자적 작업으로 만든다는 뜻은 아니다. 프레임을 쌓은 뒤에는 저장해 둔 사용자 IF를 확인하여 필요하면 `sti`를 실행한다. [MSR 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall.c), [진입 코드](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall-entry.S)

커널 스택의 시작 위치는 스케줄러가 `process_activate(next)`를 거쳐 `tss_update(next)`에서 기록한 `next + PGSIZE`다. 여기서 덧셈은 바이트 주소로 변환한 스레드 주소에 한 페이지를 더한다는 뜻이다. 진입 assembly는 사용자 RSP를 RBX에 잠시 보관하고, 전역 변수 `tss`가 가리키는 구조체를 역참조한 뒤 그 안의 `rsp0`를 RSP에 읽는다. `task_state`가 packed이고 첫 필드가 4바이트이므로 이 접근의 오프셋은 4다. 스레드에 저장된 `tf.rsp`를 읽는 경로와 구분해야 한다. [TSS 갱신](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/tss.c), [구조체 배치](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/userprog/tss.h)

RBX와 R12의 원래 값은 `temp1`·`temp2`라는 전역 임시 저장소에 보관했다가 프레임에 넣는다. 이 코드를 여러 CPU의 동시 진입에 그대로 사용할 수 있다고 가정할 수는 없다. 같은 임시 저장소를 공유하는 문제가 생기므로, 단일 CPU용 진입 코드의 설명 범위를 넘겨 SMP 안전성을 주장하지 않는다.

### 호출 인자와 복귀 정보는 프레임의 다른 칸에 있다

커널 스택의 초기 끝을 K라고 하면, C 핸들러 호출 직전 프레임의 시작은 `K - 0xc0`이다. 프레임 전체가 192바이트이기 때문이다. `call`이 그 뒤에 쌓는 C 함수의 복귀 주소는 이 192바이트에 포함하지 않는다. 다음 값은 실행 로그가 아니라 `write(1, "hi", 2)`를 설명하기 위한 배치 예다.

| 프레임 시작으로부터 | 필드 | 예에서 확인할 의미 |
|---|---|---|
| `0x40` | `R.rsi` | 사용자 문자열의 주소 |
| `0x48` | `R.rdi` | fd = 1 |
| `0x58` | `R.rdx` | size = 2 |
| `0x70` | `R.rax` | 진입 시 번호 10, 처리 뒤 반환값 |
| `0x98` | `rip` | SYSCALL 다음 사용자 명령 |
| `0xa8` | `eflags` | 복귀에 사용할 플래그 |
| `0xb0` | `rsp` | 저장한 사용자 스택 포인터 |

이 진입 경로는 일반 레지스터 칸인 `R.rcx`와 `R.r11`에 0을 넣는다. 복귀 RIP와 플래그를 찾으려면 각각 `rip`와 `eflags`를 읽어야 한다. `vec_no`·`error_code` 자리도 공간만 확보하므로 실제 예외 번호처럼 해석하지 않는다. 전체 필드 배치와 `do_iret()`의 복원 순서는 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에 있다. [프레임 선언](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/interrupt.h)

## 저장한 인자를 C 함수에 넘긴다

`syscall_entry`가 C 함수를 부를 때의 RDI는 `intr_frame *`다. 따라서 Handler 안에서 현재 CPU의 RDI를 fd로 읽으면 안 된다. 원래 사용자 번호와 인자는 `f->R.rax`, `f->R.rdi`, `f->R.rsi`, `f->R.rdx`에 저장되어 있다.

```c
case SYS_WRITE:
    f->R.rax = write (f->R.rdi,
                     (const void *) f->R.rsi,
                     f->R.rdx, f);
    break;
```

이것은 실제 Handler의 분기다. `write()`가 돌려준 값을 **저장된 RAX**에 대입하면, Assembly가 Frame을 복원할 때 사용자에게 전달할 RAX가 된다. 정상적으로 반환하는 호출은 `syscall_entry` 끝의 `sysretq`로 돌아간다. 이 경로에서 항상 `do_iret()`를 호출하는 것은 아니다. [Handler](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall.c), [진입·복귀 Assembly](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall-entry.S)

## 번호와 인자 규약

인자는 차례로 RDI, RSI, RDX, **R10**, R8, R9를 사용한다. System V AMD64 ABI를 따르고 정수나 포인터 인자 여섯 개를 받는 C 함수에서는 네 번째 인자가 RCX에 놓이므로 혼동하기 쉽다. `SYSCALL`이 RCX를 복귀 RIP 저장에 사용하므로, 이 시스템 콜 규약의 네 번째 인자는 R10이다.

Linux의 일반 함수 인자 규약과 시스템 콜 인자 규약을 이어 주는 코드에서도 호출 형태를 구분해야 한다. 이름이 정해진 wrapper의 네 번째 인자는 RCX에서 R10으로 옮길 수 있다. 반면 glibc 2.40의 `syscall(number, arg1, ..., arg6)`는 번호 자체가 첫 C 인자라 모든 위치가 한 칸씩 밀린다. 이 함수에서는 RDI의 번호를 RAX로, R8의 arg4를 R10으로 옮기고 arg6는 스택에서 읽는다. [일반 syscall 함수](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/unix/sysv/linux/x86_64/syscall.S), [이름별 wrapper 규약](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/unix/sysv/linux/x86_64/sysdep.h)

Linux의 커널 반환값과 libc가 애플리케이션에 주는 오류 표현도 다르다. 해당 glibc wrapper는 커널의 -4095부터 -1까지를 오류 범위로 검사하고, 오류 번호를 `errno`에 저장한 뒤 -1을 반환한다. PintOS의 wrapper에는 같은 변환이 없으므로 아래 표의 호출별 계약을 읽어야 한다. [glibc 오류 처리](https://github.com/bminor/glibc/blob/glibc-2.40/sysdeps/unix/sysv/linux/x86_64/sysdep.h)

다음은 `lrn-pintos`의 `9d1b14c` 커밋에 있는 번호와 Handler를 함께 읽은 결과다. 번호를 정의한 것과 기능을 구현한 것은 구별해야 한다.

| 번호 | 이름 | 인자 순서 | 현재 동작·반환 |
|---|---|---|---|
| 0 | `SYS_HALT` | 없음 | 시스템 전원 종료 |
| 1 | `SYS_EXIT` | status | 프로세스 종료, 원래 호출 위치로 돌아오지 않음 |
| 2 | `SYS_FORK` | thread_name | 부모는 자식 tid 또는 실패값, 자식은 0 |
| 3 | `SYS_EXEC` | cmd_line | 성공하면 새 프로그램으로 진입, 실패하면 `exit(-1)` |
| 4 | `SYS_WAIT` | tid | 자식 종료 상태 또는 -1 |
| 5 | `SYS_CREATE` | file, initial_size | 성공 여부 |
| 6 | `SYS_REMOVE` | file | 성공 여부 |
| 7 | `SYS_OPEN` | file | fd 또는 -1 |
| 8 | `SYS_FILESIZE` | fd | 파일 크기 또는 -1 |
| 9 | `SYS_READ` | fd, buffer, size | 읽은 바이트 수 또는 -1 |
| 10 | `SYS_WRITE` | fd, buffer, size | 쓴 바이트 수 또는 -1 |
| 11 | `SYS_SEEK` | fd, position | 파일 위치 변경 |
| 12 | `SYS_TELL` | fd | 위치 반환, 현재 구현은 잘못된 fd에서 0 |
| 13 | `SYS_CLOSE` | fd | 파일 Descriptor 닫기 |
| 14 | `SYS_MMAP` | addr, length, writable, fd, offset | VM 구현의 Mapping 주소 또는 NULL |
| 15 | `SYS_MUNMAP` | addr | VM Mapping 해제 |

`mmap`의 fd는 R10, offset은 R8에서 읽는다. 번호는 14와 15다. Handler의 두 `case` 자체는 존재하지만, `VM`을 끈 빌드에서는 `mmap()`이 NULL을 반환하고 `munmap()`은 Mapping 해제를 실행하지 않는다.

16–21은 CHDIR·MKDIR·READDIR·ISDIR·INUMBER·SYMLINK, 22는 DUP2, 23–24는 MOUNT·UMOUNT로 선언되어 있다. 이 번호에 대응하는 현재 Handler 분기는 없다. DUP2는 사용자 Wrapper도 있지만, Handler의 `default`는 `break`만 하므로 저장된 RAX가 그대로 반환될 수 있다. 이 값을 성공이나 정상적인 오류 반환으로 해석하지 않는다. [번호 정의](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/lib/syscall-nr.h)

### R10과 반환값을 확인하는 예제

아래 코드는 Register를 Dictionary로 표현해 인자 해석과 반환값 전달만 실행한다. 파일을 쓰거나 실제 시스템 콜을 호출하지 않는다. `frame["r10"]`과 RCX를 서로 다른 값으로 두면 네 번째 인자를 잘못 읽었을 때의 차이를 확인할 수 있다.

```run-python
from struct import pack, unpack

names = "HALT EXIT FORK EXEC WAIT CREATE REMOVE OPEN FILESIZE READ WRITE SEEK TELL CLOSE MMAP MUNMAP CHDIR MKDIR READDIR ISDIR INUMBER SYMLINK DUP2 MOUNT UMOUNT".split()
numbers = {name: i for i, name in enumerate(names)}
arg_registers = ("rdi", "rsi", "rdx", "r10", "r8", "r9")

frame = dict(rax=numbers["MMAP"], rdi=0x400000, rsi=8192, rdx=1,
             r10=3, r8=4096, r9=0, rcx=0x401234)
args = tuple(frame[reg] for reg in arg_registers[:5])
print(f"SYS_MMAP={frame['rax']}, args={args}")
print(f"fd from R10={args[3]}, saved RCX is not arg4={frame['rcx']:#x}")

frame = dict(rax=numbers["WRITE"], rdi=1, rsi=0x500000, rdx=5)
print(f"SYS_WRITE={frame['rax']}, fd={frame['rdi']}, size={frame['rdx']}")
frame["rax"] = 5  # 파일이나 장치에 쓰지 않고 반환값 전달만 표현한다.
print(f"user return RAX={frame['rax']}")

frame["rax"] = (1 << 64) - 1
signed_int = unpack("<i", pack("<I", frame["rax"] & 0xffffffff))[0]
print(f"error bits={frame['rax']:#x}, C int result={signed_int}")

frame["rax"] = numbers["DUP2"]
# 현재 PintOS의 default: break와 같이 결과를 대입하지 않는다.
print(f"unimplemented SYS_DUP2 returns unchanged RAX={frame['rax']}")
```

실행 결과:

```text
SYS_MMAP=14, args=(4194304, 8192, 1, 3, 4096)
fd from R10=3, saved RCX is not arg4=0x401234
SYS_WRITE=10, fd=1, size=5
user return RAX=5
error bits=0xffffffffffffffff, C int result=-1
unimplemented SYS_DUP2 returns unchanged RAX=22
```

같은 64비트 RAX도 반환형에 따라 해석이 달라진다. 예제는 -1의 비트 패턴을 C `int` 반환형으로 읽는 과정을 따로 보여 준다. 마지막의 22는 DUP2 성공값을 흉내 낸 것이 아니라, 결과를 쓰지 않는 현재 `default` 분기의 문제를 표현한 것이다.

RAX·EAX·AX는 독립된 저장소가 아니라 같은 Register의 서로 다른 범위다. EAX에 쓰면 RAX 상위 32 Bit가 0이 되는 규칙과 좁은 반환형의 해석을 구별해야 한다. 겹치는 범위와 값 변화는 [CPU의 Register 설명](/wiki/computer-systems-network-cpu-4b05d739f0f6/#같은-register의-다른-크기)에서 확인할 수 있다.

일반 함수의 반환값은 System V AMD64 ABI의 반환형 분류에 따라 전달된다. INTEGER 부분에는 RAX·RDX를, SSE 부분에는 XMM0·XMM1 등을 사용한다. MEMORY로 분류되면 호출자가 준비한 결과 공간의 주소를 RDI로 넘기고, 함수는 그 주소를 RAX로 돌려준다. 따라서 크기가 16바이트 이하인 구조체가 언제나 RAX:RDX로 반환된다고 판단할 수 없다. 크기뿐 아니라 필드의 타입과 ABI 분류를 함께 읽어야 한다. [AMD64 ABI의 반환형 분류](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/ab2062ad5653913c39124548943b1177330e34c8/x86-64-ABI/low-level-sys-info.tex#L746-774)

## 사용자 주소와 Kernel Buffer 사이

사용자가 선택할 수 있는 것은 커널이 제공한 요청 번호와 인자이며, LSTAR에 설정된 진입 주소를 호출마다 지정하는 것이 아니다. 이 제어 흐름과 메모리 접근 권한, 진입 후의 인자 검사를 함께 봐야 보호 경계를 설명할 수 있다. 예외나 하드웨어 인터럽트도 커널 진입을 일으키므로 시스템 콜만이 모든 커널 진입의 유일한 경로라고 설명하지 않는다. `read()`처럼 사용자 메모리에 데이터를 쓰는 호출은 RAX 외에도 결과를 전달한다.

포인터를 인자로 받았다고 해서 커널이 그 주소를 바로 안전하게 읽을 수 있는 것은 아니다. 버퍼는 여러 페이지에 걸칠 수 있고, 시작 주소가 유효해도 마지막 페이지가 없거나 쓰기 권한이 부족할 수 있다.

이 버전의 `is_user_vaddr()`는 `KERN_BASE`인 `0x8004000000`보다 작은 주소인지 판단한다. 이 범위 검사만으로 페이지의 실제 매핑이나 접근 권한이 확인되는 것은 아니다. [사용자 주소 판정](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/vaddr.h), [경계 상수](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/loader.h)

`NULL`도 수치상 `KERN_BASE`보다 작으므로 범위 비교 자체는 통과한다. 현재 `try_claim_user_addr()`는 그보다 먼저 NULL과 현재 Thread·PML4의 부재를 거부한다.

현재 `validate_user_buffer()`는 크기가 0이면 바로 돌아온다. 그 외에는 NULL을 거부하고, `uintptr_t`로 바꾼 시작 주소에서 계산한 마지막 바이트 주소 `start + size - 1`이 시작 주소보다 작아졌는지 확인한다. 이어 페이지 경계를 따라 `validate_user_addr()`를 호출한다. `write`의 입력 버퍼는 읽을 수 있어야 하고, `read`의 출력 버퍼는 쓸 수 있어야 한다. VM을 사용하는 경우에는 주소·권한과 함께 Lazy Page를 실제로 확보할 수 있는지도 검사한다.

`try_claim_user_addr()`는 NULL·현재 Thread·PML4와 User 주소 범위를 확인한 뒤, leaf PTE의 Present와 요청한 쓰기 권한을 검사한다. 이 함수의 검사가 CPU의 모든 단계 권한 검사를 대신하는 것은 아니다. VM 빌드에서 이미 Present인 페이지의 쓰기가 거부되면 쓰기 보호 복구를 시도한다. 그 밖의 주소는 SPT의 페이지를 claim하거나 Stack 성장 조건을 검사하며, 준비 뒤에는 접근 가능 여부를 다시 확인한다. 준비에 실패하면 `validate_user_addr()`가 `exit(-1)`로 이어진다. `check_address()`는 같은 검사에 `write=false`, `f=NULL`을 전달한다. VM helper의 직접 호출과 실제 #PF, 호출 전의 RSP 조건은 [페이지 폴트의 사전 준비 경로](/wiki/computer-systems-network-topic-5cebdbc10ddf/#syscall이-보관한-rsp와-실제-폴트를-구별한다)에서 구분한다. [현재 주소 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c#L444-L529)

`copy_in()`과 `copy_out()`은 페이지 경계에서 복사 크기를 끊고 다음 페이지를 다시 확인한다. 파일 이름이나 명령 문자열은 `copy_in_string()`이 종료 문자를 찾아 Kernel Page에 복사한다. 복사한 문자열과 종료 문자가 한 커널 페이지에 들어와야 하므로, 4KiB 페이지에서는 종료 문자 이전 최대 길이가 4,095바이트다. 원래 사용자 문자열이 페이지 경계를 넘을 수 없다는 뜻은 아니다. 이 제한은 모든 OS의 문자열 길이 제한이 아니라 해당 구현의 선택이다.

파일 연산에는 `filesys_lock`이 사용되지만 시스템 콜 전체를 하나의 Lock으로 감싼 구조는 아니다. 현재 `write()`는 사용자 데이터를 Kernel Buffer로 복사한 뒤 파일 쓰기 구간에 Lock을 건다. `read()`는 파일에서 Kernel Buffer로 읽는 구간의 Lock을 푼 다음 사용자 버퍼에 복사한다. 표준 입력 fd 0과 표준 출력 fd 1에도 별도 경로가 있다. 따라서 사용자 페이지 확보와 장치 대기를 모두 전역 Lock 안에서 처리한다고 설명하면 실제 순서와 달라진다.

각 호출의 오류 처리도 확인할 필요가 있다. 현재 `read()`와 `write()`는 크기가 0이면 0을 반환하고, 유효하지 않은 파일 fd와 메모리 할당 실패 등은 각 경로의 실패값으로 처리한다. 이미 일부 바이트를 처리한 뒤 다음 조각에서 실패하면 일부 처리량을 반환할 수 있다. 사용자 주소 자체를 검증하지 못한 경로는 `exit(-1)`로 이어진다. [버퍼 검사·복사·파일 I/O 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall.c)

테스트의 이름만으로 실패 원인을 정하지 않는다. `bad-read.c`와 `bad-write.c`는 사용자 코드에서 NULL을 직접 읽고 쓰며, Kernel 주소 `0x8004000000`에 접근하는 것은 `bad-read2.c`와 `bad-write2.c`다. 이 네 테스트의 `.ck`는 `exit(-1)`을 기대한다. 반면 `open-bad-ptr.c`는 `0x20101234`를 파일 이름으로, `read-bad-ptr.c`는 `0xc0100000`을 123바이트 출력 버퍼로 전달한다. 두 값은 이 PintOS의 `KERN_BASE`보다 작으므로 Kernel 주소 차단만으로 설명할 수 없다. 또한 두 `.c`의 의도와 달리 `.ck`에는 정상 종료 출력도 허용되어 있다. 테스트 통과 여부만으로 어떤 포인터 검사가 실행됐는지 단정하지 말고, 소스와 허용된 출력, 실제 호출 경로를 함께 확인한다. 이는 테스트 파일을 대조한 결과이며 새 실행 기록은 아니다. [포인터 테스트와 기대 출력](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog)

경계를 넘는 정상 버퍼는 `read-boundary`와 `write-boundary`에서 다룬다. `boundary.c`는 8,192바이트 정적 배열 안에서 양쪽에 최소 2,048바이트의 수정 가능한 공간이 있는 페이지 경계를 고른다. 두 테스트는 그 경계에 걸치도록 sample을 읽을 버퍼나 쓸 문자열을 배치한다. `read-boundary.c`는 반환 크기와 읽은 내용을 확인하고, `write-boundary.c`는 반환 크기를 확인한다. 두 `.ck`는 정상 종료 `exit(0)`을 기대한다. 이것은 정상 범위의 경계 통과를 확인하는 테스트이며, 뒤쪽 페이지가 유효하지 않거나 쓰기 권한이 없는 입력까지 차단한다는 증거는 아니다. [경계 입력과 read/write 테스트](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog)

쓰기 권한은 `pt-write-code2`가 별도로 다룬다. 이 테스트는 `read(handle, (void *) test_main, 1)`로 코드 주소에 한 바이트를 쓰도록 요청하며, `.ck`는 `exit(-1)`을 기대한다. User Buffer에 쓰는 쪽이 `read()`라는 점을 확인하는 사례다. 현재 주소 검사에서 거부될 수도 있으므로 이 종료값만으로 실제 Kernel Page Fault가 발생했다고 판단하지 않는다. 코드 Page의 쓰기 거부와, 논리적으로 쓰기를 허용한 COW Page의 복구도 구분해야 한다. 이 비교는 테스트 소스와 기대 출력의 검토이며 새 테스트 실행 기록은 아니다. [코드 주소로 read 요청](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-write-code2.c), [기대 종료값](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-write-code2.ck)

접근 전 검사와 접근 중 Fault 복구는 함께 사용할 수 있다. 검사 뒤 다른 Thread가 Mapping이나 접근 권한을 바꿀 수 있으므로, 앞서 통과한 검사가 이후 접근의 성공을 보장하지 않는다. Fault를 처리할 수 있다는 사실도 복사 도중의 버퍼 내용 변경을 막거나 일관된 Snapshot을 보장한다는 뜻은 아니다. 메모리 접근 실패를 다루는 일과 데이터의 동시 변경을 다루는 일은 구분해야 한다. [접근 중 변경과 예외 처리](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/using-neither-buffered-nor-direct-i-o)

현재 PintOS를 단일 CPU라는 이유만으로 경쟁 상태가 없는 구현이라고 설명할 수도 없다. 진입 Assembly는 저장된 IF가 켜져 있으면 C Handler를 호출하기 전에 `sti`를 실행한다. 파일 I/O의 Lock도 사용자 주소 검사·복사 전체를 하나로 묶지 않는다. 따라서 ‘시스템 콜에서는 항상 인터럽트를 끄므로 검사 뒤 주소가 변하지 않는다’는 전제는 이 코드와 맞지 않는다. 이는 소스의 순서를 확인한 것이며, 실제 경쟁 상태를 재현했다는 주장은 아니다. [조건부 인터럽트 복원](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall-entry.S#L41-L47)

Linux와 비교할 때도 범위 판정과 실제 복사를 나누어 읽는다. v6.12 x86-64의 `__access_ok()`는 `USER_PTR_MAX`를 기준으로 주소를 검사한다. 컴파일 때 알 수 있는 Page 크기 이하의 요청은 Guard Page를 전제로 크기 검사를 줄이고, 그 밖의 경로는 주소와 크기의 합이 사용자 범위를 넘거나 정수에서 되감기지 않았는지 확인한다. 이를 단순한 `주소 + 크기 <= 상한`으로 옮기면 Overflow 조건을 잃는다. 검사를 통과했다는 사실만으로 모든 Page의 Mapping과 권한이 확인되는 것도 아니다. [x86-64의 범위 검사](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/uaccess_64.h#L55-L107)

같은 버전의 `copy_from_user()` 경로에는 조건 분기 대신 포인터를 Masking하는 경로도 있으므로, 모든 복사가 `access_ok()`를 정확히 한 번 호출한다고 그릴 수는 없다. `copy_from_user()`와 `copy_to_user()`의 반환값은 **복사하지 못한 바이트 수**다. 이 함수를 호출한 쪽이 실패를 판단하므로 반환값을 곧바로 `-EFAULT`와 동일시하지 않는다. 일반 `copy_from_user()`는 짧게 복사한 경우 목적지의 남은 부분을 0으로 채우지만, `__copy_from_user()` 같은 하위 변형까지 같은 동작을 보장하지는 않는다. [User Copy의 반환값과 분기](https://github.com/torvalds/linux/blob/v6.12/include/linux/uaccess.h#L43-L231)

실제 x86 복사 경로의 `copy_user_generic()`에는 `stac()`·`clac()`과 Exception Table 항목이 함께 있다. 전자는 지원되는 SMAP 기능에 맞춰 의도한 User 메모리 접근 구간을 열고 닫으며, 후자는 복사 중 예외를 처리할 복구 지점을 연결한다. 범위를 미리 검사하는 것과 실패한 접근에서 복구하는 것은 별개의 역할이다. [복사 명령과 예외 복구 지점](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/uaccess_64.h#L114-L149), [SMAP 조건부 명령](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/smap.h#L30-L40)

Windows Driver의 `ProbeForRead()`는 길이가 0이 아닐 때 사용자 주소 범위와 시작 주소의 정렬을 검사하고, 잘못된 입력에는 예외를 발생시킨다. 길이가 0이면 주소 검사도 하지 않는다. 검사 뒤 다른 Thread가 Mapping이나 보호 속성을 바꿀 수 있으므로, Probe뿐 아니라 뒤따르는 실제 접근도 `try/except` 안에서 처리해야 한다. `ProbeForWrite()`는 각 Page에 접근하고 쓰는 추가 효과가 있어 현재 공식 문서는 새 코드에 사용하지 말고 `ProbeForRead()`를 쓰도록 안내한다. 검사를 통과했다고 메모리를 고정하거나 이후의 쓰기 성공까지 보장한 것은 아니다. [ProbeForRead의 검사와 예외 처리](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-probeforread), [ProbeForWrite의 현재 사용 지침](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-probeforwrite)

Windows의 드라이버 I/O에서는 버퍼를 전달하는 방식도 구분한다. Buffered I/O는 별도의 nonpaged System Buffer를 만들고 사용자 버퍼와 데이터를 복사한다. Direct I/O는 사용자 버퍼의 페이지를 고정하고 MDL로 기술한다. Neither Buffered Nor Direct I/O는 원래 User VA를 전달하므로, 드라이버는 I/O를 요청한 Thread의 문맥에서 사용자 주소의 유효성과 접근 중 예외를 직접 다뤄야 한다. 모든 IRP가 같은 방식으로 버퍼를 전달하거나, Probe 호출 뒤 항상 페이지 고정까지 끝난다고 볼 수 없다. [버퍼 전달의 세 방식](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/methods-for-accessing-data-buffers), [Neither I/O의 문맥과 접근 조건](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/using-neither-buffered-nor-direct-i-o)

## 같은 write라도 표준 출력과 파일의 끝은 다르다

`write(1, "Hello", 5)`의 fd 1은 콘솔 경로다. 현재 구현은 검증한 사용자 데이터를 최대 한 페이지씩 커널 버퍼에 복사하고, `filesys_lock` 안에서 `putbuf()`를 호출한다. 일반 파일 fd는 같은 분기에서 `process_get_file()`로 파일을 찾은 뒤 `file_write()`로 이어진다. 따라서 표준 출력 예를 그대로 “파일 시스템을 거쳐 디스크까지 내려가는 호출”이라고 읽으면 안 된다. [두 경로의 분기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall.c)

파일에 쓰는 경우 `file_write()`는 `inode_write_at()`의 실제 처리량만큼 파일 위치를 전진시킨다. 이 버전의 inode 구현은 파일을 자동으로 늘리지 않으며, 파일 끝이나 쓰기 금지, 버퍼 할당 실패 때문에 요청보다 적게 쓸 수 있다. 5바이트를 쓴다는 요청이 항상 반환값 5를 보장하는 것은 아니다. [파일 위치 갱신](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/filesys/file.c), [inode 쓰기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/filesys/inode.c)

앞서 사용한 4,096바이트짜리 커널 페이지와 디스크의 512바이트 섹터는 다른 단위다. `inode_write_at()`은 섹터의 일부만 바꿀 때 기존 섹터를 임시 버퍼에 읽고 필요한 부분을 덮어쓴 뒤 섹터 전체를 기록한다. `disk_write()`는 채널 잠금을 잡고 섹터 선택, PIO 쓰기 명령, 준비 상태 확인, `output_sector()`, 완료 semaphore 대기 순으로 진행한다. `output_sector()`의 `outsw`는 16비트 값 256개를 전달한다. 이 소스 경로를 확인한 것만으로 전원 장애 뒤 영속성이나 실제 장치에서의 처리 시간을 검증한 것은 아니다. [디스크 쓰기와 PIO](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/devices/disk.c)

## 돌아오는 호출과 실행을 바꾸는 호출

`fork()`는 사용자에게 받은 Thread 이름을 Kernel Buffer로 복사하고, 저장된 Frame을 `process_fork()`에 전달한다. 자식의 실행 문맥을 준비하는 과정은 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)의 Frame 복사와 연결된다.

커널의 `exec()`는 문자열을 복사한 뒤 `process_exec()`를 호출한다. 적재에 성공하면 새 사용자 프로그램으로 넘어가므로 기존 `exec()` 호출 지점으로 돌아오지 않는다. 현재 커널 구현은 실패했을 때도 -1을 사용자에게 반환하는 대신 `exit(-1)`을 호출한다. `exit()` 역시 프로세스 종료 경로로 들어간다. 이 차이를 빼고 모든 분기의 끝을 “RAX 저장 후 사용자 복귀”로 그리면 실제 동작을 놓친다.

정상 복귀 assembly는 일반 레지스터들을 꺼낸 뒤, 프레임의 `rip`를 RCX에, `eflags`를 R11에, 사용자 `rsp`를 RSP에 옮겨 `sysretq`를 실행한다. SS 칸은 직접 pop하지 않는다. `pop %rsp`가 가리키는 스택 자체를 바꾸므로 “프레임 시작에서 총 184바이트 위치까지 읽는다”는 계산을 사용자 RSP에 184를 더한다는 뜻으로 읽지 않는다. 64비트 SYSRET의 사용자 CS·SS는 STAR 설정에서 정해진다. [정상 복귀 순서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall-entry.S)

성공한 `exec`의 새 문맥이나 `fork` 자식의 복제 문맥은 이 PintOS에서 `do_iret()`로 진입한다. 이는 커널이 선택한 구현 경로이지, SYSRET이 반드시 직전 SYSCALL의 이력을 확인한다는 뜻은 아니다. Linux v6.12가 SYSRET을 허용하는 RIP·플래그·selector 조건과 IRET 복귀는 [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에서 구분한다. signal이나 ptrace라는 이름만으로 언제나 IRET을 사용한다고 단정하지 않는다.

복귀 주소의 canonical 여부도 단순히 최상위 비트 하나와 bit 47만 비교해서는 안 된다. 48비트 주소 형식에서는 bit 63:48이 모두 bit 47과 같아야 하며, 57비트 형식에서는 bit 63:57이 모두 bit 56과 같아야 한다. 예를 들어 `0x0000800000000000`은 48비트 형식에서 조건을 만족하지 않는다. 이 PintOS의 복귀 assembly에는 Linux와 같은 검사와 fallback 분기가 보이지 않는다. ptrace가 없다는 이유만으로 모든 입력에서 안전하다고 결론 낼 근거는 되지 않는다. [canonical 주소 판정](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/page.h), [Linux v6.12의 진입·복귀 코드](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/entry_64.S)

진입 때의 FMASK와 복귀 때의 플래그 복원을 혼동하지 않는다. QEMU v10.0.0의 `helper_sysret()`는 R11과 복원 마스크를 사용하며 FMASK를 다시 적용하지 않는다. 이 함수는 `target/i386/tcg/seg_helper.c`에 있고, `helper_syscall()`은 `target/i386/tcg/system/seg_helper.c`에 있다. 두 명령의 고정 사이클 수나 마이크로 연산 수는 이 코드만으로 정할 수 없다. [QEMU의 SYSRET 구현](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/seg_helper.c#L996-L1049)

TCG 번역 코드의 `gen_SYSCALL()`·`gen_SYSRET()`는 각각 helper 호출을 생성하며, 실행 시 helper가 Guest CPU 상태를 바꾼다. Guest의 `wrmsr`로 설정한 STAR·LSTAR·FMASK 값 역시 Guest 상태에 저장된다. 이 TCG 구현 설명을 KVM 실행이나 모든 물리 CPU의 상세 동작·성능과 동일시하지 않는다. [명령 번역](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/emit.c.inc#L3797-L3838), [Guest MSR 저장](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/misc_helper.c#L181-L209)

## Dispatch 방식은 구현과 버전으로 확인한다

번호·인자·반환값의 약속을 바꾸면 기존 바이너리가 다른 요청을 하거나 결과를 잘못 읽을 수 있다. 이 ABI 호환성 때문에 내부 구현을 바꾸는 일과 사용자에게 보이는 계약을 바꾸는 일은 구분해야 한다.

번호와 구현 함수를 연결할 때는 함수 포인터 배열이나 `switch` 등을 사용할 수 있다. 그러나 배열이 소스에 존재한다는 사실만으로 현재 진입 경로가 그 배열을 호출한다고 결론 낼 수는 없다.

이하의 Linux 비교는 LSTAR와 SYSRET을 사용하는 기존 x86-64 진입 경로를 기준으로 한다. Linux v6.12의 `syscall_init()`은 FRED가 활성화되지 않았을 때 `idt_syscall_init()`을 호출하고, 이 함수가 LSTAR에 `entry_SYSCALL_64`를 등록한다. FRED가 활성화된 경우에는 다른 진입점과 복귀 명령을 사용하므로 같은 순서를 적용하지 않는다. 이 버전의 FMASK에는 PintOS의 여섯 Flag 외에 CF·PF·AF·ZF·SF·OF·RF·ID도 들어 있다. [Linux v6.12의 진입 설정과 FRED 분기](https://github.com/torvalds/linux/blob/v6.12/arch/x86/kernel/cpu/common.c#L2036-L2085)

Linux v6.12의 x86-64 경로는 `do_syscall_64()`에서 `x64_sys_call()`로 이어지고, 후자는 생성된 `case`를 넣은 `switch`를 사용한다. 같은 파일의 `sys_call_table[]`은 Trace용 주소 조회에 남아 있다. 번호 자료도 `asm-offsets.h`의 구조체 Offset과 구분해야 한다. [x86-64 진입 처리](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/common.c), [v6.12 Dispatch](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/syscall_64.c)

이 경로의 `__x64_sys_*`는 `const struct pt_regs *` 하나를 받는다. `SC_X86_64_REGS_TO_ARGS`가 저장된 `di·si·dx·r10·r8·r9` 필드를 인자로 풀어 `__se_sys_*`에 넘기고, 타입 변환을 거쳐 `__do_sys_*`의 본문으로 이어진다. 저장된 `regs->r10`이 이후 C 함수의 네 번째 인자가 되는 과정이다. 중간 함수가 실제 호출로 남는지, 어느 Register에 값을 읽는지는 컴파일 결과에 따라 달라진다. [Linux v6.12의 syscall Wrapper](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/syscall_wrapper.h#L12-L55)

ABI의 번호는 OS와 아키텍처별로 다르다. Linux x86-64의 read와 write 번호는 각각 0과 1이지만, 이 PintOS에서는 9와 10이다. [Linux의 번호 정의](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/syscalls/syscall_64.tbl#L12-L13) QEMU의 system emulation은 Guest 커널 대신 그 번호 체계를 정하지 않으며, Host 서비스를 호출하는 user emulation의 syscall 변환과도 구별된다.

Linux v6.12의 진입 assembly는 `swapgs`로 CPU별 자료에 접근하고 사용자 RSP를 `TSS_sp2`에 임시 저장한 뒤 `pcpu_hot.X86_top_of_stack`에서 커널 RSP를 읽는다. 이 순서를 PintOS의 `tss->rsp0` 읽기와 같은 코드로 그리지 않는다. PTI가 활성화된 환경에서는 진입·복귀 때 사용자용과 커널용 페이지 테이블도 전환한다. CPU 명령이 자동으로 스택과 CR3를 모두 바꾸는 것은 아니다. [v6.12 진입 assembly](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/entry_64.S), [PTI의 적용 조건](https://docs.kernel.org/6.12/arch/x86/pti.html)

이 진입 코드가 `pt_regs`를 만들 때 원래 RAX의 번호는 `orig_ax`에 따로 저장한다. 반환용 `ax`에는 우선 `-ENOSYS`를 놓으므로, 저장된 원래 번호와 사용자에게 돌려줄 값은 같은 필드가 아니다. PintOS의 `intr_frame`에는 이 `orig_ax` 필드가 없으며 현재 Handler는 번호를 읽은 `f->R.rax`에 반환값을 쓴다. [Linux v6.12의 번호 보존과 반환값 초기화](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/entry_64.S#L100-L109)

두 구조체의 크기도 다르다. Linux v6.12의 x86-64 `pt_regs` 선언은 8바이트 칸 21개로 168바이트다. PintOS의 `gp_registers`는 120바이트이고, 이를 포함하는 `intr_frame` 전체는 앞서 살펴본 192바이트다. 구조체 이름만 보고 같은 배치나 Offset을 적용하면 다른 필드를 읽게 된다. [Linux의 `pt_regs` 선언](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/ptrace.h#L97-L160)

번호를 dispatch하기 전에는 설정과 실행 상태에 따라 tracing·audit·seccomp가 개입할 수 있다. seccomp는 번호·아키텍처·직접 전달된 인자 등을 기준으로 호출을 걸러 노출되는 기능을 줄이지만, 포인터가 가리키는 데이터를 검증하는 일을 대신하지는 않는다. [진입 부가 처리](https://github.com/torvalds/linux/blob/v6.12/kernel/entry/common.c), [seccomp 필터의 범위](https://docs.kernel.org/6.12/userspace-api/seccomp_filter.html)

또한 새 기능마다 새 syscall 번호가 필요한 것은 아니다. 기존 `ioctl()`에 장치별 명령을 추가하는 인터페이스도 있다. `gettimeofday` 같은 일부 시간 조회는 vDSO의 사용자 문맥 구현을 이용할 수도 있으므로, 라이브러리 함수를 한 번 불렀다고 항상 커널에 진입한 것으로 세지 않는다. [ioctl 인터페이스](https://docs.kernel.org/6.12/driver-api/ioctl.html), [x86 vDSO 시간 함수](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/vdso/vclock_gettime.c)

## Handler에서 관찰할 값

아래는 실제 세션의 출력이 아니라, Debug Symbol이 일치하는 Guest에 연결한 뒤 사용할 관찰 절차다. 먼저 진입 첫 명령에서 멈추면 CPU가 남긴 값과 assembly가 바꿀 값을 분리할 수 있다.

```gdb
tbreak *syscall_entry
continue
set $user_sp = $rsp
set $return_ip = $rcx
set $return_flags = $r11
info registers rax rdi rsi rdx r10 r8 r9 rcx r11 rsp
```

이 시점에는 아직 완성된 프레임 포인터 `f`가 없다. RSP는 사용자 스택이고 RCX는 사용자 복귀 주소다. 이어서 C 핸들러의 첫 명령에서 프레임 포인터를 보관한다.

```gdb
tbreak *syscall_handler
continue
set $call = (struct intr_frame *)$rdi
p/d $call->R.rax
p/x $call->R.rdi
p/x $call->R.rsi
p/x $call->R.rdx
p/x $call->R.r10
p/x $call->R.r8
p/x $call->rsp
```

WRITE 호출만 관찰하려면 위 `tbreak *syscall_handler` 명령 뒤에 `if ((struct intr_frame *)$rdi)->R.rax == 10`을 붙인다. Buffer 내용은 저장된 RSI가 가리키는 주소의 매핑과 요청한 크기를 확인한 뒤 읽는다. `fork`의 부모와 자식이 서로 다른 RAX를 받는 과정은 [프로세스 생성의 Frame 전달](/wiki/computer-systems-network-topic-4af2e32913a4/#부모의-user-문맥을-자식에게-전달한다)에서 이어서 살펴볼 수 있다. [GDB의 Breakpoint 조건](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Conditions.html)

먼저 번호를 확인한 뒤 그 호출에서 의미가 있는 인자만 해석한다. 반환값 대입문을 지난 위치에서는 같은 Frame의 RAX를 다시 읽는다. `exec()`나 `exit()`처럼 복귀하지 않는 호출에 무조건 `finish`를 적용하지 않는다. `validate_user_buffer`, `copy_in_string`, `filesys_lock`의 획득·해제 위치도 함께 살피면 주소 검증과 파일 연산의 순서를 확인할 수 있다.

C Handler 실행 중의 CPU RAX는 임시 계산에 쓰일 수 있으므로, 저장한 번호나 결과는 `$call->R.rax`에서 확인한다. 출력 형식에 따라서도 같은 비트 패턴이 다르게 보인다. 모든 비트가 1인 64비트 값을 `p/x`로 읽으면 `0xffffffffffffffff`이고, 부호 있는 10진수 형식인 `p/d`로 읽으면 -1이다. [GDB의 출력 형식](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Output-Formats.html) QEMU의 Guest Register와 GDB Register 번호의 연결은 [QEMU의 GDB 연결](/wiki/computer-systems-network-qemu-b1366076be02/#gdb-번호와-regs-배열의-번호)에서 이어서 확인할 수 있다.

그 위치에서 `p sizeof(struct intr_frame)`로 192바이트 배치를 확인하고, `$call->rsp`와 `$user_sp`, `$call->rip`와 `$return_ip`, `$call->eflags`와 `$return_flags`를 비교한다. `x/5gx &$call->rip`는 RIP·CS·RFLAGS·RSP·SS 다섯 칸을 읽는다. `R.rcx`나 `R.r11`을 같은 값으로 기대하지 않는다. 복귀 명령을 관찰할 때는 현재 빌드의 `disassemble syscall_entry` 또는 `disassemble do_iret`로 주소를 찾는다. 소스 줄 번호나 고정된 `함수+offset`은 다른 빌드에 그대로 적용하지 않는다.

권한 왕복을 확인하려면 `syscall_entry` 첫 명령에서 `$cs & 3`, RSP·RCX·R11을 기록하고, 현재 빌드에서 찾은 `sysretq` 직전 값과 비교한다. 그 직전에는 아직 Kernel CPL 0이고, 복귀에 성공한 뒤 User CS가 적용된다. Kernel Stack인지 판단할 때는 임의의 주소 하한 대신 이 Thread의 `tss->rsp0`와 실제 Stack 범위를 사용한다. 같은 CPL의 IRQ라도 IST 사용 여부에 따라 Stack 선택이 달라지는 규칙은 [Interrupt의 진입 Stack](/wiki/computer-systems-network-topic-c19e34701c6c/#cpu와-assembly가-함께-만드는-frame)에서 확인한다.

MSR 설정 자체를 관찰하려면 `disassemble /r syscall_init`으로 실제 `wrmsr` 위치를 찾고, 실행 직전 ECX의 번호와 EDX:EAX의 값을 함께 읽는다. 함수 진입·반환 메시지만 출력하는 Breakpoint로는 설정값을 확인할 수 없다. 이 절의 관찰 방법은 현재 빌드에서 실행할 절차이며, 새 GDB 실행 기록을 뜻하지 않는다.

버퍼 검사 자체를 따라갈 때는 다음 중단점을 추가한다. 연결된 Kernel의 Debug Symbol이 맞아야 하며, 아래 명령은 실제 실행 출력이 아니다.

```gdb
break validate_user_buffer
break try_claim_user_addr
break exit if status == -1
continue
```

`validate_user_buffer`에서는 `buffer`·`size`·`write`를, `try_claim_user_addr`에서는 `addr`·`write`·`f`를 확인한다. 크기가 0인 버퍼는 단일 주소 검사까지 가지 않는다. `is_user_vaddr`는 매크로이므로 일반 함수처럼 호출하는 대신, 이 버전에서는 `p (unsigned long long)addr < 0x8004000000ULL`로 범위 조건을 계산한다. 범위를 통과했다는 값과 PTE Present·쓰기 권한은 별개다. `user_page_accessible`의 실제 PTE 조회 뒤에 멈춘 경우에도 `pte`가 NULL이 아닌지 먼저 확인하고 값을 읽는다. 페이지 경계는 하위 12비트를 제외한 부분으로 비교하며, 크기 0에 `buffer + size - 1`을 적용하지 않는다. `exit`에서 `bt`를 읽을 때는 이미 반환한 `try_claim_user_addr`가 Stack에 남아 있다고 기대하지 않는다. 실패를 돌려준 순간은 그 함수의 반환 직전에서 확인한다.

`validate_user_buffer()`의 지역변수 `addr`·`end`는 대입문을 지난 뒤에 읽는다. 크기가 0이면 그 대입문에 도달하지 않고 반환한다.

`copy_in()`과 `copy_out()`의 진입에서는 `src`·`dst`·`size`·`f`를 확인한다. User 주소는 `copy_in()`에서는 `src`, `copy_out()`에서는 `dst`다. 지역변수 `user`는 초기화 뒤에, `chunk`는 페이지의 남은 공간과 남은 전체 크기 중 작은 값으로 제한한 뒤 `memcpy()` 직전에 읽어야 한다. 남은 크기가 0이면 이 복사 지점에 도달하지 않는다. 현재 빌드의 소스와 Disassembly로 그 위치를 찾으며 오래된 줄번호를 재사용하거나 포인터·`size_t`를 32비트로 잘라 출력하지 않는다. [버퍼와 복사 지역변수의 초기화 순서](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c#L532-L598)

본문의 코드 기준은 `lrn-pintos@9d1b14c`다. W11 원본 `09390dd`와 진입 assembly·TSS·프레임 선언·파일 및 디스크 구현은 바이트가 같지만, `userprog/syscall.c`는 다르다. 따라서 W11 당시의 생략된 handler 예와 현재 버퍼 검증·복사 경로를 같은 실행 결과로 합치지 않는다. 이 대조는 코드 상태를 확인한 것이며 새 QEMU/GDB 실행이나 작성자별 기여 검증은 아니다.
