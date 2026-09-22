---
layout: default
title: DFS
nav_order: 3
permalink: /wiki/computer-science-dfs-278d75d9bc61/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-science-dfs-278d75d9bc61
projection_sha256: d39606cb8ab8635b79a59abbfc85c59e8547f15be504c68b965b9b966ec3b4ec
parent: 그래프 알고리즘
content_status: ready
public_parent_id: Wiki/keywords/computer-science-topic-f8706f61ab70
search_terms:
- DFS
- 깊이 우선 탐색
- Depth-First Search
- DFS와 BFS
- visited
- 호출 Stack
grand_parent: 알고리즘
ancestor: CS 기초
---

# DFS
{: .no_toc }

지하철의 역을 정점, 역 사이의 연결을 간선으로 나타내고 한 역에서 갈 수 있는 모든 역을 찾는다고 하자. 친구 관계, 웹 페이지 링크, 파일 시스템의 디렉터리, 미로의 갈림길도 이런 [Graph](/wiki/computer-science-topic-1a8e559de264/)로 표현할 수 있다.

DFS(Depth-First Search, 깊이 우선 탐색)는 **한 갈래를 더 갈 수 없을 때까지 따라간 뒤, 마지막 갈림길로 돌아와 남은 이웃을 살피는 탐색**이다. 가까운 정점부터 처리하는 [BFS](/wiki/computer-science-bfs-00637871e6a7/)와는 다음 후보를 고르는 순서가 다르다.

## 방문 순서와 되돌아오기

다음은 무방향 그래프의 인접 목록이다. `adj[u]`에는 정점 u의 이웃을 작은 번호부터 저장한다. 정점 6은 다른 정점과 연결되지 않았다.

| 정점 u | 이웃 목록 |
| --- | --- |
| 0 | 1, 2 |
| 1 | 0, 3, 4 |
| 2 | 0, 5 |
| 3 | 1 |
| 4 | 1 |
| 5 | 2 |
| 6 | 없음 |

0에서 시작하면 처음 방문하는 순서는 **0 → 1 → 3 → 4 → 2 → 5**다. 3의 유일한 이웃인 1은 이미 방문했으므로 돌아온다. 1에서 남은 이웃 4를 살핀 뒤, 0으로 돌아와 2와 5를 방문한다. 이는 처음 방문한 정점의 기록이다. 3 다음에 4가 출력되어도 3과 4를 직접 잇는 간선이 있다는 뜻은 아니다.

방문 순서는 인접 목록의 순서에 영향을 받는다. 작은 번호를 먼저 방문하는 것은 DFS 자체의 보장이 아니라, 이 예제에서 이웃을 그 순서로 저장했기 때문이다. 필요할 때 인접 목록을 미리 정렬하며, 정렬 비용은 탐색 비용과 별도로 계산한다.

`visited[u]`는 이미 발견한 정점을 다시 탐색하지 않도록 기억한다. 재귀 DFS는 정점에 들어오자마자 표시한 뒤 미방문 이웃으로 내려간다. 사이클이 있어도 같은 정점에서 탐색을 거듭 시작하지 않는다. [DFS의 방문 표시와 재귀 탐색](https://algs4.cs.princeton.edu/41graph/)

트리라는 이유만으로 항상 방문 표시를 없앨 수는 없다. 위의 0~5는 사이클 없는 트리지만, 무방향 간선을 양쪽 인접 목록에 저장했으므로 0에서 1로 간 뒤 다시 0을 만난다. 이때도 방문 표시나 부모 정점을 제외하는 조건이 필요하다. 자식 방향으로만 내려가는 루트 있는 트리처럼 되돌아갈 간선을 읽지 않는 표현에서는 별도의 방문 표시를 생략할 수 있다.

## 재귀가 기억하는 것을 Stack에 넣기

재귀 호출은 현재 정점뿐 아니라 돌아온 뒤 이어서 살필 이웃의 위치도 남긴다. 호출이 끝나면 직전 호출로 돌아가 그 위치부터 반복을 이어 간다. 이 실행 문맥은 [재귀와 반복](/wiki/computer-science-topic-931a857d1d9a/)의 호출 Stack과 연결된다.

명시적인 [Stack](/wiki/computer-science-topic-39fd55620efd/)으로 같은 순서를 만들려면, 정점과 다음 이웃의 위치를 함께 저장할 수 있다. 아래 `Frame.vertex`는 현재 정점이고 `Frame.next`는 다음에 확인할 이웃의 인덱스다. 이웃 하나로 내려갈 때 Frame을 넣고, 그 정점의 이웃을 모두 확인했을 때 꺼낸다. 이는 이웃 순회 위치를 기억하는 반복 DFS의 한 형태다. [반복 DFS에서 이웃 순회 위치 보존](https://algs4.cs.princeton.edu/41graph/NonrecursiveDFS.java.html)

이웃을 한꺼번에 Stack에 넣는 구현과는 다르다. 작은 번호부터 넣으면 LIFO 때문에 큰 번호를 먼저 꺼낸다. 또한 꺼낼 때 방문 표시를 하는 방식에서는 같은 정점이 여러 후보로 쌓일 수 있어, 정점 수만큼의 Stack 공간으로 충분하다고 단정할 수 없다. 방문 표시를 정점을 넣을 때 하도록 바꾸는 것만으로 재귀와 같은 DFS 순서나 탐색 트리가 보장되는 것도 아니다. 아래 구현은 미방문 이웃 **하나**를 발견할 때 바로 표시하고 내려가므로, 재귀와 같은 인접 목록 순서를 유지하며 각 정점의 Frame을 한 번만 넣는다. [반복 DFS의 순서와 중복 후보](https://algs4.cs.princeton.edu/41graph/)

## C로 재귀와 반복 비교하기

다음 프로그램은 위 인접 목록을 사용한다. `adj_len[u]`만큼만 이웃을 읽으므로 배열의 남는 칸은 간선이 아니다. 입력은 프로그램 안에 고정되어 있으며, 정점 번호는 0~6이고 최대 이웃 수는 3이다.

첫 실행은 기본 그래프를 탐색한다. 다음에는 2–4 간선을 양쪽 목록에 추가해 사이클이 있는 경우를 확인하고, 마지막에는 고립된 정점 6에서 시작한다. `compare()`는 탐색마다 새 방문 배열을 만들어 이전 실행의 표시를 넘겨받지 않는다.

```run-c
#include <stdio.h>

enum { V = 7, MAX_DEGREE = 3 };
static int adj[V][MAX_DEGREE] = {
    {1, 2}, {0, 3, 4}, {0, 5}, {1}, {1}, {2}, {0}
};
static int adj_len[V] = {2, 3, 2, 1, 1, 1, 0};

static void dfs_recursive(int u, int visited[V]) {
    visited[u] = 1;
    printf("%d ", u);
    for (int i = 0; i < adj_len[u]; ++i) {
        int v = adj[u][i];
        if (!visited[v]) {
            dfs_recursive(v, visited);
        }
    }
}

static void dfs_iterative(int start, int visited[V]) {
    struct Frame { int vertex; int next; } stack[V];
    int top = 0;
    visited[start] = 1;
    printf("%d ", start);
    stack[top++] = (struct Frame){start, 0};

    while (top > 0) {
        struct Frame *frame = &stack[top - 1];
        int u = frame->vertex;
        if (frame->next == adj_len[u]) {
            --top;
            continue;
        }
        int v = adj[u][frame->next++];
        if (!visited[v]) {
            visited[v] = 1;
            printf("%d ", v);
            stack[top++] = (struct Frame){v, 0};
        }
    }
}

static void compare(const char *name, int start) {
    int recursive_visited[V] = {0};
    int iterative_visited[V] = {0};
    puts(name);
    printf("recursive: ");
    dfs_recursive(start, recursive_visited);
    printf("\niterative: ");
    dfs_iterative(start, iterative_visited);
    printf("\nvisited[6]: recursive=%d iterative=%d\n",
           recursive_visited[6], iterative_visited[6]);
}

int main(void) {
    compare("base from 0", 0);
    adj[2][1] = 4;
    adj[2][2] = 5;
    adj_len[2] = 3;
    adj[4][1] = 2;
    adj_len[4] = 2;
    compare("cycle from 0", 0);
    compare("isolated from 6", 6);
    return 0;
}
```

기본 그래프와 사이클이 있는 그래프 모두 다음 방문 순서를 출력한다.

```text
recursive: 0 1 3 4 2 5
iterative: 0 1 3 4 2 5
visited[6]: recursive=0 iterative=0
```

두 경우에서 0~5가 각각 한 번씩 출력된다. 정점 6은 0에서 도달할 수 없으므로 방문하지 않는다. 6에서 시작한 마지막 탐색은 6만 출력하고 두 방문 배열의 `visited[6]`은 1이 된다. 방문 표시가 있는 것과 그래프 전체를 방문한 것은 다르다.

여러 연결 요소가 있는 무방향 그래프를 모두 탐색하려면, 방문 배열을 유지하면서 아직 방문하지 않은 정점을 새 시작점으로 삼는다. 새 탐색을 시작한 횟수로 연결 요소의 수를 셀 수도 있다. 이 작업은 BFS로도 가능하다.

## O(V + E)는 어디에서 나오는가

인접 목록 전체를 탐색할 때 정점 수를 V, 간선 수를 E라고 하자. 방문 표시 덕분에 각 정점의 이웃 목록을 한 번씩 처리한다. 방향 그래프의 저장된 간선은 합해서 E개, 무방향 그래프에서는 같은 간선이 양쪽 목록에 있어 2E개다. 방문 배열 초기화와 정점 처리를 더하면 전체 탐색의 시간은 O(V + E)다.

V=1,000, E=5,000인 무방향 그래프라면 이웃 항목은 10,000개다. 이 수와 정점 수로 비용이 선형 증가한다는 뜻이며, 프로그램이 정확히 6,000개의 CPU 명령을 실행한다는 뜻은 아니다. [시간 복잡도](/wiki/computer-science-topic-869aa2bd6535/)는 이처럼 입력 크기에 따른 증가를 설명한다.

한 시작점에서 도달하는 정점과 간선이 각각 Vᵣ, Eᵣ개라면 실제 탐색 루프는 그 부분만 훑는다. 다만 예제처럼 전체 방문 배열을 초기화하면 그 O(V) 비용도 포함해야 한다. 인접 행렬에서 각 정점의 모든 칸을 확인하는 구현은 전체 탐색에 O(V²)가 들 수 있다. [그래프 표현과 탐색 비용](https://algs4.cs.princeton.edu/41graph/)

위 반복 구현은 방문 배열과 최대 V개의 Frame을 사용하므로 그래프 저장 공간을 제외한 추가 공간이 O(V)다. 재귀 버전도 깊이가 V까지 늘 수 있다. 길게 이어진 그래프에서는 실제 환경의 호출 Stack 한도 때문에 재귀가 실패할 수 있으며, 명시적 Stack은 이 호출 깊이 의존을 줄인다.

## 도달 여부와 구조 분석

DFS의 첫 방문 순서는 최단 거리를 보장하지 않는다. 간선 수가 가장 적은 경로가 필요하면 모든 간선 비용이 같은 조건에서 BFS가 알맞다. DFS는 한 갈래의 시작과 끝을 관찰하기 쉬워 다음과 같은 분석에 쓰인다.

- **사이클 검사:** 방향 그래프에서는 이미 방문한 정점인지뿐 아니라 현재 탐색 경로에 남아 있는지도 구분한다. 무방향 그래프에서는 부모로 되돌아가는 간선을 별도로 처리해야 한다.
- **의존성 순서:** 방향 사이클이 없는 그래프인 DAG에서는 DFS의 종료 순서를 뒤집어 [위상 정렬](/wiki/computer-science-topic-af71338cd6a3/)을 얻을 수 있다. 첫 방문 순서를 그대로 쓰는 것은 아니다.
- **경로 열거:** 모든 단순 경로를 구하려면 현재 경로에서 사용한 정점과 되돌아오기를 관리하는 Backtracking이 필요하다. 한 번 방문한 정점을 영구히 막는 위 코드는 모든 경로를 열거하지 않는다. 가능한 경로가 많아지면 비용도 O(V + E) 안에 머물지 않는다.

컴파일러의 의존성 분석이나 자원 대기 관계에서 순환을 찾는 과정에도 이런 구조 분석을 활용할 수 있다. 자원 대기 그래프의 순환을 실제 교착 상태로 판정할 수 있는지는 자원 모델까지 확인해야 한다. [방향 그래프의 사이클과 DFS 종료 순서](https://algs4.cs.princeton.edu/42digraph/)

트리에서는 방문한 정점의 처리 시점을 바꿔 전위·중위·후위 순회를 구성한다. 중위 순회는 왼쪽과 오른쪽이 구분되는 이진 트리를 기준으로 이해할 수 있다. [트리 순회](/wiki/computer-science-topic-17f8492e4ed6/)에서 이 차이를 이어서 볼 수 있다.
