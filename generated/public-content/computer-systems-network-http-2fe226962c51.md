---
layout: default
title: HTTP
nav_order: 6
permalink: /wiki/computer-systems-network-http-2fe226962c51/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-http-2fe226962c51
projection_sha256: 6fc5699b666a49bc43088613d0f73f7a879130ec6be0b299a5e9d795582e478e
parent: 네트워크
content_status: ready
public_parent_id: Wiki/computer-systems-network/network
grand_parent: Systems
ancestor: CS 기초
---

# HTTP
{: .no_toc }

HTTP(Hypertext Transfer Protocol)는 클라이언트가 자원에 대한 동작을 요청하고 서버가 그 결과를 응답하는 규약이다. 브라우저가 웹 페이지를 받는 일뿐 아니라 애플리케이션이 API로 데이터를 주고받는 일에도 사용한다.

전송 프로토콜이 Byte를 전달한다면 HTTP는 그 Byte가 어떤 요청과 응답을 뜻하는지 정한다. 메서드는 원하는 동작을, 요청 대상은 자원을, 상태 코드는 처리 결과를 나타낸다. 이 의미는 HTTP 버전이 바뀌어도 이어지지만 메시지를 전송하는 형식은 달라질 수 있다.

## 요청 하나를 따라 읽기

브라우저에 `http://example.com/index.html`을 입력하면 일반적으로 해당 자원의 표현을 가져오는 GET 요청을 보낸다. 서버는 요청을 해석하고 자원을 찾거나 처리한 뒤 상태 코드와 필요한 데이터를 응답한다.

응답을 읽을 때는 성공 여부만 확인하지 않는다. 본문이 있는지, 그 데이터의 형식과 길이는 무엇인지, 추가 요청이나 다른 위치로의 이동이 필요한지 함께 살펴본다. `200`과 `404`가 같은 네트워크 연결 위에서 전달될 수 있는 이유도 여기에 있다. 연결 성공과 자원 처리의 성공은 다른 판단이다.

메시지의 실제 구조와 실행 예제는 [요청과 응답](/wiki/computer-systems-network-topic-58802d355c9c/)에서 볼 수 있다. 동작의 의미는 [Method](/wiki/computer-systems-network-topic-e51a6ade671c/), 처리 결과는 [상태 코드](/wiki/computer-systems-network-topic-834a2597bdfc/), 메시지에 붙는 정보는 [Header](/wiki/computer-systems-network-topic-e67ae5ecc7e4/)로 나누어 다룬다.

## 무상태와 로그인 상태

HTTP의 무상태성은 이전 요청의 애플리케이션 상태를 프로토콜이 자동으로 이어 주지 않는다는 뜻이다. 로그인 요청을 처리했다는 사실만으로 다음 요청이 누구에게서 왔는지 저절로 정해지지는 않는다.

[Cookie](/wiki/backend-services-topic-caaf6d9c987c/)를 사용하면 브라우저가 저장한 값을 정해진 조건에 맞는 요청과 함께 보낼 수 있다. Session은 일반적으로 서버가 상태를 보관하고 요청에서 전달된 식별자를 그 상태와 연결하는 방식이다. 요청 사이의 상태를 이런 별도 수단으로 관리하므로, HTTP가 무상태라고 해서 서버가 아무 상태도 보관할 수 없다는 뜻은 아니다.

서버를 여러 대로 늘리면 어떤 서버가 요청을 받더라도 필요한 상태에 접근할 수 있는지 확인해야 한다. Session 저장소를 공유할지, 요청을 특정 서버로 보낼지 같은 선택은 HTTP 메시지 형식과 구분되는 애플리케이션 설계다.

## 메시지의 의미와 전송 형식

HTTP/1.x는 시작 줄과 Header를 텍스트 형식으로 읽을 수 있다. HTTP/2는 TCP 연결에서 여러 Stream을 다중화하고, HTTP/3는 QUIC을 사용한다. 따라서 HTTP를 언제나 하나의 TCP 연결에 텍스트를 쓰는 방식으로만 설명하면 최신 버전의 동작을 놓치게 된다.

[HTTP 버전](/wiki/computer-systems-network-http-6c47fd343b2a/)에서는 연결 재사용, Framing과 Stream 처리의 차이를 비교한다. 공통 의미는 [HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)에 정의되어 있다.
