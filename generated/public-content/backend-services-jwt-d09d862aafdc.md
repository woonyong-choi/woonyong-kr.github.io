---
layout: default
title: JWT
nav_order: 5
permalink: /wiki/backend-services-jwt-d09d862aafdc/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-jwt-d09d862aafdc
projection_sha256: a528883944e71ee681f9315513201c86a32d3e478a4c864e9914f211d4b16b3e
parent: 인증·인가
content_status: ready
public_parent_id: Wiki/backend-services/auth
grand_parent: Backend
---

# JWT
{: .no_toc }

JWT는 claims를 전달하는 형식이다. OAuth access token이 반드시 JWT인 것은 아니며, JWT를 받았다고 신뢰할 수 있는 것도 아니다. 서명 또는 MAC으로 보호한 JWS와 암호화한 JWE를 구분한다. [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html)

## 세 부분은 JWS compact 형식

일반적인 signed JWT는 `Base64URL(header).Base64URL(payload).Base64URL(signature)`의 세 부분이다. Base64URL은 암호화가 아니므로 payload를 읽을 수 있다. JWE compact는 다섯 부분이므로 모든 JWT가 세 부분이라고 일반화하지 않는다.

```json
{
  "iss": "https://auth.example",
  "sub": "demo-user",
  "aud": "https://api.example",
  "scope": "photos.read",
  "exp": 2000000000
}
```

이 JSON은 가상 payload이며 유효한 token이나 검증 결과가 아니다. claim의 의미·필수 여부는 사용 프로파일에 따르고 `exp`는 Unix 시각의 초 단위다. 민감값을 평문으로 읽히는 payload에 넣지 않는다.

## Decode와 검증의 차이

검증자는 허용 알고리즘을 자신의 설정으로 제한하고, 신뢰한 issuer의 올바른 키로 signature 또는 MAC을 검증한다. 비대칭 서명은 개인키로 생성·공개키로 검증하지만 HMAC 방식은 공유 비밀을 사용한다. header의 `alg`·`kid`·키 URL을 무조건 신뢰하지 않는다.

issuer·audience·시간·필요한 claim과 token 종류도 검증해야 한다. 서명이 맞는 다른 서비스용 token을 받아들이면 대체 공격이 가능하다. 라이브러리의 decode 함수로 payload를 읽고 로그인 완료 처리하지 않는다. [RFC 8725 §§3.1–3.12](https://www.rfc-editor.org/rfc/rfc8725.html#section-3)

권한 위임과 token 사용은 [OAuth 2.0](/wiki/backend-services-oauth-2-0-dcd393e8a137/), 로그인용 ID Token은 [OIDC](/wiki/backend-services-oidc-5c4ff285a196/), 암호학적 서명은 [전자서명](/wiki/backend-services-topic-d031406d8def/)에서 구분한다.
