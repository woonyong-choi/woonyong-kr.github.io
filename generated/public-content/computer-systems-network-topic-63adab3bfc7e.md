---
layout: default
title: Journaling
nav_order: 8
permalink: /wiki/computer-systems-network-topic-63adab3bfc7e/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-63adab3bfc7e
projection_sha256: 0e654df90739ca2396c53446a5a80dadf543fb482025e8420470d274e1cf0dfc
parent: 파일 시스템
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-2f8a1e4d5189
search_terms:
- 저널링
grand_parent: OS
ancestor: CS 기초
---

# Journaling
{: .no_toc }

파일을 만들려면 빈 공간을 사용 중으로 바꾸고, inode에 위치와 길이를 쓰고, Directory에 이름을 연결해야 한다. 이 갱신들이 서로 다른 블록에 놓이면 한 번의 쓰기로 끝나지 않는다. 중간에 시스템이 꺼졌을 때 일부 변경만 남는 문제가 **Crash Consistency**, 즉 장애 뒤의 일관성 문제다.

Journaling은 복구에 필요한 변경을 별도 로그에 기록하고, 완성된 트랜잭션을 식별해 다시 적용하는 방식이다. 모든 데이터가 언제나 최신 상태로 남는다는 뜻은 아니다. 무엇을 저널에 기록하는지, 언제 커밋을 완료하는지, 저장 장치가 어떤 쓰기 순서를 보장하는지를 함께 봐야 한다.

## 커밋과 원래 위치에 쓰는 시점은 다르다

Redo 방식의 저널은 변경 후의 블록 내용과 그 블록을 쓸 위치를 보관한다. 일반적인 흐름은 세 단계로 나눌 수 있다.

1. 변경할 블록의 복구 정보를 저널에 기록한다.
2. 필요한 기록과 순서가 확보되면 커밋을 완료한다.
3. 변경을 원래 위치에 반영하는 Checkpoint를 수행하고, 더는 복구에 필요하지 않은 저널 공간을 재사용한다.

커밋 전에는 저널에 일부 기록이 있어도 완성된 트랜잭션으로 재생하지 않는다. 커밋 뒤에는 원래 위치에 일부만 반영됐더라도 남아 있는 로그를 재생해 갱신을 마칠 수 있다. 따라서 커밋은 ‘원래 위치의 모든 블록을 이미 다 썼다’는 뜻과 다르다.

이때 커밋처럼 보이는 바이트가 있다는 사실만으로 충분하지는 않다. 트랜잭션의 순번, 필요한 기록의 완전성, 설정된 Checksum과 쓰기 순서를 확인해야 한다. 오래된 커밋이나 손상된 로그를 새 변경으로 재생하면 복구 과정이 데이터를 망가뜨릴 수 있다. 512바이트 Sector도 모든 장치와 전원 장애에서 원자적 쓰기를 보장하는 단위는 아니다.

## 중단 위치를 바꾸며 복구해 보기

다음 예제는 Bitmap, inode, 파일 데이터를 각각 하나의 값으로 줄인 **Full Redo 모델**이다. 작업 하나가 끝날 때 그 값은 저장된 것으로 가정하고, 그 사이에서 실행을 중단한다. Python 메모리로 저장 상태를 표현하므로 실제 디스크의 전원 차단, 쓰기 재정렬이나 Torn Write를 재현하는 코드는 아니다.

```run-python
import hashlib
import json

before = {"bitmap": False, "inode": None, "data": "old bytes"}
after = {"bitmap": True, "inode": 7, "data": "new bytes"}
keys = tuple(after)

def checksum(records):
    encoded = json.dumps(records, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()

def interrupted_state(completed_steps):
    home = before.copy()
    records = {}
    commit = None
    operations = (
        [("log", key) for key in keys]
        + [("commit", None)]
        + [("checkpoint", key) for key in keys]
        + [("release", None)]
    )
    for operation, key in operations[:completed_steps]:
        if operation == "log":
            records[key] = after[key]
        elif operation == "commit":
            commit = checksum(records)
        elif operation == "checkpoint":
            home[key] = after[key]
        else:
            records.clear()
            commit = None
    return home, records, commit

def recover(home, records, commit):
    result = home.copy()
    if commit is not None:
        if set(records) != set(keys) or checksum(records) != commit:
            raise ValueError("journal integrity check failed")
        result.update(records)
    return result

for step in range(9):
    home, records, commit = interrupted_state(step)
    restored = recover(home, records, commit)
    replayed_again = recover(restored, records, commit)
    state = "old" if restored == before else "new" if restored == after else "mixed"
    print(f"stop={step}, restored={state}, replay stable={restored == replayed_again}")

home, records, commit = interrupted_state(4)
records["data"] = "damaged bytes"
try:
    recover(home, records, commit)
except ValueError as error:
    print("damaged journal:", error)
```

0~3단계에서 멈추면 커밋이 없어 이전 상태가 남는다. 4단계에서 커밋을 마치면 이후 복구 결과는 새 상태다. 5~6단계는 원래 위치에 일부만 기록된 시점이지만, 복구가 나머지를 채워 혼합 상태를 없앤다. 8단계에서는 이미 원래 위치에 모든 변경이 있어 로그를 비워도 새 상태가 남는다.

같은 블록 이미지를 다시 적용하므로 두 번째 재생도 결과를 바꾸지 않는다. 반면 커밋 뒤에 로그 내용을 바꾸면 Checksum 검증이 실패한다. 예제는 이를 복구 성공으로 숨기지 않고 오류로 알린다. 실제 파일 시스템은 저널 형식과 손상 위치에 따른 복구 정책을 더 갖고 있다.

## 데이터까지 기록할지, Metadata만 기록할지

ext4의 모드는 저널에 포함할 범위와 데이터 쓰기의 순서를 구분한다.

| 모드 | 저널의 기록 범위 | 데이터와 커밋의 관계 |
|---|---|---|
| `data=journal` | 파일 데이터와 Metadata | 저널을 거쳐 원래 위치에 반영한다. 데이터도 복구에 사용할 기록이 남는다. |
| `data=ordered` | Metadata | 관련 데이터를 원래 위치에 쓴 뒤 Metadata의 저널 커밋을 완료한다. |
| `data=writeback` | Metadata | Metadata 커밋과 파일 데이터 쓰기 사이에 Ordered 모드의 순서 제약을 두지 않는다. |

Ordered 모드에서 중요한 것은 **관련 데이터가 Metadata 커밋보다 먼저 기록되는 순서**다. Metadata를 저널에 쓰는 모든 I/O가 반드시 데이터 I/O보다 늦게 시작한다는 뜻으로 바꾸면 지나치게 강한 설명이 된다. 또한 Metadata의 일관성이 유지돼도 응용 프로그램이 방금 쓴 파일 내용 전체가 원하는 시점의 상태로 남는 것은 아니다.

Full Journaling은 기록량이 늘 수 있지만 항상 가장 느리다고 단정할 수는 없다. 쓰기 패턴, 묶어서 커밋하는 정도, 읽기와 쓰기의 경합에 따라 결과가 달라진다. 모드를 ‘빠름·중간·느림’이나 ‘안전성 최고·최저’만으로 줄이면 실제 보장 범위를 놓치게 된다. [ext4의 데이터 모드와 커밋 순서](https://www.kernel.org/doc/html/latest/admin-guide/ext4.html)

## ext4의 Journal을 읽는 데 필요한 구조

ext4는 JBD2를 이용해 저널을 관리한다. 내부 저널은 보통 inode 8번의 숨겨진 파일에 있지만, 별도 장치의 External Journal도 가능하다. ‘저널은 언제나 inode 8번’이라고 고정해서 다른 구성을 해석하면 안 된다.

Descriptor Block은 뒤따르는 변경 블록을 원래 어느 위치에 쓸지 설명한다. Commit Block은 해당 트랜잭션을 완성된 것으로 식별하는 기록이다. Revoke Record는 복구 때 이전 로그를 특정 블록에 다시 적용하지 않도록 하는 정보다. Revoke를 언제나 커밋 뒤에 추가하는 단계처럼 그리거나, 두 버전 중 새 버전을 표시하는 단순한 덮어쓰기 표식으로 설명하지 않는다.

JBD2의 디스크 필드는 Big Endian이며, ext4의 다른 Metadata와 바이트 순서가 다르다. 저널을 직접 분석할 때는 매직과 블록 타입뿐 아니라 UUID, Sequence와 활성 Checksum 형식까지 확인해야 한다. [JBD2의 로그 형식](https://www.kernel.org/doc/html/latest/filesystems/ext4/journal.html)

JBD2의 Handle은 한 작업이 변경할 수 있는 버퍼 수를 Credit으로 예약한다. 여러 작업이 하나의 커밋 트랜잭션으로 묶일 수 있으므로 `write()` 호출 하나가 곧 Commit Block 하나라는 관계는 성립하지 않는다. ext4의 Superblock 초기화와 복구 경로, JBD2의 `jbd2_journal_commit_transaction()`은 파일 시스템 작업과 실제 저널 쓰기를 연결하는 구현 지점이다. [Linux Journalling API](https://www.kernel.org/doc/html/latest/filesystems/journalling.html)

Fast Commit을 사용하는 ext4는 일부 Metadata 변경을 재구성할 최소 차이를 별도 영역에 기록할 수도 있다. 이 기능이 켜진 경로까지 언제나 전체 Metadata Block 이미지를 기록한다고 일반화하지 않는다. 여기의 실행 모델은 기본 Redo 경계를 이해하기 위한 것으로, Fast Commit 형식을 구현하지 않는다. [ext4 Fast Commit](https://www.kernel.org/doc/html/latest/filesystems/ext4/journal.html)

## 저널 크기와 쓰기 비용 계산하기

1TiB 파일 시스템에 128MiB 저널이 있다고 가정하자. 이는 크기를 비교하기 위한 값이며, 모든 ext4 파일 시스템의 기본 저널 크기가 아니다.

```run-python
filesystem_bytes = 1 << 40
journal_bytes = 128 << 20
sector_bytes = 512
block_bytes = 4096

print("filesystem sectors:", filesystem_bytes // sector_bytes)
print("journal sectors:", journal_bytes // sector_bytes)
print("journal blocks:", journal_bytes // block_bytes)
print(f"journal ratio: {journal_bytes / filesystem_bytes * 100:.6f}%")
```

1TiB는 512바이트 Sector 2,147,483,648개이고, 128MiB는 Sector 262,144개 또는 4KiB Block 32,768개다. 비율은 약 `0.012207%`다. `MB`와 `MiB`를 섞으면 이 계산과 표기가 맞지 않는다.

저널 전체 크기의 1/4을 최대 트랜잭션으로 고정하는 설명도 버전을 확인해야 한다. 예를 들어 **Linux v6.12**의 `jbd2_journal_get_max_txn_bufs()`는 `(j_total_len - j_fc_wbufsize) / 3`을 사용한다. 저널 관리 공간, Fast Commit과 Credit 계산이 있으므로 전체 Block 수에 임의의 비율을 곱한 값이 곧 응용 프로그램 한 번의 최대 쓰기 크기는 아니다. [Linux v6.12의 트랜잭션 한도 계산](https://github.com/torvalds/linux/blob/v6.12/fs/jbd2/journal.c)

Full Journaling에서 4KiB 데이터 Block 하나를 갱신하면 그 이미지가 저널과 원래 위치에 쓰일 수 있다. Descriptor와 Commit은 트랜잭션의 여러 변경이 공유하므로 데이터 Block마다 두 개를 더해 고정된 4배 쓰기로 계산하면 안 된다. Ordered 모드도 Metadata는 저널과 Checkpoint를 거치므로 쓰기 증폭은 Metadata 변경량과 Batching을 함께 측정해야 한다.

## 주기적 커밋과 fsync의 차이

ext4의 `commit` 설정은 실행 중인 트랜잭션이 커밋되기 전까지의 나이를 제한하며, 문서의 기본값은 5초다. 이것을 모든 파일 데이터가 5초 안에 영구 저장된다거나 전원 장애 시 최근 5초만 잃는다는 보장으로 읽으면 안 된다. Delayed Allocation과 Dirty 데이터의 Writeback 조건이 따로 있다. [ext4 커밋 간격](https://www.kernel.org/doc/html/latest/admin-guide/ext4.html)

응용 프로그램이 특정 시점의 저장 완료를 필요로 하면 `fsync()` 같은 동기화 경계를 사용한다. [Buffer Cache](/wiki/file-system-buffer-cache/)에 남은 관련 데이터와 Metadata를 기록하고, 필요한 저널 커밋과 장치 Flush를 마친 뒤 완료를 반환하는 경로가 필요하다. 정확한 단계는 파일 시스템과 현재 트랜잭션 상태에 따라 달라지며, 매번 새 Commit Block을 하나 쓰는 것으로 정의하지 않는다.

파일의 `fsync()`와 그 이름을 담은 Directory의 동기화 범위도 다르다. 새 파일 생성이나 이름 변경을 지속시키려면 Directory의 `fsync()`가 추가로 필요한 경우가 있다. 장치가 Flush나 FUA의 계약을 지키는지까지 포함해야 영속성을 판단할 수 있다. [Linux `fsync()`의 데이터·Metadata·Directory 범위](https://man7.org/linux/man-pages/man2/fsync.2.html)

## PintOS에서는 여러 직접 쓰기가 하나로 묶이지 않는다

[lrn-pintos의 `5afaa6d` 시점](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)에 확인한 기본 파일 시스템에는 Journal Transaction이 없다. `inode_write_at()`은 `disk_write()`에 직접 쓰기를 요청한다. `inode_create()`는 데이터 공간을 할당한 뒤 inode를 쓰고, 할당한 데이터 Sector를 차례로 0으로 채운다.

free map 파일이 열린 상태에서 공간을 할당한다면 Bitmap 쓰기도 이 과정에 포함된다. 파일 생성 전체에는 inode 자체를 위한 할당과 Directory 항목 추가도 있으므로, 데이터 할당·inode·초기화의 세 단계만을 전체 파일 생성의 모든 쓰기라고 보면 안 된다. [현재 inode 생성 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/inode.c)

inode를 기록한 뒤 데이터 초기화 전에 중단되면 inode에 위치는 남았는데 그 위치의 데이터가 초기화되지 않은 상태가 가능하다. 사용 중 표시만 남고 도달할 inode나 이름이 없다면 공간이 누수될 수 있다. 반대로 아직 참조할 수 있는 공간을 free map에서 먼저 비우면 다른 파일에 재할당될 위험이 생긴다. `inode_close()`에서 제거된 파일을 해제하는 경로와 `free_map_release()`도 서로의 갱신을 하나의 장애 복구 단위로 묶어 주지는 않는다.

이는 현재 소스의 쓰기 경계에서 판단한 위험이다. 실제 PintOS 디스크를 손상시켜 재현했다는 뜻은 아니다. 구현을 확장한다면 [저장 공간 관리](/wiki/computer-systems-network-topic-33acdcc0a664/)의 할당·해제, inode·Directory 갱신과 캐시 Writeback을 같은 복구 설계 안에서 다뤄야 한다.

## Guest의 장애와 Host의 장애를 나눠 관찰한다

PintOS의 `disk_write()`는 채널 Lock을 잡고 ATA PIO 쓰기 명령을 보낸 뒤 512바이트를 데이터 포트로 전달한다. 완료 인터럽트를 기다리지만, 여러 Sector의 파일 시스템 갱신을 하나로 묶는 Journal Commit을 만들지는 않는다. [PintOS의 디스크 쓰기](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/devices/disk.c)

QEMU v10.0.0의 `ide_sector_write()`는 블록 계층의 `blk_aio_pwritev()`로 쓰기를 전달한다. ATA Cache Flush는 별도의 `ide_flush_cache()`와 `blk_aio_flush()` 경로다. 이후 실제 요청 방식은 이미지 형식, Host 파일 또는 블록 장치, I/O Backend와 Cache 설정에 따라 달라진다. [QEMU v10.0.0의 IDE 쓰기·Flush](https://github.com/qemu/qemu/blob/v10.0.0/hw/ide/core.c)

이미지가 Host의 ext4 파일에 저장돼 있다면 Host의 Journaling은 그 파일 시스템의 일관성을 보호한다. **Guest PintOS가 수행한 여러 Sector 갱신을 Host가 하나의 파일 시스템 연산으로 이해해 묶어 주는 것은 아니다.** Guest 파일 시스템의 일관성과 Host 파일 시스템의 일관성은 서로 다른 범위다.

| 중단 상황 | 구분해서 봐야 할 상태 |
|---|---|
| Guest만 중단 | QEMU나 Host가 이미 받은 요청은 이후 완료될 수 있다. |
| QEMU 프로세스 종료 | 아직 제출·완료하지 않은 요청은 달라질 수 있지만, Host Page Cache까지 함께 사라지는 것은 아니다. |
| Host 전원 장애 | Host와 장치의 휘발성 캐시, Flush 완료와 전원 보호 조건이 영향을 준다. |

따라서 QEMU를 강제 종료하는 실험을 곧 실제 전원 차단 실험이라고 부르면 안 된다. 특정 쓰기 직후 중단해도 이미 제출된 I/O와 Host Cache 때문에 결과가 달라질 수 있다. 결정적인 실험에는 어느 계층에서 어떤 완료 상태 뒤에 중단할지를 고정하고, 쓰기 이력과 재시작 뒤의 내용을 함께 확인해야 한다. [QEMU Cache와 완료 응답](https://www.qemu.org/docs/master/system/invocation.html)

호출 순서를 읽는 데는 다음 GDB 명령을 사용할 수 있다. PintOS에 연결된 디버거에서 사용하는 관찰용 명령이며, 실제 크래시나 저장 완료를 검증하는 코드가 아니다.

```gdb
break disk_write if d == filesys_disk
commands
  silent
  printf "WRITE sector=%u\n", sec_no
  continue
end
```

출력은 Guest 드라이버에 요청이 들어온 순서를 보여 준다. 영구 저장된 순서와 동일하다고 단정하지 않는다. 복구 결과를 판단할 때는 이름, inode, 할당 상태, 파일 데이터를 함께 확인하고, 커밋하지 않은 변경과 유효하게 커밋된 변경을 구분해야 한다.
