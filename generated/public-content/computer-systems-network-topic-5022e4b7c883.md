---
layout: default
title: 입출력 다중화
nav_order: 6
permalink: /wiki/computer-systems-network-topic-5022e4b7c883/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-5022e4b7c883
projection_sha256: ae82fa7b8ee5411af32680ecb4b195a0fe40ab88bbad01e804e853017384d00b
parent: 입출력
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-d4ff1bb79941
grand_parent: OS
ancestor: CS 기초
---

# 입출력 다중화
{: .no_toc }

입출력 다중화는 여러 fd의 준비 상태를 함께 감시해, 현재 처리할 수 있는 접속으로 실행 흐름을 넘기는 방법이다. 연결마다 실행 중인 Thread 하나가 필요하다는 제약을 줄이지만, 선택된 fd에서 수행하는 처리까지 자동으로 Non-blocking이 되지는 않는다.

## 준비 통지와 완료 통지를 구별하기

`select()`·`poll()`·`epoll`·`kqueue`의 준비 감시는 읽기나 쓰기를 시도할 시점을 알려 준다. 호출자가 뒤이어 데이터를 읽거나 써야 한다. `epoll` 이벤트를 “커널이 사용자 버퍼까지 읽기를 끝냈다는 알림”으로 설명하면 완료 기반 비동기 I/O와 혼동하게 된다. [epoll의 Readiness와 재시도](https://man7.org/linux/man-pages/man7/epoll.7.html)

Event Loop 자신도 처리할 일이 없으면 준비 감시 API에서 기다릴 수 있다. 이 대기는 개별 접속의 응답만 붙잡고 다른 준비된 접속을 처리하지 못하는 대기와 다르다. Non-blocking Socket을 사용한다고 Event Loop가 쉬지 않고 CPU를 태워야 하는 것은 아니다.

다음은 CS:APP의 `select()` Wrapper를 설명하는 발췌다. 함수가 존재한다는 사실만으로 프록시의 실행 경로가 이 함수를 사용한다고 결론 내리지는 않는다.

```c
/* webproxy-lab/csapp.c — select_wrapper(): 여러 fd 동시 감시 */
int Select(int n, fd_set *readfds, fd_set *writefds,
           fd_set *exceptfds, struct timeval *timeout) {
    int rc;
    // 감시 대상 fd 집합 중 '읽기 준비된' 것이 생길 때까지 대기
    if ((rc = select(n, readfds, writefds, exceptfds, timeout)) < 0)
        unix_error("Select error");
    return rc;
}
```

`timeout`이 가리키는 `timeval`의 `tv_sec`와 `tv_usec`를 모두 0으로 두면 준비 상태를 즉시 조회한다. 반대로 `timeout` 포인터 자체가 NULL이면 준비된 fd나 Signal이 생길 때까지 기다릴 수 있다. `select()`는 fd 집합을 결과에 맞게 바꾸므로 다음 호출 전에 감시 집합을 다시 준비해야 한다. 읽기 준비에는 EOF도 포함될 수 있으며, 준비 이후에도 상태가 달라질 수 있으므로 실제 `read()`의 반환값을 확인한다. [select의 계약](https://man7.org/linux/man-pages/man2/select.2.html)

## 접속이 많을 때 필요한 상태와 상한

`select()`는 매번 fd 집합을 전달하고 검사한다. `epoll`은 관심 집합을 등록하고 준비된 항목을 꺼내며, `kqueue`도 등록한 이벤트를 조회한다. 그렇다고 모든 부하에서 일정한 O(1) 비용이거나 처리량이 반드시 더 높다는 보장은 아니다. 감시 대상 수, 발생한 이벤트 수, 등록 변경과 실제 처리량을 함께 본다.

하나의 Callback이 오래 실행되면 다른 fd가 준비되어 있어도 늦게 처리된다. 부분 읽기·쓰기, 다음 Byte를 기다리는 상태, 연결 종료, Timeout과 버퍼 상한이 필요하다. Edge-triggered `epoll`에서는 보통 Non-blocking fd를 사용하고 `EAGAIN`까지 처리하며, 일부 fd가 실행을 독점하지 않도록 처리량도 제한한다. `EAGAIN` 전에 양보한다면 남은 준비 상태를 자체 Ready List에 남겨 다음 처리 기회를 보장해야 한다. [epoll 사용 지침](https://man7.org/linux/man-pages/man7/epoll.7.html)

## 접속마다 Thread를 만드는 구조와 비교하기

다음은 접속마다 Thread를 만드는 구조의 설명용 발췌다. 현재 `lrn-http-proxy`의 `main()`과는 아래에서 비교한다.

```c
/* webproxy-lab/proxy.c — main(): 접속마다 스레드 생성 */
listenfd = Open_listenfd(argv[1]);
while (1) {
  int *connfdp = Malloc(sizeof(int));
  *connfdp = Accept(listenfd, NULL, NULL);   // 접속 올 때까지 블로킹
  Pthread_create(&tid, NULL, thread, connfdp); // 접속 1개 = 스레드 1개
}
```

접속 N개에 담당 Thread N개를 두는 설계라면 Thread Stack과 스케줄링 비용을 고려해야 한다. 반면 제한된 Thread Pool도 가능하다. 현재 `fbb8002`의 프록시는 기본 Worker 8개, 설정 상한 32개, 대기 Queue 32개를 사용한다. `accept()` 후 Queue에 넣고 기존 Worker가 꺼내 처리하며, Queue가 가득 차면 받은 연결을 닫는다. 원본 서버에 연결할 때는 Non-blocking `connect()`와 `poll()`로 Timeout을 다루고, 연결 성공 후 원래 fd Flag를 복원한다. 이 구현을 접속 수만큼 Thread가 무제한 늘어나는 사례로 소개하지 않는다. [현재 프록시의 Worker와 main](https://github.com/woonyong-kr/lrn-http-proxy/blob/fbb80028caae6ccf6ca8324e7d0957bd21aa3a77/webproxy-lab/proxy.c#L546)

접속이 적고 처리 경로가 단순하면 Blocking 방식도 명료할 수 있다. 대기 접속이 많으면 준비 감시와 제한된 실행 자원을 검토한다. 어느 쪽이든 연결·Queue·메모리·처리 시간의 상한과 실제 부하 측정이 필요하다. Socket과 fd의 관계는 [BSD 소켓](/wiki/socket/)과 [파일 디스크립터](/wiki/pintos-file-descriptors/)에서, 커널 진입과 스케줄링은 [시스템 콜](/wiki/computer-systems-network-topic-3cc26725c1cb/)과 [컨텍스트 스위치](/wiki/computer-systems-network-topic-6d5c07c64010/)에서 다룬다. [Node.js Event Loop](/wiki/programming-languages-runtime-node-js-b30d6042ec46/)의 비동기 파일 API와 Socket 처리도 구별해서 읽는다.
