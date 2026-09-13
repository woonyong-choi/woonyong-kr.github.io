---
layout: default
title: HTTPS
nav_order: 4
permalink: /wiki/computer-systems-network-https-ee0e61165ec4/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-https-ee0e61165ec4
projection_sha256: aac17cfc9c59f161ec2782ef92db94a98886a5707c3e3f78faf1090f9cd42e9e
parent: TLS
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-tls-7fbfe5b737cd
grand_parent: 네트워크
ancestor: CS 기초
---

# HTTPS
{: .no_toc }

HTTPS는 HTTP 통신에 TLS의 보호를 적용한다. 평문 HTTP를 관찰·변경할 수 있는 네트워크 경로에서는 요청·응답의 도청·변조·상대 위장 위험이 있다. 같은 Wi-Fi 사용자 누구나 반드시 모든 패킷을 볼 수 있다는 뜻은 아니지만, 평문 HTTP 자체는 그 보호를 제공하지 않는다.

## HTTP 의미와 전송 경로

기본 포트는 HTTP 80, HTTPS 443이다. HTTP/1.1·HTTP/2 over TLS는 보통 TCP 연결 후 TLS를 협상하고 보호된 통로로 HTTP 메시지를 교환한다. HTTP/3는 QUIC 위에서 동작하고 TLS 1.3 handshake를 통합하므로 모든 HTTPS를 “TCP와 HTTP 사이에 TLS 한 겹”으로 한정하지 않는다. 메서드·상태 코드의 의미를 유지하는 것과 wire 형식이 같은 것은 다르다. [RFC 9110 HTTPS URI](https://www.rfc-editor.org/rfc/rfc9110.html#section-4.2.2), [RFC 9114 HTTP/3](https://www.rfc-editor.org/rfc/rfc9114.html#section-2)

주소창의 보안 표시는 연결·인증서에 관한 것이며 사이트의 선의를 보장하지 않는다. 현재 브라우저가 모두 동일한 자물쇠 아이콘을 쓰는 것도 아니다. handshake와 인증서 이름 검사는 [TLS](/wiki/computer-systems-network-tls-7fbfe5b737cd/) 및 [인증서 검증](/wiki/computer-systems-network-topic-d7694af82c8f/)에서 구분한다.

## Mixed content의 위험

HTTPS 페이지에서 `http://cdn.example/app.js`를 불러오면 그 자원은 별도 평문 요청이다. 페이지 본체만 보호해도 이 스크립트가 바뀌면 페이지의 동작에 영향을 줄 수 있다. 브라우저는 안전한 문맥의 하위 자원 요청을 mixed content 규칙에 따라 승급하거나 차단한다.

현행 설명은 upgradable과 blockable을 구분한다. 일부 이미지·오디오·비디오 요청은 HTTPS로 승급하고, script·stylesheet·iframe·fetch 등 다른 요청은 차단 대상이다. 이미지도 `srcset`·`picture`와 IP 주소 host 등 세부 조건이 달라 “이미지는 모두 승급”으로 외우면 안 된다. 예전 active/passive 분류는 배경 설명으로만 사용한다. [MDN Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)

HTTP로 이동하는 최상위 탐색은 새로운 문맥이므로 일반적인 하위 자원 mixed content와 다르다. loopback 같은 잠재적으로 신뢰 가능한 origin 예외도 있다. 따라서 로컬 HTTP 예제의 성공을 외부 HTTP 자원의 로드 가능성으로 일반화하지 않는다.

## 승급 정책과 근본 수정

원본 자원이 HTTPS를 제공하도록 준비하고 HTML·CSS·스크립트의 URL을 수정한다. 다음은 HTTPS 응답을 내는 nginx server 문맥에 둘 수 있는 설정 발췌다. 실제 설정 변경이나 reload는 수행하지 않는다.

```nginx
add_header Content-Security-Policy "upgrade-insecure-requests" always;
```

정책의 대상인 불안전한 자원 요청을 HTTPS로 바꾸되 실패하면 HTTP로 되돌아가지 않는다. 모든 외부 링크의 최상위 탐색까지 승급하는 규칙은 아니며 HSTS의 대체물도 아니다. 기존 CSP와 함께 적용되는 효과를 확인해야 한다. [upgrade-insecure-requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/upgrade-insecure-requests)

개발자 도구에서는 원래 URL·최종 scheme·요청 종류·CSP·승급 또는 차단 이유를 확인한다. HTTPS 실패를 해결하려고 브라우저 보안을 끄거나 인증서 검증을 생략하지 않는다. CORS 읽기 허용 문제와 mixed content 전송 정책도 서로 다르다. [CORS](/wiki/backend-services-cors-dd387fc45dd4/), [XSS](/wiki/backend-services-xss-df97f0d1042a/)
