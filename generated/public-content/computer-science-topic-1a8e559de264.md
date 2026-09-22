---
layout: default
title: Graph
nav_order: 9
permalink: /wiki/computer-science-topic-1a8e559de264/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-topic-1a8e559de264
projection_sha256: ad20eeb417f7a2c8bb49a42c0aaa752562042a698e3b2b760e9ea679b51ea191
parent: 자료구조
content_status: ready
public_parent_id: Wiki/computer-science/data-structures
search_terms:
- Graph
- 그래프
- 정점
- 간선
- 인접 리스트
- 인접 행렬
grand_parent: CS 기초
---

# Graph
{: .no_toc }

지하철 노선도에서 역을 정점으로, 역 사이의 연결을 간선으로 나타내면 Graph가 된다. 친구 관계, 웹 페이지의 링크, 함수 호출 관계도 같은 방식으로 표현할 수 있다. 무엇을 정점으로 삼고 어떤 관계를 간선으로 저장할지가 먼저 정해져야 한다.

Graph는 정점 집합 V와 간선 집합 E로 설명한다. 코드에서는 정점 번호와 간선을 함께 저장한다. 간선의 쌍을 Array에 나열할 수도 있고, 정점마다 이웃을 모으거나 두 정점의 연결 여부를 표로 만들 수도 있다.

## 방향과 비용을 구분한다

친구 관계처럼 양쪽에 같은 관계가 성립하면 무방향 간선으로 표현할 수 있다. A가 B를 팔로우한다고 해서 B도 A를 팔로우하는 것은 아니므로, 팔로우 관계에는 방향이 필요하다. 방향과 가중치는 별개의 성질이다. 방향이 있는 도로에도, 양방향 도로에도 거리나 통행료를 붙일 수 있다.

| 기준 | 표현하는 것 | 예 |
|---|---|---|
| 무방향 | 두 정점 사이의 대칭적인 연결 | A와 B가 친구다 |
| 방향 | 출발 정점에서 도착 정점으로 가는 관계 | A가 B를 팔로우한다 |
| 가중치 없음 | 연결의 존재 | 두 역 사이에 구간이 있다 |
| 가중치 있음 | 간선에 붙은 거리·비용 등의 값 | 구간의 이동 시간이 4분이다 |

정점과 간선은 관계를 구성하는 요소이고, Directed Graph는 방향이 있는 연결을 다룬다.

## 같은 연결을 두 가지 방식으로 저장하기

정점이 0부터 4까지이고 간선이 `(0, 1), (0, 2), (1, 3), (2, 3), (3, 4)`인 무방향 Graph를 만들자. 아래 입력에는 자기 자신으로 향하는 간선과 중복 간선이 없다.

인접 리스트는 각 정점의 이웃을 모은다. 인접 행렬은 행을 출발 정점, 열을 도착 정점으로 삼아 연결 여부를 저장한다. 무방향 간선 `(u, v)` 하나를 추가할 때는 양쪽의 연결을 모두 표시한다.

```run-python
vertex_count = 5
edges = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4)]
adjacency = [[] for _ in range(vertex_count)]
matrix = [[False] * vertex_count for _ in range(vertex_count)]

for u, v in edges:
    adjacency[u].append(v)
    adjacency[v].append(u)
    matrix[u][v] = True
    matrix[v][u] = True

expected = [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]]
assert adjacency == expected
assert sum(map(len, adjacency)) == 2 * len(edges)
for u in range(vertex_count):
    from_matrix = [v for v in range(vertex_count) if matrix[u][v]]
    assert from_matrix == expected[u]
    for v in range(vertex_count):
        assert matrix[u][v] == matrix[v][u]
    print(f"{u}의 이웃: {adjacency[u]}")

print("인접 행렬")
for row in matrix:
    print(" ".join(str(int(connected)) for connected in row))
print("0과 3 연결:", matrix[0][3])
print("1과 3 연결:", matrix[1][3])
print("무방향 간선:", len(edges), "이웃 항목:", sum(map(len, adjacency)))
```

0의 이웃은 두 표현 모두 `[1, 2]`다. 0과 3은 직접 연결되지 않았고, 1과 3은 연결돼 있다. 간선은 5개지만 인접 리스트의 이웃 항목은 10개다. 양방향으로 한 번씩 저장했기 때문이다. 인접 행렬도 대각선을 기준으로 대칭이다.

행렬의 행은 반복문으로 각각 만들었다. `[[False] * vertex_count] * vertex_count`처럼 같은 내부 List를 반복 참조하면 한 칸을 바꿀 때 다른 행까지 바뀔 수 있다.

## 자주 수행하는 연산에 맞춰 고른다

정점 수를 n, 간선 수를 m이라 하자. 각 이웃을 List에 저장하는 단순 Graph에서는 다음과 같이 비교할 수 있다. `degree(u)`는 정점 u에 연결된 간선 수다.

| 필요한 연산 | 인접 행렬 | 인접 리스트 |
|---|---|---|
| 전체 저장 공간 | O(n²) | O(n + m) |
| u와 v의 직접 연결 확인 | O(1) | u의 이웃을 훑으면 O(degree(u)) |
| u의 모든 이웃 열거 | 행 전체를 훑어 O(n) | O(degree(u)) |

간선이 드문 Graph에서 모든 정점 쌍의 칸을 만드는 것은 낭비가 될 수 있다. 반대로 정점 수가 감당할 만하고 연결 여부를 자주 확인한다면 행렬이 단순하다. 이웃을 Hash Set에 담거나 비트 단위 행렬을 쓰면 비용과 메모리 배치가 달라지므로, 위 표는 해당 표현과 연산 조건에 대한 비교다.

저장 방식의 세부 조건은 [인접 리스트](/wiki/computer-science-topic-ae5415749c60/)와 [인접 행렬](/wiki/computer-science-topic-914d0bd6e193/)에서 다룬다. 저장된 연결을 따라 방문할 순서는 [DFS](/wiki/computer-science-dfs-278d75d9bc61/)와 [BFS](/wiki/computer-science-bfs-00637871e6a7/)가 결정한다.

사이클 없이 모든 정점이 연결된 무방향 Graph는 [Tree](/wiki/computer-science-topic-a06ebc760118/)다. 일반 Graph에는 Tree의 부모·자식 관계나 유일한 경로를 그대로 가정할 수 없다.
