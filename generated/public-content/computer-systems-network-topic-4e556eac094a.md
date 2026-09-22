---
layout: default
title: 프로세스 간 통신
nav_order: 7
permalink: /wiki/computer-systems-network-topic-4e556eac094a/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-4e556eac094a
projection_sha256: d6f6d739287242a612323c0610da5fbd1108878a258632154419d2906fd9ab83
parent: 프로세스와 스레드
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-63b969bafddd
grand_parent: OS
ancestor: CS 기초
---

# 프로세스 간 통신
{: .no_toc }

프로세스는 각자의 주소 공간에서 실행한다. 다른 프로세스에 데이터를 넘기려면 받을 대상을 정하고, 데이터를 전달하거나 함께 볼 영역을 마련해야 한다. IPC는 이 통신에 사용하는 기능을 뜻한다.

메시지를 보내는 방식에서는 Pipe·Socket·Message Queue 같은 통신 객체에 데이터를 넘긴다. Shared Memory에서는 같은 저장 영역을 각자의 주소 공간에 Mapping하고 직접 읽고 쓴다. 전자는 메시지를 언제 받을 수 있는지, 후자는 공유한 값을 언제 읽어도 되는지가 중요한 문제가 된다.

## 전달할 데이터의 경계를 정한다

| 방식 | 연결할 대상 | 전달 단위 | 앱에서 정할 규칙 |
| --- | --- | --- | --- |
| Pipe | 읽기·쓰기 fd를 가진 프로세스 | Byte Stream | 메시지 구분, 사용하지 않는 fd의 종료 |
| FIFO | 같은 경로를 열 수 있는 프로세스 | Byte Stream | 열기 순서, 권한, 메시지 구분 |
| Message Queue | 같은 Queue에 접근할 수 있는 프로세스 | 메시지 | 요청·응답 연결, 우선순위와 처리 실패 |
| Socket | 로컬 프로세스 또는 네트워크 상대 | Stream 또는 Datagram 등 | 주소, 프로토콜, 오류와 종료 처리 |
| Signal | 신호를 보낼 권한이 있는 대상 | 이벤트와 제한된 부가 정보 | Handler, 중복 알림과 누락 가능한 횟수 |
| Shared Memory | 같은 객체를 Mapping한 로컬 프로세스 | 공유한 메모리의 내용 | 배치, 동기화, 수명과 복구 |

커널이 대기와 깨우기를 제공해도 앱의 데이터 구조나 Transaction까지 관리해 주지는 않는다. 예를 들어 작업 내용을 Shared Memory에 두고 Pipe로 준비 완료를 알릴 수 있다. 이 경우에도 수신자가 처리를 마치기 전에 송신자가 같은 영역을 덮어쓰지 않도록 순서를 정해야 한다.

## Pipe는 쓰기 호출의 경계를 보존하지 않는다

`pipe()`는 읽기 끝과 쓰기 끝을 가리키는 fd 두 개를 만든다. `fork()`로 상속하거나 다른 방법으로 fd를 전달받은 프로세스가 같은 Pipe에 접근할 수 있다. 휴대 가능한 POSIX 프로그램에서는 한 Pipe를 단방향으로 사용한다. 양방향 대화에는 두 Pipe나 양방향 Socket을 사용할 수 있다.

보낸 데이터는 순서대로 읽지만, 한 번 쓴 길이와 한 번 읽은 길이가 같을 필요는 없다. 다음 코드는 자식 프로세스가 쓴 `hello`를 부모가 두 부분으로 읽는다. Python의 `stdout=PIPE`가 두 프로세스를 연결한다.

```run-python
import subprocess
import sys

sender = "import sys; sys.stdout.buffer.write(b'hello')"
with subprocess.Popen(
    [sys.executable, "-c", sender], stdout=subprocess.PIPE
) as child:
    first = child.stdout.read(2)
    rest = child.stdout.read()
    status = child.wait(timeout=5)

assert status == 0
assert (first, rest) == (b"he", b"llo")
print("first:", first.decode())
print("rest:", rest.decode())
print("combined:", (first + rest).decode())
```

출력은 `he`, `llo`, `hello` 순이다. 마지막 `read()`는 남은 데이터를 읽고 자식이 쓰기 끝을 닫을 때 EOF를 만난다. 여러 메시지를 구분하려면 길이 필드나 구분자처럼 양쪽이 합의한 Framing이 필요하다. 낮은 수준의 `read()`·`write()`를 직접 사용한다면 부분 처리와 오류도 반환값으로 확인한다.

### 버퍼 용량과 원자적 쓰기

Pipe에 데이터가 없고 쓰기 끝은 열려 있으면 Blocking 읽기가 기다린다. 버퍼가 가득 차면 쓰기가 기다린다. 쓰기 끝을 가리키는 fd가 모두 닫히면 남은 데이터를 읽은 뒤 EOF를 받는다. 읽기 끝이 모두 닫힌 상태의 쓰기는 `SIGPIPE`를 일으킬 수 있고, 신호를 무시하는 경우 `EPIPE` 오류를 받는다. 자식에게 불필요한 fd를 남겨 두면 EOF가 예상보다 늦어지는 이유다.

`PIPE_BUF`는 다른 Writer의 데이터와 섞이지 않는 쓰기 길이의 기준이다. 전체 버퍼 용량과는 다르다. 길이가 `PIPE_BUF` 이하인 쓰기는 Blocking 모드에서 공간을 기다려 한 덩어리로 기록한다. Nonblocking 모드에서는 전부 넣을 공간이 없으면 `EAGAIN`으로 실패한다. 더 큰 쓰기는 다른 Writer와 섞일 수 있다. 이 보장은 수신자의 읽기를 같은 크기로 묶어 주지는 않는다. [Pipe의 대기와 원자성](https://man7.org/linux/man-pages/man7/pipe.7.html)

Linux에서는 `F_GETPIPE_SZ`로 용량을 조회하고 제한 안에서 `F_SETPIPE_SZ`로 바꿀 수 있다. Page 크기, 사용자별 사용량과 `/proc/sys/fs/pipe-max-size` 등의 설정에 따라 값이 달라진다. 고정된 64 KiB를 전제로 송신량을 정하기보다 읽기와 쓰기가 함께 진행되도록 설계한다.

### 이름으로 여는 FIFO

FIFO는 `mkfifo()`로 파일 시스템에 이름을 만든다. 서로 무관한 프로세스도 권한이 허용되면 같은 경로를 `open()`해 통신한다. 일반적인 Blocking 열기에서는 반대편이 열릴 때까지 기다릴 수 있어 시작 순서도 고려한다. 이름은 파일 시스템에 있지만 전송 데이터가 그 이름의 디스크 파일에 쌓이는 구조는 아니다. 사용을 끝낸 fd를 닫고 더 이상 필요 없는 이름은 제거한다. [FIFO 열기](https://man7.org/linux/man-pages/man7/fifo.7.html)

셸의 `producer | consumer`도 fd 연결을 이용한다. 앞 명령의 표준 출력을 쓰기 끝에, 뒤 명령의 표준 입력을 읽기 끝에 연결한다. fd 0과 1의 의미와 복제는 [파일 디스크립터](/wiki/pintos-file-descriptors/)에서 다룬다.

## 메시지 단위로 주고받기

POSIX Message Queue는 `mq_open()`으로 열고 `mq_send()`·`mq_receive()`로 메시지를 주고받는다. 수신은 Queue에 들어 있는 메시지 중 우선순위가 높은 것부터 처리하며, 같은 우선순위에서는 먼저 들어온 메시지가 앞선다. 수신 Buffer는 Queue의 최대 메시지 크기를 담을 수 있어야 한다. 사용이 끝난 Descriptor는 `mq_close()`, 이름은 `mq_unlink()`로 정리한다. [POSIX Message Queue](https://man7.org/linux/man-pages/man7/mq_overview.7.html)

System V Message Queue는 `msgget()`·`msgsnd()`·`msgrcv()`를 사용한다. 메시지의 양수 타입과 `msgrcv()`의 선택 조건으로 받을 대상을 고른다. Queue에 여러 프로세스가 넣고 꺼낼 수 있지만, 한 Queue가 자동으로 요청과 응답의 방향을 나누어 주지는 않는다. 상대와 요청을 식별하는 규약을 함께 설계한다. [System V 메시지 수신](https://man7.org/linux/man-pages/man2/msgop.2.html)

Socket에서는 주소 체계와 종류를 함께 확인한다. `AF_INET`·`AF_INET6`의 Stream은 일반적으로 TCP, Datagram은 UDP를 사용한다. `AF_UNIX`는 로컬 IPC이며, Linux의 Unix Datagram은 메시지 경계와 신뢰성·순서를 보존한다. 따라서 `SOCK_DGRAM`이라는 이름만으로 UDP의 손실 특성을 적용할 수는 없다. Unix Domain Socket은 `SCM_RIGHTS`를 통해 fd를 전달하는 기능도 제공한다. [Unix Domain Socket](https://man7.org/linux/man-pages/man7/unix.7.html)

연결 수락과 Stream의 부분 송수신, TCP·UDP 실행 예제는 [Socket](/wiki/socket/)에 있다. 로컬과 네트워크 통신을 비교할 때도 Payload, Buffering과 부하가 같은지 확인해야 한다.

## Signal은 이벤트를 알린다

Signal은 종료 요청이나 자식 상태 변화처럼 이벤트를 알리는 데 쓴다. `kill()`은 대상에 신호를 보내고, `sigaction()`은 수신했을 때의 동작을 정한다. Signal Handler에서는 비동기 신호 처리에 안전한 작업만 한다. 복잡한 처리는 Handler에서 상태를 표시한 뒤 정상 실행 흐름에서 수행하는 방법을 사용할 수 있다.

| 이름 | Linux의 기본 동작과 용도 |
| --- | --- |
| `SIGHUP` | 종료. 서비스가 별도 Handler로 설정 재읽기에 사용하기도 한다 |
| `SIGINT` | 종료. 터미널의 Ctrl+C와 연결된다 |
| `SIGTERM` | 종료 요청. Handler에서 정리 절차를 둘 수 있다 |
| `SIGKILL` | 강제 종료. 잡거나 차단하거나 무시할 수 없다 |
| `SIGSTOP` | 정지. 잡거나 차단하거나 무시할 수 없다 |
| `SIGCHLD` | 기본은 무시. 자식의 종료·정지·재개 상태를 알린다 |
| `SIGPIPE` | 읽는 상대가 없는 Pipe 등의 쓰기에서 종료 |
| `SIGSEGV` | 잘못된 메모리 접근에서 종료와 Core Dump. 실제 덤프 생성에는 설정이 적용된다 |
| `SIGUSR1`·`SIGUSR2` | 사용자 정의 알림. 기본 동작은 종료 |

번호는 OS와 아키텍처에 따라 달라질 수 있으므로 코드에는 이름을 쓴다. Standard Signal은 같은 신호가 대기 중일 때 여러 번 발생해도 각각 Queue에 쌓이지 않는다. Real-time Signal은 Queue와 부가 값 전달을 지원하지만 자원 한도가 있다. `sigqueue()`로 보낸 Pointer 값도 받는 프로세스에서 유효한 주소로 자동 변환되지는 않는다. [Signal의 전달 규칙](https://man7.org/linux/man-pages/man7/signal.7.html)

## 같은 메모리를 각자의 주소로 읽는다

Shared Memory에서 중요한 것은 두 프로세스가 사용하는 가상 주소 숫자가 아니라 Mapping 대상이다. Page 크기가 4 KiB이고 같은 물리 Frame을 Mapping했다면 다음처럼 서로 다른 VA로 같은 Byte를 가리킬 수 있다.

| 항목 | 프로세스 A | 프로세스 B |
| --- | --- | --- |
| 가상 Page 시작 | `0x7f000000` | `0x7f500000` |
| PFN | `0x1a` | `0x1a` |
| 물리 Page 시작 | `0x1a000` | `0x1a000` |
| offset `0x20`의 VA | `0x7f000020` | `0x7f500020` |
| 접근하는 PA | `0x1a020` | `0x1a020` |

PFN은 Frame 번호다. Page 시작의 물리 주소는 `PFN × Page 크기`로 계산한다. 실제 프로그램은 주소 숫자를 맞추기보다 공유 객체와 그 안의 offset을 맞춘다. 영역 안에 다른 프로세스의 Pointer를 그대로 저장하면 Mapping 주소가 다른 쪽에서 사용할 수 없으므로, 공통 기준의 offset 같은 표현이 필요하다.

### 공유 객체를 만들고 Mapping한다

| 인터페이스 | 생성·연결 | 사용 후 정리 |
| --- | --- | --- |
| POSIX Shared Memory | `shm_open()` → `ftruncate()` → `mmap(MAP_SHARED)` | `munmap()`·`close()`와 이름의 `shm_unlink()` |
| System V Shared Memory | `shmget()` → `shmat()` | `shmdt()`와 `shmctl(IPC_RMID)` |
| 익명 공유 Mapping | `mmap(MAP_SHARED \| MAP_ANONYMOUS)` 후 `fork()` 등으로 공유 | 각 프로세스의 `munmap()` |
| 일반 파일의 공유 Mapping | 같은 파일 범위를 `mmap(MAP_SHARED)` | Mapping·fd·파일 이름의 수명을 각각 관리 |

새 POSIX 객체의 크기는 0이다. 생성자가 크기와 내용을 준비한 뒤 다른 프로세스가 접근하도록 순서를 정한다. `ftruncate()`는 논리 크기를 정하고 `mmap()`은 주소 범위를 연결한다. 물리 Page와 PTE의 준비는 첫 접근의 Page Fault까지 늦춰질 수 있다. 1 MiB는 4 KiB Page 256개 분량이지만, Mapping 요청 순간에 256개 Frame을 전부 확보한다는 뜻은 아니다. [공유 객체의 API와 수명](https://man7.org/linux/man-pages/man7/shm_overview.7.html)

Linux의 POSIX Shared Memory는 보통 `/dev/shm`의 tmpfs를 사용한다. tmpfs는 설정과 메모리 압박에 따라 Swap을 사용할 수 있다. 익명 공유 Mapping에도 내부 Shared Memory 파일 시스템을 사용한다. 이름 있는 일반 파일이 없다는 사실만으로 영구히 RAM에만 머문다고 판단할 수는 없다. 용량 한도도 Mount와 Container 설정을 확인한다. [tmpfs와 Swap](https://man7.org/linux/man-pages/man5/tmpfs.5.html)

### 공유 쓰기와 Private 쓰기를 실행해 비교하기

다음 예제는 일반 임시 파일을 두 프로세스에 Mapping한다. 자식은 같은 파일에 Shared Mapping과 Private Mapping을 하나씩 만든다. Private 쪽을 먼저 바꾼 뒤 Shared 쪽을 바꾸면 각 Mapping과 부모에게 어떤 값이 남는지 볼 수 있다. POSIX 이름 기반 Shared Memory API를 실행하는 예제는 아니다.

```run-python
import mmap
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

child_code = """
import mmap
import sys

with open(sys.argv[1], "r+b") as file:
    with mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_WRITE) as shared:
        with mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_COPY) as private:
            private[:6] = b"local!"
            print("child private:", private[:6].decode())
            print("child shared before:", shared[:6].decode())
            shared[:6] = b"child!"
            print("child private after:", private[:6].decode())
"""

with TemporaryDirectory() as directory:
    path = Path(directory) / "shared.bin"
    path.write_bytes(b"parent" + bytes(mmap.PAGESIZE - 6))
    with path.open("r+b") as file:
        with mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_WRITE) as shared:
            result = subprocess.run(
                [sys.executable, "-c", child_code, str(path)],
                capture_output=True, text=True, check=True, timeout=5,
            )
            assert result.stdout.splitlines() == [
                "child private: local!",
                "child shared before: parent",
                "child private after: local!",
            ]
            assert shared[:6] == b"child!"
            print(result.stdout, end="")
            print("parent shared after:", shared[:6].decode())
```

부모는 자식의 종료를 기다린 뒤 `child!`를 읽는다. 자식의 Private Mapping에는 자신이 쓴 `local!`가 남는다. Private 쓰기는 다른 Mapping에 전달되지 않고, Shared 쓰기는 부모의 Mapping에서도 보인다. 이 관찰은 프로세스 사이의 가시성을 비교하며 전원 차단 뒤의 파일 보존을 검증하지 않는다. `mmap`과 저장의 관계는 [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/)과 [fsync](/wiki/file-system-fsync/)에서 다룬다.

## 직접 접근에는 동기화가 필요하다

동시에 같은 Counter를 증가시키면 읽기·계산·쓰기가 겹쳐 갱신을 잃을 수 있다. Shared Memory는 이 순서를 자동으로 직렬화하지 않는다. POSIX Mutex를 쓴다면 공유 영역에 객체를 두고 `PTHREAD_PROCESS_SHARED` 속성을 설정해 초기화한다. 이름 있는 Semaphore를 별도로 사용하는 방법도 있다. 참여 프로세스가 같은 객체와 초기화 완료 상태를 공유해야 한다.

Lock을 사용하더라도 프로세스가 잠금을 잡은 채 종료됐을 때의 복구는 별도로 정해야 한다. 공개할 데이터의 길이와 준비 상태, 사용 완료 시점을 함께 관리한다. CPU Cache의 일관성만으로 앱의 여러 필드 갱신이 하나의 Transaction이 되지는 않는다. 동시 접근의 원리는 [동기화](/wiki/computer-systems-network-topic-cd8cd4ad9254/)에 연결된다.

Shared Memory는 이미 Mapping한 영역을 통해 Payload의 반복 복사를 줄일 수 있다. 대신 Mapping·Page Fault·동기화·Cache Line 이동 비용이 생길 수 있다. Pipe와 Socket도 구현과 API에 따라 복사 경로가 달라진다. 성능을 비교하려면 Payload 크기, 반복 횟수, 초기화 포함 여부와 동기화 조건을 정하고 측정한다.

## PintOS에서 확인할 범위

학습 저장소의 [`5afaa6d`](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)는 Pipe·Socket·Message Queue·POSIX Shared Memory 시스템 콜을 제공하지 않는다. 부모는 `wait()`로 자식의 종료 상태를 받고, 프로세스들이 파일을 통해 데이터를 읽고 쓰는 경로도 있다. 종료 상태를 저장한 커널 자료구조는 사용자 프로세스 사이의 Shared Memory Mapping과는 다르다.

현재 `mmap()`에 `MAP_SHARED`·`MAP_PRIVATE` 선택 인자가 없다는 점과, 여러 프로세스의 사용자 Mapping이 같은 Frame을 공유하는지는 구분해야 한다. Frame 복제와 파일 Mapping의 실제 구현은 [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/)과 [PintOS의 mmap](/wiki/computer-systems-network-mmap-838e9b0f7e0a/)에서 확인한다.

`sema_down()`·`sema_up()`은 대기와 깨우기, `pml4_set_page()`는 주소 연결을 학습할 출발점이다. 이 기능으로 IPC를 확장하려면 공유 객체의 접근 권한·참조 수·해제 순서와 프로세스 종료 처리를 더 설계해야 한다. 기존 동기화 함수가 있다는 사실과 완성된 Pipe나 공유 메모리 API가 있다는 사실은 서로 다른 구현 범위다.
