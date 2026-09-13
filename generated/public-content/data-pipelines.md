---
layout: default
title: 데이터 파이프라인
nav_order: 3
permalink: /wiki/data-pipelines/
publication_state: publish
has_toc: true
projection_id: Wiki/data/data-pipelines
projection_sha256: 6b495876cdcd2fbf665971a43e5f5136d76a05ece88fb7fe5363c54739a6d728
parent: 데이터 엔지니어링
content_status: ready
public_parent_id: Wiki/keywords/data-topic-8ec2c985292b
grand_parent: Data
---

# 데이터 파이프라인
{: .no_toc }

데이터 파이프라인은 데이터를 가져와 사용할 수 있는 형태로 만들고 다음 저장소나 서비스로 전달하는 처리 흐름이다. 한 번 성공하는 것만으로 충분하지 않다. 같은 데이터를 다시 받거나 중간 단계가 실패했을 때도 결과를 설명할 수 있어야 한다.

예를 들어 관측소별 측정값을 주기적으로 받는다면, 응답이 도착한 시각과 실제 측정 시각이 다를 수 있다. 지난 측정값이 다시 오거나 수정된 값이 뒤늦게 도착하기도 한다. 네트워크 재시도와 데이터 중복을 같은 문제로 처리하면 행을 잃거나 같은 값을 여러 번 저장하기 쉽다.

## 가져온 데이터와 사용할 데이터를 구분한다

수집 단계에서는 응답의 성공 여부와 형식을 확인하고 원본을 보관한다. 이후에는 필드 이름과 타입, 시간대와 단위를 맞추고 업무 규칙을 검사한다. 변환한 결과만 남기면 잘못된 값이 처음부터 원본에 있었는지, 변환 중에 생겼는지 구분하기 어렵다.

처리 순서는 다음처럼 읽을 수 있다.

1. 수집한 응답의 상태와 구조를 확인한다.
2. 원본과 수집 시각·출처를 보관한다.
3. 타입·시간대·결측값을 정규화한다.
4. 키 충돌과 값의 범위를 검사한다.
5. 검증한 데이터를 Transaction으로 적재한다.
6. 원본, 변환 규칙과 실행 결과를 연결한다.

여기서 검증은 우회 가능한 참고 단계가 아니다. 적재할 수 없는 데이터는 실패 원인과 함께 격리하거나 해당 Batch를 중단하도록 정책을 정한다. 원본 보관은 민감 정보의 접근 권한과 보존 기간도 함께 정해야 한다.

행마다 값이 올바르더라도 응답 전체가 비었거나 관측소 하나가 빠졌을 수 있다. 예상하는 대상과 기간, 최소 건수 같은 완전성 조건도 확인한다. 검사를 통과했다는 사실은 정한 품질 조건을 만족한다는 뜻이며, 현실의 측정값이 절대적으로 정확하다는 보장은 아니다. 모델 학습 데이터와 RAG의 Embedding 색인을 만들 때도 입력의 이런 차이가 뒤의 결과에 영향을 준다.

모든 파이프라인이 ETL인 것은 아니다. [데이터 변환](/wiki/etl-elt/)에서는 목적 저장소에 넣기 전 변환하는 ETL과 적재 후 변환하는 ELT를 비교한다. 어느 방식을 쓰더라도 잘못된 데이터를 이용자에게 노출하지 않도록 검증 경계를 두어야 한다.

## 결측값과 잘못된 값은 다르다

측정값의 `null`이나 제공자가 정한 결측 표시는 “측정값이 없다”는 뜻일 수 있다. `-3`, `12.5`, `unknown`을 모두 결측으로 바꾸면 원본의 오류와 형식 차이가 사라진다. 먼저 제공자의 계약을 정하고 그 계약에 맞는 값만 변환한다.

중복도 같은 키라는 이유만으로 앞의 행을 남겨서는 안 된다. 값까지 같은 재전송인지, 서로 다른 값을 가진 충돌인지 구분한다. 아래 예제는 `(station_id, measured_at)`가 같고 값도 같으면 한 행으로 합친다. 같은 Batch 안에서 값이 다르면 어느 쪽이 최신인지 알 수 없으므로 전체 적재를 중단한다.

## 원본부터 재실행까지 한 번에 따라가기

다음은 외부 API 없이 실행하는 작은 관측값 예제다. 실제 대기질 서비스의 규격이 아니며, `pm10`의 정수 범위 0–1000도 이 예제에서 정한 입력 조건이다. 필드 누락은 오류로, `null`과 `-`는 결측으로 처리한다. 시간에는 UTC offset이 필요하다.

임시 파일에 JSON 원본을 저장한 뒤 읽어 변환하고 SQLite에 적재한다. 실행이 끝나면 임시 파일과 DB는 사라진다.

```run-python
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory


def normalize(row):
    if not isinstance(row, dict) or not {
        "station_id", "measured_at", "pm10"
    }.issubset(row):
        raise ValueError("필수 필드가 없습니다")
    station = row["station_id"]
    if not isinstance(station, str) or not station.strip():
        raise ValueError("station_id가 비어 있습니다")
    timestamp = row["measured_at"]
    if not isinstance(timestamp, str):
        raise ValueError("measured_at은 문자열이어야 합니다")
    moment = datetime.fromisoformat(timestamp)
    if moment.utcoffset() is None:
        raise ValueError("측정 시각에 UTC offset이 필요합니다")
    timestamp = moment.astimezone(timezone.utc).isoformat()
    value = row["pm10"]
    if value is None or value == "-":
        value = None
    elif isinstance(value, str) and re.fullmatch(r"[0-9]+", value):
        value = int(value)
        if not 0 <= value <= 1000:
            raise ValueError("pm10 범위를 벗어났습니다")
    else:
        raise ValueError("pm10은 정수 문자열 또는 결측 표시여야 합니다")
    return station.strip(), timestamp, value


def load_batch(db, rows):
    by_key = {}
    for raw in rows:
        row = normalize(raw)
        key = row[:2]
        if key in by_key and by_key[key] != row:
            raise ValueError("같은 측정 키에 서로 다른 값이 있습니다")
        by_key[key] = row
    before = db.total_changes
    with db:
        db.executemany("""
            INSERT INTO observation VALUES (?, ?, ?)
            ON CONFLICT(station_id, measured_at) DO UPDATE
            SET pm10 = excluded.pm10
            WHERE observation.pm10 IS NOT excluded.pm10
        """, by_key.values())
    return db.total_changes - before


def stored(db):
    return db.execute("SELECT * FROM observation ORDER BY 1, 2").fetchall()


sample = {"station_id": "A", "measured_at": "2026-09-13T09:00:00+09:00",
          "pm10": "30"}
rows = [sample, dict(sample), dict(sample, station_id="B", pm10="-")]
with TemporaryDirectory() as directory, closing(sqlite3.connect(":memory:")) as db:
    raw_path = Path(directory) / "raw.json"
    raw_path.write_text(json.dumps(rows), encoding="utf-8")
    raw_rows = json.loads(raw_path.read_text(encoding="utf-8"))
    db.execute("""
        CREATE TABLE observation (
            station_id TEXT NOT NULL,
            measured_at TEXT NOT NULL,
            pm10 INTEGER CHECK(pm10 BETWEEN 0 AND 1000),
            PRIMARY KEY (station_id, measured_at)
        )
    """)
    first = load_batch(db, raw_rows)
    initial = stored(db)
    repeated = load_batch(db, raw_rows)
    assert first == 2 and repeated == 0 and stored(db) == initial
    print(f"first: {first}, repeated: {repeated}")
    changed = load_batch(db, [dict(sample, pm10="31")])
    assert changed == 1
    print("corrected:", stored(db))
    stable = stored(db)
    for bad_rows in [
        [dict(sample, station_id="C"), dict(sample, pm10="-3")],
        [sample, dict(sample, pm10="32")],
    ]:
        try:
            load_batch(db, bad_rows)
        except ValueError as error:
            assert stored(db) == stable
            print("rejected:", error)
        else:
            raise AssertionError("잘못된 Batch가 적재됐습니다")
```

첫 실행은 두 행을 넣고, 같은 원본을 다시 처리하면 변경 수는 0이다. 다음 Batch의 수정값은 A의 측정값만 31로 바꾼다. 잘못된 값이나 같은 키의 충돌이 있는 Batch는 검증 단계에서 거부하므로, 함께 들어 있던 C도 저장되지 않는다.

입력 검사는 `ValueError`로 실패를 전달한다. `assert`는 예제 결과를 확인하는 용도다. Python의 `-O`에서는 `assert`가 제거될 수 있으므로 입력 검증 자체를 여기에 맡기지 않는다. [Python assert의 동작](https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement)

## UPSERT가 보장하는 범위를 정한다

예제의 Primary Key가 같은 측정 키의 중복 저장을 막는다. SQLite의 `excluded`는 넣으려던 새 값을 가리키며, 마지막 `WHERE`는 값이 다를 때만 UPDATE한다. 이 때문에 같은 입력을 다시 적용하면 저장된 상태와 변경 수가 유지된다. 이 구문은 모든 SQL 제품에 공통인 표준 문법은 아니다. [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)

여기서는 나중에 성공한 Batch의 값이 앞의 값을 대체한다. 수정 뒤 옛 원본을 다시 적재하면 값이 되돌아갈 수 있다. 제공자가 수정 순서나 버전을 준다면 새 버전만 반영하는 조건이 필요하고, 그런 정보가 없다면 충돌을 처리할 별도 정책이 필요하다. 같은 입력의 재실행과 서로 다른 입력의 도착 순서는 다른 문제다.

DB Transaction은 DB 안의 적재를 묶는다. API 호출, 원본 파일 저장, 메시지 발행까지 함께 되돌려 주지는 않는다. `total_changes`도 이 예제의 DB 변경 수이며 원본의 수집 성공 건수나 전체 처리 보장으로 읽어서는 안 된다.

## 다시 처리할 수 있는 근거를 남긴다

원본을 보관할 때는 출처·수집 시각과 변환 규칙의 버전을 함께 연결한다. 실행 기록에는 어느 입력을 처리했는지, 검증에서 몇 건이 거부됐는지, 어디까지 적재했는지를 남긴다. 이 관계가 데이터 계보다.

원본이 같아도 변환 규칙, 시간대 설정과 외부 참조 데이터가 바뀌면 결과가 달라질 수 있다. 재현성을 확인하려면 같은 입력과 규칙으로 같은 결과를 얻는지 비교한다. 재실행 안전성은 그 결과를 다시 적용해도 허용하지 않은 중복이나 부수 효과가 생기지 않는지 따로 확인한다.
