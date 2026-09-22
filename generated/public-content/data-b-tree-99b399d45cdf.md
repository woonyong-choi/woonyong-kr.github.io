---
layout: default
title: B+ Tree 구현
nav_order: 4
permalink: /wiki/data-b-tree-99b399d45cdf/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/data-b-tree-99b399d45cdf
projection_sha256: 4475b745551df66c8479223c03a681041310712407ddec1438033a9bb8a317e2
parent: SQL 엔진 구현
content_status: ready
public_parent_id: Wiki/projects/minidb
grand_parent: Database
ancestor: Data
---

# B+ Tree 구현
{: .no_toc }

`id`로 행을 찾을 때 Index가 반환하는 값은 행 자체일 수도 있고, 행이 저장된 위치일 수도 있다. lrn-sql의 B+ Tree는 Key와 `row_ref`를 연결한다. 먼저 [B+ Tree](/wiki/data-b-tree-cd9340fd2546/)의 구조를 살펴본 뒤, 그 구조가 C의 필드와 파일의 Page로 표현되는 과정을 따라간다.

## 페이지 ID와 리프 엔트리

이 문서에 제시된 lrn-sql은 노드 하나를 디스크 페이지 하나에 대응시킨다. 자식 참조에는 메모리 포인터 대신 페이지 ID(`page_id`)를 사용한다. 디스크에 저장할 때는 실행 중인 포인터 주소가 아니라 파일 안의 위치 번호가 필요하기 때문이다.

리프 노드의 엔트리는 다음과 같이 구성된다.

```c
/* lrn-sql: include/storage/page_format.h — leaf_entry_t */
typedef struct {
    uint64_t  key;      /* 인덱스 키 (id 값) — 8바이트 */
    row_ref_t row_ref;  /* 힙 페이지 내 행 위치 — 6바이트 */
} __attribute__((packed)) leaf_entry_t;   /* 한 칸 = 14바이트 */
```

리프 엔트리 하나는 8바이트 키와 6바이트 행 위치를 합쳐 14바이트다. `__attribute__((packed))`는 패딩을 제거해 구조체 배치와 디스크 바이트가 일치하도록 한다.

이 구현은 생성 시 실행 환경의 Page 크기를 사용하므로 4096바이트가 항상 고정값은 아니다. 여기서는 4096바이트 Page를 예로 들어 헤더 20바이트를 제외한 공간을 엔트리 크기 14바이트로 나누면, 리프 페이지에 들어가는 키 수를 계산할 수 있다.

```c
/* lrn-sql: src/storage/bptree.c — max_leaf_keys() */
static uint32_t max_leaf_keys(pager_t* p) {
  /* (페이지 크기 - 헤더) / 엔트리 크기 = 4076 / 14 ≈ 291개 */
  return (p->page_size - sizeof(leaf_page_header_t)) / sizeof(leaf_entry_t);
}
```

제시된 크기를 기준으로 리프 한 장에는 291개가 들어간다. 내부 노드에서는 16바이트 헤더를 제외하고 12바이트 엔트리 340개를 담을 수 있다. 가장 왼쪽 자식 참조가 따로 있으므로 최대 자식 수는 341개다. 앞에서 사용한 분기 수 약 300은 이 구현의 페이지와 엔트리 크기에서 나온 값이다.

## 탐색과 행 위치

탐색은 루트에서 시작해 내부 노드의 경계값으로 자식을 선택하며 리프까지 내려간다. 리프에 도착한 뒤에는 페이지 안에서 이진 탐색으로 키를 찾는다.

```c
bool bptree_search(pager_t* pager, uint64_t key, row_ref_t* out_ref) {
  uint32_t leaf_pid;
  uint8_t* page = find_leaf_rlatch(pager, key, &leaf_pid);
  if (!page) return false;

  leaf_page_header_t lph;
  memcpy(&lph, page, sizeof(lph));
  leaf_entry_t* entries = leaf_entries(page);

  uint32_t idx = leaf_find(entries, lph.key_count, key);
  bool found = (idx < lph.key_count && entries[idx].key == key);
  if (found && out_ref) *out_ref = entries[idx].row_ref;

  pager_unlatch_r(pager, leaf_pid);
  return found;
}
```

`find_leaf_rlatch()`는 읽기 Latch를 사용해 루트에서 Leaf Page까지 내려가고, `leaf_find()`는 그 페이지 안에서 키 위치를 찾는다. 키가 있으면 `row_ref`, 즉 힙 페이지 ID와 슬롯 번호를 반환한다. 읽기가 끝나면 `pager_unlatch_r()`로 Latch를 해제한다. Index가 반환하는 것은 행 자체가 아니라 행이 저장된 위치다.

## 분할과 같은 리프 깊이

삽입할 리프에 공간이 있으면 키를 정렬된 위치에 넣는다. 리프가 가득 차면 새 페이지를 할당해 엔트리를 나누고, 경계가 되는 키를 부모에 전달한다. 부모도 가득 찼다면 같은 분할이 위쪽으로 이어진다.

```c
/* 삽입 흐름을 설명하기 위한 의사 코드 — 실행 가능한 함수가 아니다. */
/*  bptree_insert()
 *    → leaf에 공간 있음 → 정렬 삽입 → 끝
 *    → leaf 가득 참     → split_leaf(): 새 페이지 할당, 엔트리 절반 분배
 *        → promote_key를 부모에 전파 → insert_into_parent()
 *            → 부모도 가득 참 → split_internal() → 재귀
 *                → 루트까지 올라가면 새 루트 생성 (높이 +1)            */
```

높이는 루트가 분할되어 새 루트가 생길 때만 1 증가한다. 이 과정은 모든 리프를 같은 깊이에 유지하므로 어떤 키를 찾더라도 루트에서 리프까지 거치는 층 수가 같다. 그 결과 탐색은 최악의 경우에도 O(log N)의 경로 길이를 유지한다.

B-Tree 계열을 판단할 때는 비교 횟수보다 한 페이지에서 처리할 수 있는 분기 수와 그에 따른 트리 높이를 함께 봐야 한다. B+Tree는 내부 노드를 라우팅에 집중시키고 데이터를 연결된 리프에 모아, 단일 키 탐색과 범위 검색에 필요한 페이지 접근을 줄인다.

- [Index](/wiki/indexes/)
- [Page 형식과 구조체](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/include/storage/page_format.h)
- [탐색과 분할 구현](https://github.com/woonyong-kr/lrn-sql/blob/49ac2cbf310c1d8df720432833664e319484fdcc/src/storage/bptree.c)

위 탐색 함수는 링크한 커밋의 코드이며, Page 수용량 계산은 그 구조체 배치를 기준으로 한다. 본문의 Tree 깊이와 입출력 횟수는 실행 성능을 측정한 결과가 아니다.
