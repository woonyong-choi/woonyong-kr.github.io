---
layout: project
title: "Redis 서버"
permalink: /projects/lrn-redis/
slug: "lrn-redis"
summary: "RESP2 파서부터 다섯 자료형·TTL·메모리 퇴출·AOF까지 직접 구현한 Key-Value 서버."
status: "active"
period: "2026-03-17 ~ 2026-09-22"
role: "팀 과제 · 개인 확장"
repo: "woonyong-choi/lrn-redis"
repo_url: "https://github.com/woonyong-choi/lrn-redis"
repo_ref: "2092d8ffec701f6542af336852f9d5329906aee9"
readme_url: "https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/README.md"
concepts:
  - title: "Redis"
    url: "/wiki/redis/"
  - title: "Hash Table"
    url: "/wiki/computer-science-topic-c3f2953a97c2/"
  - title: "입출력 다중화"
    url: "/wiki/computer-systems-network-topic-5022e4b7c883/"
nav_exclude: true
render_with_liquid: false
generated_by: scripts/sync-projects.mjs
---

<!-- 생성물입니다. 정본은 woonyong-choi/lrn-redis 의 README.md 입니다. 수동 편집하지 마세요. -->

Redis가 명령을 받아 저장하고 재시작 뒤에도 값을 복구하는 방식을 이해하려고, RESP2 파서부터 다섯 자료형·TTL·메모리 퇴출·AOF/snapshot까지 직접 구현한 Python Key-Value 서버입니다. 실제 Redis 7.4.9와 응답을 대조해 검증합니다.

## 버전업된 모습

**결과: 테스트 104개 통과 · Redis 7.4.9와 53개 명령 응답 53/53 일치 · 같은 기계 native redis 대비 1.2~1.7배** (`make test`, `make compare`, `make bench` — 상세는 [검증](#검증)).

팀 과제(2026-03)에서는 여러 명이 만든 자료구조·명령을 한 서버로 합치고 Docker 벤치마크로 돌리는 데 초점이 있었습니다. 이 저장소에서는 서버 하나를 `uv`로 바로 띄워 볼 수 있는 독립 실행 경로를 만들고, 범위를 단일 노드 KV로 좁힌 뒤 "재시작 후 복구가 맞는가"를 테스트가 증명하도록 바꿨습니다.

| 항목 | 이전 | 현재 | 재현 |
| --- | --- | --- | --- |
| Redis 대조 | 2026-07-31에 저장한 결과 파일(`benchmark/verified/*.json`) | 실행할 때마다 Redis 7.4.9 컨테이너와 대조하는 [compare.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/scripts/compare.py) | `make compare` |
| 실행 진입점 | Docker compose 중심 | `make setup / demo / test / serve` | [Makefile](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/Makefile) |
| 범위 | Pub/Sub 포함 (`17763f0`) | Pub/Sub 제거, 단일 노드 KV | `git show --stat 17763f0 \| grep pubsub` |
| 코드 변화 | — | 25 files, +665 / −2,796 (기준 `05f382d` 대비) | `git diff --shortstat 05f382d..dc5fb73` |

**어려웠던 점.** 어려운 부분은 "복구가 언제 정확히 보장되는가"의 경계였고, 구현 뒤에도 남아 있는 한계는 그대로 적어 둡니다. 선택의 근거와 측정값은 [docs/design.md](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/design.md)에 따로 적었습니다.

- **내구성 창.** AOF `always`는 응답 전에 fsync를 마치지만 `everysec`는 이벤트 루프·OS 지연에 따라 손실 창이 1초를 넘을 수 있고, `no`는 OS flush에 맡깁니다. snapshot은 임시 파일을 fsync한 뒤 교체하지만 디렉터리 fsync는 하지 않아 전원 차단 시 파일명 교체의 내구성은 보장하지 않습니다.
- **쓰기 실패.** 디스크 쓰기가 실패하면 오류를 반환하지만 이미 바뀐 메모리는 되돌리지 않습니다. 손상·잘린 AOF는 자동 절단하지 않고 시작을 실패시킵니다.
- **퇴출과 복구.** 퇴출된 최종 상태도 재시작 후 유지하며 이를 테스트로 확인합니다. 메모리 상한은 Python 객체의 논리적 추정치이며 OS RSS 상한이 아닙니다.
- **maxmemory를 켰을 때의 쓰기 비용.** 상한이 설정되면 변경마다 값 전체를 다시 재고 롤백용으로 복사하므로, 컬렉션 하나를 키우는 일이 제곱이 됩니다(ZADD 1,200회 기준 6 ms → 10.5 s). 기본값(상한 없음)에서는 회계를 건너뛰어 O(1)입니다. 측정과 해결 방향은 [design.md 5절](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/design.md#5-다음-병목--maxmemory-를-켜면-쓰기가-제곱이-된다).
- **Redis와 다른 경계.** 다른 자료형을 포함한 MGET의 WRONGTYPE 처리, Python 정수 범위 등은 Redis와 다릅니다.

## 구동모습

<picture>
  <source media="print" srcset="https://raw.githubusercontent.com/woonyong-choi/lrn-redis/2092d8ffec701f6542af336852f9d5329906aee9/docs/demo.png">
  <img src="https://raw.githubusercontent.com/woonyong-choi/lrn-redis/2092d8ffec701f6542af336852f9d5329906aee9/docs/demo.gif" alt="lrn-redis 데모: tmux 좌우 분할 — 왼쪽 서버, 오른쪽 redis-cli로 SET·GET·ZADD·ZRANGE·EXPIRE·TTL·만료 확인" loading="lazy">
</picture>
오른쪽 pane의 명령과 응답은 실제 실행 결과입니다. 왼쪽 서버 로그는 기동 메시지만 남기는 서버의 실제 출력입니다(명령별 로그는 없음). 재현: `make setup && bash scripts/demo_tmux.sh` (tmux·redis-cli 필요). 참고: `EXPIRE name 3` 뒤 약 1초 시점의 `TTL`이 이 화면에서는 `1`로 나왔으며, 시점에 따라 내림 값(0)이 나올 수 있습니다.

`make demo`의 실제 출력입니다. 장바구니 저장과 쿠폰 만료, AOF 재시작 복구, 메모리 퇴출 후 남은 키를 차례로 보여 줍니다.

```json
{"stage": "write+expiry", "cart": {"book": "2", "pen": "1"}, "coupon": null}
{"stage": "AOF restart", "cart": {"book": "2", "pen": "1"}}
{"stage": "eviction", "remaining": ["item:9"]}
```

## 메인 기술

`TCP RESP2 → 명령 분기 → 자료구조·TTL·메모리 제한 → 저장 → RESP2 응답` 순서로 이어집니다.

![자료구조 매핑: 키 공간 dict, Hash는 ChainedHashTable, Sorted Set은 dict+SkipList](https://raw.githubusercontent.com/woonyong-choi/lrn-redis/2092d8ffec701f6542af336852f9d5329906aee9/docs/figure.svg)

스택 나열이 아니라 직접 구현한 기법입니다. 각 항목은 무엇을 해결했는지, 어떻게 바꿨는지, 어떤 조건에서 얼마가 됐는지 순서로 적습니다. 측정 환경은 macOS arm64 / Python 3.12.12이며 수치는 전부 [bench-results.json](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/bench-results.json)에서 가져왔습니다.

**RESP2 파싱과 pipeline — 명령 하나마다 왕복하면 왕복 지연이 전부를 잡아먹는다**
분할 수신된 바이트를 버퍼에 이어 붙여 완성된 명령만 꺼내 처리하고, 한 번 읽은 청크에 담긴 명령을 모두 소화한 뒤에 한 번만 flush합니다. 입력 1 MiB·출력 256 KiB 상한과 느린 연결 timeout을 함께 둬서 한 연결이 이벤트 루프를 붙잡지 못하게 했습니다.
측정: 클라이언트 1개, 64바이트 SET 400회 x 3라운드. 명령마다 왕복 **20,088 ops/s → 50개씩 묶어 보내면 108,434 ops/s (5.4배)**. 재현 `make bench`.
[parser.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/protocol/parser.py) · [encoder.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/protocol/encoder.py) · [server.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/server.py)

**직접 만든 해시 테이블 — 필드 두세 개짜리 hash에 버킷 배열을 만드는 값이 아깝다**
Hash는 `(field, value)` 튜플 리스트로 시작해 32필드 또는 64바이트를 넘길 때 MurmurHash3 기반 체이닝 테이블로 한 번만 승격합니다. 키 공간에는 쓰지 않는데, 재 보니 CPython `dict`가 더 빨랐기 때문입니다.
측정: 키 공간 20,000, set 45% / get 45% / delete 10% 200,000회 in-process. **ChainedHashTable 1,330,225 ops/s → OpenAddressHashTable 756,661 ops/s (0.57배) → `dict` 8,124,659 ops/s (6.11배)**. 재현 `make bench`, 근거 [design.md 1절](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/design.md).
[hash_table.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/store/hash_table.py)

**Skip list 기반 Sorted Set — `ZRANK`를 O(log n)에 내려면 회전마다 서브트리 크기를 갱신해야 한다**
균형 트리 대신 skip list를 써서, 각 레벨 포인터가 건너뛴 칸 수(span)만 유지하면 탐색 경로의 span 합이 곧 rank가 되게 했습니다. span은 틀려도 범위 조회로는 드러나지 않고 `ZRANK`만 조용히 틀리므로, 모든 레벨의 span 누적이 레벨 0 위치와 일치하는지 확인하는 속성 테스트를 붙였습니다.
측정: `ZADD` + `ZREVRANGE 0 9` 반복, 멤버 500명. 같은 기계 native redis **11,674 ops/s 대비 6,755 ops/s (1.73배 느림)** — 아홉 시나리오 중 격차가 가장 큰 쪽이고, Python 레벨 skip list를 실제로 타는 유일한 시나리오입니다. 재현 `make bench`.
[skiplist.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/store/skiplist.py) · [속성 테스트](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/tests/test_datastructure_properties.py)

**TTL 만료 — 만료 키를 지우려고 매 주기 전체 키를 훑을 수는 없다**
읽을 때 확인하는 lazy 만료에, 100 ms마다 만료 예정 키에서 20개를 표본으로 뽑아 지우고 표본의 25% 이상이 만료였으면 한 번 더 도는 샘플링 패스를 더했습니다(최대 4회).
측정: **측정하지 않음.** 표본 추출이 여러 패스에 걸쳐 만료 키를 전부 제거하는지만 테스트로 고정했습니다. 재현 `.venv/bin/python -m pytest -k sampled_expiry`, 동작은 `make demo`의 `write+expiry` 단계.
[expiry.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/store/expiry.py)

**메모리 제한과 퇴출 정책 — 상한을 넘겼을 때 무엇을 버릴지 정하고, 그 상태가 재시작 뒤에도 같아야 한다**
`noeviction` / `allkeys-lru` / `allkeys-random` / `volatile-ttl` 네 가지를 두고, 퇴출로 사라진 키는 AOF에 `DEL`로 적어 재생 때 되살아나지 않게 했습니다. 상한이 없으면(기본값) 크기 측정 자체를 건너뜁니다.
측정: `ZADD` 1,200회. 정리 전에는 상한을 켜면 약 400멤버에서 **`ERR internal error: maximum recursion depth exceeded`로 실패 → 지금은 상한 끔 6.0 ms / 상한 켬 10,533 ms**. 상한을 켠 쪽이 여전히 제곱인 것이 이 저장소의 다음 병목입니다([design.md 5절](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/design.md)). 재현 `make bench`.
[memory.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/store/memory.py) · [datastore.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/store/datastore.py)

**AOF 기록·재생 + 자체 snapshot — 복구 경로가 쓰기 경로와 다른 코드면 그 차이는 재시작해야만 보인다**
값을 따로 직렬화하지 않고 RESP2 명령 바이트를 그대로 append하고, 복구는 같은 파서와 같은 dispatcher로 재생합니다. 비결정적인 명령은 기록 전에 정규화합니다(`EXPIRE` → 절대 시각 `PEXPIREAT`, `MSET` → 살아남은 값만 `SET`).
측정: **처리량은 측정하지 않음** (`make bench`는 양쪽 모두 영속성을 끄고 잽니다). 손상·잘린 AOF는 기동 실패, 디스크 쓰기 실패는 오류 반환 후 메모리가 디스크보다 앞선 상태로 남는 것을 테스트로 고정했습니다. 재현 `make test`, 복구 동작은 `make demo`의 `AOF restart` 단계.
[persistence.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/store/persistence.py)

**53개 명령 디스패치 — 명령이 늘 때마다 서버 루프를 건드리면 안 된다**
String·Hash·List·Set·Sorted Set 핸들러를 자료형별 모듈로 나누고 import 시점에 테이블 하나로 합쳐, 서버 루프는 이름으로 찾아 호출만 합니다. 핸들러는 예외를 그대로 던지고 dispatcher가 RESP 오류로 변환합니다.
측정: 53개 명령 전부에 대해 **성공 응답 1건 + 잘못된 인자 개수 1건 = 106건이 매 테스트 실행마다 통과**. 재현 `make test`.
[dispatcher.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/commands/dispatcher.py) · [datastore.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/store/datastore.py)

**차등 검증 — 내가 짠 기대값은 내 오해까지 같이 옮겨 적는다**
같은 setup과 같은 명령을 일회용 Redis 7.4.9 컨테이너와 이 서버에 보내고 응답을 비교합니다. 기대값을 손으로 적는 대신 진짜 Redis가 답을 정합니다.
측정: 53개 명령 **53 / 53 일치** (`redis:7.4.9-alpine`, digest 고정). 명령당 성공 경로 1건이며 에러 문자열·인자 경계는 대조하지 않습니다. 재현 `make compare` (Docker 필요).
[compare.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/scripts/compare.py)

**속성 기반 검증 — 내가 떠올린 입력만으로는 자료구조 불변식이 안 깨진다**
무작위 명령열을 참조 모델과 나란히 돌리며 매 단계 불변식을 확인합니다. 버킷 배치와 load factor, tombstone 회계, Hash 승격의 단방향성, ZSet의 정렬·rank·범위·score 구간이 대상입니다.
측정: 테스트 **82개 → 104개**, `protocol/store/commands/server` 커버리지 **79% → 87%** (`store/hash_table.py` 59% → 94%, `store/skiplist.py` 80% → 95%). 변형 주입으로 실효성 확인: skiplist delete의 span 갱신에서 `-1`을 빼면, 재사용한 tombstone 슬롯을 이중으로 세면 각각 실패합니다. 재현 `make test`.
[test_datastructure_properties.py](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/tests/test_datastructure_properties.py)

선택 근거, 버린 대안, 측정값, 다음 병목은 [docs/design.md](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/design.md)에 있습니다.

## 계획

- **증분 메모리 회계.** 각 명령이 더하고 뺀 바이트만 보고하고 롤백을 역연산으로 바꿔, `maxmemory`를 켠 쓰기 경로를 값 크기와 무관하게 만든다. 현재 이 저장소의 가장 큰 병목이다.
- 여러 클라이언트 동시 부하에서의 처리량을 아직 재지 않았다. 단일 클라이언트 순차 비교는 왕복 지연이 지배적이라 서버 내부 비용 차이를 가린다.
- snapshot 교체 뒤 디렉터리 fsync를 추가하면, 전원 차단 시 파일명 교체의 내구성을 검증하는 테스트를 더한다.
- MGET WRONGTYPE 같은 알려진 경계 차이를 `make compare` 대상 명령에 넣어 Redis와의 차이를 목록으로 관리한다.

## 링크

- [Redis Wiki](https://docs.woonyong.com/wiki/redis/) — 이 서버의 개념 정리
- [설계 노트](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/design.md) — 왜 이 자료구조인지, 버린 대안, 측정값, 다음 병목
- [서버 진입점](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/server.py)
- 배포된 데모 URL은 없습니다(로컬 실행 전용).

## 담당

**크래프톤 정글 팀 과제(원본: [woonyong-choi/mini-redis](https://github.com/woonyong-choi/mini-redis), 비공개)에서 시작했고, 종료 후 개인 저장소에서 계속 수정·학습·확장하고 있다.**

| 구분 | 내용 |
| --- | --- |
| 원본 저장소 | `woonyong-choi/mini-redis` (**비공개** — 접근 권한이 있어야 열립니다), 파생 기준 revision `05f382d` |
| 기간 | 2026-03-17 ~ 2026-03-19 (팀 커밋). 이후 같은 저장소에서 이어 간 개인 커밋(2026-07-31)까지가 기준 revision에 포함 |
| 팀 구성 | GitHub contributors 기준 4명(본인 포함) |
| 팀 시기 본인 담당 | **환경 변수 기반 벤치마크 러너와 로그 스트리밍, 데모 통합, 브랜치 병합(ChainedHashTable 반영 포함), README·발표 노트** — 커밋 기준 본인 18 / 팀원 12. 팀원은 만료 관리자·generic 명령·hash 저장소·자료구조·list 명령·string 명령 등을 나눠 구현 |
| 개인 확장 | `8266898`(2026-07-31) ~ 최근 — 2026-07-31: 키 단위 메모리 계측·쓰기 경로, Redis 7.4.9 차등 검증, 학습 아카이브, 산출물 정리(4커밋). 2026-09-08~11: 독립 KV 서버 실행 경로, 영속성·복구 검증, 테스트를 Redis 실행 계약 중심으로 재구성, 느린 연결·저장 실패·퇴출 후 복구 코드 보완(5커밋) |

개인 확장 범위 확인: `git log --author='choi woo-nyong' --author='우녕' --oneline 8266898^..HEAD`. 원본 과제·팀 코드와 개인 확장은 Git author와 diff로 구분하며 기존 저작권 표시는 소스에 유지합니다. 이전 설계 문서와 실험은 [정리 전 이력](https://github.com/woonyong-choi/lrn-redis/tree/4ade14e1ec3ec2072d1ae9b7940946652bfb905e)에 있습니다.

## 구동방법

Python 3.12와 [uv](https://docs.astral.sh/uv/getting-started/installation/)가 필요합니다. 의존성은 `requirements.lock`으로 고정합니다.

```sh
make setup      # .venv 생성 + 고정 의존성 설치
make demo       # 저장·만료·AOF 복구·퇴출 데모
make test       # pytest (104개)
make serve      # loopback:6380 에서 서버 실행 (Ctrl-C로 종료)
redis-cli -p 6380   # 별도 터미널의 클라이언트
make compare    # 선택: Docker의 Redis 7.4.9와 대표 응답 대조
make bench      # 선택: native redis-server와 지연 비교 + 해시 테이블 비교
```

기본 `make serve`는 영속성을 끈 상태로 시작합니다. 영속성 설정:

```sh
MINI_REDIS_APPENDONLY=true MINI_REDIS_AOF_FSYNC=always make serve
```

AOF 경로는 `MINI_REDIS_AOF_FILE`, snapshot은 `MINI_REDIS_RDB_ENABLED=true`, `MINI_REDIS_RDB_FILE`, `MINI_REDIS_RDB_SAVE_INTERVAL_SECONDS`로 설정합니다. AOF가 있으면 우선 복구하고 없으면 snapshot을 사용합니다. `make demo`·`make test`는 자신이 만든 프로세스만 종료합니다.

## 스펙

| 항목 | 내용 |
| --- | --- |
| 언어·런타임 | Python 3.12, asyncio + uvloop |
| 주요 라이브러리 | `uvloop` (실행) · `pytest`, `pytest-asyncio`, `hypothesis`, `redis-py` (검증) |
| 프로토콜 | RESP2 (RESP3 미지원), 기본 loopback:6380 |
| 대조 기준 | 응답 대조는 Redis 7.4.9 (Docker, `make compare`) · 지연 비교는 같은 기계의 native `redis-server` (`make bench`) |
| 범위 밖 | 복제·Cluster·Pub/Sub·Lua·트랜잭션·전체 Redis 옵션 문법. snapshot은 Redis RDB와 호환되지 않음 |

## 검증

[![CI](https://github.com/woonyong-choi/lrn-redis/actions/workflows/ci.yml/badge.svg)](https://github.com/woonyong-choi/lrn-redis/actions/workflows/ci.yml)

| 항목 | 결과 | 재현 |
| --- | --- | --- |
| 테스트 | **104 passed** (약 11s, 로컬) | `make test` |
| Redis 7.4.9 대조 | **53 / 53 응답 일치** | `make compare` (Docker 필요) |
| 지연 비교 | 같은 기계 native redis 대비 **1.24~1.73배** (단일 클라이언트 순차) | `make bench` → [결과](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/bench-results.json) |
| 데모 | 저장·만료·AOF 복구·퇴출 3단계 출력 | `make demo` |

`make test`는 명령 오류·분할 입력·느린 연결·손상된 AOF·fsync·디스크 쓰기 실패·퇴출 후 복구를 확인하고, 자료구조는 무작위 명령열을 참조 모델과 대조하는 속성 테스트로 검증합니다. `make compare`는 명령당 성공 경로 1건씩의 대조이며 전체 Redis 문법 적합성 검사가 아닙니다(에러 문자열·인자 경계는 대조하지 않습니다). `make bench`의 1.2~1.7배는 단일 클라이언트 순차 요청 기준이고 이 조건에서는 양쪽 모두 왕복 지연이 지배적입니다 — 동시 접속 처리량은 아직 재지 않았습니다.

## 참고

- 원본(비공개): `woonyong-choi/mini-redis`
- [설계 노트](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/design.md) · [측정 결과](https://github.com/woonyong-choi/lrn-redis/blob/2092d8ffec701f6542af336852f9d5329906aee9/docs/bench-results.json)
- [Redis Wiki](https://docs.woonyong.com/wiki/redis/)
- [RESP 프로토콜 명세](https://redis.io/docs/latest/develop/reference/protocol-spec/)
- 정리 전 이력: [`4ade14e`](https://github.com/woonyong-choi/lrn-redis/tree/4ade14e1ec3ec2072d1ae9b7940946652bfb905e)
