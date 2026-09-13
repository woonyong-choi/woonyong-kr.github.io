---
layout: default
title: 인자 전달
nav_order: 3
permalink: /wiki/computer-systems-network-topic-1217820258bd/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-1217820258bd
projection_sha256: 69c2607b220891203dc4894d978313bb80c80e46b816b6c15f3a656e2a649f7e
parent: 사용자 프로그램
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63dd07ba6393
search_terms:
- argc
- argv
- RDI
- RSI
- setup_initial_stack
- setup_stack
- LOADER_ARGS_LEN
- args-multiple
- args-many
- Stack Alignment
grand_parent: PintOS
ancestor: CS 기초
---

# 인자 전달
{: .no_toc }

프로그램에 `args-multiple some arguments for you!`를 전달하면 `main()`은 문자열 하나를 받지 않는다. 실행 파일 이름을 포함한 인자 수 `argc`와, 각 문자열을 가리키는 포인터 배열 `argv`를 받는다. Kernel은 새 사용자 주소 공간에 문자열과 포인터를 배치하고, 프로그램이 시작할 때 이를 찾을 수 있도록 레지스터를 준비해야 한다.

여기서는 [lrn-pintos의 x86-64 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)을 기준으로 명령줄이 초기 Stack으로 옮겨지는 과정을 살펴본다. 실행 예제는 이 코드의 주소 계산을 Python으로 재현한다. 실제 PintOS 테스트와 GDB 관찰은 해당 Kernel을 빌드한 환경에서 별도로 수행한다.

## 명령줄을 인자로 나누기

`load()`는 Kernel Page에 명령줄을 복사한 뒤 `parse_command_line()`을 호출한다. 이 함수는 `strtok_r(command, " ", ...)`로 문자열을 나누어 지역 배열 `argv[64]`에 담는다. `argv[0]`은 실행 파일을 여는 데 사용하고, ELF 적재가 끝나면 전체 배열을 `setup_initial_stack()`에 전달한다.

구분자는 ASCII 공백 하나다. 앞뒤 공백과 연속 공백은 건너뛰지만, Tab을 공백으로 취급하거나 따옴표를 해석하지는 않는다. Shell의 명령줄 해석을 그대로 기대하면 안 된다. 분리할 인자가 없으면 실패하고, 실행 파일 이름까지 합쳐 64개를 넘으면 실패한다. [명령줄 분리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L937), [strtok_r 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/string.c#L168)

```run-python
def parse_command_line(command, capacity=64):
    # C 문자열의 끝과 ASCII 공백 구분만 재현한다.
    command = command.split("\0", 1)[0]
    arguments = [part for part in command.split(" ") if part]
    if not arguments or len(arguments) > capacity:
        raise ValueError("인자가 없거나 64개를 초과했습니다.")
    return arguments


examples = [
    "args-multiple some arguments for you!",
    "  args-dbl-space two  spaces!  ",
    'program "two words"',
    "program\ttwo",
]
for command in examples:
    arguments = parse_command_line(command)
    print(repr(command), "->", len(arguments), arguments)

assert parse_command_line(examples[1]) == ["args-dbl-space", "two", "spaces!"]
assert parse_command_line(examples[2]) == ["program", '"two', 'words"']
assert parse_command_line(examples[3]) == ["program\ttwo"]
assert len(parse_command_line(" ".join(["x"] * 64))) == 64
for command in ["   ", " ".join(["x"] * 65)]:
    try:
        parse_command_line(command)
    except ValueError as error:
        print("거부:", error)
    else:
        raise AssertionError("거부해야 하는 입력입니다.")
```

이 단계의 `argv[i]`는 아직 Kernel의 명령줄 복사본을 가리킨다. 그 포인터를 사용자 프로그램에 그대로 넘기면 복사본이 해제된 뒤에도 옛 주소를 참조하게 되고, 사용자 주소 공간의 접근 경계도 지킬 수 없다. 문자열을 사용자 Stack에 옮긴 다음 포인터를 새 주소로 바꾸어야 한다.

## 인자를 쓸 초기 Page 준비

`setup_initial_stack()`은 먼저 `setup_stack()`으로 사용자 가상 주소 `[0x4747f000, 0x47480000)`에 4 KiB Page 하나를 준비한다. `USER_STACK`은 `0x47480000`, `PGSIZE`는 4096이다. 초기 RSP는 Page 안의 마지막 바이트가 아니라 위쪽 경계인 `USER_STACK`을 가리킨다. 여기에 8바이트 값을 push하면 주소를 먼저 8만큼 내리므로 첫 쓰기 위치는 `0x4747fff8`이다.

| 빌드 | 초기 Stack을 준비하는 경로 |
|---|---|
| non-VM | `palloc_get_page(PAL_USER \| PAL_ZERO)`로 Frame을 확보하고 `install_page()`로 writable 매핑을 설치한다. 매핑에 실패하면 확보한 Frame을 반환한다. |
| VM | `vm_alloc_page(VM_ANON \| VM_MARKER_0, ...)`로 SPT에 등록하고 `vm_claim_page()`로 즉시 Frame과 매핑을 준비한다. `stack_bottom`에 Page의 아래쪽 주소를 기록한다. |

`install_page()`는 기존 매핑이 없는지 확인한 뒤 PML4에 새 매핑을 만든다. 이때 `upage`는 사용자 가상 주소이고 `kpage`는 같은 Frame에 접근하는 Kernel 가상 주소다. 중간 Page Table이 필요하면 그 할당도 성공해야 한다. VM 경로는 인자를 곧바로 써야 하므로 초기 Stack을 미확보 상태로 남겨두지 않는다. 이후의 [스택 확장](/wiki/computer-systems-network-topic-2ca44448445b/)은 별도 Page Fault 정책을 따른다. [non-VM과 VM의 setup_stack](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1256)

Page 전체의 초기값은 두 경로에서 같다고 단정할 수 없다. non-VM에는 `PAL_ZERO`가 있지만, 현재 VM의 `vm_get_frame()`은 `PAL_USER`만 전달한다. 초기 Stack의 UNINIT 경로는 `anon_initializer()`로 타입과 상태를 설정할 뿐, 별도 초기화 함수가 없을 때 Page 전체를 0으로 채우지 않는다. `anon_swap_in()`의 zero-fill 코드가 첫 UNINIT 초기화에서도 실행된다고 읽으면 안 된다. 문자열·포인터·NULL·가짜 반환 주소는 적재 코드가 직접 쓰지만, padding의 바이트 값까지 모두 0이라고 보장하는 경로는 아니다. [Frame 확보와 claim](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L274), [UNINIT 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/uninit.c#L47), [Anonymous Page 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c#L40)

## 문자열, 포인터 배열, 레지스터

Stack은 낮은 주소 쪽으로 채운다. 먼저 마지막 인자부터 문자열을 복사한다. C 문자열 끝의 `\0`도 포함하므로 공간은 `strlen(argument) + 1`바이트다. 복사할 때마다 Kernel의 `argv[i]`를 방금 쓴 사용자 가상 주소로 바꾼다.

문자열 복사가 끝나면 주소를 8바이트 경계로 내리고, `argv[argc] = NULL`을 위한 8바이트를 쓴다. 이어서 문자열 주소를 마지막 인자부터 역순으로 쌓는다. 그 결과 낮은 주소부터 `argv[0]`, `argv[1]`, …, `argv[argc]`가 차례로 놓인다. 배열의 시작 주소를 RSI에, 인자 수를 RDI에 넣은 다음, 아래에 0인 가짜 반환 주소 8바이트를 추가하고 그 주소를 최종 RSP로 삼는다.

| 위치 | 의미 |
|---|---|
| 높은 주소 쪽 문자열 영역 | `argv[i]`가 가리키는 NUL 종료 문자열 |
| 문자열 아래의 padding | 다음 포인터 배열을 8바이트 경계에 놓기 위한 빈 공간 |
| `argv[argc]` | 값이 0인 마지막 포인터 |
| RSI부터 시작하는 포인터 배열 | 문자열 주소를 인자 순서대로 저장한 `char **` |
| RSP가 가리키는 8바이트 | 값이 0인 가짜 반환 주소 |

RDI가 인자 수를 전달하므로 이 PintOS 배치에는 Linux 초기 Stack처럼 별도의 `argc` 슬롯이 없다. `argv`는 문자열 자체도, 문자열들을 이어 붙인 버퍼도 아니다. `argv[2]`를 읽으려면 RSI에 `2 × 8`을 더한 곳에서 포인터를 먼저 읽고, 그 포인터가 가리키는 문자열을 다시 읽는다.

VM 빌드는 인자 배치를 마친 RSP를 `thread_current()->user_rsp`에도 기록한다. 마지막에는 `load()`가 ELF의 `e_entry`를 RIP에 넣는다. `do_iret()`의 Assembly가 일반 레지스터를 복원하고 `iretq`로 사용자 문맥에 들어간다. `iretq` 한 명령이 RDI·RSI까지 전부 복원하는 것은 아니다. 사용자 진입점인 `_start()`는 아래처럼 `main()`의 반환값을 `exit()`에 전달한다. [인자 배치](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1064), [do_iret](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c#L645), [사용자 진입점](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/user/entry.c)

```c
void
_start (int argc, char *argv[]) {
    exit (main (argc, argv));
}
```

이 코드는 PintOS 사용자 라이브러리의 일부다. 일반 C 실행기에서 독립 실행하는 예제가 아니다. `main()`이 반환해도 곧바로 RIP가 0이 되는 것이 아니라 `_start()`로 돌아와 `exit()`를 호출한다. 가짜 반환 주소는 정상 종료에서 사용하지 않는다.

## 바이트 배열로 Stack 만들기

`args-multiple some arguments for you!`의 문자열은 NUL까지 총 38바이트다. 복사 후 주소 `0x4747ffda`를 8바이트 경계인 `0x4747ffd8`로 내리면 padding은 2바이트다. 포인터 5개, NULL 포인터, 가짜 반환 주소를 더한 최종 사용량은 `38 + 2 + 8 × 7 = 96`바이트다.

| 주소 | 내용 |
|---|---|
| `0x4747fffb` | `"you!\0"` — 5바이트 |
| `0x4747fff7` | `"for\0"` — 4바이트 |
| `0x4747ffed` | `"arguments\0"` — 10바이트 |
| `0x4747ffe8` | `"some\0"` — 5바이트 |
| `0x4747ffda` | `"args-multiple\0"` — 14바이트 |
| `0x4747ffd8` | padding 2바이트 |
| `0x4747ffd0` | `argv[5] = NULL` |
| `0x4747ffa8` | `argv[0]`부터 시작하는 포인터 배열, RSI |
| `0x4747ffa0` | 가짜 반환 주소, RSP |

아래 예제는 이 배치를 `bytearray`에 만든다. 사용하지 않은 공간은 모델의 표식 `0xa5`로 채워, 정렬 연산이 padding을 자동으로 0으로 만들지는 않는다는 점도 드러낸다. `0xa5`는 실제 Kernel 메모리를 측정한 값이 아니다. 모델은 초기 Page를 벗어난 쓰기를 거부하지만, 현재 `setup_initial_stack()`에는 같은 크기 검사가 없다.

```run-python
import struct

TOP = 0x47480000
PAGE_SIZE = 4096
BOTTOM = TOP - PAGE_SIZE


def build_stack(arguments):
    memory = bytearray([0xA5]) * PAGE_SIZE
    stack_pointer = TOP
    string_addresses = [0] * len(arguments)

    def push(data):
        nonlocal stack_pointer
        new_pointer = stack_pointer - len(data)
        if new_pointer < BOTTOM:
            raise ValueError("초기 Stack Page를 벗어났습니다.")
        offset = new_pointer - BOTTOM
        memory[offset:offset + len(data)] = data
        stack_pointer = new_pointer
        return new_pointer

    for i in range(len(arguments) - 1, -1, -1):
        string_addresses[i] = push(arguments[i].encode("utf-8") + b"\0")

    after_strings = stack_pointer
    stack_pointer &= ~7
    padding = after_strings - stack_pointer
    push(struct.pack("<Q", 0))  # argv[argc]
    for address in reversed(string_addresses):
        push(struct.pack("<Q", address))
    argv = stack_pointer
    push(struct.pack("<Q", 0))  # 가짜 반환 주소

    def read_pointer(address):
        return struct.unpack_from("<Q", memory, address - BOTTOM)[0]

    def read_string(address):
        offset = address - BOTTOM
        end = memory.index(0, offset)
        return bytes(memory[offset:end]).decode("utf-8")

    restored = [read_string(read_pointer(argv + i * 8))
                for i in range(len(arguments))]
    assert restored == arguments
    assert read_pointer(argv + len(arguments) * 8) == 0
    assert read_pointer(stack_pointer) == 0
    assert argv == stack_pointer + 8 and argv % 8 == 0
    return memory, stack_pointer, argv, padding, string_addresses


arguments = "args-multiple some arguments for you!".split(" ")
memory, rsp, rsi, padding, strings = build_stack(arguments)
assert (rsp, rsi, padding) == (0x4747FFA0, 0x4747FFA8, 2)
assert strings == [0x4747FFDA, 0x4747FFE8, 0x4747FFED, 0x4747FFF7, 0x4747FFFB]
assert memory[0x4747FFD8 - BOTTOM:0x4747FFDA - BOTTOM] == b"\xa5\xa5"
print(f"RDI={len(arguments)}, RSI={rsi:#x}, RSP={rsp:#x}, 사용량={TOP-rsp}B")
for i in range(len(arguments) + 1):
    slot = rsi + i * 8
    raw = memory[slot - BOTTOM:slot - BOTTOM + 8]
    print(f"argv[{i}] 슬롯 {slot:#x}: {raw.hex(' ')} -> {int.from_bytes(raw, 'little'):#x}")

for args, expected in [
    (["args-none"], (40, 6, 0x4747FFD8)),
    (["/bin/ls", "-la", "foo.txt"], (64, 4, 0x4747FFC0)),
    (["args-many"] + list("abcdefghijklmnopqrstuv"), (256, 2, 0x4747FF00)),
]:
    _, rsp, _, padding, _ = build_stack(args)
    assert (TOP - rsp, padding, rsp) == expected
    print(f"{args[0]}: argc={len(args)}, padding={padding}B, 사용량={TOP-rsp}B, RSP={rsp:#x}")
```

출력에서 `argv[0]`의 포인터 바이트는 `da ff 47 47 00 00 00 00`이다. x86-64의 Little Endian 순서로 해석하면 `0x4747ffda`가 된다. `argv[2]`의 슬롯은 `0x4747ffa8 + 2 × 8 = 0x4747ffb8`이고, 그 안의 포인터 `0x4747ffed`가 `arguments`를 가리킨다. `/bin/ls` 사례는 주소 계산용 문자열이며 PintOS에 해당 실행 파일이 설치되어 있다는 뜻은 아니다.

## 8바이트 정렬과 함수 호출의 16바이트 정렬

`(uintptr_t)stack_p & -8`은 하위 3비트를 지워 8의 배수로 내린다. 64비트 마스크는 `0xfffffffffffffff8`이며 `& ~7`로 써도 같은 결과다. 예를 들어 `0x4747ffdd`는 `0x4747ffd8`이 되고 padding은 5바이트다. 이 계산은 포인터 값만 바꾸며 메모리에 값을 쓰지 않는다. 여기서 쓰는 8바이트 단위를 모든 x86 문서의 `word` 정의로 일반화하지는 않는다.

문자열 뒤에는 `argc + 2`개의 8바이트 값이 놓이므로 최종 주소는 다음과 같다.

```text
문자열 사용량 = 각 인자의 UTF-8 바이트 수와 NUL 1바이트의 합
정렬 후 주소 = (USER_STACK - 문자열 사용량) & ~7
최종 RSP = 정렬 후 주소 - 8 × (argc + 2)
```

System V AMD64에서 일반 함수 호출 직전의 Stack은 최소 16바이트 경계에 맞는다. `call`이 반환 주소 8바이트를 추가한 직후에는 `(RSP + 8) % 16 == 0`이 된다. 반면 ELF 프로세스의 최초 진입은 호출자가 `call`로 만든 프레임이 아니며, ABI는 그때 RSP 자체의 16바이트 정렬을 정한다. 이 두 지점을 섞으면 `RSP % 16 == 0`이라는 관찰을 잘못 해석하게 된다. [함수 호출과 프로세스 초기 상태](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex)

현재 PintOS는 C 함수인 `_start(argc, argv)`에 들어가도록 가짜 반환 주소를 두지만, 위의 8바이트 내림 연산만으로 모든 입력에서 함수 진입의 16바이트 조건까지 보장하지는 않는다. `args-multiple`의 최종 RSP는 16으로 나누어떨어지므로 오히려 일반 함수 진입 조건 `(RSP + 8) % 16 == 0`에는 맞지 않는다. `args-none`은 나머지가 8이다. 한 예제의 결과를 전체 입력에 대한 보장으로 쓰면 안 된다.

일반적인 정수 메모리 접근의 비정렬 허용, Cache Line 경계를 걸친 접근의 비용, 정렬을 요구하는 SIMD 명령의 예외는 각각 다르다. 이 저장소는 `-mno-sse`로 빌드하지만, 그 설정만으로 호출 규약 위반이 언제나 무해하다고 결론 내릴 수는 없다. Windows x64도 별도의 호출 규약을 사용하며, 16바이트 Stack 정렬과 호출자가 마련하는 32바이트 Shadow Space를 함께 고려한다. [PintOS 빌드 옵션](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/Make.config), [Windows x64 호출 규약](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention)

## 서로 다른 크기 제한

명령줄을 복사할 수 있는지, 인자를 배열에 담을 수 있는지, 초기 Stack에 모두 놓을 수 있는지는 다른 검사다.

| 경계 | 현재 구현에서 확인할 조건 |
|---|---|
| 부팅 시 Kernel 명령줄 | `LOADER_ARGS_LEN = 128`인 Boot Loader 영역을 `read_command_line()`이 읽는다. 사용자 시스템 콜 `exec()`의 일반적인 문자열 제한과 구분한다. |
| 사용자 `exec()` 문자열 복사 | `copy_in_string()`은 4096바이트 범위 안에서 NUL을 찾아야 한다. 따라서 문자열 데이터의 최대 길이는 4095바이트다. 접근할 수 없는 주소도 거부한다. |
| `load()`의 Kernel 복사본 | `copy_command_line()`은 Page 하나를 확보하고 `strlcpy(..., PGSIZE)`로 복사한다. 사용자 `exec()`에서 들어오면 앞 단계가 길이를 검사하지만, 이 함수 자체는 긴 입력을 잘랐는지 반환값으로 확인하지 않는다. |
| 인자 수 | `argv[64]` 안에 실행 파일 이름을 포함한 인자들이 들어가야 한다. |
| 초기 Stack 사용량 | 문자열, padding, `argc + 2`개의 8바이트 값까지 합쳐야 한다. 현재 `setup_initial_stack()`은 이 전체 크기를 사전에 검사하지 않는다. |

[부팅용 명령줄](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/init.c#L206), [exec 문자열 복사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c#L602)

예를 들어 NUL을 포함한 문자열 영역이 정확히 4096바이트여도, 포인터와 가짜 반환 주소를 놓을 공간은 남지 않는다. 문자열 검사 통과가 초기 Page 안의 안전한 배치를 뜻하지 않는 이유다. 실제로 Page 아래쪽에 쓰면 어떤 종료 경로를 거치는지는 당시 매핑과 VM의 Kernel Page Fault 처리까지 확인해야 한다. 위 계산으로 알 수 있는 것은 초기 Page의 범위를 벗어난다는 점까지다.

```run-python
TOP = 0x47480000
PAGE_SIZE = 4096


def inspect_layout(arguments):
    string_bytes = sum(len(arg.encode("utf-8")) + 1 for arg in arguments)
    after_strings = TOP - string_bytes
    aligned = after_strings & ~7
    rsp = aligned - 8 * (len(arguments) + 2)
    return string_bytes, after_strings - aligned, TOP - rsp, rsp


for arguments in [["args-none"], "args-multiple some arguments for you!".split(" ")]:
    strings, padding, used, rsp = inspect_layout(arguments)
    assert rsp % 8 == 0
    print(arguments[0], f"문자열={strings}B, padding={padding}B, 사용량={used}B")
    print("  RSP % 16 =", rsp % 16, "; (RSP + 8) % 16 =", (rsp + 8) % 16)

command = "p " + "x" * 4093
arguments = command.split(" ")
strings, padding, used, rsp = inspect_layout(arguments)
assert len(command.encode("utf-8")) == 4095
assert strings == 4096 and len(arguments) == 2
assert used == 4128 and rsp < TOP - PAGE_SIZE
print(f"경계 입력: 명령줄 {len(command)}B, 인자 {len(arguments)}개, 초기 Stack {used}B 필요")
print("문자열 길이와 인자 수는 범위 안이지만 초기 Page보다 32바이트 큽니다.")

# 같은 한 Page 정책으로 개선한다면, 복사 전에 전체 사용량을 검사한다.
def fits_initial_page(arguments):
    return 0 < len(arguments) <= 64 and inspect_layout(arguments)[2] <= PAGE_SIZE

assert fits_initial_page(["args-none"])
assert not fits_initial_page(arguments)
```

`fits_initial_page()`는 현재 Kernel 함수에 없는 사전 검사를 모델로 보여준다. Stack Page를 여러 개 준비하는 설계도 가능하지만, 그 경우에도 포인터 크기와 정렬 공간을 포함한 계산은 필요하다.

## Linux의 시작 규약과 비교

Linux x86-64의 ELF 초기 Stack에서는 RSP가 `argc`를 담은 8바이트 슬롯을 가리킨다. 그 뒤에 `argv` 포인터들과 NULL, `envp` 포인터들과 NULL, Auxiliary Vector가 놓인다. `AT_PHDR`·`AT_ENTRY` 같은 값은 런타임과 동적 링커가 프로그램 정보를 찾는 데 사용한다. PintOS의 단순한 `_start()`와 달리 C 런타임이 초기 배치를 해석해 `main()`을 호출한다. 초기 RDX도 단순히 `envp`라고 부를 수 없다. ABI에서는 종료 처리용 함수 포인터로 의미를 정한다. [초기 Stack과 레지스터](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex), [Linux의 ELF 초기 테이블](https://github.com/torvalds/linux/blob/v6.12/fs/binfmt_elf.c#L145)

```text
낮은 주소, 초기 RSP
  argc
  argv[0] ... argv[argc - 1]
  NULL
  envp[0] ...
  NULL
  Auxiliary Vector
  ...
높은 주소 쪽 정보 영역: 인자 문자열, 환경 문자열 등
```

Linux의 초기 Stack 준비가 “물리 Page 없이 시작해서 사용자 프로그램의 첫 Fault만 기다리는 방식”인 것은 아니다. v6.12의 `copy_strings()`는 새 주소 공간의 Page를 확보해 기존 사용자 문자열을 복사한다. `setup_arg_pages()`는 임시 Stack의 위치와 VMA를 조정하고, `create_elf_tables()`는 포인터와 보조 정보를 쓴다. 이후 실행 중의 Stack 확장과 이 준비 과정을 구분한다. `RLIMIT_STACK`은 크기 제한이며, 그 값이 초기부터 전부 물리 메모리로 할당되었다는 뜻은 아니다. ASLR에 따른 주소도 환경에 따라 달라지므로 고정 시작 주소나 고정 8 MiB를 전제로 삼지 않는다. [문자열 복사와 Stack VMA 준비](https://github.com/torvalds/linux/blob/v6.12/fs/exec.c#L562)

Linux의 인자·환경 문자열 한도 역시 “인자 2 MiB”처럼 하나의 고정값으로 설명할 수 없다. MMU를 쓰는 일반적인 환경에서는 `RLIMIT_STACK`에서 유도한 전체 한도와 상한·하한을 적용하고, 개별 문자열은 32 Page 제한을 받는다. 4 KiB Page에서는 개별 문자열 한도가 128 KiB다. 이는 인자 개수 제한과도 다르다. 실제 전체 한도는 `sysconf(_SC_ARG_MAX)`로 확인한다. [execve의 인자와 환경 크기 제한](https://man7.org/linux/man-pages/man2/execve.2.html)

Windows에서는 `GetCommandLineW()`로 프로세스의 Unicode 명령줄 문자열을 얻을 수 있다. Microsoft C 시작 코드는 공백·Tab·따옴표 등의 규칙에 따라 `argc`와 `argv`를 만들고, GUI 프로그램은 `WinMain`·`wWinMain`의 명령줄 인자를 사용할 수도 있다. 따라서 PintOS의 단순한 공백 분리나 Linux의 ELF 초기 Stack을 Windows의 공통 인자 전달 방식으로 설명하지 않는다. [Windows 명령줄](https://learn.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-getcommandlinew), [Microsoft C의 인자 해석](https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments)

## GDB에서 레지스터와 바이트 연결하기

Kernel과 사용자 실행 파일의 Debug Symbol이 있는 환경에서 확인한다. 고정된 줄 번호나 함수의 임의 offset 대신 `setup_initial_stack()`과 `do_iret()`를 기준으로 삼는다. `setup_initial_stack()` 진입에서는 `if_`가 프레임 포인터이며 `$rdi` 자체가 사용자 RSP는 아니다. 사용자 인자 레지스터를 채우기 전에는 `if_->R.rdi`·`if_->R.rsi`도 최종값이 아니다.

```gdb
break setup_initial_stack
break do_iret

# setup_initial_stack(if_, argv, argc)에 들어왔을 때
p argc
p/x if_->rsp
x/s argv[0]

# 인자 적재 뒤 do_iret(tf)에 중단했을 때
p tf->R.rdi
p/x tf->R.rsi
p/x tf->rsp
p/x tf->rip
p/x ((unsigned long) tf->rsp & 0xf)
p/x (((unsigned long) tf->rsp + 8) & 0xf)

set $argv_base = (unsigned long) tf->R.rsi
set $argc = (int) tf->R.rdi
set $i = 0
while $i < $argc
  set $slot = $argv_base + $i * 8
  x/gx $slot
  set $argptr = *(unsigned long *) $slot
  x/s $argptr
  set $i = $i + 1
end
x/gx ($argv_base + $argc * 8)
x/gx tf->rsp
```

마지막 두 값은 각각 NULL sentinel과 가짜 반환 주소이므로 0이어야 한다. `args-multiple` 입력으로 관찰한다면 `x/96xb tf->rsp`로 사용한 96바이트 전체를 볼 수 있다. 문자열 복사·정렬·포인터 쓰기의 중간 상태가 필요하면 `list setup_initial_stack`과 소스 단위 `next`로 해당 연산을 지난 뒤 `stack_p`와 `argv[i]`를 읽는다. 초기화되지 않은 지역 변수의 값이나 중단 전의 레지스터를 예상 출력으로 적지 않는다.

사용자 `_start`의 실제 레지스터를 확인하려면 해당 실행 파일의 Symbol을 먼저 불러오고, 함수 prologue가 실행되기 전 Entry Point에서 중단한다. 소스 줄에 걸린 중단점은 prologue 뒤일 수 있으므로 그때 RSP가 변한 것을 인자 배치 오류로 오해하지 않는다.

QEMU에서 이 주소들은 Guest 가상 주소다. TCG로 실행할 때 메모리 접근은 Guest Page Table과 변환 Cache를 거쳐 Guest 물리 메모리의 backing에 도달한다. 매 접근마다 전체 Page Table을 다시 걷는 것은 아니다. GDB Stub은 Guest CPU의 레지스터와 메모리를 읽게 해주며, 인자 분리나 `argv` 배치는 PintOS 코드가 정한다. Host 메모리 주소에 `0x4747ffa0`을 그대로 대입해서 읽는 방식도 아니다. 정렬된 SIMD 접근에 필요한 예외 처리와 실제 CPU의 Cache 성능 측정은 구분한다. [QEMU 주소 변환과 접근 처리](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c), [TCG 메모리 명령 생성](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/translate.c), [GDB Stub](https://github.com/qemu/qemu/blob/v10.0.0/gdbstub/gdbstub.c)

## args 테스트가 확인하는 것

이 저장소의 `args-*`는 공통 `tests/userprog/args.c`를 사용한다. 프로그램은 `argc`, `argv[0]`부터 `argv[argc]`까지 출력하고, `argv` 주소가 8바이트 경계가 아니면 경고를 출력한다. `.ck` 파일은 이 출력을 기대값과 비교한다. `args-many.c`라는 별도 구현이 정렬을 보장하는 구조가 아니다. [테스트 실행 대상과 입력](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog/Make.tests), [공통 args 프로그램](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/userprog/args.c)

| 테스트 | 확인할 인자 |
|---|---|
| `args-none` | 실행 파일 이름만 있으므로 `argc = 1` |
| `args-single` | `onearg` 하나를 더해 `argc = 2`, `argv[1] = "onearg"`, `argv[2] = NULL`인지 확인 |
| `args-multiple` | `some arguments for you!`를 더해 `argc = 5` |
| `args-dbl-space` | `two  spaces!`의 연속 공백을 건너뛰어 `argc = 3` |
| `args-many` | `a`부터 `v`까지 22개 인자와 실행 파일 이름으로 `argc = 23` |

앞의 Python 예제는 문자열 복원, Little Endian 포인터, sentinel, 최종 주소와 크기를 검증한다. 실제 `args-*` 통과 여부와 16바이트 ABI 조건, 최대 인자 경계의 Kernel 동작은 각각 따로 확인해야 한다. 실행 파일이 메모리에 놓이는 과정은 [실행 파일 적재](/wiki/computer-systems-network-topic-a6a32eb78db0/), 초기 Page 이후의 확장은 [스택 확장](/wiki/computer-systems-network-topic-2ca44448445b/)으로 이어진다.
