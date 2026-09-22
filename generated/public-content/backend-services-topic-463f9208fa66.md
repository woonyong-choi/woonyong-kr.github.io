---
layout: default
title: 공개키 암호
nav_order: 4
permalink: /wiki/backend-services-topic-463f9208fa66/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-topic-463f9208fa66
projection_sha256: e1a795f8adeed0684e8ea6ea6fd151324822b3e62c472f131b6723ea627e5595
parent: 암호학
content_status: ready
public_parent_id: Wiki/security/cryptography
grand_parent: 보안
ancestor: CS 기초
---

# 공개키 암호
{: .no_toc }

공개키 암호는 공개해도 되는 값과 비밀로 유지할 개인키를 이용한다. 공개키로 암호화하고 개인키로 복호화하는 방식뿐 아니라, 개인키로 서명하고 공개키로 검증하는 방식과 키 합의가 있다. ECC는 이 모두를 같은 연산으로 제공하는 단일 암호화 알고리즘이 아니라 타원곡선을 사용하는 암호 계열이다.

## 암호화와 서명은 다른 연산

받는 사람만 읽게 하려면 수신자의 공개키를 사용하는 암호화 방식을 검토한다. 작성자의 키로 만들어졌음을 확인하려면 [전자서명](/wiki/backend-services-topic-d031406d8def/)을 사용한다. “개인키로 암호화한 것을 공개키로 복호화한다”는 표현은 서명 API와 그 보안 조건을 정확히 설명하지 못한다.

알고리즘·프리미티브·프로토콜을 반드시 세 겹으로 나누는 고정 분류도 없다. 해시·블록 암호 자체도 primitive라고 부른다. 구분의 목적은 [기밀성](/wiki/backend-services-topic-728d53616ab1/), [메시지 인증](/wiki/backend-services-topic-69f930c1b295/), 키 합의와 상대 신뢰가 각각 어떤 부품으로 충족되는지 확인하는 데 있다.

## RSA-OAEP의 입력 길이

일반적인 two-prime RSA의 모듈러스 `n`은 두 큰 소수의 곱이다. 공개키에는 `n`과 공개 지수, 개인키에는 복호화·서명에 필요한 비밀 값이 있다. 큰 정수의 소인수분해 난이도는 RSA의 중요한 배경이지만 padding과 프로토콜을 생략한 raw RSA를 안전하게 만드는 근거는 아니다. 개인키 구조를 학습한다고 실제 키 전체를 로그에 출력하지 않는다. [RFC 8017 §3](https://www.rfc-editor.org/rfc/rfc8017.html#section-3)

RSA-OAEP는 `mLen ≤ k − 2·hLen − 2`의 제한이 있다. RSA-2048의 모듈러스 길이 `k=256`바이트, SHA-256의 `hLen=32`바이트이면 최대 평문은 190바이트다. 암호문은 256바이트다. 이 값은 OAEP와 해시를 지정한 결과이지 모든 RSA 방식의 공통 평문 한도가 아니다. [RFC 8017 §7.1](https://www.rfc-editor.org/rfc/rfc8017.html#section-7.1)

```run-javascript
await (async () => {
  const pair = await crypto.subtle.generateKey(
    {name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"},
    false, ["encrypt", "decrypt"]);
  const message = new Uint8Array(190).fill(7);
  const cipher = await crypto.subtle.encrypt("RSA-OAEP", pair.publicKey, message);
  const restored = new Uint8Array(await crypto.subtle.decrypt("RSA-OAEP", pair.privateKey, cipher));
  if (cipher.byteLength !== 256 || restored.length !== 190 || !restored.every(x => x === 7)) {
    throw new Error("RSA roundtrip failed");
  }
  let rejected = false;
  try { await crypto.subtle.encrypt("RSA-OAEP", pair.publicKey, new Uint8Array(191)); }
  catch (error) { if (error.name !== "OperationError") throw error; rejected = true; }
  if (!rejected) throw new Error("oversized plaintext accepted");
  console.log("190 bytes accepted; 191 bytes rejected; ciphertext: 256 bytes");
})().catch(error => { console.error(error); throw error; });
```

Web Crypto secure context/Worker용 독립 예제다. 임시 키의 구조나 실제 개인키를 출력하지 않는다. 보안성·처리량 측정이나 배포용 키 크기 선정 검증은 아니다. [SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)

## 큰 메시지는 하이브리드 구성

RSA-OAEP로 작은 무작위 대칭키를 감싸고 본문은 AEAD로 암호화하는 디지털 봉투가 한 예다. 수신자는 개인키로 대칭키를 복원한 뒤 본문 인증·복호화를 수행한다. 공개키 연산과 대칭키 연산의 상대 속도를 고정된 “수백 배”로 단정하지 않는다. RSA 블록으로 파일을 직접 나누어 암호화하는 방식보다 표준 프로토콜·검증된 라이브러리를 사용한다.

현대 TLS 1.3은 RSA로 세션키를 운반하는 방식을 쓰지 않는다. 일반적인 인증서 기반 연결에서는 임시 (EC)DHE 합의로 키 재료를 만들고 서명으로 handshake를 인증한다. PSK 경로도 별도로 있다. [RFC 8446 §1.2](https://www.rfc-editor.org/rfc/rfc8446.html#section-1.2)

공개키가 안전한 알고리즘의 값이라는 것과 그 키가 실제 상대의 것이라는 것은 다르다. 키의 주인 확인은 [PKI와 신뢰 모델](/wiki/backend-services-pki-136c318c4542/)에서 이어진다.
