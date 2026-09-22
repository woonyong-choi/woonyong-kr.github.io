---
layout: default
title: 데이터 표현
nav_order: 2
permalink: /wiki/computer-systems-network-topic-e647548deca2/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-e647548deca2
projection_sha256: 4042c1c9c30b5298be7071e06dcd5fdf58930126b8b04c760249287af669e49c
parent: 컴퓨터 구조
content_status: ready
public_parent_id: Wiki/computer-systems-network/computer-architecture
search_terms:
- Byte Order
- Endianness
- Little-endian
- Big-endian
- signed
- unsigned
- 바이트 정수 해석
- GDB 메모리 덤프
- off_t
- 부동 소수점
- 고정 소수점
- IEEE 754
- Floating Point
- Fixed Point
- binary32
- binary64
- '17.14'
- Decimal
grand_parent: Systems
ancestor: CS 기초
---

# 데이터 표현
{: .no_toc }

Port 번호 9000을 출력했는데 메모리에는 `28 23`이 보일 수 있다. 값이 바뀐 것이 아니라, 16진수 `0x2328`을 이루는 두 Byte가 Little-endian 순서로 놓인 것이다. 같은 메모리를 몇 Byte씩 묶는지, 어떤 순서와 부호로 읽는지에 따라 표시되는 정수가 달라진다.

먼저 소켓 API가 Byte Order를 바꾸는 경우를 살펴보고, 그다음 메모리 덤프의 필드 크기와 부호를 구분한다. 이 규칙은 PintOS의 정수 필드와 PTE를 읽을 때도 그대로 필요하다. 뒤에서는 같은 Bit에 부동 소수점과 고정 소수점의 규칙을 적용해 소수를 표현한다.

## 여러 Byte의 순서

9000을 16진수로 쓰면 `0x2328`이다. 두 Byte로 나타낼 때 큰 자리인 `23`을 앞에 두는 방식은 Big-endian, 작은 자리인 `28`을 앞에 두는 방식은 Little-endian이다.

| 방식 | 낮은 주소부터 놓인 Byte |
| --- | --- |
| Big-endian | `23 28` |
| Little-endian | `28 23` |

이는 값의 대소나 문자열을 읽는 방향에 관한 규칙이 아니다. 여러 Byte로 이루어진 수를 메모리나 전송 형식에 배치하는 순서다. x86은 Little-endian을 사용하지만, 모든 실행 환경의 Byte 순서가 같다고 가정해서는 안 된다.

IP 주소와 TCP·UDP Port 같은 네트워크 필드는 Network Byte Order를 사용한다. 이는 Big-endian이다. 소켓 주소에 Host Byte Order의 숫자를 그대로 대입하면, 호스트의 Byte 순서에 따라 다른 값으로 해석될 수 있다.

## 소켓 API의 변환 함수

`htons()`는 16 Bit 값을 Host Byte Order에서 Network Byte Order로 바꾼다. 이름의 `s`는 short에서 왔다. `htonl()`은 32 Bit 값을 변환하며, 반대 방향에는 `ntohs()`와 `ntohl()`이 있다. Host와 Network의 순서가 이미 같다면 Byte를 뒤집을 필요가 없다. [byteorder 함수](https://man7.org/linux/man-pages/man3/byteorder.3.html)

아래 코드는 Port 9000의 메모리 표현과 변환 결과를 출력한다. 실제 네트워크로 데이터를 보내지 않고 Byte 표현만 비교한다.

```run-c
#include <arpa/inet.h>
#include <stdint.h>
#include <stdio.h>

static void show_bytes(const char *label, uint16_t value) {
    const unsigned char *bytes = (const unsigned char *)&value;
    printf("%s: %02X %02X\n", label, (unsigned)bytes[0], (unsigned)bytes[1]);
}

int main(void) {
    uint16_t port = 9000;
    uint16_t network_port = htons(port);
    printf("Port: %u (0x%04X)\n", (unsigned)port, (unsigned)port);
    show_bytes("호스트 메모리", port);
    show_bytes("네트워크 순서", network_port);
    printf("ntohs로 복원: %u\n", (unsigned)ntohs(network_port));
    printf("변환 없이 네트워크 값으로 읽으면: %u\n", (unsigned)ntohs(port));
    return 0;
}
```

Little-endian 환경에서는 호스트 메모리가 `28 23`, 네트워크 순서가 `23 28`로 보인다. 변환하지 않은 값을 네트워크 순서라고 해석하면 `0x2823`, 즉 10275가 된다. `ntohs(htons(port))`는 원래 값 9000으로 돌아온다.

`port`를 9001로 바꾸면 마지막 Byte가 어떻게 달라지는지 비교할 수 있다. `show_bytes()`는 `unsigned char`로 객체의 Byte 표현을 읽는다. 숫자를 출력하는 `printf()`의 결과와 메모리의 Byte를 출력한 결과를 구분해서 보아야 한다.

문자열 IP 주소를 `inet_pton()`으로 변환했다면 그 함수가 만든 주소는 이미 네트워크 표현이다. 여기에 무조건 `htonl()`을 한 번 더 적용해서는 안 된다. 반면 `sockaddr_in.sin_port`에 호스트의 Port 숫자를 넣을 때는 `htons()`를 사용한다. 어느 값이 이미 변환되었는지 API의 입력·출력 계약을 확인하는 것이 중요하다.

## 같은 메모리를 몇 Byte씩 읽을 것인가

Byte Order를 맞췄어도 읽는 크기를 잘못 잡으면 다른 값이 나온다. 메모리에 `05 00 00 00 03 00 00 00`이 있고, 이를 Little-endian으로 읽는다고 해 보자. 처음 4 Byte와 다음 4 Byte를 각각 읽으면 5와 3이다. 8 Byte 전체를 하나의 정수로 읽으면 뒤쪽의 3이 상위 32 Bit를 차지하므로 `5 + 3 × 2³² = 12,884,901,893`이 된다.

Byte가 달라진 것이 아니라 필드 경계를 달리 잡은 것이다. 같은 8 Byte는 1 Byte 값 여덟 개, 4 Byte 값 두 개, 8 Byte 값 한 개로 해석할 수 있다. 어느 쪽이 맞는지는 그 메모리에 저장한 자료형과 형식이 정한다.

부호도 별도의 조건이다. `ff ff ff ff`를 32 Bit unsigned 정수로 읽으면 `2³² - 1`, 즉 4,294,967,295다. 같은 Bit를 2의 보수 signed 정수로 읽으면 -1이다. n Bit signed 정수는 최상위 Bit가 1일 때 unsigned 값에서 `2ⁿ`을 빼서 해석한다. Endianness는 Byte의 순서이고, signed 여부는 그렇게 모은 Bit의 의미다.

12시간 시계에서 3시보다 5시간 전인 위치는 10시다. 12로 나눈 나머지에서 -2와 10이 같은 위치이듯, 8 Bit에서 -1은 255와 같은 하위 Bit를 갖는다. 이를 음수로 해석하는 규칙이 2의 보수다.

음수의 표현 규칙을 8 Bit로 비교하면 다음과 같다. 표는 패딩 없이 부호와 값을 배치한 개념 비교다.

| 표현 | +5 | -5 | +0 | -0 |
| --- | --- | --- | --- | --- |
| 부호-절대값, Sign-Magnitude | `0000 0101` | `1000 0101` | `0000 0000` | `1000 0000` |
| 1의 보수, Ones' Complement | `0000 0101` | `1111 1010` | `0000 0000` | `1111 1111` |
| 2의 보수, Two's Complement | `0000 0101` | `1111 1011` | `0000 0000` | `0000 0000` |

부호-절대값은 MSB에 부호를 두고 나머지에 크기를 담으므로, 덧셈에서도 부호와 크기를 나누어 처리해야 한다. 1의 보수는 모든 Bit를 뒤집으며, 덧셈의 최상위 Carry를 결과에 다시 더하는 End-around Carry가 필요하다. 두 방식에는 0의 표현이 둘 있지만 2의 보수에는 하나다. C99·C11에서 모든 signed 정수 타입이 무조건 2의 보수라고 가정하지는 않는다. [C11 초안의 정수 표현 규칙, 6.2.6.2](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)

N Bit에서 크기 x의 Bit를 뒤집으면 `(2^N - 1) - x`이고, 1을 더한 `2^N - x`의 하위 N Bit가 -x의 2의 보수 표현이다. 8 Bit의 -5는 `256 - 5 = 251`, 즉 `1111 1011`이다. 이 표현에서는 패딩 없는 N Bit의 범위가 `-2^(N-1)`부터 `2^(N-1)-1`까지다. 8 Bit는 -128~127, 32 Bit는 -2,147,483,648~2,147,483,647이며, 0이 비음수 쪽의 한 자리를 차지해 음수 쪽이 하나 더 많다. 같은 덧셈으로 음수를 다루는 과정은 [CPU의 결과 Bit와 Flag](/wiki/computer-systems-network-cpu-4b05d739f0f6/#계산이-남기는-flag)로 이어진다.

아래 예제는 실제 메모리 주소에 접근하는 대신 Byte Buffer를 만든다. `integer()`는 시작 위치·크기·Byte Order·부호를 명시해 읽는다. Python의 Slice는 범위를 넘어도 잘린 결과를 반환하므로, 필요한 Byte가 전부 있는지 먼저 검사한다. 마지막 PTE 예제는 같은 정수를 Flag와 주소 필드로 나누는 경우다. [int.from_bytes()](https://docs.python.org/3/library/stdtypes.html#int.from_bytes)

```run-python
def integer(data, offset, size, *, byteorder="little", signed=False):
    if size not in (1, 2, 4, 8):
        raise ValueError("크기는 1, 2, 4, 8 Byte 중 하나여야 한다")
    if offset < 0 or offset + size > len(data):
        raise ValueError("읽을 범위가 Buffer를 벗어난다")
    return int.from_bytes(data[offset:offset + size], byteorder, signed=signed)


value = bytes.fromhex("00 10 00 00 00 00 00 00")
print("4096의 Little-endian Byte:", value.hex(" "))
print("8 Byte Little-endian:", integer(value, 0, 8))
print("8 Byte Big-endian:", integer(value, 0, 8, byteorder="big"))

fields = bytes.fromhex("05 00 00 00 03 00 00 00")
for size in (1, 2, 4, 8):
    print(f"{size} Byte 정수:", integer(fields, 0, size))
print("4 Byte씩 나누면:", integer(fields, 0, 4), integer(fields, 4, 4))

negative = bytes.fromhex("ff ff ff ff")
print("같은 32 Bit의 signed / unsigned:",
      integer(negative, 0, 4, signed=True), integer(negative, 0, 4))

pte = 0x000000000800B067
flags = {"Present": 0x01, "Writable": 0x02, "User": 0x04,
         "Accessed": 0x20, "Dirty": 0x40}
# 이 값은 상위 주소·제어 Bit가 없는 4 KiB leaf PTE 예제다.
frame_base = pte & 0x000FFFFFFFFFF000
print(f"PTE: {pte:#018x} = {pte:,}")
print("설정된 Flag:", ", ".join(name for name, mask in flags.items() if pte & mask))
print(f"물리 Frame 번호: {frame_base >> 12:#x}, 시작 주소: {frame_base:#x}")

for size in (1, 2, 4, 8):
    bits = size * 8
    for n in (0, (1 << bits) - 1):
        for order in ("little", "big"):
            encoded = n.to_bytes(size, order)
            assert integer(encoded, 0, size, byteorder=order) == n
    for n in (-(1 << (bits - 1)), -1, 0, (1 << (bits - 1)) - 1):
        encoded = n.to_bytes(size, "little", signed=True)
        assert integer(encoded, 0, size, signed=True) == n
assert integer(fields, 0, 8) == 5 + 3 * (1 << 32)
assert frame_base >> 12 == 0x800B
for data, offset, size in ((b"", 0, 1), (fields, 5, 4), (fields, -1, 1)):
    try:
        integer(data, offset, size)
    except ValueError:
        pass
    else:
        raise AssertionError("범위를 벗어난 읽기가 허용됐다")
print("확인: 크기·Byte Order·signed 경계값과 Buffer 범위 검사 통과")
```

Python 3.9.6에서 실행한 결과다. PintOS나 GDB를 실행한 출력이 아니라, 명시한 Byte 배열을 해석한 결과다.

```text
4096의 Little-endian Byte: 00 10 00 00 00 00 00 00
8 Byte Little-endian: 4096
8 Byte Big-endian: 4503599627370496
1 Byte 정수: 5
2 Byte 정수: 5
4 Byte 정수: 5
8 Byte 정수: 12884901893
4 Byte씩 나누면: 5 3
같은 32 Bit의 signed / unsigned: -1 4294967295
PTE: 0x000000000800b067 = 134,262,887
설정된 Flag: Present, Writable, User, Accessed, Dirty
물리 Frame 번호: 0x800b, 시작 주소: 0x800b000
확인: 크기·Byte Order·signed 경계값과 Buffer 범위 검사 통과
```

첫 배열의 `10`은 Little-endian에서 두 번째 Byte이므로 `16 × 256 = 4096`에 해당한다. 같은 배열을 Big-endian으로 읽으면 그 Byte의 자리값이 달라져 큰 수가 나온다. 반면 두 번째 배열은 1·2·4 Byte로 읽을 때 모두 5여서 문제가 없어 보이지만, 8 Byte로 읽는 순간 두 필드가 합쳐진다. 값이 그럴듯하다는 이유만으로 읽기 단위가 맞다고 판단할 수 없는 이유다.

`fields`의 다섯 번째 Byte를 `03`에서 `01`로 바꾸면 8 Byte 결과는 `5 + 2³²`가 된다. 이 변화는 처음 4 Byte의 값 5를 바꾸지 않는다. `negative`의 마지막 Byte를 `7f`로 바꾸면 최상위 Bit가 0이 되므로 signed와 unsigned 결과가 같아진다. 출력 식과 Byte 위치를 함께 보며 확인할 수 있다.

같은 방식으로 `48 c7 c7 01 00 00 00`의 7 Byte를 Little-endian unsigned 정수로 읽으면 `0x1c7c748`이다. `68 65 6c 6c 6f`의 5 Byte는 ASCII로 `hello`, 같은 방식의 정수로는 `0x6f6c6c6568`이며 NUL은 포함하지 않는다. 여기에 `00 00 00`을 이어 붙인 8 Byte는 `0x0000006f6c6c6568`이다. 앞에서부터 2 Byte씩 두 칸을 읽으면 `0x6568`과 `0x6c6c`가 되고, 문자열로 읽으면 첫 NUL에서 끝난다.

위 예제의 `integer()`는 1·2·4·8 Byte 읽기만 허용하므로 7·5 Byte 해석을 그대로 인자로 넣는 예는 아니다. 이처럼 표시 형식을 바꾸는 것과 C에서 다른 타입의 포인터로 접근하는 것은 구분해야 한다. Cast만으로 객체의 타입·정렬·수명이 맞아지는 것은 아니다. [Pointer의 변환과 접근 조건](/wiki/programming-languages-runtime-topic-ef71fd296666/#타입을-지운-주소와-다시-읽을-타입)을 함께 확인한다. 정수 값이 나왔다는 사실만으로 유효한 포인터가 되는 것은 아니며, 명령어로 해석하려면 실행 모드와 올바른 시작 경계를 정한 Disassembly가 필요하다.

## GDB에서 크기와 표시 형식을 지정한다

GDB의 `x` 명령은 프로그램의 자료형과 별개로 메모리를 읽는다. `x/nfu addr`에서 `n`은 읽을 단위의 개수, `f`는 표시 형식, `u`는 단위 크기다. `b`, `h`, `w`, `g`는 각각 1·2·4·8 Byte를 뜻한다. GDB의 `w`는 4 Byte이므로 x86 문서에서 2 Byte를 가리키는 word와 혼동하지 않아야 한다. [GDB 메모리 조회](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html)

| 명령 | 읽는 범위와 표시 |
| --- | --- |
| `x/8bx addr` | 1 Byte씩 여덟 개를 16진수로 표시한다. |
| `x/2wx addr` | 4 Byte씩 두 개를 16진수로 표시한다. |
| `x/1gx addr` | 8 Byte 하나를 16진수로 표시한다. |
| `x/1wd addr` | 4 Byte 하나를 signed 10진수로 표시한다. |
| `x/1wu addr` | 4 Byte 하나를 unsigned 10진수로 표시한다. |
| `x/1gd addr` | 8 Byte 하나를 signed 10진수로 표시한다. |

표의 `addr`에는 현재 디버깅 대상의 유효한 주소를 넣는다. 여기서는 GDB Session을 실행하지 않았으며, 명령의 읽기 범위를 설명한 것이다. `x`, `d`, `u` 외에 `t`는 2진수, `o`는 8진수 표시다. `a`, `c`, `s`, `i`는 각각 주소·문자·문자열·명령어를 표시한다. 명령어 형식 `i`에서는 단위 크기를 무시한다. 생략한 형식과 크기는 앞선 명령의 영향을 받으므로, 값을 비교할 때는 명시하는 편이 낫다.

예를 들어 앞서 만든 4096의 배열을 실제 대상 메모리에 놓았다면 `x/8bx`와 `x/1gx`는 같은 8 Byte를 각각 나누거나 묶어서 보여 준다. `x/1gd`로 표시를 바꾸어도 메모리에 저장된 Bit는 변하지 않는다.

## PintOS 필드는 선언과 함께 읽는다

메모리 덤프만으로는 값이 Thread ID인지, 파일 Offset인지 알 수 없다. 먼저 필드 선언을 확인해야 한다. 다음 표는 `lrn-pintos`의 `9d1b14c` 버전에서 확인한 선언이다. 이 저장소의 `off_t`는 `int32_t`이며, 다른 OS의 같은 이름을 보고 8 Byte라고 추정해서는 안 된다.

| 값 | 확인한 선언 | 해석할 때 볼 조건 |
| --- | --- | --- |
| Thread ID | `tid_t`, 즉 `int` | `struct thread.tid`를 읽는다. 오류값 `TID_ERROR`는 -1이다. |
| 우선순위 | `int priority`, `int base_priority` | 유효 우선순위와 기부 전 우선순위를 구분한다. 범위는 0~63이다. |
| 깨울 시각 | `int64_t wake_tick` | 8 Byte signed 값이다. Tick의 의미는 Scheduling 코드가 정한다. |
| Sector 번호 | `uint32_t disk_sector_t` | 4 Byte unsigned 값이다. 실제 유효 번호는 디스크 크기에 따라 달라진다. |
| 파일 Offset | `int32_t off_t` | 4 Byte signed 값이다. 페이지 내부 Offset과 같은 개념이 아니다. |
| 종료 상태 | `int child_status.exit_status` | `process_exit_with_status(int status)`가 저장한다. |
| System Call 번호 | `intr_frame.R.rax` | Register의 폭과 번호의 유효 범위를 구분한다. 번호는 `syscall-nr.h`를 따른다. |
| Page Table Entry | `uint64_t`로 다루는 엔트리 | 8 Byte에서 주소와 Flag를 분리한다. |

선언은 [thread.h](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/thread.h), [off_t.h](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/filesys/off_t.h), [disk.h](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/devices/disk.h)에서 확인할 수 있다. 종료 상태의 저장과 전달은 [process.c](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c), System Call 번호는 [syscall-nr.h](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/lib/syscall-nr.h)에 있다.

운영체제의 ID 타입도 모두 signed는 아니다. Linux의 `pid_t`와 `off_t`는 signed지만, Linux v6.12의 일반 정의에서 `uid_t`는 `__kernel_uid32_t`를 거쳐 `unsigned int`로 이어진다. 오류나 특수값으로 -1을 쓴다는 관례만으로 필드의 부호를 정하지 않는다. [pid_t의 계약](https://man7.org/linux/man-pages/man3/pid_t.3type.html), [off_t의 계약](https://man7.org/linux/man-pages/man3/off_t.3type.html), [Linux uid_t](https://github.com/torvalds/linux/blob/v6.12/include/linux/types.h#L33), [기본 UID 타입](https://github.com/torvalds/linux/blob/v6.12/include/uapi/asm-generic/posix_types.h#L45-L48)

`THREAD_RUNNING`, `THREAD_READY`, `THREAD_BLOCKED`, `THREAD_DYING`은 차례로 0·1·2·3이다. 따라서 앞 예제의 두 번째 값 3을 이 Enum으로 읽으면 `THREAD_DYING`이다. Byte를 제대로 읽어도 이름을 잘못 대응시키면 해석은 틀린다. 종료 상태 역시 이 구현에서는 `int` 값이 저장되고 `process_wait()`로 전달된다. Shell에서 흔히 보는 종료 코드 범위를 이 필드의 저장 범위로 대신할 수 없다.

구조체의 Offset도 실행 파일과 맞춰 확인한다. 이 버전의 `struct thread`에는 `tid`, `status`, `priority`, `base_priority`, `wake_tick` 순으로 필드가 선언되어 있다. 그러나 실제 Byte Offset과 Padding은 대상 ABI와 컴파일 조건까지 반영한 결과다. Little-endian이라는 사실만으로 구조체 배치가 정해지지는 않는다.

C Struct에서 비트 필드가 아닌 멤버는 선언 순서대로 주소가 증가하지만, 멤버 사이와 Struct 끝에는 Padding이 들어갈 수 있다. 크기와 정렬은 같은 값이 아니다. 예를 들어 `int`의 크기·정렬이 4 Byte이고 포인터의 크기·정렬이 8 Byte인 ABI를 가정하자. 별도 packing 없이 첫 멤버인 `int`를 offset 0에, 바로 다음 포인터를 offset 8에 두는 배치에서는 둘 사이에 4 Byte의 Padding이 들어간다. 구조체 시작부터 해당 멤버까지의 거리는 `offsetof`, 객체 전체 크기는 `sizeof`, 타입의 정렬 조건은 `_Alignof`로 확인한다. 크기를 단순히 더한 값으로 배열 원소의 간격이나 다음 필드의 위치를 정하지 않는다. [C11 초안의 Struct 배치 규칙](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf#page=133), [offsetof로 필드 위치를 확인하는 예제](/wiki/programming-languages-runtime-topic-ef71fd296666/#멤버의-위치에서-구조체-찾기)

Union은 멤버들이 저장 공간을 겹쳐 사용하며, 가장 큰 멤버를 담을 수 있어야 한다. 끝의 Padding도 허용되므로 크기를 항상 멤버 크기의 최댓값과 같다고 단정하지 않는다. PintOS의 `page`를 읽을 때는 크기뿐 아니라 현재 `operations->type`에 맞는 멤버를 골라야 한다. UNINIT의 바이트를 ANON의 Slot 번호로 읽으면 그럴듯한 숫자가 나와도 현재 페이지 상태를 설명하지 못한다. 현재 ANON의 필드는 `swap_slot`과 `in_swap`이며, 옛 `swap_index` 한 개짜리 선언으로 크기를 계산할 수는 없다. [Operations와 Union 멤버를 함께 읽는 절차](/wiki/computer-systems-network-topic-aa5da5d73167/#gdb에서-두-상태를-나란히-확인한다), [현재 ANON 선언](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/vm/anon.h)

Debug Symbol을 읽은 GDB에서는 아래 명령으로 필드 Offset과 크기를 확인할 수 있다. 이는 실행할 명령의 예이며 이 글에서 확인한 GDB 출력은 아니다.

```gdb
ptype /o struct thread
ptype off_t
p sizeof(off_t)
ptype /o struct child_status
```

`ptype /o`는 필드의 Offset·크기와 Padding을 보여 준다. 이 정보로 경계를 잡은 뒤 필요한 주소를 `x`로 읽는다. Linux의 `task_struct`나 파일시스템 자료구조를 읽을 때도 해당 빌드의 선언과 Debug Symbol을 확인하는 순서가 같다. PintOS의 필드 위치를 그대로 적용할 수는 없다. [GDB 자료형과 필드 배치](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Symbols.html)

정수 상수의 값과 타입도 나누어 읽어야 한다. C99·C11에서 접미사 없는 10진 정수 상수의 타입은 `int → long → long long` 중 값을 표현할 수 있는 첫 타입이다. `-2147483648`은 단항 마이너스와 상수 `2147483648`의 조합이며, 그 상수가 32 Bit `int`를 넘는다고 자동으로 unsigned가 되지는 않는다. `int`가 32 Bit일 때 LP64처럼 `long`이 64 Bit이면 `long`, `long`도 32 Bit인 ILP32·LLP64이면 `long long`이 된다. 값 -2,147,483,648 자체가 틀린 것은 아니지만 표현식의 타입이 의도한 `int`와 다를 수 있다. [C99 통합 초안 N1256, 6.4.4.1](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1256.pdf), [C11 초안 N1570, 6.4.4.1](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)

PintOS의 `stdint.h`는 `int32_t`를 `signed int`로 선언하고 `INT32_MAX`를 `2147483647`, `INT32_MIN`을 `(-INT32_MAX - 1)`로 정의한다. `limits.h`의 `INT_MIN`도 `(-INT_MAX - 1)`이다. 이 저장소가 전제한 32 Bit `int`에서는 중간 계산과 최종 값이 모두 그 타입의 범위 안에 남는다. 헤더의 매크로 값과 실제 Compiler·ABI의 타입 크기는 구분해서 확인해야 한다. [PintOS stdint.h](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/lib/stdint.h#L12-L18), [limits.h](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/lib/limits.h#L22-L31)

## 정수에서 Flag와 주소를 분리한다

예제의 PTE `0x000000000800B067`을 10진수로 쓰면 134,262,887이다. 이 큰 수 자체보다 어떤 Bit가 켜져 있는지가 필요하다. 하위 값 `0x067`에는 Present·Writable·User·Accessed·Dirty에 해당하는 Bit 0·1·2·5·6이 설정되어 있다. 각 Flag는 `pte & mask`가 0인지로 검사한다. 같은 4 KiB leaf 예시에서 P·W·U만 켠 `0x12345007`의 Little-endian Byte는 `07 50 34 12 00 00 00 00`이다. 주소 `0x12345000`과 하위 Flag `0x007`을 하나의 정수에 담았으며 A·D는 꺼져 있다. [PintOS의 PTE Flag](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/pte.h)

여기서는 상위 제어 Bit가 없는 4 KiB 페이지의 leaf PTE 값을 사용했다. 첫 예제의 주소 부분 `0x0800B000`을 12 Bit 오른쪽으로 이동하면 물리 Frame 번호 `0x800B`가 된다. 다시 4096을 곱하면 Frame 시작 주소로 돌아간다. 이 주소는 페이지 안의 특정 Byte 주소와는 다르며, 실제 접근 주소를 얻으려면 해당 Offset을 더해야 한다.

이 한 값을 분해한 것이 모든 PTE 형식을 검증했다는 뜻은 아니다. 물리 주소의 지원 폭과 상위 제어 Bit, 큰 페이지 여부는 별도로 확인해야 한다. 특히 모든 상위 Bit를 주소로 간주해서는 안 된다. 단계별 주소 변환과 권한 판단은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서 이어서 다룬다.

## 바이트를 읽는 쪽과 의미를 붙이는 쪽

QEMU의 GDB Stub은 메모리와 Register를 원격 디버거에 제공한다. 메모리를 요청하는 Remote Protocol의 `m` Packet에는 주소와 길이가 들어가며, 응답은 Byte를 16진수로 인코딩한 내용이다. `x/1wd`처럼 크기와 표시 형식을 선택하는 것은 GDB 명령의 역할이다. Stub이 그 명령을 그대로 받아 signed 10진수로 변환한다고 이해하면 두 역할이 섞인다. [GDB Remote Protocol의 메모리 읽기](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Packets.html)

GDB는 Debug Symbol이 있으면 자료형과 필드 이름을 사용해 구조체를 보여 줄 수도 있다. 다만 `priority=31`이 어떤 Scheduling 판단에 쓰이는지는 프로그램의 규칙까지 읽어야 알 수 있다. CPU 명령이 정수·주소·명령어로 Bit를 해석하는 일, 디버거가 그 값을 표시하는 일, 개발자가 필드의 의미를 판단하는 일은 서로 이어지지만 같은 작업은 아니다.

## 유한한 Bit에 소수를 담는다

`0.1 + 0.2`를 계산하면 Python에서는 `0.30000000000000004`가 나온다. Byte Order를 잘못 읽어서 생긴 차이는 아니다. 10진수 `0.1`은 2진수로 `0.0001100110011...`처럼 끝없이 반복되므로, 유한한 Bit에는 가장 가까운 표현값을 저장해야 한다. 그 근삿값끼리 더한 결과에도 반올림이 적용된다.

반면 `0.15625`는 `1/8 + 1/32`이므로 `0.00101₂`로 끝난다. 소수라는 이유만으로 모두 오차가 생기는 것은 아니다. 어떤 진법과 정밀도를 쓰는지가 중요하다.

다음 예제는 근삿값 비교와 10진수 계산을 같은 입력으로 비교한다. `Decimal`에는 이미 근사된 `float` 대신 문자열을 전달한다.

```run-python
import math
import struct
from decimal import Decimal

total = 0.1 + 0.2
print("float 합:", total)
print("0.3과 같은가:", total == 0.3)
print("허용 오차 안인가:", math.isclose(total, 0.3))
print("Decimal 합:", Decimal("0.1") + Decimal("0.2"))
single = struct.unpack(">f", struct.pack(">f", 0.1))[0]
print("binary32의 0.1:", Decimal.from_float(single))
print("binary64의 0.1:", Decimal.from_float(0.1))
print("0 근처의 비교:", math.isclose(1e-12, 0.0, abs_tol=1e-10))

assert total != 0.3 and math.isclose(total, 0.3)
assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
assert 0.15625 == 1 / 8 + 1 / 32
```

Python 3.13.13에서 실행한 결과다.

```text
float 합: 0.30000000000000004
0.3과 같은가: False
허용 오차 안인가: True
Decimal 합: 0.3
binary32의 0.1: 0.100000001490116119384765625
binary64의 0.1: 0.1000000000000000055511151231257827021181583404541015625
0 근처의 비교: True
```

`0.1`을 짧게 출력하면 저장된 근삿값 전체가 드러나지 않는다. 예제의 `Decimal.from_float()`는 그 값을 정확한 10진수로 펼쳐 보여 준다. binary32보다 binary64에 더 많은 유효 Bit가 있지만, 어느 쪽도 `1/10`을 정확히 담지는 못한다. [Python의 부동 소수점 설명](https://docs.python.org/3/tutorial/floatingpoint.html)

`math.isclose(a, b)`의 기본값은 상대 허용 오차 `rel_tol=1e-9`, 절대 허용 오차 `abs_tol=0.0`이다. 큰 값끼리의 상대 차이를 비교하는 기준만으로는 0 근처를 판단하기 어렵다. 필요한 단위와 오차 범위에 맞춰 `abs_tol`도 정해야 한다. 모든 비교를 무조건 근사 비교로 바꾸기보다, 이 값이 정확히 같은 값이어야 하는지 허용 오차 안이면 되는지 먼저 구분한다. [math.isclose](https://docs.python.org/3/library/math.html#math.isclose)

## 부호·지수·가수

`0.00101₂`를 `1.01₂ × 2⁻³`으로 쓰면 유효한 숫자와 크기를 나눌 수 있다. 유효한 숫자 부분을 가수라고 부르고, 지수는 그 숫자를 얼마나 크게 또는 작게 읽을지 정한다. 이처럼 지수에 따라 소수점의 위치가 달라지는 표현이 부동 소수점, Floating Point다.

IEEE 754의 여러 형식 중 여기서는 binary32와 binary64를 비교한다. 일반적인 C 환경의 `float`와 `double`에 대응하지만, C 자료형의 크기와 형식은 실행 환경에서 확인해야 한다.

| 형식 | 부호 | 지수 | 저장하는 가수의 소수부 | 지수 Bias |
| --- | --- | --- | --- | --- |
| binary32 | Bit 31의 1 Bit | Bit 30–23의 8 Bit | Bit 22–0의 23 Bit | 127 |
| binary64 | Bit 63의 1 Bit | Bit 62–52의 11 Bit | Bit 51–0의 52 Bit | 1023 |

정규화된 값은 `(-1)^S × (1 + fraction / 2^p) × 2^(E - Bias)`로 읽는다. 여기서 `S`는 부호, `E`는 저장된 지수, `p`는 소수부 Bit 수다. 맨 앞의 `1`을 저장하지 않으므로 실제 유효 정밀도는 각각 24 Bit와 53 Bit가 된다. 이 식을 지수가 전부 0 또는 1인 특수 패턴에 그대로 적용하면 안 된다. [IEEE 형식과 해석](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_math.html)

Bias를 더한 지수는 음의 지수부터 양의 지수까지 증가하는 순서로 저장된다. 양의 유한한 수끼리는 지수와 소수부를 unsigned 정수처럼 비교하는 순서와 값의 순서가 맞는다. 그러나 음수에서는 절댓값의 순서가 반대이고, `NaN`도 있으므로 전체 Bit 패턴의 단순 정수 비교를 모든 부동 소수점 비교로 대신할 수는 없다.

다음 C 예제는 `0.15625f`의 표현을 `memcpy()`로 복사해 세 필드를 읽는다. Pointer를 다른 자료형으로 강제 변환해 읽지 않으며, 예제가 요구하는 크기와 정밀도도 검사한다.

```run-c
#include <assert.h>
#include <float.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    _Static_assert(sizeof(float) == sizeof(uint32_t), "32-bit float required");
    _Static_assert(FLT_RADIX == 2 && FLT_MANT_DIG == 24 && FLT_MAX_EXP == 128,
                   "binary32 precision and range required");
    float value = 0.15625f;
    uint32_t bits;
    memcpy(&bits, &value, sizeof(bits));
    uint32_t sign = bits >> 31;
    uint32_t exponent = (bits >> 23) & UINT32_C(0xff);
    uint32_t fraction = bits & UINT32_C(0x7fffff);
    assert(bits == UINT32_C(0x3e200000));
    printf("Bit: %08" PRIX32 "\n", bits);
    printf("부호: %" PRIu32 "\n", sign);
    printf("지수: %" PRIu32 " (실제: %d)\n", exponent, (int)exponent - 127);
    printf("소수부: %06" PRIX32 "\n", fraction);
    return 0;
}
```

Clang에서 C11로 컴파일해 실행한 결과다.

```text
Bit: 3E200000
부호: 0
지수: 124 (실제: -3)
소수부: 200000
```

저장된 지수 124에서 Bias 127을 빼면 -3이다. 소수부 `0x200000`은 `01₂`에 해당하므로, 생략된 맨 앞의 1을 붙이면 `1.01₂ × 2⁻³ = 0.15625`가 복원된다. 앞에서 살펴본 Endianness는 이 Bit 패턴을 메모리의 Byte로 배치하는 순서다. 여기서처럼 같은 환경에서 `memcpy()`한 정수를 읽는 일과, 외부 파일의 Byte 순서를 해석하는 일은 구분한다.

## 0과 무한대 사이의 특수값

지수 필드가 전부 0이면 소수부도 확인한다. 소수부가 0이면 부호만 다른 `+0`, `-0`이며 값 비교에서는 같다. 소수부가 0이 아니면 맨 앞을 `1` 대신 `0`으로 읽는 Subnormal이다. 정규화된 수보다 작은 값을 표현할 수 있지만, 0에 가까워질수록 유효한 숫자는 줄어든다.

지수 필드가 전부 1일 때 소수부가 0이면 `+Infinity` 또는 `-Infinity`다. 소수부가 0이 아니면 숫자가 아닌 값을 나타내는 `NaN`이다. `NaN == NaN`은 거짓이므로 유효성 검사에는 `math.isnan()`처럼 목적에 맞는 함수를 쓴다.

IEEE 연산에서는 0으로 나누거나 유효하지 않은 실수 연산이 무한대·NaN을 만드는 경우가 있다. 다만 언어가 같은 식을 반드시 같은 값으로 돌려주는 것은 아니다. Python의 `1.0 / 0.0`과 `0.0 / 0.0`은 `ZeroDivisionError`, `math.sqrt(-1.0)`은 `ValueError`를 발생시킨다. 표현 형식과 언어의 예외 처리를 함께 확인해야 한다.

## 정수에 단위를 정하는 고정 소수점

항상 100으로 나누어 읽기로 약속하면 정수 `1550`은 `15.50`을 뜻한다. 덧셈·뺄셈은 원시 정수끼리 수행하고 표시할 때 약속한 단위를 적용한다. 소수점의 위치를 고정한 이런 표현을 Fixed Point라고 한다. 고정된 최소 화폐 단위를 정수로 관리하는 경우에도 같은 생각을 쓸 수 있다.

PintOS의 17.14 형식은 signed 32 Bit 정수 `x`를 `x / 2¹⁴`로 읽는다. 부호 1 Bit, 정수부 17 Bit, 소수부 14 Bit이며 `F = 16384`다. 따라서 정수 3을 저장한 값은 `3 × F = 49152`, 표현 가능한 간격은 `1/F`다. 범위는 `-131072`부터 `131072 - 1/16384`, 즉 `131071.99993896484375`까지다. `17`에 부호 Bit를 다시 포함해 범위를 절반으로 줄이지 않는다. [PintOS의 고정 소수점](https://casys-kaist.github.io/pintos-kaist/project1/advanced_scheduler.html#fixed-point-arithmetic)

PintOS는 Thread마다 부동 소수점 Register 상태를 저장·복원하는 기능을 제공하지 않는다. 그래서 `load_avg`와 `recent_cpu`처럼 소수가 필요한 계산에도 정수 연산을 쓴다. 이를 모든 OS Kernel이 FPU를 사용할 수 없다는 규칙으로 일반화하지 않는다.

아래 코드는 고정 소수점의 단위 변환과 연산을 독립 실행하는 예제다. 실제 PintOS의 Header를 그대로 옮긴 코드나 Kernel 실행 결과는 아니다. 매크로 인수에는 증가 연산이나 함수 호출처럼 여러 번 평가되면 결과가 달라지는 식을 넣지 않는다.

```run-c
#include <assert.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#define F (INT32_C(1) << 14)
#define INT_TO_FP(n) ((n) * F)
#define FP_TO_INT_ZERO(x) ((x) / F)
#define FP_TO_INT_NEAR(x) ((x) >= 0 ? ((x) + F / 2) / F : ((x) - F / 2) / F)
#define FP_ADD(x, y) ((x) + (y))
#define FP_SUB(x, y) ((x) - (y))
#define FP_MUL(x, y) ((int32_t)((int64_t)(x) * (y) / F))
#define FP_DIV(x, y) ((int32_t)((int64_t)(x) * F / (y)))
#define FP_ADD_INT(x, n) ((x) + (n) * F)
#define FP_MUL_INT(x, n) ((x) * (n))

int main(void) {
    int32_t three = INT_TO_FP(3);
    int32_t half = FP_DIV(INT_TO_FP(1), INT_TO_FP(2));
    int32_t weight = FP_DIV(INT_TO_FP(59), INT_TO_FP(60));
    int32_t load_avg = FP_ADD(FP_MUL(weight, 0),
        FP_MUL_INT(FP_DIV(INT_TO_FP(1), INT_TO_FP(60)), 2));
    printf("3의 원시 정수: %" PRId32 "\n", three);
    printf("59/60의 원시 정수: %" PRId32 "\n", weight);
    printf("load_avg 0, ready_threads 2: %" PRId32 "\n", load_avg);
    printf("-1.5를 정수로: 버림 %" PRId32 ", 반올림 %" PRId32 "\n",
        FP_TO_INT_ZERO(-3 * half), FP_TO_INT_NEAR(-3 * half));
    assert(three == 49152 && weight == 16110 && load_avg == 546);
    assert(FP_SUB(FP_ADD(three, half), half) == three);
    assert(FP_ADD_INT(half, 3) == FP_ADD(three, half));
    assert(FP_MUL(three, half) == 3 * half);
    assert(FP_TO_INT_ZERO(-3 * half) == -1);
    assert(FP_TO_INT_NEAR(-3 * half) == -2);
    return 0;
}
```

Clang에서 C11로 컴파일해 실행한 결과다.

```text
3의 원시 정수: 49152
59/60의 원시 정수: 16110
load_avg 0, ready_threads 2: 546
-1.5를 정수로: 버림 -1, 반올림 -2
```

고정 소수점끼리 곱하면 중간값의 단위는 `F²`이므로 `F`로 나눈다. 나눗셈에서는 분자에 `F`를 곱해야 결과가 다시 같은 단위가 된다. 이 중간 곱에 `int64_t`를 쓰면 32 Bit 계산 중의 Overflow를 줄일 수 있지만, 최종 결과의 범위까지 무한해지는 것은 아니다. 0으로 나누는 입력과 변환·덧셈·곱셈·반올림의 범위 초과도 별도로 막아야 한다. 위 예제의 입력은 모두 범위 안에 있다.

`59 / 60`을 C 정수끼리 먼저 계산하면 0이 된다. 단위를 적용한 `59 × F / 60`은 16110을 보존한다. 고정 소수점도 나누어떨어지지 않는 수에는 오차가 생기며, 위 예제는 그 값을 0 방향으로 버린다. `load_avg` 계산을 실제 갱신 시점과 우선순위 변화에 연결하는 과정은 [MLFQS](/wiki/computer-systems-network-mlfqs-db815d97f954/)에서 이어진다.

넓은 크기 범위의 과학 계산·그래픽에는 부동 소수점이 적합할 수 있다. 일정한 단위를 정수로 다루는 계산에는 고정 소수점을 사용할 수 있다. 정확한 10진 입력을 다루려면 `Decimal`이나 정수 단위를 검토하되, `Decimal` 역시 정밀도와 반올림 설정이 있으므로 모든 나눗셈이 무조건 정확한 것은 아니다. 필요한 표현 범위, 가장 작은 단위, 허용 오차와 반올림 규칙을 함께 정해야 한다.
