---
layout: default
title: 명령어
nav_order: 5
permalink: /wiki/computer-systems-network-topic-4a1a79029429/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-4a1a79029429
projection_sha256: 4b2c38df7f603f12d95c956a15640ae5d8f0c47d8e401bcb82b5aead45a97123
parent: 컴퓨터 구조
content_status: ready
public_parent_id: Wiki/computer-systems-network/computer-architecture
search_terms:
- 명령어
- Instruction
- Opcode
- ModR/M
- SIB
- REX
- 가변 길이 명령어
- Fetch Decode Execute
- RIP
- RIP 상대 주소
- Instruction Pointer
- 명령어 Page 경계
- disassemble
- TCG
grand_parent: Systems
ancestor: CS 기초
---

# 명령어
{: .no_toc }

메모리에 `48 c7 c7 01 00 00 00`이 있다. x86-64의 64 Bit 모드에서 첫 Byte부터 명령어로 읽으면 `mov rdi, 1`이다. 첫 Byte를 건너뛰고 읽으면 `mov edi, 1`로 해석할 수 있다. Byte는 그대로인데 시작 위치가 달라지면 명령어의 크기와 대상 Register가 달라진다.

CPU 명령어는 수행할 연산과 피연산자를 나타내는 Bit의 조합이다. 어떤 명령어로 읽을지는 ISA와 실행 모드, 시작 위치에 달려 있다. 데이터로 저장한 Byte도 disassembler에 넘기면 명령어처럼 보일 수 있으므로, 그럴듯한 출력만으로 실제 실행 경로였다고 판단해서는 안 된다.

## Opcode와 피연산자를 나눈다

`mov rdi, 1`은 1이라는 값을 RDI에 넣는 연산이다. `mov`는 연산 이름이고 RDI와 1은 피연산자다. Intel 문법은 목적지를 먼저 써 `mov rdi, 1`로, AT&T 문법은 원본을 먼저 써 `movq $1, %rdi`로 표시한다. 같은 연산을 다른 문법으로 나타낸 것이다.

예제의 일곱 Byte는 다음처럼 나뉜다.

| Byte | 역할 | 이 예제에서의 해석 |
| --- | --- | --- |
| `48` | REX Prefix | W Bit가 1이므로 64 Bit 피연산자를 사용한다. |
| `c7` | Opcode | Immediate를 Register 또는 Memory에 넣는 MOV 계열이다. |
| `c7` | ModR/M | `mod=11`, `reg=000`, `r/m=111`이다. 메모리 주소 계산 없이 RDI를 고른다. |
| `01 00 00 00` | Immediate | Little-endian의 32 Bit 값 1이다. 이 64 Bit MOV 형식에서는 부호 확장한다. |

Opcode와 ModR/M의 Byte 값이 모두 `c7`이어도 맡은 역할은 다르다. ModR/M의 `reg` 필드는 이 형식에서는 Register 이름 대신 Opcode의 확장값 `/0`을 나타낸다. `mod=11`이므로 Register를 직접 지정하며 SIB나 Displacement는 없다.

x86 명령어는 1~15 Byte의 가변 길이 인코딩을 사용한다. Prefix·Opcode·ModR/M·SIB·Displacement·Immediate 중 필요한 필드가 형식에 따라 나타난다. 위 표는 이 예제의 REX와 C7 형식을 설명한다. VEX·EVEX·REX2 등 다른 Prefix까지 같은 고정 표로 해석할 수는 없다. [Intel XED의 명령어 구성과 모드](https://intelxed.github.io/ref-manual/)

메모리 피연산자를 쓰는 형식에서는 ModR/M과 필요에 따른 SIB가 주소 계산에 관여한다. SIB의 Scale·Index·Base는 `Base + Index × Scale + Displacement` 같은 주소를 구성하는 데 쓰인다. Prefix는 피연산자 크기만 바꾸는 것이 아니라 주소 크기, 반복이나 Lock 등의 의미에도 관여하므로, Prefix가 몇 Byte인지만 세어서 전체 길이를 정할 수는 없다.

명령어의 길이와 Register 폭도 서로 다른 값이다. AArch64의 A64는 32 Bit 고정 길이 명령어를 사용하고, RISC-V의 기본 명령어는 32 Bit이지만 C 확장에서는 16 Bit 압축 명령어도 함께 사용한다. RISC-V에는 더 긴 인코딩을 위한 규칙도 있으므로 전체를 언제나 2·4 Byte뿐이라고 일반화하지 않는다. 고정 길이는 경계를 일정하게 만들고, 짧은 인코딩은 코드 공간을 줄이는 데 쓰일 수 있다. 이것만으로 특정 ISA의 실행 속도나 모든 프로그램의 코드 크기 순위를 정할 수는 없다. [Arm의 A64 소개](https://developer.arm.com/-/media/Files/pdf/graphics-and-multimedia/ARM_CPU_Architecture.pdf), [RISC-V의 명령어 길이 인코딩](https://docs.riscv.org/reference/isa/v20250508/unpriv/intro.html)

## 시작 위치를 바꾸어 읽는다

다음 코드는 64 Bit 모드의 MOV 중 `[48] C7 /0`과 Register 직접 지정만 읽는 작은 Decoder다. 메모리 피연산자나 다른 Opcode를 만나면 실습 범위 밖이라고 알린다. x86 전체를 디코딩하거나 Machine Code를 실행하는 프로그램은 아니다.

`pos`는 아직 읽지 않은 Byte를 가리킨다. `48`이 있으면 한 Byte를 소비하고 64 Bit 형식을 선택한다. 뒤의 Opcode와 ModR/M을 읽은 다음 4 Byte Immediate를 해석하므로, 소비한 길이를 시작 위치와 함께 계산할 수 있다.

```run-python
REGISTERS = {
    32: ("eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"),
    64: ("rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi"),
}


def decode_mov(data, start=0):
    # 64-bit mode의 [48] C7 /0, Register 직접 지정 형식만 다룬다.
    if not 0 <= start < len(data):
        raise ValueError("시작 위치에 Byte가 없다")
    pos = start
    width = 64 if data[pos] == 0x48 else 32
    if width == 64:
        pos += 1
    if len(data) - pos < 6:
        raise ValueError("명령어의 Byte가 부족하다")
    opcode, modrm = data[pos:pos + 2]
    mod, extension, register = modrm >> 6, (modrm >> 3) & 7, modrm & 7
    if opcode != 0xC7 or mod != 3 or extension != 0:
        raise ValueError("이 실습에서 다루지 않는 명령어 형식이다")
    immediate = int.from_bytes(data[pos + 2:pos + 6], "little", signed=width == 64)
    return REGISTERS[width][register], immediate, pos + 6 - start


data = bytes.fromhex("48 c7 c7 01 00 00 00 c3")
for start in (0, 1):
    register, value, size = decode_mov(data, start)
    print(f"시작={start}: mov {register}, {value}; 길이={size}, 다음 위치={start + size}")
print("앞 7 Byte를 정수로 읽으면:", hex(int.from_bytes(data[:7], "little")))
print("8 Byte를 정수로 읽으면:", hex(int.from_bytes(data, "little")))

negative = bytes.fromhex("48 c7 c7 ff ff ff ff")
for start in (0, 1):
    register, value, size = decode_mov(negative, start)
    print(f"시작={start}: mov {register}, {value}; RDI의 결과 Bit={value & ((1 << 64) - 1):016x}")

assert decode_mov(data, 0) == ("rdi", 1, 7)
assert decode_mov(data, 1) == ("edi", 1, 6)
assert decode_mov(negative, 0) == ("rdi", -1, 7)
assert decode_mov(negative, 1) == ("edi", 0xFFFFFFFF, 6)
for code in (b"", data[:6], bytes.fromhex("c7 07 01 00 00 00")):
    try:
        decode_mov(code)
    except ValueError as error:
        print("거절:", error)
    else:
        raise AssertionError("지원 범위 검사가 실패했다")
print("확인: 시작 위치·길이·Immediate의 부호 확장 검사 통과")
```

Python 3.9.6에서 실행한 결과다. Register 값은 명령어의 동작을 계산한 모델의 값이며 실제 x86 CPU나 PintOS를 실행한 출력은 아니다.

```text
시작=0: mov rdi, 1; 길이=7, 다음 위치=7
시작=1: mov edi, 1; 길이=6, 다음 위치=7
앞 7 Byte를 정수로 읽으면: 0x1c7c748
8 Byte를 정수로 읽으면: 0xc300000001c7c748
시작=0: mov rdi, -1; RDI의 결과 Bit=ffffffffffffffff
시작=1: mov edi, 4294967295; RDI의 결과 Bit=00000000ffffffff
거절: 시작 위치에 Byte가 없다
거절: 명령어의 Byte가 부족하다
거절: 이 실습에서 다루지 않는 명령어 형식이다
확인: 시작 위치·길이·Immediate의 부호 확장 검사 통과
```

0부터 시작하면 REX가 포함되어 7 Byte, 1부터 시작하면 6 Byte를 소비한다. 두 경우 모두 배열의 위치 7에 도착하지만, 읽은 명령어는 각각 RDI와 EDI를 대상으로 한다. Immediate가 1일 때는 최종 RDI 값의 차이가 드러나지 않는다. `ff ff ff ff`를 사용하면 64 Bit 형식의 부호 확장과 32 Bit Register 쓰기의 상위 Bit 초기화를 구분할 수 있다.

마지막 `c3`은 앞선 일곱 Byte 뒤에 붙인 RET다. 앞 7 Byte를 정수로 읽은 값과 8 Byte 전체를 읽은 값이 다른 이유도 이 마지막 Byte에 있다. `x/1gx`로 메모리를 보면 명령어 경계와 상관없이 8 Byte를 읽으므로, 앞 명령어와 다음 명령어 일부가 하나의 수에 합쳐질 수 있다. 정수의 읽기 단위는 [데이터 표현](/wiki/computer-systems-network-topic-e647548deca2/)에서 다룬다.

실습에서 거절한 `c7 07 01 00 00 00`은 Memory를 목적지로 삼는 형식이다. 여기서 거절했다는 것은 전체 x86에서도 잘못된 명령어라는 뜻이 아니다. 범용 disassembler에는 주소 지정 방식과 실행 모드까지 처리하는 Decoder가 필요하다.

## Assembler 결과와 대조한다

Apple Clang 17.0.0에서 `x86_64-apple-macos11`을 대상으로 독립 Assembly 예제를 object로 만들고, Apple LLVM 17.0.0의 `objdump -d`로 Byte와 명령어를 확인했다. object를 실행하거나 PintOS 커널 전체를 빌드한 것은 아니다. `objdump -d`는 입력 파일의 실행 가능한 Section을 디스어셈블한다. [LLVM objdump](https://llvm.org/docs/CommandGuide/llvm-objdump.html)

| 입력 또는 확인한 Byte | 확인한 명령어 | 길이 |
| --- | --- | --- |
| `48 c7 c7 01 00 00 00` | `movq $0x1, %rdi` | 7 Byte |
| `c7 c7 01 00 00 00` | `movl $0x1, %edi` | 6 Byte |
| `bf 01 00 00 00` | `movl $0x1, %edi` | 5 Byte |
| `48 c7 c7 ff ff ff ff` | `movq $-0x1, %rdi` | 7 Byte |
| `c7 c7 ff ff ff ff` | `movl $0xffffffff, %edi` | 6 Byte |

`movl $1, %edi`를 Assembler에 입력했을 때는 더 짧은 `bf` 형식이 나왔다. 반면 `c7 c7 01 00 00 00`을 Byte로 넣어 디스어셈블해도 같은 MOV로 읽힌다. Assembly 문장이 같다고 Machine Code가 하나로만 정해지는 것은 아니다. 실습 Decoder가 BF 형식을 지원하지 않는 이유도 일부 인코딩만 골라 다루기 때문이다.

## 읽고, 해석하고, 상태를 바꾼다

앞의 MOV를 CPU가 처리하는 과정을 세 단계로 나누어 보자. **Fetch**는 실행 위치에서 명령어 Byte를 가져오는 단계다. **Decode**는 그 Byte에서 연산, 피연산자와 길이를 알아내는 단계다. **Execute**에서는 해석한 연산에 따라 Register나 Memory 등의 상태가 바뀐다. 예제의 `mov rdi, 1`은 RDI를 1로 바꾸며, 산술 연산의 결과를 나타내는 FLAGS는 바꾸지 않는다. 모든 명령어가 같은 상태를 갱신하는 것은 아니다. [Intel의 명령어 처리 설명](https://www.intel.com/content/www/us/en/education/k12/the-journey-inside/explore-the-curriculum/microprocessors.html)

이 세 단계는 동작을 이해하는 모델이다. 실제 CPU가 한 명령어의 모든 단계를 끝낸 뒤에야 다음 명령어를 시작한다는 뜻은 아니다. Pipeline은 여러 명령어의 처리를 겹치고, Out-of-order 실행과 분기 예측은 의존 관계와 예상 경로를 이용해 일부 연산을 앞서 처리한다. 잘못 예측한 경로의 결과를 프로그램의 확정된 결과로 삼을 수는 없지만, 그 과정이 Cache 등 내부 상태에 남기는 영향은 별도로 살펴야 한다. 구체적인 단계 수나 예측 적중률은 CPU와 작업에 따라 달라진다. [Intel의 추측 실행과 하드웨어 동작](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/technical-documentation/hardware-behavior-related-to-speculative-execution.html)

PintOS의 명령어 주소는 가상 주소다. 주소 변환 결과가 TLB에 있으면 매번 Page Table 전체를 다시 읽을 필요가 없고, 코드가 Instruction Cache에 있으면 매번 RAM에서 새로 가져올 필요도 없다. 반대로 주소가 매핑되지 않았거나 실행 권한을 만족하지 못하면 명령어를 가져오는 중에도 Fault가 발생할 수 있다. 매핑과 권한은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서 이어서 다룬다. 디스어셈블할 수 있는 Byte가 존재한다는 조건과 CPU가 그 위치를 실행할 수 있다는 조건을 구분해야 한다.

## RIP가 가리키는 위치

x86-64에서 명령어 위치를 나타내는 Register가 RIP다. 앞의 7 Byte MOV가 `0x1000`에서 정상적으로 끝나고 다른 제어 이동이 없다면, 다음 명령어는 `0x1007`에서 시작한다. 이 계산에는 디코딩한 길이가 필요하다. RIP를 늘 `1`이나 `4`만큼 증가시키는 것으로 가변 길이 명령어를 따라갈 수는 없다. [AMD64의 Register와 명령어 디버깅](https://www.oracle.com/application-development/technologies/amd64-debugging-oracle-developer-studio-dbx.html)

RIP는 일반 Register처럼 `mov rip, 값`으로 쓰는 대상이 아니다. Jump와 Call, Return 등의 제어 이동은 각 명령어의 규칙에 따라 실행 위치를 정한다. 다음 표의 Call과 Return은 같은 코드 영역에서 사용하는 일반적인 near 형식을 가리킨다.

| 상황 | 이어서 실행할 위치 | 함께 구분할 값 |
| --- | --- | --- |
| 순차 실행 | 현재 명령어의 시작 주소 + 길이 | 시작 주소와 다음 주소가 다르다. |
| 상대 Jump | 다음 명령어 주소 + 부호 있는 변위 | 조건 분기가 성립하지 않으면 순차 경로로 간다. |
| 상대 Call | 다음 명령어 주소 + 부호 있는 변위 | 다음 명령어 주소를 Stack에 반환 주소로 저장한다. |
| Return | Stack에서 복원한 반환 주소 | 현재 RET 다음 주소를 계산해서 돌아가는 것이 아니다. |
| PintOS의 SYSCALL 진입 | 설정된 Kernel 진입점 | User 복귀 주소는 SYSCALL 다음 주소이며 RCX로 전달된다. |

마지막 행은 `syscall_entry`가 RCX를 저장하는 이유와 연결된다. 이 버전의 반환 경로는 복원한 RCX를 사용하는 `sysretq`다. `iretq`와 `sysretq`를 같은 Stack 복원 명령어로 설명해서는 안 된다. [PintOS의 System Call 진입과 복귀](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall-entry.S)

### RIP 상대 주소의 기준

`movq %rbx, temp1(%rip)`는 RBX 값을 메모리에 저장한다. 이 주소 형식에서는 **현재 명령어가 끝난 다음 주소**에 부호 있는 32 Bit Displacement를 더한다. 예를 들어 시작 주소가 `0x1000`, 명령어 길이가 7, Displacement가 `0x20`이면 저장 위치는 `0x1007 + 0x20 = 0x1027`이다. 현재 명령어의 시작 주소에 더하면 7 Byte 어긋난다. [Intel SDM의 RIP 상대 주소](https://cdrdv2-public.intel.com/835757/325383-sdm-vol-2abcd.pdf)

Displacement는 앞뒤 방향을 나타낼 수 있으며, 32 Bit 부호 있는 값의 범위는 −2³¹부터 2³¹−1까지다. 코드와 데이터가 같은 거리만큼 이동하면 둘 사이의 상대 거리도 유지되므로, 이 형식은 위치 독립 코드에서 유용하다. 그렇다고 모든 주소가 반드시 RIP 상대 형식이어야 하는 것은 아니다. `lea`에 이 주소 형식을 사용하면 계산한 주소를 얻으며, 그 주소에 저장된 데이터를 읽지는 않는다. 메모리 피연산자를 가진 MOV와 구분할 부분이다.

### 한 명령어가 두 Page에 걸치는 경우

4 KiB Page에서 `0x4000`부터 `0x4fff`까지는 한 Page다. `0x4ffd`에서 시작하는 7 Byte 명령어는 `0x5003`까지 이어지므로 두 Page의 Byte가 필요하다. 첫 Page가 실행 가능하더라도 두 번째 Page가 없거나 실행할 수 없다면 Fetch를 끝내지 못할 수 있다.

다음 코드는 다음 주소·상대 주소·Page 범위를 정수 연산으로 확인한다. `executable_pages`는 실습에서 정한 집합이며, 실제 Page Table이나 CPU의 권한 검사를 구현한 것은 아니다. 값이나 시작 위치를 바꾸면 어느 경계에서 필요한 Page가 늘어나는지 볼 수 있다.

```run-python
PAGE_SIZE = 4096


def pages_for_instruction(start, length):
    if start < 0 or not 1 <= length <= 15:
        raise ValueError("start >= 0, 1 <= length <= 15")
    first = start // PAGE_SIZE * PAGE_SIZE
    last = (start + length - 1) // PAGE_SIZE * PAGE_SIZE
    return list(range(first, last + PAGE_SIZE, PAGE_SIZE))


start, length = 0x1000, 7
next_rip = start + length
for displacement in (0x20, -0x20):
    encoded = displacement.to_bytes(4, "little", signed=True)
    restored = int.from_bytes(encoded, "little", signed=True)
    target = next_rip + restored
    print(f"RIP-relative: next={next_rip:#x}, disp={restored:+d}, target={target:#x}")

call_start, call_length, displacement = 0x2000, 5, 0x10
return_address = call_start + call_length
call_target = return_address + displacement
print(f"CALL: target={call_target:#x}, saved return={return_address:#x}")
print(f"RET: restored RIP={return_address:#x}")

executable_pages = {0x4000}
for start in (0x4FF8, 0x4FFD, 0x4FFF):
    pages = pages_for_instruction(start, 7)
    missing = [page for page in pages if page not in executable_pages]
    print(f"bytes={start:#x}..{start + 6:#x}, pages={[hex(p) for p in pages]}")
    print(f"  executable pages missing: {[hex(p) for p in missing]}")

for length in (0, 16):
    try:
        pages_for_instruction(0x4000, length)
    except ValueError as error:
        print(f"length={length}: {error}")
```

Python 3.9.6에서 실행한 결과다. CALL과 RET 줄도 저장할 주소를 계산한 모형의 출력이다.

```text
RIP-relative: next=0x1007, disp=+32, target=0x1027
RIP-relative: next=0x1007, disp=-32, target=0xfe7
CALL: target=0x2015, saved return=0x2005
RET: restored RIP=0x2005
bytes=0x4ff8..0x4ffe, pages=['0x4000']
  executable pages missing: []
bytes=0x4ffd..0x5003, pages=['0x4000', '0x5000']
  executable pages missing: ['0x5000']
bytes=0x4fff..0x5005, pages=['0x4000', '0x5000']
  executable pages missing: ['0x5000']
length=0: start >= 0, 1 <= length <= 15
length=16: start >= 0, 1 <= length <= 15
```

`0x4ff8`의 일곱 Byte는 첫 Page 안에서 끝나지만, `0x4ffd`와 `0x4fff`는 `0x5000` Page까지 필요하다. 길이 0과 16을 거절한 것은 함수의 입력 조건이며, 이 Python 예외를 실제 x86의 예외 종류와 대응시켜서는 안 된다. 실제 Fetch Fault는 Handler가 매핑이나 권한 문제를 해결한 경우 다시 시도할 수 있다. 처리할 수 없는 접근이라면 프로세스 종료 등 다른 경로로 이어진다.

## PintOS에서 만나는 명령어

다음 Byte는 같은 독립 object에서 확인한 x86-64 인코딩이다. PintOS의 해당 소스에 명령어가 쓰이는 위치도 함께 확인했다. 실제 커널의 주소와 함수 전체의 최적화 결과까지 측정한 표는 아니다.

| Byte | 명령어 | 읽을 때 볼 의미 |
| --- | --- | --- |
| `0f 05` | `syscall` | 설정된 System Call 진입 경로로 제어를 옮긴다. |
| `48 cf` | `iretq` | 저장한 Interrupt Frame에 따라 실행 상태를 복원한다. 항상 User Mode로 돌아가는 것은 아니다. |
| `48 89 e5` | `movq %rsp, %rbp` | RSP 값을 RBP로 복사한다. 모든 함수에 이 프롤로그가 있는 것은 아니다. |
| `e8` + 4 Byte Displacement | `call`의 상대 주소 형식 | 다음 명령어 기준의 변위로 호출 위치를 정한다. |
| `c3` | `ret` | 저장된 반환 주소로 복귀한다. |
| `f4` | `hlt` | 정지 조건이 해제될 때까지 명령 실행을 기다리는 데 쓰인다. |
| `fa` | `cli` | Maskable Interrupt를 제어하는 IF를 내린다. 모든 예외를 막는 것은 아니다. |
| `fb` | `sti` | IF를 올린다. 활성화 시점의 규칙도 함께 적용된다. |

`lib/user/syscall.c`의 래퍼는 인자와 System Call 번호를 Register에 넣고 `syscall`을 실행한다. `threads/thread.c`의 idle 경로에는 `sti; hlt`가, `do_iret()`에는 `iretq`가 있다. `intr_disable()`과 `intr_enable()`은 각각 `cli`와 `sti`를 사용한다. [System Call 래퍼](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/lib/user/syscall.c), [Thread 구현](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c), [Interrupt 제어](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c)

명령 길이를 비교할 때는 같은 이름의 다른 인코딩도 구분한다. Intel SDM에 정의된 접두사 없는 `90`은 1바이트 `nop`이며, 여러 바이트를 쓰는 NOP 형식도 있다. 앞의 `48 c7 c7 01 00 00 00`이 `0x4000b0`에서 정상적으로 끝나고 분기·인터럽트·예외가 없다면 다음 위치는 7바이트 뒤인 `0x4000b7`이다. 길이 1의 NOP, 길이 2의 SYSCALL, 길이 7의 이 MOV를 같은 고정 폭으로 세면 실행 위치를 잘못 읽게 된다. [Intel SDM Volume 2B, NOP](https://cdrdv2-public.intel.com/922481/253667-092-sdm-vol-2b.pdf#page=168)

### syscall_entry의 첫 세 명령어

`lrn-pintos`의 `9d1b14c` 버전은 System Call 진입에서 다음 세 명령어로 시작한다. 진입 직후의 Register를 보관하고 User Stack 주소를 RBX로 옮기는 부분이다. [syscall-entry.S](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall-entry.S)

```asm
movq %rbx, temp1(%rip)
movq %r12, temp2(%rip)
movq %rsp, %rbx
```

같은 명령어 형태를 독립 object로 확인하면 각각 7·7·3 Byte다. 앞의 두 명령어는 RIP 상대 주소에 저장하므로 4 Byte Displacement가 들어간다. 세 번째는 Register 사이의 복사라 `48 89 e3` 세 Byte로 끝난다. 소스 세 줄이라는 사실만으로 길이를 알 수는 없으며, 이 경우의 합계는 17 Byte다. 목적 파일의 재배치가 끝나기 전 Displacement를 실제 실행 주소로 해석해서는 안 된다.

## 실행을 시작할 주소를 준비한다

PintOS는 새 Thread를 만들 때 그 Thread가 처음 실행할 주소를 `t->tf.rip`에 준비한다. `9d1b14c` 버전의 `thread_create()`에서 이 값은 사용자가 넘긴 `function`이 아니라 `kernel_thread`다. `function`과 `aux`는 각각 RDI와 RSI에 들어갈 값으로 기록한다. 다음은 해당 초기화의 일부이며 독립 실행용 코드는 아니다. [Thread 생성과 전환](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c)

```c
t->tf.rip = (uintptr_t) kernel_thread;
t->tf.R.rdi = (uint64_t) function;
t->tf.R.rsi = (uint64_t) aux;
```

Scheduler가 이 Thread를 처음 선택하면 `thread_launch()`가 준비된 Frame을 `do_iret()`에 넘긴다. 복원된 RIP에서 `kernel_thread(function, aux)`가 시작되고, 이 함수가 Interrupt를 활성화한 뒤 `function(aux)`를 호출한다. 호출이 반환하면 `thread_exit()`로 끝난다. 따라서 `kernel_thread()`를 먼저 실행한 다음 `do_iret()`로 넘어가는 순서로 읽으면 안 된다.

이미 실행하던 Thread를 다시 선택할 때는 처음 진입할 함수가 아니라 중단했던 Kernel 경로로 돌아가야 한다. `thread_launch()`는 현재 Thread의 Frame에 `out_iret` 위치를 저장하고 다음 Thread의 Frame으로 전환한다. 같은 `rip` 필드라도 새 Thread의 시작점인지, 이전 실행의 재개 지점인지 문맥을 확인한다. 복원할 Register와 Segment의 역할은 [do_iret](/wiki/computer-systems-network-topic-41565131cfca/)에서 다룬다.

User 프로그램을 처음 적재할 때는 또 다른 Frame을 준비한다. `load()`의 `if_->rip = ehdr.e_entry`는 ELF가 지정한 시작 주소를 **나중에 복원할 Frame**에 넣는 대입이다. 이 줄을 실행하는 순간 현재 Kernel의 RIP가 ELF 시작점으로 바뀌는 것은 아니다. 시작 주소를 임의의 고정 숫자로 외우지 말고 해당 실행 파일의 Header에서 확인한다. [ELF Loader](/wiki/computer-systems-network-topic-a6a32eb78db0/)에서 적재와 Stack 구성을 함께 살펴본다. [실제 process.c](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c)

`fork()`의 자식은 부모가 넘긴 User Frame을 복사하고 `if_.R.rax = 0`으로 반환값을 바꾼 뒤 `do_iret(&if_)`로 들어간다. 여기서 재사용하는 RIP는 User의 fork 호출 이후 복귀 위치다. 자식의 Kernel 준비 함수인 `__do_fork` 주소와 구분해야 한다. 또한 이 버전의 `__do_fork(void *aux)` 인자는 `struct fork_args *`이며, `aux` 전체를 `struct intr_frame *`로 잘못 형변환해서 읽으면 안 된다. [fork](/wiki/computer-systems-network-topic-4af2e32913a4/)에서 복사와 실패 정리를 이어서 다룬다.

## 장애 당시의 명령어와 Register를 함께 읽는다

GDB에서는 `x/7bx addr`로 일곱 Byte를, `x/1i addr`로 해당 위치의 명령어 하나를 읽는다. 명령어 하나가 반드시 일곱 Byte인 것은 아니다. `x/i`의 단위는 명령어이며, `x/gx`의 단위는 8 Byte다. 이 명령은 표시 방식을 바꾸는 것이지 대상 프로그램을 한 단계 실행하는 것이 아니다. [GDB 메모리와 명령어 조회](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html)

함수의 명령어 경계와 Byte를 함께 볼 때는 `disassemble /r syscall_entry`처럼 범위를 함수로 정한다. 이어지는 두 명령어의 시작 주소 차이로 앞 명령어의 길이를 확인할 수 있다. `x/1i` 직후의 `$_`를 다음 명령어 주소라고 가정해 반복문을 만들면 안 된다. `$_`는 마지막으로 조사한 주소이므로, 같은 위치를 다시 읽는 잘못된 길이 측정이 될 수 있다. [GDB 디스어셈블](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html)

실제로 한 명령어를 실행하려면 멈춘 대상에서 `si`를 사용한다. 실행 전후 `x/i $rip`와 `info registers`를 비교하면 순차 진행인지 제어 이동인지 볼 수 있다. `si`는 Call 안으로 들어가며 `ni`는 Call이 돌아올 때까지 진행한다. `load()`에서 `finish`했다고 현재 `$rip`가 곧바로 User의 ELF 진입점이 되는 것은 아니다. `load()`의 Kernel 호출자로 돌아온 시점과, 준비한 Frame으로 User 실행을 시작하는 시점을 나누어 관찰한다. [GDB의 명령어 단위 실행](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html)

Page Fault를 조사한다면 현재 Handler의 RIP와 Fault 당시 저장된 `f->rip`를 구분한다. 아래는 PintOS의 유효한 `struct intr_frame *f`와 Debug Symbol이 있는 상황에서 사용할 명령의 예다. 여기서는 실제 GDB Session을 실행하지 않았다.

```gdb
p/x f->rip
x/1i f->rip
p/x f->R.rax
```

실패한 명령어가 RAX를 주소로 쓰는 Load였다면 **저장된** `f->R.rax`를 읽어야 한다. Handler에서 현재 `$rax`가 0이라는 이유만으로 원래 접근도 NULL이었다고 결론낼 수 없다. 실패한 주소인 CR2와 Error Code, 당시 접근 권한도 함께 대조한다. Instruction Fetch 자체가 실패했다면 해당 주소의 Byte를 현재 메모리에서 읽지 못할 수도 있다. 이 경우에는 실행 파일과 주소 배치를 함께 확인해야 한다. [Page Fault](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에서 두 시점과 주소의 역할을 구분한다.

Backtrace도 Stack에서 Return Address를 아무렇게나 찾아 나열하는 작업은 아니다. Frame과 Unwind 정보를 사용하며 최적화·누락된 Symbol·손상 상태가 결과에 영향을 준다. 이상한 주소가 명령어로 디스어셈블된다는 사실 하나만으로 Stack 손상을 확정하지 말고, 실제 반환 경로와 저장한 주소를 확인한다.

명령어 수행 중 발생한 Fault와 비동기 Interrupt, 의도적인 System Call은 저장 주소와 복귀 규칙이 다르다. Page Fault에서 저장된 RIP는 재시도할 명령어의 위치이며, 이를 무조건 다음 명령어로 증가시키면 실패한 연산을 건너뛰게 된다. Breakpoint의 경우에도 CPU가 저장한 주소와 Debugger가 보정해서 보여 주는 주소를 구분한다. 구조체 내부의 RIP를 찾을 때는 Debug Symbol과 `ptype struct intr_frame`을 먼저 확인하며, 다른 빌드에서 가져온 고정 Offset을 그대로 적용하지 않는다.

Linux에서는 실행 파일을 읽는 `objdump -d vmlinux`, 수집한 성능 자료를 코드와 연결하는 `perf annotate`, Oops의 `Code:` Byte를 디스어셈블하는 `scripts/decodecode`가 서로 다른 입력을 다룬다. `perf record`의 주소 샘플 자체를 명령어 Byte라고 생각해서는 안 된다. [perf annotate](https://man7.org/linux/man-pages/man1/perf-annotate.1.html), [Linux 6.16의 decodecode](https://github.com/torvalds/linux/blob/v6.16/scripts/decodecode)

Kprobes는 실행 중인 코드에 관찰 지점을 넣는 기능이다. x86의 Breakpoint 경로에서는 `int3`가 쓰이지만, 최적화 조건에 따라 Jump를 사용하는 경우도 있다. 따라서 덤프한 코드가 원래 파일과 다르면 Breakpoint나 Probe가 개입했는지도 확인해야 한다. [Linux Kprobes](https://docs.kernel.org/trace/kprobes.html)

## QEMU가 번역한 코드와 Guest의 명령어

QEMU의 TCG는 Guest 명령어의 동작을 중간 표현으로 만들고 Host에서 실행할 코드로 바꾼다. Translation Block에는 번역에 필요한 CPU 상태도 연결된다. 같은 Guest 주소라도 실행 모드나 권한 등 필요한 상태가 다르면 같은 TB를 그대로 쓸 수 있다고 단정할 수 없다.

다음 TB를 찾을 때는 Guest Program Counter와 CPU 상태를 사용하며, 조건이 맞는 기존 TB를 재사용할 수 있다. Guest 코드가 변경되면 그 코드를 번역한 결과와 직접 연결한 경로도 무효화해야 한다. 반면 CR3가 바뀔 때마다 모든 TB가 반드시 폐기된다고 설명하는 것은 부정확하다. QEMU는 주소 변환과 코드 캐시의 연결을 고려해 불필요한 전체 폐기를 피한다. [QEMU Translator Internals](https://www.qemu.org/docs/master/devel/tcg.html)

TCG의 구체적인 함수 이름이나 TB의 최대 크기를 다른 버전에도 그대로 적용하지 않는다. 평균 명령어 길이로 커널의 명령어 개수를 추정하는 대신, 필요한 빌드의 object와 디스어셈블 결과를 기준으로 확인한다. Byte를 얻은 대상, 실행 모드, 시작 위치가 무엇인지 먼저 정해야 명령어와 그 실행 결과를 같은 문맥에서 읽을 수 있다.
