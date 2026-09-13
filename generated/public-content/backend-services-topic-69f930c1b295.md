---
layout: default
title: Hash
nav_order: 2
permalink: /wiki/backend-services-topic-69f930c1b295/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-topic-69f930c1b295
projection_sha256: 0e5d810477976b82caaa9168058d2ee5b39acc6571d67a14690fa6c5c003a574
parent: 암호학
content_status: ready
public_parent_id: Wiki/security/cryptography
search_terms:
- 해시
grand_parent: 보안
ancestor: CS 기초
---

# Hash
{: .no_toc }

암호학적 Hash는 입력을 고정 길이의 digest로 바꾼다. SHA-256의 결과는 32바이트이며 16진수로 표시하면 64글자다. 복호화해서 원문을 얻는 암호화와 다르다.

## 역상과 충돌

역상 저항성은 주어진 digest에 대응하는 입력을 찾기 어려운 성질이고, 제2역상 저항성은 주어진 입력과 digest가 같은 다른 입력을 찾기 어려운 성질이다. 충돌 저항성은 같은 digest를 갖는 입력 쌍을 찾기 어려운 성질이다. 입력 일부가 바뀌면 출력 비트가 크게 변하는 쇄도 효과는 이 성질들을 설명하는 관찰점이지, 한두 출력 비교만으로 암호학적 안전성을 증명하는 검사는 아니다.

```run-python
# Python 표준 라이브러리 hashlib — SHA-256 쇄도 효과 확인
import hashlib

print(hashlib.sha256(b"hello").hexdigest())
print(hashlib.sha256(b"hellp").hexdigest())  # 마지막 글자만 o → p
```

```text
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
fdd7585e08c4e2afd71dcabdb4636c89d557a3f42db9e2040c8bbd1708aa4ce7
```

서로 다른 두 digest를 얻는다. 같은 hash가 나왔다고 수학적으로 같은 원문임이 증명되는 것도 아니다. MD5·SHA-1에는 알려진 충돌 취약점이 있으므로 충돌 저항성이 필요한 새 보안 설계에 사용하지 않는다. [Python hashlib](https://docs.python.org/3/library/hashlib.html)

## 비밀키를 사용하는 HMAC

파일과 digest를 공격자가 함께 바꿀 수 있다면 단순 해시 비교로 발신자를 인증할 수 없다. HMAC은 공유 비밀키와 메시지로 인증 태그를 만든다. 키를 아는 양쪽 모두 태그를 만들 수 있으므로 제3자에게 어느 쪽이 작성했는지 증명하지는 못한다. [전자서명](/wiki/backend-services-topic-d031406d8def/)과 구별한다.

```run-python
import hashlib
import hmac

key = b"demo-shared-key"
message = b"send 1000 to bob"
tag = hmac.digest(key, message, "sha256")
assert hmac.compare_digest(tag, hmac.digest(key, message, "sha256"))
assert not hmac.compare_digest(tag, hmac.digest(key, b"send 9000 to bob", "sha256"))
assert not hmac.compare_digest(tag, hmac.digest(b"different-key", message, "sha256"))
print("tag bytes:", len(tag))
print("message and key changes rejected")
```

예제의 고정 키는 가상 값이며 실제 비밀키로 쓰지 않는다. 외부에서 받은 태그를 검증할 때 단순 `==` 대신 timing 차이를 줄이는 비교 API를 사용한다. `hexdigest()`의 문자열 길이는 원시 태그 바이트 길이의 두 배다. [Python hmac](https://docs.python.org/3/library/hmac.html)

## 비밀번호에는 느린 전용 해시

비밀번호 후보는 입력 공간이 작아서 SHA-256으로 저장해도 사전 대입이 빠르다. salt는 같은 비밀번호의 결과를 구분하고 사전 계산 재사용을 줄이지만 약한 비밀번호 자체를 강하게 만들지는 않는다. Argon2id 등 비밀번호용 알고리즘과 사용자별 salt, 환경에 맞는 비용 설정을 사용한다. 복호화가 필요 없는 로그인 검증과 원문을 다시 읽어야 하는 [대칭키 암호](/wiki/backend-services-topic-728d53616ab1/)의 용도를 구분한다. [OWASP 비밀번호 저장](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
