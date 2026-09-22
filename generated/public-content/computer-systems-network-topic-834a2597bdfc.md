---
layout: default
title: 상태 코드
nav_order: 4
permalink: /wiki/computer-systems-network-topic-834a2597bdfc/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-834a2597bdfc
projection_sha256: 3ceeffd9d9f9bd3728c95c3c2a3a2492665ce366a7bf814edfaa480b9fcfd809
parent: HTTP
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-http-2fe226962c51
grand_parent: 네트워크
ancestor: CS 기초
---

# 상태 코드
{: .no_toc }

HTTP 상태 코드는 요청 처리 결과를 나타내는 세 자리 숫자다. 네트워크 연결이 성공했더라도 요청한 자원이 없거나 동작을 허용하지 않으면 오류 상태 코드로 응답할 수 있다.

HTTP/1.x의 상태 라인에는 `HTTP/1.1 200 OK`처럼 사유 구문이 함께 나타난다. 프로그램이 처리 기준으로 삼을 값은 상태 코드다. 같은 코드에 붙는 문구가 같다는 보장은 없으며, HTTP/2·HTTP/3는 HTTP/1.x의 상태 라인 형식을 그대로 쓰지 않는다.

## 첫 번째 숫자가 나타내는 범주

| 범위 | 의미 |
| --- | --- |
| 1xx | 잠정적인 처리 정보 |
| 2xx | 요청을 성공적으로 처리 |
| 3xx | 요청을 완료하기 위한 추가 동작이나 캐시 확인 결과 등 |
| 4xx | 요청을 처리하지 못한 클라이언트 오류 범주 |
| 5xx | 요청을 처리하는 서버 측의 실패 |

한 요청에는 1xx 응답이 먼저 오고 그 뒤 최종 응답이 올 수 있다. 3xx도 언제나 새 URL로 이동하라는 뜻은 아니다. 예를 들어 304는 조건부 요청에서 기존 표현을 재사용할 수 있음을 알리는 응답이다.

## 자주 확인하는 코드

| 코드 | 읽는 기준 |
| --- | --- |
| 200 OK | 요청 성공. Method에 따라 본문 처리 방식이 달라짐 |
| 201 Created | 요청을 처리하면서 새 자원 생성 |
| 204 No Content | 성공했으며 응답 본문은 없음 |
| 301 Moved Permanently | 대상 자원이 새로운 영구 URI로 이동 |
| 304 Not Modified | 조건부 요청에서 저장된 표현 재사용 가능 |
| 400 Bad Request | 요청 형식 등 클라이언트 오류로 처리할 수 없음 |
| 403 Forbidden | 요청은 이해했으나 처리를 허용하지 않음 |
| 404 Not Found | 현재 표현을 찾지 못했거나 존재를 공개하지 않음 |
| 405 Method Not Allowed | 해당 자원에서 요청 Method를 허용하지 않음 |
| 500 Internal Server Error | 요청 처리를 방해하는 예상하지 못한 서버 오류 |
| 501 Not Implemented | 요청을 처리하는 데 필요한 기능을 서버가 지원하지 않음 |

상태 코드의 구체적인 의미는 [HTTP Semantics의 상태 코드 정의](https://www.rfc-editor.org/rfc/rfc9110.html#section-15)를 기준으로 한다. 코드만 보고 발생 원인을 하나로 단정하기보다 요청 대상·Method·Header·본문과 서버의 기록을 함께 확인한다.

## 오류 응답도 HTTP 메시지다

404 응답에도 자원을 찾지 못했다는 설명을 담을 수 있다. HTML 페이지를 제공할 수도 있고 API가 정한 JSON 형식으로 오류 정보를 반환할 수도 있다. 이때 `Content-Type`은 오류 코드가 아니라 실제 본문의 형식을 나타낸다.

본문을 만들었다면 인코딩된 Byte 수에 맞춰 길이를 처리해야 한다. 다만 모든 응답에 본문이나 `Content-Length`를 넣는 것은 아니다. 1xx·204는 본문을 보내지 않으며, HEAD나 304처럼 별도의 규칙을 갖는 경우도 있다.

[요청과 응답](/wiki/computer-systems-network-topic-58802d355c9c/)의 실행 예제에서 `/hello`를 `/missing`으로 바꾸면 같은 서버와 통신하면서 200 대신 404를 받는다. POST로 바꾸면 405와 허용된 Method 목록을 확인한다. 연결 실패, 요청 처리 결과, 응답 본문을 각각 나누어 읽는 연습이다.
