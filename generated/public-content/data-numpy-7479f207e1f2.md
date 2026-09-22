---
layout: default
title: NumPy
nav_order: 12
permalink: /wiki/data-numpy-7479f207e1f2/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/data-numpy-7479f207e1f2
projection_sha256: 31b2b83592819e7c7b465ed00a1846d6b9e13c441c9d0cf214d4ef47a22e5165
parent: 데이터 분석
content_status: ready
public_parent_id: Wiki/data/analytics
grand_parent: Data
---

# NumPy
{: .no_toc }

## 배열의 값보다 먼저 shape를 읽는다

NumPy의 `ndarray`는 여러 축을 가진 배열이다. shape `()`는 스칼라 배열, `(D,)`는 벡터, `(N,D)`는 배치 N개와 특징 D개를 담은 행렬이다. 이미지는 `(N,C,H,W)`처럼 배치·채널·높이·너비로 표현할 수 있다. 축의 의미는 프로그램이 정하므로 `axis=0`이 언제나 배치라는 규칙은 없다.

신경망의 선형층은 `(N,I) @ (I,O) + (O,) → (N,O)`로 읽는다. 행렬곱과 원소별 곱 `*`를 구분하고, 편향이 어느 축에 반복되는지 확인한다. 결과 shape가 맞아도 잘못된 축을 연산할 수 있다.

## reshape·집계·keepdims

`reshape`는 지정한 순회 순서를 기준으로 원소를 새 shape에 배치한다. 원소 수가 같아야 하고 `-1`은 남은 크기를 계산하는 자리이며 한 번만 사용할 수 있다. 기본 C 순서에서는 `arange(12).reshape(3,4)`가 행부터 네 원소씩 채운다. 메모리 배치가 맞으면 view이고 필요하면 copy가 될 수 있으므로 항상 무복사라고 가정하지 않는다.

Affine의 `x.reshape(x.shape[0], -1)`은 `(N,1,28,28)`을 `(N,784)`로 펼친다. backward에서 입력 gradient를 원래 shape로 돌리려면 원래 모양을 저장해야 한다. flatten은 픽셀 값을 없애지는 않지만 공간적 이웃 관계를 직접 사용하는 연산 구조도 제공하지 않는다.

| x의 shape `(2,3)` | 의미 | 출력 shape |
|---|---|---|
| `sum(x, axis=0)` | 두 행을 더해 각 열의 합을 구한다 | `(3,)` |
| `sum(x, axis=1)` | 각 행의 세 값을 더한다 | `(2,)` |
| `sum(x, axis=1, keepdims=True)` | 줄인 축을 길이 1로 남긴다 | `(2,1)` |
| `sum(x)` | 전체를 합한다 | `()` |

`[[1,2,3],[4,5,6]]`의 열별 합은 `[5,7,9]`, 행별 합은 `[6,15]`, 전체 합은 21이다. keepdims는 값이 아니라 남기는 축의 모양을 바꾼다.

## 브로드캐스팅은 오른쪽 축부터 비교한다

두 배열의 shape를 오른쪽부터 맞추고, 각 축의 크기가 같거나 한쪽이 1이면 연산할 수 있다. 없는 왼쪽 축은 크기 1로 취급한다. `(N,D)+(D,)`는 편향을 각 행에 더하고, `(N,D)-(N,1)`은 각 행의 통계 하나를 해당 행의 모든 열에서 뺀다. 입력을 반복 복제하지 않아도 연산할 수 있지만 연산 결과 배열의 메모리는 여전히 필요하다. [NumPy broadcasting](https://numpy.org/doc/stable/user/basics.broadcasting.html)

`(N,D)-(N,)`는 일반적인 행별 빼기가 아니다. N과 D가 다르고 둘 다 1이 아니면 오류가 나지만, N=D이면 오류 없이 열 방향으로 뺄셈이 이루어져 더 위험할 수 있다. `(N,1)`을 의도했는지 명시해야 한다. `keepdims=False`가 언제나 오류인 것이 아니라 우연히 맞는 크기로 잘못 계산될 수도 있다.

Softmax에서 각 행의 최댓값을 빼는 코드는 다음과 같은 shape로 이어진다.

```text
x (N,D)
max(x, axis=1, keepdims=True) (N,1)
shifted = x - max (N,D)
e = exp(shifted) (N,D)
p = e / sum(e, axis=1, keepdims=True) (N,D)
```

반면 MLP BatchNorm은 `(N,D)`에서 배치 방향 `axis=0`으로 feature별 평균·분산 `(D,)`를 구한다. 같은 배열에 softmax와 BatchNorm을 사용해도 줄이는 축과 통계의 뜻은 다르다.

## 선택하는 마스크와 곱하는 마스크

같은 shape의 boolean 마스크로 `x[mask]`를 읽으면 True 원소를 모은 1차원 배열을 얻는다. `x * mask`는 원래 위치를 유지하며 False 원소를 0으로 만든다. `x[mask] = 0`은 선택된 위치에 대입하므로 원래 배열을 바꾼다. 조회 결과가 copy인 advanced indexing과 원본에 대한 대입을 혼동하지 않는다.

ReLU는 `mask = x <= 0`을 저장하고 출력의 해당 위치를 0으로 만든다. 역전파에서도 같은 위치의 gradient를 막는다. 입력이나 상류 gradient를 공유하는 다른 계산이 있다면 `.copy()` 후 대입해 의도하지 않은 제자리 변경을 피한다.

편향의 순전파는 `(N,D)+(D,)`로 모든 샘플이 같은 b를 사용한다. 따라서 상류 gradient G가 `(N,D)`이면 `db = sum(G, axis=0)`으로 각 사용 경로의 기여를 더한다. 일반적으로 broadcast된 입력의 [역전파](/wiki/ai-machine-learning-topic-f7bb4c8cd38e/)는 확장된 축을 합산하고 원래 shape로 복원하는 과정이다. `keepdims`, 마스크, reshape는 이처럼 순전파뿐 아니라 gradient의 의미에도 연결된다.
