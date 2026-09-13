---
layout: default
title: 전자서명
nav_order: 5
permalink: /wiki/backend-services-topic-d031406d8def/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-topic-d031406d8def
projection_sha256: c81ea662bc1ece45f387a46592e60843b98d365292d9ea7aee731770c7216749
parent: 암호학
content_status: ready
public_parent_id: Wiki/security/cryptography
grand_parent: 보안
ancestor: CS 기초
---

# 전자서명
{: .no_toc }

디지털 서명은 개인키로 메시지에 대한 서명을 만들고 대응하는 공개키로 검증한다. 메시지의 무결성과 해당 키에 의한 작성 여부를 확인한다. 문서의 법적 효력이나 실제 사람의 의도까지 암호 연산 하나로 증명하는 것은 아니다.

## 검증되는 것과 전제

서명이 맞아도 검증에 사용한 공개키의 주인을 확인해야 한다. 개인키 유출·공유, 서명 정책과 시점, 인증서 신뢰가 결과 해석에 영향을 준다. 부인 방지는 제3자가 확인할 수 있는 증거를 제공하는 성질이며 이 전제들과 함께 판단한다. 공유키의 양쪽 모두 태그를 만들 수 있는 [HMAC](/wiki/backend-services-topic-69f930c1b295/)과 차이가 있다. [NIST Digital Signature Standard](https://csrc.nist.gov/pubs/fips/186-5/final)

## Hash와 서명 형식

서명 알고리즘은 메시지를 hash하고 인코딩·padding 등 알고리즘별 절차를 적용한다. 사용자가 hash를 임의로 만들어 “개인키 암호화” API에 넣는 것으로 대체하지 않는다. RSA-2048 서명은 256바이트지만 모든 서명 알고리즘이 이 길이를 쓰는 것은 아니다. RSA-PSS와 RSA-OAEP는 각각 서명과 암호화용으로 구분된다. [RFC 8017 §8](https://www.rfc-editor.org/rfc/rfc8017.html#section-8)

## 원문·변조·다른 키 검증

Web Crypto secure context/Worker에서 실행하는 독립 예제다. 모든 키와 메시지는 실행 중에만 존재한다.

```run-javascript
(async () => {
  const algorithm = {name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"};
  const pair = await crypto.subtle.generateKey(algorithm, false, ["sign", "verify"]);
  const other = await crypto.subtle.generateKey(algorithm, false, ["sign", "verify"]);
  const bytes = new TextEncoder();
  const message = bytes.encode("send 1000 to bob");
  const params = {name: "RSA-PSS", saltLength: 32};
  const signature = await crypto.subtle.sign(params, pair.privateKey, message);
  const valid = await crypto.subtle.verify(params, pair.publicKey, signature, message);
  const changed = await crypto.subtle.verify(params, pair.publicKey, signature, bytes.encode("send 9000 to bob"));
  const wrongKey = await crypto.subtle.verify(params, other.publicKey, signature, message);
  if (!valid || changed || wrongKey || signature.byteLength !== 256) throw new Error("signature check failed");
  console.log("message bytes:", message.byteLength);
  console.log("signature bytes:", signature.byteLength);
  console.log("original accepted; changed message and wrong key rejected");
})().catch(error => { console.error(error); throw error; });
```

`send 1000 to bob`의 UTF-8 길이는 **16바이트**다. 이 예제에서는 원문에 개행을 붙이지 않으며 256바이트 서명을 얻는다. 메시지 길이와 서명 길이를 별도로 확인한다. 검증 실패는 입력·키·서명·알고리즘이 맞지 않는다는 뜻이지 특정 공격자를 식별한 결과는 아니다.

서명 자체는 내용을 숨기지 않는다. 기밀성은 [암호화](/wiki/backend-services-topic-728d53616ab1/), 키와 도메인 연결은 [인증서](/wiki/backend-services-topic-9e0bf128cee0/), token 적용은 [JWT](/wiki/backend-services-jwt-d09d862aafdc/)로 이어진다.
