---
layout: default
title: 대칭키 암호
nav_order: 3
permalink: /wiki/backend-services-topic-728d53616ab1/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-topic-728d53616ab1
projection_sha256: aec826d40a345bb889d7e0539c5c890a139ce96496092ecea04a966f6ff8e8fa
parent: 암호학
content_status: ready
public_parent_id: Wiki/security/cryptography
grand_parent: 보안
ancestor: CS 기초
---

# 대칭키 암호
{: .no_toc }

대칭키 암호는 같은 비밀키로 데이터를 암호화하고 복호화한다. AES의 블록 크기는 128비트이고 키 길이는 128·192·256비트다. 키 길이와 블록 크기는 다른 값이다. [NIST FIPS 197](https://csrc.nist.gov/pubs/fips/197/final)

## 기밀성과 무결성을 함께 다루기

AES라는 이름만 선택해서는 메시지 형식이 완성되지 않는다. 운용 모드·nonce 또는 IV·인증 태그·키 관리를 함께 정해야 한다. CBC에 padding을 붙이는 것만으로는 변조를 검출하지 못한다. `openssl enc`의 출력 길이도 버전·salt 형식·패딩에 따라 달라지므로 모든 AES 출력에 적용할 수 없다.

AES-GCM 같은 AEAD는 본문 기밀성과 무결성을 함께 다룬다. 같은 키에서 IV를 재사용하면 안 된다. 96비트 IV가 권장되며 공개되어도 되지만, 유일성은 지켜야 한다. AAD는 암호화하지 않고 인증할 부가 데이터다. [AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)

## 암호화·복원·변조 거부

아래 Run은 Web Crypto가 제공되는 secure context의 JavaScript/Worker 예제다. 매 실행마다 임시 키를 만들고 한 번만 암호화한다. 키를 디스크에 쓰거나 외부로 전송하지 않는다.

```run-javascript
await (async () => {
  const text = new TextEncoder();
  const key = await crypto.subtle.generateKey({name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params = {name: "AES-GCM", iv, additionalData: text.encode("demo:v1"), tagLength: 128};
  const encrypted = await crypto.subtle.encrypt(params, key, text.encode("hello world"));
  const plain = await crypto.subtle.decrypt(params, key, encrypted);
  if (new TextDecoder().decode(plain) !== "hello world") throw new Error("roundtrip failed");
  const changed = new Uint8Array(encrypted.slice(0));
  changed[0] ^= 1;
  let rejected = false;
  try { await crypto.subtle.decrypt(params, key, changed); }
  catch (error) { if (error.name !== "OperationError") throw error; rejected = true; }
  if (!rejected) throw new Error("tampering accepted");
  console.log("plaintext bytes: 11; ciphertext and tag bytes:", encrypted.byteLength);
  console.log("roundtrip and tamper rejection passed");
})().catch(error => { console.error(error); throw error; });
```

이 API의 반환값은 11바이트 본문에 16바이트 태그를 더한 27바이트다. IV·AAD와 자체 파일 형식의 길이는 여기에 포함하지 않는다. 서비스 전체에 필요한 nonce 할당, 키 보관·교체, 메시지 재전송 방지를 구현한 예제는 아니다. 플랫폼 API도 사용 조건을 지켜야 한다. [SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)

## 키 탐색 공간과 키 전달

128비트의 균등한 키 공간은 `2^128`개다. 초당 `10^21`개를 시험한다는 가정에서는 전체 탐색에 약 108억 년, 평균 절반 탐색에 약 54억 년이 걸린다. 이는 산술 가정이며 실제 하드웨어 측정이나 알고리즘 안전성 증명은 아니다. 비밀번호의 엔트로피·키 유출·구현 오류는 이 계산이 다루지 않는다. 다른 암호 계열을 비트 수만으로 비교하거나 특정 양자 안전성을 이 산술에서 결론 내리지 않는다.

키를 평문으로 보내지 않으려면 [공개키 암호](/wiki/backend-services-topic-463f9208fa66/)와 인증된 키 합의를 사용한다. [TLS](/wiki/computer-systems-network-tls-7fbfe5b737cd/)는 이러한 부품을 프로토콜로 조합한다.
