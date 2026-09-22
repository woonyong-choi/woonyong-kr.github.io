---
layout: default
title: Spring Boot
nav_order: 7
permalink: /wiki/spring-boot/
publication_state: publish
has_toc: true
projection_id: Wiki/backend-services/spring-boot
projection_sha256: d058b6926b337cc8fe0b3af23c129544b247f51b1894de4167ad4518fa985486
parent: Spring
content_status: ready
public_parent_id: Wiki/keywords/backend-services-spring-2990236375de
grand_parent: 서버 프레임워크
ancestor: Backend
---

# Spring Boot
{: .no_toc }

Spring Boot로 Kotlin 웹 애플리케이션을 만들 때는 빌드 설정과 요청 처리, 데이터 접근을 연결해 읽는다. [공식 Kotlin 튜토리얼](https://spring.io/guides/tutorials/spring-boot-kotlin/)은 이 흐름을 작은 블로그로 설명한다.

## 요청을 받고 데이터를 돌려주기까지

프로젝트는 Spring Initializr에서 필요한 기능을 골라 시작할 수 있다. Kotlin과 Spring Boot, 빌드 플러그인의 버전은 함께 맞춰야 한다. 튜토리얼에 적힌 버전 번호를 모든 새 프로젝트의 기준으로 고정하지 않는다.

`runApplication`이 애플리케이션을 시작하면 Controller가 요청을 받는다. `@Controller`에서 반환하는 View 이름과 `@RestController`의 응답 본문은 역할이 다르다. 전자는 Model과 Template을 연결하고, 후자는 데이터를 HTTP 응답으로 전달한다. 요청 Mapping과 응답 변환은 Spring MVC에서 이어진다.

데이터 접근은 Repository에 맡기고 생성자로 전달받는다. 튜토리얼의 Spring Data JDBC는 테이블 Schema를 따로 준비하며, `AggregateReference`는 관련 객체 전체 대신 ID를 보관한다. Kotlin의 nullable 반환값도 조회 실패를 어떻게 처리할지 결정하는 계약이다. 관련 기능은 Spring Data에서 구분한다.

## 실행 범위에 맞춰 확인한다

Repository 검사는 저장·조회 계약을, MVC 검사는 요청 Mapping과 응답을 확인한다. 실제 서버를 임의 Port로 띄우는 통합 테스트는 애플리케이션을 연결한 결과를 다룬다. 테스트 이름보다 무엇을 실행하고 무엇을 대역으로 바꿨는지 살펴야 한다.

설정값은 `@ConfigurationProperties`로 묶어 객체에 연결할 수 있다. 코드에 흩어진 문자열 대신 설정의 이름과 타입을 함께 읽는 방법이다. 자세한 바인딩과 환경별 값은 외부 설정에서 다룬다.
