---
layout: default
title: 브라우저 저장소
nav_order: 6
permalink: /wiki/frontend-topic-1894f58c5755/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/frontend-topic-1894f58c5755
projection_sha256: 085bd9f8fc82a9cb3d75ccb899365a79d4f9908e53da3793d660d20fce45508b
parent: Browser
content_status: ready
public_parent_id: Wiki/keywords/frontend-topic-7c6123c11353
grand_parent: Frontend
---

# 브라우저 저장소
{: .no_toc }

브라우저에 데이터를 저장할 때는 수명, 공유 범위, 서버 자동 전송, JavaScript 접근을 따로 판단한다. 로그인 상태와 장바구니·화면 설정을 모두 같은 저장소에 넣을 이유는 없다.

## 세 저장소 비교

| 항목 | Cookie | localStorage | sessionStorage |
|---|---|---|---|
| 서버 전송 | 조건에 맞으면 자동 첨부 | 앱이 직접 전송 | 앱이 직접 전송 |
| 수명 | 만료 속성 또는 세션, 정책에 따라 삭제 | 브라우저 재시작을 넘어 유지될 수 있음 | 페이지 세션, 새로고침을 넘어 유지 |
| 기본 공유 범위 | host·domain·path와 쿠키 정책 | origin | origin + 최상위 탭 |
| 페이지 JS 접근 | HttpOnly이면 직접 읽기 불가 | 허용된 문맥에서 가능 | 허용된 문맥에서 가능 |

localStorage와 sessionStorage는 문자열 key/value를 저장하는 동기 API다. 커다란 데이터를 반복해서 처리하면 메인 스레드 작업에 영향을 줄 수 있다. 쿠키는 작은 값과 요청 헤더 비용을 고려하고, Web Storage도 quota·보안 정책 예외를 처리해야 한다. “영구 보관”, “언제나 5~10MB”를 계약으로 삼지 않는다. 중요한 데이터의 유일한 보관소로 쓰려면 사용자 삭제·private browsing·저장 거부 등 손실 경로를 먼저 고려한다. [Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API), [저장 용량과 제거 정책](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

sessionStorage는 새로고침해도 유지된다. opener가 있는 새 창은 처음에 opener의 값을 복사할 수 있지만 그 뒤에는 별도 저장소다. 정상적인 탭 종료는 해당 페이지 세션을 끝내지만 복원 동작까지 일회성 비밀 폐기 보장으로 생각하지 않는다. [sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)

## 무해한 값 저장과 복원

다음은 HTTP origin의 브라우저 페이지에서 실행하는 완결 JavaScript다. 이 Wiki의 Run은 페이지의 실제 저장소에 접근하지 않으므로, 아래 코드는 브라우저 개발자 도구에서 실행한다. 테스트 중 만든 항목만 지우며 `clear()`를 사용하지 않는다.

```javascript
const key = "storage-demo-" + crypto.randomUUID();
try {
  localStorage.setItem(key, "dark");
  sessionStorage.setItem(key, "2");
  if (localStorage.getItem(key) !== "dark" || sessionStorage.getItem(key) !== "2") {
    throw new Error("storage readback failed");
  }
  console.log("local: dark; session: 2");
} finally {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}
```

이 예제는 현재 문맥에서 쓰기·읽기·정리만 확인한다. quota, 재시작, 탭 복원, third-party partitioning 전체를 시험하지 않는다.

## 인증 값을 저장할 때

Web Storage가 자동 전송되지 않는다는 사실은 애플리케이션 전체의 CSRF 면역을 뜻하지 않는다. 다른 쿠키 인증 경로가 있을 수 있다. 같은 origin의 XSS는 저장된 값을 읽거나 인증 요청을 수행할 수 있으므로 비밀을 localStorage에 오래 두면 탈취 영향이 커진다.

서버가 token을 보관하고 HttpOnly 쿠키로 세션을 연결하는 방식은 브라우저의 직접 읽기 노출을 줄인다. 그래도 XSS 예방과 CSRF 검증이 필요하다. OAuth 흐름·클라이언트 유형에 맞춰 저장 방식을 정하고 비민감 설정과 인증 비밀을 구분한다. [OWASP XSS 추가 방어의 한계](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#other-controls)

속성별 전송 기준은 [Cookie](/wiki/backend-services-topic-caaf6d9c987c/), 신원과 권한 위임은 [OAuth 2.0](/wiki/backend-services-oauth-2-0-dcd393e8a137/)에서 이어진다.
