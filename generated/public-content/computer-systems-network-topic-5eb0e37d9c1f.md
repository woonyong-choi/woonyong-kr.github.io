---
layout: default
title: Non-blocking
nav_order: 5
permalink: /wiki/computer-systems-network-topic-5eb0e37d9c1f/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-5eb0e37d9c1f
projection_sha256: f51297da8a6d543efe8a679e1838c8d6ec502a045ae4e662b3fae71fa429d2b5
parent: 입출력
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-d4ff1bb79941
search_terms:
- 논블로킹
grand_parent: OS
ancestor: CS 기초
---

# Non-blocking
{: .no_toc }

Non-blocking은 호출한 작업이 지금 진행될 수 없을 때 그 완료를 기다리며 호출 Thread를 붙잡지 않는 동작이다. 호출에 CPU 시간이 전혀 들지 않거나 프로그램 전체에 대기가 없다는 뜻은 아니다.

## 호출의 반환과 작업의 완료를 나누어 읽기

서버가 디스크나 다른 서버의 응답을 기다릴 때, 기다리는 Thread가 CPU를 계속 쓰는지와 다른 요청이 진행될 수 있는지를 나누어 본다. Blocking I/O에서 잠든 Thread 대신 OS가 다른 실행 가능한 Thread를 고를 수 있으므로 “한 요청이 기다리면 서버의 CPU 전체가 쉰다”는 결론은 나오지 않는다.

라면 주문에 비유하면 카운터에서 기다리는 행동과 주문을 맡기고 돌아가는 행동이 다르다. 다만 돌아간 뒤 계속 확인하는지, 호출자가 알림을 받는지만으로 모든 I/O API를 분류할 수는 없다. 비동기 요청도 완료 상태를 직접 조회하거나 완료를 기다리는 별도 API를 사용할 수 있다.

| 확인할 동작 | 예 | 호출 뒤 확인할 것 |
|---|---|---|
| 결과를 반환할 때까지 호출자가 기다릴 수 있음 | Blocking Socket의 `read()` | 실제 읽은 Byte 수, EOF, 오류 |
| 지금 진행할 수 없으면 기다리지 않고 반환 | Non-blocking Socket의 `read()` | `EAGAIN` 또는 `EWOULDBLOCK`, 다음 재시도 시점 |
| 여러 fd 중 I/O를 시도할 대상을 찾음 | `select()`·`epoll_wait()` | Readiness를 받은 뒤 실제 `read()`의 결과 |
| 읽기 요청을 먼저 제출하고 나중에 완료 확인 | POSIX `aio_read()` | 완료 상태와 `aio_return()`의 결과 |

동기·비동기와 Blocking·Non-blocking을 비교할 때는 각 API가 반환하는 시점과 결과를 확인한다. `select()`의 준비 통지는 데이터가 사용자 버퍼에 복사되었다는 완료 통지가 아니다. POSIX AIO는 Signal·Thread 통지나 통지 없음도 선택할 수 있으며, 비동기라는 말이 반드시 커널의 Callback 한 종류를 뜻하지 않는다. [Linux read](https://man7.org/linux/man-pages/man2/read.2.html), [POSIX AIO](https://man7.org/linux/man-pages/man7/aio.7.html)

## 데이터 준비와 read 반환은 같은 사건이 아니다

일반적인 Socket 읽기에서는 데이터가 도착하기를 기다리는 단계와, 준비된 데이터를 사용자 버퍼로 읽어 오는 단계를 구별할 수 있다. 이는 설명을 위한 구분이며 모든 I/O가 반드시 같은 두 번의 복사를 한다는 뜻은 아니다.

Blocking Socket도 데이터가 이미 준비되어 있으면 곧바로 반환할 수 있다. Non-blocking Socket은 읽을 데이터가 없으면 `-1`과 `errno=EAGAIN` 또는 `EWOULDBLOCK`으로 돌아온다. 양수 반환은 실제 읽은 Byte 수이며 요청한 크기보다 작을 수 있다. 양수 크기를 요청한 Stream Socket에서 0은 상대의 송신 종료를 읽은 EOF와 연결된다. `EINTR`, EOF, 아직 준비되지 않음을 같은 재시도 조건으로 처리하지 않는다.

Linux의 일반 파일과 Block Device에서는 `O_NONBLOCK`만 설정한다고 디스크 접근 대기가 없어지지 않는다. Socket 준비 감시와 파일 비동기 API가 같은 방식으로 구현된다고 가정하지 않는 이유다. [O_NONBLOCK의 적용 범위](https://man7.org/linux/man-pages/man2/open.2.html)

## RIO가 반복해서 읽는 이유

다음은 CS:APP `rio_readn()`의 동작을 설명하는 발췌다. Blocking fd를 넘긴다는 전제에서 읽기와 대기가 어떻게 반복되는지 보여 준다.

```c
/* webproxy-lab/csapp.c — rio_readn(): 블로킹 read 반복 */
ssize_t rio_readn(int fd, void *usrbuf, size_t n) {
    size_t nleft = n;
    ssize_t nread;
    char *bufp = usrbuf;
    while (nleft > 0) {
        if ((nread = read(fd, bufp, nleft)) < 0) { // 데이터 없으면 여기서 잠듦
            if (errno == EINTR) nread = 0;         // 시그널로 깨면 재시도
            else return -1;
        }
        else if (nread == 0) break;                // 파일 끝(EOF)
        nleft -= nread;
        bufp += nread;
    }
    return (n - nleft);
}
```

부분 읽기는 남은 크기와 버퍼 위치를 갱신해 이어 읽고, `EINTR`은 다시 시도하며, 0이면 종료한다. 이 구현은 `EAGAIN`을 포함한 다른 오류에서 `-1`로 반환한다. 따라서 그대로 Non-blocking 상태 기계나 Event Loop의 Callback으로 사용하면 충분하지 않다. [현재 학습 레포의 RIO](https://github.com/woonyong-kr/lrn-http-proxy/blob/fbb80028caae6ccf6ca8324e7d0957bd21aa3a77/webproxy-lab/csapp.c#L750)

재시도를 Busy Polling으로 반복하면 CPU를 소비한다. 준비 감시에서 기다렸다가 다시 읽는 방법은 [입출력 다중화](/wiki/computer-systems-network-topic-5022e4b7c883/)에서, JavaScript의 완료 표현은 [Promise](/wiki/programming-languages-runtime-promise-22d599aa3732/)에서 다룬다.
