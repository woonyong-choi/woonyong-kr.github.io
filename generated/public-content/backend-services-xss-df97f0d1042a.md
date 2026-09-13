---
layout: default
title: XSS
nav_order: 4
permalink: /wiki/backend-services-xss-df97f0d1042a/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-xss-df97f0d1042a
projection_sha256: f9e341d79132e9838dde3ffa08f00df159c4f47ffbe6a75fb320113ae3d11cfe
parent: 애플리케이션 보안
content_status: ready
public_parent_id: Wiki/security/application-security
grand_parent: Backend
---

# XSS
{: .no_toc }

XSS는 신뢰하지 않는 입력이 피해 사이트의 페이지 안에서 실행 가능한 코드로 해석되는 취약점이다. 공격 코드는 해당 페이지의 권한으로 DOM을 조작하고, JavaScript가 접근할 수 있는 데이터를 읽거나 인증된 요청을 보낼 수 있다. 다른 origin의 응답 읽기를 제한하는 CORS가 이 내부 실행을 막지는 않는다.

## 입력이 실행되는 위치

저장형은 저장된 게시글 등의 입력이 나중에 페이지에 반영되고, 반사형은 요청 값이 응답에 반영된다. DOM 기반은 클라이언트 코드의 source→sink 경로에 초점을 둔다. DOM 기반이라는 이유만으로 입력이 반드시 서버를 한 번도 거치지 않은 것은 아니다. 서버·클라이언트의 데이터 흐름과 실제 실행 sink를 함께 추적한다. [OWASP XSS](https://owasp.org/www-community/attacks/xss/)

`innerHTML`은 문자열을 HTML로 파싱한다. 이 API로 삽입한 `script` 요소는 보통 실행되지 않지만, 이벤트 속성 등 다른 실행 경로가 있으므로 안전한 API가 아니다. “script가 안 돌았으니 XSS가 없다”는 결론도 틀리다. [innerHTML 보안 고려사항](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML#security_considerations)

## 일반 텍스트는 textContent

다음 Run은 태그 모양의 문자열을 DOM에 텍스트로 넣는다. Preview에 `<b>hello</b>`가 그대로 표시되는지 확인한다.

```run-web
<script>
const comment = "<b>hello</b>";
const box = document.createElement("div");
box.textContent = comment;
if (box.textContent !== comment || box.children.length !== 0) {
  throw new Error("text was interpreted as markup");
}
console.log(box.textContent);
console.log("element children:", box.children.length);
document.body.appendChild(box);
</script>
```

출력은 `<b>hello</b>`와 `element children: 0`이다. 태그가 만들어지지 않고 텍스트로 남는다.

## 출력 문맥에 맞춘 방어

HTML 본문·속성·URL·JavaScript 문맥은 필요한 인코딩과 허용 값이 다르다. HTML escape 하나를 모든 위치에 적용하지 않는다. 일반 텍스트에는 안전한 sink를 사용하고, HTML 자체가 필요한 편집기 등에는 검증된 sanitizer를 사용한다. 템플릿·프레임워크의 자동 escape를 우회하는 raw HTML API를 점검한다. [OWASP XSS 예방](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

CSP는 추가 방어다. 아래는 응답 헤더 예시이며 정책이 기존 스크립트·스타일을 차단하는지 적용 환경에서 확인해야 한다.

```http
Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'
Set-Cookie: session=demo-session; HttpOnly; Secure; SameSite=Lax; Path=/
```

`default-src 'self'`가 모든 XSS를 막는 보장은 아니다. 같은 출처의 취약한 스크립트나 정책 예외가 남을 수 있다. HttpOnly도 스크립트 실행 자체나 인증된 요청을 차단하지 않는다. 저장된 값의 노출은 [브라우저 저장소](/wiki/frontend-topic-1894f58c5755/), 요청 위조는 [CSRF](/wiki/backend-services-csrf-4c30779ff9b2/)와 함께 살핀다.
