---
layout: default
title: 인접 행렬
nav_order: 6
permalink: /wiki/computer-science-topic-914d0bd6e193/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-914d0bd6e193
projection_sha256: 1bd324192f06ec3bbd8e58cd6b7d798cca9b66668938d55ba6b3a18ed4dc61ec
parent: Graph
content_status: ready
public_parent_id: Wiki/keywords/computer-science-topic-1a8e559de264
search_terms:
- 인접 행렬
- Adjacency Matrix
- 가중치
- 직접 연결
grand_parent: 자료구조
ancestor: CS 기초
---

# 인접 행렬
{: .no_toc }

**인접 행렬(Adjacency Matrix)**은 정점 쌍마다 칸을 하나씩 둔다. 정점 번호가 0부터 n-1까지라면 n×n 표에서 `matrix[u][v]`가 u에서 v로 향하는 간선의 존재를 나타낸다. 정점 번호와 행·열의 대응을 유지하면 두 정점의 연결 여부를 O(1)에 확인할 수 있다.

## 한 행에서 이웃을 읽는다

[Graph의 실행 예제](/wiki/computer-science-topic-1a8e559de264/#같은-연결을-두-가지-방식으로-저장하기)에서 정점 0의 행은 다음과 같다.

```text
열:      0  1  2  3  4
0의 행:  0  1  1  0  0
```

열 1과 2에만 1이 있으므로 정점 0은 1, 2와 직접 연결돼 있다. 정점 3으로 가는 경로가 있더라도 0에서 3으로 향하는 간선이 없다면 해당 칸은 0이다. 직접 연결과 여러 간선을 거치는 경로는 구분해야 한다.

무방향 Graph에서는 `matrix[u][v]`와 `matrix[v][u]`가 같다. 방향 Graph에는 이런 대칭을 가정하지 않는다. 대각선은 정점에서 자기 자신으로 향하는 간선을 나타낼 수 있으며, 자기 간선을 허용하지 않는 위 예제에서는 모두 0이다.

## 없는 간선에도 칸이 필요하다

정점 수가 n이라면 보통 n²개의 칸이 필요하다. 간선이 하나도 없어도 표의 크기는 같다. 정점 1만 개면 1억 칸이므로 간선이 드문 Graph에서는 [인접 리스트](/wiki/computer-science-topic-ae5415749c60/)보다 많은 공간이 들 수 있다.

특정 연결 하나는 바로 읽을 수 있지만, 한 정점의 이웃을 모두 찾으려면 해당 행의 n개 칸을 확인해야 한다. 연결 조회와 이웃 열거는 서로 다른 연산이다. Boolean을 객체 참조로 저장하는지 비트로 압축하는지에 따라 실제 바이트 수와 연산 방법도 달라진다.

## 가중치 0과 간선 없음을 구별한다

가중치 Graph에서는 칸에 거리나 비용을 저장할 수 있다. 이때 비용 0인 간선이 가능하다면 0을 ‘간선 없음’으로 함께 사용할 수 없다. `None`처럼 별도의 부재 표시를 두거나, 연결 여부와 가중치를 따로 저장해야 한다. 표현을 정할 때 허용할 가중치와 자기 간선의 규칙부터 확인한다.
