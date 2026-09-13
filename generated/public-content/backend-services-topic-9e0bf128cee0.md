---
layout: default
title: 인증서
nav_order: 6
permalink: /wiki/backend-services-topic-9e0bf128cee0/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-topic-9e0bf128cee0
projection_sha256: 1a593008056dd53373ed59f6b185887f0d765b643ecd47dd002e67cc56b1e0d9
parent: 암호학
content_status: ready
public_parent_id: Wiki/security/cryptography
grand_parent: 보안
ancestor: CS 기초
---

# 인증서
{: .no_toc }

X.509 인증서는 공개키와 주체·이름·유효 기간·용도 등을 발급자의 서명으로 연결한다. 웹의 도메인 검증 인증서는 해당 이름의 통제 권한을 확인한 결과이지 사이트의 선의나 사업 신뢰도 보증이 아니다.

## 인증서와 CSR

인증서는 `tbsCertificate`, 서명 알고리즘, 서명 값으로 구성된다. 서명의 대상은 인증서 전체를 자기 자신까지 포함해 해시한 값이 아니라 DER로 인코딩된 `tbsCertificate`다. `subject`와 `issuer` 이름이 같으면 self-issued이지만, 자기 공개키로 서명까지 검증되는 self-signed인지 별도 확인해야 한다. self-signed라는 이유만으로 암호가 약한 것은 아니며 신뢰 anchor로 선택했는지가 중요하다. [RFC 5280 §4](https://www.rfc-editor.org/rfc/rfc5280.html#section-4)

CSR에는 공개키와 요청 정보, 해당 개인키로 만든 서명이 들어간다. 개인키를 CA에 보내는 문서가 아니다. CA는 신청 권한을 검증하고 자기 정책에 맞는 새 인증서를 발급한다. CSR 파일 자체에 CA 서명을 덧붙여 그대로 반환하는 절차가 아니다. 이름 검증은 CN만이 아니라 SAN과 서비스 식별 규칙을 따른다. [OpenSSL req](https://docs.openssl.org/3.0/man1/openssl-req/), [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525.html)

## 도메인 검증 자동화

ACME는 인증서 신청·검증·발급 등을 자동화하는 프로토콜이다. Let's Encrypt의 HTTP-01은 80번 포트의 `/.well-known/acme-challenge/` 경로에서 token과 account key에 연결된 응답을 확인한다. DNS-01은 `_acme-challenge` TXT 값을 확인하며 wildcard 인증에 사용할 수 있다. 단순한 임의 파일·TXT가 아니라 해당 challenge와 연결된 값이 필요하다. [Let's Encrypt challenge](https://letsencrypt.org/docs/challenge-types/)

`certbot --nginx -d example.com` 같은 명령은 도메인 통제·DNS·접속 가능성·설치 권한·지원 플러그인 등이 준비된 운영 절차다. 발급이 끝난 뒤에도 서버가 새 인증서를 제공하는지와 자동 갱신 후 반영되는지를 확인해야 한다.

## 무료 발급과 운영 비용

인증서 가격과 서비스·키 관리·갱신·배포 비용은 다르다. 2026-09-13 공식 문서 확인 기준 비교다.

| 선택 | 발급·키의 위치 | 갱신 후 필요한 일 |
|---|---|---|
| Let's Encrypt | 무료 공개 CA, ACME client가 인증서와 키를 관리 | client 갱신과 서버 반영·reload 성공을 확인 |
| ACM 통합 서비스용 non-exportable public certificate | 해당 공개 인증서는 추가 발급 비용 없음, AWS 통합 경로에서 사용 | 관리형 갱신 조건과 실제 연결 상태를 확인, 서비스 사용료 별도 |
| ACM exportable public certificate | 발급·갱신 등에 비용 발생, 개인키·체인 내보내기 가능 | 갱신된 인증서를 직접 재배포하고 키 보호·반영 확인 |

ACM 공개 인증서를 모두 “AWS 내부 CA”라고 부르거나 “개인키 반출 불가”로 제한하면 안 된다. 외부 서버·EC2에 exportable 인증서를 설치할 수 있고, 그 배포 책임은 사용자에게 있다. [ACM exportable 인증서](https://docs.aws.amazon.com/acm/latest/userguide/acm-exportable-certificates.html), [ACM 가격과 유형](https://aws.amazon.com/certificate-manager/pricing/)

ACM DNS 검증은 서비스가 제시한 CNAME을 사용하는 경로가 있으며, DNS 검증과 갱신 자격 조건을 유지해야 한다. CNAME 하나를 등록하면 모든 인증서가 영구히 자동 갱신·배포된다는 계약은 아니다. [ACM DNS 검증](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html)

## 유효 기간과 유출 대응

Let's Encrypt의 기본 classic은 현재 90일이며 opt-in tlsserver는 45일, shortlived는 약 6일이다. 더 짧은 기본 수명 전환도 계획되어 있으므로 “항상 90일, 60일째 갱신”을 고정 규칙으로 두지 않는다. client의 갱신 기능과 현재 profile·유효 기간을 확인한다. [현재 수명과 계획](https://letsencrypt.org/docs/cert-lifetimes/), [인증서 profile](https://letsencrypt.org/docs/profiles/)

짧은 수명은 잘못 발급되거나 키가 유출된 인증서가 유효한 기간을 줄인다. 그러나 만료가 개인키 삭제나 과거 정보의 회수를 의미하지 않는다. 유출 시 폐기·키 교체·새 인증서 발급과 실제 배포를 처리해야 한다. 인증서가 교체되면 issuer와 유효 기간도 달라질 수 있으므로 서버가 현재 제공하는 인증서를 확인한다.

로컬 CSR·자기 서명·이름 검증 예제는 [인증서 검증](/wiki/computer-systems-network-topic-d7694af82c8f/), 신뢰 경로의 의미는 [PKI](/wiki/backend-services-pki-136c318c4542/)에서 확인한다.
