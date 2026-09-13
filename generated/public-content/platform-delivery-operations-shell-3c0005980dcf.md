---
layout: default
title: Shell
nav_order: 2
permalink: /wiki/platform-delivery-operations-shell-3c0005980dcf/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/platform-delivery-operations-shell-3c0005980dcf
projection_sha256: b51713b3616356ce466e6503baaf8765b76a425bfaf6f6a491bf75ce1b80a98d
parent: Linux
content_status: ready
public_parent_id: Wiki/platform-delivery-operations/linux
grand_parent: DevOps
---

# Shell
{: .no_toc }

Shell은 명령을 해석하고 프로그램의 실행 환경과 입출력을 준비한다. `command > result.txt`에서 `>`를 처리하는 주체도 Shell이다. 프로그램은 표준 출력에 쓰고, Shell이 준비한 fd 연결에 따라 그 내용이 파일로 향한다.

## 표준 입출력의 대상을 바꾼다

Unix 프로그램은 보통 fd 0을 표준 입력, 1을 표준 출력, 2를 표준 오류에 사용한다. 이 번호가 항상 터미널을 가리키는 것은 아니다. 파일, Pipe 등으로 연결하면 프로그램을 고치지 않고 입력의 출처와 출력의 목적지를 바꿀 수 있다.

| 문법 | 의미 |
| --- | --- |
| `command > file` | 표준 출력을 파일로 보낸다. 보통 새로 만들거나 기존 내용을 비운다 |
| `command >> file` | 표준 출력을 파일 끝에 이어 쓴다 |
| `command < file` | 파일을 표준 입력으로 읽는다 |
| `command 2> file` | 표준 오류를 파일로 보낸다 |
| `command 2>&1` | 표준 오류를 그 시점의 표준 출력과 같은 대상으로 연결한다 |

`noclobber` 같은 Shell 옵션은 기존 파일의 덮어쓰기 규칙에 영향을 준다. `>`가 있는 명령을 실행하기 전에 대상 경로와 현재 옵션을 함께 확인한다. 변수로 경로를 전달할 때는 `"$path"`처럼 Quote하여 공백 등을 경로의 일부로 유지한다.

리다이렉션은 파일을 새로 여는 경우뿐 아니라 이미 열린 fd를 복제하거나 닫는 경우도 포함한다. `2>&1`은 파일 이름 `1`에 쓰는 표현이 아니다.

### 왼쪽부터 연결을 바꾼다

`command > file 2>&1`은 먼저 fd 1을 파일에 연결한 뒤 fd 2를 그 대상으로 복제한다. 표준 출력과 표준 오류가 모두 파일로 향한다.

`command 2>&1 > file`은 먼저 fd 2를 기존 fd 1의 대상으로 연결한다. 이후 fd 1을 파일로 바꾸어도 fd 2가 새 목적지를 따라가지는 않는다. 각 단계에서 어느 대상을 복제하는지 순서대로 읽어야 한다. [Bash 리다이렉션](https://www.gnu.org/software/bash/manual/html_node/Redirections.html)

## Pipe로 두 명령을 연결한다

`producer | consumer`는 앞 명령의 표준 출력을 뒤 명령의 표준 입력에 연결한다. 프로그램 사이에서 데이터를 전달하는 Pipe의 읽기·쓰기 끝이 필요하다. 표준 오류는 별도 리다이렉션이 없으면 같은 경로로 합쳐지지 않는다.

기본 구현 흐름을 fd 관점에서 따라가면 다음과 같다.

1. 부모가 `pipe()`로 읽기 끝과 쓰기 끝을 만든다.
2. 송신 프로세스의 fd 1을 쓰기 끝으로, 수신 프로세스의 fd 0을 읽기 끝으로 연결한다.
3. 각 프로세스에서 사용하지 않는 Pipe fd를 닫고 실행할 프로그램을 준비한다.
4. 부모도 불필요한 Pipe fd를 닫고 자식의 종료 상태를 회수한다.

이는 `fork()`와 `exec()`로 구현할 때의 설명이다. Shell의 내장 명령과 실행 최적화에 따라 실제 생성하는 프로세스는 달라질 수 있다. 중요한 것은 각 명령이 실행될 때의 입출력 연결이다.

Pipe 연결을 만든 뒤 명령에 적힌 리다이렉션을 적용한다. 따라서 `producer > file | consumer`에서는 앞 명령의 표준 출력이 파일로 다시 연결된다. 뒤 명령에 그 출력이 전달되기를 기대하면 안 된다. Pipe의 버퍼와 EOF 조건은 [프로세스 간 통신](/wiki/computer-systems-network-topic-4e556eac094a/)에서 다룬다. [Bash Pipeline](https://www.gnu.org/software/bash/manual/html_node/Pipelines.html)

### 실제 출력을 비교하기

다음 Shell 예제는 자신이 만든 임시 디렉터리 안에서만 파일을 사용한다. 표준 출력과 오류의 연결 순서, 이어 쓰기와 입력 리다이렉션을 함께 비교한다.

```run-shell
set -eu
work_dir=$(mktemp -d)
trap 'rm -f "$work_dir/all" "$work_dir/out" "$work_dir/lines"; rmdir "$work_dir"' EXIT

emit() {
    printf 'out\n'
    printf 'err\n' >&2
}

emit > "$work_dir/all" 2>&1
printf 'both in file:\n'
cat "$work_dir/all"

emit 2>&1 > "$work_dir/out" | sed 's/^/pipe: /'
printf 'stdout file:\n'
cat "$work_dir/out"

printf 'first\n' > "$work_dir/lines"
printf 'next\n' >> "$work_dir/lines"
printf 'input from file:\n'
tr '[:lower:]' '[:upper:]' < "$work_dir/lines"
```

첫 파일에는 `out`과 `err`가 들어간다. 순서를 바꾼 경우에는 `pipe: err`가 출력되고, 파일에는 `out`만 남는다. 마지막에는 파일에서 읽은 두 줄이 `FIRST`, `NEXT`로 출력된다.

Pipeline 전체의 성공 여부도 확인한다. Bash에서는 기본적으로 마지막 명령의 종료 상태를 사용한다. 앞 명령의 실패도 확인하려면 `pipefail`의 동작을 이해하고 적용해야 한다. 마지막 명령이 성공했다는 사실만으로 모든 단계가 성공했다고 판단할 수는 없다.

## dup2가 바꾸는 것은 fd 연결이다

파일에 출력하는 자식을 `fork()`·`exec()`로 직접 구현한다면, 자식에서 파일을 열고 `dup2(fd, STDOUT_FILENO)`로 표준 출력을 교체한다. 그 뒤 별도 fd가 더 필요 없으면 닫고 프로그램을 실행한다. `open()` 실패, `dup2()` 실패, `exec()` 실패와 부모의 자식 회수까지 처리해야 한다.

Linux의 `dup2(oldfd, newfd)`는 `newfd`가 같은 Open File Description을 참조하도록 바꾼다. 기존 `newfd`의 닫기와 재사용은 원자적으로 처리한다. 두 fd는 파일 위치와 상태 플래그를 공유하지만 Descriptor별 `FD_CLOEXEC` 같은 플래그까지 모두 공유하지는 않는다. [dup2의 계약](https://man7.org/linux/man-pages/man2/dup.2.html)

`oldfd`와 `newfd`가 같은 유효한 번호이면 `dup2()`는 그 번호를 그대로 반환한다. 이 경우 “원래 fd를 닫는다”는 코드를 무조건 이어 실행하면 필요한 표준 출력까지 닫아 버린다. 이미 원하는 번호인지 확인하고, 실제로 불필요한 복제본만 정리한다.

## PintOS의 표준 입출력과 비교하기

학습 저장소의 `5afaa6d`에서는 `SYS_DUP2` 번호와 사용자 라이브러리의 `dup2()` Wrapper가 선언돼 있다. 그러나 `syscall_handler()`에는 이를 처리하는 `case`가 없고, 표준 입출력도 일반 파일 객체와 별도로 번호를 분기한다. 번호와 Wrapper의 존재만으로 fd 재지정이 동작한다고 볼 수 없다. [현재 System Call 분기](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c)

같은 구현에는 `pipe()` 시스템 콜도 없다. Linux Shell의 리다이렉션과 Pipe 예제는 학습 개념을 비교하는 데 쓰며, PintOS에서 그대로 실행한 결과로 취급하지 않는다. 실제 fd 할당·복제와 Console 연결은 [PintOS File Descriptor](/wiki/pintos-file-descriptors/)에서 확인한다.
