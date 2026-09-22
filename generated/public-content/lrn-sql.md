---
layout: default
title: SQL 엔진 구현
nav_order: 15
permalink: /wiki/lrn-sql/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/minidb
projection_sha256: 0816d1de4a31495ce5939f583839074a5cc21ecb70bb994d9fc2caa5331ca2ae
parent: Database
content_status: ready
public_parent_id: Wiki/data-storage
search_terms:
- SQL
- lrn-sql
- MiniDB
- minidb
- SQL 엔진 구현
- SQL Engine
grand_parent: Data
---

# SQL 엔진 구현
{: .no_toc }

`SELECT`로 요청한 행이 파일에서 돌아오기까지는 문장 해석, 실행 계획, Index 탐색과 Page 읽기가 이어진다. lrn-sql은 이 경로를 C로 구현한 학습 저장소다. SQL 문법 자체는 SQL에서 다루고, 여기서는 문법이 저장 구조와 만나는 지점을 살펴본다.

정글 팀 과제에서 출발했으며, 최우녕이 개인 주도로 대부분 직접 구현한 학습 프로젝트다. 실제 사용 가능한 실행 범위와 설치 방법은 [lrn-sql README](https://github.com/woonyong-kr/lrn-sql/blob/913de5c610250326527105eec633ef6e293af7cb/README.md)에서 확인한다.

## 기여와 판단

- 인덱스 선택 · 2026-08-02: heap scan으로 처리하던 `id` 범위를 B+Tree 리프 순회로 연결했다. [범위 스캔 변경](https://github.com/woonyong-kr/lrn-sql/commit/c1049b0a02f15660fdb80568524eeed48ff27aa8)
- 저장 경로: SQL 실행, 행의 slot, B+Tree의 위치 참조, Pager의 pin·dirty 관리가 만나는 경계를 구현했다. [Pager 코드](https://github.com/woonyong-kr/lrn-sql/blob/913de5c610250326527105eec633ef6e293af7cb/src/storage/pager.c)
- 동시 접근: engine·row·range lock과 page latch를 구분하고 문장 종료 시 잠금을 해제한다. 범용 다중 문장 트랜잭션이나 WAL 복구를 뜻하지 않는다. [SQL 실행과 잠금](https://github.com/woonyong-kr/lrn-sql/blob/913de5c610250326527105eec633ef6e293af7cb/src/db.c)
- 성능 분석 · 2026-08-02: 반복되는 heap 탐색과 REPL의 잠금 누적을 줄이는 변경을 비교했다. [INSERT 후속 변경](https://github.com/woonyong-kr/lrn-sql/commit/993d4d873aeeaa08aae2a9de3d3dadc55123ea5d), [측정 조건과 한계](https://github.com/woonyong-kr/lrn-sql/blob/913de5c610250326527105eec633ef6e293af7cb/docs/benchmark-postgres.md)

## 요청에서 저장소까지

`src/sql/parser.c`는 문장을 해석하고, `planner.c`와 `executor.c`는 실행할 작업과 데이터 접근 경로를 연결한다. `src/storage/bptree.c`는 정렬된 Key의 탐색과 분할을, `table.c`는 Page 안의 행 저장을 맡는다. `pager.c`는 상위 계층과 파일 I/O 사이에서 Page Cache를 관리한다.

Week 7의 디스크 엔진에 Week 8에서 HTTP 서버를 연결했다. 서버는 `db_execute()`를 호출하고 REPL은 `main.c`에서 parse 뒤 `execute()`를 직접 호출한다. 두 경로는 `execute()`를 공유하며, 문장 실행 뒤 각각 잠금을 해제한다. HTTP 요청을 읽는 Socket FD, DB 파일을 가리키는 FD, DB 내부의 `page_id`는 역할이 다르다. FD는 열린 파일이나 Socket을 가리키는 프로세스의 핸들이고, `page_id`는 DB 파일을 나눈 페이지의 번호다.

B+ Tree와 Pager도 서로 다른 질문에 답한다. B+ Tree는 Key로 행의 위치를 찾고, Pager의 Hash Table은 `page_id`로 메모리에 올라온 Frame을 찾는다. 쿼리 결과가 잘못됐을 때 이 계층을 나눠 읽으면 문장 해석, 탐색 경로, 저장된 바이트 중 어디를 확인할지 좁힐 수 있다. [서버 진입점](https://github.com/woonyong-kr/lrn-sql/blob/913de5c610250326527105eec633ef6e293af7cb/src/db.c), [REPL 진입점](https://github.com/woonyong-kr/lrn-sql/blob/913de5c610250326527105eec633ef6e293af7cb/src/main.c)

저장 구조를 설계할 때는 프로그램을 다시 열어도 해석할 수 있는 값을 파일에 남겨야 한다. Week 7 설계안은 단일 `.db` 파일의 Header에 Page 크기, Index의 루트와 Heap의 시작 Page, 다음에 부여할 `id` 등을 남기도록 정했다. 행의 위치도 실행 중인 포인터 대신 `row_ref(page_id, slot_id)`로 기록한다. 이 위치 표현과 Page 안의 바이트 배치는 [B+ Tree 구현](/wiki/data-b-tree-99b399d45cdf/)에서 이어서 살펴본다.

## Queue를 잠그는 동안 요청 전체가 멈추는가

초기 Thread Pool의 `worker_func()`는 Mutex를 얻어 원형 Queue에서 작업을 꺼내고 `head`와 `queue_size`를 갱신했다. 그다음 Mutex를 놓고 `handle_client()`를 호출했다. 따라서 이 Mutex가 직렬화하는 구간은 Queue를 읽고 바꾸는 부분이다. 다른 Worker가 SQL을 처리하는 시간까지 잠금을 유지하는 구조는 아니다. [초기 Thread Pool 구현](https://github.com/woonyong-kr/lrn-sql/blob/c90442dfbd48a54ad481325f524c78cc89a223e8/src/server/thread_pool.c)

Queue가 비면 Worker는 `not_empty`에서 기다리고, Queue가 가득 차면 제출자는 `not_full`에서 기다린다. `pthread_cond_wait()`는 기다리는 동안 Mutex를 놓고, 반환하기 전에 다시 얻는다. 깨어났다는 사실만으로 조건이 충족되지는 않으므로 `if` 대신 `while`로 Queue 상태와 종료 조건을 다시 검사한다. [Condition Variable의 대기 규칙](https://man7.org/linux/man-pages/man3/pthread_cond_wait.3p.html)

이 버전에서 Queue의 작업 하나는 HTTP 요청 하나가 아니라 연결 하나였다. `handle_client()`가 Keep-alive 연결의 다음 요청까지 기다리므로, 유휴 연결도 Worker를 차지할 수 있었다. 이후 `af3b5b5`에서 연결마다 Thread를 만드는 방식으로 바뀌었다. 이력에 따라 통계의 의미도 달라진다.

| 구현 | 동시 사용량 | `total_processed`가 세는 것 |
| --- | --- | --- |
| 초기 Thread Pool (`c90442d`) | 연결을 맡고 있는 Worker 수 | `handle_client()`가 끝난 연결 수 |
| 연결별 Thread (`49ac2cb`) | 현재 활성 연결 수 | `db_execute()`를 호출해 처리를 마친 SQL 요청 수. SQL의 성공 여부와는 별개다. |

현재 서버는 활성 연결을 최대 128개로 제한하고, Socket의 수신 대기에 `SO_RCVTIMEO` 30초를 설정한다. 이 값은 Socket I/O의 대기 제한이며 HTTP 요청 전체가 30초 안에 끝난다는 보장은 아니다. 종료할 때는 연결 FD에 `shutdown()`을 호출하고 활성 연결이 0이 된 뒤 공유 DB 자원을 정리한다. [현재 서버 코드](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/src/server/server.c), [Socket Timeout의 범위](https://man7.org/linux/man-pages/man7/socket.7.html)

## 공유하는 데이터에 따라 잠금도 달라진다

SQL이 읽기 요청이어도 Pager 내부에서는 `pin_count`, 최근 사용 순서와 통계가 바뀐다. `pread()`와 `pwrite()`에 파일 Offset을 직접 전달하면 공유 파일 위치를 움직이지 않고 I/O를 요청할 수 있지만, 이것이 메모리에 있는 Cache Metadata의 잠금을 대신하지는 않는다.

| 장치 | 보호하는 대상 |
| --- | --- |
| Pager Mutex | Frame의 검색·할당, Pin 수, 최근 사용 순서와 Dirty 상태 등의 Metadata |
| Pin | 사용 중인 Frame이 교체되지 않게 하는 조건 |
| Page Latch | 페이지 바이트를 읽거나 바꾸는 동안의 접근 |
| Engine RWLock | 스키마 변경과 다른 문장 실행 사이의 경계 |
| Row Lock과 Range Lock | 행 ID나 ID 범위에 대한 논리적 읽기·쓰기 충돌 |

특히 Pin과 Latch는 구분해야 한다. Frame이 메모리에 남아 있어도 다른 Thread가 그 안의 바이트를 바꿀 수 있다. 반대로 바이트 접근을 끝냈더라도 Pin을 놓지 않으면 교체 대상이 되지 않는다. [Pager의 Frame과 접근 함수](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/include/storage/pager.h)

`engine_lock`은 `CREATE TABLE`과 `DROP TABLE`에 쓰기 잠금을, 나머지 문장에 읽기 잠금을 사용한다. 여기서 `rdlock`은 `SELECT` 전용이라는 뜻이 아니다. `INSERT`, `UPDATE`, `DELETE`도 함께 진입할 수 있으며, 더 좁은 범위의 충돌은 다른 잠금이 맡는다.

Lock Table에는 행의 실제 값 대신 잠근 ID 또는 ID 범위, 소유 Thread, `S`·`X` 모드가 들어간다. 같은 대상을 읽는 `S`끼리는 호환되지만 `X`가 끼면 충돌을 검사한다. Scan 방식의 수정·삭제는 후보 ID를 정렬해 잠근 뒤 조건을 다시 확인하고, 시스템이 관리하는 `id`의 변경은 거절한다. 소유자별 잠금 목록은 문장 실행 후 `lock_release_all()`로 해제할 대상을 찾는 데 쓰인다.

대기 중인 Writer가 있으면 새 Reader를 늦추는 정책도 있다. 다만 문장 단위의 Row·Range Lock을 여러 문장에 걸친 범용 트랜잭션이나 모든 조건식의 Phantom 방지로 확대해 해석할 수는 없다. Frame Hash와 소유자 목록은 탐색 범위를 줄이고, Heap의 Snapshot은 Callback을 실행하는 동안 Latch를 오래 붙잡지 않도록 한다. 성능 차이는 실제 접근 패턴과 경합 조건을 함께 측정해야 한다. [동시성 제어 코드](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/src/server/lock_table.c), [Scan의 실행 경로](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/src/sql/executor.c)

## 페이지를 기록하는 것과 장애를 복구하는 것

Pager는 Dirty Frame이 64개 이상이면 사용 중이지 않은 오래된 Frame부터 기록해 16개까지 줄이는 것을 목표로 한다. 남은 Dirty Frame이 모두 Pin된 상태라면 목표에 도달하지 못해도 멈춘다. 기록한 Frame은 Cache에 남아 있으므로, 이 Flush와 교체를 같은 동작으로 보면 안 된다.

정상 종료에는 남은 Dirty Page와 Header를 기록하고 `fsync()`를 호출하는 경로가 있다. 하지만 여러 Page를 바꾸는 SQL 문장 전체의 원자적 Commit이나 중간 장애 이후의 복구를 구현한 것은 아니다. 현재 기록 경로는 짧은 쓰기와 I/O 오류 처리까지 성공을 확인해 전달하는 구조도 아니므로, 함수 호출이 있다는 사실만으로 저장 완료를 보장할 수 없다. WAL 기반 장애 복구나 MVCC를 갖춘 범용 DBMS와는 이 경계를 구분해 읽어야 한다. [Pager의 기록 경로](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/src/storage/pager.c)

삭제 후 공간을 다시 쓰는 과정도 저장 설계의 일부다. Heap Slot을 빈 상태로 바꾸면서 해당 Index Key도 제거해야 이후 조회가 삭제된 행을 가리키지 않는다. 빈 Slot이나 Page를 재사용하는 것과 파일 전체를 압축하는 작업은 구분한다. B+ Tree의 병합은 부모·자식 관계와 정렬 조건을 유지하도록 노드를 합치는 과정이므로, 메모리 할당기가 관리하는 Heap 주소 공간에서 인접한 빈 블록을 합치는 규칙을 그대로 적용할 수는 없다.

대량 삽입을 살펴볼 때는 진행 출력, 빌드 설정, 삽입할 Heap Page를 찾는 비용도 나눠 봐야 한다. `last_heap_page_id`와 빈 Slot을 재사용할 가능성을 나타내는 힌트는 Heap 탐색을 줄이기 위한 장치다. 과거 실행 시간은 그때의 코드와 입력, 빌드 조건에 속한다. 저장소의 PostgreSQL 비교 기록 역시 내구성 설정과 실행 조건이 다르다는 한계를 명시하므로, 특정 수치만 떼어 운영 DB보다 빠르다는 결론으로 사용하지 않는다. [벤치마크의 조건과 한계](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/docs/benchmark-postgres.md)

## 테스트가 실행되는 경로

테스트 하네스는 테스트를 준비하고 실행한 뒤 결과를 판정하는 장치다. 폴더를 만들거나 `harness`라는 이름을 붙이는 것만으로 테스트가 실행되지는 않는다. 실행할 프로그램, 입력, 기대 결과, 실패와 Timeout의 기준, 사용한 자원을 정리하는 방법이 연결돼 있어야 한다.

이 저장소에서는 `Makefile`의 `test`, `test-step0`, `test-step1`, `test-step2`가 C 테스트 프로그램을 빌드하고 실행하며, `test-all`이 이를 묶는다. 서버를 시작하고 종료하는 부분과 응답·DB 결과를 판정하는 부분을 구분하면, 서버가 뜨지 않은 것인지 SQL 결과가 틀린 것인지 확인하기 쉽다. [테스트 진입점](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/Makefile)

저장 경로의 검증 기준은 재열기 뒤의 행 조회와 다음 ID 복원, 삭제 뒤의 조회와 재삽입, B+ Tree 분할·병합 뒤의 검색 정합성이다. 성능 비교는 이 결과가 맞는지 확인한 뒤 수행한다. 같은 100만 행이라도 Page 크기, 행 크기, 채움률과 Cache 상태가 달라지면 비용이 달라지므로, ID를 찾는 Index Lookup과 다른 필드를 비교하는 Table Scan을 조건과 함께 기록해야 한다.

서버 테스트를 확장할 때는 정상 쿼리뿐 아니라 문법 오류, 빈 요청, 긴 요청, 동시 요청, 재시작 뒤의 조회를 입력 사례로 둘 수 있다. 각 사례에는 응답 형식과 행 수 같은 판정 기준을 두고, 실행 과정에는 준비 완료 확인, Timeout, 재시도 횟수와 종료 조건을 둔다. 실행 결과와 오류를 같은 형식으로 남기면 성공률과 소요 시간을 비교할 수 있다. 이 구성은 테스트를 설계하는 예이며, 열거한 모든 검증이 현재 하네스에 구현됐다는 뜻은 아니다.

`docs/sql/12-test-harness-plan.md`의 통과 개수는 2026년 4월 22일의 기록이다. 현재 코드를 재실행한 결과와 구분해야 한다.

## 코드와 구현 기록

- [lrn-sql](https://github.com/woonyong-kr/lrn-sql)
- [SQL 구현 설명](https://github.com/woonyong-kr/lrn-sql/tree/main/docs/sql)
