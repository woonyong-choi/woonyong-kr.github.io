---
layout: default
title: OAuth 2.0
nav_order: 6
permalink: /wiki/backend-services-oauth-2-0-dcd393e8a137/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-oauth-2-0-dcd393e8a137
projection_sha256: 0e569412d06d773cf1c079ef7a0b722da5c8c39e65e79c2aad913ef95269385d
parent: 인증·인가
content_status: ready
public_parent_id: Wiki/backend-services/auth
grand_parent: Backend
---

# OAuth 2.0
{: .no_toc }

OAuth 2.0은 사용자의 비밀번호를 애플리케이션에 맡기지 않고 자원 접근 권한을 위임하는 프로토콜이다. 가상의 사진 인화 앱에는 사진 읽기 권한만 주고, 계정 전체의 로그인 수단은 넘기지 않는 상황을 생각할 수 있다.

## 네 역할과 클라이언트 유형

- Resource Owner는 접근을 허용할 자원의 권한을 가진 주체다.
- Client는 그 자원에 접근하려는 앱이다.
- Authorization Server는 인가 절차를 처리하고 token을 발급하는 인가 서버다. 사용자 인증이 포함될 수 있지만 OAuth가 인증 방법 자체를 정하지는 않는다.
- Resource Server는 token과 허용 범위를 검사하고 API 자원을 제공한다.

사용자 인증과 앱의 제한된 접근 권한은 다른 문제다. scope·만료·발급 조건은 제공자와 자원에 따라 달라진다. public client는 브라우저·배포된 앱 등에서 client secret을 안전하게 보관할 수 없고, confidential client는 서버 등에서 정해진 방식의 client 인증을 수행할 수 있다. `client_id`는 비밀이 아니다. [RFC 6749 §§1–2](https://www.rfc-editor.org/rfc/rfc6749.html#section-1)

## Authorization Code와 PKCE

인가 응답에는 access token 대신 수명이 짧고 한 번만 쓸 수 있는 code를 반환한다. 클라이언트가 token endpoint에서 이를 교환한다. 서버 앱에서는 서버가 교환하고, public client도 지원 조건에 따라 직접 교환할 수 있다. 따라서 Code 방식 자체가 token을 브라우저에서 절대 숨긴다는 뜻은 아니다.

RFC 6749는 code의 최대 수명으로 10분을 권고한다. 실제 만료 시간은 제공자 설정을 확인하고, 재사용된 code는 거부해야 한다. access token·refresh token의 수명과 같은 값으로 취급하지 않는다. [RFC 6749 §4.1.2](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1.2)

PKCE는 요청마다 만든 verifier의 challenge를 인가 요청에 보내고, code 교환 때 원래 verifier를 제출하여 요청을 연결한다. public client에는 PKCE가 필수이며 confidential client에도 권장된다. 여기서는 S256을 사용하는 경로로 설명한다. redirect URI는 등록 값과 정확히 비교하며 native app loopback port 예외 등 해당 표준의 제한된 예외를 구분한다. client secret은 PKCE나 요청 연결 검증의 대체물이 아니다. [RFC 9700 §2.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1)

1. client는 verifier·challenge와 요청에 연결할 state를 준비한다.
2. 브라우저를 인가 서버로 보내 사용자 인증과 필요한 동의를 받는다.
3. 인가 서버는 등록한 callback으로 code·state를 돌려보낸다.
4. client는 요청 연결·issuer·오류 응답을 확인하고 code·verifier로 교환한다. confidential client는 정해진 client 인증도 수행한다.
5. 자원 서버에는 access token을 보내 허용된 API를 사용한다. refresh token은 API 요청에 보내지 않는다.

state는 예측 불가능하고 한 번만 쓰며 시작한 브라우저 세션에 연결해 검증해야 한다. PKCE 지원을 확인한 client나 OIDC nonce가 제공하는 CSRF 보호 등 RFC의 대안을 구분하되, state라는 이름의 상수 하나를 붙였다는 사실만으로 보호를 주장하지 않는다. code·token·verifier는 URL 로그나 페이지 스크립트에 불필요하게 노출하지 않는다.

## 가상 HTTP 교환

다음은 public client의 형식 예시다. `example` 주소와 모든 code·state·token은 가상 값이다. 줄 안에 설명 주석을 넣지 않으며 실제 서버로 보내는 명령이 아니다.

```http
GET /authorize?response_type=code&client_id=demo-client&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&scope=photos.read&state=demo-state&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256 HTTP/1.1
Host: auth.example
```

callback에서 `code=demo-code&state=demo-state`를 받고 요청 연결을 검증한 뒤 교환한다. 아래 고정 verifier는 RFC 시험 벡터이며 운영에서 재사용하면 안 된다.

```http
POST /token HTTP/1.1
Host: auth.example
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=demo-code&client_id=demo-client&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

```json
{
  "access_token": "demo-access-token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "photos.read"
}
```

`expires_in`의 단위는 초이며 3600은 예시다. refresh token은 항상 발급되는 필수 필드가 아니다.

```http
GET /photos HTTP/1.1
Host: api.example
Authorization: Bearer demo-access-token
```

Bearer token은 가진 쪽이 사용할 수 있어 TLS·저장·로그 보호가 필요하다. API는 token의 유효성만 아니라 대상 자원·scope·audience에 맞는 권한을 검사한다. [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html)

## S256 변환 확인

다음 Run은 네트워크 없이 RFC 7636 Appendix B의 verifier→challenge 벡터를 확인한다. 실서비스 verifier는 매 요청마다 충분한 엔트로피로 새로 만들고 43–128자의 허용 문자 규칙을 지킨다. [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html#appendix-B)

```run-python
import base64
import hashlib

verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
assert challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
assert len(challenge) == 43
print(challenge)
```

이 검사는 hash·Base64URL 변환만 검증한다. redirect 검증, code 일회성, client 인증, CSRF, token 서버 구현의 적합성 검증은 아니다.

## 토큰 수명과 현행 보안 기준

access token의 짧은 수명은 노출된 권한의 유효 기간을 줄인다. refresh token은 새 access token 발급에 쓰이며 수명·회수·재인증 조건은 서비스 정책이다. public client의 refresh token은 sender constraint 또는 rotation으로 재생을 다뤄야 한다. sender-constrained access token도 선택 가능한 보완이며 Bearer 사용과 구별한다.

RFC 9700은 2025년 발행된 BCP 240으로 기존 OAuth 보안 지침을 갱신한다. ROPC grant는 사용해서는 안 되고, implicit처럼 인가 응답에 access token을 내보내는 방식은 누출·주입 방어를 충족하는 예외를 제외하고 사용하지 않도록 권고한다. code 교환 경로를 우선한다. 이 문서의 예제를 운영 적합성 판정표로 간주하지 말고 적용 시 요구 사항별 구현과 실패 검증을 연결한다. [RFC 9700 §§2.1–2.4](https://www.rfc-editor.org/rfc/rfc9700.html#section-2)

검토할 공격에는 redirect·history·Referer 누출, issuer mix-up, code·token 주입, CSRF, open redirect, token 재생이 있다. TLS 종료 reverse proxy가 전달하는 보안 관련 header는 외부 입력과 신뢰 경계를 구분해야 한다. 해당 RFC 절과 최신 errata를 확인하고 각 요구 사항의 구현 위치·실패 사례·허용한 예외를 기록한다. [RFC 9700 §4](https://www.rfc-editor.org/rfc/rfc9700.html#section-4), [RFC 상태와 errata](https://www.rfc-editor.org/info/rfc9700/)

token 형식은 고정되지 않아 opaque 또는 [JWT](/wiki/backend-services-jwt-d09d862aafdc/)일 수 있다. 로그인 신원 확인은 [OIDC](/wiki/backend-services-oidc-5c4ff285a196/), 브라우저 보관은 [브라우저 저장소](/wiki/frontend-topic-1894f58c5755/)의 경계로 이어진다.
