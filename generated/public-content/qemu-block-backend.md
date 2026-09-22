---
layout: default
title: BlockBackend
nav_order: 1
permalink: /wiki/qemu-block-backend/
publication_state: publish
has_toc: true
projection_id: Wiki/computer-systems-network/os/pintos/qemu/block-backend
projection_sha256: 769636223a0f3d23ed89930d8f986fbe677a3f7f5edb6af866723e95ff2f0e5f
parent: QEMU
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-qemu-b1366076be02
search_terms:
- 가상 디스크
- Raw 이미지
- qcow2
- Host I/O
- blk_aio_pwritev
- BDS
grand_parent: 개발 환경
ancestor: CS 기초
---

# BlockBackend
{: .no_toc }

Guest의 디스크와 Host의 파일은 같은 인터페이스가 아니다. Guest는 장치에 Sector를 요청하고, Host는 이미지 파일이나 다른 저장소에 바이트 단위의 I/O를 수행한다. QEMU의 BlockBackend는 장치 모델과 블록 계층을 연결한다. 그 아래의 Driver들이 이미지 형식과 실제 접근 경로를 처리한다.

[IDE 컨트롤러](/wiki/ide-controller/)가 ATA 명령을 받는 과정과, BlockBackend 아래에서 그 요청을 처리하는 과정을 구분하면 같은 숫자가 어느 주소를 뜻하는지 따라가기 쉽다. 여기서는 [QEMU v10.0.0](https://github.com/qemu/qemu/tree/v10.0.0)과 [lrn-pintos `5afaa6d`](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)를 기준으로 한다.

## 장치 모델 아래의 블록 그래프

Raw 이미지가 Host의 일반 파일에 저장된 구성이라면 다음 계층으로 읽을 수 있다. 실제 블록 그래프는 필터, Backing Image, 네트워크 Driver 등을 더 포함할 수 있다.

| 계층 | 다루는 정보 |
| --- | --- |
| IDE 장치 모델 | Guest의 명령, LBA, 장치 상태, PIO 전송 |
| BlockBackend | 장치의 I/O 진입점, 요청 범위, 진행 중인 요청, 제한·Cache 정책 |
| Format Driver | `raw`·`qcow2` 등의 이미지 형식과 위치 매핑 |
| Protocol Driver | 로컬 파일·장치·NBD 등 실제 접근 방법 |
| Host 저장소 | OS의 파일·블록 I/O와 저장 장치 |

`BlockDriverState`는 블록 그래프의 Driver 노드를 표현한다. `raw` Format과 Host 파일용 Driver는 역할이 다르며, 둘 모두 구현 안에서 `raw_`로 시작하는 함수 이름을 사용할 수 있다. 함수명만 보지 말고 `block/raw-format.c`인지 `block/file-posix.c`인지도 확인해야 한다.

`BlockDevOps`를 이 표 맨 위의 “장치가 쓰기를 발행하는 API”로 외우는 것은 부정확하다. 실제 읽기·쓰기 요청은 `blk_aio_preadv()`와 `blk_aio_pwritev()` 같은 BlockBackend API에서 추적한다. 장치 모델이 가지는 Callback 묶음과 I/O 함수 호출을 구분한다.

## Sector 42를 쓰면 무엇이 바뀌는가

PintOS가 `disk_write(swap_disk, 42, buffer)`를 호출하면 현재 Driver는 LBA 42와 512바이트를 Secondary Slave로 보낸다. QEMU IDE의 `ide_sector_write()`는 LBA에 `BDRV_SECTOR_BITS`인 9만큼 왼쪽 Shift를 적용한다. 바이트 오프셋은 **21,504, 즉 `0x5400`**이다.

QEMU v10.0.0의 `cmd_write_pio()`는 한 번에 받을 Sector 수를 1로 정하고, 512바이트를 받을 버퍼와 `ide_sector_write()` Callback을 등록한다. Guest가 PIO로 데이터를 보낸 뒤 이 Callback이 Sector 번호를 읽고 I/O Vector를 준비해 `blk_aio_pwritev()`를 호출한다. 따라서 명령을 해석하는 시점과 데이터를 Backend에 쓰는 시점은 구분해야 한다. [PIO 쓰기의 시작](https://github.com/qemu/qemu/blob/v10.0.0/hw/ide/core.c#L1554-L1572), [Sector 데이터의 Backend 전달](https://github.com/qemu/qemu/blob/v10.0.0/hw/ide/core.c#L1075-L1102)

QEMU v10.0.0의 해당 쓰기는 `blk_aio_pwritev()`에 오프셋, I/O Vector, Flag와 완료 Callback을 전달한다. 읽기는 `ide_sector_read()`에서 `ide_buffered_readv()`를 거쳐 `blk_aio_preadv()`로 이어진다. Guest가 IDE 요청을 동기적으로 기다려도 QEMU는 이 인터페이스에서 비동기 완료를 다룬다. [IDE 읽기·쓰기 코드](https://github.com/qemu/qemu/blob/v10.0.0/hw/ide/core.c)

BlockBackend의 쓰기 경로는 요청 범위를 검사하고 진행 중인 I/O를 관리한다. 설정된 Throttling을 적용할 수 있고, Write Cache를 쓰지 않는 경우에는 FUA Flag를 추가한다. 그다음 `bdrv_co_pwritev_part()`로 블록 그래프에 요청을 넘긴다. “BlockBackend에는 대기나 제한 없이 모든 요청을 즉시 보낸다”는 설명은 이 경로와 맞지 않는다. [BlockBackend 구현](https://github.com/qemu/qemu/blob/v10.0.0/block/block-backend.c)

Host의 일반 파일로 내려가더라도 마지막 호출이 항상 `pwrite()` 하나인 것은 아니다. `file-posix.c`의 `raw_co_prw()`에는 정렬 조건과 설정에 따라 `io_uring`, Linux AIO 또는 Thread Pool을 사용하는 분기가 있다. Host OS와 빌드 설정에 따라서도 사용 가능한 경로가 달라진다. [Host 파일 I/O 구현](https://github.com/qemu/qemu/blob/v10.0.0/block/file-posix.c)

Guest PIO와 Host DMA를 같은 선택지로 비교해서도 안 된다. Guest가 PIO로 가상 컨트롤러에 데이터를 건네더라도 Host의 실제 장치는 별도의 Driver와 DMA 경로를 사용할 수 있다. Guest의 완료 대기 방식, QEMU의 비동기 API, Host 장치의 전송 방식은 각각의 계층에서 정한다.

## Raw 이미지에서는 어느 바이트를 읽는가

이미지 전체를 오프셋 조정 없이 연결한 Raw 구성에서는 Sector `N`의 데이터가 파일의 `N × 512`에서 시작한다. qcow2는 Cluster 매핑과 메타데이터를 거치므로 같은 계산으로 Host 파일을 직접 읽을 수 없다. Raw Format도 별도 `offset` 옵션을 사용한 구성이라면 기준 위치를 더해야 한다.

Raw 파일이 언제나 처음부터 전체 용량만큼 물리 공간을 차지하는 것도 아니다. Host 파일 시스템이 Sparse File을 지원하면 아직 쓰지 않은 영역에 실제 블록을 할당하지 않을 수 있다. 파일의 논리적 크기와 사용 중인 공간을 구분한다. Raw Format 자체에 qcow2와 같은 내부 Snapshot 메타데이터가 없다는 점과, 외부 Overlay나 Host 파일 시스템의 Snapshot을 사용할 수 있는지는 별개의 문제다. [QEMU 이미지 형식](https://www.qemu.org/docs/master/system/images.html)

| 형식 | 위치를 해석하는 방식 | 읽기 전에 확인할 점 |
| --- | --- | --- |
| Raw | 기본 전체 이미지에서 Guest 바이트 위치와 파일 위치가 직접 대응 | 연결한 기준 오프셋·Sparse 할당 |
| qcow2 | Format의 Cluster 매핑을 거침 | Backing Image·Snapshot·기능 설정 |
| VMDK | 형식에 따른 Descriptor·Extent 등의 매핑을 거침 | 단일 Flat 이미지인지 Sparse·여러 Extent 구성인지 |

Raw의 직접 매핑이 변환 비용 0초나 I/O 지연 0을 뜻하지는 않는다. Host Cache, 파일 시스템 할당과 장치 요청은 여전히 존재한다. [QEMU의 블록 Driver 설명](https://www.qemu.org/docs/master/system/qemu-block-drivers.html)

Sector와 Swap Slot의 계산은 [저장 공간 관리](/wiki/computer-systems-network-topic-33acdcc0a664/)의 실행 예제에서 확인할 수 있다. Byte `0x3000`이 Guest VA인지, Guest PA인지, 이미지 오프셋인지도 함께 표시해야 한다. QEMU의 Guest RAM을 뒷받침하는 메모리와 디스크 이미지를 뒷받침하는 저장소는 같은 공간이 아니다.

## 어떤 이미지가 어느 장치에 연결되는가

현재 PintOS 실행기의 `__prepare_cmd()`는 `os`, `fs`, `scratch`, `swap`을 순회하며 다음 형식의 `-drive` 인자를 만든다. 아래 두 줄은 실행 명령 전체가 아니라 생성되는 옵션의 예다.

```text
-drive file=os.dsk,format=raw,index=0,media=disk
-drive file=fs.dsk,format=raw,index=1,media=disk
```

| index | Channel·장치 | 역할 |
| --- | --- | --- |
| 0 | `hd0:0` | Boot·Kernel 이미지 |
| 1 | `hd0:1` | 파일 시스템 이미지 |
| 2 | `hd1:0` | Scratch 이미지 |
| 3 | `hd1:1` | Swap 이미지 |

실제 파일 경로는 실행기 옵션과 임시 파일 생성에 따라 달라질 수 있다. 기본 이름만 보고 조사할 파일을 정하면 다른 이미지의 같은 오프셋을 읽게 된다. 실행기가 전달한 경로와 Guest의 장치를 먼저 맞춘다. [현재 PintOS 실행기](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/utils/pintos)

Scratch와 Swap은 모두 Secondary Channel에 연결된다. `d->channel->reg_base == 0x170` 조건만으로 Swap이라고 판정할 수 없다. `swap_disk` 포인터 또는 Channel과 장치 번호를 함께 비교해야 한다.

## Guest와 Host를 따로 관찰한다

PintOS를 원격 디버깅하는 GDB는 Guest Kernel의 Symbol을 읽는다. QEMU 자체의 `ide_sector_write()`에 Breakpoint를 걸려면 QEMU Debug Symbol을 가진 Host Debugger가 별도로 필요하다. Guest GDB에 QEMU 함수 이름을 입력한다고 같은 실행 문맥을 관찰할 수 있는 것은 아니다.

QEMU의 디버그 심볼을 가진 Host GDB에서는 다음 진입점을 따라갈 수 있다. 아래 명령은 관찰 지점이며 실제 실행 로그가 아니다.

```gdb
break cmd_write_pio
break ide_sector_write
break blk_aio_pwritev
```

`cmd_write_pio()`에서는 `s->req_nb_sectors`가 대입된 뒤 값을 읽는다. `ide_sector_write()`에서는 `sector_num = ide_get_sector(s)`와 I/O Vector 초기화를 지난 뒤 `sector_num`, `s->qiov.size`를 확인한다. `blk_aio_pwritev()`에 들어가면 `info args`로 인자를 보고 `offset`과 `qiov->size`를 읽는다. `sector_num`은 이 마지막 함수의 지역 변수가 아니다.

요청의 `blk`가 조사 중인 Swap 이미지와 연결된 Backend인지도 함께 확인해야 파일 시스템 쓰기를 Swap 쓰기로 오인하지 않는다. Sector 24 한 개를 보내는 경우 비교할 값은 오프셋 `0x3000`과 길이 512바이트다. [BlockBackend의 쓰기 인자](https://github.com/qemu/qemu/blob/v10.0.0/block/block-backend.c#L1716-L1724)

Guest에서는 `disk_write()`의 장치·Sector·버퍼와 Call Stack을 확인한다. 그다음 Host에서 해당 Raw 이미지의 같은 범위를 읽어 비교할 수 있다. 아래 명령은 **실제 이미지 경로를 확인한 뒤**, 이미지가 더 이상 바뀌지 않는 시점이나 일관된 복사본에서 사용하는 로컬 읽기 명령이다.

```sh
hexdump -C -s 21504 -n 512 swap.dsk
```

이것은 Sector 42를 읽는 예다. Swap Slot 3 전체는 오프셋 `12288`에서 4,096바이트다. `dd`를 사용한다면 `bs=512 skip=42 count=1`과 `bs=4096 skip=3 count=1`이 각각 같은 범위를 선택한다. 파일의 Sector 0을 읽었다는 이유만으로 Superblock이라고 부르지는 않는다. 기본 PintOS에서는 Free Map 파일의 inode이고, FAT 설정에서는 다른 구조다.

이미지 파일에서 쓴 값이 보인다는 사실과 저장 장치에 영속적으로 남았다는 사실도 다르다. Host의 Page Cache가 읽기에 응답할 수 있기 때문이다. QEMU Cache 모드와 Flush의 보장은 [fsync](/wiki/file-system-fsync/)에서 연결한다. 프로세스 종료, Host 장애, 전원 차단은 같은 시험이 아니다.
