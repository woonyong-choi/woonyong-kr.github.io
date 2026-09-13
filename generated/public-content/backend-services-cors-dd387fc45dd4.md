---
layout: default
title: CORS
nav_order: 7
permalink: /wiki/backend-services-cors-dd387fc45dd4/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-cors-dd387fc45dd4
projection_sha256: a4c8476d3341d038a80bcf4d8af08e15ac7b9ca5b93c4555df72c6067991905b
parent: 애플리케이션 보안
content_status: ready
public_parent_id: Wiki/security/application-security
grand_parent: Backend
---

# CORS
{: .no_toc }

CORS는 서버가 허용한 origin에 대해 브라우저의 cross-origin 응답 읽기를 허용하는 HTTP 규칙이다. 사용자 인증이나 서버 API의 접근 통제 자체가 아니다. curl·서버 프로그램에 브라우저의 CORS 검사가 그대로 적용되는 것도 아니다.

## Origin과 읽기 경계

일반적인 HTTP origin은 scheme·host·port의 조합이다. `https://app.example`과 `https://api.example`은 host가 달라 cross-origin이다. default port 표기의 차이는 URL 정규화에 따라 같을 수 있다. 쿠키는 이 origin의 port 경계와 완전히 같은 규칙으로 격리되지 않는다.

같은 출처 정책은 cross-origin 읽기를 제한하지만 모든 요청 전송을 금지하지는 않는다. HTML 폼 같은 요청이 전송되고 응답 읽기만 거부될 수 있다. 따라서 CORS 오류를 보고 서버 작업도 수행되지 않았다고 판단하면 안 된다. [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

## Preflight와 실제 요청

사전 요청 여부는 method 하나만이 아니라 CORS-safelisted header·Content-Type 등 조건으로 결정된다. GET·HEAD·POST라도 `Authorization` 같은 헤더나 `application/json` 본문 형식으로 preflight가 필요할 수 있다. 사전 요청이 필요한 경우 브라우저는 `OPTIONS`로 method와 header를 먼저 확인한다.

다음은 가상 서버의 wire 형식 발췌다. `Access-Control-Allow-Origin`에는 bare domain이 아닌 정확한 origin을 쓴다.

```http
OPTIONS /data HTTP/1.1
Host: api.example
Origin: https://app.example
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type
```

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example
Access-Control-Allow-Methods: PUT
Access-Control-Allow-Headers: Content-Type
```

허용되면 브라우저가 PUT을 보낸다. 실제 응답에도 올바른 CORS 헤더가 필요하다. 서버는 그 요청에 대한 인증·인가를 별도로 수행해야 한다. preflight cache와 브라우저 설정에 따라 매번 OPTIONS가 보이는 것은 아니다.

## Credentials와 캐시

쿠키가 필요한 cross-origin fetch는 클라이언트의 `credentials: "include"`, 응답의 `Access-Control-Allow-Credentials: true`, 명시적 허용 origin을 함께 검토한다. credentials 모드가 include이면 `Access-Control-Allow-Origin: *`로 응답을 공유할 수 없다. 이를 만족해도 SameSite·third-party cookie 정책이 첨부를 제한할 수 있다. [인증 정보를 포함하는 CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#requests_with_credentials)

여러 origin을 지원하면 요청의 Origin을 무조건 반사하지 말고 allowlist와 대조한다. Origin에 따라 응답이 달라지면 `Vary: Origin`으로 공유 캐시의 구분도 알린다. 서버·미들웨어의 기존 CORS 기능을 먼저 사용하고 OPTIONS만 무조건 성공시키는 것으로 끝내지 않는다.

CORS 오류에서는 페이지 origin, 사전 요청과 실제 응답, 허용 header·method, credentials, redirect·네트워크 실패를 나눠 본다. [XSS](/wiki/backend-services-xss-df97f0d1042a/)는 허용할 외부 origin의 문제가 아니라 페이지 내부 실행 문제이며, [CSRF](/wiki/backend-services-csrf-4c30779ff9b2/)는 응답 읽기와 독립적인 요청 위조 문제다.
