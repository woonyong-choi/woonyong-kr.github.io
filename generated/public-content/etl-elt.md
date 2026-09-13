---
layout: default
title: 데이터 변환
nav_order: 4
permalink: /wiki/etl-elt/
publication_state: publish
has_toc: true
projection_id: Wiki/data/etl-elt
projection_sha256: 0b687df680c9f2a09e160b90a6bb218e5e4d466638fc2f7c6c1e4d6466129344
parent: 데이터 파이프라인
content_status: ready
public_parent_id: Wiki/data/data-pipelines
grand_parent: 데이터 엔지니어링
ancestor: Data
---

# 데이터 변환
{: .no_toc }

ETL과 ELT는 목적 저장소에 데이터를 넣는 시점과 변환하는 시점의 순서가 다르다. Extract는 원본을 가져오는 일, Transform은 정제·표준화·결합하는 일, Load는 목적 저장소에 적재하는 일을 뜻한다.

## 변환을 어디서 수행하는가

ETL은 가져온 데이터를 먼저 변환한 뒤 목적 저장소에 넣는다. 저장할 때부터 정해진 Schema와 품질 조건을 맞추거나, 민감한 값을 제거한 데이터만 전달해야 할 때 고려할 수 있다. 이때도 재처리를 위해 원본을 별도의 제한된 영역에 보관할 수 있다. ETL이라는 이름이 원본 보관을 금지하는 것은 아니다.

ELT는 원본에 가까운 데이터를 목적 저장소에 먼저 넣고 그 안의 연산 기능으로 변환한다. 같은 원본에서 여러 결과를 만들거나 변환 규칙을 바꾸어 다시 계산하기 좋다. 다만 원본이 저장됐다는 이유만으로 분석용 데이터가 준비된 것은 아니다. 접근 권한, 보존 기간과 이용자에게 공개할 데이터의 검증을 구분해야 한다.

## 저장 비용만으로 고르지 않는다

변환에 필요한 연산을 어느 환경에서 수행할 수 있는지, 전송량과 처리 지연이 어느 정도인지, 어떤 정보를 저장해도 되는지를 함께 고려한다. 기존 저장소의 기능과 운영 부담도 선택에 영향을 준다. “관계형 DB는 ETL, 클라우드는 ELT”처럼 제품 종류만으로 고정하지 않는다.

어느 쪽이든 잘못된 입력과 Schema 변경을 감지하고, 같은 데이터를 다시 처리할 때의 키와 충돌 정책을 정해야 한다. 원본 보관부터 검증·Transaction·재실행을 연결한 예제는 [데이터 파이프라인](/wiki/data-pipelines/)에서 실행해 볼 수 있다.
