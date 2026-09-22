---
layout: default
title: Backend
nav_order: 7
permalink: /wiki/backend-services/
publication_state: publish
has_toc: true
projection_id: Wiki/backend-services
projection_sha256: c1a3aef9ff4a1107d3983079161b60fd0e6f21add7098e89a6c19ec657bb7f2f
content_status: overview
search_terms:
- 백엔드
- Backend
---

# Backend
{: .no_toc }

서버는 요청을 받은 뒤 입력을 확인하고, 필요한 권한을 검사하며, 데이터를 읽거나 변경해 응답한다. 여러 요청이 동시에 들어오거나 외부 시스템이 늦어지는 상황에서도 이 흐름을 유지해야 한다.

Kotlin과 Spring을 중심으로 API, 데이터 처리, 비동기 작업을 다룬다. 서버의 구조는 애플리케이션 아키텍처, 입력과 권한을 보호하는 구현은 [애플리케이션 보안](/wiki/application-security/)과 [인증·인가](/wiki/auth/)로 연결한다. 공통 설계와 테스트는 Programming에서, 서버의 성능과 장애 처리는 이 분야에서 다룬다.
