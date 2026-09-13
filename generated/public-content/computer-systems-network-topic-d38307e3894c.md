---
layout: default
title: 장치
nav_order: 2
permalink: /wiki/computer-systems-network-topic-d38307e3894c/
publication_state: publish
has_toc: false
projection_id: Wiki/keywords/computer-systems-network-topic-d38307e3894c
projection_sha256: 5e43f49f2e30b0e8efd1b6f5724c1db61ffef2255a776d7cf0c3ed2ea83a5bd9
parent: 입출력
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-d4ff1bb79941
search_terms:
- Port I/O
- MMIO
- PMIO
- PIO
- DMA
- PIT
- PIC
- IDE
- VGA
- I/O Port
- MemoryRegionOps
grand_parent: OS
ancestor: CS 기초
---

# 장치
{: .no_toc }

`0x1f0`라는 숫자를 보았을 때 그것이 메모리 주소인지 I/O Port인지 먼저 구별해야 한다. PintOS의 IDE Driver에서 이 값은 Data Port다. 같은 숫자의 메모리를 읽는 것으로 디스크 데이터를 받을 수는 없다.

장치는 명령을 받는 Register, 데이터를 옮기는 통로, 완료를 알리는 방법을 제공한다. OS Driver는 이 약속에 맞춰 접근하고 여러 요청의 순서를 보호한다. 아래 PintOS 코드는 [lrn-pintos `9d1b14c`](https://github.com/woonyong-kr/lrn-pintos/tree/9d1b14cbdf41425ba8867af743c03cf32190ee9b), QEMU 내부 경로는 v10.0.0을 기준으로 한다. 실제 Guest를 부팅해 얻은 관찰 기록은 아니다.

## Port와 메모리에 놓인 Register

x86의 Port I/O는 메모리와 구분되는 16비트 Port 공간을 사용한다. `IN`·`OUT`은 1·2·4바이트 단위로 값을 전달하고, 반복 I/O 명령은 같은 Port와 메모리 버퍼 사이에서 여러 값을 옮긴다. PintOS의 `inb`·`outb`, `insw`·`outsw`는 이런 명령을 감싼 함수다. [PintOS I/O Wrapper](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/io.h)

MMIO는 장치 영역을 물리 주소 공간에 배치한다. CPU가 해당 영역에 load/store를 실행하면 일반 RAM 대신 장치가 응답한다. 가상 주소를 사용하는 Kernel에서는 그 장치 영역으로 연결되는 Mapping도 필요하다.

| 구별할 조건 | Port I/O | MMIO |
|---|---|---|
| 주소의 뜻 | 별도 I/O 공간의 Port 번호 | 장치 영역으로 연결되는 메모리 주소 |
| x86의 접근 | IN·OUT 및 반복 I/O 명령 | 메모리 load/store 명령 |
| PintOS 예 | PIT 설정, PIC 제어, IDE PIO | VGA 텍스트 화면의 문자·속성 바이트 |
| 접근 전 확인 | Port 번호·폭과 I/O 권한 | Mapping·접근 권한·장치의 메모리 속성과 폭 |

PintOS가 모든 장치에 Port I/O로만 접근하는 것은 아니다. `devices/vga.c`의 초기화는 `ptov(0xb8000)`을 화면 버퍼 포인터로 저장한다. 문자 한 칸은 문자와 속성 두 바이트이며, 80열·25행이면 총 4,000바이트다. 반면 VGA 커서 위치는 CRT Port `0x3d4`·`0x3d5`로 읽고 쓴다. **같은 장치에도 두 접근 방식이 함께 쓰일 수 있다.** [VGA 화면과 커서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/devices/vga.c)

다음 예제는 Port 상태와 화면 버퍼를 별도로 만든다. 실제 Port나 화면 메모리에 쓰지 않고 주소 공간의 구분과 문자 위치 계산을 실행한다.

```run-python
ports = {0x43: 0}
memory = {0x43: 99}
ports[0x43] = 0x34
print(f'Port 0x43={ports[0x43]:#x}, memory[0x43]={memory[0x43]}')
assert memory[0x43] == 99

columns, rows = 80, 25
framebuffer = bytearray(columns * rows * 2)

def put_cell(x, y, character, attribute):
    if not (0 <= x < columns and 0 <= y < rows):
        raise ValueError('화면 범위를 벗어났다.')
    if len(character) != 1 or not (0 <= ord(character) < 128 and 0 <= attribute <= 255):
        raise ValueError('ASCII 문자 한 개와 한 바이트 속성이 필요하다.')
    offset = (y * columns + x) * 2
    framebuffer[offset:offset + 2] = bytes((ord(character), attribute))
    return offset

offset = put_cell(2, 1, 'A', 0x1f)
gpa = 0xb8000 + offset
kernel_va = 0x8004000000 + gpa
print(f'화면 크기={len(framebuffer)} bytes, (2, 1)의 offset={offset}')
print(f'GPA={gpa:#x}, Kernel VA={kernel_va:#x}')
print('문자와 속성:', framebuffer[offset:offset + 2].hex(' '))
assert framebuffer[offset:offset + 2] == b'A\x1f'
try:
    put_cell(80, 0, 'B', 7)
except ValueError as error:
    print('좌표 검사:', error)
else:
    raise AssertionError('화면 밖의 좌표는 거부해야 한다.')
```

Python 3.9.6에서 실행한 결과다.

```text
Port 0x43=0x34, memory[0x43]=99
화면 크기=4000 bytes, (2, 1)의 offset=164
GPA=0xb80a4, Kernel VA=0x80040b80a4
문자와 속성: 41 1f
좌표 검사: 화면 범위를 벗어났다.
```

Port `0x43`에 기록한 값은 같은 숫자의 메모리 값을 바꾸지 않는다. 화면의 `(2, 1)` 위치는 `(1*80+2)*2 = 164`바이트 지점이고, 문자 `A`와 속성 `0x1f`가 나란히 저장된다. Python 버퍼 자체가 물리 주소 `0xb8000`에 있다는 뜻은 아니다.

## MMIO를 일반 변수처럼 다루면 안 되는 이유

장치 Register는 읽는 것만으로 상태가 바뀌거나, 정해진 크기로 써야 동작할 수 있다. 단순히 `volatile` 포인터를 붙이는 것으로 CPU의 접근 순서·메모리 속성·장치까지의 전달 완료가 모두 보장되지는 않는다.

Linux Driver는 장치 자원을 확인하고 `ioremap()` 또는 자원 관리 Wrapper로 Mapping을 얻은 뒤 `readl()`·`writel()` 같은 접근자를 사용한다. Register용 기본 Mapping과 화면 버퍼 등에 사용할 수 있는 Write Combining은 보장하는 조건이 다르다. Posted Write에서는 CPU의 쓰기 명령이 끝나도 장치에 아직 도착하지 않았을 수 있어, 필요한 경우 같은 장치의 읽기로 완료를 확인한다. 일반 `memcpy()` 대신 I/O 전용 복사 API가 필요한 경우도 있다. [Linux의 장치 접근과 Mapping 조건](https://www.kernel.org/doc/html/latest/driver-api/device-io.html)

Port I/O와 MMIO는 **어디에 어떻게 명령을 쓰는가**의 구분이다. CPU가 데이터를 직접 옮기는 PIO와 장치가 메모리에 접근하는 DMA의 구분과 같지 않다. 예를 들어 MMIO Register로 DMA 요청을 시작할 수 있다. PintOS IDE의 데이터 전송은 CPU의 반복 Port I/O를 사용하며, 그 전송·대기 순서는 [IDE 컨트롤러](/wiki/ide-controller/)에서 읽는다.

## PIT·PIC·IDE는 서로 다른 일을 한다

PIT는 설정된 카운터와 모드에 따라 Timer 출력을 만들고, PIC는 장치의 IRQ 요청을 CPU에 전달한다. IDE Controller는 저장 장치의 명령·상태·데이터를 제공한다. PIC가 디스크 데이터를 옮기거나 PIT가 실행할 Thread를 선택하는 것은 아니다.

| 장치 | 현재 PintOS의 접근 위치 | 관련 IRQ·Vector |
|---|---|---|
| PIT Counter 0 | Data `0x40`, Control `0x43` | IRQ0 → `0x20` |
| PIC Master | `0x20`·`0x21` | IRQ0–7의 요청과 상태 |
| PIC Slave | `0xa0`·`0xa1` | IRQ8–15; Master IRQ2로 연결 |
| IDE Primary | `0x1f0`–`0x1f7`, Control `0x3f6` | IRQ14 → `0x2e` |
| IDE Secondary | `0x170`–`0x177`, Control `0x376` | IRQ15 → `0x2f` |
| Keyboard | Data `0x60`, Controller `0x64` | IRQ1 → `0x21` |
| Serial COM1 | `0x3f8`부터의 Register | IRQ4 → `0x24` |

표의 Vector는 PintOS가 PIC를 초기화하면서 정한 배치다. IRQ 번호와 Vector 값을 같은 숫자로 읽지 않는다. PIC는 요청 상태(IRR), Mask(IMR), 처리 중인 상태(ISR)를 구별한다. 요청이 생겨도 Mask와 우선순위, CPU의 인터럽트 허용 상태 등에 따라 바로 Handler가 실행되는 것은 아니다. [PintOS PIC 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c#L356), [QEMU PIC 모델](https://github.com/qemu/qemu/blob/v10.0.0/hw/intc/i8259.c)

현재 `timer_init()`은 PIT Counter 0에 모드와 카운터를 쓰고 Vector `0x20`의 Handler를 등록한다. `TIMER_FREQ=100`일 때 코드의 정수 계산은 `(1193180 + 50) / 100 = 11932`다. QEMU의 PIT 모델은 가상 시간인 `QEMU_CLOCK_VIRTUAL`을 사용해 다음 출력 변화를 예약하고 IRQ Line의 상태를 갱신한다. Guest의 Timer 설정 주기와 Host 벽시계에서 관찰하는 Handler 실행 간격은 다를 수 있다. [Timer 설정](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/devices/timer.c), [QEMU PIT의 가상 시간](https://github.com/qemu/qemu/blob/v10.0.0/hw/timer/i8254.c)

PIT 계열 칩에는 Counter 0·1·2가 있고 데이터 Port는 각각 `0x40`·`0x41`·`0x42`다. Counter 1의 DRAM Refresh와 Counter 2의 Speaker 연결은 전통적인 PC의 용도이며, 현재 PintOS의 Scheduler Tick은 Counter 0을 사용한다. 1.19318 MHz는 이 PC 타이머 경로에서 사용하는 입력 Clock 값이다. 칩 자체가 항상 그 주파수의 내부 발진기를 갖는다는 뜻은 아니다.

`0x34 = 00 11 010 0₂`에서 차례로 Counter 0, 하위 Byte 뒤 상위 Byte 쓰기, Mode 2, Binary Counting을 읽는다. Binary Counter에 쓰는 16비트 값 0은 65,536으로 해석된다. 호환 칩인 82C54의 Mode 2 설명에서 OUT은 처음 HIGH이며, Count가 1이면 한 CLK 동안 LOW가 되고 다음 CLK에서 HIGH로 돌아오며 재로드한다. GATE도 계수와 재시작에 관여한다. 이 하드웨어 주기는 `thread_awake()`가 끝날 때 재로드하는 소프트웨어 루프가 아니다. [82C54 데이터시트, Mode 2](https://www.renesas.com/us/en/document/dst/82c54-datasheet#page=13), [QEMU의 Count 로드](https://github.com/qemu/qemu/blob/v10.0.0/hw/timer/i8254.c#L102)

다음 계산은 제어어와 두 Byte의 쓰기 순서를 확인한다. PintOS의 Count 계산 상수 `1193180`과 QEMU v10.0.0의 `PIT_FREQ=1193182`는 조금 다르므로 각각의 명목 출력 주파수를 표시한다. 실제 IRQ 수신 간격이나 물리 발진기의 오차를 측정한 결과가 아니다. [QEMU PIT_FREQ](https://github.com/qemu/qemu/blob/v10.0.0/include/hw/timer/i8254.h#L33)

```run-python
control = 0x34
channel = (control >> 6) & 3
access = (control >> 4) & 3
mode = (control >> 1) & 7
bcd = control & 1
target_hz = 100
count = (1193180 + target_hz // 2) // target_hz
low, high = count & 0xff, count >> 8
assert (channel, access, mode, bcd) == (0, 3, 2, 0)
assert low | (high << 8) == count
print(f"channel={channel}, access={access}, mode={mode}, bcd={bcd}")
print(f"count={count}, bytes={low:#04x} -> {high:#04x}")
for label, clock_hz in [("PintOS 계산 상수", 1193180), ("QEMU v10.0.0", 1193182)]:
    rate = clock_hz / count
    print(f"{label}: {rate:.9f} Hz, 목표 대비 {(rate / target_hz - 1) * 100:.6f}%")
```

실행 결과:

```text
channel=0, access=3, mode=2, bcd=0
count=11932, bytes=0x9c -> 0x2e
PintOS 계산 상수: 99.998323835 Hz, 목표 대비 -0.001676%
QEMU v10.0.0: 99.998491452 Hz, 목표 대비 -0.001509%
```

QEMU의 사용자 공간 `isa-pit` 모델은 입력 Clock마다 루프를 돌며 Count를 1씩 줄이지 않는다. `PITChannelState`는 `include/hw/timer/i8254_internal.h`에 정의되어 있고 Count·읽기 상태·래치·`count_load_time` 등을 보관한다. `pit_load_count()`가 저장하는 시각은 Host 벽시계가 아니라 `QEMU_CLOCK_VIRTUAL`의 값이다. Mode 2의 `pit_get_count()`는 그 시각 이후의 입력 Cycle 수를 계산해 `N - (d % N)`으로 현재 Count를 구한다. 하위·상위 Byte를 읽는 사이에도 시간이 진행할 수 있으므로 같은 순간의 값을 읽으려면 Count Latch 동작을 구별해야 한다. [PIT 상태](https://github.com/qemu/qemu/blob/v10.0.0/include/hw/timer/i8254_internal.h), [Count 읽기와 래치](https://github.com/qemu/qemu/blob/v10.0.0/hw/timer/i8254.c#L49)

예약된 `pit_irq_timer()`는 `pit_irq_timer_update()`를 호출한다. 이 함수는 `pit_get_next_transition_time()`과 `pit_get_out()`으로 다음 시점과 출력 Level을 구하고 `qemu_set_irq()`로 Line을 갱신한 뒤 Timer를 다시 예약하거나 지운다. 항상 IRQ를 HIGH로 올리기만 하는 함수가 아니다. 이 이벤트 모델을 설명할 때 물리 칩의 모든 Pulse·GATE 타이밍을 완전히 재현한다고 확대하지 않으며, 별도의 `kvm-pit` 경로와도 구분한다. [출력 갱신](https://github.com/qemu/qemu/blob/v10.0.0/hw/timer/i8254.c#L242), [Mode별 시간·출력 계산](https://github.com/qemu/qemu/blob/v10.0.0/hw/timer/i8254_common.c#L28)

## 초기화와 완료 처리를 코드 순서로 따라간다

PintOS의 `main()`은 `intr_init()`, `timer_init()`, `kbd_init()`, `input_init()`으로 인터럽트·입력 경로를 준비한다. USERPROG이면 예외와 syscall도 초기화한다. 그다음 `thread_start()`가 Idle Thread를 만들고 `intr_enable()`을 실행한다. 이후 `serial_init_queue()`, `timer_calibrate()`가 이어지며, FILESYS 빌드의 `disk_init()`은 그 뒤에 있다. 이 순서에서는 디스크 초기화에 앞서 인터럽트가 활성화된다. [실제 초기화 순서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/init.c#L113), [스케줄러 시작과 인터럽트 활성화](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c#L201)

외부 인터럽트가 들어오면 공통 `intr_handler()`가 Vector에 등록한 Handler를 호출한다. Timer Handler는 틱과 Scheduler 처리를 이어 가고, 디스크 Handler는 요청의 완료 Semaphore에 신호를 보낸다. 장치 Handler가 돌아온 뒤 공통 경로가 PIC에 EOI를 보내고, 필요한 경우 복귀 전에 `thread_yield()`를 실행한다. 장치별 Handler와 공통 완료 처리가 이렇게 나뉜다. [공통 인터럽트 처리](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c#L415)

IDE 읽기는 명령 발행, 완료 대기, 데이터 수거를 구별한다. `insw(port, buffer, 256)`는 Wrapper 한 번으로 16비트 Word 256개를 전송한다. 장치 callback 횟수는 Wrapper의 호출 횟수뿐 아니라 상태 조회·재시도와 장치 구현의 접근 폭에도 영향을 받는다. Channel Lock과 Semaphore가 보호하는 내용은 [IDE 컨트롤러](/wiki/ide-controller/)의 읽기·쓰기 비교에 이어진다.

## HDD와 SSD는 같은 요청도 다르게 처리한다

HDD는 회전하는 Platter의 자기 상태로 데이터를 보관한다. Head를 Track으로 옮기는 Seek, 목표 Sector가 돌아오기를 기다리는 회전 지연, 데이터 전송이 읽기 비용에 더해진다. 여러 면에서 같은 반지름에 놓인 Track을 Cylinder라고 부른다. 현대 장치에 보이는 LBA 번호만으로 실제 Head 위치나 Track을 직접 계산할 수 있는 것은 아니다.

예를 들어 7,200 RPM은 한 바퀴에 `60 / 7200`초, 약 8.33 ms다. 도착하는 회전 위치가 균등하다고 가정하면 평균 회전 대기는 반 바퀴인 약 4.17 ms다. Seek와 Queue 대기·전송은 제외한 계산이며, 제품의 전체 읽기 지연을 측정한 값이 아니다. 연속 읽기가 흩어진 작은 읽기보다 유리할 수 있는 이유도 이 이동과 대기에 있다.

SSD의 NAND Flash에는 이런 기계적 이동이 없다. 대신 데이터를 Program하는 Page와 Erase하는 Block의 단위가 다르다. 사용하던 위치를 갱신할 때 새 위치에 기록하고, 남아 있는 유효 데이터를 옮긴 뒤 오래된 Block을 지우는 처리가 필요할 수 있다. FTL은 Host의 논리 주소와 Flash의 실제 위치를 연결한다. Garbage Collection 때문에 Host가 쓴 양보다 내부에서 더 많이 쓸 수 있고, Wear Leveling은 지우기·쓰기 부담이 일부 Block에 집중되지 않도록 분산한다. [NAND의 Page와 Block](https://onlinedocs.microchip.com/oxy/GUID-87101AE8-6003-4D1F-B624-895C158CCD3E-en-US-1/GUID-F3BE160C-4AEC-4F0A-92A7-39025FDDEE0B.html), [NAND 관리 기능](https://www.micron.com/products/storage/nand-flash/choosing-the-right-nand)

SLC·MLC·TLC·QLC는 통상 Cell당 각각 1·2·3·4비트를 저장하는 구분이다. Cell 종류만으로 모든 제품의 수명이나 속도를 하나의 숫자로 정할 수는 없다. Controller, 병렬 처리, 여유 공간, Cache 상태와 Workload도 결과에 영향을 준다. SSD의 Random I/O에 기계적 Seek가 없다는 사실이 모든 요청의 지연이 같다는 뜻은 아니다. SATA의 NCQ와 NVMe의 Queue 구조도 같은 기능 이름으로 묶지 않는다.

RAM과 CPU Cache는 저장 장치 접근을 줄이는 데 도움을 주지만 전원이 꺼진 뒤의 보존 조건과 접근 단위가 다르다. 성능을 비교할 때는 평균 지연뿐 아니라 요청 크기·순차성·동시 요청 수·Cache 적중과 지속 쓰기 상태를 확인해야 한다. 오래된 단일 속도 표를 모든 최신 HDD·SSD의 값으로 사용하는 것은 적절하지 않다.

PintOS의 ATA Driver는 LBA와 512바이트 Sector를 사용하며 `insw(..., 256)`으로 16비트 Word 256개를 받는다. 게스트에 IDE 디스크가 보인다는 사실만으로 Host 저장 장치도 HDD라고 판단하지 않는다. QEMU의 Backing File이 SSD에 있을 수도 있고, Guest의 명령 완료에는 Emulator와 Host Cache도 관여한다. 실제 물리 HDD의 Seek 시간을 재현하는 측정과는 구별해야 한다. LBA 폭의 제한과 파일 이미지의 offset은 [저장 공간 관리](/wiki/computer-systems-network-topic-33acdcc0a664/)에서 다룬다.

## QEMU 안에서 조사할 때는 Debugger의 대상을 바꾼다

QEMU v10.0.0에서 x86 `helper_outb()`는 `address_space_stb(&address_space_io, ...)`, `helper_inb()`는 `address_space_ldub(...)`를 사용한다. MemoryRegion에 등록한 장치 callback으로 연결되지만, MMIO의 Guest 메모리 접근과 처음부터 같은 CPU 경로를 거치는 것은 아니다. MMIO에서는 주소 변환 정보가 적중해도 장치 callback을 위한 느린 경로가 필요할 수 있다. 느린 경로를 무조건 TLB Miss라고 읽지 않는다. [Port I/O Helper](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/misc_helper.c#L30)

Guest GDB에서는 `timer_interrupt()`, `pic_end_of_interrupt()`, `issue_pio_command()` 같은 PintOS 함수를 관찰한다. Host Debugger에서는 QEMU의 `pit_ioport_write()`, `pic_ioport_write()`, `helper_outb()` 등을 조사한다. 서로 다른 실행 파일의 Symbol이므로 Guest GDB 연결 하나로 두 쪽의 내부 함수를 모두 볼 수는 없다. 인라인 `outb()`에 항상 함수 진입점이 있을 것이라고 가정하는 대신 호출한 코드와 Disassembly도 확인한다.

타이머를 관찰할 때는 중단점 방문 횟수와 가상 시간의 진행을 구별한다. 디스크에서는 IRQ가 왔는지뿐 아니라 어느 Channel의 어떤 요청이 완료됐는지 확인한다. QEMU의 영역 배치와 Callback 전달은 [QEMU](/wiki/computer-systems-network-qemu-b1366076be02/), 저장 요청이 Host 파일까지 내려가는 과정은 [BlockBackend](/wiki/qemu-block-backend/)에서 이어서 읽는다.
