---
layout: default
title: Tree
nav_order: 7
permalink: /wiki/computer-science-topic-a06ebc760118/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-a06ebc760118
projection_sha256: c9fdc010ff81f958ccd46dc1bc9bdecf7fea445777c2dbbabfcb5211a18a06a3
parent: 자료구조
content_status: ready
public_parent_id: Wiki/computer-science/data-structures
search_terms:
- Tree
- 트리
- Root
- Leaf
- 부모
- 자식
- Binary Tree
grand_parent: CS 기초
---

# Tree
{: .no_toc }

회사 조직도의 보고 체계나 폴더의 포함 관계를 생각하면 하나의 항목 아래에 여러 하위 항목이 놓인다. **Tree**는 이런 계층을 표현하는 자료구조다. Graph 이론에서는 사이클이 없고 모든 정점이 연결된 무방향 Graph로 정의한다.

## 연결되어 있고 사이클이 없다

정점이 한 개 이상인 유한한 Tree에서는 두 정점 사이의 단순 경로가 하나뿐이다. 서로 다른 두 경로가 있다면 그 경로를 따라 사이클을 만들 수 있다. 정점 수가 n일 때 간선 수는 n-1이다. 간선이 n-1개라는 수만으로 Tree라고 판정할 수는 없으며, 연결 여부 같은 나머지 조건도 확인해야 한다.

여기서 사이클은 같은 간선을 그대로 되짚어 돌아오는 동작을 말하는 것이 아니다. 정점과 간선을 따라 돌면서 시작점으로 돌아오는 고리가 없어야 한다. 연결되지 않은 여러 Tree의 모음은 Forest로 구분한다.

## 루트를 정하면 부모와 자식이 생긴다

Graph로서의 Tree는 루트를 미리 지정하지 않아도 된다. 하나의 정점을 Root로 선택하면, 그 정점에서 멀어지는 방향을 기준으로 부모와 자식을 정할 수 있다. 자식이 없는 정점은 Leaf다.

```text
        1
      /   \
     2     3
    / \   /
   4   5 6
```

1을 Root로 삼으면 2와 3은 1의 자식이다. 2는 4와 5의 부모이고, 4·5·6은 Leaf다. 정점은 6개, 간선은 5개다. 4를 Root로 다시 선택해도 연결 자체는 같지만 부모와 자식의 관계는 달라진다.

자식을 최대 두 개까지 두고 왼쪽·오른쪽을 구분하면 Binary Tree다. 여기에 값의 대소에 따른 배치 규칙까지 더한 Binary Search Tree와는 구분한다. 아무 Binary Tree나 중위 순회한다고 값이 정렬되지는 않는다.

## 계층과 추가 연결을 구별한다

데이터베이스 인덱스의 [B+ Tree](/wiki/data-b-tree-cd9340fd2546/)는 탐색을 위한 부모·자식 계층을 갖는다. Leaf 사이의 순차 접근 링크 같은 추가 연결은 이 계층과 별도로 봐야 한다. 파일 시스템도 디렉터리의 포함 계층은 Tree로 설명할 수 있지만, Hard Link와 Symbolic Link까지 모두 따라가는 구조에는 다른 연결이 생길 수 있다.

## 부모를 처리하는 시점

Tree의 순회는 연결된 노드를 정해진 순서로 방문한다. 부모를 자식보다 먼저 처리하면 전위, 자식의 처리를 모두 마친 뒤 처리하면 후위다. 왼쪽·오른쪽 자식을 구분하는 Binary Tree에서는 왼쪽 하위 트리와 오른쪽 하위 트리 사이에 부모를 처리하는 중위 순회도 정의할 수 있다. 가까운 깊이부터 처리하는 레벨 순회도 있다.

수식 `(1 + 2) * 3`에서는 덧셈의 결과가 있어야 곱셈을 할 수 있으므로 자식을 먼저 처리하는 순서가 필요하다. 폴더별 용량을 합산할 때도 하위 항목의 결과를 모은 뒤 부모를 계산할 수 있다. 방문 순서와 재귀·반복 구현은 [트리 순회](/wiki/computer-science-topic-17f8492e4ed6/)에서 다룬다. 일반적인 연결 관계는 [Graph](/wiki/computer-science-topic-1a8e559de264/)로 돌아가 비교할 수 있다.
