---
layout: default
title: Database
nav_order: 2
permalink: /wiki/data-storage/
publication_state: publish
has_toc: true
projection_id: Wiki/data-storage
projection_sha256: e0c6bb7a999cedfb2fc169cbfc482f2356cce6afa900e8960e9113f2768e9f18
parent: Data
content_status: ready
public_parent_id: Wiki/data
search_terms:
- 데이터베이스
- Database
- DB
---

# Database
{: .no_toc }

사용자 한 명의 이름, 나이, 소속 트랙을 저장하고 그 사용자에게 여러 주문을 연결한다고 하자. 아무 규칙 없이 파일에 적으면 나이 칸이 비거나 같은 사용자가 중복으로 기록될 수 있다. 주문이 누구의 것인지 찾으려면 파일 사이의 연결도 관리해야 한다. Database는 이런 데이터를 저장하고 조회하며, 여러 작업이 함께 일어날 때 지켜야 할 규칙을 관리한다.

저장소를 고를 때는 데이터의 모양과 조회 방법부터 살펴본다. 사용자와 주문을 연결해 자주 조회하는지, Key 하나로 값을 찾는지, 여러 변경을 한꺼번에 확정해야 하는지에 따라 필요한 기능이 달라진다.

## 관계형 모델과 NoSQL

관계형 DB는 데이터를 Table로 표현한다. Column의 의미와 타입을 정하고, Primary Key로 행을 식별한다. 주문의 `user_id`가 사용자의 `id`를 참조하도록 Foreign Key를 설정하면 존재하지 않는 사용자의 주문을 막을 수 있다. 제약은 선언한 범위에서 작동하므로, Table을 만들었다는 사실만으로 모든 업무 규칙이 보장되지는 않는다.

정해진 양식의 서류함을 떠올리면 이해하기 쉽다. 같은 칸을 가진 서류를 모으고, 빈칸이나 중복을 허용할지 규칙을 정한다. 새 항목이 필요하면 Schema를 변경한다. 다만 문자열을 숫자로 변환하는 방식과 타입 검사 규칙은 DB 제품과 설정에 따라 다르다.

NoSQL은 하나의 저장 방식이 아니라 관계형 모델과 다른 여러 모델을 묶어 부르는 이름이다.

| 모델 | 데이터를 바라보는 단위 | 예 |
| --- | --- | --- |
| Key-Value | Key로 식별하는 값 | Redis |
| Document | 관련 필드를 묶은 문서 | MongoDB |
| Wide-Column | Row Key와 Column 계열 | Cassandra |
| Graph | Node와 관계 | Neo4j |

Document 모델은 항목이 서로 다른 메모를 한곳에 모으는 방식과 비슷하다. 그렇다고 아무 규칙도 없는 것은 아니다. MongoDB는 필드의 타입과 값 범위를 검증하는 Schema Validation을 지원한다. 메모마다 항목이 다르더라도 필요한 필드에 Index를 만들 수 있으므로, 검색할 때 반드시 모든 문서를 읽어야 하는 것도 아니다. [MongoDB Schema Validation](https://www.mongodb.com/docs/manual/core/schema-validation/), [MongoDB Index](https://www.mongodb.com/docs/manual/indexes/)

## 같은 사용자를 저장하는 두 가지 모습

관계형 모델에서는 `users` Table의 `id`, `name`, `age`, `track`을 정의한 뒤 행을 넣는다. 아래 SQLite 예제는 Table 생성, 데이터 삽입, 조건 조회를 한 번에 실행한다. Run을 누르면 `age >= 25`를 만족하는 Bob의 행이 나온다. 조건을 `age >= 24`로 바꾸면 Alice도 함께 조회된다.

```run-sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER CHECK (age >= 0),
    track TEXT
);

INSERT INTO users (id, name, age, track)
VALUES (1001, 'Alice', 24, 'backend'),
       (1002, 'Bob', 27, 'data');

SELECT id, name, age, track
FROM users
WHERE age >= 25
ORDER BY id;
```

예상 조회 결과는 다음과 같다.

```text
1002|Bob|27|data
```

각 값이 들어갈 Column이 명시되어 있다. 이 예제의 `CHECK (age >= 0)`는 음수 나이를 거부하는 제약이다. 조건 조회를 바꾸는 것과 저장할 값의 범위를 제한하는 것은 서로 다른 일이다. 어떤 값을 거부할지는 실제 Schema와 DB의 검사 규칙으로 결정된다.

Key-Value 모델에서는 `user:1001`이라는 Key에 값을 넣고 같은 Key로 읽는다.

```text
SET user:1001 "Alice"
GET user:1001
```

이 예제는 이름만 저장한다. 나이와 트랙도 함께 보관하려면 문자열에 직렬화하거나 Redis Hash 같은 자료구조를 선택해야 한다. 단순한 GET만으로 값 안의 나이를 조건 검색할 수 있다고 가정해서는 안 된다.

기존 Redis 학습 기록에는 다음 문자열 조회 Handler가 있다. 마지막 반환부가 생략된 발췌이므로 독립적으로 실행하는 완성 코드는 아니다.

```python
# SW_AI-W03-redis/commands/string_cmds.py — cmd_get()
def cmd_get(store: DataStore, expiry: ExpiryManager, args):
    if len(args) != 1:                 # GET 은 키 1개만 받음
        return _wrong_number("get")
    obj = _string_object(store, args[0])  # 키로 값 객체를 바로 조회
    if obj is None:                    # 없으면 nil
        return None
    if isinstance(obj, RespError):     # 타입이 문자열이 아니면 에러
        return obj
    # ...값 바이트를 그대로 돌려줌
```

인자 수를 검사하고, Key로 객체를 찾은 다음, 없는 값과 잘못된 타입을 나누어 처리한다. Table의 행을 조건으로 찾는 SQL 예제와 달리 Key 자체가 조회의 출발점이다. 이 코드는 저장 모델의 차이를 읽기 위한 예제로, 현재 저장소의 실행 결과나 성능 측정값을 뜻하지 않는다.

| 사용자 | 관계형 Table의 행 | Key-Value의 항목 |
| --- | --- | --- |
| Alice | `1001, Alice, 24, backend` | `user:1001` → `"Alice"` |
| Bob | `1002, Bob, 27, data` | `user:1002` → `"Bob"` |

두 표현은 저장하는 정보량도 다르다. 속도를 비교하려면 같은 데이터를 같은 조건으로 조회하는 작업부터 정의해야 한다.

## Transaction과 확장성은 따로 확인한다

송금에서는 한 계좌에서 돈을 빼는 작업과 다른 계좌에 더하는 작업을 함께 확정해야 한다. Transaction의 원자성은 이 변경들을 모두 반영하거나 모두 취소하는 성질이다. 일관성은 정의한 제약을 만족하는 상태 사이에서 변경이 이루어진다는 뜻이다. 잘못 작성한 송금 로직을 DB가 자동으로 고쳐 준다는 의미는 아니다.

ACID 지원 여부를 관계형 DB와 NoSQL의 단순한 경계로 삼을 수는 없다. MongoDB도 여러 Document에 걸친 Transaction을 지원한다. 실제 보장 범위는 제품, 배포 구성, 격리 수준과 읽기·쓰기 설정을 확인해야 한다. [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/)

확장도 별개의 문제다. 서버 한 대의 자원을 늘리는 수직 확장과 데이터를 여러 서버에 나누는 수평 확장은 저장 모델 이름만으로 결정되지 않는다. 데이터를 어떻게 분할하고, 여러 분할 영역을 함께 읽거나 갱신할 때 어떤 비용을 치르는지 살펴봐야 한다. NoSQL이라는 이유만으로 항상 더 빠르거나 수평 확장이 쉬운 것은 아니다.

## 저장소를 선택할 때 확인할 것

사용자와 주문처럼 관계를 자주 연결하고 여러 행의 변경을 묶어야 한다면 관계형 모델과 Transaction 기능부터 검토할 수 있다. Key로 읽는 임시 값이나 캐시는 Key-Value 모델이 잘 맞을 수 있다. 문서 단위로 함께 읽고 갱신하는 데이터라면 Document 모델도 검토할 만하다.

선택을 구체화하려면 다음 질문에 답해야 한다.

- 어떤 Key와 조건으로 데이터를 조회하는가?
- 함께 확정하거나 취소해야 하는 변경은 어디까지인가?
- 중복, 누락, 오래된 값을 어느 범위까지 허용할 수 있는가?
- 데이터가 늘어나면 어디서 읽기·쓰기 비용이 커지는가?

본문 데이터는 관계형 DB에 두고 Redis를 캐시로 함께 사용할 수도 있다. 이때는 어느 쪽이 기준 데이터인지 정하고, 원본이 바뀌었을 때 캐시를 갱신하거나 만료시키는 방식까지 설계한다.

조회 경로는 [Index](/wiki/indexes/), 변경의 보장은 Transaction, 저장 구조의 구현은 [lrn-sql](/wiki/lrn-sql/)에서 이어서 다룬다.

관리형 DB의 접근 권한과 연결 구성은 [Aurora](/wiki/aurora/)에서 살펴본다.
