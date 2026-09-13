---
layout: default
title: 인증서 검증
nav_order: 2
permalink: /wiki/computer-systems-network-topic-d7694af82c8f/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-d7694af82c8f
projection_sha256: 7ea529a00040075172f03427a4fe2aec74838e82825acf16019b57843dad7ce6
parent: TLS
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-tls-7fbfe5b737cd
grand_parent: 네트워크
ancestor: CS 기초
---

# 인증서 검증
{: .no_toc }

인증서를 받았다는 사실과 상대를 신뢰할 수 있다는 판단은 다르다. 클라이언트는 자신이 신뢰하는 anchor까지의 경로, 서명, 유효 기간, key usage·정책과 서비스 이름을 확인한다. 서버가 보낸 루트를 자동으로 신뢰해서는 안 된다. 폐기 확인의 방식·범위·실패 처리도 클라이언트 정책에 따른다. [RFC 5280 §6](https://www.rfc-editor.org/rfc/rfc5280.html#section-6)

## 이름과 키의 주인

웹 서비스의 DNS 이름은 SAN의 dNSName과 해당 이름 규칙으로 확인한다. CN만 일치하거나 issuer가 유명한 CA 이름이라는 이유로 성공은 아니다. 서버는 handshake의 개인키 소유 증명도 수행한다. 검증한 endpoint가 악성 서비스를 운영할 가능성은 별도다. [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525.html), [TLS](/wiki/computer-systems-network-tls-7fbfe5b737cd/)

## 로컬 인증서와 이름 불일치

다음 예제는 OpenSSL 3.x가 설치된 로컬 터미널에서 실행한다. `example.test` 시험 인증서를 임시 디렉터리에서 만들고, **이 명령 안에서만** 신뢰 anchor로 명시한다. 시스템·브라우저 trust store에 설치하지 않는다. 키·CSR·인증서는 종료 시 제거된다.

```bash
set -eu
work=$(mktemp -d "${TMPDIR:-/tmp}/cert-demo.XXXXXX")
trap 'rm -rf "$work"' EXIT
openssl req -new -newkey rsa:2048 -nodes -keyout "$work/key.pem" \
  -out "$work/request.csr" -subj '/CN=Local Demo' \
  -addext 'subjectAltName=DNS:example.test' 2>/dev/null
openssl req -in "$work/request.csr" -noout -verify
openssl x509 -req -in "$work/request.csr" -signkey "$work/key.pem" \
  -copy_extensions copy -days 1 -out "$work/cert.pem" 2>/dev/null
openssl x509 -in "$work/cert.pem" -noout -subject -issuer -ext subjectAltName
openssl verify -check_ss_sig -CAfile "$work/cert.pem" \
  -verify_hostname example.test "$work/cert.pem"
if openssl verify -CAfile "$work/cert.pem" -verify_hostname wrong.test \
  "$work/cert.pem" >"$work/rejected.txt" 2>&1; then
  echo 'unexpected hostname acceptance' >&2
  exit 1
fi
echo 'wrong hostname rejected'
```

올바른 이름에서는 `OK`, 다른 이름에서는 실패해야 한다. subject와 issuer가 `Local Demo`인 것과 SAN의 `example.test`를 구분해서 본다. CSR 서명·인증서 서명·이름 검증은 서로 다른 검사다. 이 예제는 공인 CA 발급·실제 사이트 검증·브라우저 폐기 정책을 검증하지 않는다. [OpenSSL req](https://docs.openssl.org/3.0/man1/openssl-req/), [OpenSSL verify](https://docs.openssl.org/3.0/man1/openssl-verify/)

## 연결 도구의 출력 읽기

`openssl s_client`에서 `Verify return code: 0`을 보았다고 브라우저 검증을 모두 통과했다고 설명하지 않는다. 사용하는 trust store·hostname 검증 옵션·실패 시 중단 옵션을 확인해야 한다. OpenSSL의 `-servername`은 SNI 설정이며 hostname 검증 옵션이 아니다. 실제 운영 확인은 대상과 검증 조건을 정한 별도 작업이다. [OpenSSL s_client](https://docs.openssl.org/3.0/man1/openssl-s_client/)

발급·갱신과 CSR의 역할은 [인증서](/wiki/backend-services-topic-9e0bf128cee0/), HTTPS가 보호하는 통신 경계는 [HTTPS](/wiki/computer-systems-network-https-ee0e61165ec4/)에서 다룬다.
