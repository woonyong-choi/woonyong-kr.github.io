---
layout: default
title: CSRF
nav_order: 5
permalink: /wiki/backend-services-csrf-4c30779ff9b2/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-csrf-4c30779ff9b2
projection_sha256: a2029860a530bbbc3377e9b928ff8bdf7762e52468094f61c4dd20c5f6bbbbe4
parent: 애플리케이션 보안
content_status: ready
public_parent_id: Wiki/security/application-security
grand_parent: Backend
---

# CSRF
{: .no_toc }

CSRF는 사용자가 원하지 않은 요청에 브라우저의 인증 상태가 사용되는 공격이다. 공격자가 세션 값을 직접 읽지 못해도 쿠키가 첨부되는 요청을 유도할 수 있다. 서버는 인증된 요청이라는 사실과 사용자가 의도한 요청이라는 사실을 구분해야 한다.

## 요청이 보내졌다는 것과 응답 읽기는 다르다

다른 사이트의 페이지가 상태 변경 endpoint에 폼을 제출하는 상황을 생각한다. 쿠키와 서버 검증 조건이 모두 허용하면 인증된 동작으로 처리될 수 있다. 실제 서비스의 송금 폼을 자동 실행하는 예제로 확인할 필요는 없다. 읽기를 막는 [CORS](/wiki/backend-services-cors-dd387fc45dd4/)만으로 요청의 부작용은 되돌릴 수 없다.

## 기본 방어와 보완

프레임워크의 CSRF 보호를 우선 사용하고, 상태 변경을 GET에 두지 않는다. 세션에 연결한 예측 불가능한 CSRF token을 서버가 검증하는 synchronizer 방식이나, 서명과 세션 연결을 갖춘 double-submit 방식 등을 애플리케이션 구조에 맞춘다. 단순히 임의 쿠키와 헤더의 문자열이 같다는 검사만 추가하지 않는다. Origin·Referer·Fetch Metadata 검사도 배포 구조와 허용 흐름에 맞춰 보완할 수 있다. [OWASP CSRF 예방](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

[Cookie의 SameSite](/wiki/backend-services-topic-caaf6d9c987c/)는 명시적 Lax·Strict 쿠키가 cross-site POST 등에 따라가지 않게 제한한다. 세션 쿠키가 없으면 정상적인 인증 검증이 요청을 거부해야 한다. 그러나 같은 site의 침해된 하위 도메인, XSS, GET 상태 변경, cross-site가 필요한 None 설정은 따로 고려한다. SameSite를 기본 CSRF 검증의 대체물로 삼지 않는다.

HttpOnly는 쿠키 값의 직접 읽기를 제한할 뿐 CSRF를 막는 속성이 아니다. [XSS](/wiki/backend-services-xss-df97f0d1042a/)는 token을 읽거나 보호된 요청을 같은 origin에서 실행할 수 있으므로 별도로 예방해야 한다. OAuth callback의 요청 연결·재생 방지는 [OAuth 2.0](/wiki/backend-services-oauth-2-0-dcd393e8a137/)에서 다룬다.
