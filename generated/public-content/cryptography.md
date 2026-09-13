---
layout: default
title: 암호학
nav_order: 3
permalink: /wiki/cryptography/
publication_state: publish
has_toc: true
projection_id: Wiki/security/cryptography
projection_sha256: 8131c0770b8a612e65192f5b843399b528583463460422a9aeb99b186951b171
parent: 보안
content_status: ready
public_parent_id: Wiki/security
grand_parent: CS 기초
---

# 암호학
{: .no_toc }

암호학은 정보를 숨기는 일과 변경 여부·출처를 확인하는 일을 구분해서 다룬다. 메시지를 암호화했다고 보낸 사람까지 확인되는 것은 아니며, 해시 값이 같다고 그 값을 제공한 상대를 신뢰할 수 있는 것도 아니다. 먼저 보호할 대상과 공격자가 바꿀 수 있는 입력을 정해야 한다.

[대칭키 암호](/wiki/backend-services-topic-728d53616ab1/)는 공유한 비밀키로 내용을 보호한다. [공개키 암호](/wiki/backend-services-topic-463f9208fa66/)에서는 암호화·서명·키 합의의 목적과 키 사용법을 나누어 읽는다. [전자서명](/wiki/backend-services-topic-d031406d8def/)은 메시지와 서명키의 연결을 검증하며, 실제 신원과 권한은 키를 얻고 신뢰한 과정에 달려 있다.

## 키를 신뢰하는 과정까지 포함한다

통신 상대가 처음 보낸 공개키를 그대로 믿으면 중간자가 자기 키를 끼워 넣을 수 있다. [PKI](/wiki/backend-services-pki-136c318c4542/)와 인증서 검증은 암호 연산의 성공을 신뢰할 상대와 연결하는 과정이다. TLS 1.3은 상대 인증, 키 합의, 이후 데이터 보호를 각 절차에 맞는 알고리즘으로 구성한다. [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.html)

알고리즘 이름이나 키 길이만으로 시스템의 보안을 판단하기는 어렵다. 키 생성·저장·교체, Nonce 재사용 방지, 오류 처리와 검증 실패 시의 동작까지 살펴야 한다. 새로운 암호 조합을 직접 만들기보다 검증된 프로토콜과 라이브러리를 사용하고, 필요한 보안 속성이 실제로 제공되는지 확인한다.
