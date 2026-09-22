---
layout: default
title: Port
nav_order: 5
permalink: /wiki/computer-systems-network-topic-3c0bb7fb878f/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-3c0bb7fb878f
projection_sha256: 3a1af08554931fede80d208c7b737a2d24deb2c3a0dbe154eaf40cc826967a83
parent: 네트워크 기초
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-bbc093178a91
search_terms:
- 포트
grand_parent: 네트워크
ancestor: CS 기초
---

# Port
{: .no_toc }

Port는 TCP나 UDP가 데이터를 어느 소켓에 전달할지 구분하는 번호다. IP 주소와 함께 통신의 끝점을 나타낸다. 한 컴퓨터에서 여러 서비스가 네트워크를 사용할 수 있는 이유를 이 구분으로 설명할 수 있다.

Port 번호를 프로세스 ID와 같은 뜻으로 쓰지는 않는다. 하나의 프로세스가 여러 소켓을 열 수 있고, 여러 프로세스가 하나의 소켓을 공유하는 구성도 가능하다. TCP 연결을 식별할 때는 로컬 IP·Port뿐 아니라 상대 IP·Port도 함께 사용한다. 여러 클라이언트가 서버의 같은 Port에 접속해도 연결이 구분되는 이유다.

## 번호의 범위와 서비스 등록

Port 번호는 16 Bit이며 0부터 65535까지 표현할 수 있다. IANA는 이 범위를 다음처럼 구분한다.

| 범위 | IANA 분류 |
| --- | --- |
| 0–1023 | System Ports. 흔히 Well-known Ports라고 부름 |
| 1024–49151 | User Ports. 등록된 서비스에 사용 |
| 49152–65535 | Dynamic / Private Ports. IANA가 서비스별로 배정하지 않음 |

대표적인 서비스 번호로 HTTP 80, HTTPS 443, SSH 22, DNS 53이 있다. 같은 번호라도 TCP와 UDP는 별도로 구분한다. 등록된 번호를 사용한다는 사실만으로 실제 트래픽이 그 서비스라고 확정할 수는 없다. [IANA의 Port 등록부](https://www.iana.org/assignments/service-names-port-numbers/)

클라이언트의 임시 Port를 OS가 자동 할당하는 경우에도 범위가 반드시 49152–65535인 것은 아니다. 예를 들어 Linux의 자동 할당 범위는 `ip_local_port_range` 설정으로 관리한다. 서비스 등록을 위한 IANA의 구분과 실행 중인 OS의 할당 정책은 다른 기준이다. [Linux UDP의 자동 Port 할당](https://man7.org/linux/man-pages/man7/udp.7.html)

## `bind()`와 자동 할당

서버는 보통 `bind()`로 자신이 사용할 로컬 주소와 Port를 정한다. `127.0.0.1`에 바인딩하면 같은 호스트의 Loopback 경로로 접속하고, IPv4의 `INADDR_ANY`는 로컬 IPv4 인터페이스 전반에서 받을 주소를 지정한다. 어느 쪽이든 방화벽과 서비스의 실제 수신 상태는 별도로 확인해야 한다.

소켓 API의 `bind()`에 Port 0을 주면 OS가 사용 가능한 Port를 선택한다. 이 동작은 실제 서비스가 Port 0에서 요청을 받는다는 뜻이 아니다. 선택된 번호는 `getsockname()`으로 알아낼 수 있다. [TCP](/wiki/computer-systems-network-tcp-a7f7f386cd75/)와 [UDP](/wiki/computer-systems-network-udp-c5651ad64f2d/)의 실행 예제는 이 방식을 사용해 고정된 실습 Port가 이미 사용 중이어서 생기는 문제를 피한다.

소켓에서 Port를 구조체에 넣을 때는 Host Byte Order와 Network Byte Order도 구분한다. 예를 들어 C의 `sockaddr_in.sin_port`에 8080을 설정하려면 `htons(8080)`을 사용하고, 반환된 값을 숫자로 읽을 때는 `ntohs()`를 사용한다.
