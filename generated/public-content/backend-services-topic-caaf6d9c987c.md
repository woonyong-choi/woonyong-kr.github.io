---
layout: default
title: Cookie
nav_order: 4
permalink: /wiki/backend-services-topic-caaf6d9c987c/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-topic-caaf6d9c987c
projection_sha256: dd1d8ec2a9e79c62a6e7b8a508a6539a16e6fa1783b63e65aa2e7e3ffedd183c
parent: 인증·인가
content_status: ready
public_parent_id: Wiki/backend-services/auth
search_terms:
- 쿠키
grand_parent: Backend
---

# Cookie
{: .no_toc }

쿠키는 서버 응답의 `Set-Cookie` 등으로 저장되고, 조건에 맞는 후속 요청의 `Cookie` 헤더에 브라우저가 첨부하는 작은 상태 값이다. HTTP가 무상태라는 것은 서버가 세션 데이터를 저장할 수 없다는 뜻이 아니다. 브라우저의 세션 식별자로 서버의 로그인 상태를 찾는 식으로 애플리케이션이 상태를 구성한다.

## 저장과 전송은 별도 조건이다

다음은 실제 토큰이 아닌 가상 세션 식별자의 HTTP 헤더 예시다.

```http
HTTP/1.1 200 OK
Set-Cookie: session=demo-session; HttpOnly; Secure; SameSite=Lax; Max-Age=3600; Path=/
```

`Domain`을 생략하면 설정한 host에만 전송하는 host-only 쿠키다. 허용된 `Domain`을 지정하면 하위 도메인까지 범위가 넓어질 수 있다. `Path`는 전송할 경로를 좁히지만 같은 출처 안의 비밀을 격리하는 보안 경계가 아니다. `Max-Age`는 초 단위이며 `Expires`와 함께 있으면 우선한다. 둘 다 없으면 세션 쿠키지만 브라우저의 세션 복원으로 다시 살아날 수 있다. 사용자가 지우거나 저장 정책이 거부할 수도 있다. [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)

```http
GET /api/profile HTTP/1.1
Host: app.example
Cookie: session=demo-session
```

쿠키 속성 자체가 이 요청 헤더에 따라붙지는 않는다. 실제 첨부 여부는 host·path·수명·Secure·SameSite·요청의 credentials 설정과 브라우저 정책을 함께 만족해야 한다. 같은 도메인으로 보내는 모든 요청에 항상 첨부되는 것은 아니다.

## 세 보안 속성이 맡는 일

- `HttpOnly`는 페이지 JavaScript가 쿠키 값을 직접 읽는 것을 막는다. XSS가 사용자의 브라우저에서 인증된 요청을 보내는 것까지 막지는 않는다.
- `Secure`는 통상 HTTPS 요청에만 전송하게 한다. localhost 예외가 있으며, 디스크 접근이나 HttpOnly 없는 JavaScript 접근을 막는 암호화 저장 옵션은 아니다.
- `SameSite`는 site 관계에 따라 첨부를 제한한다. 다른 조건이 충족돼도 이 제한에 걸리면 쿠키를 보내지 않는다.

## SameSite는 origin과 다르다

일반적인 도메인의 schemeful site는 scheme과 등록 가능한 도메인으로 구분한다. `https://app.example.com`과 `https://api.example.com`은 cross-origin이면서 same-site다. `http://app.example.com`과 `https://app.example.com`은 scheme이 달라 cross-site다. public suffix·IP 주소 등은 단순히 호스트의 마지막 두 조각을 자르는 규칙으로 판정하면 안 된다. [same-site 정의](https://html.spec.whatwg.org/multipage/browsers.html#same-site)

아래 표는 다른 쿠키·credentials·브라우저 조건이 모두 충족된 경우 **SameSite 속성만** 비교한 것이다.

| 요청 맥락 | Strict | 명시적 Lax | None + Secure |
|---|---|---|---|
| same-site 요청 | 허용 | 허용 | 허용 |
| cross-site 최상위 탐색, 안전한 메서드 | 제한 | 허용 | 허용 |
| cross-site POST 폼 | 제한 | 제한 | 허용 |
| cross-site iframe·이미지·fetch | 제한 | 제한 | 허용 |

`Lax` 예외는 사용자가 직접 클릭한 GET만의 규칙이 아니다. 최상위 탐색과 안전한 메서드가 기준이며, GET으로 상태를 바꾸면 이 예외가 공격 통로가 된다. `None`에는 `Secure`가 필요하지만 third-party cookie 차단을 해제하지는 않는다. 속성을 생략해 적용되는 기본 Lax에는 일부 브라우저에서 생성 후 2분 이내 POST를 허용하는 완화가 있어, 명시적 Lax와 동일하다고 가정하지 않는다. [SameSite 속성](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value)

## 서버 설정의 경계

일반적인 세션 쿠키는 Lax를 검토하고, 외부 진입 시 로그인 유지가 필요 없는 경우 Strict를 고려한다. cross-site 사용이 실제로 필요한 경우에만 None을 검토한다. 어느 선택도 [CSRF](/wiki/backend-services-csrf-4c30779ff9b2/) 방어 전체를 대신하지 않는다.

다음은 Django 5.2 설정 발췌다. 세션 쿠키와 CSRF 쿠키를 설정할 뿐 CSRF middleware·검증을 대신하지 않는다. 프레임워크 실행 검증은 포함하지 않는다. [Django 설정](https://docs.djangoproject.com/en/5.2/ref/settings/#session-cookie-samesite)

```python
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
```

다음은 `token`과 servlet `response`가 이미 존재하는 Spring 코드의 발췌다. `maxAge(3600)`의 단위는 초다. 쿠키를 직접 추가했다고 로그인 검증이 구현되는 것은 아니다. [ResponseCookie builder](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/ResponseCookie.ResponseCookieBuilder.html)

```java
org.springframework.http.ResponseCookie cookie =
        org.springframework.http.ResponseCookie.from("session", token)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(3600)
                .build();
response.addHeader("Set-Cookie", cookie.toString());
```

OAuth token을 반드시 쿠키에 저장한다는 표준은 없다. 서버가 token을 관리하고 브라우저에는 불투명한 세션 식별자만 주는 설계도 있다. JavaScript가 필요한 저장소와 수명 비교는 [브라우저 저장소](/wiki/frontend-topic-1894f58c5755/)에서 다룬다.
