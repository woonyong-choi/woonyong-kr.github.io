---
layout: default
title: 파일 확장
nav_order: 2
permalink: /wiki/computer-systems-network-topic-11f41b49c3a0/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-11f41b49c3a0
projection_sha256: fce232013d7e5660236c066b69a115076919df045cf356e794663cbbfce8af34
parent: 파일 시스템 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-c76b83867c50
grand_parent: PintOS
ancestor: CS 기초
---

# 파일 확장
{: .no_toc }

1,024바이트 파일의 offset 1,000부터 80바이트를 쓰면 파일 끝을 56바이트 넘어간다. 파일을 늘릴 수 있다면 길이는 1,080바이트가 되지만, 현재 PintOS의 고정 길이 파일은 남은 24바이트만 쓴다. 파일 확장은 이 차이를 만드는 저장 공간과 길이 갱신을 다룬다.

여기서는 [lrn-pintos의 `5afaa6d` 시점](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)을 기준으로 현재 동작과 확장에 필요한 변경을 구분한다. 파일을 만든 뒤 `open()`으로 얻는 핸들과 inode의 관계는 [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/)에서 먼저 확인할 수 있다.

## 쓰기가 멈추는 위치

현재 `filesys_create("a.txt", 1024)`는 `inode_create()`를 통해 데이터 Sector 두 개를 연속으로 할당하고 0으로 채운다. inode의 길이는 1,024바이트로 고정된다. inode Metadata가 들어갈 Sector는 이 데이터 Sector들과 별도로 할당한다.

`file_write()`는 현재 위치인 `file->pos`를 `inode_write_at()`에 전달한다. 쓰기가 끝나면 **요청한 크기 대신 실제로 쓴 크기**를 `pos`에 더한다. 따라서 80바이트를 요청해도 24바이트만 썼다면 위치는 1,024가 된다. `file_write_at()`은 인자로 받은 offset을 사용하고 핸들의 `pos`를 바꾸지 않는다.

`inode_write_at()`은 요청을 Sector별 조각으로 처리한다. 다음 부분은 그 조각 크기를 정하는 현재 코드다. 커널 함수의 일부이므로 이 조각만 실행할 수는 없다.

```c
off_t inode_left = inode_length (inode) - offset;
int sector_left = DISK_SECTOR_SIZE - sector_ofs;
int min_left = inode_left < sector_left ? inode_left : sector_left;
int chunk_size = size < min_left ? size : min_left;
if (chunk_size <= 0)
    break;
```

offset 1,000에서는 파일 끝까지 24바이트가 남고, Sector 끝까지도 24바이트가 남는다. 첫 조각을 쓴 뒤 offset이 1,024가 되면 `inode_left`가 0이므로 반복을 끝낸다. 요청이 파일 끝을 넘는다는 이유로 처음부터 전부 거부하는 것이 아니라, 쓸 수 있는 앞부분을 처리한 뒤 멈춘다.

파일 끝보다 뒤에서 시작하면 처음부터 쓸 조각이 없어 0을 반환한다. 쓰기 금지 참조가 있는 경우에도 `inode_write_at()`은 0을 반환하므로, 반환값만 보고 언제나 공간 부족이나 파일 끝이라고 해석하지 않는다. [현재 쓰기 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/inode.c)

## seek와 파일 길이는 따로 움직인다

PintOS의 `file_seek()`은 음수가 아닌 위치를 허용하고 `pos`만 바꾼다. 파일 끝을 넘는 위치로 이동할 수는 있지만, 그것만으로 길이가 늘거나 디스크 공간이 할당되지는 않는다. 현재 구현은 그 위치에서 쓰더라도 파일을 확장하지 못한다.

일반적인 파일 시스템에서도 위치를 옮기는 것과 내용을 쓰는 것은 별개다. 아래 예제는 고정 길이에서 쓸 수 있는 범위를 먼저 계산하고, Python 실행 환경의 실제 임시 파일에서 끝을 넘는 쓰기를 수행한다. 출력의 `PintOS fixed-size calculation`은 소스에 따른 계산이며 PintOS 커널 실행 결과가 아니다.

```run-python
from tempfile import TemporaryFile

initial_length = 1024
offset = 1000
payload = b"x" * 80
fixed_bytes = min(len(payload), max(0, initial_length - offset))
print("PintOS fixed-size calculation:", fixed_bytes)

with TemporaryFile(mode="w+b") as file:
    file.write(b"\0" * initial_length)
    file.seek(offset)
    written = file.write(payload)
    file.flush()
    length = file.seek(0, 2)
    print("host bytes written:", written)
    print("host length after write:", length)

    file.seek(1300)
    print("position after seek:", file.tell())
    print("length after seek:", file.seek(0, 2))
    file.seek(1300)
    file.write(b"Z")
    file.flush()
    print("length after last byte:", file.seek(0, 2))

    file.seek(length)
    gap = file.read(1300 - length)
    print("gap bytes:", len(gap))
    print("gap is zero-filled:", gap == b"\0" * len(gap))
```

실제 임시 파일에 80바이트를 쓰면 길이는 1,080이 된다. 위치만 1,300으로 옮겼을 때는 길이가 그대로이고, 그 위치에 한 바이트를 써야 길이가 1,301이 된다. 원래 끝과 마지막 쓰기 사이의 220바이트는 읽으면 0으로 나온다.

이 빈 구간을 반드시 물리적인 블록으로 전부 채워 저장해야 하는 것은 아니다. Sparse File을 지원하는 구현은 일부 구간의 블록을 할당하지 않고도 0을 읽는 동작을 제공할 수 있다. 위 예제는 길이와 읽기 결과만 확인하며, 실제로 할당된 디스크 블록 수를 측정하지 않는다. [Linux `lseek()`의 끝 이후 위치와 빈 구간](https://man7.org/linux/man-pages/man2/lseek.2.html)

## 연속 할당에서 벗어나기

기본 inode는 데이터의 첫 Sector인 `start`를 저장하고, 바이트 offset에서 Sector 번호를 계산한다. 데이터가 Sector 10과 11에 있다면 다음 공간은 12여야 이 계산을 그대로 유지할 수 있다. Sector 12를 다른 파일이 쓰고 있다면 빈 Sector가 다른 곳에 남아 있어도 단순히 뒤에 붙일 수 없다.

파일 전체를 더 큰 연속 공간으로 옮기는 방법도 있지만, 파일이 자랄 때 기존 데이터를 복사해야 한다. 떨어진 공간을 이어 사용하는 방식은 파일 안의 순서와 실제 저장 위치의 대응 정보를 별도로 관리한다.

| 방식 | 저장 위치를 찾는 방법 | 확장하면서 관리할 정보 |
|---|---|---|
| FAT Chain | 첫 Cluster에서 다음 Cluster 번호를 따라간다. | 새 Cluster와 앞뒤 연결, 체인의 끝 |
| 직접·간접 Block Pointer | inode 또는 별도 인덱스 블록에서 해당 위치의 포인터를 읽는다. | 데이터 블록과 필요할 때 추가하는 인덱스 블록 |
| Extent | 연속된 구간의 시작 위치와 길이를 찾는다. | 구간의 길이, 새 구간, 구간을 찾는 트리 |

예를 들어 `3 → 7 → 12 → EOChain`이라는 FAT Chain은 파일 안의 첫째, 둘째, 셋째 Cluster가 물리적으로 연속일 필요가 없다는 뜻이다. Cluster 크기가 512바이트인 설계에서 offset 1,024를 찾으려면 세 번째 Cluster인 12까지 따라가야 한다. `start + offset / 512`만 계산해서는 이 위치를 찾을 수 없다.

KAIST PintOS 저장소의 `fat_create_chain()`·`fat_get()`·`fat_put()`·`cluster_to_sector()`는 이러한 할당과 위치 변환을 구현할 자리다. 현재 확인한 revision에서는 핵심 함수들이 `TODO`로 남아 있으므로 FAT 기반 파일 확장이 완성됐다고 말할 수 없다. `inode_write_at()`의 종료 조건 하나만 없애도 저장 위치를 찾을 수 없는 이유다. [FAT 구현 상태](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/fat.c)

실제 파일 시스템을 비교할 때도 ext2와 ext4를 같은 포인터 배열로 묶지 않는다. ext2·ext3의 직접·간접 Block Mapping과 달리, ext4는 Extent 기능이 켜진 inode에서 연속 구간을 트리로 관리한다. 공간을 항상 블록 하나씩 할당한다고 일반화하는 것도 맞지 않는다. [ext4의 Block Mapping과 Extent](https://www.kernel.org/doc/html/latest/filesystems/ext4/ifork.html)

## 공간과 길이를 함께 갱신한다

파일 확장에서는 새 길이를 먼저 기록하는 것만으로 충분하지 않다. 그 길이 안의 데이터를 읽을 수 있어야 하며, 쓰지 않은 구간에서 다른 파일이 사용하던 오래된 데이터가 나타나서는 안 된다.

구현할 때는 요청 끝의 offset이 표현 범위를 넘는지 검사하고, 기존 길이와 새 끝 위치를 비교한다. 필요한 공간을 확보한 뒤 Block 또는 Cluster 연결을 준비하며, 새로 드러나는 빈 구간이 0으로 읽히도록 처리한다. 실제로 기록한 범위와 inode 길이, 반환할 바이트 수가 일치해야 한다.

할당 도중 공간이 부족해지면 새로 확보한 공간을 정리할 수 있어야 한다. 기존 데이터와 연결을 먼저 망가뜨린 뒤 실패를 알리면 다음 읽기까지 손상된다. 여러 쓰기가 같은 inode를 확장할 수 있다면 공간 할당, 연결 변경, 길이 갱신을 보호하는 범위도 정해야 한다. 이는 아직 구현되지 않은 확장의 설계 조건이며, 원래 고정 길이 코드가 이 조건을 만족한다는 주장은 아니다.

[Directory](/wiki/computer-systems-network-topic-db92c0e5225c/)도 inode에 저장한 파일이므로 같은 확장 기능을 사용한다. 새 이름을 추가할 슬롯이 없을 때 디렉터리 파일을 늘릴 수 있다면, 처음 포맷할 때 정한 항목 수에 묶이지 않는다.

확장 결과를 확인할 때는 파일 크기만 보지 말고 기존 데이터, 새로 쓴 데이터, 빈 구간의 읽기 결과와 실패 뒤의 남은 공간을 함께 살펴야 한다. 길이가 늘었다는 사실만으로 올바른 파일 확장이 증명되지는 않는다.
