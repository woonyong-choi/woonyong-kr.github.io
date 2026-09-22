---
layout: default
title: File
nav_order: 2
permalink: /wiki/computer-systems-network-topic-23d09155893b/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-23d09155893b
projection_sha256: dba2192d49ce77732a88fbe02b3f2a0b91f6a113e9c826e96300cbe6dbc55bb7
parent: 파일 시스템
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-2f8a1e4d5189
search_terms:
- 파일
grand_parent: OS
ancestor: CS 기초
---

# File
{: .no_toc }

파일 이름을 바꿔도 파일 내용이 그대로 남고, 이름을 지운 뒤에도 이미 연 파일에서 데이터를 읽을 수 있다. 이름과 파일 자체, 열린 참조가 서로 다른 수명을 갖기 때문이다. 여기서는 Unix 계열의 일반 파일을 기준으로 이 관계를 살펴본다.

## 이름은 파일을 찾는 경로다

Directory Entry는 이름을 파일 시스템 객체에 연결한다. inode 번호는 그 파일 시스템 안의 식별자이므로, 다른 장치의 같은 inode 번호만 보고 같은 파일이라고 판단해서는 안 된다. Python의 `stat()`에서는 `st_dev`와 `st_ino`를 함께 비교할 수 있다.

프로그램이 파일을 열면 이름 대신 fd를 보관해 읽기와 쓰기를 이어 간다. 파일의 바이트와 Metadata를 식별하는 inode와, 이번 열기의 offset을 가진 열린 파일 객체도 별개다. [파일 접근](/wiki/computer-systems-network-topic-a803731abfdb/)의 `open()`·`dup()` 예제는 같은 파일을 가리키는 참조들이 언제 offset을 공유하는지 보여 준다.

## Hard Link는 같은 파일의 다른 이름이다

Hard Link를 만들면 기존 inode를 가리키는 Directory Entry가 하나 더 생긴다. 내용을 복사한 새 파일이 아니므로 어느 이름으로 수정해도 같은 내용이 바뀐다. 원래 이름이 특별한 주인이 되는 것도 아니다. 이름 하나를 `unlink()`하면 Link 수인 `nlink`가 줄지만, 다른 이름이 남아 있으면 그 이름으로 계속 열 수 있다.

Linux의 `link()`는 같은 Mount 안에서 대상을 연결하며, 서로 다른 파일 시스템이나 Mount를 가로지르면 `EXDEV`로 실패한다. 같은 파일 시스템을 두 곳에 Mount한 경우도 이 제한에 포함된다. 일반 사용자가 Directory의 Hard Link를 자유롭게 만들 수 있는 것도 아니다. 권한·보호 정책과 Directory 순환 방지 등의 제약을 함께 봐야 한다. [link(2)](https://man7.org/linux/man-pages/man2/link.2.html)

## Symbolic Link는 다시 찾을 경로를 담는다

Symbolic Link, 또는 Soft Link는 대상의 경로 문자열을 담는 별도 파일이다. 대상 inode의 Hard Link 수는 늘리지 않는다. 절대 경로를 담을 수도 있고 상대 경로를 담을 수도 있다. **상대 경로는 Link를 담은 Directory를 기준으로 해석한다.** 프로그램의 현재 작업 Directory를 기준으로 매번 바꾸어 읽는 것이 아니다.

대상이 없어도 Symbolic Link를 만들 수 있다. 경로를 따라갔을 때 대상을 찾지 못하는 Link를 Dangling Link라고 한다. 이후 같은 경로에 파일을 다시 만들면 Link는 그 새 파일로 이어질 수 있다. 따라서 Hard Link와 달리 이름 교체를 따라가는 참조다. 다른 파일 시스템이나 Directory를 가리킬 수 있지만 경로 탐색의 권한과 순환 제한은 여전히 적용된다. [symlink(2)](https://man7.org/linux/man-pages/man2/symlink.2.html), [Symbolic Link의 경로 처리](https://man7.org/linux/man-pages/man7/symlink.7.html)

아래 예제는 임시 Directory 안에 실제 파일과 두 Link를 만든다. Hard Link와 Symbolic Link를 지원하는 실행 환경에서 동작하며, 만든 파일은 종료할 때 정리한다.

```run-python
import os
from pathlib import Path
from tempfile import TemporaryDirectory

with TemporaryDirectory() as directory:
    root = Path(directory)
    original = root / "original.txt"
    hard = root / "hard.txt"
    soft = root / "soft.txt"
    original.write_text("before", encoding="utf-8")
    os.link(original, hard)
    soft.symlink_to(original.name)

    first, second = original.stat(), hard.stat()
    same = (first.st_dev, first.st_ino) == (second.st_dev, second.st_ino)
    print("same inode:", same, "hard links:", first.st_nlink)
    print("symbolic target:", os.readlink(soft))
    assert same and first.st_nlink == 2
    assert soft.read_text(encoding="utf-8") == "before"

    original.unlink()
    print("hard link:", hard.read_text(encoding="utf-8"))
    print("symbolic link exists:", soft.is_symlink(), "target exists:", soft.exists())
    assert hard.stat().st_nlink == 1 and not soft.exists()

    original.write_text("after", encoding="utf-8")
    print("after recreating the name:", hard.read_text(encoding="utf-8"),
          soft.read_text(encoding="utf-8"))
    assert hard.read_text(encoding="utf-8") == "before"
    assert soft.read_text(encoding="utf-8") == "after"
```

첫 파일의 이름을 지워도 `hard.txt`에서는 `before`를 읽는다. `soft.txt` 자체는 남지만 그 경로의 대상은 사라진다. 같은 이름으로 새 파일을 만들면 Hard Link는 계속 `before`, Symbolic Link는 새 파일의 `after`를 읽는다.

Link의 저장 비용도 다르다. Hard Link에는 새 이름의 Directory Entry가 필요하고, Symbolic Link에는 경로와 자체 Metadata를 보관할 공간이 필요하다. 경로를 inode 안에 넣을지 별도 Block에 둘지는 파일 시스템 구현에 달려 있으므로 경로 문자열 길이만으로 전체 비용을 계산하지 않는다.

## 마지막 이름과 마지막 참조

`unlink()`는 이름을 제거하고 `close()`는 열린 참조를 놓는다. 이름이 모두 사라져도 열린 fd나 파일 Mapping이 수명을 유지할 수 있다. 실제 공간 회수 시점은 파일 시스템과 참조 정리 경로에 달려 있다. fd를 닫으면 언제나 Mapping까지 사라진다는 설명은 맞지 않는다. [unlink(2)](https://man7.org/linux/man-pages/man2/unlink.2.html), [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html)

PintOS의 기본 파일 시스템에는 일반적인 Hard Link용 `nlink`가 없다. 메모리의 `open_cnt`와 삭제 예약인 `removed`는 각각 열린 참조와 현재 삭제 절차를 위한 값이다. 이 둘을 Linux의 Link 수와 동일하게 읽지 않는다. 현재 구현에서 삭제와 마지막 `close()`가 만나는 과정은 [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/)에 연결된다.
