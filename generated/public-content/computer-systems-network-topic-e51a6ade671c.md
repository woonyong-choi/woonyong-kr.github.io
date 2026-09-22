---
layout: default
title: Method
nav_order: 3
permalink: /wiki/computer-systems-network-topic-e51a6ade671c/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-e51a6ade671c
projection_sha256: 0ebe64ca9dd9a8b7738e2db9c27d8c66b59928ac4f6aa1f5be8fe0b9ca40319e
parent: HTTP
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-http-2fe226962c51
search_terms:
- 메서드
grand_parent: 네트워크
ancestor: CS 기초
---

# Method
{: .no_toc }

HTTP Method는 요청 대상에 어떤 동작을 원하는지 나타낸다. 같은 `/users/42`라도 GET은 사용자 정보를 조회하고, DELETE는 해당 자원의 제거를 요청한다. URI가 대상을 가리킨다면 Method는 그 대상에 할 일을 구분한다.

HTTP/1.x 요청 라인의 첫 단어가 Method다. HTTP/2·HTTP/3에서는 전송 형식이 바뀌어도 같은 의미를 사용한다. Method 이름은 대소문자를 구분하며, 표준 Method는 `GET`처럼 대문자로 표기한다.

## 자주 사용하는 Method

| Method | 의미 |
| --- | --- |
| GET | 대상 자원의 현재 표현을 조회 |
| HEAD | GET에 대응하는 Header를 조회하되 응답 본문은 받지 않음 |
| POST | 전달한 내용을 대상 자원의 규칙에 따라 처리 |
| PUT | 요청에서 보낸 표현으로 대상 자원의 상태를 생성하거나 교체 |
| PATCH | 요청에 담긴 변경 사항을 대상 자원에 적용 |
| DELETE | 대상 자원의 현재 기능과 URI의 연결을 제거하도록 요청 |
| OPTIONS | 대상과 서버가 제공하는 통신 선택 사항 조회 |

POST는 새 자원을 만드는 작업에 사용할 수 있지만 그것만을 뜻하지는 않는다. 폼 제출, 로그인 요청이나 계산 요청처럼 전달한 내용을 처리하는 작업에도 사용한다. 반대로 PUT은 보통 클라이언트가 특정한 대상 URI의 상태를 보내는 의미로 읽는다.

PUT과 PATCH의 차이는 전체 표현을 보내는지, 적용할 변경 사항을 보내는지에 있다. PATCH의 본문이 언제나 바꿀 필드 몇 개만 담은 JSON인 것은 아니다. 변경 내용을 표현하는 형식과 처리 규칙을 서버가 지원해야 한다. PATCH는 일반적으로 멱등성을 보장하지 않지만, 같은 값으로 교체하는 변경처럼 멱등하게 사용할 수도 있다. [PATCH 규격](https://www.rfc-editor.org/rfc/rfc5789.html#section-2)

DELETE를 파일이나 DB Row를 물리적으로 즉시 지우는 명령으로만 해석하지 않는다. 서버가 자원 제거를 어떤 저장 방식으로 구현할지는 별도 문제다. 사용자에게 더 이상 해당 자원을 제공하지 않으면서 기록을 보관하는 구현도 가능하다.

본문 유무만으로 Method를 구분하지도 않는다. GET 요청의 본문에는 일반적으로 정의된 의미가 없으며, 임의로 보내도 모든 서버·중간 장치가 같은 방식으로 처리한다고 기대할 수 없다. [HTTP Method의 의미](https://www.rfc-editor.org/rfc/rfc9110.html#section-9)

## 안전성과 멱등성

안전한 Method는 요청의 의도가 자원 상태를 바꾸는 작업이 아니라는 뜻이다. GET·HEAD·OPTIONS가 여기에 속한다. 서버가 접근 로그를 기록하는 부수 동작까지 없어야 한다는 뜻은 아니다. 브라우저가 링크를 미리 읽는 작업도 조회 요청이 자원을 임의로 변경하지 않는다는 전제에 기대고 있다.

멱등성은 같은 요청을 여러 번 수행해도 의도된 효과가 한 번 수행한 것과 같다는 성질이다. PUT이나 DELETE가 이에 해당한다. DELETE를 반복했을 때 처음에는 성공하고 다음에는 404가 나와도, 응답 코드가 달라졌다는 이유만으로 멱등성이 사라지는 것은 아니다. 결과 상태와 매번 받은 응답은 구분한다.

네트워크 오류 뒤 요청을 다시 보낼 때는 이 차이가 중요하다. POST 작업을 임의로 재시도하면 같은 처리가 중복될 수 있다. 재시도를 허용하려면 요청의 의미와 서버의 중복 처리 방식을 확인해야 한다.

예를 들어 이름을 `김`으로 지정하는 `PUT /users/42`를 세 번 보내면 의도한 최종 상태는 같다. 반면 요청마다 사용자를 생성하도록 만든 `POST /users`를 세 번 보내면 세 명이 생길 수 있다. 이는 해당 API의 처리 방식에 따른 예다. POST를 쓴다는 사실만으로 모든 요청이 반드시 중복 생성되는 것은 아니며, 서버가 중복 요청을 구분하도록 설계할 수도 있다.

안전성·멱등성과 캐시 가능 여부는 따로 판단한다. GET 응답도 캐시 정책에 따라 저장하지 않을 수 있다. POST 응답은 명시적인 신선도 정보와 요청 URI에 일치하는 `Content-Location` 등 정해진 조건을 만족하면 이후 GET·HEAD에 재사용할 수 있지만, 실제 캐시의 지원 범위도 확인해야 한다. 자세한 정책은 HTTP 캐시에서 다룬다.

## Query와 본문에 담는 데이터

검색 조건은 `GET /search?q=cat&page=2`처럼 Query에 넣을 수 있다. Query는 URI의 일부이므로 브라우저 기록이나 서버 로그에 남을 수 있다. `<form method="post">`로 제출한 값은 보통 요청 본문에 들어가지만, POST 요청의 URI에도 Query가 있을 수 있다.

본문은 주소창에 나타나지 않는다는 이유만으로 비밀이 되지 않는다. 전송 중 보호에는 HTTPS가 필요하고, 서버와 중간 장치의 본문 기록 정책도 확인해야 한다. 비밀번호 같은 값을 URI에 넣으면 로그나 공유된 주소를 통해 드러날 수 있으므로 요청을 설계할 때 데이터의 위치를 구분한다.

POST 본문에도 서버·Proxy·애플리케이션이 정한 크기 제한이 있다. GET의 URI 길이 역시 구현의 영향을 받는다. HTTP가 모든 환경에 동일한 최대 길이를 정해 주는 것은 아니므로, 큰 요청이 실패하면 Method 자체보다 요청 크기와 실제 제한을 확인한다.

## 허용하지 않는 Method

서버가 Method를 알고 구현하고 있지만 해당 자원에서 허용하지 않는다면 405를 응답하고, `Allow` Header로 허용하는 Method를 알린다. 서버가 요청에 필요한 기능 자체를 지원하지 않는 경우의 501과 구분해야 한다.

GET만 구현한 교육용 Proxy가 다른 Method에 501을 보내는 코드를 보더라도, 모든 서비스가 GET 이외의 요청을 501로 거절해야 한다는 뜻은 아니다. 요청 라인 파싱과 Method 지원 여부, 자원별 허용 여부는 각각 판단한다. 파싱할 때의 입력 길이와 메시지 경계는 [요청과 응답](/wiki/computer-systems-network-topic-58802d355c9c/)에서 다룬다.

[요청과 응답](/wiki/computer-systems-network-topic-58802d355c9c/)의 실행 예제는 `/hello`에 POST를 보내면 `405 Method Not Allowed`와 `Allow: GET, HEAD`를 돌려준다. Method를 바꾸었을 때 상태 코드와 응답 본문이 어떻게 달라지는지 직접 확인할 수 있다.

브라우저의 [CORS](/wiki/backend-services-cors-dd387fc45dd4/) 사전 요청도 OPTIONS를 사용한다. 이때는 `Access-Control-Request-Method` 등으로 앞으로 보낼 요청을 알리고, 응답의 CORS 필드로 허용 여부를 판단한다. 일반적인 `Allow` 필드만으로 CORS를 허용한 것은 아니다. [Fetch의 CORS 규칙](https://fetch.spec.whatwg.org/#http-cors-protocol)

URI에 자원을 배치하고 Method와 처리 결과를 연결하는 방법은 [REST](/wiki/backend-services-rest-c3f71fdaf43a/) 설계로 이어진다.
