---
layout: default
title: SQL Injection
nav_order: 3
permalink: /wiki/backend-services-sql-injection-3d2e3a0d8df5/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/backend-services-sql-injection-3d2e3a0d8df5
projection_sha256: 8c787c1e5394c8cc63cceef1dacb4db471fc92e4d5994fba4fb0c7cc3ac65e7f
parent: 애플리케이션 보안
content_status: ready
public_parent_id: Wiki/security/application-security
grand_parent: Backend
---

# SQL Injection
{: .no_toc }

SQL Injection은 사용자 입력이 값의 경계를 벗어나 쿼리의 문법을 바꾸는 취약점이다. 로그인·검색 API에서 문자열을 이어 붙이는 대신 드라이버가 제공하는 파라미터 바인딩으로 SQL 구조와 값을 분리한다.

## 따옴표가 조건으로 해석되는 순간

고정된 `WHERE id = '…'` 안에 입력을 이어 붙이면 입력의 따옴표가 문자열을 닫을 수 있다. 예를 들어 `' OR '1'='1`은 결합된 조건을 항상 참으로 만든다. 특정 따옴표를 지우는 것으로 모든 문법·인코딩 변형을 다루기 어렵다. [OWASP 예방 지침](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

다음 Run 예제는 메모리 안의 가상 행 두 개만 사용한다. 취약한 SELECT와 바인딩한 SELECT의 결과를 비교하고 연결을 닫는다. 외부 DB·실제 사용자 데이터와 연결하지 않는다.

```run-python
import sqlite3

db = sqlite3.connect(":memory:")
try:
    db.execute("CREATE TABLE users (id TEXT)")
    db.executemany("INSERT INTO users VALUES (?)", [("alice",), ("bob",)])
    value = "' OR '1'='1"
    unsafe = db.execute("SELECT id FROM users WHERE id = '" + value + "'").fetchall()
    bound = db.execute("SELECT id FROM users WHERE id = ?", (value,)).fetchall()
    assert len(unsafe) == 2 and bound == []
    assert db.execute("SELECT id FROM users WHERE id = ?", ("alice",)).fetchall() == [("alice",)]
    print("concatenated rows:", len(unsafe))
    print("bound rows:", len(bound))
finally:
    db.close()
```

출력은 `concatenated rows: 2`, `bound rows: 0`이다. 바인딩한 입력은 전체가 하나의 값이므로 SQL 연산자로 실행되지 않는다. SQLite는 `?` 또는 named placeholder를 지원한다. 다른 드라이버의 `%s` 표기와 혼동하지 말고 사용하는 드라이버의 API를 따른다. [Python sqlite3](https://docs.python.org/3/library/sqlite3.html#how-to-use-placeholders-to-bind-values-in-sql-queries)

## 바인딩의 범위

테이블명·컬럼명·정렬 방향은 보통 값 placeholder로 대체할 수 없다. 외부 입력을 이미 정한 식별자·`ASC`/`DESC`와 대응시키는 allowlist가 필요하다. ORM이나 prepared statement를 사용하더라도 일부 raw SQL을 문자열로 결합하면 같은 문제가 남는다. 드라이버마다 서버 prepare·클라이언트 처리가 다르므로 모든 바인딩을 “서버가 먼저 컴파일하고 나중에 값을 삽입한다”로 설명하지 않는다.

DB 계정에는 필요한 테이블과 작업만 허용하고 입력의 형식·길이도 검증한다. 두 보조 수단이 값 바인딩을 대신하지는 않는다. 셸과 런타임의 같은 경계는 [애플리케이션 보안](/wiki/application-security/)에서 구분한다.
