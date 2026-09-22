---
layout: default
title: fsync
nav_order: 7
permalink: /wiki/file-system-fsync/
publication_state: publish
has_toc: true
projection_id: Wiki/computer-systems-network/os/file-system/fsync
projection_sha256: 76a6a535eb1e4cfae0492d0a999ada48922c43db510b4424cf041fdc198e1f27
parent: 파일 시스템
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-2f8a1e4d5189
search_terms:
- fdatasync
- O_SYNC
- O_DSYNC
- O_DIRECT
- FlushFileBuffers
- Directory fsync
- 파일 내구성
grand_parent: OS
ancestor: CS 기초
---

# fsync
{: .no_toc }

파일에 쓴 내용이 다시 읽힌다고 해서 전원이 꺼진 뒤에도 남는 것은 아니다. 읽기와 쓰기가 같은 Cache를 거치면 아직 메모리에만 있는 내용도 정상적으로 읽힌다. `fsync()`는 이 차이를 다룬다. 파일의 변경을 저장 장치로 동기화하고, 장치가 완료를 보고할 때까지 기다린다.

여기서는 Linux의 파일 동기화 API와 [lrn-pintos의 `5afaa6d` 시점](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)을 비교한다. 핵심 질문은 “쓰기가 끝났는가?”에서 한 걸음 더 나아간다. **어느 계층의 쓰기가 끝났고, 어떤 장애 뒤에도 남아야 하는가?**

## `write()` 다음에 남는 일

일반적인 Buffered File I/O에서는 프로그램의 데이터가 사용자 공간의 버퍼, 커널의 Page Cache, 장치의 Write-back Cache를 거쳐 저장 매체로 내려간다. 모든 I/O가 이 경로를 따르는 것은 아니다. Direct I/O, 동기 쓰기 옵션, 네트워크 파일 시스템에는 각각 다른 조건이 있다.

| 위치 | 쓰기 뒤에 남을 수 있는 상태 | 장애를 판단할 때 확인할 점 |
| --- | --- | --- |
| 프로그램의 버퍼 | C의 `FILE*`나 Python 파일 객체가 아직 OS에 넘기지 않은 데이터 | 프로세스 종료 전에 버퍼를 비웠는가 |
| 커널의 Page Cache | OS가 받아 둔 Dirty 데이터 | OS가 중단되기 전에 Writeback이 끝났는가 |
| 장치의 Write-back Cache | 장치가 받은 뒤 아직 저장 매체에 반영하지 않은 데이터 | Flush·FUA와 전원 보호 장치가 어떤 완료를 보장하는가 |
| 비휘발성 저장소 | 저장 장치가 영속적으로 보관하는 상태 | 장치와 파일 시스템이 약속한 동기화 조건을 지켰는가 |

`write()`는 요청한 길이보다 적은 바이트를 기록하고 성공할 수도 있다. 호출자는 반환값만큼 진행한 뒤 남은 데이터를 처리해야 한다. Buffered I/O의 쓰기 성공에는 이후 Writeback에서 발견되는 오류도 포함되지 않을 수 있다. [Linux `write(2)`](https://man7.org/linux/man-pages/man2/write.2.html)

사용자 공간의 버퍼와 커널의 Cache도 구분해야 한다. `fflush()`나 Python의 `file.flush()`는 먼저 라이브러리의 버퍼를 OS에 넘긴다. 그 뒤 `fsync()`로 파일을 동기화한다. 아직 라이브러리 안에 남아 있는 데이터를 파일 Descriptor의 `fsync()`가 대신 꺼내 주지는 않는다. [Python `os.fsync()`](https://docs.python.org/3/library/os.html#os.fsync)

## 무엇을 동기화하는가

| 호출·옵션 | 동기화 범위 |
| --- | --- |
| `fsync(fd)` | 파일 데이터와 수정된 파일 메타데이터 |
| `fdatasync(fd)` | 데이터와 그 데이터를 올바르게 다시 읽는 데 필요한 메타데이터 |
| `O_SYNC` | 각 쓰기가 데이터와 관련 파일 메타데이터의 동기화까지 마친 뒤 반환 |
| `O_DSYNC` | 각 쓰기에 데이터와 필요한 메타데이터의 동기화 완료 조건을 적용 |
| `O_DIRECT` | 커널 Cache의 영향을 줄이는 I/O 방식. 이 옵션만으로 영속성이 보장되지는 않음 |

`fdatasync()`가 메타데이터를 모두 생략하는 것은 아니다. 파일 크기가 늘면 새 범위를 다시 읽는 데 길이 정보가 필요하다. 따라서 Append하는 로그 파일도 크기 변경의 동기화가 필요하며, `fdatasync()`가 언제나 추가 I/O 없이 끝나는 것은 아니다. 수정 시각처럼 데이터 검색에 필요하지 않은 정보는 생략할 수 있다. [Linux `fsync(2)`](https://man7.org/linux/man-pages/man2/fsync.2.html)

`O_DIRECT`와 `O_SYNC`는 서로 다른 선택이다. 앞의 옵션은 Cache 경로를, 뒤의 옵션은 완료 조건을 바꾼다. Direct I/O에는 파일 시스템과 장치에 따른 정렬 제약도 있다. Cache를 우회한다는 이유만으로 DMA를 사용한다거나, 모든 상황에서 빠르거나 느리다고 결론 내릴 수는 없다. [Linux `open(2)`](https://man7.org/linux/man-pages/man2/open.2.html)

파일 하나를 넘어서는 호출로 `sync()`와 `syncfs(fd)`도 있다. Linux의 `sync()`는 파일 시스템 전체의 대기 중인 변경을 기록하고 I/O 완료를 기다린다. `syncfs(fd)`는 해당 Descriptor가 속한 파일 시스템에 범위를 한정한다. POSIX가 허용하는 조기 반환과 Linux의 실제 동작을 혼동하면 안 된다. Linux에서 완료를 기다리지 않던 동작은 1.3.20 이전의 이야기다. 또한 `sync()`는 파일별 실패를 반환값으로 알려 주는 수단이 아니다. [Linux `sync(2)`](https://man7.org/linux/man-pages/man2/sync.2.html)

어떤 API를 쓰든 실패를 처리해야 한다. `write()`가 성공한 뒤 `fsync()`에서 I/O 오류나 공간 부족이 드러날 수 있다. 성공을 반환한 경우에도 저장 장치와 Driver가 Flush·FUA 계약을 지킨다는 전제가 있다. API 반환값만으로 장치 결함이나 실제 전원 차단 시험까지 검증한 것은 아니다.

## 파일 내용과 파일 이름은 따로 남는다

새 내용으로 설정 파일을 교체할 때는 기존 파일을 바로 잘라 쓰는 대신 같은 디렉터리에 임시 파일을 만들 수 있다. 임시 파일의 쓰기를 마치고 동기화한 뒤, `rename()`으로 기존 이름을 교체하고 마지막으로 부모 디렉터리를 동기화한다.

이 순서는 두 종류의 변경을 다룬다. 파일의 `fsync()`는 내용과 파일 메타데이터를 다룬다. 이름이 어느 파일을 가리키는지는 Directory에 속하므로 부모 디렉터리의 동기화가 별도로 필요하다. 서로 다른 디렉터리 사이의 이동이라면 영향을 받는 디렉터리도 달라진다.

같은 파일 시스템에서 성공한 `rename()`의 원자성은 다른 실행 주체에게 이름 교체가 중간 상태로 보이지 않는다는 뜻이다. 이것만으로 전원 차단 이후의 이름 보존까지 설명할 수는 없다. [Linux `rename(2)`](https://man7.org/linux/man-pages/man2/rename.2.html)

다음 모델은 파일 내용과 Directory를 따로 저장한다. 자동 Writeback은 일어나지 않으며, 동기화하지 않은 변경은 장애 때 모두 사라진다고 가정한다. 실제 파일 시스템에서 가능한 결과 전체를 재현하는 모델은 아니다. 파일의 동기화만으로 이름 교체까지 보장할 수 없는 한 가지 경우를 보여 준다.

```run-python
class Storage:
    def __init__(self):
        self.files = {"old": b"old"}
        self.names = {"file.dat": "old"}
        self.saved_files = dict(self.files)
        self.saved_names = dict(self.names)

    def write_temp(self):
        self.files["new"] = b"new"
        self.names["file.tmp"] = "new"

    def fsync_file(self):
        self.saved_files["new"] = self.files["new"]

    def replace(self):
        self.names["file.dat"] = self.names.pop("file.tmp")

    def fsync_directory(self):
        self.saved_names = dict(self.names)

    def read_now(self):
        return self.files[self.names["file.dat"]].decode()

    def read_after_crash(self):
        inode = self.saved_names["file.dat"]
        return self.saved_files[inode].decode()


steps = ["write_temp", "fsync_file", "replace", "fsync_directory"]
for stop in range(len(steps) + 1):
    storage = Storage()
    for step in steps[:stop]:
        getattr(storage, step)()
    label = "시작" if stop == 0 else steps[stop - 1]
    print(f"{label:16} 현재={storage.read_now()} 장애 뒤={storage.read_after_crash()}")
```

`replace`까지 실행하면 현재 읽히는 내용은 `new`이지만, 이 모델의 장애 뒤에는 `old`가 읽힌다. `fsync_directory`까지 마쳐야 저장된 이름도 새 파일을 가리킨다. **다시 읽기 성공과 장애 뒤 복구 성공은 서로 다른 관찰이다.**

### 임시 디렉터리에서 직접 교체하기

아래 코드는 Python 3에서 실행할 수 있다. 생성한 임시 디렉터리 안에서만 파일을 교체하고, 실행이 끝나면 정리한다. Linux·macOS에서는 파일과 Directory의 `fsync()`를 실제로 호출한다. 브라우저의 Python에서는 가상 파일 시스템의 교체 결과만 확인하며, OS 동기화를 실행했다고 표시하지 않는다.

```run-python
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


def replace_example():
    virtual = sys.platform in {"emscripten", "wasi"}
    if not virtual and sys.platform not in {"linux", "darwin"}:
        print("이 실습의 OS 동기화 경로는 Linux·macOS를 대상으로 한다.")
        return

    with TemporaryDirectory(prefix="fsync-example-") as directory:
        root = Path(directory)
        target = root / "file.dat"
        temporary = root / "file.tmp"
        target.write_bytes(b"old\n")
        print("교체 전:", target.read_text().strip())

        with temporary.open("xb") as file:
            data = b"new\n"
            if file.write(data) != len(data):
                raise OSError("임시 파일에 전체 데이터를 쓰지 못했다.")
            file.flush()
            if not virtual:
                os.fsync(file.fileno())

        os.replace(temporary, target)
        if not virtual:
            directory_fd = os.open(root, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)

        assert target.read_bytes() == b"new\n"
        assert not temporary.exists()
        print("교체 후:", target.read_text().strip())
        if virtual:
            print("브라우저 가상 파일 교체 확인. OS fsync는 실행하지 않았다.")
        else:
            print("파일·Directory fsync 반환 확인. 전원 차단 복구 시험은 별도다.")


replace_example()
```

Directory의 동기화를 지원하지 않거나 I/O가 실패하면 예외가 발생한다. 실패를 성공으로 바꾸어 출력하지 않는다. 특히 `os.replace()` 뒤에 오류가 났다면 새 내용이 이미 보일 수 있으므로, 오류를 “교체 전으로 복구됐다”는 뜻으로 해석해서는 안 된다. 파일의 접근 권한·소유권·확장 속성까지 보존해야 하는 실제 설정 저장기에는 그 처리도 추가해야 한다.

이 실습의 확인 범위는 API 호출과 파일 교체다. macOS와 Linux의 저장 장치 동기화 조건을 같다고 가정하거나, 브라우저의 가상 파일 시스템을 실제 디스크로 해석하지 않는다. [Python의 `fsync()`·`replace()`와 플랫폼별 지원](https://docs.python.org/3/library/os.html)

## Linux와 Windows에서 완료를 기다리는 방식

Linux의 Dirty 데이터는 주기적인 Writeback, 메모리 회수, 명시적 동기화 등으로 기록될 수 있다. `dirty_writeback_centisecs`는 주기, `dirty_expire_centisecs`는 오래된 Dirty 데이터를 판단하는 기준이다. 예를 들어 각각 `500`, `3000`이면 5초 주기와 30초의 경과 시간을 뜻한다. “항상 30초 뒤에 저장된다”는 뜻은 아니다. Dirty 비율의 임계값도 전체 RAM 용량이 아니라 해당 계산에 쓰이는 가용 메모리를 기준으로 한다. 임계값과 Cache 교체는 [Buffer Cache](/wiki/file-system-buffer-cache/)에서 이어서 다룬다. [Linux VM 설정](https://www.kernel.org/doc/html/latest/admin-guide/sysctl/vm.html)

`fsync()`의 구현 경로는 파일 시스템별로 다르다. Linux v6.12의 ext4에서 Journal이 있는 경로는 먼저 `file_write_and_wait_range()`로 데이터 쓰기를 기다리고, `ext4_fsync_journal()`로 필요한 Transaction의 Commit을 처리한다. 추가 Barrier가 필요할 때만 `blkdev_issue_flush()`를 실행한다. Journal이 없는 경로와 특수 파일은 별도 분기로 처리한다. 따라서 “항상 Journal Commit → 데이터 쓰기 → Flush”라는 고정된 순서로 외우면 실제 코드와 어긋난다. [Linux v6.12의 ext4 동기화 코드](https://github.com/torvalds/linux/blob/v6.12/fs/ext4/fsync.c)

Journal의 Commit과 파일 동기화가 매번 일대일로 대응하는 것도 아니다. 여러 변경이 한 Transaction에 묶일 수 있다. 기록 순서와 복구 범위는 [Journaling](/wiki/computer-systems-network-topic-63adab3bfc7e/)에서 구분한다.

Windows에서는 일반적인 `WriteFile()`도 OS Cache를 거친다. 파일 Handle의 버퍼를 동기화하려면 `FlushFileBuffers()`를 사용하고 반환값을 확인한다. `FILE_FLAG_NO_BUFFERING`은 파일 데이터의 OS Cache 사용을 바꾸며, `FILE_FLAG_WRITE_THROUGH`는 쓰기를 지연하지 않는 조건을 지정한다. 두 옵션은 같은 의미가 아니다. 데이터를 Cache에 두지 않더라도 파일 메타데이터의 동기화는 별도로 고려해야 한다. [Microsoft의 파일 Cache 설명](https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching), [FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)

## PintOS의 IRQ 완료가 뜻하는 것

현재 PintOS의 기본 inode 구현은 `inode_write_at()`에서 `disk_write()`를 직접 호출한다. Sector 전체를 쓰면 호출자의 버퍼에서 바로 전송하고, 일부만 수정하면 Bounce Buffer로 기존 Sector를 읽어 수정한 뒤 쓴다. 이 코드의 함수 이름은 `block_write()`가 아니라 `disk_write()`이며 장치는 `filesys_disk`다. [inode 쓰기 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/inode.c)

`devices/disk.c`의 쓰기는 다음 순서로 진행된다.

1. ATA Channel의 Lock을 잡고 장치와 Sector를 선택한다.
2. PIO 쓰기 명령을 보내고 장치가 데이터를 받을 준비를 기다린다.
3. `output_sector()`로 512바이트를 전송한다.
4. `sema_down(&c->completion_wait)`에서 완료 Interrupt를 기다린다.
5. `write_cnt`를 늘리고 Channel의 Lock을 해제한다.

이 반환은 Guest가 보는 IDE 요청의 완료다. 현재 경로에 일반적인 파일 Buffer Cache와 `fsync()` 시스템 콜이 없다고 해서 `O_SYNC`와 동일하거나 `fsync()`가 원리상 불필요한 것은 아니다. QEMU와 Host 저장소의 완료 조건은 이 함수 바깥에 있다. [디스크 Driver의 실제 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/devices/disk.c)

### `mmap`은 별도의 지연 쓰기 경로다

일반 파일 쓰기가 곧바로 `disk_write()`로 내려가더라도, File-backed Page를 통해 수정한 데이터까지 즉시 기록되는 것은 아니다. 메모리 매핑된 Page에 Store하면 해당 PTE가 Dirty가 되고, 현재 구현은 Page 회수와 해제 과정에서 파일로 되쓴다.

`file_backed_swap_out()`은 Frame과 소유 Thread의 PML4를 확인하고, 읽어 온 파일 데이터가 있으며 PTE가 Dirty일 때 `file_write_at()`을 호출한다. 기록 길이는 `page_read_bytes`다. 파일 끝을 넘어서 Zero Fill한 부분까지 파일에 추가하지 않는다. 요청한 길이를 모두 쓴 뒤에만 Dirty Bit를 해제한다. `file_backed_destroy()`도 이 함수를 호출하지만 반환값을 확인하지 않는다. 따라서 현재 해제 경로가 Writeback 실패를 끝까지 보고한다고 설명할 수는 없다. [File-backed Page 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c)

Linux의 공유 매핑에는 `msync(..., MS_SYNC)`처럼 명시적으로 Writeback 완료를 기다리는 인터페이스가 있다. 매핑을 해제하는 `munmap()` 자체를 같은 동기화 보장으로 취급하면 안 된다. [메모리 매핑](/wiki/computer-systems-network-topic-aad7c9c2b57f/)에서는 주소 공간과 파일의 연결을 살펴본다. [Linux `msync(2)`](https://man7.org/linux/man-pages/man2/msync.2.html)

### 종료 경로도 함수 본문으로 확인한다

현재 `power_off()`는 `FILESYS`가 켜져 있으면 `filesys_done()`을 호출하고 통계를 출력한 뒤 QEMU의 종료 포트에 쓴다. `filesys_done()`은 `EFILESYS` 설정에 따라 `fat_close()` 또는 `free_map_close()`로 나뉜다.

`fat_close()`에는 Boot Sector와 FAT Table을 쓰는 코드가 있다. 반면 `free_map_close()`의 본문은 `file_close(free_map_file)` 호출뿐이다. Free Map의 Bitmap은 생성·할당·반환 경로에서 기록한다. 함수 위의 주석에 “디스크에 기록한다”는 말이 있더라도 종료 시 Bitmap 전체를 다시 쓰는 코드가 있다고 볼 수는 없다. FAT의 다른 핵심 함수에는 아직 구현할 부분이 남아 있으므로, 종료 함수 하나로 확장 파일 시스템의 완성을 판단하지 않는다. [종료 함수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/init.c), [Free Map](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/free-map.c), [FAT](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/fat.c)

## QEMU 뒤에도 Host의 저장소가 있다

Guest의 PIO 요청은 QEMU의 IDE 모델과 BlockBackend를 거친다. QEMU v10.0.0에서 `ide_sector_write()`는 `blk_aio_pwritev()`로 쓰기를 보내며, Cache Flush 명령은 별도의 `ide_flush_cache()`에서 `blk_aio_flush()`로 처리한다. 일반 쓰기의 완료와 Flush 요청을 소스에서도 구분할 수 있다. [QEMU v10.0.0 IDE 모델](https://github.com/qemu/qemu/blob/v10.0.0/hw/ide/core.c)

BlockBackend 아래에는 이미지 형식과 Host I/O 구현이 있다. Raw 이미지에서는 Guest Sector 번호에 512를 곱한 값이 이미지의 바이트 오프셋에 대응하지만, qcow2에서는 이미지의 매핑과 메타데이터를 거친다. 매번 Host의 특정 `pwrite()` 한 번으로 끝난다고 단순화하면 이 차이가 사라진다. 저장 단위는 [저장 공간 관리](/wiki/computer-systems-network-topic-33acdcc0a664/)에서 확인한다.

| QEMU Cache 모드 | Write-back | Host Page Cache 우회 요청 | Guest Flush 무시 |
| --- | --- | --- | --- |
| `writeback` | 켬 | 끔 | 끔 |
| `none` | 켬 | 켬 | 끔 |
| `writethrough` | 끔 | 끔 | 끔 |
| `directsync` | 끔 | 켬 | 끔 |
| `unsafe` | 켬 | 끔 | 켬 |

QEMU 문서의 기본값은 `writeback`이다. `none`은 Host Cache를 우회하도록 요청하지만 Guest나 장치의 Cache까지 모두 없애지는 않는다. `writethrough`를 “모든 쓰기마다 Host의 `fsync()`를 정확히 한 번 호출한다”는 구현으로 외울 필요도 없다. 모드가 정하는 완료 조건과 실제 Backend 구현을 함께 확인해야 한다. [QEMU Cache 옵션](https://www.qemu.org/docs/master/system/invocation.html)

QEMU 프로세스만 강제로 끝내는 실험과 Host 전체의 전원이 사라지는 실험도 다르다. 전자에서는 Host Page Cache가 살아 있어 이후 기록될 수 있다. 정상 종료 뒤 이미지가 읽힌다는 결과도 Host 전원 장애의 복구 시험을 대신하지 않는다.

## Sector 수와 완료 횟수 관찰하기

현재 PintOS의 Sector는 512바이트이고 Page는 4KiB이므로 한 Page는 여덟 Sector다. 기존에 할당된 파일 범위의 정렬된 4KiB를 덮어쓰면 `inode_write_at()`의 데이터 쓰기 Loop는 여덟 번의 `disk_write()`를 호출한다. 이 함수가 매번 inode를 추가 기록하지는 않으므로 “8회 + inode 1회 = 항상 9회”라고 셀 수 없다. 파일 생성·할당·Directory 변경과 부분 Sector의 읽기는 작업 범위를 따로 잡아 센다.

Swap도 현재 `SECTORS_PER_PAGE = PGSIZE / DISK_SECTOR_SIZE`를 사용한다. Slot `N`은 Swap 장치의 Sector `N × 8`에서 시작하며, `anon_swap_out()`은 그 Slot에 여덟 Sector를 쓴다. 이 요청은 `filesys_disk`의 파일 쓰기와 다른 장치의 I/O다. 파일의 내구성이나 Buffer Cache 효과를 측정할 때 Swap의 통계를 합치지 않는다. [현재 Swap 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c), [Swap](/wiki/computer-systems-network-swap-11630540adf8/)

다음 명령은 해당 Revision의 Debug Symbol을 읽고 PintOS에 연결한 GDB에서 사용한다. 독립 실행 프로그램은 아니며, Breakpoint 진입 시점의 인자와 통계를 관찰하는 명령이다.

```gdb
break inode_write_at
commands
  silent
  printf "inode=%p offset=%d size=%d start=%u length=%d\n", inode, (int)offset, (int)size, (unsigned)inode->data.start, (int)inode->data.length
  continue
end

break disk_write if d == filesys_disk
commands
  silent
  printf "disk=%s sector=%u byte_offset=%llu completed_before=%lld\n", d->name, (unsigned)sec_no, (unsigned long long)sec_no * 512, d->write_cnt
  continue
end

break file_backed_swap_out
break disk_print_stats
```

`inode_write_at()`의 `offset`과 `data.start`를 먼저 읽고, 유효한 파일 범위인지 확인한 뒤 Sector를 계산한다. Breakpoint의 출력에 `byte_to_sector()`를 호출할 필요는 없다. `disk_write()` 진입 시점의 `write_cnt`에는 지금 들어온 요청이 아직 포함되지 않는다. 완료 대기 뒤 값이 증가하므로, 완료 여부를 보려면 함수 반환 뒤나 다음 관찰 지점의 값을 비교한다.

`file_backed_swap_out()`에서 멈췄다는 사실만으로 Dirty Page의 쓰기가 발생했다고 판단하지 않는다. Frame·PML4·파일·길이 검사와 Dirty 조건을 따라가고, 실제 `file_write_at()` 경로에 들어갔는지 확인한다. 종료 시에는 기존 `disk_print_stats()`가 ATA 장치별 누적 읽기·쓰기 횟수를 출력한다. 내부 배열은 `channels[].devices[]`이며, 없는 `disks[][]`를 참조하는 스크립트를 만들면 안 된다.

Buffer Cache 시험의 `get_fs_disk_write_cnt()`도 현재 저장소에 있다. 테스트용 Interrupt `0x44`는 Channel·장치 번호를 받아 `write_cnt`를 반환한다. 이 계측은 요청 수를 확인하는 도구이며, Cache가 구현됐거나 시험이 통과했다는 증거 자체는 아니다. [Buffer Cache 시험 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/filesys/buffer-cache/bc-easy.c)

지연 시간은 별도로 측정한다. SSD·HDD의 종류, Dirty 데이터의 양, Journal 묶음, QEMU의 Cache 모드와 Host 부하에 따라 결과가 달라진다. I/O 횟수에서 고정된 μs·ms 값이나 배속을 바로 계산할 수는 없다. 현재 코드에서 확인한 경로, 실행 중 센 요청 수, 동기화 반환, 장애 뒤 복구 결과를 구분하면 서로 다른 완료를 같은 말로 설명하는 실수를 줄일 수 있다.
