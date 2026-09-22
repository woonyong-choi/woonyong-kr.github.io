---
layout: default
title: 파일 시스템
nav_order: 7
permalink: /wiki/computer-systems-network-topic-2f8a1e4d5189/
publication_state: publish
has_toc: false
projection_id: Wiki/keywords/computer-systems-network-topic-2f8a1e4d5189
projection_sha256: e6649601ab93b3f073061b945a53e7e39fe7e2c6ed104e5f92db594974230faf
parent: OS
content_status: ready
public_parent_id: Wiki/computer-systems-network/os
grand_parent: Systems
ancestor: CS 기초
---

# 파일 시스템
{: .no_toc }

파일 시스템은 이름으로 찾은 파일의 바이트를 어디에서 읽고 어떻게 보존할지 정한다. 프로그램은 `report.txt`의 offset 100부터 50바이트를 요청하지만, 저장 장치는 파일 이름을 알지 못한다. 파일 시스템이 이름, 파일의 Metadata, 데이터의 저장 위치를 연결한다.

## 같은 파일 API 뒤에 다른 저장 방식이 있다

Linux의 VFS는 파일 시스템마다 다른 구현을 공통 인터페이스에 연결한다. `open()`·`read()`를 쓰는 프로그램이 ext4의 Extent나 NFS의 네트워크 요청을 직접 다룰 필요는 없다. 다만 공통 API가 모든 파일의 저장 방식과 지원 기능까지 같게 만들지는 않는다.

| 객체 | 구분해서 읽을 정보 |
|---|---|
| Directory Entry와 dentry | 파일 이름과 경로 탐색의 연결. Linux dentry는 메모리의 경로 탐색 객체다. |
| inode | 파일 종류·크기·권한 등 Metadata와 파일 시스템별 데이터 접근 정보 |
| 열린 파일 객체 | 이번에 연 파일의 offset·상태·연산과 참조 수명 |
| Superblock | 파일 시스템 인스턴스의 전체 설정과 관리 정보 |

디스크의 Directory Entry와 메모리의 dentry를 같은 구조체로 취급하지 않는다. 이미 열린 파일의 `read()`도 매번 처음부터 이름을 탐색하지 않는다. fd에서 열린 파일 상태로 이어지는 과정은 [파일 접근](/wiki/computer-systems-network-topic-a803731abfdb/)에서 실행 예제로 확인한다. [Linux VFS](https://docs.kernel.org/filesystems/vfs.html)

ext4처럼 블록 장치에 저장하는 파일 시스템에서는 파일 내부의 논리 Block을 장치의 위치로 바꾼다. NFS는 다른 컴퓨터에 요청할 수 있고, procfs는 커널 정보를 파일 형태로 제공한다. 모든 `read()`가 디스크의 Sector 읽기로 내려가는 것은 아니다. Cache에서 해결되는 읽기와 실제 장치 요청도 구분해야 한다.

## Mount는 경로 트리에 파일 시스템을 연결한다

`/mnt/data`에 다른 파일 시스템을 Mount하면 그 경로부터는 연결한 파일 시스템의 루트를 따라간다. Mount Point에 기존 파일이 있어도 Mount할 수 있다. 기존 내용은 그 경로에서 가려질 뿐 지워지지 않으며, Unmount하면 다시 보인다. [Mount Point의 동작](https://man7.org/linux/man-pages/man8/mount.8.html)

Mount 대상에 반드시 물리 디스크가 필요한 것은 아니다. tmpfs·procfs·NFS도 Mount할 수 있고, Bind Mount는 이미 있는 경로를 다른 위치에 연결한다. 같은 파일 시스템이 여러 위치에 나타날 수도 있다. Linux의 Mount Namespace는 프로세스가 보는 Mount 목록을 분리하므로, 같은 문자열의 경로가 모든 프로세스에서 같은 대상을 뜻한다고 가정해서는 안 된다. [mount(2)](https://man7.org/linux/man-pages/man2/mount.2.html), [Mount Namespace](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html)

부팅할 때의 루트도 특정 디스크 번호 자체가 아니라 경로 `/`의 출발점이다. Linux는 초기 rootfs와 initramfs를 이용할 수 있으며 이후 실제 루트로 전환하는 과정은 부팅 구성에 달려 있다. [rootfs와 initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html)

## 파일의 순서와 장치의 배치를 연결하기

파일에서 offset 1,024를 찾는다는 것은 512바이트 단위로 나눴을 때 **0부터 센 논리 Block 2**를 찾는다는 뜻이다. 두 Sector를 읽어야 한다는 뜻이 아니다. 요청 길이와 시작 위치를 알아야 읽을 범위를 계산할 수 있고, 실제 장치 위치는 파일의 배치 정보로 찾아야 한다.

FAT는 Cluster의 다음 번호를 따라가는 Chain으로 떨어진 공간을 연결한다. FFS는 관련 inode와 데이터가 가까이 있도록 Cylinder Group을 두어 당시 디스크의 탐색 비용을 줄였다. 큰 Block의 전송 효율과 작은 파일의 낭비를 함께 고려해 Fragment도 사용했다. 이 배경을 현대 장치의 물리 위치까지 정확히 아는 설계로 해석하지 않는다. [FFS 원논문](https://cs162.org/static/readings/FFS84.pdf), [FFS 설계의 변화](https://www.usenix.org/conference/fast15/technical-sessions/presentation/mckusick)

ext2는 Block Group과 inode의 직접·간접 Block Mapping을 사용하며, ext3에는 Journaling이 더해졌다. ext4는 Extent 기능이 켜진 inode에서 파일의 논리 시작 Block, 물리 시작 Block, 길이를 묶어 관리한다. NTFS에서는 MFT Record와 그 속성으로 파일을 표현하며, 작은 데이터를 Record 안에 두거나 별도 할당 구간으로 연결할 수 있다. 서로 다른 포맷의 inode·MFT·FAT를 같은 배열의 다른 이름으로 이해하면 안 된다. [ext4의 Block Mapping](https://docs.kernel.org/filesystems/ext4/ifork.html), [NTFS 파일 구조](https://learn.microsoft.com/en-us/windows/win32/fileio/master-file-table)

Journaling은 중단된 변경을 복구하기 위한 기록이며, 모든 파일 데이터가 매번 즉시 영구 저장된다는 보장은 아니다. [Journaling](/wiki/computer-systems-network-topic-63adab3bfc7e/)과 파일 동기화 조건을 함께 살펴야 한다. 최대 파일 크기나 볼륨 크기도 포맷 이름만으로 정하지 않고 주소 필드, Block 크기, 활성 기능과 구현의 제한을 확인한다.

## PintOS에서 범위를 좁혀 읽기

[lrn-pintos의 `5afaa6d`](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)에서 `filesys_init()`은 `disk_get(0, 1)`로 `hd0:1`을 선택한다. 이어 inode 관리와 free map 또는 FAT 정보를 초기화한다. 디스크를 선택하는 함수 하나가 Linux의 VFS와 Mount 전체를 대신하는 것은 아니다.

기본 파일 시스템은 단일 루트에서 이름을 찾고, 생성 시 정한 길이의 데이터를 연속 Sector에 저장한다. 일반적인 하위 Directory·Hard Link·Symbolic Link, 통합 Block Cache, Journaling이 모두 구현된 상태는 아니다. 파일 시스템 호출자는 공유 상태를 보호하는 Lock도 고려해야 한다. `EFILESYS` 분기의 FAT 핵심 함수에는 아직 `TODO`가 있어 기본 구현과 완성된 확장 구현을 구별한다. [파일 시스템 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/filesys.c)

파일 객체와 Sector별 읽기는 [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/), 이름 탐색은 [Directory](/wiki/computer-systems-network-topic-db92c0e5225c/), 빈 공간과 FAT 배치는 [저장 공간 관리](/wiki/computer-systems-network-topic-33acdcc0a664/)에서 이어서 다룬다.
