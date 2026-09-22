---
layout: default
title: Directory
nav_order: 3
permalink: /wiki/computer-systems-network-topic-db92c0e5225c/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-db92c0e5225c
projection_sha256: 958232e8c98992a2a4866a7e6ba2b9cd54ff360f36860a5b1ba107508994903f
parent: 파일 시스템 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-c76b83867c50
search_terms:
- 디렉터리
grand_parent: PintOS
ancestor: CS 기초
---

# Directory
{: .no_toc }

`open("data.csv")`에 넘기는 이름만으로는 디스크의 어느 데이터를 읽을지 알 수 없다. 먼저 이름을 파일의 inode에 연결해야 한다. `/work/data.csv`처럼 경로가 길어지면 `work`를 찾은 뒤 그 디렉터리 안에서 `data.csv`를 찾아야 한다.

현재 [lrn-pintos의 `5afaa6d` 구현](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)은 루트 디렉터리에서 파일 이름 하나를 찾는다. 이 동작을 먼저 따라가면, 하위 디렉터리와 작업 디렉터리를 추가할 때 무엇이 달라져야 하는지 구분할 수 있다.

## 이름에서 inode까지

파일 이름은 inode 안에 들어 있지 않다. 디렉터리의 항목이 이름과 inode의 Sector 번호를 연결한다. 디렉터리 자체에도 inode와 데이터 영역이 있으며, 그 데이터에는 일반 파일의 내용 대신 디렉터리 항목들이 저장된다.

`filesys_open()`은 다음 순서로 파일을 연다. 아래는 현재 구현의 함수 본문이다. 파일 시스템 초기화와 다른 커널 함수에 의존하므로 독립 실행 예제는 아니다.

```c
struct file *
filesys_open (const char *name) {
    struct dir *dir = dir_open_root ();
    struct inode *inode = NULL;

    if (dir != NULL)
        dir_lookup (dir, name, &inode);
    dir_close (dir);

    return file_open (inode);
}
```

`dir_open_root()`는 `ROOT_DIR_SECTOR`의 inode를 열고 디렉터리 핸들을 만든다. `dir_lookup()`은 이름이 같은 항목을 찾으면 그 항목의 `inode_sector`로 `inode_open()`을 호출한다. 따라서 호출자가 받는 것은 Sector 번호만이 아니라 열린 inode다. `file_open()`이 이를 파일 핸들로 감싸고, 검색에 사용한 디렉터리 핸들은 `dir_close()`로 닫는다.

검색에 실패하면 `inode`는 `NULL`이고 파일 열기도 실패한다. 디렉터리 핸들의 수명과 찾은 파일의 수명은 따로 관리된다. [파일을 여는 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/filesys.c)

## 디스크 항목과 열린 디렉터리

`struct dir_entry`는 디스크에 저장할 항목 하나이고, `struct dir`는 디렉터리를 열어 순회하는 동안 쓰는 메모리 객체다. 두 구조체를 같은 것으로 보면 이름을 저장하는 위치와 순회 위치를 혼동하기 쉽다.

```c
struct dir {
    struct inode *inode;
    off_t pos;
};

struct dir_entry {
    disk_sector_t inode_sector;
    char name[NAME_MAX + 1];
    bool in_use;
};
```

`dir_entry.inode_sector`는 항목이 가리키는 inode의 위치이고, `name`은 끝에 널 문자를 붙인 이름이다. `in_use`가 `false`인 항목은 빈 슬롯으로 취급한다. 삭제할 때 뒤의 항목을 당겨 배열을 줄이지 않으며, 새 파일은 이 슬롯을 다시 사용할 수 있다.

반면 `dir.pos`는 다음 `dir_readdir()` 호출이 읽을 바이트 위치다. 같은 디렉터리를 다시 열면 같은 inode를 참조하면서도 별도의 `pos`를 갖는다. `dir_reopen()` 역시 새 핸들의 `pos`를 0에서 시작한다.

이 소스에서 `disk_sector_t`는 4바이트이고 이름 배열은 15바이트, `bool`은 1바이트다. 해당 배치의 항목 하나는 20바이트다. 기본 포맷 코드의 `dir_create(ROOT_DIR_SECTOR, 16)`은 항목 16개를 위한 320바이트 길이의 디렉터리를 만든다. 저장 공간은 512바이트 Sector 하나를 차지하지만, 파일 길이가 320바이트이므로 남은 공간까지 항목으로 사용할 수 있는 것은 아니다.

`512 / 20`의 몫이 25라고 해서 현재 루트에 파일 25개가 들어간다고 계산하지 않는다. 용량은 Sector 크기뿐 아니라 inode의 길이와 파일 확장 구현에도 달려 있다. 디렉터리를 확장하는 구현에서는 항목이 Sector 경계에 걸칠 수도 있으므로, `inode_read_at()`과 `inode_write_at()`이 바이트 범위를 처리하도록 맡긴다.

## 찾기, 추가하기, 순회하기

내부 함수 `lookup()`은 offset 0부터 항목 크기만큼 이동하며 읽는다. `in_use`가 참이고 `strcmp(name, e.name)`이 0인 항목을 찾으면 검색을 끝낸다. 호출자가 요청했다면 항목 자체와 항목의 바이트 offset도 돌려준다. 항목 수가 N개일 때 끝까지 읽는 이름 검색은 O(N)이다.

`dir_add()`는 빈 이름과 `NAME_MAX`를 넘는 이름을 거부하고, 같은 이름이 이미 있는지 확인한다. 이후 처음 발견한 빈 슬롯에 기록한다. 빈 슬롯이 없으면 파일 끝에서 쓰기를 시도하지만, 현재의 고정 길이 inode는 끝을 넘어 자라지 않으므로 추가에 실패한다. 하위 디렉터리를 만들기 전에 파일 확장이 필요한 이유가 여기서 드러난다.

이름 제한은 글자 수가 아니라 `strlen()`이 세는 **바이트 수**다. 이 구현의 `NAME_MAX`는 14다. UTF-8로 전달한 한글 다섯 글자는 보통 15바이트이므로 길이 검사를 통과하지 못한다. 그렇다고 PintOS가 ASCII 문자만 검사해 허용하는 것은 아니다. 현재 코드는 문자열 길이와 이름 일치를 검사하며 별도의 문자 인코딩 검증을 하지 않는다.

`dir_remove()`는 검색한 파일의 inode를 연 뒤, 해당 항목의 `in_use`를 꺼서 기록한다. 기록이 성공해야 `inode_remove()`로 삭제 표시를 남긴다. 이름을 지운 시점과 디스크 공간을 회수하는 시점은 다르다. 다른 열린 참조가 남아 있다면 마지막으로 닫힐 때까지 내용이 유지된다. 자세한 수명은 [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/)에서 이어진다.

`dir_readdir()`은 핸들의 `pos`에서 읽고, 항목 하나를 읽을 때마다 `pos`를 20바이트 전진시킨다. 비어 있는 항목은 건너뛴다. 반환 순서는 이름 정렬이나 생성 시각 순서가 아니라 **슬롯을 읽는 순서**다. 삭제된 앞쪽 슬롯을 재사용하면 나중에 만든 파일이 먼저 나올 수 있다. [디렉터리 연산](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/directory.c)

아래 예제는 슬롯 세 개만 가진 작은 디렉터리 모델이다. 커널 I/O와 inode 수명은 생략하고 이름 검사, 빈 슬롯 재사용, 순회 순서를 실행한다.

```run-python
from dataclasses import dataclass

NAME_MAX = 14

@dataclass
class Entry:
    name: str = ""
    sector: int = 0
    in_use: bool = False

entries = [Entry() for _ in range(3)]

def lookup(name):
    return next((e for e in entries if e.in_use and e.name == name), None)

def add(name, sector):
    if not name or "\0" in name or len(name.encode("utf-8")) > NAME_MAX:
        return False
    if lookup(name) is not None:
        return False
    for entry in entries:
        if not entry.in_use:
            entry.name, entry.sector, entry.in_use = name, sector, True
            return True
    return False

def remove(name):
    entry = lookup(name)
    if entry is None:
        return False
    entry.in_use = False
    return True

for name, sector in (("a.txt", 5), ("b.txt", 8), ("c.txt", 11)):
    add(name, sector)
print("full directory:", add("d.txt", 14))
print("remove a.txt:", remove("a.txt"))
print("reuse empty slot:", add("d.txt", 14))
print("duplicate b.txt:", add("b.txt", 20))
print("directory order:", [e.name for e in entries if e.in_use])
print("b.txt inode sector:", lookup("b.txt").sector)
for name in ("가나다라", "가나다라마"):
    print(name, "bytes:", len(name.encode("utf-8")))
```

처음에는 빈 슬롯이 없어서 `d.txt` 추가에 실패한다. `a.txt`를 지운 뒤에는 첫 슬롯을 재사용하므로 순회 순서가 `d.txt`, `b.txt`, `c.txt`가 된다. 마지막 두 줄에서 한글 이름의 글자 수와 바이트 수가 다르다는 점도 확인할 수 있다. Python 문자열 안의 널 문자는 C 문자열로 옮길 때 중간에서 이름이 끝나므로 이 모델에서는 입력에서 제외한다.

## 실제 파일 시스템과 비교하기

PintOS의 선형 항목 배열은 이름을 찾는 과정을 읽기 쉽지만, 항목이 많아지면 비교 횟수도 늘어난다. ext4는 디렉터리 형식과 플래그에 따라 선형 항목 또는 이름의 Hash를 키로 하는 HTree 색인을 사용한다. HTree에서는 Hash가 해당하는 Leaf를 찾아 이름을 비교하고, 충돌이 있으면 이어지는 Leaf도 살핀다. 모든 디렉터리가 HTree라고 하거나 검색이 항상 O(1)이라고 단정하지 않는다.

이름 길이도 단위까지 비교해야 한다. ext4 항목의 이름 상한은 255바이트이고, 여기서 읽은 PintOS의 상한은 14바이트다. ext4의 일반적인 파일 이름은 바이트열이며 이를 모두 UTF-8이라고 가정할 수 없다. 인코딩과 대소문자 처리는 적용된 파일 시스템 기능과 환경의 조건을 따로 봐야 한다. [ext4 디렉터리 형식](https://www.kernel.org/doc/html/latest/filesystems/ext4/directory.html)

이제 이름 하나를 찾는 과정을 여러 번 이어 보자. 하위 디렉터리와 cwd를 사용하는 순서는 [경로 탐색](/wiki/computer-systems-network-topic-5cd65ddb9366/)에서 다룬다.
