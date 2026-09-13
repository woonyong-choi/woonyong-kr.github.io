---
layout: default
title: TLS
nav_order: 7
permalink: /wiki/computer-systems-network-tls-7fbfe5b737cd/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-tls-7fbfe5b737cd
projection_sha256: ad33195befa2816623031b7485e9edec46a55455f9e2892ff0ce9861174c6fcb
parent: 네트워크
content_status: ready
public_parent_id: Wiki/computer-systems-network/network
grand_parent: Systems
ancestor: CS 기초
---

# TLS
{: .no_toc }

TLS는 통신 상대 사이의 기밀성·무결성과 인증을 제공하는 프로토콜이다. 공개키의 신원 확인, handshake의 키 합의, 레코드 보호를 나누면 각 암호 부품의 역할을 이해할 수 있다. 오래된 SSL이라는 이름을 현재 사용할 프로토콜 버전과 혼동하지 않는다.

## TLS 1.3의 인증서 기반 연결

PSK·재개·0-RTT를 사용하지 않는 일반적인 인증서 기반 흐름은 다음과 같다.

1. ClientHello에 지원 버전·cipher suite·key share 등을 보낸다. HTTPS에서는 ALPN으로 상위 프로토콜도 협상할 수 있다.
2. ServerHello가 선택 결과와 서버 key share를 보낸다. 양쪽은 합의한 비밀과 handshake 기록으로 handshake traffic key를 유도한다.
3. 서버는 암호화된 EncryptedExtensions·Certificate·CertificateVerify·Finished를 보낸다. CertificateVerify는 개인키로 handshake 맥락을 서명하고 Finished는 handshake 무결성을 확인한다.
4. 클라이언트가 인증 경로·서비스 이름과 handshake를 검증하고 Finished를 보낸다. 양쪽은 방향별 application traffic key로 데이터를 보호한다.

Certificate를 ServerHello 안의 평문 필드라고 설명하거나 세션키 하나를 브라우저가 만들어 RSA로 보내는 것으로 설명하면 TLS 1.3 흐름과 다르다. 실제 메시지 생략·추가와 순서는 인증·재개 조건에 따라 달라진다. [RFC 8446 §2](https://www.rfc-editor.org/rfc/rfc8446.html#section-2)

## 합의·서명·데이터 보호

TLS 1.3은 static RSA key transport를 제거했다. 일반적인 공개키 기반 경로에서는 임시 (EC)DHE 합의로 키 재료를 만든다. 인증서의 RSA 또는 타원곡선 공개키가 사용된다고 그 키로 본문이나 대칭키를 직접 암호화하는 것은 아니다.

레코드 보호는 AES-GCM·ChaCha20-Poly1305 같은 AEAD를 사용한다. `TLS_AES_256_GCM_SHA384`의 SHA-384를 매 HTTP 메시지에 별도로 덧붙이는 HMAC 태그라고 해석하면 안 된다. cipher suite는 레코드 보호와 키 유도·handshake에 쓰는 hash를 정하며, 인증·키 교환 알고리즘과 분리된다. [RFC 8446 §1.2](https://www.rfc-editor.org/rfc/rfc8446.html#section-1.2)

## 보호 범위

인증된 서버와 연결해도 서버 애플리케이션의 버그·피싱·XSS를 해결하지는 않는다. TLS를 종료하는 proxy는 그 위치에서 평문을 볼 수 있다. 0-RTT early data에는 replay 위험 등 별도 제약이 있으므로 일반적인 handshake 이후 데이터와 같은 보장으로 다루지 않는다. [RFC 8446 §2.3](https://www.rfc-editor.org/rfc/rfc8446.html#section-2.3)

[인증서 검증](/wiki/computer-systems-network-topic-d7694af82c8f/)은 신뢰·이름 검사를, [HTTPS](/wiki/computer-systems-network-https-ee0e61165ec4/)는 HTTP 자원과 브라우저의 mixed content를 다룬다. AEAD의 바이트 단위 예제는 [대칭키 암호](/wiki/backend-services-topic-728d53616ab1/)에 있다.
