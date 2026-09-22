---
layout: default
title: Debugger
nav_order: 4
permalink: /wiki/platform-delivery-operations-topic-f89d71c7eb29/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/platform-delivery-operations-topic-f89d71c7eb29
projection_sha256: 3dd22182f1e34666ac789107061ccffd7df3d71ca8138688983c40208a5f4ae3
parent: 개발 환경
content_status: ready
public_parent_id: Wiki/keywords/platform-delivery-operations-topic-eb212956fe45
search_terms:
- 디버거
- GDB
- info registers
- GDB Remote Serial Protocol
- GDB Stub
- Memory Dump
- Breakpoint
- stepi
- x/16bx
grand_parent: DevOps
---

# Debugger
{: .no_toc }

`syscall_handler()`에서 멈췄는데 RAX가 예상한 syscall 번호와 다를 수 있다. 먼저 버그라고 판단하기 전에 지금 읽은 값이 handler의 현재 Register인지, 진입할 때 저장한 `f->R.rax`인지 확인한다. 같은 중단점에서도 Debugger가 보여 주는 자료의 시점은 같지 않을 수 있다.

여기서는 Kernel Symbol이 있는 PintOS를 QEMU의 GDB Stub에 연결해 조사하는 절차를 다룬다. C 타입과 함수 이름은 실행 중인 Kernel과 같은 빌드의 Debug 정보가 설명하고, Register와 Memory 값은 연결한 Target에서 가져온다. Symbol 파일만 열고 연결하지 않은 상태에서 실제 Guest 값을 읽었다고 생각해서는 안 된다.

## 연결한 프로그램부터 확인한다

GDB가 QEMU 프로세스를 직접 Attach한 경우에는 Host 주소와 QEMU의 C 구조체를 읽는다. QEMU의 GDB Stub에 Remote로 연결한 경우에는 Guest CPU와 Guest Memory를 읽는다. 두 연결 모두 Host에서 실행하는 GDB를 사용할 수 있으므로, 도구가 실행된 컴퓨터만으로 관찰 대상을 구별할 수 없다.

현재 PintOS 실행기의 `--gdb` 옵션은 QEMU에 `-s -S`를 전달한다. `-S`는 시작 시 CPU를 멈추고, `-s`는 `-gdb tcp::1234`의 축약이다. 이 축약만으로 Listen 주소를 `127.0.0.1`로 지정했다고 설명하지 않는다. 직접 QEMU 인자를 구성한다면 기존 Machine·Disk 설정에 `-gdb tcp:127.0.0.1:1234 -S`처럼 주소를 명시할 수 있다. [PintOS 실행기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/utils/pintos), [QEMU GDB 옵션](https://github.com/qemu/qemu/blob/v10.0.0/qemu-options.hx)

아래는 이미 Debug 옵션으로 시작한 해당 Guest에 연결하는 GDB 절차다. 현재 디렉터리에 실행 중인 Kernel과 일치하는 `kernel.o`가 있다고 가정한다. 이번 문서 작성에서 실제 Guest 세션을 실행한 기록은 아니므로 특정 Register 출력을 붙이지 않는다.

```gdb
file kernel.o
target remote 127.0.0.1:1234
info files
info threads
frame 0
info registers rip rsp cs eflags
x/i $pc
```

`info files`로 Symbol과 파일을 확인하고 `info threads`로 선택한 실행 대상을 확인한다. QEMU System mode의 Thread 표시는 vCPU와 관계되며 PintOS의 `tid` 목록을 대신하지 않는다. 여러 CPU나 Cluster를 제공하는 Machine에서는 Inferior와 Thread 선택 방식도 확인한다. [QEMU의 다중 CPU Debugging](https://www.qemu.org/docs/master/system/gdb.html)

## 현재 Frame과 저장된 Frame

`info registers`는 **선택한 Stack Frame 기준**으로 Register를 보여 준다. `up`으로 호출자 Frame을 선택했다면 GDB가 Debug·Unwind 정보 등으로 복원한 값을 볼 수 있다. 호출자가 보존하지 않은 Register는 복원할 수 없거나 `<not saved>`로 보일 수도 있다. 현재 멈춘 CPU 상태와 비교할 때는 먼저 `frame 0`을 선택한다. [GDB의 Register와 Frame 규칙](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Registers.html)

`info all-registers`는 부동소수점·Vector Register까지 포함하고, `info registers rax rip`처럼 필요한 이름만 지정할 수도 있다. `$pc`와 `$sp`는 지원되는 Target에서 실행 위치와 Stack 위치를 읽는 공통 이름이다. x86의 `$rip`, `$rsp`와 실제 Target이 제공하는 이름을 구별해 사용한다.

다음은 `syscall_handler`에 도착한 뒤 현재 값과 저장된 값을 비교하는 정적 관찰 절차다. 다른 중단점에 먼저 멈췄다면 현재 함수를 확인하고 해당 위치까지 진행해야 한다. 최적화 때문에 `f`를 볼 수 없을 때에는 임의의 고정 offset을 쓰기보다 Symbol·빌드 옵션·명령 위치부터 확인한다.

```gdb
tbreak syscall_handler
continue
frame 0
bt
info registers rax rdi rsi rdx rip rsp
p/x f->R.rax
p f->R.rdi
p/x f->R.rsi
p f->R.rdx
p/x f->rip
p/x f->rsp
```

현재 RDI는 C 함수 인자 `f`를 전달하는 데 사용됐을 수 있다. 사용자 syscall의 첫 인자는 `f->R.rdi`에 저장되어 있다. Handler가 `f->R.rax`에 반환값을 기록한 뒤에는 같은 필드를 더 이상 최초 syscall 번호로 읽을 수 없다. CPU와 메모리의 차이뿐 아니라 Frame이 만들어진 뒤 값이 변경된 시점도 따라간다.

`p *f`는 Debug 타입에 따라 구조체를 해석한다. 같은 주소를 `x/192bx f`로 읽으면 Byte 192개, `x/24gx f`로 읽으면 8 Byte 값 24개를 본다. GPR만 보려면 `x/15gx &f->R`로 120 Byte를 읽는다. `x/16gx &f->R`는 그 뒤의 ES slot까지 포함하므로 16개 Register의 출력으로 읽으면 안 된다.

이 PintOS의 `gp_registers`와 `intr_frame`은 `packed`로 선언돼 있지만 `es`·`ds`·`cs`·`ss` 뒤에는 명시적인 Padding 필드가 있다. `packed`라는 이름만으로 모든 빈 공간이 사라지거나 Assembly와 C의 배치가 자동으로 일치한다고 판단하지 않는다. 선언의 필드 순서와 진입·복귀 코드의 Offset을 함께 맞춰야 한다. [GCC의 packed 속성](https://gcc.gnu.org/onlinedocs/gcc/Common-Attributes.html), [현재 PintOS의 Frame 배치](/wiki/computer-systems-network-topic-41565131cfca/#intr_frame에-담긴-실행-상태)

`do_iret` 안의 임의 명령 위치에서 RDI가 계속 Frame 주소일 것이라고 가정하거나, `thread_current()` 같은 Guest 함수를 호출하는 관찰을 단순 Memory 읽기로 취급하지 않는다.

## Memory의 주소와 단위를 명시한다

`x`는 Debug 타입 대신 지정한 형식으로 Memory를 읽는다. `x/16bx`는 Byte 16개를, `x/16gx`는 8 Byte 값 16개를 Hex로 보여 준다. 둘의 요청 범위는 16 Byte와 128 Byte로 다르다. `x/16x`처럼 단위를 생략하면 이전 설정에 영향을 받으므로 Byte 덤프라고 단정하지 않는다. [표시 형식과 단위의 차이](/wiki/computer-systems-network-topic-e647548deca2/#gdb에서-크기와-표시-형식을-지정한다)는 데이터 표현에서 이어서 확인한다.

메모리에 반복되는 값이 보이면 사용 중인 버전과 할당기의 정의를 먼저 확인한다. Linux v6.12의 `poison.h`는 `0x5a`를 `POISON_INUSE`, `0x6b`를 `POISON_FREE`, 마지막 표시 바이트 `0xa5`를 `POISON_END`로 정의한다. `0x5a`를 해제 표시로, `0xa5` 반복을 모든 유효하지 않은 메모리의 공통 표시로 읽으면 맞지 않는다. 같은 파일의 `0xdeadbeef`는 ATM용 `ATM_POISON`이다. `0xdead`로 시작하는 주소만 보고 KASAN 문제라고 판단할 수도 없다. List Poison 주소에는 설정에 따른 `POISON_POINTER_DELTA`가 더해질 수 있다. 관찰한 패턴은 원인을 좁히는 단서이며, 객체의 수명과 실제 오류 경로까지 함께 대조해야 한다. [Linux v6.12의 Poison 정의](https://github.com/torvalds/linux/blob/v6.12/include/linux/poison.h)

| 관찰 목적 | 명령 예시 | 확인할 조건 |
|---|---|---|
| 명령어 Byte | `x/16bx $rip` | 현재 주소 공간에서 읽을 수 있는 범위 |
| 명령어 해석 | `x/5i $rip` | 실행 모드와 올바른 명령 시작 주소 |
| Stack 값 | `x/8gx $rsp` | Stack Pointer와 8 Byte 단위 |
| 타입에 따른 구조체 | `p *f` | 현재 위치에서 `f`가 유효하고 Debug 타입이 일치함 |
| C 문자열 | `x/s f->R.rsi` | 해당 주소가 NUL로 끝나는 문자열임을 알고 있을 때 |

`write()`의 버퍼는 지정한 길이만큼의 Byte이며 NUL 종료 문자열일 필요가 없다. 길이를 모른 채 `x/s`로 읽으면 요청한 출력 범위를 넘어갈 수 있다. `argv`는 문자열 주소를 담은 배열이므로 포인터 배열과 각 문자열을 두 번에 나누어 읽는다. 실제 인자 배치는 [인자 전달](/wiki/computer-systems-network-topic-1217820258bd/)에서 확인한다.

PintOS의 `USER_STACK=0x47480000`은 초기 Stack의 위쪽 경계다. 그 주소부터 무조건 유효한 데이터가 놓인 것은 아니다. 현재 RSP와 매핑을 확인한 뒤 읽는다. User ELF의 진입점도 특정 상수로 외우지 않고 Header와 현재 RIP를 대조한다. Kernel의 `KERN_BASE=0x8004000000`과 User 주소를 분류할 때에도 주소 값만으로 읽기·쓰기 권한이나 모든 Page의 존재를 보장할 수는 없다.

QEMU GDB의 기본 Memory 관찰은 선택한 Guest의 가상 주소를 사용한다. `monitor xp`는 Guest 물리 주소를 관찰하는 별도 명령이다. `qemu.PhyMemMode` 설정으로 GDB의 주소 해석을 바꿀 수 있으므로, 같은 숫자가 다르게 읽히면 모드부터 확인한다. Guest PA를 Host Pointer로 Cast하거나 CR3 전체 값을 아무 Mask 없이 일반 포인터로 읽지 않는다. [QEMU의 물리 Memory 관찰](https://www.qemu.org/docs/master/system/gdb.html)

## 실행 위치를 바꾸기 전과 후

`x/i $pc`는 명령어를 읽어 보여 주며 실행하지 않는다. 한 명령을 실행하려면 `stepi` 또는 `si`를 사용한다. 다음 명령이 Call이면 `nexti`와 `stepi`의 관찰 범위가 달라진다. Source 수준의 `step`·`next` 역시 Machine Instruction 한 개와 동일한 단위가 아니다.

실행을 한 번 진행한 뒤에는 RIP만 보지 말고 이번 명령이 바꾸는 값도 함께 본다. 예를 들어 `process_activate()` 입구의 CR3는 다음 Thread의 주소 공간을 활성화하기 전 값일 수 있다. `pml4_activate()` 이후로 진행한 뒤 `next->pml4`와 실제 CR3의 주소 종류를 맞춰 비교해야 한다. Debugger로 실행 시간을 늘린 상황의 Timer 횟수를 정상 속도의 측정 결과로 사용하지 않는다.

Page Fault를 조사할 때는 현재 handler의 RIP, Frame의 `f->rip`, CR2가 서로 다른 질문에 답한다. CR2는 실패한 가상 주소이고, Fault Frame의 RIP는 재시도할 명령 위치다. CR2를 다른 Fault가 덮기 전에 읽거나, handler가 `fault_addr = rcr2()`를 수행한 뒤 그 지역 변수를 읽는다. 오류 코드·현재 Page Table·복구 결과는 [페이지 폴트](/wiki/computer-systems-network-topic-5cebdbc10ddf/)의 관찰 절차로 이어진다.

Fork의 Frame을 비교할 때는 현재 소스의 `struct fork_args`와 `if_`를 따라간다. 부모의 User Frame이 복사된 시점과 자식 반환값 0이 기록된 시점은 다르다. 두 Frame의 RIP와 RSP가 같아도 같은 Memory를 공유한다는 뜻은 아니다. [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/)의 복제·동기화 순서를 먼저 확인하면 잘못된 중단점에서 만든 차이를 버그로 오해하지 않을 수 있다.

## 명령이 Remote Packet으로 전달된다

Remote 연결에서는 GDB가 Register·Memory·실행 제어 요청을 Stub에 전달한다. 화면에서 `info registers`를 한 번 실행했다고 언제나 새로운 `g` Packet 하나가 전송되는 것은 아니다. Cache, 개별 Register 요청, Stop Reply에 포함된 정보와 Target 기능에 따라 실제 통신이 달라질 수 있다.

| Packet | 의미 |
|---|---|
| `g`, `G` | Target Description이 정한 Register 묶음 읽기·쓰기 |
| `p`, `P` | 번호로 지정한 Register 읽기·쓰기 |
| `m`, `M` | 주소와 길이로 지정한 Memory 읽기·쓰기 |
| `Z`, `z` | 종류와 주소를 지정한 Breakpoint·Watchpoint 추가·제거 |
| `c`, `s`, `vCont` | 계속 실행·Single-step 등의 실행 제어 |
| `?` | 멈춘 이유 요청 |

일반 Packet은 `$payload#checksum` 형식이고 Checksum은 payload Byte의 합을 256으로 나눈 나머지다. ACK의 `+`·`-`와 실행 중 Interrupt 제어 문자는 별도로 전달될 수 있다. 연결 때 기능을 협상하며 ACK를 생략하는 모드도 있다. [GDB Remote Protocol 형식](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Overview.html)

Register Byte는 Target의 Byte Order로 표현된다. `p10`의 번호는 16진수이며, Register 위치와 크기는 Target Description이 결정한다. 요청의 길이 필드도 보통 Hex를 사용한다. 큰 Memory 읽기는 협상한 `PacketSize`와 구현 조건에 따라 나뉠 수 있으므로 전체 요청 수나 지연을 고정된 값으로 계산하지 않는다. [Register·Memory Packet](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Packets.html)

QEMU의 번호 변환과 실행 가능한 Packet 예제는 [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/)에서 확인한다. 실제 연결이 없을 때는 그 예제로 Byte와 번호를 익힐 수 있고, 실제 중단점에서는 Target·Frame·주소 공간을 확인한 뒤 필요한 값만 비교할 수 있다.
