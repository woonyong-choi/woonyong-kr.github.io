---
layout: default
title: PKI
nav_order: 7
permalink: /wiki/backend-services-pki-136c318c4542/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-pki-136c318c4542
projection_sha256: 1131f5ebbc15c9f75486c3e351617e3cfac97c3c7b31f2b82eee69b5ec901e36
parent: 암호학
content_status: ready
public_parent_id: Wiki/security/cryptography
grand_parent: 보안
ancestor: CS 기초
---

# PKI
{: .no_toc }

PKI는 인증서·인증 기관·정책·키 관리로 공개키와 신원의 연결을 관리하는 체계다. 암호 연산이 맞아도 처음 받은 공개키가 실제 상대의 것인지 확인하지 않으면 중간자가 자기 키로 통신을 가로챌 수 있다.

## 신뢰의 출발점

trust anchor는 검증을 시작할 때 이미 신뢰하는 공개키와 관련 정보다. 일반적인 웹 PKI에서는 브라우저·운영체제 정책에 따라 신뢰하는 루트를 사용하고 서버가 제공한 인증서 경로를 검증한다. 서버가 보내 준 루트를 그대로 믿는 것이 아니다. [RFC 5280 인증 경로 검증](https://www.rfc-editor.org/rfc/rfc5280.html#section-6)

| 사용 장면 | 공개키 신뢰를 시작하는 방법 | 주의점 |
|---|---|---|
| 일반적인 웹 TLS | 사전에 신뢰한 루트까지 인증 경로 검증 | 서명뿐 아니라 이름·기간·용도·정책을 확인 |
| SSH 호스트 키 | 미리 배포한 키/CA 또는 첫 확인 후 known_hosts에 기록 | 첫 확인을 독립 경로로 대조해야 TOFU의 첫 접속 위험을 줄임 |
| GnuPG/OpenPGP | 직접 확인, Web of Trust 등 선택한 trust model | 사용자 ID의 유효성과 다른 사람의 키 인증 능력에 대한 신뢰를 구분 |

셋이 모두 RSA로 세션키를 감싸는 것은 아니다. SSH·현대 TLS의 키 합의와 파일 암호화의 디지털 봉투는 구현 경로가 다르다. 여기서 비교하는 것은 알고리즘의 동일성이 아니라 처음 신뢰하는 근거다.

## SSH의 첫 확인

처음 본 host key를 사용자가 승인해 저장하는 방식은 TOFU다. 이후 키가 다르면 이유를 확인한다. 새 서버·정상 키 교체·호스트명·known_hosts 변화도 가능하므로 경고 하나만으로 공격이나 안전을 확정하지 않는다. 거부·자동 추가·변경 키 처리에는 `StrictHostKeyChecking` 등의 설정이 영향을 준다. SSH CA와 사전 배포도 가능하므로 SSH의 유일한 신뢰 모델이 TOFU인 것은 아니다. [OpenSSH 설정](https://man.openbsd.org/ssh_config#StrictHostKeyChecking)

다음은 OpenSSH가 설치된 로컬 Shell에서 실행하는 예제다. 접속 없이 임시 공개키의 fingerprint만 확인한다. 암호 없는 시험용 개인키는 임시 디렉터리에서만 만들고 종료 시 제거한다.

```bash
set -eu
work=$(mktemp -d "${TMPDIR:-/tmp}/ssh-demo.XXXXXX")
trap 'rm -rf "$work"' EXIT
ssh-keygen -t ed25519 -N '' -C 'demo@example.test' -f "$work/key" -q
ssh-keygen -lf "$work/key.pub"
```

실행마다 공개키와 SHA-256 fingerprint는 달라진다. 이 fingerprint를 실제 서버 호스트 키와 연결해 확인한 것은 아니다. 별도 신뢰 경로로 얻은 값과 비교해야 한다.

## GnuPG의 보증 관계

Web of Trust에서는 키와 사용자 ID의 연결에 대한 인증 서명을 모으고, 인증자를 얼마나 신뢰하는지에 따라 유효성을 판단한다. 단순히 “친구가 서명했으므로 모두 신뢰”하는 자동 규칙은 아니다. GnuPG에는 `pgp`, `classic`, `tofu`, `direct` 등 여러 모델이 있으므로 사용 중인 설정을 확인한다. [GnuPG trust-model](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Configuration-Options.html#index-trust_002dmodel)

웹 인증서의 필드·발급은 [인증서](/wiki/backend-services-topic-9e0bf128cee0/), 클라이언트 검증은 [인증서 검증](/wiki/computer-systems-network-topic-d7694af82c8f/), handshake는 [TLS](/wiki/computer-systems-network-tls-7fbfe5b737cd/)에서 이어진다.
