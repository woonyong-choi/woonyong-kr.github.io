---
layout: default
title: CPU
nav_order: 4
permalink: /wiki/computer-systems-network-cpu-4b05d739f0f6/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-cpu-4b05d739f0f6
projection_sha256: 5e54dacf0136760d9dfcb3e2434cc689e9195131addea379e5aa9ef56da242ff
parent: 컴퓨터 구조
content_status: ready
public_parent_id: Wiki/computer-systems-network/computer-architecture
search_terms:
- Register
- RAX
- EAX
- RFLAGS
- EFLAGS
- CF
- OF
- IF
- syscall 인자
grand_parent: Systems
ancestor: CS 기초
---

# CPU
{: .no_toc }

`write(1, "hello", 5)`를 호출한 프로그램이 커널 입구에서 멈췄다고 하자. 화면에는 RAX, RDI, RSI, RDX 같은 Register 이름과 숫자가 보인다. 이 숫자는 출력할 문자열 자체일 수도 있고, 그 문자열이 놓인 주소일 수도 있다. 무엇을 담았는지는 명령어와 호출 규약을 함께 읽어야 알 수 있다.

CPU는 명령어를 실행하면서 계산에 쓸 값, 다음 명령의 위치, 메모리에 접근할 조건을 바꾼다. 여기서는 PintOS의 x86-64 실행을 따라 그 상태를 읽는다. CPU의 내부 회로와 소프트웨어가 관찰하는 상태를 같은 것으로 간주하지는 않는다. Register Renaming이나 Pipeline처럼 실제 실행을 구성하는 방식이 달라도 프로그램에는 해당 아키텍처가 정한 결과가 보여야 한다. 명령어 Byte를 해석하는 과정은 [명령어](/wiki/computer-systems-network-topic-4a1a79029429/)에서 이어진다.

## 같은 Register의 다른 크기

RAX는 x86-64에서 64 Bit 값을 담는 범용 Register다. EAX는 그중 아래 32 Bit, AX는 아래 16 Bit, AL은 아래 8 Bit를 가리킨다. 이름만 보고 네 개의 독립된 저장소라고 생각하면 한 값을 바꾼 뒤 다른 이름으로 읽은 결과를 설명하기 어렵다.

64 Bit 모드에서 EAX에 값을 쓰면 RAX의 위쪽 32 Bit가 0이 된다. 반면 AX나 AL에 쓰는 일반적인 정수 명령은 나머지 Bit를 보존한다. 그래서 RAX가 `0x123456789abcdeff`일 때 AL에 1을 쓰면 `0x123456789abcde01`이 되고, EAX에 1을 쓰면 전체 RAX가 1이 된다. AH처럼 다른 부분을 가리키는 이름과 개별 명령의 예외까지 이 규칙 하나로 확장하지 않는다.

전통적인 32비트 x86의 GPR은 EAX·EBX·ECX·EDX·ESI·EDI·EBP·ESP의 8개다. 이 글에서 다루는 기본 x86-64에서는 각 Register가 64비트로 확장되고 R8–R15가 더해져 16개가 된다. 한 Register에 담을 수 있는 unsigned 정수의 최댓값은 32비트에서 `2^32-1`, 64비트에서 `2^64-1`이다. 이는 덧셈이 그 범위를 넘지 않는다는 보장이 아니라 결과를 담는 폭이다. 넘친 결과와 CF·OF는 아래에서 따로 읽는다.

Register 폭, 가상 주소 폭, 물리 주소 폭은 같아야 하는 값이 아니다. 바이트 주소를 32비트로 표현하면 가능한 값은 `2^32`, 즉 4 GiB이고 64비트라면 이론상 16 EiB다. 실제 x86-64의 4단계·5단계 Paging이 사용하는 주소 형태는 각각 48비트·57비트 조건을 따르며, 그 크기가 설치된 RAM이나 프로세스가 실제 사용할 수 있는 영역을 뜻하지는 않는다. [주소 형태와 OS의 영역 배치](/wiki/computer-systems-network-topic-3521ee6344f1/#주소의-형태와-접근-권한은-서로-다른-조건이다)를 함께 확인한다.

범용 Register의 용도도 이름에 고정되어 있지 않다. RAX는 산술 계산에 사용할 수 있고 함수 반환값이나 syscall 번호도 담는다. RSP는 현재 Stack 위치, RIP는 실행 위치를 나타낸다. RBP를 반드시 모든 함수의 Frame 기준으로 쓴다고 가정해서는 안 된다. Compiler가 Frame Pointer를 생략한 빌드에서는 Debug 정보와 Unwind 정보를 함께 읽어야 한다.

함수 호출의 보존 약속도 실행 문맥 전체를 저장하는 규칙과 구별한다. System V x86-64 ABI의 RBX·RBP·R12–R15는 호출받은 함수가 보존하는 Callee-saved Register다. 호출 중 값을 자유롭게 바꿀 수 있는 Register와 달리 함수가 반환했을 때 호출자가 기대한 값을 돌려놓아야 한다. 이것만으로 Interrupt, Thread 전환, 주소 공간과 부동소수점 상태의 보존 범위까지 결정되는 것은 아니다.

인자 위치도 CPU가 64비트라는 이유만으로 결정되지 않는다. Microsoft의 32비트 x86 `__cdecl`은 인자를 오른쪽부터 Stack에 놓고 호출자가 정리한다. System V AMD64의 INTEGER 분류 인자는 RDI·RSI·RDX·RCX·R8·R9의 사용 가능한 Register를 차례로 쓰지만, Windows x64의 처음 네 인자 위치는 타입에 따라 RCX·RDX·R8·R9 또는 XMM0–XMM3를 사용한다. 부동소수점·구조체·가변 인자의 규칙과 Stack으로 넘어가는 조건도 ABI마다 다르다. Register가 늘었다는 사실만으로 모든 프로그램이 빨라진다고 판단하지 않는다. [32비트 x86의 __cdecl](https://learn.microsoft.com/en-us/cpp/cpp/cdecl?view=msvc-170), [System V AMD64의 인자 분류](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/ab2062ad5653913c39124548943b1177330e34c8/x86-64-ABI/low-level-sys-info.tex), [Windows x64 호출 규약](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention?view=msvc-170)

### RSP의 변화와 메모리 접근

RSP는 x86-64의 64비트 Stack Pointer다. `push`로 값을 쌓을 때는 낮은 주소 쪽으로 움직인다. 다음 표는 적힌 명령이 정상적으로 완료될 때 RSP와 일반 Stack 메모리에서 일어나는 변화를 나타낸다. `call`은 같은 코드 Segment 안의 near call, `ret`은 추가 정리 크기를 지정하지 않은 near return을 뜻하며, `N`은 확보하거나 되돌릴 양수 바이트 수다.

| 명령 | RSP와 Stack의 변화 |
|---|---|
| `push rax` | RSP를 8 내린 주소에 RAX의 8 Byte를 쓴다. |
| `pop rax` | 현재 RSP에서 8 Byte를 RAX로 읽고 RSP를 8 올린다. |
| `call func` | 다음 명령의 주소 8 Byte를 Stack에 쌓아 RSP를 8 내리고, 호출 대상으로 이동한다. |
| `ret` | 현재 RSP의 반환 주소로 돌아가며 RSP를 8 올린다. |
| `sub rsp, N` | RSP를 N만큼 내린다. 그 주소에 데이터를 쓰지는 않는다. |
| `add rsp, N` | RSP를 N만큼 올린다. 남아 있는 메모리 바이트를 지우지는 않는다. |

push/pop이 RSP를 바꾸는 양은 operand 크기에 따라 달라진다. 64-bit 모드에서도 16-bit operand를 쓰는 `push ax`·`pop ax`는 RSP를 2 Byte씩 바꾼다. 표의 RAX 대신 RSP 자신이나 메모리를 operand로 쓰는 형식, `ret imm16`의 추가 정리는 각각 해당 명령 규칙을 확인한다. [Intel SDM의 PUSH operand와 Stack Pointer](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf#page=513), [POP의 16·64-bit 동작](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf#page=389)

`sub rsp, N`으로 값을 낮췄다는 사실만으로 Page가 새로 할당되거나 그 주소에서 Page Fault가 발생하지는 않는다. 이후 명령이 그 주소의 메모리를 읽거나 쓸 때 Mapping과 접근 조건을 검사한다. 이 차이는 [스택 성장 판단](/wiki/computer-systems-network-topic-5cebdbc10ddf/#스택-근처라고-모두-새-페이지를-만들지는-않는다)에서 중요하다.

호출 시 RSP를 어디에 맞출지는 ABI의 약속이다. System V AMD64의 호출 직전 정렬, 반환 주소가 쌓인 함수 진입, ELF 프로세스의 최초 진입은 [인자 전달의 정렬 비교](/wiki/computer-systems-network-topic-1217820258bd/#8바이트-정렬과-함수-호출의-16바이트-정렬)로 이어진다. PintOS의 초기 RSP와 가짜 반환 주소는 [Thread의 시작 문맥](/wiki/computer-systems-network-topic-aebc87b0fcf5/#rsp에서-현재-thread를-찾는-이유)에서 실제 복원 경로와 함께 읽는다.

## write에 전달되는 네 값

현재 PintOS의 사용자 `write()`는 `syscall3(SYS_WRITE, fd, buffer, size)`를 호출한다. `SYS_WRITE`는 10이다. `syscall3`의 3은 syscall 번호가 아니라 전달할 인자의 개수를 뜻한다. [사용자 wrapper](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/lib/user/syscall.c)

문자열이 사용자 주소 `0x8048123`에 있다고 가정하면 `SYSCALL` 직전에 다음 값을 구별할 수 있다. 주소는 설명용이며 실제 프로그램에서 측정한 위치가 아니다.

| Register | 값 | 이번 호출의 의미 |
|---|---:|---|
| RAX | 10 | `SYS_WRITE` 번호 |
| RDI | 1 | 파일 Descriptor |
| RSI | `0x8048123` | 문자열의 첫 Byte 주소 |
| RDX | 5 | 요청한 Byte 수 |

RSI에는 `hello`의 다섯 글자가 한꺼번에 들어 있지 않다. 커널이 RSI를 주소로 해석하고 RDX만큼 읽는다. 따라서 인자 값이 올바른 것과 그 메모리에 접근할 수 있는 것은 별도의 조건이다. [Pointer](/wiki/programming-languages-runtime-topic-ef71fd296666/)와 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서 주소와 접근 조건을 이어서 볼 수 있다.

이 PintOS의 syscall 인자는 RDI·RSI·RDX·R10·R8·R9 순으로 전달된다. 일반 C 함수 호출의 네 번째 인자에 사용하는 RCX와 다르다. `SYSCALL`이 RCX에 복귀 RIP를, R11에 Flag를 저장하기 때문이다. CPU는 `SYS_WRITE`라는 이름이나 fd 1의 뜻을 해석하지 않는다. 진입점을 고르는 MSR 설정과 PintOS의 handler가 요청을 나누는 과정은 [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/)의 syscall 설명에 연결되어 있다. 다른 OS의 wrapper와 ABI에 이 번호나 인자 배치를 그대로 적용하지 않는다.

## 계산이 남기는 Flag

8 Bit에서 `0xff + 1`은 0이 된다. 저장할 수 있는 범위를 넘어간 Bit는 결과에 들어가지 않지만, Carry Flag인 CF에는 그 사실을 남길 수 있다. 같은 크기에서 `0x7f + 1`은 `0x80`이다. 부호 있는 정수로 읽으면 127 다음에 음수 범위로 넘어갔으므로 Overflow Flag인 OF가 켜진다. CF와 OF가 서로 다른 질문에 답하는 이유다.

x86의 `ADD`는 같은 크기의 입력 Bit에 대해 하나의 덧셈 결과를 만들고, signed 해석의 Overflow와 unsigned 해석의 Carry를 OF·CF에 남긴다. 8 Bit의 `5 + (-3)`은 `0000 0101 + 1111 1101 = 1 0000 0010`이므로 저장되는 결과는 2다. 이때 CF는 1, OF는 0이다. 하위 8 Bit 결과를 취한다고 Carry 정보까지 항상 무시하는 것은 아니다. 2의 보수에서는 음수도 이 덧셈 경로로 처리할 수 있다. 아래 `add_flags()`에 `0x05`, `0xfd`를 넣어 같은 조건을 살펴볼 수 있다. [Intel SDM Volume 2A, ADD](https://cdrdv2-public.intel.com/922480/253666-092-sdm-vol-2a.pdf#page=132)

RFLAGS는 64 Bit Register이고 EFLAGS는 아래 32 Bit 부분을 가리킨다. 어떤 명령이 어느 Flag를 변경하는지는 명령별로 다르다. 특히 값을 옮기는 MOV가 아래 산술 Flag를 모두 새로 계산한다고 생각해서는 안 된다.

| Flag | 이 값으로 확인하는 것 |
|---|---|
| CF | 부호 없는 덧셈의 Carry 또는 뺄셈의 Borrow |
| ZF | 연산 결과가 0인지 |
| SF | 결과의 최상위 Bit; 부호 있는 값으로 해석할 때 Sign |
| OF | 부호 있는 연산 결과가 표현 범위를 벗어났는지 |
| PF | 결과의 아래 8 Bit에 1이 짝수 개 있는지 |
| AF | 아래쪽 4 Bit 경계를 넘는 Carry 또는 Borrow |
| IF | Mask 가능한 외부 Interrupt의 허용 상태 |
| DF | MOVS·STOS 등 String 명령이 주소를 증가시킬지 감소시킬지 |
| TF | 명령 단위 Debug 예외에 관여하는 상태 |

SF만 보고 모든 값이 음수라고 결론 내리지 않는다. 같은 Bit를 unsigned 값으로 읽으면 해석이 달라진다. 또한 IF가 0이라고 Page Fault나 NMI까지 차단되는 것은 아니다. TF에 따른 Debug 예외에는 명령과 이벤트별 조건이 있으므로, GDB의 한 번의 `stepi`와 언제나 동일한 구현이라고 설명할 수도 없다. Flag의 정식 정의는 [Intel SDM의 Basic Architecture](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)에서 Register와 명령별 규칙을 함께 확인한다.

비교 뒤 어떤 조건을 읽을지도 부호 해석에 따라 달라진다. signed 비교의 `JG`는 `ZF=0`이면서 `SF=OF`인지, unsigned 비교의 `JA`는 `CF=0`이면서 `ZF=0`인지 확인한다. 같은 결과 Bit에 붙인 signed·unsigned 타입 이름이 CPU에 따로 저장되는 것은 아니다. [Intel SDM Volume 2A, Jcc](https://cdrdv2-public.intel.com/922480/253666-092-sdm-vol-2a.pdf#page=617)

CPU의 Bit 연산과 C 표현식의 계약은 별개다. C의 signed 산술 결과가 해당 타입의 표현 범위를 벗어나면 Undefined Behavior이며, CPU가 하위 Bit를 남길 수 있다는 사실로 언어 차원의 Wraparound를 보장할 수는 없다. C의 정수 승격 때문에 작은 정수 타입끼리 쓴 식도 반드시 8 Bit 연산인 것은 아니다. [C11 초안, 6.3.1.1·6.5](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)

빌드 옵션을 바꾼 경우에는 그 계약을 따로 확인한다. Linux v6.12의 Makefile은 `-fno-strict-overflow`를 사용하며, GCC 문서에서 이 옵션은 `-fwrapv`와 `-fwrapv-pointer`를 함의한다. `-fwrapv`가 정하는 것은 signed 덧셈·뺄셈·곱셈의 2의 보수 Wraparound다. 확인한 PintOS의 `Make.config`에는 `-fno-strict-overflow`나 `-fwrapv`를 명시하지 않는다. 이 파일 확인을 실제 실행 바이너리의 모든 옵션 검증으로 확대하거나, `-O0`만으로 signed Overflow를 허용한다고 해석하지 않는다. [Linux v6.12 빌드 설정](https://github.com/torvalds/linux/blob/v6.12/Makefile), [GCC의 Overflow 옵션](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html), [PintOS Make.config](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/Make.config)

## 초기 Flag와 커널 진입

PintOS의 `process_exec()`는 새 실행 문맥의 `eflags`에 `FLAG_IF | FLAG_MBS`, 즉 `0x202`를 넣는다. Bit 9의 IF와 항상 1로 두는 Bit 1을 켠 값이다. `intr_get_level()`은 현재 Flag에서 IF를 읽고, `intr_disable()`과 `intr_enable()`은 CLI·STI를 사용한다. 이 값은 새 사용자 실행의 초기 설정이며 실행 중의 Flag가 계속 `0x202`라는 뜻은 아니다. [프로세스 시작](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c), [Interrupt 제어](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c)

`syscall_init()`은 `MSR_SYSCALL_MASK`에 IF·TF·DF·IOPL·AC·NT를 지정한다. 합계는 `0x47700`이다. 이 Mask는 `SYSCALL` 진입 시 현재 Flag의 해당 Bit를 지우도록 설정한다. 이후 Assembly가 Kernel Stack으로 옮기고 인자를 저장한다. 어떤 Flag가 사용자 복귀에 복원되는지는 저장된 Frame과 실제 `SYSRET`·`IRET` 경로를 따라 읽어야 한다. [syscall 설정](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall.c)

IOPL은 I/O 권한 판단에 사용하는 두 Bit다. Port I/O에는 TSS의 I/O Permission Bitmap도 관여할 수 있으므로 `CPL > IOPL`이면 모든 OS에서 항상 같은 결과라고 줄이지 않는다. AC 역시 Alignment Check의 조건뿐 아니라 SMAP을 사용하는 환경의 접근 규칙과 함께 읽어야 한다. NT와 가상 Interrupt 관련 Flag까지 한꺼번에 익히기보다, 지금 실행하는 명령이 참조하는 Flag와 제어 설정부터 확인하는 편이 정확하다.

## 값의 크기와 Flag를 함께 바꿔 보기

다음 Python 코드는 부분 Register 쓰기, 8 Bit 덧셈의 일부 Flag, PintOS의 초기 Flag Mask를 계산한다. 실제 CPU 명령이나 권한 전환을 실행하는 Emulator는 아니다. `write_low()`의 32 Bit 분기와 `add_flags()`의 CF·OF가 서로 다른 조건을 검사하는 부분을 먼저 비교해 보자.

```run-python
def write_low(rax, value, bits):
    if bits not in (8, 16, 32, 64):
        raise ValueError('지원하는 크기는 8, 16, 32, 64 Bit다.')
    mask = (1 << bits) - 1
    low = value & mask
    return low if bits >= 32 else (rax & ~mask) | low


def add_flags(a, b, bits=8):
    mask = (1 << bits) - 1
    if not (0 <= a <= mask and 0 <= b <= mask):
        raise ValueError('입력은 지정한 크기 안의 정수여야 한다.')
    result = (a + b) & mask
    sign = 1 << (bits - 1)
    flags = dict(CF=int(a + b > mask), ZF=int(result == 0),
                 SF=int(bool(result & sign)),
                 OF=int(bool((~(a ^ b) & (a ^ result)) & sign)),
                 PF=int(bin(result & 0xff).count('1') % 2 == 0))
    return result, flags


initial = 0x123456789abcdeff
for bits in (8, 16, 32, 64):
    print(f'{bits:2}-bit write 1: RAX=0x{write_low(initial, 1, bits):016x}')
for a, b in ((0xff, 1), (0x7f, 1), (1, 1)):
    result, flags = add_flags(a, b)
    values = ' '.join(f'{name}={value}' for name, value in flags.items())
    print(f'8-bit {a:02x}+{b:02x}={result:02x}: {values}')

initial_flags = (1 << 9) | (1 << 1)
syscall_mask = (1 << 9) | (1 << 8) | (1 << 10) | (3 << 12) | (1 << 18) | (1 << 14)
print(f'초기 RFLAGS=0x{initial_flags:x}, IF={(initial_flags >> 9) & 1}')
print(f'SYSCALL mask=0x{syscall_mask:x}, mask 적용=0x{initial_flags & ~syscall_mask:x}')
try:
    add_flags(256, 1)
except ValueError as error:
    print(f'범위 검사: {error}')
```

Python 3.9.6에서 실행해 확인한 결과다.

```text
 8-bit write 1: RAX=0x123456789abcde01
16-bit write 1: RAX=0x123456789abc0001
32-bit write 1: RAX=0x0000000000000001
64-bit write 1: RAX=0x0000000000000001
8-bit ff+01=00: CF=1 ZF=1 SF=0 OF=0 PF=1
8-bit 7f+01=80: CF=0 ZF=0 SF=1 OF=1 PF=0
8-bit 01+01=02: CF=0 ZF=0 SF=0 OF=0 PF=0
초기 RFLAGS=0x202, IF=1
SYSCALL mask=0x47700, mask 적용=0x2
범위 검사: 입력은 지정한 크기 안의 정수여야 한다.
```

`ff+01`에서는 CF와 ZF가 켜지고, `7f+01`에서는 OF와 SF가 켜진다. 마지막 Mask 계산은 시작값을 `0x202`로 고정했기 때문에 `0x2`가 남는다. 다른 Flag가 함께 켜진 입력이라면 Mask에 포함되지 않은 Bit는 남는다. `initial_flags`를 바꿔 이 차이를 확인할 수 있다.

## 멈춘 CPU와 저장된 Frame

`syscall_handler(struct intr_frame *f)` 안에서는 현재 RAX와 `f->R.rax`가 다를 수 있다. 앞의 값은 handler를 실행하다 멈춘 CPU 상태이고, 뒤의 값은 Assembly가 메모리에 저장한 syscall 번호다. Handler가 `f->R.rax`에 반환값을 쓰면 같은 필드는 이제 복귀할 값을 담는다. 저장된 Frame도 생성 이후 언제 읽었는지 확인해야 한다.

RSP가 어느 Stack을 가리키는지도 중단 위치에 따라 다르다. [SYSCALL 진입 직후](/wiki/computer-systems-network-topic-3cc26725c1cb/#진입-주소에-도착해도-스택은-아직-사용자-것이다)에는 아직 User Stack이고, PintOS Assembly가 Kernel Stack으로 옮긴 뒤에야 Handler의 Frame을 쌓는다. [인터럽트와 syscall의 복귀](/wiki/computer-systems-network-topic-41565131cfca/#인터럽트와-시스템-콜은-복귀-경로가-다르다), [fork의 User RSP와 Kernel 실행 문맥](/wiki/computer-systems-network-topic-4af2e32913a4/#같은-가상-주소와-다른-프레임)을 구분하면 같은 Register 이름을 다른 Stack의 주소로 잘못 읽는 일을 피할 수 있다. QEMU에서 이 값을 전달하는 과정은 [Guest Register의 번호 변환](/wiki/computer-systems-network-qemu-b1366076be02/#gdb-번호와-regs-배열의-번호)에 연결되어 있다.

RIP·RSP·Flag와 일부 GPR을 복원한다고 CPU의 모든 상태를 복원한 것은 아니다. 주소 공간을 고르는 CR3, FPU·SIMD, Debug Register 같은 상태는 별도 경로를 가진다. [커널과 사용자 영역](/wiki/computer-systems-network-topic-41565131cfca/)에서 `intr_frame`의 192 Byte 배치와 복원 코드를 읽고, [Debugger](/wiki/platform-delivery-operations-topic-f89d71c7eb29/)에서 현재 Frame과 저장된 Frame을 같은 중단점에서 비교한다. 다음에 Register 값이 이상해 보이면 먼저 값의 크기, 호출 규약, 관찰 시점을 각각 확인한다.

## GPU와 작업을 나누는 기준

한 실행 흐름을 빨리 끝내는 지연 시간과 많은 작업을 처리하는 처리량은 다른 목표다. CPU는 복잡한 제어 흐름을 포함한 Thread를 빠르게 실행하도록 설계하며, GPU는 많은 Thread의 연산을 함께 처리하는 데 비중을 둔다. 그래픽 처리를 위해 발전한 GPU는 행렬 연산과 과학 계산에도 쓰인다. [CUDA 안내의 CPU·GPU 설계 비교](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/introduction.html)

CPU의 Cache·분기 예측·Out-of-Order Execution은 실행 중의 대기를 줄이는 데 쓰인다. GPU는 많은 연산 장치와 실행할 Thread를 이용해 처리량을 높인다. 이것은 설계 방향의 비교다. 코어 수, Clock, Cache 크기와 칩 면적의 비율은 제품마다 다르므로 고정된 숫자로 외우지 않는다. CPU Core와 CUDA Core도 같은 단위의 독립 실행 장치가 아니다.

NVIDIA의 CUDA 모델에서는 여러 SM이 연산을 나누고, SM 안에 Register·Cache·연산 장치가 있다. Thread는 Block과 Grid로 구성되며 Block 안에서는 32개씩 Warp를 이룬다. 같은 Warp 안에서 분기 경로가 갈리면 일부 Lane을 Mask한 채 경로를 실행할 수 있어 이용률에 영향을 준다. “수천 Thread가 항상 같은 명령으로 동시에 전진한다”거나 “GPU에는 제어 기능과 Cache가 없다”라고 줄일 수는 없다. [CUDA의 하드웨어와 SIMT 모델](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html)

데이터 병렬성이 높다는 것은 같은 연산을 여러 데이터에 나누어 적용할 여지가 크다는 뜻이다. 이미지 필터, 신경망의 행렬 연산과 Batch 처리가 대표적인 예다. 반대로 이전 결과가 다음 계산의 입력인 짧은 연쇄, 복잡한 분기와 작은 요청은 GPU에 일을 맡기는 준비 비용까지 고려해야 한다. 웹 서버·Compiler·게임에도 병렬화할 부분이 있으므로 프로그램 이름만으로 전체를 한 장치에 배정하지 않는다.

### 독립적인 결과와 다음 반복의 입력

길이 784인 벡터와 784×256 행렬을 곱하면 결과는 길이 256인 벡터다. 각 결과 원소는 같은 입력과 서로 다른 열을 사용하므로 다른 결과 원소가 완성될 때까지 기다릴 필요가 없다. 각 원소 안의 합산도 나눌 수 있지만 Floating-point에서는 합산 순서가 결과의 오차에 영향을 줄 수 있다.

다음은 더 작은 정수 입력으로 결과 열의 계산 순서를 바꿔 보는 예제다. 뒤의 Fibonacci 반복에서는 반대로 앞의 두 값이 다음 값에 필요하다. 이 Python 코드는 의존 관계를 보여 주며 실제 GPU 작업이나 병렬 성능을 측정하지 않는다.

```run-python
x = [1, 2, 3]
weights = [[1, 2], [3, 4], [5, 6]]


def column_sum(column):
    return sum(value * row[column] for value, row in zip(x, weights))


forward = [column_sum(i) for i in (0, 1)]
backward = {i: column_sum(i) for i in (1, 0)}
assert forward == [backward[0], backward[1]] == [22, 28]
print("independent columns:", forward)


def fibonacci(n):
    if n < 0:
        raise ValueError("n은 음수일 수 없습니다")
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


values = [fibonacci(i) for i in range(11)]
assert values[-1] == 55
print("dependent steps:", values)
```

Fibonacci의 이 반복식에는 순차 의존성이 있다. 모든 Fibonacci 계산이 반드시 같은 반복식만 사용해야 하거나 여러 입력을 병렬로 처리할 수 없다는 뜻은 아니다. 선택한 알고리즘에서 무엇이 서로 의존하는지 먼저 살펴야 한다.

### 배치와 전송, 완료 시점을 함께 측정한다

NumPy의 `A @ B`와 PyTorch의 `A @ B`는 비슷하게 보이지만 실행 장치와 내부 라이브러리, 정밀도 설정은 다를 수 있다. PyTorch의 `device='cuda'`는 Tensor를 CUDA 장치에 두는 지정이다. `torch.randn(..., device='cuda')`로 그 장치에서 값을 생성하는 것과 CPU에 있던 Tensor를 `.to('cuda')`로 옮기는 것을 같은 전송 비용으로 계산하지 않는다.

GPU 연산은 보통 비동기로 제출된다. Host에서 호출이 반환한 시각만 재면 실제 계산 완료보다 짧게 보일 수 있다. 아래는 이미 같은 CUDA 장치에 준비한 `A`, `B`로 측정 경계를 설명하는 발췌다. PyTorch와 CUDA 장치, 입력 준비가 필요한 코드이며 이 문서의 GPU 실행 결과는 아니다.

```python
torch.cuda.synchronize(A.device)
start = time.perf_counter()
C = A @ B
torch.cuda.synchronize(A.device)
elapsed = time.perf_counter() - start
```

이 범위에는 입력 생성과 Host→Device 전송이 들어 있지 않다. 전체 요청 시간을 비교하려면 필요한 전송과 결과 회수도 포함하고, 순수 연산 시간을 비교하려면 그 범위를 양쪽에서 맞춘다. 초기화·Warm-up, 반복 측정, 같은 입력·크기·타입과 결과 오차, CPU Thread 수와 GPU 정밀도 설정도 함께 기록한다. 동일한 `float32`라는 이름만으로 모든 내부 연산 정밀도가 같다고 가정하지 않는다. [PyTorch의 CUDA 비동기 실행과 정밀도](https://docs.pytorch.org/docs/2.14/notes/cuda.html)

입력 크기와 장치가 정해지지 않은 상태에서 “CPU는 몇 초, GPU는 몇 밀리초”라는 비율을 제시하지 않는다. 연산량이 작거나 전송·동기화가 큰 비중을 차지하면 GPU가 유리하지 않을 수 있다. CPU와 GPU를 비교할 때는 프로그램 전체의 이름보다 나눌 수 있는 작업과 실제 완료 비용을 기준으로 삼는다.

이미지에 같은 계산을 반복하는 예는 [CNN](/wiki/ai-machine-learning-topic-de3a4dbc880f/)에서 볼 수 있다. 실행할 Thread를 바꾸며 상태를 저장·복원하는 과정은 [Context Switch](/wiki/computer-systems-network-topic-6d5c07c64010/)와 연결된다.
