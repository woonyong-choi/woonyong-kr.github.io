---
layout: default
title: 하이브리드 검색
nav_order: 7
permalink: /wiki/data-topic-780a7f203e5a/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/data-topic-780a7f203e5a
projection_sha256: 82f3c7c002ac23d34e57faf43fa4d3f6dbc0d766316c9b1478f1fdd31e574bfb
parent: 검색 엔진
content_status: ready
public_parent_id: Wiki/data-storage/search-engine
grand_parent: Database
ancestor: Data
---

# 하이브리드 검색
{: .no_toc }

## 에러 문자열과 다른 표현

“ERR_CONN_RESET이 프록시에서 나는 이유”라는 질문에는 예시 에러 문자열 `ERR_CONN_RESET`과 장애 상황을 설명하는 말이 함께 들어 있다. 이 문자열이 포함된 문서도 찾아야 하고, “연결 재설정”, “upstream 끊김”, “reverse proxy 장애”처럼 다른 표현을 쓴 문서도 살펴야 한다.

키워드 검색은 문서의 단어를 기준으로 후보를 찾으므로 에러 코드, 함수명, 제품명, 조항 번호를 찾는 데 유용하다. 벡터 검색은 질문과 문서를 임베딩한 벡터의 유사성을 이용하므로 표현이 다른 후보를 찾는 데 도움이 된다. 어느 쪽도 관련 문서를 반드시 찾는 것은 아니다. 특히 정확한 문자열을 보존해야 한다면 검색기의 토큰 분리 방식과 검색 필드도 확인해야 한다.

이 두 경로에서 후보를 모아 하나의 결과로 결합하는 구성이 하이브리드 검색(Hybrid Search)이다. 질문을 양쪽 검색에 보내고, 같은 문서 ID의 결과를 모은 뒤, 정한 결합 규칙으로 순서를 매겨 필요한 상위 문서를 반환한다.

다음은 그 흐름을 설명하기 위해 만든 문서와 순위다. 실제 검색엔진이 반환한 결과는 아니다.

| 문서 ID | 예시 문서의 내용 | 키워드 검색 순위 | 벡터 검색 순위 |
| --- | --- | ---: | ---: |
| D1 | ERR_CONN_RESET과 프록시 연결 재설정을 함께 다루는 문서 | 1 | 3 |
| D2 | ERR_CONN_RESET이 들어 있는 에러 코드 목록 | 2 | 없음 |
| D3 | 프록시 연결 종료를 점검하는 문서 | 3 | 2 |
| D4 | upstream 끊김과 reverse proxy 장애를 다루는 문서 | 없음 | 1 |

한쪽 결과에만 있는 D2와 D4도 결합 후보가 된다. 양쪽에 나온 D1과 D3은 각각 하나의 문서로 반환하되, 두 검색에서 받은 순위 정보를 함께 사용한다.

## 같은 문서의 순위 기여

단어 기반 검색 점수와 벡터 유사도는 서로 같은 척도라고 가정할 수 없다. 원점수를 선형 결합한다면 점수 분포를 확인해 정규화 필요 여부와 가중치를 정한다. [Elastic의 선형 결합 예제](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/retrievers/retrievers-examples#example-hybrid-search-with-linear-retriever)는 BM25 점수를 정규화해 다른 검색 결과와 결합한다.

점수의 크기 대신 순위를 합치는 방법도 있다. Reciprocal Rank Fusion(RRF)의 기본 형태는 각 검색에서 문서가 받은 순위로 다음 기여를 계산한다.

$$
\operatorname{RRF}(d)=\sum_{i:\,d\in L_i}\frac{1}{c+\operatorname{rank}_i(d)}
$$

`L_i`는 검색별 후보 목록이고 순위는 1부터 시작한다. 목록에 없는 문서는 그 검색에서 0을 기여한다. 같은 문서의 기여를 더한 뒤 내림차순으로 정렬한다. `c`는 순위 간 영향 차이를 조절하는 상수다. 아래 모형의 `constant=60`은 두 검색에 공통으로 쓰며, 키워드 검색만 더 중요하게 만드는 가중치가 아니다. [Elastic RRF 수식과 매개변수](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion)

예를 들어 D1은 `1/61 + 1/63`, D2는 `1/62`만 받는다. RRF는 원점수 스케일을 맞출 필요가 없지만, 한 검색에서 1위와 2위의 원점수 차이가 얼마나 컸는지도 사용하지 않는다. 결합 점수는 정답일 확률이 아니다.

## 후보창과 최종 반환 수

각 검색에서 결합에 넣을 후보 수와 마지막에 반환할 문서 수는 따로 정한다. 아래 모형의 `window`는 각 목록에서 읽을 상위 순위 범위이고, `top2`는 결합 후 반환할 두 문서다. 후보창을 줄이면 순위에 쓸 정보도 사라진다.

다음 Python 코드는 앞 표의 두 순위 목록을 결합한다. 검색이나 임베딩을 계산하지 않고, 후보 중복과 순위 합산만 확인하는 독립 모형이다. `Fraction`은 표준라이브러리의 유리수 계산 도구이며, 동점이면 문서 ID 순으로 정렬한다. 이 동점 규칙은 예제에서 정한 것으로 검색엔진 전체의 규칙을 뜻하지 않는다.

```run-python
from collections import defaultdict
from fractions import Fraction

keyword = ["D1", "D2", "D3"]
vector = ["D4", "D3", "D1"]

def rrf(rankings, window, constant=60):
    scores = defaultdict(Fraction)
    for ranking in rankings:
        if len(set(ranking)) != len(ranking):
            raise ValueError("Each input ranking needs unique document IDs")
        for rank, doc_id in enumerate(ranking[:window], start=1):
            scores[doc_id] += Fraction(1, constant + rank)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))

for window in (3, 1):
    fused = rrf([keyword, vector], window=window)
    top2 = [doc_id for doc_id, _ in fused[:2]]
    print(f"window={window} candidates={len(fused)} top2={top2}")
    for doc_id, score in fused:
        print(f"  {doc_id}: {float(score):.6f}")
    assert len(fused) == len(set(keyword[:window] + vector[:window]))
```

Python 3.9.6에서 실행한 결과다.

```text
window=3 candidates=4 top2=['D1', 'D3']
  D1: 0.032266
  D3: 0.032002
  D4: 0.016393
  D2: 0.016129
window=1 candidates=2 top2=['D1', 'D4']
  D1: 0.016393
  D4: 0.016393
```

`window=3`에서는 두 목록의 검색 결과 여섯 개가 네 개의 고유 후보로 합쳐지고, D1이 두 순위의 기여를 받아 맨 앞에 온다. `window=1`에서는 D1과 D4만 남아 각각 `1/61`을 받는다. D3은 원래 양쪽 목록에 있었지만 두 후보창 모두에서 빠져 결합할 수 없다. 이 출력은 미리 정한 순위에 대한 계산 결과이며, 하이브리드 검색의 정확도가 높아졌다는 측정은 아니다.

제품에 적용할 때는 후보창과 실제 검색기의 후보 수를 함께 확인한다. 예를 들어 Elastic의 `rank_window_size`는 결합 후보 범위, `size`는 최종 반환 수이며, kNN 검색의 `k`가 더 작으면 그보다 많은 후보를 만들지 못한다. 위 Python의 `window`는 원리를 보여 주는 값으로, Elasticsearch 요청의 매개변수 제약이나 분산 실행을 구현하지 않는다.

## 후보 누락과 순위 문제의 구분

같은 문서 집합과 질문으로 키워드 검색만, 벡터 검색만, 혼합 검색을 비교한다. 관련 문서가 각 후보 목록에 들어왔는지 먼저 보고, 들어온 문서가 최종 결과의 어느 순위에 놓였는지 확인한다. 두 문제를 나누어야 조정할 부분을 찾을 수 있다.

- 에러 문자열이나 고유명사를 놓쳤다면 키워드 보존, 검색 필드, 해당 경로의 후보 수를 먼저 확인한다. 키워드 검색의 비중을 높인 구성도 비교하되, 선택한 결합 방식이 검색별 가중치를 어떻게 지원하는지 확인한다.
- 다른 표현을 쓴 관련 문서가 없다면 벡터 검색의 후보와 질문 표현을 확인하고, 벡터 검색의 비중을 높인 구성도 비교한다. 사용자 질문을 검색어로 바꾸는 쿼리 변환을 적용하더라도 중요한 코드와 고유명사가 유지되는지 비교한다.
- 필요한 후보는 있지만 상위 순서가 맞지 않으면 결합 방식과 재순위화를 검토한다. 재랭킹 모델은 후보의 질문·본문 관련성을 다시 평가한다. 후보 목록에 없는 문서를 새로 찾아오는 단계는 아니다.

RRF 뒤에 모델 재랭킹을 붙일 수도 있다. [Elastic의 RRF 결과 재랭킹 예제](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/retrievers/retrievers-examples#example-rerank-results-of-an-rrf-retriever)는 이 두 단계를 별도로 구성한다. 재랭킹이 필요하다면, 결합 후 충분한 후보를 넘기고 재랭킹 뒤 최종 반환 수를 적용한다.

비교할 때는 질문별 관련 문서를 정해 두고 후보 포함 여부와 최종 순위를 기록한다. 정확한 문자열이 중요한 질문과 의미상 다른 표현이 중요한 질문을 나누어 보고, 추가 검색과 재랭킹의 지연도 같은 환경에서 측정한다. 다음 설정을 바꾸기 전에, 놓친 문서가 후보에 없었던 것인지 후보에는 있었지만 뒤로 밀린 것인지부터 확인한다.
