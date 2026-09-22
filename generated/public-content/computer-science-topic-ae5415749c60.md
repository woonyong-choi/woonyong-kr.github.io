---
layout: default
title: 인접 리스트
nav_order: 7
permalink: /wiki/computer-science-topic-ae5415749c60/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-ae5415749c60
projection_sha256: 60710e0e9668a86b4be27916046834a9f68487050da7de4df122f40c3aa185c3
parent: Graph
content_status: ready
public_parent_id: Wiki/keywords/computer-science-topic-1a8e559de264
search_terms:
- 인접 리스트
- Adjacency List
- degree
- 희소 그래프
grand_parent: 자료구조
ancestor: CS 기초
---

# 인접 리스트
{: .no_toc }

정점 0의 이웃이 1과 2라면 `adjacency[0] = [1, 2]`로 저장할 수 있다. **인접 리스트(Adjacency List)**는 정점마다 연결된 이웃의 목록을 둔다. 이웃이 없는 정점의 목록도 빈 List로 남겨 정점 자체가 사라지지 않게 한다.

## 간선 하나를 몇 번 저장하는가

방향 간선 u → v는 보통 u의 목록에 v를 한 번 넣는다. 무방향 간선 `{u, v}`는 u의 목록에 v를, v의 목록에 u를 넣는다. 자기 간선이 없는 단순 무방향 Graph에서 이웃 항목의 총수는 간선 수의 두 배다.

[Graph의 실행 예제](/wiki/computer-science-topic-1a8e559de264/#같은-연결을-두-가지-방식으로-저장하기)는 간선 5개를 이웃 항목 10개로 저장한다. 그중 정점 3의 이웃은 `[1, 2, 4]`다. 무방향인데 한쪽에만 넣으면 3에서 4로 갈 수 있어도 4에서 3을 찾을 수 없는 잘못된 표현이 된다.

같은 간선을 반복해서 넣을 때 중복 항목을 허용할지도 정해야 한다. 병렬 간선 자체가 의미 있는 Graph와 단순 Graph는 입력 계약이 다르다. 가중치가 필요하면 이웃 번호와 함께 `(이웃, 비용)` 같은 정보를 저장할 수 있다.

## 이웃을 찾는 비용

이웃을 Python List에 담았다면 `v in adjacency[u]`는 해당 목록을 순서대로 확인한다. u의 이웃이 d개일 때 최악의 비교 횟수는 d에 비례한다. 단순 Graph에서 d는 정점 수 이하이지만, 연결 여부를 확인할 때마다 정점 전체를 훑는 것은 아니다.

반대로 u의 이웃을 전부 방문하려는 연산에서는 실제 이웃 목록만 따라가면 된다. 간선이 드문 Graph를 DFS나 BFS로 탐색할 때 적합한 이유다. 정점 수를 n, 간선 수를 m이라 하면 전체 저장 공간은 정점별 목록과 이웃 항목을 합쳐 O(n + m)이다.

정점 1만 개, 무방향 간선 2만 개라면 정점별 목록 1만 개와 이웃 항목 4만 개가 필요하다. 이를 바이트 단위로 정확히 환산하려면 List와 참조의 크기, 여유 용량 등 구현 비용을 알아야 한다. O(n + m)이라는 점근 표기를 실제 메모리 칸 수와 같다고 읽지는 않는다.

연결 여부 확인이 더 중요하면 [인접 행렬](/wiki/computer-science-topic-914d0bd6e193/)과 비교한다. 이웃을 Hash Set에 담으면 평균적인 포함 검사 비용이 달라지지만, Hash와 충돌 처리 및 메모리 비용도 함께 고려해야 한다.
