---
layout: default
title: OIDC
nav_order: 7
permalink: /wiki/backend-services-oidc-5c4ff285a196/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-oidc-5c4ff285a196
projection_sha256: 18851061dbce59d6e9ea95d0fba7a1955fb76b3fab9f0ed5ced98f484f200ff7
parent: 인증·인가
content_status: ready
public_parent_id: Wiki/backend-services/auth
grand_parent: Backend
---

# OIDC
{: .no_toc }

OpenID Connect는 OAuth 2.0 위에서 사용자 인증 결과를 전달하는 계층이다. OAuth가 자원 접근의 권한 위임을 다룬다면 OIDC는 client가 로그인한 사용자의 신원을 확인하는 표준 claim과 절차를 더한다. `openid` scope와 ID Token이 핵심 구분점이다. [OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html#Introduction)

## ID Token과 access token

ID Token은 client를 대상으로 하는 인증 결과다. 자원 API에 보내는 access token과 목적·audience가 다르며 서로 바꿔 사용하지 않는다. ID Token은 JWT 형식으로 보호되지만 payload를 decode하는 것으로 검증이 끝나지 않는다.

client는 사용하는 flow의 ID Token validation 규칙에 따라 issuer, 자신을 포함하는 audience와 필요한 azp 조건, 신뢰한 키와 서명, 만료 등을 검증한다. 요청에 nonce를 보냈다면 받은 claim과 연결해 확인하고 재생을 다룬다. 기존 OIDC 라이브러리와 제공자 metadata를 사용하되 검증 옵션을 생략하지 않는다. [OIDC Core ID Token Validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)

“소셜 로그인 버튼을 사용했다”는 사실만으로 제공자가 OIDC를 지원한다고 가정하지 않는다. 제공자의 지원 프로토콜·scope·token endpoint·검증 규칙을 확인해야 한다.

code 교환과 PKCE는 [OAuth 2.0](/wiki/backend-services-oauth-2-0-dcd393e8a137/), 서명과 claim 검증의 기본 경계는 [JWT](/wiki/backend-services-jwt-d09d862aafdc/)에서 이어진다.
