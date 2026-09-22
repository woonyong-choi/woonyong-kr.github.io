---
layout: default
title: 저장 공간 관리
nav_order: 5
permalink: /wiki/computer-systems-network-topic-33acdcc0a664/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-33acdcc0a664
projection_sha256: 789291abcaed62f03f5066a854e4a2592f715215a97b2a03ef839b9ae78ca2c3
parent: 파일 시스템 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-c76b83867c50
grand_parent: PintOS
ancestor: CS 기초
---

# 저장 공간 관리
{: .no_toc }

1KiB 파일을 저장하는 데 꼭 1KiB만 필요한 것은 아니다. 할당 단위가 32KiB라면 보통 데이터 영역 하나를 배정하고 그중 1KiB를 사용한다. 남은 31KiB는 다른 파일에 나눠 줄 수 없다. 반대로 할당 단위를 작게 잡으면 낭비는 줄지만, 파일의 위치와 빈 공간을 추적할 항목이 많아진다.

저장 공간 관리는 이 두 비용 사이에서 시작한다. 여기서는 [lrn-pintos의 `5afaa6d` 시점](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)을 기준으로 기본 파일 시스템의 free map과 아직 구현할 부분이 남은 FAT 구조를 살펴본다. 파일 크기와 inode의 관계는 [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/)과 이어진다.

## 장치의 주소 단위와 파일의 할당 단위

**Sector는 블록 장치에 접근하는 주소 단위이고, Cluster는 파일 시스템이 공간을 할당하는 단위다.** Sector를 설명할 때는 논리적 크기와 물리적 크기를 구분해야 한다. 운영체제에 512바이트씩 주소를 제공하면서 물리적으로는 4KiB 단위를 사용하는 장치도 있다. 따라서 Sector를 언제나 ‘하드웨어의 물리적 최소 단위’라고 정의하면 두 크기가 같다고 오해하기 쉽다. [Linux의 논리·물리 블록 크기](https://docs.kernel.org/admin-guide/abi-stable.html)

PintOS의 `DISK_SECTOR_SIZE`는 512이며 `disk_sector_t`는 `uint32_t`다. `disk_read()`와 `disk_write()`는 Sector 번호 하나와 512바이트 버퍼를 주고받는다. 파일에서 몇 바이트만 읽더라도 아래 계층의 요청은 Sector 단위로 처리된다. 이 인터페이스가 SSD 내부의 NAND 읽기·쓰기·삭제 단위까지 설명하는 것은 아니다.

Cluster 하나는 여러 Sector를 묶을 수 있다. 512바이트 Sector 여덟 개를 묶으면 4KiB, 64개를 묶으면 32KiB다. 현재 PintOS FAT 설정은 `SECTORS_PER_CLUSTER = 1`이므로 Cluster 크기도 512바이트다. **크기가 같다는 사실과 번호가 같다는 사실은 다르다.** FAT와 부트 정보를 저장한 영역 뒤에서 데이터 영역이 시작하므로 Cluster 번호를 Sector 번호로 바꾸는 계산이 필요하다.

일반 파일 시스템에서도 이 용어를 기계적으로 맞춰서는 안 된다. FAT의 Cluster와 ext4의 Block은 서로 다른 형식에서 정의한 단위이며, 크기는 포맷과 기능 설정에 따라 달라진다. 빈 파일, Sparse File, inode 안에 작은 데이터를 담는 방식까지 고려하면 ‘모든 1바이트 파일은 반드시 데이터 Sector 하나를 차지한다’는 주장도 성립하지 않는다. PintOS의 기본 inode는 별도 Metadata Sector를 사용하고, 0보다 큰 파일 데이터는 512바이트 단위로 올림해 할당한다.

## 작은 단위는 관리할 항목을 늘린다

단위 크기에 따른 비용을 비교하려면 용량 표기부터 맞춰야 한다. 아래의 **1GiB는 2³⁰바이트**이며, 10억 바이트인 1GB와 다르다. 우선 Metadata가 차지할 공간과 예약 항목을 제외하지 않고, 1GiB 전체를 같은 크기로 나누는 계산 모델을 사용한다.

| 할당 단위 | 단위 개수 | 단위당 1비트인 Bitmap | 단위당 4바이트인 테이블 |
|---|---:|---:|---:|
| 512B | 2,097,152 | 256KiB | 8MiB |
| 4KiB | 262,144 | 32KiB | 1MiB |
| 32KiB | 32,768 | 4KiB | 128KiB |

Bitmap은 공간 하나의 사용 여부를 1비트로 표현한다. FAT Entry는 다음 Cluster 번호나 체인의 끝과 같은 값을 담으므로 Bitmap과 같은 계산을 쓰지 않는다. 위의 4바이트 테이블 열은 `cluster_t`가 32비트인 PintOS FAT와 비교하기 위한 크기다. 실제 FAT 영역은 그 테이블 자체를 저장할 공간, 예약 번호와 Sector 경계까지 고려해야 하므로 이 표가 곧 포맷 결과는 아니다.

다음 예제에서 `file_size`를 바꾸면 작은 파일이 남기는 공간도 함께 비교할 수 있다. 데이터 영역만 계산하며 inode나 Directory 항목의 비용은 더하지 않는다.

```run-python
disk_size = 1 << 30
file_size = 1 << 10

for unit in (512, 4096, 32768):
    units = disk_size // unit
    bitmap_bytes = (units + 7) // 8
    table_bytes = units * 4
    allocated = ((file_size + unit - 1) // unit) * unit
    print(
        f"unit={unit} B, count={units:,}, "
        f"bitmap={bitmap_bytes // 1024} KiB, "
        f"table={table_bytes // 1024} KiB, "
        f"file allocation={allocated} B, slack={allocated - file_size} B"
    )
```

1KiB 파일에서 남는 공간은 512B 단위일 때 0바이트, 4KiB 단위일 때 3,072바이트, 32KiB 단위일 때 31,744바이트다. 할당받은 단위 안에서 쓰지 못하는 이 부분을 내부 단편화라고 한다. 빈 공간이 여기저기 흩어져 큰 연속 구간을 확보하지 못하는 외부 단편화와는 원인이 다르다.

큰 단위가 항상 느리거나 빠른 것은 아니다. 작은 파일의 비중, 큰 순차 I/O, Metadata 갱신 횟수, 캐시와 장치 특성을 함께 봐야 한다. 4KiB가 흔히 쓰는 메모리 페이지 크기와 같더라도 모든 시스템의 페이지가 4KiB인 것은 아니며, 크기가 같다는 사실만으로 성능 향상이 보장되지 않는다.

## 기본 PintOS는 free map으로 빈 Sector를 찾는다

기본 파일 시스템은 특별한 두 위치를 약속하고 시작한다. `FREE_MAP_SECTOR`는 0, `ROOT_DIR_SECTOR`는 1이다. 두 위치에 놓이는 것은 각각 **free map 파일의 inode와 루트 Directory의 inode**다. Bitmap 전체가 Sector 0에 들어가거나 루트의 모든 이름이 Sector 1에 들어가는 것은 아니다.

`free_map_init()`은 디스크의 Sector 수만큼 비트를 만들고, 두 inode 위치를 사용 중으로 표시한다. 포맷할 때 `free_map_create()`는 Bitmap을 저장할 길이로 파일을 만들고 그 내용에 현재 Bitmap을 기록한다. 이후 `free_map_open()`은 Sector 0의 inode를 열어 데이터 영역에 있는 Bitmap을 읽는다. [free map 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/free-map.c)

파일 생성에서 데이터 Sector가 세 개 필요하면 `free_map_allocate(3, &sector)`가 연속된 빈 비트 세 개를 찾는다. 성공하면 그 비트를 사용 중으로 바꾸고 첫 Sector 번호를 돌려준다. 빈 Sector가 총 세 개 이상 있어도 연속된 구간이 없으면 실패할 수 있다. 기본 inode가 시작 위치와 길이로 연속 데이터를 찾기 때문이다.

이미 free map 파일을 연 상태에서는 바뀐 Bitmap도 파일에 쓴다. 이 쓰기가 실패하면 방금 뒤집은 비트를 되돌리고 할당 실패를 반환한다. `free_map_release()`는 반환할 구간이 사용 중인지 확인하고 비트를 비운 뒤 Bitmap 쓰기를 요청한다. 다만 해제 함수는 그 쓰기의 반환값을 검사하지 않는다. 이러한 함수 안의 처리만으로 전원 장애까지 견디는 원자적 저장이 구현됐다고 볼 수는 없다.

파일을 확장하면서 연속 구간 대신 떨어진 공간을 연결하는 방식은 [파일 확장](/wiki/computer-systems-network-topic-11f41b49c3a0/)에서 다룬다. 할당 정책을 바꾸면 빈 공간을 찾는 방법뿐 아니라 inode가 데이터 위치를 찾는 방법도 함께 달라진다.

## FAT에서는 배치를 부트 정보로 읽는다

PintOS의 `EFILESYS` 경로에는 FAT를 위한 별도 구조가 준비돼 있다. 기본 파일 시스템과 같은 Sector에 같은 정보가 있다고 가정하면 디스크를 잘못 해석하게 된다.

| 위치 또는 정보 | 기본 파일 시스템 | PintOS FAT 설계 |
|---|---|---|
| Sector 0 | free map 파일의 inode | `fat_boot` |
| Sector 1 | 루트 Directory의 inode | FAT 테이블의 시작 |
| 빈 공간 관리 | Sector당 1비트인 Bitmap | Cluster별 FAT Entry |
| 파일 데이터의 위치 | inode의 시작 Sector와 연속 구간 | Cluster 번호를 Sector로 변환한 위치 |
| 루트 식별자 | `ROOT_DIR_SECTOR = 1` | `ROOT_DIR_CLUSTER = 1` |

`fat_boot`에는 여섯 개의 `unsigned int` 필드가 있다. `magic`은 `0xEB3C9000`, `sectors_per_cluster`는 1, `total_sectors`는 디스크의 Sector 수다. `fat_start`는 1이며, `fat_sectors`는 FAT가 차지하는 Sector 수, `root_dir_cluster`는 루트 Cluster 번호 1을 담는다. 이 값들이 테이블과 데이터 영역의 위치를 해석하는 기준이다.

`fat_boot_create()`는 부트 Sector 하나를 제외한 공간에서 FAT와 데이터에 필요한 공간을 계산한다. 현재 상수에서 FAT Sector 하나에는 4바이트 Entry 128개가 들어가고, 각 Entry가 가리킬 데이터 Cluster는 Sector 하나다. 코드의 계산은 `(전체 Sector 수 - 1) / 129 + 1`이다. 이 식의 129는 FAT용 Sector 하나와 데이터용 Sector 128개를 합한 크기다. [FAT 구조와 배치 계산](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/fat.c)

시작할 때 `fat_init()`은 Sector 0을 읽어 부트 정보를 얻고, `fat_open()`은 그 정보에 따라 FAT 테이블을 읽는다. 포맷 경로의 `fat_create()`는 부트 정보를 준비한 뒤 FAT 메모리를 만들고, 루트 Entry에 체인의 끝인 `EOChain`을 기록하며 루트 데이터 영역을 0으로 채우도록 구성돼 있다. `fat_close()`에는 부트 정보와 FAT를 디스크에 쓰는 코드가 있다.

**현재 revision의 `fat_fs_init()`, `fat_put()`, `fat_get()`, `cluster_to_sector()`와 체인 할당·해제는 `TODO`로 남아 있다.** 따라서 앞의 흐름은 코드에 마련된 호출 구조다. FAT 포맷이나 파일 확장이 실제로 완성돼 동작했다는 뜻은 아니다. 특히 `ROOT_DIR_CLUSTER = 1`을 그대로 Sector 1에 넘겨 읽으면 FAT 영역을 루트 데이터로 착각하게 된다.

FAT의 빈 Cluster 표시와 다음 Cluster 번호, Chain 끝 표시는 서로 다른 뜻이다. 현재 Header의 `EOChain` 값은 `0x0fffffff`이며 Little Endian 바이트는 `ff ff ff 0f`다. 마지막 바이트가 `0f`라고 정수 값을 `0xffffff0f`로 읽지 않는다. `ROOT_DIR_CLUSTER=1`도 Cluster 번호이지 디스크 Sector 1이라는 뜻은 아니다. `data_start`와 Cluster 크기를 사용해 변환해야 한다.

예를 들어 `2 → 5 → 3 → EOChain`은 파일의 첫 세 Cluster가 저장된 순서를 나타낸다. 이 체인을 늘리려면 빈 Cluster를 찾고 새 끝과 이전 끝의 연결을 갱신해야 한다. 실제 구현에서는 할당 실패나 중간 쓰기 실패에 남는 연결도 처리해야 한다. 현재 `fat_create_chain()`·`fat_remove_chain()`·`fat_get()`·`fat_put()`의 `TODO`를 완성된 할당기로 간주하지 않는다. 표준 FAT32와 PintOS의 학습용 FAT 포맷 역시 별개다. [FAT 상수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/filesys/fat.h)

## Superblock은 파일 시스템의 전체 구조를 설명한다

inode가 개별 파일을 설명한다면 **Superblock은 파일 시스템 전체를 해석할 정보**를 담는다. 형식 식별 값, 전체 크기와 기능 설정 등이 여기에 속한다. UUID, 마운트 관련 정보나 Journal 정보까지 담는 형식도 있다. 구체적인 필드와 배치는 파일 시스템마다 다르다. [ext4 Superblock 필드](https://www.kernel.org/doc/html/latest/filesystems/ext4/super.html)

PintOS FAT의 `fat_boot`는 앞서 본 것처럼 전체 배치를 설명하는 역할을 하지만, 이를 근거로 모든 Superblock을 ‘Sector 0의 부트 Sector’라고 부르면 안 된다. 기본 PintOS는 두 고정 inode 위치에서 출발하고, ext4의 첫 Superblock은 **파일 시스템 시작에서 1,024바이트 떨어진 위치**에 놓인다. 디스크 전체에 파티션이 있다면 디스크 시작과 파일 시스템 시작도 구분해야 한다.

이 정보가 손상되면 파일 시스템의 나머지 영역을 정상적으로 해석하기 어려워진다. ext4는 일부 Block Group에 Superblock과 Group Descriptor의 복사본을 둘 수 있다. 복사본의 위치는 기능 설정에 따라 달라지며, 복사본이 있다는 사실만으로 모든 손상에서 복구할 수 있다는 뜻은 아니다. 현재 PintOS FAT 코드에는 이런 복사본 관리가 없다. [ext4의 첫 Superblock과 복사본 배치](https://www.kernel.org/doc/html/latest/filesystems/ext4/blockgroup.html)

## Sector 번호가 디스크 이미지의 위치가 되기까지

`disk_read(filesys_disk, 24, buffer)`의 24는 파일 안의 바이트 offset이 아니라 장치에 전달할 Sector 번호다. PintOS 드라이버는 채널 Lock을 잡고 Sector를 선택한 뒤 ATA PIO 읽기 명령을 보낸다. 완료를 기다린 다음 데이터 포트에서 16비트 값 256개, 즉 512바이트를 버퍼로 읽는다. [PintOS 디스크 드라이버](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/devices/disk.c)

주 IDE 채널의 포트 기준 주소가 `0x1f0`일 때 LBA와 장치 정보는 `0x1f3`부터 `0x1f6`, 명령은 `0x1f7`, 데이터는 `0x1f0`을 사용한다. 다른 채널은 기준 주소가 다르다. 드라이버의 채널 Lock은 이 I/O 순서를 보호하지만, 여러 차례의 I/O와 메모리 변경으로 이루어진 inode 갱신 전체를 자동으로 보호하지는 않는다.

QEMU는 가상 IDE 장치가 받은 명령을 블록 계층의 요청으로 바꾼다. 예를 들어 **QEMU v10.0.0**의 `ide_sector_read()`는 `ide_buffered_readv()`를 거쳐 `blk_aio_preadv()`에 바이트 위치를 전달한다. 이 경로에서 Sector 번호를 왼쪽으로 `BDRV_SECTOR_BITS`만큼 이동해 512를 곱한다. 비동기 읽기 완료 뒤에는 PIO 데이터 전송과 인터럽트 처리로 이어진다. 이 함수 이름과 호출 흐름은 해당 버전의 소스에 대한 설명이다. [QEMU v10.0.0의 IDE 읽기 경로](https://github.com/qemu/qemu/blob/v10.0.0/hw/ide/core.c)

Sector 24의 시작 바이트는 `24 × 512 = 12,288`, 16진수로 `0x3000`이다. **가상 디스크 전체를 그대로 담은 raw 이미지**라면 이미지 파일에서도 이 위치에 해당한다. qcow2는 형식에 따른 주소 변환이 추가되므로 같은 계산으로 호스트 파일의 바이트 위치를 정할 수 없다. 블록 백엔드가 언제나 로컬 파일과 `pread()` 하나로 연결되는 것도 아니다. [QEMU의 raw·qcow2 이미지 형식](https://www.qemu.org/docs/master/system/images.html#disk-image-file-formats)

다음 예제는 임시 파일을 raw 이미지처럼 만들어 Sector 24의 값을 읽는다. 실제 파일 I/O로 주소 계산을 확인하며, PintOS나 QEMU를 실행하는 예제는 아니다.

```run-python
from tempfile import TemporaryFile

sector_size = 512
sector = 24
offset = sector * sector_size
marker = b"sector-24"

with TemporaryFile(mode="w+b") as image:
    image.write(b"\0" * (25 * sector_size))
    image.seek(offset)
    image.write(marker)
    image.flush()

    image.seek(offset)
    block = image.read(sector_size)
    print("byte offset:", offset)
    print("hex offset:", hex(offset))
    print("read size:", len(block))
    print("marker:", block[:len(marker)].decode("ascii"))
    print("remaining bytes are zero:", block[len(marker):] == b"\0" * (sector_size - len(marker)))
```

실행하면 offset은 `12288`과 `0x3000`, 읽은 크기는 `512`, 표식은 `sector-24`로 나온다. `sector`를 23으로 바꾸면 기록 위치까지 함께 움직인다. 쓰기 위치는 24로 두고 읽기 위치만 23으로 바꾸면 다른 Sector의 0을 읽게 된다.

실제 디스크를 조사할 때는 먼저 이미지 형식과 PintOS가 사용하는 디스크를 확인해야 한다. 해당 장치의 raw 전체 이미지가 `disk.raw`라면 다음 명령으로 같은 512바이트를 볼 수 있다. 파일이 준비돼 있어야 하는 로컬 진단 명령이다.

```sh
hexdump -C -s 0x3000 -n 512 disk.raw
```

파일의 논리 offset, Cluster 번호, 장치의 Sector 번호, 호스트 이미지의 바이트 offset은 서로 다른 위치 표현이다. 데이터가 예상한 곳에서 보이지 않을 때는 각 계층의 시작 위치와 단위를 순서대로 확인해야 한다.

## 파일 offset과 Sector 경계를 함께 계산한다

Sector `N`은 바이트 범위 `[N × 512, (N + 1) × 512)`를 나타낸다. 파일의 논리 offset은 여기에 바로 넣지 않는다. 현재 기본 inode에서는 데이터의 시작 Sector에 `파일 offset // 512`를 더하고, Sector 안의 위치는 `파일 offset % 512`로 구한다. 할당 방식이 바뀌면 앞의 Sector 매핑도 달라진다.

예를 들어 파일 데이터가 Sector 30에서 시작하고 offset 3,000부터 100바이트를 읽는다고 하자. 시작 위치는 Sector 35의 440번째 바이트다. 그 Sector에 남은 공간은 72바이트이므로 다음 Sector 36에서도 28바이트를 읽어야 한다. “한 Sector에서 100바이트를 복사한다”는 계산은 경계를 넘는다.

아래 코드는 요청을 Sector 경계와 파일 끝에서 나눈다. 현재 inode의 연속 배치 계산을 보여 주며, 실제 Disk Driver를 실행하지는 않는다.

```run-python
def split_read(data_start, file_length, offset, size, sector_size=512):
    if min(data_start, file_length, offset, size) < 0 or sector_size <= 0:
        raise ValueError("크기와 위치는 유효한 범위여야 한다.")
    while size > 0 and offset < file_length:
        block, within = divmod(offset, sector_size)
        count = min(size, sector_size - within, file_length - offset)
        yield data_start + block, within, count
        offset += count
        size -= count


for length in (4096, 3050):
    chunks = list(split_read(30, length, 3000, 100))
    print(f"파일 길이={length}, 조각={chunks}, 읽기 길이={sum(c[2] for c in chunks)}")
```

파일 길이가 4,096이면 `(35, 440, 72)`, `(36, 0, 28)` 두 조각으로 100바이트를 읽는다. 길이가 3,050이면 파일 끝에서 멈추므로 `(35, 440, 50)`만 읽는다. Sector 읽기 횟수와 호출자가 요청한 바이트 수를 구분해야 Bounce Buffer의 동작도 설명할 수 있다.

첫 데이터 Sector가 10이고 파일 길이가 충분할 때, offset 1,500부터 100바이트를 읽는 경우도 위 예제로 계산할 수 있다. `1,500 // 512 = 2`, 나머지는 476이므로 Sector 12에서 36바이트, Sector 13에서 64바이트를 읽는다. `file_read()`였다면 위치는 1,600으로 이동하지만 `file_read_at()`은 핸들의 위치를 바꾸지 않는다.

512바이트 경계에 맞지 않는 위치에서 정확히 4,096바이트를 읽으면 Sector 아홉 개에 걸친다. 처음과 마지막은 부분 읽기이고 가운데 일곱 개는 전체 Sector 읽기다. 정렬된 위치에서 시작해야 전체 Sector 여덟 개가 된다. 이는 파일 길이가 충분하고 요청이 끝까지 성공한 조건의 계산이다. 실제 시스템 호출은 사용자 버퍼 검증과 Kernel 버퍼를 통한 복사도 거치므로, inode의 부분 Sector용 Bounce Buffer와 사용자 주소 보호를 같은 작업으로 취급하지 않는다.

### Swap Slot 안의 한 바이트 찾기

현재 PintOS의 Page는 4KiB이며 한 Swap Slot에는 512바이트 Sector 여덟 개가 들어간다. Slot 3은 Sector 24~31, 바이트 범위 `[0x3000, 0x4000)`에 대응한다. Page 안의 offset `0x888`은 다섯 번째 Sector의 `0x88` 위치이므로 전체 바이트 오프셋은 `0x3888`이다.

다음 예제는 임시 Raw 파일에 그 바이트를 기록하고, Sector 단위로 다시 읽어 확인한다. 실행 중인 VM의 이미지에는 접근하지 않는다.

```run-python
from tempfile import TemporaryFile

page_size = 4096
sector_size = 512
slot = 3
page_offset = 0x888
assert 0 <= page_offset < page_size

sectors_per_page = page_size // sector_size
sector_in_page, within = divmod(page_offset, sector_size)
sector = slot * sectors_per_page + sector_in_page
absolute_offset = sector * sector_size + within

with TemporaryFile(mode="w+b") as image:
    image.truncate((slot + 1) * page_size)
    image.seek(absolute_offset)
    image.write(b"\xfe")
    image.flush()
    image.seek(sector * sector_size)
    block = image.read(sector_size)
    assert len(block) == sector_size and block[within] == 0xfe
    print("Sector:", sector, "Sector 내부:", hex(within))
    print("Raw offset:", hex(absolute_offset), "읽은 값:", hex(block[within]))

for number in range(slot * sectors_per_page, (slot + 1) * sectors_per_page):
    print(f"Sector {number}: [{hex(number * sector_size)}, {hex((number + 1) * sector_size)})")
```

이 계산에서 4KiB는 현재 PintOS의 Page 크기다. 다른 OS의 모든 Page나 Swap I/O가 같은 크기라고 일반화하지 않는다. 또한 `0x3000`이라는 숫자가 Guest의 가상 주소나 물리 주소로 나왔다면 여기의 디스크 오프셋과는 다른 공간의 값이다.

### LBA의 크기와 Linux의 Sector 단위

LBA는 장치를 순서 있는 논리 Block의 배열로 접근하는 주소 방식이다. CHS의 Cylinder·Head·Sector 좌표와 구분된다. 512바이트를 기준으로 28비트 주소 공간의 크기는 `2²⁸ × 512 = 128GiB`, 48비트는 `128PiB`다. 십진 단위인 128GB·128PB와 같지 않다. 이는 주소 범위의 계산이며 개별 장치의 지원 용량을 보장하는 값은 아니다.

`disk_sector_t`가 32비트라고 현재 PintOS의 ATA 경로가 32비트 LBA를 지원하는 것도 아니다. `select_sector()`는 장치 용량과 `2²⁸` 미만인지 모두 검사한다. Register에 주소를 나누어 넣는 과정은 [IDE 컨트롤러](/wiki/ide-controller/)에서 실행해 볼 수 있다.

Linux의 Block Layer도 주소 필드의 단위를 따로 확인해야 한다. Linux v6.12의 `bvec_iter.bi_sector`는 **512바이트 단위**이며 장치의 논리·물리 Block 크기와 별개다. 이 값을 장치의 논리 Block 크기로 다시 곱하면 위치를 잘못 계산할 수 있다. [Linux v6.12 `bvec_iter`](https://github.com/torvalds/linux/blob/v6.12/include/linux/bvec.h)

512e 장치는 논리 512바이트와 물리 4KiB를 조합하며, 4Kn은 논리 크기도 4KiB다. “4Kn의 논리 Sector를 항상 여덟 개씩 물리 Sector로 묶는다”는 설명은 맞지 않는다. 장치가 보고하는 크기와 정렬 조건을 확인하고, PintOS의 512바이트 인터페이스를 모든 장치에 적용하지 않는다.
